"""Import private stdin JSON. Existing emails are preserved, never overwritten."""
import hashlib
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func
from .database import DB_FILE_PATH, SessionLocal
from .models import User


def import_users(records: list[dict]) -> dict:
    if not isinstance(records, list):
        raise ValueError("Expected a list of accounts")
    for record in records:
        if (record.get("role") not in ("user", "admin")
                or not isinstance(record.get("email"), str) or "@" not in record["email"]
                or not record.get("password_hash", "").startswith("$argon2")):
            raise ValueError("Unsupported account data")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup = Path(DB_FILE_PATH).with_name(f"pre-chatbot-sync-{stamp}.db")
    with sqlite3.connect(DB_FILE_PATH) as source, sqlite3.connect(backup) as destination:
        source.backup(destination)

    created, skipped = [], []
    with SessionLocal() as db:
        with db.begin():
            usernames = {row[0].lower() for row in db.query(User.username).all()}
            for record in records:
                email = record["email"].strip().lower()
                if db.query(User).filter(func.lower(User.email) == email).first():
                    skipped.append(email)
                    continue
                base = re.sub(r"[^a-z0-9_.-]", "_", email.split("@")[0])[:35] or "chatbot_user"
                username = base
                suffix = hashlib.sha256(email.encode()).hexdigest()[:8]
                index = 0
                while username.lower() in usernames:
                    username = f"{base}_{suffix}" + (f"_{index}" if index else "")
                    index += 1
                usernames.add(username.lower())
                db.add(User(
                    username=username, email=email, full_name=email.split("@")[0][:100],
                    role=record["role"], password=record["password_hash"],
                    team_name="KMA AI Team",
                    created_at=datetime.fromisoformat(record["created_at"]).replace(tzinfo=None),
                ))
                db.flush()
                created.append({"email": email, "username": username, "role": record["role"]})
    return {"created": created, "skipped_existing": skipped, "backup": str(backup)}


if __name__ == "__main__":
    try:
        result = import_users(json.load(sys.stdin))
        print(json.dumps(result))
    except Exception as error:
        # Avoid SQLAlchemy exception parameters leaking password hashes to logs.
        print(f"Account import failed ({type(error).__name__}); transaction rolled back.", file=sys.stderr)
        sys.exit(1)
