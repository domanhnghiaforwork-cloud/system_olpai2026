import os
import shutil
import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Submission, User, Problem
from ..schemas import SubmissionResponse
from .auth import get_current_user_id
from ..evaluators import get_evaluator

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

UPLOAD_DIR = "./uploads/submissions"
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
        file_exists = False
        file_size_str = None
        if sub.stored_path and os.path.exists(sub.stored_path):
            file_exists = True
            try:
                sz = os.path.getsize(sub.stored_path)
                if sz < 1024:
                    file_size_str = f"{sz} B"
                elif sz < 1024 * 1024:
                    file_size_str = f"{sz / 1024:.1f} KB"
                else:
                    file_size_str = f"{sz / (1024 * 1024):.1f} MB"
            except Exception:
                file_size_str = None

        result.append(
            SubmissionResponse(
                id=sub.id,
                user_id=sub.user_id,
                problem_id=sub.problem_id,
                user_name=sub.user.full_name if sub.user else f"User {sub.user_id}",
                username=sub.user.username if sub.user else None,
                team_name=sub.user.team_name if sub.user else None,
                problem_title=f"[{sub.problem.code}] {sub.problem.title}" if sub.problem else f"Problem {sub.problem_id}",
                problem_code=sub.problem.code if sub.problem else f"P-{sub.problem_id}",
                filename=sub.filename,
                stored_path=sub.stored_path,
                file_exists=file_exists,
                file_size_str=file_size_str,
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
    # 1. Xác thực đề bài
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề bài tương ứng")

    # 2. Kiểm tra cấu hình đánh giá: Chỉ những đề có cấu hình đánh giá mới được nộp
    eval_config_name = getattr(problem, 'evaluation_config', None)
    if not eval_config_name or not str(eval_config_name).strip():
        raise HTTPException(
            status_code=400,
            detail="Đề bài này chưa được quản trị viên thiết lập cấu hình đánh giá/chấm điểm."
        )

    evaluator = get_evaluator(str(eval_config_name).strip())
    if not evaluator:
        raise HTTPException(
            status_code=400,
            detail=f"Cấu hình đánh giá '{eval_config_name}' không tồn tại hoặc chưa được nạp trên hệ thống."
        )

    # 3. Kiểm tra trạng thái đăng nhập và quyền hạn
    current_uid = get_current_user_id()
    if not current_uid:
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập tài khoản để nộp bài thi.")
    user = db.query(User).filter(User.id == current_uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không hợp lệ hoặc đã bị vô hiệu hóa.")
    is_admin = bool(user.role == "admin")
    if not is_admin:
        now = datetime.datetime.utcnow()
        if problem.unlock_at:
            unlock_time = problem.unlock_at.replace(tzinfo=None) if hasattr(problem.unlock_at, 'tzinfo') and problem.unlock_at.tzinfo else problem.unlock_at
            if now < unlock_time:
                raise HTTPException(status_code=403, detail="Đề bài đang trong thời gian đếm ngược chưa mở, không thể nộp bài.")
        elif getattr(problem, 'is_locked', False):
            raise HTTPException(status_code=403, detail="Đề bài đang trong trạng thái bị khóa, không thể nộp bài.")

    # 4. Đảm bảo loại bài nộp chuẩn (public hoặc private)
    clean_sub_type = "private" if "private" in submission_type.lower() else "public"
    standard_filename = f"{clean_sub_type}_submit.csv"

    # 5. Kiểm tra giới hạn số lần nộp cho loại bài này
    existing_count = db.query(Submission).filter(
        Submission.user_id == current_uid,
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

    # 6. Lưu file đã tải lên vào thư mục upload với tên duy nhất (tránh xung đột ghi đè)
    user_str = user.username if user and user.username else f"user_{current_uid}"
    timestamp_str = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    prob_code_safe = (problem.code or f"prob_{problem.id}").replace(" ", "_")
    safe_filename = f"{prob_code_safe}_{user_str}_{clean_sub_type}_{timestamp_str}.csv"
    dest_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # -------------------------------------------------------------
    # QUY TRÌNH 1: Kiểm tra tính hợp lệ của file CSV qua Evaluator
    # -------------------------------------------------------------
    val_result = evaluator.validate(
        filepath=dest_path,
        submission_type=clean_sub_type,
        original_filename=file.filename
    )

    if not val_result.is_valid:
        # Xóa file tạm không hợp lệ để tránh rác hệ thống
        if os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except Exception:
                pass

        # Ghi nhận lần nộp thất bại do lỗi định dạng
        failed_sub = Submission(
            user_id=current_uid,
            problem_id=problem_id,
            filename=standard_filename,
            stored_path=None,
            submission_type=clean_sub_type,
            status="LỖI ĐỊNH DẠNG",
            score=None,
            description="Kiểm tra file thất bại",
            logs=val_result.message
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
                "message": val_result.message,
                "errors": val_result.errors,
                "row_count": val_result.row_count
            },
            "step2_scoring": {
                "status": "SKIPPED",
                "message": "Không thực hiện chấm điểm do dữ liệu kiểm tra không hợp lệ"
            },
            "final_status": "LỖI ĐỊNH DẠNG",
            "score": None,
            "result_line": f"❌ Quy trình kiểm tra thất bại: {val_result.message}"
        }

    # -------------------------------------------------------------
    # QUY TRÌNH 2: Chấm điểm thực tế qua Evaluator Plugin
    # -------------------------------------------------------------
    try:
        score_result = evaluator.evaluate(
            filepath=dest_path,
            submission_type=clean_sub_type
        )
        score = score_result.score
        scoring_msg = score_result.message
        metric_name = score_result.metric
    except Exception as e:
        # Xóa file nếu quá trình chấm điểm lỗi
        if os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except Exception:
                pass

        error_msg = f"Lỗi trong quá trình chấm điểm: {str(e)}"
        err_sub = Submission(
            user_id=current_uid,
            problem_id=problem_id,
            filename=standard_filename,
            stored_path=None,
            submission_type=clean_sub_type,
            status="LỖI CHẤM ĐIỂM",
            score=None,
            description="Lỗi thuật toán chấm điểm",
            logs=f"{val_result.message} | {error_msg}"
        )
        db.add(err_sub)
        db.commit()
        db.refresh(err_sub)

        return {
            "success": False,
            "submission_id": err_sub.id,
            "submission_type": clean_sub_type,
            "filename": standard_filename,
            "step1_validation": {
                "status": "PASS",
                "message": val_result.message,
                "row_count": val_result.row_count
            },
            "step2_scoring": {
                "status": "FAILED",
                "message": error_msg
            },
            "final_status": "LỖI CHẤM ĐIỂM",
            "score": None,
            "result_line": f"❌ Chấm điểm thất bại: {error_msg}"
        }

    # Ghi nhận lần nộp thành công vào cơ sở dữ liệu và lưu stored_path vĩnh viễn
    successful_sub = Submission(
        user_id=current_uid,
        problem_id=problem_id,
        filename=standard_filename,
        stored_path=dest_path,
        submission_type=clean_sub_type,
        status="HỢP LỆ",
        score=score,
        description=f"Chấm điểm thành công ({clean_sub_type})",
        logs=f"{val_result.message} | {scoring_msg}"
    )
    db.add(successful_sub)
    db.commit()
    db.refresh(successful_sub)

    result_line = f"Điểm số đạt được: {score} ({metric_name})"

    return {
        "success": True,
        "submission_id": successful_sub.id,
        "submission_type": clean_sub_type,
        "filename": standard_filename,
        "step1_validation": {
            "status": "PASS",
            "message": val_result.message,
            "row_count": val_result.row_count
        },
        "step2_scoring": {
            "status": "PASS",
            "score": score,
            "metric": metric_name,
            "message": scoring_msg,
            "details": getattr(score_result, 'details', {})
        },
        "final_status": "HỢP LỆ",
        "score": score,
        "result_line": result_line
    }
