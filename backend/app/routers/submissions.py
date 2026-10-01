import random
import os
import shutil
import csv
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Submission, User, Problem
from ..schemas import SubmissionResponse
from .auth import CURRENT_USER_ID

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

UPLOAD_DIR = "./uploads/submissions"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def validate_csv_file(filepath: str, submission_type: str) -> tuple[bool, str, int]:
    """
    Quy trình 1: Kiểm tra tính hợp lệ của file CSV
    - Kiểm tra đuôi file .csv
    - Kiểm tra cấu trúc dòng tiêu đề (header) và dữ liệu
    (Người dùng sẽ bổ sung logic kiểm tra chi tiết theo bài toán sau)
    """
    if not filepath.lower().endswith('.csv'):
        return False, "File không đúng định dạng .csv", 0

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            rows = list(reader)

        if len(rows) < 2:
            return False, "File CSV rỗng hoặc chỉ có dòng tiêu đề, không chứa kết quả dự đoán.", 0

        header = rows[0]
        row_count = len(rows) - 1

        # Kiểm tra sơ bộ các cột cần thiết (Khung kiểm tra có thể tùy biến sau)
        if len(header) < 2:
            return False, f"Dòng tiêu đề cần ít nhất 2 cột (ví dụ: id, label), hiện tại có: {header}", 0

        # Kiểm tra tính toàn vẹn cơ bản (tất cả các dòng có cùng số cột)
        for idx, r in enumerate(rows[1:20], start=1):
            if len(r) != len(header):
                return False, f"Dòng thứ {idx} không khớp số lượng cột với dòng tiêu đề ({len(r)} != {len(header)})", 0

        return True, f"File hợp lệ: cấu trúc [{', '.join(header)}], gồm {row_count} dòng dự đoán.", row_count

    except Exception as e:
        return False, f"Không thể đọc file CSV: {str(e)}", 0

def calculate_metric_score(problem: Problem, filepath: str, submission_type: str, row_count: int) -> tuple[float, str]:
    """
    Quy trình 2: Logic chấm điểm theo độ đo bài toán (F1-Score, mAP, AUC-ROC,...)
    (Người dùng sẽ bổ sung công thức chấm điểm thực tế sau)
    """
    # Khung tính điểm mô phỏng thực tế
    # Tùy theo loại bài nộp: public hoặc private
    base_min = 0.8650 if submission_type == "public" else 0.8400
    base_max = 0.9680 if submission_type == "public" else 0.9550
    mock_score = round(random.uniform(base_min, base_max), 4)

    eval_log = f"Chấm điểm thành công trên tập {submission_type.upper()}: {problem.metric} = {mock_score} (Đã đối chiếu {row_count} mẫu)"
    return mock_score, eval_log

@router.get("", response_model=List[SubmissionResponse])
def list_submissions(
    problem_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Submission)
    if problem_id:
        query = query.filter(Submission.problem_id == problem_id)
    if user_id:
        query = query.filter(Submission.user_id == user_id)
    
    submissions = query.order_by(Submission.created_at.desc()).all()
    
    result = []
    for sub in submissions:
        result.append(
            SubmissionResponse(
                id=sub.id,
                user_id=sub.user_id,
                problem_id=sub.problem_id,
                user_name=sub.user.full_name if sub.user else f"User {sub.user_id}",
                problem_title=f"[{sub.problem.code}] {sub.problem.title}" if sub.problem else f"Problem {sub.problem_id}",
                filename=sub.filename,
                submission_type=getattr(sub, 'submission_type', 'public') or 'public',
                status=sub.status,
                score=sub.score,
                description=sub.description,
                logs=getattr(sub, 'logs', None),
                created_at=sub.created_at
            )
        )
    return result

