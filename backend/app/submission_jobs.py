"""Durable, idempotent submission queue. Expensive work never holds a DB transaction."""
import datetime as dt
import hashlib
import json
import logging
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import and_, or_, text

from .database import SessionLocal
from .evaluators import get_evaluator
from .models import Problem, Submission, SubmissionJob

logger = logging.getLogger(__name__)
UPLOAD_DIR = Path(os.getenv("SUBMISSION_UPLOAD_DIR", "./uploads/submissions"))
MAX_FILE_BYTES = int(os.getenv("SUBMISSION_MAX_FILE_BYTES", str(95 * 1024**2)))
MAX_QUEUE_SIZE = int(os.getenv("SUBMISSION_MAX_QUEUE_SIZE", "100"))
LEASE_SECONDS = int(os.getenv("SUBMISSION_LEASE_SECONDS", "60"))
MAX_ATTEMPTS = 3
_reservation_lock = threading.Lock()


@contextmanager
def reservation_session():
    # Serialize API writers locally instead of making every upload contend for
    # SQLite's file lock. BEGIN IMMEDIATE still protects other API/worker processes.
    with _reservation_lock, SessionLocal() as db:
        db.execute(text("BEGIN IMMEDIATE"))
        yield db


def remove_upload(path):
    target = Path(path).resolve()
    if target.is_relative_to(UPLOAD_DIR.resolve()):
        target.unlink(missing_ok=True)


def save_upload(file, user_id, problem_id):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path = UPLOAD_DIR / f"{problem_id}_{user_id}_{uuid4().hex}.csv"
    digest = hashlib.sha256()
    size = 0
    try:
        with path.open("xb") as output:
            while chunk := file.file.read(1024**2):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(413, f"File vượt giới hạn {MAX_FILE_BYTES // 1024**2} MB.")
                digest.update(chunk)
                output.write(chunk)
        return str(path), digest.hexdigest()
    except BaseException:
        remove_upload(path)
        raise


def validate_problem(problem, submission_type, is_admin):
    if not problem:
        raise HTTPException(404, "Không tìm thấy đề bài tương ứng")
    config = (problem.evaluation_config or "").strip()
    if not config or not get_evaluator(config):
        raise HTTPException(400, "Đề bài chưa có cấu hình chấm điểm hợp lệ.")
    now = dt.datetime.utcnow()
    if not is_admin:
        if (problem.unlock_at and now < problem.unlock_at.replace(tzinfo=None)) or (
            not problem.unlock_at and problem.is_locked
        ):
            raise HTTPException(403, "Đề bài chưa mở nhận bài nộp.")
        split_unlock_at = getattr(problem, f"{submission_type}_unlock_at", None)
        split_locked = getattr(problem, f"{submission_type}_is_locked", False)
        if (split_unlock_at and now < split_unlock_at.replace(tzinfo=None)) or (not split_unlock_at and split_locked):
            raise HTTPException(403, f"Khu vực nộp bài {submission_type.capitalize()} chưa mở.")
    return config


def serialize_job(job):
    """Return complete results after the caller checks ownership/admin access."""
    sub = job.submission
    if job.result_json:
        result = json.loads(job.result_json)
    else:
        message = "Đã nhận bài. Đang chờ kiểm tra." if job.state == "QUEUED" else "Đang kiểm tra và chấm bài."
        result = {
            "success": None, "score": None, "result_line": message,
            "step1_validation": {"status": job.state, "message": message},
            "step2_scoring": {"status": "PENDING", "message": "Chưa hoàn tất chấm điểm."},
        }
    result.update(accepted=True, submission_id=sub.id, client_request_id=job.client_request_id,
                  job_status=job.state, final_status=sub.status, status=sub.status,
                  submission_type=sub.submission_type, filename=sub.filename)
    return result


def find_job(user_id, client_request_id):
    with SessionLocal() as db:
        job = db.query(SubmissionJob).filter_by(user_id=user_id, client_request_id=client_request_id).first()
        if job:
            db.expunge_all()
        return job


def enqueue_submission(user_id, problem_id, submission_type, client_request_id,
                       path, digest, original_filename, is_admin):
    committed = False
    started = time.perf_counter()
    try:
        with reservation_session() as db:
            # Serialize check + reservation across API/worker processes. The
            # uploaded file has already been copied without holding this lock.
            existing = db.query(SubmissionJob).filter_by(
                user_id=user_id, client_request_id=client_request_id
            ).first()
            if existing:
                if (existing.submission.problem_id != problem_id
                    or existing.submission.submission_type != submission_type
                    or existing.payload_sha256 != digest):
                    raise HTTPException(409, "Mã yêu cầu này đã được dùng cho một bài nộp khác.")
                response = serialize_job(existing)
                db.rollback()
                remove_upload(path)
                return response
            problem = db.get(Problem, problem_id)
            config = validate_problem(problem, submission_type, is_admin)
            type_filter = Submission.submission_type == submission_type
            if submission_type == "public":
                type_filter = or_(type_filter, Submission.submission_type.is_(None))
            used = db.query(Submission).filter(
                Submission.user_id == user_id, Submission.problem_id == problem_id, type_filter,
                or_(Submission.status.in_(("QUEUED", "PROCESSING")), and_(
                    Submission.score.isnot(None),
                    Submission.status.notin_(("LỖI ĐỊNH DẠNG", "INVALID_FORMAT", "LỖI CHẤM ĐIỂM")),
                )),
            ).count()
            maximum = problem.max_private_submissions if submission_type == "private" else problem.max_public_submissions
            maximum = maximum if maximum is not None else (2 if submission_type == "private" else 5)
            if used >= maximum:
                raise HTTPException(400, "Đã hết lượt nộp hoặc đang có bài chờ xử lý trong các lượt còn lại.")
            if db.query(SubmissionJob).filter(SubmissionJob.state.in_(("QUEUED", "PROCESSING"))).count() >= MAX_QUEUE_SIZE:
                raise HTTPException(503, "Hàng đợi chấm bài đang đầy. Vui lòng thử lại sau.")
            sub = Submission(user_id=user_id, problem_id=problem_id,
                             filename=f"{submission_type}_submit.csv", stored_path=path,
                             submission_type=submission_type, status="QUEUED", score=None,
                             description="Đã nhận bài, đang chờ kiểm tra.")
            db.add(sub)
            db.flush()
            job = SubmissionJob(submission=sub, user_id=user_id, client_request_id=client_request_id,
                                payload_sha256=digest, original_filename=(original_filename or "")[:255],
                                evaluation_config=config, state="QUEUED")
            db.add(job)
            db.flush()
            response = serialize_job(job)
            db.commit()
            committed = True
            if time.perf_counter() - started > 2:
                logger.warning("submission_reservation_slow seconds=%.3f", time.perf_counter() - started)
            return response
    except BaseException:
        if not committed:
            remove_upload(path)
        raise


