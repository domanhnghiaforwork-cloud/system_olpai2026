# OLP AI KMA 2026 - Nền Tảng Thi Olympic Trí Tuệ Nhân Tạo Học Viện Kỹ Thuật Mật Mã

Hệ thống thi đấu và chấm thi tự động dành cho cuộc thi cấp trường **Olympic Trí tuệ Nhân tạo (OLP AI KMA 2026)** tại Học viện Kỹ thuật Mật mã.

Hệ thống được thiết kế hiện đại với bộ nhận diện màu sắc: **Xanh nước biển (Chủ đạo)**, **Đỏ (Điểm nhấn KMA)** và **Trắng (Nền & Tương phản)**.

---

## 🏗 Kiến Trúc Hệ Thống

```
system_olpai2026/
├── backend/                  # Máy chủ API FastAPI & Cơ sở dữ liệu
│   ├── app/
│   │   ├── main.py           # Điểm khởi chạy FastAPI, cấu hình CORS, kết nối router
│   │   ├── database.py       # Cấu hình kết nối cơ sở dữ liệu SQLite
│   │   ├── models.py         # SQLAlchemy ORM (User, Problem, Dataset, Submission)
│   │   ├── schemas.py        # Pydantic schemas (Request / Response validation)
│   │   ├── seed_data.py      # Dữ liệu khởi tạo mẫu (Đề thi AI, Thí sinh KMA, Submissions)
│   │   └── routers/
│   │       ├── auth.py       # Lấy thông tin & chuyển đổi tác nhân (User / Admin)
│   │       ├── problems.py   # Danh sách đề bài & chi tiết đề thi
│   │       ├── leaderboard.py# Bảng xếp hạng điểm số cao nhất theo thời gian thực
│   │       ├── submissions.py# Cổng nhận file nộp dự đoán (CSV/ZIP) & chấm điểm
│   │       ├── datasets.py   # Kho tải dữ liệu Train / Public Test / Sample
│   │       └── admin.py      # Bảng điều khiển quản trị, tạo đề bài, thống kê hệ thống
│   ├── requirements.txt      # Thư viện Python (FastAPI, Uvicorn, SQLAlchemy, Pydantic)
│   ├── Dockerfile            # Đóng gói Docker cho Backend
│   └── .dockerignore
│
├── frontend/                 # Giao diện người dùng Next.js (App Router) + Tailwind CSS + Lucide Icons
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx    # Cấu trúc HTML, Meta SEO & Fonts
│   │   │   ├── page.tsx      # Trang ứng dụng chính điều phối các tab chức năng
│   │   │   └── globals.css   # Định nghĩa kiểu dáng và màu sắc chủ đạo
│   │   ├── components/
│   │   │   ├── Navbar.tsx    # Thanh điều hướng với bộ chuyển đổi tác nhân Admin / User
│   │   │   ├── Footer.tsx    # Chân trang thông tin Học viện Kỹ thuật Mật mã
│   │   │   └── tabs/
│   │   │       ├── HomeTab.tsx       # Trang chủ: Giới thiệu cuộc thi, thống kê, thể lệ
│   │   │       ├── ProblemsTab.tsx   # Danh sách & chi tiết các bài toán AI KMA
│   │   │       ├── LeaderboardTab.tsx# Bảng xếp hạng bục vinh danh (Top 1, 2, 3)
│   │   │       ├── SubmitTab.tsx     # Cổng nộp bài kéo thả file & lịch sử nộp
│   │   │       ├── DatasetsTab.tsx   # Kho tải tập dữ liệu Train / Test
│   │   │       └── AdminTab.tsx      # Quản trị viên: Thống kê & Thêm đề thi mới
│   │   ├── lib/
│   │   │   └── api.ts        # Client gọi API FastAPI backend
│   │   └── types/
│   │       └── index.ts      # TypeScript definitions cho toàn hệ thống
│   ├── Dockerfile            # Đóng gói Docker cho Frontend
│   └── .dockerignore
│
├── docker-compose.yml        # Tệp cấu hình Docker Compose triển khai cả hệ thống
└── README.md
```

---

## 👥 Hai Tác Nhân Chính (Actors)

