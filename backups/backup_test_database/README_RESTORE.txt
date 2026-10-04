====================================================
BẢN SAO LƯU DỮ LIỆU KIỂM THỬ (TEST ENVIRONMENT BACKUP)
Thời điểm sao lưu: 2026-10-04 15:39:44
====================================================

Thư mục này chứa:
1. olpai2026.db : Bản cơ sở dữ liệu SQLite test (15 người dùng, 4 đề thi, 4 datasets, 18 bài nộp)
2. backend_olpai2026.db : Bản phụ trong thư mục backend
3. uploads/ : Toàn bộ file PDF đề thi và file nộp CSV của các đội thi

CÁCH KHÔI PHỤC (RESTORE) LẠI BẢN TEST:
1. Tắt tạm thời server uvicorn (Ctrl + C ở terminal backend).
2. Copy đè file 'olpai2026.db' từ thư mục này ra thư mục gốc dự án:
   copy .\backups\backup_test_database\olpai2026.db .\olpai2026.db
3. (Tùy chọn) Khôi phục thư mục uploads:
   xcopy /E /I /Y .\backups\backup_test_database\uploads .\uploads
4. Khởi động lại uvicorn.
====================================================