def claim_jobs(limit):
    claimed = []
    now = dt.datetime.utcnow()
    eligible = or_(
            SubmissionJob.state == "QUEUED",
            and_(SubmissionJob.state == "PROCESSING", SubmissionJob.lease_until < now),
        )
    with SessionLocal() as db:
        # An idle worker should only read, not repeatedly acquire the writer lock.
        ids = [row[0] for row in db.query(SubmissionJob.id).filter(eligible).order_by(SubmissionJob.id).limit(limit).all()]
    if not ids:
        return []
    with SessionLocal() as db:
        db.execute(text("BEGIN IMMEDIATE"))
        jobs = db.query(SubmissionJob).filter(SubmissionJob.id.in_(ids), eligible).all()
        for job in jobs:
            if job.attempts >= MAX_ATTEMPTS:
                job.state = "FAILED"
                job.submission.status = "LỖI CHẤM ĐIỂM"
                job.result_json = json.dumps({"success": False, "score": None,
                    "result_line": "Chấm bài gián đoạn nhiều lần. Vui lòng liên hệ quản trị viên."})
                continue
            job.state = "PROCESSING"
            job.claim_token = str(uuid4())
            job.attempts += 1
            job.lease_until = now + dt.timedelta(seconds=LEASE_SECONDS)
            job.updated_at = now
            job.submission.status = "PROCESSING"
            claimed.append({"job_id": job.id, "claim_token": job.claim_token,
                            "path": job.submission.stored_path, "submission_type": job.submission.submission_type,
                            "original_filename": job.original_filename, "evaluation_config": job.evaluation_config})
        db.commit()
    return claimed


def heartbeat_jobs(jobs):
    if not jobs:
        return
    with SessionLocal() as db:
        for job in jobs:
            db.query(SubmissionJob).filter_by(id=job["job_id"], state="PROCESSING", claim_token=job["claim_token"]).update({
                "lease_until": dt.datetime.utcnow() + dt.timedelta(seconds=LEASE_SECONDS),
                "updated_at": dt.datetime.utcnow(),
            })
        db.commit()


def evaluate_job(job):
    """Runs in a separate process; returns data without keeping a DB session."""
    try:
        evaluator = get_evaluator(job["evaluation_config"])
        validation = evaluator.validate(job["path"], job["submission_type"], job["original_filename"])
        step1 = {"status": "PASS" if validation.is_valid else "FAILED", "message": validation.message,
                 "errors": validation.errors, "row_count": validation.row_count}
        if not validation.is_valid:
            return {"success": False, "final_status": "LỖI ĐỊNH DẠNG", "score": None,
                    "step1_validation": step1, "step2_scoring": {"status": "SKIPPED", "message": "Không chấm file không hợp lệ."},
                    "result_line": validation.message}
        score = evaluator.evaluate(job["path"], job["submission_type"])
        return {"success": True, "final_status": "HỢP LỆ", "score": score.score,
                "step1_validation": step1, "step2_scoring": {"status": "PASS", "score": score.score,
                    "metric": score.metric, "message": score.message, "details": score.details},
                "result_line": f"Điểm số đạt được: {score.score} ({score.metric})"}
    except Exception:
        logger.exception("submission_evaluation_failed", extra={"job_id": job["job_id"]})
        return {"success": False, "final_status": "LỖI CHẤM ĐIỂM", "score": None,
                "step2_scoring": {"status": "FAILED", "message": "Không hoàn tất chấm bài. Vui lòng liên hệ quản trị viên."},
                "result_line": "Lỗi chấm điểm. Lượt nộp này không bị tính vào giới hạn."}


def finish_job(claimed, result):
    with SessionLocal() as db:
        db.execute(text("BEGIN IMMEDIATE"))
        job = db.query(SubmissionJob).filter_by(id=claimed["job_id"], state="PROCESSING",
                                                claim_token=claimed["claim_token"]).first()
        if not job:
            return
        job.state = "DONE" if result["success"] else "FAILED"
        job.result_json = json.dumps(result, ensure_ascii=False)
        job.updated_at = dt.datetime.utcnow()
        job.lease_until = None
        sub = job.submission
        sub.status = result["final_status"]
        sub.score = result["score"]
        sub.description = "Chấm điểm thành công" if result["success"] else "Bài nộp không được chấm thành công"
        sub.logs = result.get("step1_validation", {}).get("message", "") + " | " + result.get("step2_scoring", {}).get("message", "")
        delete_path = sub.stored_path if not result["success"] else None
        if delete_path:
            sub.stored_path = None
        db.commit()
    if delete_path:
        remove_upload(delete_path)
