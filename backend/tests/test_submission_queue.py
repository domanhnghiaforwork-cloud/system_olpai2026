"""Regression tests for concurrent reservations, replay, privacy and worker recovery."""
import datetime
import json
import os
from pathlib import Path
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch
from uuid import uuid4

work = tempfile.TemporaryDirectory(prefix="submission-test-")
os.environ.update(DATABASE_PATH=str(Path(work.name) / "test.db"), SUBMISSION_UPLOAD_DIR=str(Path(work.name) / "uploads"),
                  SUBMISSION_MAX_FILE_BYTES="1024",
                  CHATBOT_ACCOUNT_SYNC_ENABLED="false", SEED_DEMO_DATA="false", JWT_SECRET_KEY="test-only-" + "x" * 48)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app.main import app
from app.database import engine, SessionLocal
from app.models import Problem, Submission, SubmissionJob, User
from app.auth_utils import create_access_token
from app.evaluators.base import EvaluationValidationResult, EvaluationScoreResult
from app.submission_jobs import claim_jobs, evaluate_job, finish_job


class TestEvaluator:
    def validate(self, filepath, submission_type, original_filename=""):
        valid = Path(filepath).read_bytes() != b"invalid"
        return EvaluationValidationResult(is_valid=valid, message="valid" if valid else "invalid", errors=[])

    def evaluate(self, filepath, submission_type):
        return EvaluationScoreResult(score=.75, metric="mAP", message="mAP = 0.75", details={"mean_ap": .75})


