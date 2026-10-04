import os
import shutil
import sqlite3
import datetime

BASE_DIR = r"d:\nghia\oplai2026\system_olpai2026"
BACKUP_DIR = os.path.join(BASE_DIR, "backups", "backup_test_database")

os.makedirs(BACKUP_DIR, exist_ok=True)
os.makedirs(os.path.join(BACKUP_DIR, "uploads"), exist_ok=True)

# 1. Backup olpai2026.db
src_db = os.path.join(BASE_DIR, "olpai2026.db")
if os.path.exists(src_db):
    shutil.copy2(src_db, os.path.join(BACKUP_DIR, "olpai2026.db"))
    print(f"Backed up {src_db} -> {BACKUP_DIR}")

# 2. Backup backend/olpai2026.db if exists
src_backend_db = os.path.join(BASE_DIR, "backend", "olpai2026.db")
if os.path.exists(src_backend_db):
    shutil.copy2(src_backend_db, os.path.join(BACKUP_DIR, "backend_olpai2026.db"))
    print(f"Backed up {src_backend_db} -> {BACKUP_DIR}")

# 3. Backup uploads folder
src_uploads = os.path.join(BASE_DIR, "uploads")
dst_uploads = os.path.join(BACKUP_DIR, "uploads")
if os.path.exists(src_uploads):
    shutil.copytree(src_uploads, dst_uploads, dirs_exist_ok=True)
    print(f"Backed up {src_uploads} -> {dst_uploads}")

# 4. Write instructions to README_RESTORE.txt
readme_path = os.path.join(BACKUP_DIR, "README_RESTORE.txt")
with open(readme_path, "w", encoding="utf-8") as f:
    f.write(f"""====================================================
BẢN SAO LƯU DỮ LIỆU KIỂM THỬ (TEST ENVIRONMENT BACKUP)
Thời điểm sao lưu: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
====================================================

Thư mục này chứa:
1. olpai2026.db : Bản cơ sở dữ liệu SQLite test (15 người dùng, 4 đề thi, 4 datasets, 18 bài nộp)
2. backend_olpai2026.db : Bản phụ trong thư mục backend
3. uploads/ : Toàn bộ file PDF đề thi và file nộp CSV của các đội thi

CÁCH KHÔI PHỤC (RESTORE) LẠI BẢN TEST:
1. Tắt tạm thời server uvicorn (Ctrl + C ở terminal backend).
2. Copy đè file 'olpai2026.db' từ thư mục này ra thư mục gốc dự án:
   copy .\\backups\\backup_test_database\\olpai2026.db .\\olpai2026.db
3. (Tùy chọn) Khôi phục thư mục uploads:
   xcopy /E /I /Y .\\backups\\backup_test_database\\uploads .\\uploads
4. Khởi động lại uvicorn.
====================================================
""")
print(f"Wrote restore instructions to {readme_path}")