1. **User (Thí sinh / Đội thi)**:
   - Xem thông tin cuộc thi và thể lệ tại **Trang chủ**.
   - Tra cứu chi tiết các đề bài tại **Đề bài** (Ví dụ: `AI-01: Nhận dạng tấn công mạng lưu lượng KMA`, `AI-02: NLP An toàn thông tin`, `AI-03: Tràn bộ đệm C/C++`).
   - Tải về tập dữ liệu Train, Test và Sample Submission tại **Dữ liệu**.
   - Kéo thả file dự đoán (`.csv`, `.zip`) để nộp bài tại **Nộp bài**.
   - Theo dõi thứ hạng điểm số thời gian thực trên **Bảng xếp hạng**.

2. **Admin (Ban Tổ Chức / Quản trị viên)**:
   - Menu quản trị xuất hiện trên thanh điều hướng khi ở vai trò Admin.
   - Bảng điều khiển xem tổng số thí sinh, số đề thi, tổng số lượt nộp bài.
   - Thêm bài toán thi mới vào hệ thống với form quản trị trực quan.
   - Giám sát toàn bộ nhật ký nộp bài của tất cả các đội thi trên toàn trường.

> **💡 Tính năng chuyển đổi nhanh tác nhân (Demo Mode)**: Trên góc phải thanh Navbar, bạn chỉ cần bấm vào avatar/tên người dùng để chọn chuyển đổi tức thời giữa tài khoản **Admin (Ban Tổ Chức)** và các đội **Thí sinh (AT18, AT19, K18)** để trải nghiệm giao diện của cả 2 tác nhân!

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Chạy bằng Docker & Docker Compose (Khuyên dùng)

