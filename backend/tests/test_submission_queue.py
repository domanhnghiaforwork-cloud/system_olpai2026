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
from app.models import Problem, Submission, SubmissionJob, TrainingNotebook, User
from app.auth_utils import create_access_token
from app.evaluators.base import EvaluationValidationResult, EvaluationScoreResult
from app.submission_jobs import claim_jobs, evaluate_job, finish_job
from app.routers import problems, training_notebooks
from app import pdf_utils


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
        self.notebook_directory = Path(work.name) / 'notebooks'
        notebook_patch = patch.object(training_notebooks, 'NOTEBOOK_DIR', self.notebook_directory)
        notebook_patch.start()
        self.addCleanup(notebook_patch.stop)
        self.pdf_directory = Path(work.name) / 'problem_pdfs'
        self.pdf_directory.mkdir(exist_ok=True)
        for module in (problems, pdf_utils):
            pdf_patch = patch.object(module, 'PDF_DIR', str(self.pdf_directory))
            pdf_patch.start()
            self.addCleanup(pdf_patch.stop)
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

    def test_private_score_is_visible_to_owner_and_admin_only(self):
        request_id = str(uuid4())
        accepted = self.upload(request_id, split="private").json()
        self.assertIsNone(accepted['score'])
        self.finish()
        url = f"/api/submissions/{accepted['submission_id']}/status"
        own = self.client.get(url, headers=self.headers[0]).json()
        self.assertEqual(own["score"], .75)
        self.assertEqual(own["step2_scoring"]["score"], .75)
        self.assertEqual(own["step2_scoring"]["details"], {'mean_ap': .75})
        self.assertIn('0.75', own['result_line'])
        self.assertEqual(self.client.get(url, headers=self.headers[1]).status_code, 404)
        self.assertEqual(self.client.get(url).status_code, 401)
        admin = self.client.get(url, headers=self.headers[2]).json()
        self.assertEqual(admin["score"], .75)
        request_url = f'/api/submissions/by-request/{request_id}'
        recovered = self.client.get(request_url, headers=self.headers[0]).json()
        self.assertEqual(recovered['step2_scoring'], own['step2_scoring'])
        self.assertEqual(self.client.get(request_url, headers=self.headers[1]).status_code, 404)
        replayed = self.upload(request_id, split='private').json()
        self.assertEqual(replayed['score'], .75)
        self.assertEqual(replayed['submission_id'], accepted['submission_id'])
        history = self.client.get('/api/submissions', headers=self.headers[0]).json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['score'], .75)
        self.assertIn('0.75', history[0]['logs'])
        self.assertIsNone(history[0]['stored_path'])
        other_history = self.client.get('/api/submissions', params={'user_id': self.ids[0]}, headers=self.headers[1]).json()
        self.assertEqual(other_history, [])
        download_url = f"/api/submissions/{accepted['submission_id']}/download"
        self.assertEqual(self.client.get(download_url, headers=self.headers[0]).status_code, 200)
        self.assertEqual(self.client.get(download_url, headers=self.headers[1]).status_code, 403)

    def test_private_scores_are_excluded_from_public_boards(self):
        self.upload(split='private')
        self.finish()
        with SessionLocal() as db:
            code = db.get(Problem, self.problem_id).code
            db.add(Submission(user_id=self.ids[1], problem_id=self.problem_id,
                              filename='private_submit.csv', submission_type='private',
                              status='SUCCESS', score=.99))
            db.commit()
        public = self.client.get('/api/leaderboard', params={'problem_code': code}, headers=self.headers[0]).json()
        self.assertEqual(public, [])
        self.assertEqual(self.client.get('/api/leaderboard/overall', headers=self.headers[0]).json(), [])
        for headers in (None, self.headers[0], self.headers[1]):
            for split in ('private', ' PRIVATE '):
                self.assertEqual(self.client.get('/api/leaderboard', params={'problem_code': code, 'type': split},
                                                headers=headers).status_code, 403)
        admin = self.client.get('/api/leaderboard', params={'problem_code': code, 'type': 'private'}, headers=self.headers[2]).json()
        self.assertEqual([item['best_score'] for item in admin], [.99, .75])
        owner_history = self.client.get('/api/submissions', headers=self.headers[0]).json()
        self.assertEqual([item['score'] for item in owner_history], [.75])

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

    def test_nlp_configuration_worker_matches_original_and_owner_sees_private_metrics(self):
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
                    self.assertEqual(owner['score'], expected['sacrebleu'])
                    self.assertEqual(owner['step2_scoring']['details'], expected)
                    self.assertEqual(self.client.get(url, headers=self.headers[1]).status_code, 404)

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

    def notebook_bytes(self):
        # Keeping this code in the stored notebook must never execute it.
        return json.dumps({'nbformat': 4, 'nbformat_minor': 5, 'metadata': {}, 'cells': [
            {'cell_type': 'code', 'id': 'train-cell', 'metadata': {}, 'execution_count': None,
             'outputs': [], 'source': 'raise RuntimeError("Never execute uploaded code")'}
        ]}).encode('utf-8')

    def notebook_upload(self, split='public', content=None, filename='training.ipynb', headers=None, problem_id=None):
        return self.client.post('/api/training-notebooks', headers=headers or self.headers[0],
                                data={'problem_id': problem_id or self.problem_id, 'submission_type': split},
                                files={'file': (filename, self.notebook_bytes() if content is None else content, 'application/octet-stream')})

    def test_notebooks_allow_one_per_split_and_authorized_downloads(self):
        for split in ('public', 'private'):
            response = self.notebook_upload(split)
            self.assertEqual(response.status_code, 201, response.text)
            notebook = response.json()
            self.assertNotIn('stored_path', notebook)
            self.assertEqual(notebook['submission_type'], split)
            url = notebook['download_url']
            self.assertEqual(self.client.get(url, headers=self.headers[0]).content, self.notebook_bytes())
            self.assertEqual(self.client.get(url, headers=self.headers[1]).status_code, 404)
            self.assertEqual(self.client.get(url, headers=self.headers[2]).status_code, 200)
            self.assertEqual(self.notebook_upload(split).status_code, 409)
        params = {'problem_id': self.problem_id}
        owner = self.client.get('/api/training-notebooks', params=params, headers=self.headers[0]).json()
        self.assertEqual(len(owner), 2)
        other = self.client.get('/api/training-notebooks', params={**params, 'user_id': self.ids[0]}, headers=self.headers[1]).json()
        self.assertEqual(other, [])
        self.assertEqual(len(self.client.get('/api/training-notebooks', params=params, headers=self.headers[2]).json()), 2)
        with SessionLocal() as db:
            self.assertEqual(db.query(Submission).count(), 0)

    def test_notebook_slots_are_independent_of_csv_quota_students_and_problems(self):
        self.upload()
        self.finish()
        self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(self.notebook_upload().status_code, 201)
        self.assertEqual(self.notebook_upload(headers=self.headers[1]).status_code, 201)
        with SessionLocal() as db:
            second = Problem(code=uuid4().hex[:12], title='Second', evaluation_config='test')
            db.add(second)
            db.commit()
            second_id = second.id
        self.assertEqual(self.notebook_upload(problem_id=second_id).status_code, 201)

    def test_notebooks_reject_bad_format_without_consuming_slot(self):
        cases = [b'', b'not json', b'\xff', b'[]', b'{}',
                 b'{"nbformat":4,"nbformat_minor":5,"metadata":{},"cells":[{"cell_type":"bad"}]}']
        for content in cases:
            with self.subTest(content=content[:32]):
                self.assertEqual(self.notebook_upload(content=content).status_code, 422)
        self.assertEqual(self.notebook_upload(filename='training.csv').status_code, 422)
        self.assertEqual(self.notebook_upload(split='all').status_code, 422)
        self.assertEqual(self.notebook_upload(content=b'\xef\xbb\xbf' + self.notebook_bytes(), filename='train.IPYNB').status_code, 201)

    def test_notebooks_respect_phase_locks_and_student_only_uploads(self):
        self.assertEqual(self.notebook_upload(headers=self.headers[2]).status_code, 403)
        self.assertEqual(self.client.get('/api/training-notebooks', params={'problem_id': self.problem_id}).status_code, 401)
        with SessionLocal() as db:
            db.get(Problem, self.problem_id).private_is_locked = True
            db.commit()
        self.assertEqual(self.notebook_upload('private').status_code, 403)
        self.assertEqual(self.notebook_upload('public').status_code, 201)
        with SessionLocal() as db:
            problem = db.get(Problem, self.problem_id)
            problem.private_is_locked = False
            problem.unlock_at = datetime.datetime.utcnow() + datetime.timedelta(days=1)
            db.commit()
        self.assertEqual(self.notebook_upload('private').status_code, 403)
        with SessionLocal() as db:
            problem = db.get(Problem, self.problem_id)
            problem.unlock_at = None
            problem.is_locked = True
            db.commit()
        self.assertEqual(self.notebook_upload('private').status_code, 403)
        with SessionLocal() as db:
            problem = db.get(Problem, self.problem_id)
            problem.is_locked = False
            problem.evaluation_config = None
            db.commit()
        self.assertEqual(self.notebook_upload('private').status_code, 400)

    def test_parallel_notebook_uploads_store_exactly_one_file(self):
        before = set(self.notebook_directory.glob('*.ipynb'))
        with ThreadPoolExecutor(max_workers=10) as pool:
            responses = list(pool.map(lambda _: self.notebook_upload(), range(10)))
        self.assertEqual(sum(response.status_code == 201 for response in responses), 1)
        self.assertEqual(sum(response.status_code == 409 for response in responses), 9)
        after = set(self.notebook_directory.glob('*.ipynb'))
        self.assertEqual(len(after - before), 1)
        with SessionLocal() as db:
            self.assertEqual(db.query(TrainingNotebook).filter_by(problem_id=self.problem_id).count(), 1)

    def test_oversized_notebook_file_and_chunked_body_do_not_consume_slot(self):
        before = set(self.notebook_directory.glob('*.ipynb'))
        self.assertEqual(self.notebook_upload(content=b'x' * (20 * 1024**2 + 1)).status_code, 413)
        chunked = self.client.post('/api/training-notebooks', headers={**self.headers[0], 'Content-Type': 'multipart/form-data; boundary=a'},
                                   content=iter([b'x' * (1024**2)] * 22))
        self.assertEqual(chunked.status_code, 413)
        self.assertEqual(set(self.notebook_directory.glob('*.ipynb')), before)
        self.assertEqual(self.notebook_upload().status_code, 201)

    def test_failed_notebook_commit_cleans_up_file_and_keeps_slot_free(self):
        before = set(self.notebook_directory.glob('*.ipynb'))
        with patch('sqlalchemy.orm.Session.commit', side_effect=RuntimeError('Database unavailable')):
            with self.assertRaises(RuntimeError):
                self.notebook_upload()
        self.assertEqual(set(self.notebook_directory.glob('*.ipynb')), before)
        self.assertEqual(self.notebook_upload().status_code, 201)

    def test_problem_without_upload_has_no_pdf_and_does_not_reuse_orphan(self):
        code = 'NLP-' + uuid4().hex[:12]
        orphan = self.pdf_directory / f'de_thi_{code.lower()}_nlp.pdf'
        orphan.write_bytes(b'%PDF-1.4 old generated sample')
        before = set(self.pdf_directory.iterdir())
        response = self.client.post('/api/problems', headers=self.headers[2],
                                    data={'code': code, 'title': 'No PDF uploaded', 'category': 'NLP'})
        self.assertEqual(response.status_code, 200, response.text)
        problem_id = response.json()['id']
        details = self.client.get(f'/api/problems/{problem_id}')
        listing = self.client.get('/api/problems?category=NLP')
        listed = next(p for p in listing.json() if p['id'] == problem_id)
        for data in (response.json(), details.json(), listed):
            self.assertIsNone(data['pdf_filename'])
            self.assertIsNone(data['pdf_url'])
        self.assertEqual(self.client.get(f'/api/problems/{problem_id}/pdf').status_code, 404)
        self.assertEqual(set(self.pdf_directory.iterdir()), before)
        self.assertEqual(orphan.read_bytes(), b'%PDF-1.4 old generated sample')
        with SessionLocal() as db:
            self.assertIsNone(db.get(Problem, problem_id).pdf_filename)

    def test_missing_attached_pdf_is_not_regenerated(self):
        with SessionLocal() as db:
            db.get(Problem, self.problem_id).pdf_filename = 'missing.pdf'
            db.commit()
        before = set(self.pdf_directory.iterdir())
        details = self.client.get(f'/api/problems/{self.problem_id}').json()
        self.assertIsNone(details['pdf_url'])
        self.assertIsNone(details['pdf_filename'])
        self.assertEqual(self.client.get(f'/api/problems/{self.problem_id}/pdf').status_code, 404)
        self.assertEqual(set(self.pdf_directory.iterdir()), before)
        with SessionLocal() as db:
            self.assertEqual(db.get(Problem, self.problem_id).pdf_filename, 'missing.pdf')

    def test_uploaded_problem_pdf_is_served_on_creation_and_replacement(self):
        code = 'NLP-' + uuid4().hex[:12]
        content = b'%PDF-1.4 uploaded contest statement'
        response = self.client.post('/api/problems', headers=self.headers[2],
                                    data={'code': code, 'title': 'Uploaded PDF', 'category': 'NLP'},
                                    files={'file': ('statement.pdf', content, 'application/pdf')})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertTrue(data['pdf_filename'])
        self.assertEqual(self.client.get(data['pdf_url']).content, content)
        replacement = b'%PDF-1.4 updated contest statement'
        response = self.client.post(f"/api/problems/{data['id']}/upload-pdf", headers=self.headers[2],
                                    files={'file': ('updated.pdf', replacement, 'application/pdf')})
        self.assertEqual(response.status_code, 200, response.text)
        downloaded = self.client.get(response.json()['pdf_url'])
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.headers['content-type'], 'application/pdf')
        self.assertEqual(downloaded.content, replacement)

    def test_public_private_schedules_apply_identically_to_csv_and_notebooks(self):
        endpoint = f'/api/problems/{self.problem_id}'
        future = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).isoformat()
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)).isoformat()
        for split in ('public', 'private'):
            with self.subTest(split=split):
                response = self.client.put(endpoint, headers=self.headers[2], json={
                    f'{split}_is_locked': True, f'{split}_unlock_at': future,
                })
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(response.json()[f'{split}_is_locked'])
                self.assertEqual(self.upload(split=split).status_code, 403)
                self.assertEqual(self.notebook_upload(split).status_code, 403)
                self.client.put(endpoint, headers=self.headers[2], json={f'{split}_unlock_at': None})
                self.assertEqual(self.upload(split=split).status_code, 403)
                self.assertEqual(self.notebook_upload(split).status_code, 403)
                self.client.put(endpoint, headers=self.headers[2], json={f'{split}_unlock_at': past})
                self.assertEqual(self.upload(split=split).status_code, 202)
                self.assertEqual(self.notebook_upload(split).status_code, 201)

    def test_public_schedule_round_trips_vietnam_time_and_student_cannot_change_it(self):
        endpoint = f'/api/problems/{self.problem_id}'
        payload = {'public_is_locked': True, 'public_unlock_at': '2026-10-07T15:30:00+07:00'}
        self.assertEqual(self.client.put(endpoint, headers=self.headers[0], json=payload).status_code, 403)
        response = self.client.put(endpoint, headers=self.headers[2], json=payload)
        self.assertEqual(response.status_code, 200)
        stored = datetime.datetime.fromisoformat(response.json()['public_unlock_at'].replace('Z', '+00:00'))
        self.assertEqual(stored, datetime.datetime(2026, 10, 7, 8, 30, tzinfo=datetime.timezone.utc))
        self.assertEqual(self.client.get(endpoint).json()['public_unlock_at'], response.json()['public_unlock_at'])
        self.assertEqual(self.client.put(endpoint, headers=self.headers[2], json={'public_unlock_at': 'bad'}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