class SubmissionQueueTest(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        work.cleanup()

    def setUp(self):
        self.patch = patch("app.submission_jobs.get_evaluator", return_value=TestEvaluator())
        self.patch.start()
        self.addCleanup(self.patch.stop)
        with SessionLocal() as db:
            db.query(SubmissionJob).delete()
            db.query(Submission).delete()
            unique = uuid4().hex[:12]
            self.user = User(username=unique, email=f"{unique}@example.com", full_name="Test", role="user")
            self.other = User(username=unique + "b", email=f"{unique}b@example.com", full_name="Other", role="user")
            self.admin = User(username=unique + "a", email=f"{unique}a@example.com", full_name="Admin", role="admin")
            self.problem = Problem(code=unique, title="Queue test", evaluation_config="test", max_public_submissions=1,
                                   max_private_submissions=1, is_locked=False)
            db.add_all([self.user, self.other, self.admin, self.problem])
            db.commit()
            self.ids = [u.id for u in (self.user, self.other, self.admin)]
            self.problem_id = self.problem.id
        self.headers = [{"Authorization": "Bearer " + create_access_token({"sub": str(uid)})} for uid in self.ids]
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def upload(self, request_id=None, content=b"valid", split="public", headers=None):
        return self.client.post("/api/submissions", headers=headers or self.headers[0],
                                data={"problem_id": self.problem_id, "submission_type": split,
                                      "client_request_id": request_id or str(uuid4())},
                                files={"file": (f"{split}_submit.csv", content, "text/csv")})

    def finish(self):
        job = claim_jobs(1)[0]
        finish_job(job, evaluate_job(job))
        return job

    def test_parallel_limit_reservation_is_atomic(self):
        with ThreadPoolExecutor(max_workers=20) as pool:
            responses = list(pool.map(lambda _: self.upload(), range(20)))
        self.assertEqual(sum(r.status_code == 202 for r in responses), 1)
        self.assertEqual(sum(r.status_code == 400 for r in responses), 19)
        with SessionLocal() as db:
            self.assertEqual(db.query(Submission).count(), 1)

    def test_oversized_upload_does_not_reserve_attempt_or_keep_file(self):
        before = set(Path(work.name).joinpath("uploads").glob("*.csv"))
        self.assertEqual(self.upload(content=b"x" * 2048).status_code, 413)
        self.assertEqual(self.upload(content=b"x" * (2 * 1024**2)).status_code, 413)
        with SessionLocal() as db:
            self.assertEqual(db.query(Submission).count(), 0)
        self.assertEqual(set(Path(work.name).joinpath("uploads").glob("*.csv")), before)

    def test_chunked_oversized_body_is_rejected_before_parsing(self):
        response = self.client.post("/api/submissions", headers={**self.headers[0], "Content-Type": "multipart/form-data; boundary=a"},
                                    content=iter([b"x" * (2 * 1024**2)]))
        self.assertEqual(response.status_code, 413)

    def test_parallel_replay_creates_one_submission(self):
        request_id = str(uuid4())
        with ThreadPoolExecutor(max_workers=10) as pool:
            responses = list(pool.map(lambda _: self.upload(request_id), range(10)))
        self.assertTrue(all(r.status_code == 202 for r in responses))
        self.assertEqual(len({r.json()["submission_id"] for r in responses}), 1)
        self.finish()
        replay = self.upload(request_id)
        self.assertTrue(replay.json()["success"])
        with SessionLocal() as db:
            self.assertEqual(db.query(Submission).count(), 1)

    def test_request_id_cannot_be_reused_for_different_content(self):
        request_id = str(uuid4())
        self.assertEqual(self.upload(request_id).status_code, 202)
        self.assertEqual(self.upload(request_id, b"different").status_code, 409)

    def test_private_score_is_hidden_and_status_is_owned(self):
        accepted = self.upload(split="private").json()
        self.finish()
        url = f"/api/submissions/{accepted['submission_id']}/status"
        own = self.client.get(url, headers=self.headers[0]).json()
        self.assertIsNone(own["score"])
        self.assertIsNone(own["step2_scoring"]["score"])
        self.assertEqual(own["step2_scoring"]["details"], {})
        self.assertNotIn("0.75", str(own))
        self.assertEqual(self.client.get(url, headers=self.headers[1]).status_code, 404)
        admin = self.client.get(url, headers=self.headers[2]).json()
        self.assertEqual(admin["score"], .75)

    def test_invalid_submission_releases_reserved_attempt(self):
        self.assertEqual(self.upload(content=b"invalid").status_code, 202)
        self.finish()
        self.assertEqual(self.upload().status_code, 202)
        with SessionLocal() as db:
            failed = db.query(Submission).filter_by(status="LỖI ĐỊNH DẠNG").one()
            self.assertIsNone(failed.stored_path)
            self.assertIsNone(failed.score)

    def test_lost_worker_lease_is_recovered_and_stale_result_is_ignored(self):
        accepted = self.upload().json()
        old = claim_jobs(1)[0]
        with SessionLocal() as db:
            db.query(SubmissionJob).filter_by(id=old["job_id"]).update({"lease_until": datetime.datetime.utcnow() - datetime.timedelta(seconds=1)})
            db.commit()
        new = claim_jobs(1)[0]
        self.assertNotEqual(old["claim_token"], new["claim_token"])
        finish_job(old, evaluate_job(old))
        self.assertEqual(self.client.get(f"/api/submissions/{accepted['submission_id']}/status", headers=self.headers[0]).json()["job_status"], "PROCESSING")
        finish_job(new, evaluate_job(new))
        finish_job(new, evaluate_job(new))
        with SessionLocal() as db:
            self.assertEqual(db.query(Submission).count(), 1)
            self.assertEqual(db.query(SubmissionJob).one().attempts, 2)
            self.assertEqual(db.query(SubmissionJob).one().state, "DONE")

    def test_replay_still_works_after_problem_is_locked(self):
        request_id = str(uuid4())
        self.upload(request_id)
        with SessionLocal() as db:
            db.query(Problem).filter_by(id=self.problem_id).update({"is_locked": True})
            db.commit()
        self.assertEqual(self.upload(request_id).status_code, 202)
        self.assertEqual(self.upload().status_code, 403)

    def test_leaderboard_preserves_best_score_ties_counts_and_private_visibility(self):
        when = datetime.datetime(2026, 1, 1)
        with SessionLocal() as db:
            problem = db.get(Problem, self.problem_id)
            code = problem.code
            second = Problem(code=uuid4().hex[:12], title='Second problem')
            db.add(second)
            db.flush()
            first = Submission(user_id=self.ids[0], problem_id=problem.id, filename='public_submit.csv',
                               status='SUCCESS', submission_type='public', score=.8, created_at=when)
            db.add_all([first,
                Submission(user_id=self.ids[0], problem_id=problem.id, filename='public_submit.csv',
                           status='SUCCESS', submission_type='public', score=.8, created_at=when + datetime.timedelta(days=2)),
                Submission(user_id=self.ids[1], problem_id=problem.id, filename='public_submit.csv',
                           status='SUCCESS', submission_type='public', score=.8, created_at=when + datetime.timedelta(days=1)),
                Submission(user_id=self.ids[0], problem_id=second.id, filename='public_submit.csv',
                           status='SUCCESS', submission_type='public', score=.2, created_at=when),
                Submission(user_id=self.ids[0], problem_id=problem.id, filename='private_submit.csv',
                           status='SUCCESS', submission_type='private', score=.95, created_at=when),
                Submission(user_id=self.ids[0], problem_id=problem.id, filename='public_submit.csv',
                           status='LỖI CHẤM ĐIỂM', submission_type='public', score=.99, created_at=when),
            ])
            db.commit()
            earliest_id = first.id
        overall = self.client.get('/api/leaderboard/overall').json()
        self.assertEqual(overall[0]['user_id'], self.ids[0])
        self.assertEqual(overall[0]['total_score'], 1.0)
        best = next(p for p in overall[0]['components'] if p['problem_id'] == self.problem_id)
        self.assertEqual(best['submission_id'], earliest_id)
        public = self.client.get('/api/leaderboard', params={'problem_code': code}).json()
        self.assertEqual(public[0]['user_id'], self.ids[1])
        self.assertEqual(public[1]['total_submissions'], 2)
        self.assertEqual(public[1]['best_score'], .8)
        self.assertEqual(self.client.get('/api/leaderboard', params={'problem_code': code, 'type': 'private'},
                                        headers=self.headers[0]).status_code, 403)
        private = self.client.get('/api/leaderboard', params={'problem_code': code, 'type': 'private'}, headers=self.headers[2]).json()
        self.assertEqual(private[0]['best_score'], .95)

    def test_nlp_configuration_worker_matches_original_and_hides_private_metrics(self):
        from app.evaluators import get_evaluator
        from app.evaluators.nlp_tung.scorer import score_submission
        gt = {'pub_00001': 'Xin chào bạn, hôm nay bạn khỏe không?',
              'prv_00001': 'Ngày mai chúng ta cùng đi học nhé!'}
        labels = Path(work.name) / (uuid4().hex + '.csv')
        labels.write_text('id,van_ban_chuan\npub_00001,"Xin chào bạn, hôm nay bạn khỏe không?"\n'
                          'prv_00001,Ngày mai chúng ta cùng đi học nhé!\n', encoding='utf-8')
        content = ('id,van_ban_chuan\npub_00001,"Xin chào bạn, hôm nay bạn khỏe không?"\n'
                   'prv_00001,ngay mai chung ta cung di hoc nhe\n').encode('utf-8')
        with SessionLocal() as db:
            db.get(Problem, self.problem_id).evaluation_config = 'eval_2_nlp_tung'
            db.commit()
        with patch('app.submission_jobs.get_evaluator', side_effect=get_evaluator), patch.dict(
            os.environ, {'EVAL_2_NLP_TUNG_GROUND_TRUTH': str(labels)}
        ):
            configs = self.client.get('/api/problems/evaluators').json()
            self.assertIn('eval_2_nlp_tung', [config['id'] for config in configs])
            for phase in ('public', 'private'):
                with self.subTest(phase=phase):
                    accepted = self.upload(content=content, split=phase).json()
                    self.assertEqual(accepted['job_status'], 'QUEUED')
                    self.finish()
                    url = f"/api/submissions/{accepted['submission_id']}/status"
                    admin = self.client.get(url, headers=self.headers[2]).json()
                    expected = score_submission(content, gt, phase)
                    self.assertTrue(admin['success'])
                    self.assertEqual(admin['step2_scoring']['details'], expected)
                    self.assertEqual(admin['score'], expected['sacrebleu'])
                    owner = self.client.get(url, headers=self.headers[0]).json()
                    if phase == 'private':
                        self.assertIsNone(owner['score'])
                        self.assertEqual(owner['step2_scoring']['details'], {})
                        self.assertNotIn('CER', owner['step1_validation']['message'])
                    else:
                        self.assertEqual(owner['score'], 100)

    def test_nlp_best_submission_and_board_use_cer_exact_match_then_earliest_time(self):
        from app.routers.admin import get_valid_submissions
        from app.routers.leaderboard import best_submission_rows
        from app.evaluators.nlp_tung.scorer import rank_key
        when = datetime.datetime(2026, 1, 1)
        with SessionLocal() as db:
            problem = db.get(Problem, self.problem_id)
            problem.evaluation_config = 'eval_2_nlp_tung'
            code = problem.code
            submissions = []
            # Equal BLEU: choose lower CER, then higher EM, then earlier time.
            cases = [(self.ids[0], .3, .9, 0), (self.ids[0], .1, .3, 1),
                     (self.ids[0], .1, .5, 2), (self.ids[0], .1, .5, 3),
                     (self.ids[1], .2, .8, 0), (self.ids[2], .1, .4, 0)]
            for uid, cer, exact, offset in cases:
                sub = Submission(user_id=uid, problem_id=self.problem_id, filename='submission.csv',
                                 status='HỢP LỆ', submission_type='public', score=60,
                                 created_at=when + datetime.timedelta(hours=offset))
                db.add(sub)
                db.flush()
                details = {'sacrebleu': 60, 'cer': cer, 'exact_match': exact}
                db.add(SubmissionJob(submission=sub, user_id=uid, client_request_id=str(uuid4()),
                                     payload_sha256='x' * 64, original_filename='submission.csv',
                                     evaluation_config='eval_2_nlp_tung', state='DONE',
                                     result_json=json.dumps({'step2_scoring': {'details': details}})))
                submissions.append((sub.id, uid, details, sub.created_at))
            db.commit()
            original_order = sorted(submissions, key=lambda sub: (*rank_key(sub[2]), sub[3], sub[0]))
            expected = {}
            for sid, uid, _, _ in original_order:
                expected.setdefault(uid, sid)
            rows = best_submission_rows(db, [self.problem_id], 'public')
            self.assertEqual({r['user_id']: r['submission_id'] for r in rows}, expected)
            exports = get_valid_submissions(db, problem_id=self.problem_id, submission_type='public', mode='best_per_user')
            self.assertEqual([sub.id for sub in exports], list(expected.values()))
        board = self.client.get('/api/leaderboard', params={'problem_code': code}).json()
        self.assertEqual([row['user_id'] for row in board], list(expected))
        self.assertEqual(board[0]['total_submissions'], 4)
        overall = self.client.get('/api/leaderboard/overall').json()
        for row in overall:
            component = next(c for c in row['components'] if c['problem_id'] == self.problem_id)
            self.assertEqual(component['submission_id'], expected[row['user_id']])


if __name__ == "__main__":
    unittest.main()