Yêu cầu máy tính đã cài đặt [Docker Desktop](https://www.docker.com/).

```bash
# Khởi chạy toàn bộ hệ thống (Frontend + Backend + SQLite volume)
docker-compose up --build
# lệnh bản mới
docker compose up --build
```

- **Frontend Next.js**: Truy cập tại [http://localhost:3000](http://localhost:3000)
- **Backend FastAPI**: Truy cập tại [http://localhost:8000](http://localhost:8000)
- **Tài liệu Swagger API**: Truy cập tại [http://localhost:8000/docs](http://localhost:8000/docs)

Để dừng dịch vụ:
```bash
docker-compose down
```

---

### Cách 2: Chạy trực tiếp trên máy cục bộ (Local Development)

#### 1. Khởi động Backend (FastAPI + SQLite)
Mở một cửa sổ Terminal (PowerShell / Command Prompt):
```bash
# Kích hoạt môi trường ảo (nếu dùng Windows)
.\.venv\Scripts\activate

# Cài đặt thư viện phụ thuộc (nếu chưa cài)
pip install -r backend/requirements.txt

# Khởi chạy server Backend
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```
Backend sẽ tự động tạo cơ sở dữ liệu SQLite `olpai2026.db` và nạp sẵn dữ liệu mẫu (đề thi, thí sinh, bài nộp).

#### 2. Khởi động Frontend (Next.js)
Mở một cửa sổ Terminal thứ hai:
```bash
cd frontend

# Khởi chạy server phát triển
npm run dev
```
Truy cập trình duyệt tại địa chỉ: [http://localhost:3000](http://localhost:3000).

---

## Notebook huấn luyện Public / Private

Trong **Nộp bài → Điểm số cao nhất**, mỗi tab Public/Private hiển thị điểm của
tập đó và phần nộp notebook huấn luyện `.ipynb`. Mỗi tài khoản sinh viên có
một lượt nộp notebook cho mỗi tập của từng đề, độc lập với hạn mức CSV.
Notebook đã nhận không thể ghi đè; sinh viên có thể tải lại file của mình.
Đội nộp bài xem được điểm Private của chính mình trong kết quả chấm, lịch sử
và tab Private của thẻ điểm cao nhất. Đội khác không xem được bài/điểm này;
bảng xếp hạng Private vẫn chỉ dành cho Admin. Bảng tổng hợp chỉ cộng điểm Public.

Backend kiểm tra notebook Jupyter hợp lệ, UTF-8, tối đa 20 MiB và thời gian
mở đề/tập. File được lưu nguyên vẹn, không chạy mã trong notebook. Thư mục mặc
định là `uploads/training_notebooks`, có thể đổi bằng `TRAINING_NOTEBOOK_UPLOAD_DIR`.
API đăng nhập: `GET/POST /api/training-notebooks` và
`GET /api/training-notebooks/{id}/download`; Admin được liệt kê/tải notebook của
sinh viên. Ràng buộc database bảo đảm gửi đồng thời chỉ nhận một notebook.

Admin đặt lịch tại **Cấu hình lịch nộp Public / Private** trên cổng nộp bài.
Mỗi tập có trạng thái khóa và giờ mở riêng, áp dụng đồng thời cho CSV và notebook.
Thời gian nhập theo giờ Việt Nam và lưu UTC; hết đếm ngược thì tự mở cả hai.

Cài lại `backend/requirements.txt` và khởi động lại backend để tạo bảng
`training_notebooks` tự động. Nếu dùng Docker, rebuild backend và frontend;
file được giữ trong volume uploads hiện có.

## 🎨 Tông Màu & Ngôn Ngữ Thiết Kế
- **Xanh nước biển (Ocean Blue `#0284c7`, `#1d4ed8`, `#0f172a`)**: Đại diện cho công nghệ, trí tuệ nhân tạo và sự ổn định.
- **Đỏ KMA (`#dc2626`, `#b91c1c`)**: Màu cờ và thương hiệu truyền thống của Học viện Kỹ thuật Mật mã, dùng làm điểm nhấn cho các nút hành động, huy hiệu LIVE, và nút nộp bài.
- **Trắng (`#ffffff`, `#f8fafc`)**: Mang lại vẻ sáng sủa, tinh tế, sạch sẽ và hiện đại.
# Chạy production và hàng đợi chấm bài

Frontend Docker chạy bản Next.js standalone production. Backend và `submission-worker`
dùng cùng image; worker chấm ở hai tiến trình riêng, không giữ request API trong khi chấm.

- `POST /api/submissions` nhận thêm `client_request_id` (UUID), trả HTTP 202 và `submission_id`.
- `GET /api/submissions/{id}/status` theo dõi `QUEUED`, `PROCESSING`, `DONE`, `FAILED`.
- `GET /api/submissions/by-request/{uuid}` xác nhận một yêu cầu khi mất phản hồi.
- Gửi lại cùng UUID và nội dung trả đúng bài cũ; dùng lại UUID cho nội dung khác trả 409.
- Bài đang chờ giữ một lượt nộp; lỗi định dạng/chấm điểm giải phóng lượt đó. Điểm Private
  chỉ dành cho đội sở hữu bài và Admin; bảng xếp hạng Private chỉ dành cho Admin.
  Trình duyệt lưu mã yêu cầu theo tài khoản để khôi phục theo dõi.

`SUBMISSION_WORKER_CONCURRENCY` mặc định 2, hàng đợi tối đa 100 và file tối đa 95 MiB.
Các giới hạn có thể cấu hình bằng `SUBMISSION_MAX_QUEUE_SIZE`, `SUBMISSION_MAX_FILE_BYTES`.
Worker gia hạn lease và nhận lại bài bị gián đoạn sau khi tiến trình cũ mất kết nối.

Database dùng volume `backend_data`; tệp dùng volume `backend_uploads` để tránh I/O qua
bind mount Windows. Service `uploads-migrate` tự chép các tệp còn thiếu từ `backend/uploads`
vào volume trước khi backend chạy, giữ nguyên các tệp cũ và không ghi đè tệp đã có.
Sau chuyển đổi, tệp mới nằm trong Docker volume; thư mục host là nguồn dữ liệu cũ.
Sao lưu cần bao gồm cả hai volume. Xuất file qua giao diện hoặc `docker cp` từ `/app/uploads`.

Qua gateway, Nginx chuyển API trực tiếp đến backend, stream CSV và SSE. Frontend cũng
hỗ trợ API rewrite khi truy cập trực tiếp. URL/SSO chatbot được đọc qua `/runtime-config`,
nên chuyển chế độ local/public không cần build lại chỉ vì URL thay đổi.

Khởi động tích hợp sau khi sửa mã:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ../gateway_oplai2026/start.ps1 -Build -LocalOnly
```
