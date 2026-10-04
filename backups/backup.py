#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script sao lưu (Backup) tự động toàn bộ hệ thống OLP AI KMA 2026
- Đóng gói an toàn file Database SQLite (dùng SQLite Online Backup API - Read-Only, không gây khóa/ảnh hưởng server đang chạy)
- Hỗ trợ tự động trích xuất trực tiếp từ Docker container (nếu đang chạy Docker) hoặc từ file cục bộ
- Đóng gói toàn bộ thư mục uploads (PDF đề thi, file nộp bài thí sinh)
- Tự động lưu file zip vào thư mục backups/
"""

import os
import sys
import re
import json
import shutil
import sqlite3
import zipfile
import tempfile
import subprocess
from datetime import datetime

# Đảm bảo in tiếng Việt mượt mà trên mọi terminal Windows / Linux
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BACKUPS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKUPS_DIR)

def print_banner():
    print("=" * 60)
    print("   HỆ THỐNG OLP AI KMA 2026 - CÔNG CỤ SAO LƯU DỮ LIỆU (BACKUP)   ")
    print("=" * 60)

def ask_backup_name():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_name = f"backup_olpai2026_{timestamp}"
    
    if len(sys.argv) > 1 and sys.argv[1].strip():
        chosen_name = sys.argv[1].strip()
    else:
        print(f"\n[?] Nhập tên bản sao lưu (để trống sẽ dùng: '{default_name}'):")
        try:
            chosen_name = input(" -> Tên bản backup: ").strip()
        except (EOFError, KeyboardInterrupt):
            chosen_name = ""

    if not chosen_name:
        chosen_name = default_name

    # Sanitize name to safe characters
    clean_name = re.sub(r'[^a-zA-Z0-9_\-.]', '_', chosen_name)
    if clean_name.lower().endswith(".zip"):
        clean_name = clean_name[:-4]
    
    return f"{clean_name}.zip"

def is_docker_backend_running():
    try:
        res = subprocess.run(
            ["docker", "ps", "--filter", "name=olp_ai_kma_backend", "--format", "{{.Names}}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        return "olp_ai_kma_backend" in res.stdout
    except Exception:
        return False

def backup_sqlite_safely(src_db_path, dst_db_path):
    """
    Sử dụng SQLite Online Backup API ở chế độ Read-Only (mode=ro).
    Đảm bảo 100% không khóa cơ sở dữ liệu và không làm gián đoạn các kết nối đang đọc/ghi.
    """
    abs_src = os.path.abspath(src_db_path)
    uri = f"file:{abs_src}?mode=ro"
    src_conn = sqlite3.connect(uri, uri=True, timeout=10.0)
    dst_conn = sqlite3.connect(dst_db_path)
    
    with dst_conn:
        src_conn.backup(dst_conn, pages=100)
    
    dst_conn.close()
    src_conn.close()

def get_db_stats(db_path):
    stats = {"users": 0, "problems": 0, "submissions": 0, "datasets": 0}
    try:
        conn = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True)
        cur = conn.cursor()
        for table in ["users", "problems", "submissions", "datasets"]:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                stats[table] = cur.fetchone()[0]
            except Exception:
                pass
        conn.close()
    except Exception:
        pass
    return stats

def main():
    print_banner()
    
    # 1. Xác định tên file zip
    zip_filename = ask_backup_name()
    target_zip_path = os.path.join(BACKUPS_DIR, zip_filename)
    
    print(f"\n[*] Đích sao lưu: {target_zip_path}")
    
    # Thư mục tạm thời để tập hợp dữ liệu trước khi nén
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_db_path = os.path.join(temp_dir, "olpai2026.db")
        temp_uploads_dir = os.path.join(temp_dir, "uploads")
        os.makedirs(temp_uploads_dir, exist_ok=True)
        
        # 2. Thu thập file Database an toàn
        db_source_info = "Không tìm thấy"
        docker_running = is_docker_backend_running()
        
        if docker_running:
            print("[+] Phát hiện Docker container 'olp_ai_kma_backend' đang chạy.")
            print("    -> Trích xuất database an toàn qua snapshot từ container...")
            try:
                # Chạy script snapshot trong container ở chế độ read-only
                snap_cmd = (
                    "python -c \""
                    "import sqlite3; "
                    "s = sqlite3.connect('file:/app/data/olpai2026.db?mode=ro', uri=True); "
                    "d = sqlite3.connect('/tmp/snap.db'); "
                    "s.backup(d); "
                    "d.close(); s.close()\""
                )
                subprocess.run(["docker", "exec", "olp_ai_kma_backend", "sh", "-c", snap_cmd], check=True, timeout=15)
                subprocess.run(["docker", "cp", "olp_ai_kma_backend:/tmp/snap.db", temp_db_path], check=True, timeout=15)
                subprocess.run(["docker", "exec", "olp_ai_kma_backend", "rm", "-f", "/tmp/snap.db"], timeout=5)
                db_source_info = "Docker Volume (olp_ai_kma_backend:/app/data/olpai2026.db)"
                print("    -> Trích xuất SQLite từ Docker thành công!")
            except Exception as e:
                print(f"    [!] Trích xuất từ Docker gặp lỗi ({e}), chuyển sang kiểm tra file cục bộ...")
        
        # Nếu Docker không chạy hoặc trích xuất không được, kiểm tra các đường dẫn cục bộ
        if not os.path.exists(temp_db_path):
            candidate_paths = [
                os.path.join(ROOT_DIR, "olpai2026.db"),
                os.path.join(ROOT_DIR, "backend", "olpai2026.db"),
                os.path.join(ROOT_DIR, "backend", "data", "olpai2026.db"),
            ]
            
            existing_candidates = [p for p in candidate_paths if os.path.exists(p) and os.path.getsize(p) > 0]
            if existing_candidates:
                # Lấy file có thời gian chỉnh sửa mới nhất
                best_db = max(existing_candidates, key=os.path.getmtime)
                print(f"[+] Tìm thấy file Database cục bộ: {os.path.relpath(best_db, ROOT_DIR)}")
                print("    -> Đang sao lưu an toàn bằng SQLite Online Backup API (Read-Only)...")
                backup_sqlite_safely(best_db, temp_db_path)
                db_source_info = f"Cục bộ ({os.path.relpath(best_db, ROOT_DIR)})"
                print("    -> Sao lưu Database cục bộ thành công!")
            else:
                print("[!] Cảnh báo: Không tìm thấy file olpai2026.db trên hệ thống.")
        
        # Thống kê sơ bộ DB
        db_stats = {}
        if os.path.exists(temp_db_path):
            db_size_kb = os.path.getsize(temp_db_path) / 1024
            db_stats = get_db_stats(temp_db_path)
            print(f"    -> Kích thước DB: {db_size_kb:.1f} KB | Số bài thi: {db_stats.get('problems', 0)} | Số bài nộp: {db_stats.get('submissions', 0)} | Thí sinh: {db_stats.get('users', 0)}")
        
        # 3. Thu thập thư mục uploads
        print("\n[*] Đang tổng hợp các tệp trong thư mục uploads/...")
        total_upload_files = 0
        
        # Copy từ uploads cục bộ
        candidate_uploads = [
            os.path.join(ROOT_DIR, "uploads"),
            os.path.join(ROOT_DIR, "backend", "uploads")
        ]
        for up_dir in candidate_uploads:
            if os.path.exists(up_dir) and os.path.isdir(up_dir):
                for root, _, files in os.walk(up_dir):
                    rel = os.path.relpath(root, up_dir)
                    dest_sub = os.path.join(temp_uploads_dir, rel) if rel != "." else temp_uploads_dir
                    os.makedirs(dest_sub, exist_ok=True)
                    for f in files:
                        src_f = os.path.join(root, f)
                        dst_f = os.path.join(dest_sub, f)
                        if not os.path.exists(dst_f):
                            shutil.copy2(src_f, dst_f)
                            total_upload_files += 1

        # Nếu chạy Docker, kiểm tra xem trong container /app/uploads có thêm file nào không
        if docker_running:
            try:
                container_up = os.path.join(temp_dir, "docker_uploads")
                res = subprocess.run(["docker", "cp", "olp_ai_kma_backend:/app/uploads", container_up], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
                if res.returncode == 0 and os.path.exists(container_up):
                    for root, _, files in os.walk(container_up):
                        rel = os.path.relpath(root, container_up)
                        dest_sub = os.path.join(temp_uploads_dir, rel) if rel != "." else temp_uploads_dir
                        os.makedirs(dest_sub, exist_ok=True)
                        for f in files:
                            src_f = os.path.join(root, f)
                            dst_f = os.path.join(dest_sub, f)
                            if not os.path.exists(dst_f):
                                shutil.copy2(src_f, dst_f)
                                total_upload_files += 1
            except Exception:
                pass

        print(f"    -> Đã thu thập {total_upload_files} tệp trong uploads (PDF đề bài, bài nộp).")
        
        # 4. Tạo metadata & Hướng dẫn phục hồi (README_RESTORE.txt)
        meta = {
            "created_at": datetime.now().isoformat(),
            "created_at_readable": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "db_source": db_source_info,
            "database_stats": db_stats,
            "total_upload_files": total_upload_files,
            "backup_filename": zip_filename
        }
        
        with open(os.path.join(temp_dir, "metadata.json"), "w", encoding="utf-8") as mf:
            json.dump(meta, mf, ensure_ascii=False, indent=2)
            
        restore_guide = f"""============================================================
