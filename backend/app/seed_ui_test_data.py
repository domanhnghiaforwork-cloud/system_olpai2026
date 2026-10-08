"""Create clearly marked submission fixtures for local UI checks.

Run from the project root: .venv/Scripts/python.exe -m backend.app.seed_ui_test_data --apply
Scores are simulated; these records do not run the evaluator or enqueue jobs.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sqlite3
import sys


MARKER = "ui-display-test-v1"
PASSWORD = "OplaiTest2026!"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True)
    parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    database = Path(os.getenv("DATABASE_PATH", "./olpai2026.db")).resolve()
    if not database.is_file():
        raise SystemExit(f"Existing database required: {database}")

    from .auth_utils import get_password_hash
    from .database import SessionLocal
    from .models import Problem, Submission, User

    with SessionLocal() as db:
        problems = {p.category: p for p in db.query(Problem).order_by(Problem.id).all()}
        if not all(category in problems for category in ("CV", "NLP")):
            raise SystemExit("Both CV and NLP problems are required.")
        names = [f"test_doi{i:02}" for i in range(1, 11)]
        existing = db.query(User).filter(User.username.in_(names)).all()
        if existing:
            raise SystemExit("Test accounts already exist; no data changed: " + ", ".join(u.username for u in existing))

        backup = database.parent / "backups" / f"before-ui-test-{dt.datetime.now():%Y%m%d-%H%M%S}.db"
        backup.parent.mkdir(exist_ok=True)
        with sqlite3.connect(str(database)) as source, sqlite3.connect(str(backup)) as target:
            source.backup(target)

        directory = database.parent / "uploads" / "ui_test_submissions"
        directory.mkdir(parents=True, exist_ok=True)
        password_hash = get_password_hash(PASSWORD)
        now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        summary = []
        for team in range(1, 11):
            username = f"test_doi{team:02}"
            user = User(username=username, full_name=f"Đội thi {team:02} (dữ liệu mẫu)",
                        team_name=f"Đội thi {team:02}", email=f"{username}@example.invalid",
                        role="user", password=password_hash)
            db.add(user)
            db.flush()
            count = 20 if team == 1 else 8
            for attempt in range(count):
                category, split = (("CV", "public"), ("CV", "private"),
                                   ("NLP", "public"), ("NLP", "private"))[attempt % 4]
                problem = problems[category]
                failed = attempt in (6, 13)
                status = "LỖI ĐỊNH DẠNG" if failed else "SUCCESS"
                # Respect each evaluator's native scale, including legacy metric metadata.
                scale = 100 if (problem.evaluation_config or "").strip() == "eval_2_nlp_tung" or "bleu" in (problem.metric or "").lower() else 1
                score = None if failed else round((.42 + team * .025 + (attempt // 4) * .04) * scale, 6)
                filename = f"{split}_submit.csv"
                path = directory / f"{username}_{problem.code}_{attempt + 1:02}.csv"
                path.write_text("id,prediction\n1,0\n2,1\n3,0\n", encoding="utf-8")
                db.add(Submission(user_id=user.id, problem_id=problem.id, filename=filename,
                                  stored_path=str(path), submission_type=split, status=status, score=score,
                                  description=MARKER, logs="Dữ liệu mẫu kiểm tra giao diện; điểm giả lập.",
                                  created_at=now - dt.timedelta(minutes=(count - attempt) * 7 + team)))
            summary.append({"username": username, "team": user.team_name, "submissions": count})
        db.commit()
        print(json.dumps({"backup": str(backup), "accounts": summary,
                          "total_submissions": sum(item["submissions"] for item in summary)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