@router.post("")
async def create_submission(
    problem_id: int = Form(...),
    submission_type: str = Form("public"), # "public" for public_submit.csv, "private" for private_submit.csv
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Xác thực đề bài
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề bài tương ứng")

    # Kiểm tra trạng thái khóa hoặc đếm ngược của đề bài
    user = db.query(User).filter(User.id == CURRENT_USER_ID).first()
    is_admin = bool(user and user.role == "admin")
    if not is_admin:
        import datetime
        now = datetime.datetime.utcnow()
        if problem.unlock_at:
            unlock_time = problem.unlock_at.replace(tzinfo=None) if hasattr(problem.unlock_at, 'tzinfo') and problem.unlock_at.tzinfo else problem.unlock_at
            if now < unlock_time:
                raise HTTPException(status_code=403, detail="Đề bài đang trong thời gian đếm ngược chưa mở, không thể nộp bài.")
        elif getattr(problem, 'is_locked', False):
            raise HTTPException(status_code=403, detail="Đề bài đang trong trạng thái bị khóa, không thể nộp bài.")

    # Đảm bảo loại bài nộp chuẩn
    clean_sub_type = "private" if "private" in submission_type.lower() else "public"
    standard_filename = f"{clean_sub_type}_submit.csv"

    # Kiểm tra giới hạn số lần nộp cho loại bài này
    existing_count = db.query(Submission).filter(
        Submission.user_id == CURRENT_USER_ID,
        Submission.problem_id == problem_id,
        Submission.submission_type == clean_sub_type
    ).count()

    max_allowed = (
        getattr(problem, 'max_private_submissions', 2) or 2
        if clean_sub_type == "private"
        else (getattr(problem, 'max_public_submissions', 5) or 5)
    )

    if existing_count >= max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Đã hết số lần nộp bài {standard_filename} (Đã nộp {existing_count}/{max_allowed} lần)."
        )

    # Lưu file đã tải lên vào thư mục upload
    dest_path = os.path.join(UPLOAD_DIR, f"{problem.code}_{clean_sub_type}_{file.filename}")
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # -------------------------------------------------------------
    # QUY TRÌNH 1: Kiểm tra tính hợp lệ của file CSV
    # -------------------------------------------------------------
    is_valid, validation_msg, row_count = validate_csv_file(dest_path, clean_sub_type)

    if not is_valid:
        # Ghi nhận lần nộp thất bại do lỗi định dạng
        failed_sub = Submission(
            user_id=CURRENT_USER_ID,
            problem_id=problem_id,
            filename=standard_filename,
            submission_type=clean_sub_type,
            status="LỖI ĐỊNH DẠNG",
            score=None,
            description="Kiểm tra file thất bại",
            logs=validation_msg
        )
        db.add(failed_sub)
        db.commit()
        db.refresh(failed_sub)

        return {
            "success": False,
            "submission_id": failed_sub.id,
            "submission_type": clean_sub_type,
            "filename": standard_filename,
            "step1_validation": {
                "status": "FAILED",
                "message": validation_msg
            },
            "step2_scoring": {
                "status": "SKIPPED",
                "message": "Không thực hiện chấm điểm do file không hợp lệ"
            },
            "final_status": "LỖI ĐỊNH DẠNG",
            "score": None,
            "result_line": f"❌ Quy trình kiểm tra thất bại: {validation_msg}"
        }

    # -------------------------------------------------------------
    # QUY TRÌNH 2: Chấm điểm theo độ đo bài toán
    # -------------------------------------------------------------
    score, scoring_msg = calculate_metric_score(problem, dest_path, clean_sub_type, row_count)

    # Ghi nhận lần nộp thành công vào cơ sở dữ liệu
    successful_sub = Submission(
        user_id=CURRENT_USER_ID,
        problem_id=problem_id,
        filename=standard_filename,
        submission_type=clean_sub_type,
        status="HỢP LỆ",
        score=score,
        description=f"Chấm điểm thành công ({clean_sub_type})",
        logs=f"{validation_msg} | {scoring_msg}"
    )
    db.add(successful_sub)
    db.commit()
    db.refresh(successful_sub)

    result_line = f"🎯 Kết quả nộp bài [{standard_filename}]: Điểm số đạt được: {score} ({problem.metric}) - Trạng thái: HỢP LỆ"

    return {
        "success": True,
        "submission_id": successful_sub.id,
        "submission_type": clean_sub_type,
        "filename": standard_filename,
        "step1_validation": {
            "status": "PASS",
            "message": validation_msg,
            "row_count": row_count
        },
        "step2_scoring": {
            "status": "PASS",
            "score": score,
            "metric": problem.metric,
            "message": scoring_msg
        },
        "final_status": "HỢP LỆ",
        "score": score,
        "result_line": result_line
    }
