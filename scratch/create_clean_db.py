import os
import sys
import shutil
import datetime

BASE_DIR = r"d:\nghia\oplai2026\system_olpai2026"
sys.path.insert(0, BASE_DIR)

from backend.app.database import engine, Base, SessionLocal
from backend.app.models import User, Problem, Dataset, Submission

print("Step 1: Dropping all existing tables in database...")
Base.metadata.drop_all(bind=engine)

print("Step 2: Creating all tables fresh...")
Base.metadata.create_all(bind=engine)

print("Step 3: Inserting single Admin user...")
with SessionLocal() as db:
    admin_user = User(
        username="admin",
        full_name="Ban Tổ Chức OLP AI KMA",
        email="admin.olpai@actvn.edu.vn",
        role="admin",
        team_name="Ban Tổ Chức",
        password="123456admin@",
        created_at=datetime.datetime.utcnow()
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    print(f"Admin user created with ID: {admin_user.id}, Username: {admin_user.username}, Role: {admin_user.role}")

    user_count = db.query(User).count()
    prob_count = db.query(Problem).count()
    data_count = db.query(Dataset).count()
    sub_count = db.query(Submission).count()

    print(f"Verification: Users={user_count}, Problems={prob_count}, Datasets={data_count}, Submissions={sub_count}")

# Sync to backend/olpai2026.db if exists
root_db = os.path.join(BASE_DIR, "olpai2026.db")
backend_db = os.path.join(BASE_DIR, "backend", "olpai2026.db")
if os.path.exists(root_db):
    shutil.copy2(root_db, backend_db)
    print(f"Synchronized clean DB to {backend_db}")

# Clean uploads folders for fresh start (old files are saved in backups)
uploads_prob = os.path.join(BASE_DIR, "uploads", "problems")
uploads_sub = os.path.join(BASE_DIR, "uploads", "submissions")
for folder in [uploads_prob, uploads_sub]:
    if os.path.exists(folder):
        for f in os.listdir(folder):
            fp = os.path.join(folder, f)
            try:
                if os.path.isfile(fp):
                    os.remove(fp)
            except Exception as e:
                print(f"Could not remove {fp}: {e}")
    os.makedirs(folder, exist_ok=True)
print("Cleaned uploads/ directories for fresh start.")
print("ALL DONE SUCCESSFUL!")
