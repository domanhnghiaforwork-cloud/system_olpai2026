"""Retry obsolete file deletion after the owning database changes commit."""
import asyncio
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException

from .database import SessionLocal
from .models import Problem, Submission, TrainingNotebook, UploadCleanupJob

logger = logging.getLogger(__name__)
_cleanup_lock = threading.Lock()


def cleanup_path(stored_path, upload_kind):
    # Use the same roots as the upload handlers, including configured overrides.
    from .submission_jobs import UPLOAD_DIR
    from .routers.training_notebooks import NOTEBOOK_DIR
    from .pdf_utils import PDF_DIR

    roots = {"submission": UPLOAD_DIR, "notebook": NOTEBOOK_DIR, "problem_pdf": PDF_DIR}
    root = Path(roots[upload_kind]).resolve()
    path = Path(stored_path).resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError("Upload path is outside its storage directory")
    return path


def enqueue_upload_cleanup(db, stored_path, upload_kind):
    if not stored_path:
        return
    try:
        cleanup_path(stored_path, upload_kind)
    except (OSError, ValueError) as error:
        raise HTTPException(409, "Đường dẫn file lưu trữ không hợp lệ. Chưa lưu thay đổi.") from error
    db.add(UploadCleanupJob(stored_path=stored_path, upload_kind=upload_kind))


def cleanup_pending_uploads(limit=100, *, wait=False, upload_kind=None):
    if not _cleanup_lock.acquire(blocking=wait):
        return
    try:
        with SessionLocal() as db:
            query = db.query(UploadCleanupJob.id).filter(
                UploadCleanupJob.next_attempt_at <= datetime.utcnow()
            ).order_by(UploadCleanupJob.id)
            if upload_kind is not None:
                query = query.filter(UploadCleanupJob.upload_kind == upload_kind)
            if limit is not None:
                query = query.limit(limit)
            ids = [row[0] for row in query.all()]
        for job_id in ids:
            with SessionLocal() as db:
                job = db.get(UploadCleanupJob, job_id)
                if job is None:
                    continue
                try:
                    path = cleanup_path(job.stored_path, job.upload_kind)
                    # Keep files still referenced by an active upload/problem.
                    if job.upload_kind == "problem_pdf":
                        from .pdf_utils import resolve_problem_pdf, PDF_DIR

                        referenced = any(
                            filename and (Path(PDF_DIR) / filename).resolve() == path
                            for (stored_filename,) in db.query(Problem.pdf_filename).filter(
                                Problem.pdf_filename.isnot(None)
                            ).all()
                            for filename in (resolve_problem_pdf(stored_filename),)
                        )
                    else:
                        model = Submission if job.upload_kind == "submission" else TrainingNotebook
                        referenced = db.query(model.id).filter(
                            model.stored_path.in_((job.stored_path, str(path)))
                        ).first()
                    if not referenced:
                        path.unlink(missing_ok=True)
                except (OSError, ValueError, KeyError):
                    logger.warning("Upload cleanup job %s deferred", job_id, exc_info=True)
                    job.next_attempt_at = datetime.utcnow() + timedelta(seconds=30)
                    db.commit()
                    continue
                db.delete(job)
                db.commit()
    finally:
        _cleanup_lock.release()


async def upload_cleanup_loop():
    while True:
        try:
            await asyncio.to_thread(cleanup_pending_uploads)
        except Exception:
            logger.exception("Upload cleanup deferred")
        await asyncio.sleep(5)
