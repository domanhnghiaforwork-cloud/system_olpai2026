"""Optional, durable account provisioning for the shared gateway deployment."""
import asyncio
import logging
import os
import secrets
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from pwdlib import PasswordHash

from .database import SessionLocal
from .models import ChatbotProvisionJob, User

logger = logging.getLogger(__name__)
_dispatch_lock = threading.Lock()


def provisioning_enabled() -> bool:
    return (
        os.getenv("CHATBOT_ACCOUNT_SYNC_ENABLED", "false").lower() == "true"
        and bool(os.getenv("CHATBOT_INTERNAL_URL", "").strip())
        and len(os.getenv("CHATBOT_SSO_SECRET", "")) >= 64
    )


def enqueue_chatbot_account(db, user: User, password: str) -> None:
    if not provisioning_enabled():
        return
    db.flush()  # Allocate the user ID without committing either row.
    db.add(ChatbotProvisionJob(
        user_id=user.id, email=user.email.strip().lower(), role=user.role,
        password_hash=PasswordHash.recommended().hash(password),
    ))


def dispatch_pending_accounts() -> None:
    if not provisioning_enabled() or not _dispatch_lock.acquire(blocking=False):
        return
    try:
        with SessionLocal() as db:
            job_ids = [row.id for row in db.query(ChatbotProvisionJob.id).filter(
                ChatbotProvisionJob.next_attempt_at <= datetime.utcnow()
            ).order_by(ChatbotProvisionJob.id).limit(25).all()]
        # No remote request runs inside the account-creation transaction.
        with httpx.Client(timeout=3.0, trust_env=False) as client:
            for job_id in job_ids:
                with SessionLocal() as db:
                    job = db.get(ChatbotProvisionJob, job_id)
                    if job is None:
                        continue
                    if db.get(User, job.user_id) is None:
                        db.delete(job)
                        db.commit()
                        continue
                    now = datetime.now(timezone.utc)
                    ticket = jwt.encode({
                        "iss": "olpai-system", "aud": "olpai-chatbot",
                        "type": "chatbot-provision", "sub": str(job.user_id),
                        "email": job.email, "role": job.role,
                        "password_hash": job.password_hash,
                        "jti": secrets.token_urlsafe(32),
                        "iat": now, "exp": now + timedelta(seconds=60),
                    }, os.environ["CHATBOT_SSO_SECRET"], algorithm="HS256")
                    try:
                        response = client.post(
                            os.environ["CHATBOT_INTERNAL_URL"].rstrip("/") + "/auth/system-provision",
                            json={"ticket": ticket},
                        )
                        response.raise_for_status()
                    except (httpx.HTTPError, httpx.InvalidURL) as exc:
                        # Never persist/log response bodies, tickets or passwords.
                        code = f"http_{exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else "transport_error"
                        job.attempts += 1
                        job.last_error = code
                        job.next_attempt_at = datetime.utcnow() + timedelta(
                            seconds=min(300, 5 * 2 ** min(job.attempts - 1, 6))
                        )
                        db.commit()
                        logger.warning("Chatbot account job %s deferred (%s)", job_id, code)
                        # Avoid hammering an unavailable chatbot for a large batch.
                        break
                    else:
                        db.delete(job)
                        db.commit()
    finally:
        _dispatch_lock.release()


async def _dispatch_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(dispatch_pending_accounts)
        except Exception as exc:
            # A provisioning failure must not stop the system API.
            logger.warning("Chatbot account dispatch deferred (%s)", type(exc).__name__)
        await asyncio.sleep(2)


@asynccontextmanager
async def provisioning_lifespan(_app):
    task = asyncio.create_task(_dispatch_loop()) if provisioning_enabled() else None
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
