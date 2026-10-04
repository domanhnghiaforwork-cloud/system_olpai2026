# 📦 Hướng Dẫn Sao Lưu & Khôi Phục Dữ Liệu (OLP AI KMA 2026)

Thư mục này chứa công cụ tự động hóa việc **sao lưu (Backup)** và **khôi phục (Restore)** toàn bộ dữ liệu của hệ thống thi OLP AI KMA 2026, bao gồm:
1. **Cơ sở dữ liệu SQLite (`olpai2026.db`)**: Thông tin tài khoản, danh sách bài thi, dữ liệu chấm điểm, lịch sử bài nộp, bảng xếp hạng.
2. **Thư mục lưu trữ tệp tin (`uploads/`)**: Toàn bộ file PDF đề thi gốc (`uploads/problems/`) và mã nguồn/file CSV nộp bài của thí sinh (`uploads/submissions/`).

---

## 🛡️ Điểm Nổi Bật Về Độ An Toàn

* **Không làm gián đoạn hệ thống (Zero Downtime)**: Sử dụng **SQLite Online Backup API** ở chế độ chỉ đọc (`mode=ro`). Quá trình sao chép diễn ra ở mức từng trang nhớ (page-by-page replication), **tuyệt đối không khóa bảng** và không ảnh hưởng đến các thí sinh đang nộp bài.
* **Tự động nhận diện môi trường**:
  - Nếu đang chạy **Docker**: Tự động trích xuất an toàn từ Docker container `olp_ai_kma_backend` (volume `/app/data`).
  - Nếu đang chạy **Cục bộ (Native)**: Tự động tìm và sao lưu file `.db` cục bộ mới nhất.
* **Tự động gắn Metadata**: Mỗi file zip backup đều đi kèm file `metadata.json` chứa số lượng bài thi, số thí sinh, số bài nộp và thời điểm tạo.

---

## 🚀 Hướng Dẫn Tạo Bản Sao Lưu (Backup)

### 1. Trên Windows

**Cách 1: Click đúp chuột trực tiếp**
* Nhấp đúp vào file [`backup.bat`](backup.bat).
* Cửa sổ dòng lệnh sẽ hiện ra cho phép bạn gõ tên bản sao lưu (ví dụ: `vong_so_loai`), hoặc bấm **Enter** để tự động đặt tên theo thời gian thực (ví dụ: `backup_olpai2026_20261004_170012.zip`).

**Cách 2: Chạy qua PowerShell / CMD**
```bash
# Tự động hỏi tên
python backups/backup.py

# Hoặc truyền tên trực tiếp
python backups/backup.py truoc_gio_thi
```

---

### 2. Trên Linux / Ubuntu (Máy chủ chạy Docker)

Cấp quyền thực thi và chạy script:
```bash
# Cách 1: Chạy file bash
bash backups/backup.sh

# Cách 2: Chạy trực tiếp qua python
python3 backups/backup.py

# Truyền tên trực tiếp
python3 backups/backup.py ket_thuc_ngay_1
```

> **Kết quả:** File nén `.zip` hoàn chỉnh sẽ xuất hiện ngay trong thư mục `backups/`.

---

## 🔄 Hướng Dẫn Khôi Phục Dữ Liệu (Restore)

Khi cần khôi phục lại dữ liệu từ một bản sao lưu (ví dụ: `backup_vong_1.zip`):

### Trường hợp A: Hệ thống đang chạy bằng Docker

1. **Giải nén file backup** vào một thư mục tạm, ví dụ `temp_restore/`:
   ```bash
   unzip backups/backup_vong_1.zip -d temp_restore/
   ```

2. **Khôi phục Database vào Docker Volume**:
   ```bash
   docker cp temp_restore/olpai2026.db olp_ai_kma_backend:/app/data/olpai2026.db
   ```

3. **Khôi phục thư mục Uploads vào Container**:
   ```bash
   docker cp temp_restore/uploads/. olp_ai_kma_backend:/app/uploads/
   ```

4. **Khởi động lại backend để nhận dữ liệu mới**:
   ```bash
   docker restart olp_ai_kma_backend
   ```

5. **Dọn dẹp thư mục tạm**:
   ```bash
   rm -rf temp_restore/
   ```

---

### Trường hợp B: Hệ thống chạy trực tiếp trên máy (Không dùng Docker)

1. **Tạm dừng server backend** (Bấm `Ctrl + C` tại terminal chạy `uvicorn`).
2. **Giải nén file zip backup**.
3. **Copy đè file Database**:
   - Copy file `olpai2026.db` vào thư mục gốc `system_olpai2026/olpai2026.db`.
4. **Copy đè thư mục Uploads**:
   - Copy toàn bộ nội dung trong thư mục `uploads/` của bản backup vào `system_olpai2026/uploads/`.
5. **Khởi động lại backend**:
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
   ```

---