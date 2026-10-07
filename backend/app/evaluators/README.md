# Cấu hình evaluator

Các evaluator kế thừa `BaseEvaluator` và được đăng ký trong `registry.py`.
API `GET /api/problems/evaluators` trả về danh sách để chọn trong giao diện Admin.

## `eval_1_cv_hico`

Chấm CV HICO bằng mAP 600 classes. Đáp án ở `labels_eval_1/`.

## `eval_2_nlp_tung`

Chấm chuẩn hóa văn bản tiếng Việt, tích hợp từ
`tung_nlp/olp_26/de_thi_nlp_chuan_hoa/`:

- `nlp_tung/scorer.py`: bản sao **nguyên vẹn** của `scorer.py` gốc.
- `labels_eval_2/ground_truth.csv`: bản sao nguyên vẹn của
  `secret/ground_truth.csv` (5.000 public + 5.000 private). Chỉ dùng trong backend;
  không đưa vào dataset tải về hoặc thư mục phục vụ tệp tĩnh.
- `eval_2_nlp_tung.py`: adapter cho giao diện `BaseEvaluator`.

Cài `backend/requirements.txt`, khởi động lại API và submission worker (nếu dùng
Docker, rebuild cả hai). Trong Admin, tạo/sửa đề NLP và chọn cấu hình
`eval_2_nlp_tung`, đặt độ đo `SacreBLEU`. Backend hoạt động độc lập, không cần
project `tung_nlp` bên cạnh. Không tự đổi cấu hình đề đang có.

Có thể dùng đáp án bên ngoài bằng biến môi trường
`EVAL_2_NLP_TUNG_GROUND_TRUTH=/đường/dẫn/ground_truth.csv` cho cả API và worker.
Mặc định dùng đáp án đóng gói trong `labels_eval_2/`.

### Logic giữ nguyên

- Nội dung CSV UTF-8 (chấp nhận BOM), tối đa 20 MiB, đúng hai cột theo thứ tự
  `id,van_ban_chuan`. Không thêm quy tắc tên file của HICO vào NLP.
- `public` chấm `pub_`, `private` chấm `prv_`; adapter hỗ trợ cả `all` khi gọi
  trực tiếp. Bắt buộc đủ ID của phase trong đáp án. Có thể nộp chung hai tập.
- Header và ID được strip; khoảng trắng trong dự đoán được gộp bằng
  `" ".join(t.split())`. Không đổi chữ hoa/thường, dấu tiếng Việt, dấu câu.
- Kiểm tra thiếu/trùng/ID lạ, số cột, UTF-8, file rỗng theo đúng scorer gốc;
  giữ cả cách xử lý ID thuộc phase khác và giới hạn 20 thông báo lỗi.
- Điểm chính là SacreBLEU **thang 0–100**, `tokenize="13a"`, làm tròn 4 chữ số.
  CER và exact match làm tròn 5 chữ số; lưu đầy đủ kết quả gốc trong
  `step2_scoring.details` của submission job.
- Chọn bài tốt nhất, xếp hạng theo đề và xuất bài tốt nhất trong Admin:
  SacreBLEU giảm dần → CER tăng dần → exact match giảm dần → nộp sớm hơn.
  Bảng tổng hợp vẫn dùng quy tắc cộng điểm hiện có của hệ thống.
- Validation và evaluation dùng chung kết quả cache, phân biệt phase và phiên
  bản của cả bài nộp lẫn đáp án. Điểm không xuất hiện trong thông báo validation;
  điểm Private được trả cho đội sở hữu bài và Admin. Bảng xếp hạng Private
  chỉ dành cho Admin; các đội khác không truy cập được kết quả Private của đội nộp.

Phụ thuộc SacreBLEU và RapidFuzz được pin cùng phiên bản với
`tung_nlp/olp_26/contest_web/requirements.txt`.

### Kiểm tra

Từ thư mục project:

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Với Starlette mới dùng `httpx2` cho TestClient, cài thêm `httpx2` vào môi trường
chạy test; đây là phụ thuộc kiểm thử, không phải phụ thuộc của bộ chấm NLP.

`test_eval_2_nlp_tung.py` kiểm tra adapter, các trường hợp CSV, phase, cache và
đáp án thật. Nếu có project nguồn bên cạnh, test tự đối chiếu scorer, đáp án
và kết quả chấm với các fixture của nguồn. `test_submission_queue.py`
kiểm tra tích hợp worker, quyền xem private và quy tắc phá hòa của NLP.
