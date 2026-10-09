"""Regression tests for concurrent reservations, replay, privacy and worker recovery."""
import datetime
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import socket
import subprocess
import threading
import time
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
import httpx
from app.main import app
from app.database import engine, SessionLocal
from app.models import Problem, Submission, SubmissionJob, TrainingNotebook, User, ChatbotProvisionJob, UploadCleanupJob
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
            db.query(UploadCleanupJob).delete()
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

    def test_delete_account_removes_uploads_jobs_and_updates_both_leaderboards(self):
        from app.leaderboard_events import read_leaderboard_revision

        self.assertEqual(self.upload().status_code, 202)
        claimed = claim_jobs(1)[0]
        self.assertEqual(self.upload(split='private').status_code, 202)
        self.assertEqual(self.notebook_upload().status_code, 201)
        self.assertEqual(self.notebook_upload('private').status_code, 201)
        self.assertEqual(self.upload(headers=self.headers[1]).status_code, 202)
        self.assertEqual(self.notebook_upload(headers=self.headers[1]).status_code, 201)
        with SessionLocal() as db:
            owner_paths = [Path(row.stored_path) for model in (Submission, TrainingNotebook)
                           for row in db.query(model).filter_by(user_id=self.ids[0]).all()]
            other_paths = [Path(row.stored_path) for model in (Submission, TrainingNotebook)
                           for row in db.query(model).filter_by(user_id=self.ids[1]).all()]
            db.add(ChatbotProvisionJob(user_id=self.ids[0], email='cleanup@example.com',
                                      role='user', password_hash='test-placeholder'))
            db.commit()
        versions = {split: read_leaderboard_revision(split) for split in ('public', 'private')}
        response = self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(all(not path.exists() for path in owner_paths))
        self.assertTrue(all(path.is_file() for path in other_paths))
        with SessionLocal() as db:
            self.assertIsNone(db.get(User, self.ids[0]))
            for model in (Submission, SubmissionJob, TrainingNotebook, ChatbotProvisionJob):
                self.assertEqual(db.query(model).filter_by(user_id=self.ids[0]).count(), 0)
            self.assertEqual(db.query(UploadCleanupJob).count(), 0)
            self.assertEqual(db.query(SubmissionJob).filter_by(user_id=self.ids[1]).count(), 1)
        for split, version in versions.items():
            self.assertEqual(read_leaderboard_revision(split), version + 1)
        # A worker already holding the deleted job cannot recreate its result.
        finish_job(claimed, {'success': True, 'score': .99, 'final_status': 'SUCCESS'})
        with SessionLocal() as db:
            self.assertEqual(db.query(Submission).filter_by(user_id=self.ids[0]).count(), 0)

    def test_delete_account_keeps_files_when_database_commit_fails(self):
        from sqlalchemy.orm import Session

        self.upload()
        with SessionLocal() as db:
            path = Path(db.query(Submission).filter_by(user_id=self.ids[0]).one().stored_path)
        with patch.object(Session, 'commit', side_effect=RuntimeError('commit failed')):
            with self.assertRaisesRegex(RuntimeError, 'commit failed'):
                self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2])
        self.assertTrue(path.is_file())
        with SessionLocal() as db:
            self.assertIsNotNone(db.get(User, self.ids[0]))
            self.assertEqual(db.query(Submission).filter_by(user_id=self.ids[0]).count(), 1)
            self.assertEqual(db.query(UploadCleanupJob).count(), 0)

    def test_delete_account_retries_file_locked_until_after_database_commit(self):
        from app.upload_cleanup import cleanup_pending_uploads

        self.upload()
        with SessionLocal() as db:
            path = Path(db.query(Submission).filter_by(user_id=self.ids[0]).one().stored_path)
        with patch.object(Path, 'unlink', side_effect=PermissionError('file locked')):
            response = self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(path.exists())
        with SessionLocal() as db:
            self.assertIsNone(db.get(User, self.ids[0]))
            job = db.query(UploadCleanupJob).one()
            job.next_attempt_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
            db.commit()
        cleanup_pending_uploads()
        self.assertFalse(path.exists())
        with SessionLocal() as db:
            self.assertEqual(db.query(UploadCleanupJob).count(), 0)

    def test_background_cleanup_runs_without_chatbot_sync(self):
        from app import upload_cleanup

        self.upload()
        with SessionLocal() as db:
            path = Path(db.query(Submission).filter_by(user_id=self.ids[0]).one().stored_path)
        # Simulate stopping after the deletion transaction, before its immediate cleanup.
        with patch('app.routers.admin.cleanup_pending_uploads'):
            self.assertEqual(self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2]).status_code, 200)
        self.assertTrue(path.exists())
        completed = threading.Event()
        cleanup = upload_cleanup.cleanup_pending_uploads

        def notify_cleanup():
            cleanup()
            completed.set()

        with patch.object(upload_cleanup, 'cleanup_pending_uploads', side_effect=notify_cleanup):
            with TestClient(app):
                self.assertTrue(completed.wait(5), 'Background cleanup did not run')
                self.assertFalse(path.exists())
        with SessionLocal() as db:
            self.assertEqual(db.query(UploadCleanupJob).count(), 0)

    def test_delete_account_handles_missing_files_and_rejects_external_paths(self):
        self.upload()
        outside = Path(work.name) / 'unrelated.csv'
        outside.write_bytes(b'keep')
        with SessionLocal() as db:
            sub = db.query(Submission).filter_by(user_id=self.ids[0]).one()
            path = Path(sub.stored_path)
            sub.stored_path = str(outside)
            db.commit()
        response = self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(outside.read_bytes(), b'keep')
        with SessionLocal() as db:
            self.assertIsNotNone(db.get(User, self.ids[0]))
            db.query(Submission).filter_by(user_id=self.ids[0]).one().stored_path = str(path)
            db.commit()
        path.unlink()
        self.assertEqual(self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2]).status_code, 200)
        self.assertTrue(outside.exists())

    def test_delete_account_preserves_a_file_referenced_by_another_account(self):
        self.upload()
        with SessionLocal() as db:
            original = db.query(Submission).filter_by(user_id=self.ids[0]).one()
            path = Path(original.stored_path)
            db.add(Submission(user_id=self.ids[1], problem_id=self.problem_id,
                              filename='shared.csv', stored_path=str(path)))
            db.commit()
        self.assertEqual(self.client.delete(f'/api/admin/users/{self.ids[0]}', headers=self.headers[2]).status_code, 200)
        self.assertTrue(path.is_file())
        self.assertEqual(self.client.delete(f'/api/admin/users/{self.ids[1]}', headers=self.headers[2]).status_code, 200)
        self.assertFalse(path.exists())

    def test_delete_account_requires_admin_and_protects_default_admin(self):
        endpoint = f'/api/admin/users/{self.ids[0]}'
        self.assertEqual(self.client.delete(endpoint).status_code, 401)
        self.assertEqual(self.client.delete(endpoint, headers=self.headers[1]).status_code, 403)
        self.assertEqual(self.client.delete('/api/admin/users/99999999', headers=self.headers[2]).status_code, 404)
        with SessionLocal() as db:
            admin = db.query(User).filter_by(username='admin').one()
            default_id = admin.id
        self.assertEqual(self.client.delete(f'/api/admin/users/{default_id}', headers=self.headers[2]).status_code, 400)

    def test_sqlite_connections_enforce_foreign_keys(self):
        with engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql('PRAGMA foreign_keys').scalar(), 1)

    def test_admin_submission_views_include_native_metric_context(self):
        with SessionLocal() as db:
            cv = db.get(Problem, self.problem_id)
            cv.metric = 'mAP'
            cv.evaluation_config = 'eval_1_cv_hico'
            nlp = Problem(code=uuid4().hex[:12], title='Low BLEU', metric='BLEU',
                          evaluation_config='eval_2_nlp_tung')
            db.add(nlp)
            db.flush()
            db.add_all([
                Submission(user_id=self.ids[0], problem_id=cv.id, filename='cv.csv', score=.75),
                Submission(user_id=self.ids[0], problem_id=nlp.id, filename='nlp.csv', score=.42),
                Submission(user_id=self.ids[1], problem_id=cv.id, filename='pending.csv', score=None),
            ])
            db.commit()
        overview = self.client.get('/api/admin/overview', headers=self.headers[2])
        repository = self.client.get('/api/admin/submissions/valid', headers=self.headers[2])
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(repository.status_code, 200)
        for rows in (overview.json()['recent_submissions'], repository.json()):
            scored = {row['evaluation_config']: row for row in rows if row['score'] is not None}
            self.assertEqual(scored['eval_1_cv_hico']['metric'], 'mAP')
            self.assertEqual(scored['eval_1_cv_hico']['score'], .75)
            self.assertEqual(scored['eval_2_nlp_tung']['metric'], 'BLEU')
            self.assertEqual(scored['eval_2_nlp_tung']['score'], .42)
        pending = next(row for row in overview.json()['recent_submissions'] if row['score'] is None)
        self.assertEqual(pending['evaluation_config'], 'eval_1_cv_hico')

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

    def test_leaderboard_revision_tracks_committed_successful_scores_only(self):
        from app.leaderboard_events import read_leaderboard_revision
        public = read_leaderboard_revision('public')
        private = read_leaderboard_revision('private')
        self.assertEqual(self.upload(content=b'invalid').status_code, 202)
        self.finish()
        self.assertEqual(read_leaderboard_revision('public'), public)
        self.assertEqual(self.upload().status_code, 202)
        self.assertEqual(read_leaderboard_revision('public'), public)
        job = self.finish()
        self.assertEqual(read_leaderboard_revision('public'), public + 1)
        finish_job(job, evaluate_job(job))  # A replay must not notify twice.
        self.assertEqual(read_leaderboard_revision('public'), public + 1)
        self.assertEqual(read_leaderboard_revision('private'), private)
        self.assertEqual(self.upload(split='private').status_code, 202)
        self.finish()
        self.assertEqual(read_leaderboard_revision('private'), private + 1)

    def test_leaderboard_stream_detects_other_sessions_and_keeps_splits_separate(self):
        from app import leaderboard_events

        class Request:
            disconnected = False

            async def is_disconnected(self):
                return self.disconnected

        async def check():
            request = Request()
            stream = leaderboard_events.leaderboard_event_stream(request, 'public')
            first = await anext(stream)
            self.assertIn('event: ready', first)
            with SessionLocal() as db:
                leaderboard_events.bump_leaderboard_revision(db, 'public')
                db.commit()
            changed = await anext(stream)
            self.assertIn('event: leaderboard-change', changed)
            self.assertNotIn('score', changed)
            self.assertNotIn('user_id', changed)
            with SessionLocal() as db:
                leaderboard_events.bump_leaderboard_revision(db, 'private')
                db.commit()
            self.assertEqual(await anext(stream), ': heartbeat\n\n')
            request.disconnected = True
            with self.assertRaises(StopAsyncIteration):
                await anext(stream)

        with patch.object(leaderboard_events, 'POLL_SECONDS', 0), patch.object(leaderboard_events, 'HEARTBEAT_SECONDS', 0):
            asyncio.run(check())

    def test_leaderboard_stream_permissions_and_proxy_headers(self):
        async def finite_stream(request, split):
            yield 'event: ready\ndata: {"version": 0}\n\n'

        with patch('app.routers.leaderboard.leaderboard_event_stream', finite_stream):
            response = self.client.get('/api/leaderboard/events')
            self.assertEqual(response.status_code, 200)
            self.assertIn('text/event-stream', response.headers['content-type'])
            self.assertEqual(response.headers['x-accel-buffering'], 'no')
            self.assertIn('no-cache', response.headers['cache-control'])
            for headers in ({}, self.headers[0]):
                self.assertEqual(self.client.get('/api/leaderboard/events?type=private', headers=headers).status_code, 403)
            self.assertEqual(self.client.get('/api/leaderboard/events?type=private', headers=self.headers[2]).status_code, 200)
            self.assertEqual(self.client.get('/api/leaderboard/events?type=bad').status_code, 422)

    def test_http_stream_notifies_after_worker_commits_in_another_process(self):
        # A separate API process must see finish_job's notification via SQLite.
        with SessionLocal() as db:
            db.get(Problem, self.problem_id).evaluation_config = 'eval_1_cv_hico'
            db.commit()
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        process = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)],
            cwd=str(Path(__file__).resolve().parents[1]),
            env={**os.environ, 'ENVIRONMENT': 'development'},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        try:
            with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=10) as client:
                deadline = time.monotonic() + 30
                while True:
                    self.assertIsNone(process.poll(), 'Isolated API exited before becoming ready')
                    try:
                        if client.get('/').status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    self.assertLess(time.monotonic(), deadline, 'Isolated API startup timed out')
                    time.sleep(.2)
                with client.stream('GET', '/api/leaderboard/events?type=public') as response:
                    self.assertEqual(response.status_code, 200)
                    lines = response.iter_lines()
                    self.assertIn('event: ready', [next(lines) for _ in range(4)])
                    accepted = client.post('/api/submissions', headers=self.headers[0],
                                           data={'problem_id': self.problem_id, 'submission_type': 'public',
                                                 'client_request_id': str(uuid4())},
                                           files={'file': ('my predictions.csv', b'valid', 'text/csv')})
                    self.assertEqual(accepted.status_code, 202, accepted.text)
                    self.finish()  # Parent process plays the role of the grading worker.
                    frame = []
                    while True:
                        line = next(lines)
                        if not line and frame:
                            break
                        if line:
                            frame.append(line)
                    self.assertIn('event: leaderboard-change', frame)
                    board = client.get('/api/leaderboard', params={'problem_code': self.problem.code}).json()
                    self.assertEqual(board[0]['best_score'], .75)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)

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
                Submission(user_id=self.ids[0], problem_id=problem.id, filename='public_submit.csv',
                           status='SUCCESS', submission_type='public', score=.7, created_at=when + datetime.timedelta(days=3)),
                Submission(user_id=self.ids[1], problem_id=problem.id, filename='public_submit.csv',
                           status='SUCCESS', submission_type='public', score=.8, created_at=when + datetime.timedelta(days=1)),
                Submission(user_id=self.ids[0], problem_id=second.id, filename='public_submit.csv',
                           status='SUCCESS', submission_type='public', score=.2, created_at=when + datetime.timedelta(hours=12)),
                Submission(user_id=self.ids[0], problem_id=problem.id, filename='private_submit.csv',
                           status='SUCCESS', submission_type='private', score=.95, created_at=when),
                Submission(user_id=self.ids[0], problem_id=problem.id, filename='public_submit.csv',
                           status='LỖI CHẤM ĐIỂM', submission_type='public', score=.99, created_at=when),
            ])
            db.commit()
            earliest_id = first.id
        overall = self.client.get('/api/leaderboard/overall').json()
        self.assertEqual(overall[0]['user_id'], self.ids[0])
        self.assertEqual(overall[0]['total_score'], 100.0)
        best = next(p for p in overall[0]['components'] if p['problem_id'] == self.problem_id)
        self.assertEqual(best['submission_id'], earliest_id)
        self.assertEqual(datetime.datetime.fromisoformat(overall[0]['last_submission_time']),
                         when + datetime.timedelta(hours=12))
        public = self.client.get('/api/leaderboard', params={'problem_code': code}).json()
        self.assertEqual(public[0]['user_id'], self.ids[0])
        self.assertEqual(public[0]['total_submissions'], 3)
        self.assertEqual(public[0]['best_score'], .8)
        self.assertEqual(datetime.datetime.fromisoformat(public[0]['last_submission_time']), when)
        self.assertEqual(self.client.get('/api/leaderboard', params={'problem_code': code, 'type': 'private'},
                                        headers=self.headers[0]).status_code, 403)
        private = self.client.get('/api/leaderboard', params={'problem_code': code, 'type': 'private'}, headers=self.headers[2]).json()
        self.assertEqual(private[0]['best_score'], .95)
        self.assertEqual(datetime.datetime.fromisoformat(private[0]['last_submission_time']), when)
        private_overall = self.client.get('/api/leaderboard/overall', params={'type': 'private'},
                                          headers=self.headers[2]).json()
        self.assertEqual(private_overall[0]['total_score'], 95.0)
        self.assertEqual(datetime.datetime.fromisoformat(private_overall[0]['last_submission_time']), when)

    def test_overall_leaderboard_adds_normalized_cv_nlp_points_and_ranks_consistently(self):
        with SessionLocal() as db:
            cv = db.get(Problem, self.problem_id)
            cv.evaluation_config = 'eval_1_cv_hico'
            cv.metric = 'mAP'
            nlp = Problem(code=uuid4().hex[:12], title='NLP', metric='SacreBLEU', evaluation_config='eval_2_nlp_tung')
            db.add(nlp)
            db.flush()
            nlp_id = nlp.id
            for uid, cv_score, nlp_score in ((self.ids[0], .95, 60.0), (self.ids[1], .5, 90.0)):
                db.add_all([
                    Submission(user_id=uid, problem_id=cv.id, filename='submission.csv', status='SUCCESS', submission_type='public', score=cv_score),
                    Submission(user_id=uid, problem_id=nlp.id, filename='submission.csv', status='SUCCESS', submission_type='public', score=nlp_score),
                ])
            # Private submissions never contribute to the displayed total.
            db.add(Submission(user_id=self.ids[1], problem_id=nlp.id, filename='submission.csv', status='SUCCESS', submission_type='private', score=100))
            db.commit()
        items = self.client.get('/api/leaderboard/overall').json()
        self.assertEqual([item['user_id'] for item in items], self.ids[:2])
        self.assertEqual([item['total_score'] for item in items], [155.0, 140.0])
        components = {component['problem_id']: component['score'] for component in items[0]['components']}
        self.assertEqual(components[self.problem_id], 95.0)
        self.assertEqual(components[nlp_id], 60.0)
        with SessionLocal() as db:
            scores = db.query(Submission.score).filter_by(user_id=self.ids[0], submission_type='public').all()
            self.assertEqual(sorted(value[0] for value in scores), [.95, 60.0])

    def test_leaderboard_preserves_native_precision_and_does_not_rescale_low_bleu(self):
        with SessionLocal() as db:
            problem = db.get(Problem, self.problem_id)
            problem.metric = 'mAP'
            problem.evaluation_config = 'eval_1_cv_hico'
            code = problem.code
            db.add(Submission(user_id=self.ids[0], problem_id=problem.id, filename='submission.csv',
                              status='SUCCESS', submission_type='public', score=.931549))
            nlp = Problem(code=uuid4().hex[:12], title='Low BLEU', metric='SacreBLEU', evaluation_config='eval_2_nlp_tung')
            db.add(nlp)
            db.flush()
            nlp_id = nlp.id
            db.add(Submission(user_id=self.ids[0], problem_id=nlp.id, filename='submission.csv',
                              status='SUCCESS', submission_type='public', score=.75))
            db.commit()
        individual = self.client.get('/api/leaderboard', params={'problem_code': code}).json()
        self.assertEqual(individual[0]['best_score'], .931549)
        overall = self.client.get('/api/leaderboard/overall').json()
        components = {component['problem_id']: component['score'] for component in overall[0]['components']}
        self.assertEqual(components[self.problem_id], 93.1549)
        self.assertEqual(components[nlp_id], .75)
        self.assertEqual(overall[0]['total_score'], 93.9049)

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
        before = set(self.pdf_directory.iterdir())
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
        self.assertEqual(downloaded.headers['cache-control'], 'no-store')
        current_path = self.pdf_directory / response.json()['pdf_filename']
        self.assertEqual(set(self.pdf_directory.iterdir()) - before, {current_path})
        self.assertFalse((self.pdf_directory / data['pdf_filename']).exists())
        # Reusing the upload's original name also leaves exactly one stored PDF.
        updated = self.client.post(f"/api/problems/{data['id']}/upload-pdf", headers=self.headers[2],
                                   files={'file': ('updated.pdf', content, 'application/pdf')})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(set(self.pdf_directory.iterdir()) - before,
                         {self.pdf_directory / updated.json()['pdf_filename']})
        self.assertEqual(self.client.get(updated.json()['pdf_url']).content, content)

    def pdf_upload(self, content=b'%PDF-1.4 current statement', filename='statement.pdf'):
        return self.client.post(f'/api/problems/{self.problem_id}/upload-pdf', headers=self.headers[2],
                                files={'file': (filename, content, 'application/pdf')})

    def test_pdf_replacement_retires_all_legacy_versions_of_its_problem(self):
        with SessionLocal() as db:
            code = db.get(Problem, self.problem_id).code.lower()
            legacy = [self.pdf_directory / f'de_thi_{code}_cv_{suffix}.pdf'
                      for suffix in ('first', 'second', 'current')]
            for path in legacy:
                path.write_bytes(b'%PDF-1.4 old')
            db.get(Problem, self.problem_id).pdf_filename = legacy[-1].name
            db.commit()
        unrelated = self.pdf_directory / 'unrelated.pdf'
        unrelated.write_bytes(b'%PDF-1.4 keep')
        response = self.pdf_upload()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(all(not path.exists() for path in legacy))
        self.assertTrue((self.pdf_directory / response.json()['pdf_filename']).exists())
        self.assertEqual(unrelated.read_bytes(), b'%PDF-1.4 keep')

    def test_pdf_replacement_preserves_current_pdf_on_database_failure(self):
        from sqlalchemy.orm import Session

        initial = self.pdf_upload()
        old_name = initial.json()['pdf_filename']
        before = set(self.pdf_directory.iterdir())
        with patch.object(Session, 'commit', side_effect=RuntimeError('commit failed')):
            with self.assertRaisesRegex(RuntimeError, 'commit failed'):
                self.pdf_upload(b'%PDF-1.4 replacement')
        self.assertEqual(set(self.pdf_directory.iterdir()), before)
        self.assertEqual(self.client.get(initial.json()['pdf_url']).content, b'%PDF-1.4 current statement')
        with SessionLocal() as db:
            self.assertEqual(db.get(Problem, self.problem_id).pdf_filename, old_name)
            self.assertEqual(db.query(UploadCleanupJob).count(), 0)

    def test_pdf_replacement_removes_partial_upload_on_read_failure(self):
        initial = self.pdf_upload()
        before = set(self.pdf_directory.iterdir())

        def broken_copy(source, target):
            target.write(b'%PDF-1.4 partial')
            raise OSError('upload interrupted')

        with patch('app.problem_pdf_storage.shutil.copyfileobj', side_effect=broken_copy):
            with self.assertRaisesRegex(OSError, 'upload interrupted'):
                self.pdf_upload()
        self.assertEqual(set(self.pdf_directory.iterdir()), before)
        self.assertEqual(self.client.get(initial.json()['pdf_url']).content, b'%PDF-1.4 current statement')

    def test_parallel_pdf_replacements_keep_one_current_file(self):
        before = set(self.pdf_directory.iterdir())
        contents = [f'%PDF-1.4 replacement {index}'.encode() for index in range(8)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(self.pdf_upload, contents))
        self.assertTrue(all(response.status_code == 200 for response in responses),
                        [response.text for response in responses if response.status_code != 200])
        details = self.client.get(f'/api/problems/{self.problem_id}').json()
        self.assertEqual(set(self.pdf_directory.iterdir()) - before,
                         {self.pdf_directory / details['pdf_filename']})
        self.assertIn(self.client.get(details['pdf_url']).content, contents)
        with SessionLocal() as db:
            self.assertEqual(db.query(UploadCleanupJob).count(), 0)

    def test_pdf_cleanup_retries_locked_old_file_and_preserves_new_file(self):
        from app.upload_cleanup import cleanup_pending_uploads

        initial = self.pdf_upload()
        old_path = self.pdf_directory / initial.json()['pdf_filename']
        with patch.object(Path, 'unlink', side_effect=PermissionError('file locked')):
            with self.assertLogs('app.upload_cleanup', level='WARNING'):
                response = self.pdf_upload(b'%PDF-1.4 replacement')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(old_path.exists())
        self.assertEqual(self.client.get(response.json()['pdf_url']).content, b'%PDF-1.4 replacement')
        with SessionLocal() as db:
            job = db.query(UploadCleanupJob).one()
            self.assertEqual(job.upload_kind, 'problem_pdf')
            job.next_attempt_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
            db.commit()
        cleanup_pending_uploads()
        self.assertFalse(old_path.exists())
        self.assertEqual(self.client.get(response.json()['pdf_url']).content, b'%PDF-1.4 replacement')

    def test_pdf_replacement_preserves_other_problem_files_and_shared_pdf(self):
        initial = self.pdf_upload()
        old_path = self.pdf_directory / initial.json()['pdf_filename']
        with SessionLocal() as db:
            other = Problem(code=uuid4().hex[:12], title='Other PDF', pdf_filename=old_path.name)
            db.add(other)
            db.commit()
            other_id = other.id
        response = self.pdf_upload(b'%PDF-1.4 replacement')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(old_path.exists())
        self.assertEqual(self.client.get(f'/api/problems/{other_id}/pdf').content, b'%PDF-1.4 current statement')
        self.assertEqual(self.client.delete(f'/api/problems/{other_id}', headers=self.headers[2]).status_code, 200)
        self.assertFalse(old_path.exists())
        self.assertEqual(self.client.get(response.json()['pdf_url']).content, b'%PDF-1.4 replacement')

    def test_legacy_pdf_cleanup_does_not_claim_another_problem_code_prefix(self):
        with SessionLocal() as db:
            code = db.get(Problem, self.problem_id).code.lower()
            other = Problem(code=code + '_cv', title='Overlapping code')
            db.add(other)
            db.commit()
        paths = [self.pdf_directory / f'de_thi_{code}_cv_cv_{suffix}.pdf'
                 for suffix in ('current', 'previous')]
        for path in paths:
            path.write_bytes(b'%PDF-1.4 other problem')
        self.assertEqual(self.pdf_upload().status_code, 200)
        self.assertTrue(all(path.exists() for path in paths))

    def test_pdf_replacement_survives_problem_code_and_category_changes(self):
        initial = self.pdf_upload()
        response = self.client.put(f'/api/problems/{self.problem_id}', headers=self.headers[2],
                                   json={'code': uuid4().hex[:12], 'category': 'NLP'})
        self.assertEqual(response.status_code, 200)
        updated = self.pdf_upload(b'%PDF-1.4 replacement')
        self.assertEqual(updated.status_code, 200)
        self.assertFalse((self.pdf_directory / initial.json()['pdf_filename']).exists())
        self.assertEqual(self.client.get(updated.json()['pdf_url']).content, b'%PDF-1.4 replacement')

    def test_problem_creation_with_invalid_schedule_does_not_save_pdf(self):
        before = set(self.pdf_directory.iterdir())
        response = self.client.post('/api/problems', headers=self.headers[2],
                                    data={'code': uuid4().hex[:12], 'title': 'Bad schedule', 'public_unlock_at': 'bad'},
                                    files={'file': ('statement.pdf', b'%PDF-1.4 upload', 'application/pdf')})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(set(self.pdf_directory.iterdir()), before)

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