HƯỚNG DẪN KHÔI PHỤC DỮ LIỆU TỪ BẢN SAO LƯU ({zip_filename})
Thời gian sao lưu: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}
Nguồn dữ liệu: {db_source_info}
============================================================

1. NẾU CHẠY CỤC BỘ (Không dùng Docker):
   - Giải nén file zip này.
   - Copy file 'olpai2026.db' vào thư mục gốc dự án (system_olpai2026/olpai2026.db).
   - Copy thư mục 'uploads' vào thư mục gốc dự án (system_olpai2026/uploads).
   - Khởi động lại uvicorn backend.

2. NẾU CHẠY BẰNG DOCKER:
   - Giải nén file zip này vào 1 thư mục tạm, ví dụ: 'restore_temp'
   - Chạy lệnh copy database vào container:
     docker cp restore_temp/olpai2026.db olp_ai_kma_backend:/app/data/olpai2026.db
   - Chạy lệnh copy uploads vào container:
     docker cp restore_temp/uploads/. olp_ai_kma_backend:/app/uploads/
   - Khởi động lại container backend nếu cần:
     docker restart olp_ai_kma_backend
============================================================
"""
        with open(os.path.join(temp_dir, "README_RESTORE.txt"), "w", encoding="utf-8") as rf:
            rf.write(restore_guide)

        # 5. Đóng gói file ZIP
        print(f"\n[*] Đang nén file zip ({zip_filename})...")
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        
        with zipfile.ZipFile(target_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Thêm DB
            if os.path.exists(temp_db_path):
                zipf.write(temp_db_path, arcname="olpai2026.db")
            # Thêm metadata và README
            zipf.write(os.path.join(temp_dir, "metadata.json"), arcname="metadata.json")
            zipf.write(os.path.join(temp_dir, "README_RESTORE.txt"), arcname="README_RESTORE.txt")
            
            # Thêm uploads
            for root, _, files in os.walk(temp_uploads_dir):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, temp_dir)
                    zipf.write(full_p, arcname=rel_p)
                    
    final_size_mb = os.path.getsize(target_zip_path) / (1024 * 1024)
    print("\n" + "=" * 60)
    print("           SAO LƯU DỮ LIỆU THÀNH CÔNG RỰC RỠ!           ")
    print("=" * 60)
    print(f"File zip:     {os.path.abspath(target_zip_path)}")
    print(f"Dung lượng:   {final_size_mb:.2f} MB")
    print(f"Database:     {db_stats.get('problems', 0)} bài thi | {db_stats.get('submissions', 0)} bài nộp | {db_stats.get('users', 0)} người dùng")
    print(f"Uploads:      {total_upload_files} tệp tin đính kèm")
    print("Trạng thái:   Hoàn toàn an toàn, không ảnh hưởng đến hệ thống đang chạy.")
    print("=" * 60)

if __name__ == "__main__":
    main()
