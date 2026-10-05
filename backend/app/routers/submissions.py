import os
import shutil
import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from ..database import get_db
from ..models import Submission, User, Problem
from ..schemas import SubmissionResponse
from ..auth_utils import get_current_user
from ..evaluators import get_evaluator

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

UPLOAD_DIR = "./uploads/submissions"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("", response_model=List[SubmissionResponse])
def list_submissions(
    problem_id: Optional[int] = None,
    user_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Submission)
    if problem_id:
        query = query.filter(Submission.problem_id == problem_id)
    
    # Phân quyền: Thí sinh thường chỉ được xem các bài nộp của chính mình!
    if current_user.role != "admin":
        query = query.filter(Submission.user_id == current_user.id)
    elif user_id:
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

        sub_type = getattr(sub, 'submission_type', 'public') or 'public'
        is_private = (sub_type == 'private')

        # Thí sinh thường: ẩn điểm private, ẩn đường dẫn lưu file, ẩn logs private
        score_to_show = sub.score
        stored_path_to_show = sub.stored_path
        logs_to_show = getattr(sub, 'logs', None)

        if current_user.role != "admin":
            stored_path_to_show = None
            if is_private:
                score_to_show = None
                logs_to_show = "Bài nộp Private đã được hệ thống ghi nhận và lưu trữ an toàn."

        download_url = f"/api/submissions/{sub.id}/download" if file_exists else None

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
                stored_path=stored_path_to_show,
                file_exists=file_exists,
                file_size_str=file_size_str,
                download_url=download_url,
                submission_type=sub_type,
                status=sub.status,
                score=score_to_show,
                description=sub.description,
                logs=logs_to_show,
                created_at=sub.created_at
            )
        )
    return result

@router.get("/{submission_id}/download")
def download_submission_file(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Tải về tệp CSV bài nộp của thí sinh.
    Chỉ cho phép chính thí sinh đó hoặc Quản trị viên (Admin) tải về.
    """
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài nộp")

    if current_user.role != "admin" and sub.user_id != current_user.id:
        raise HTTPException(
            status_code=403, 
            detail="Bạn không có quyền tải xuống tệp bài nộp này."
        )

    if sub.status in ["LỖI ĐỊNH DẠNG", "INVALID_FORMAT"] or not sub.stored_path:
        raise HTTPException(
            status_code=404,
            detail="Tệp CSV bài nộp không khả dụng do bài nộp đã bị hủy sau khi kiểm tra định dạng thất bại."
        )

    file_path = sub.stored_path
    if not file_path or not os.path.exists(file_path):
        # Fallback tìm kiếm trong thư mục upload nếu stored_path bị lệch
        if os.path.exists(UPLOAD_DIR):
            prob_code = (sub.problem.code if sub.problem else f"prob_{sub.problem_id}").replace(" ", "_")
            user_str = sub.user.username if sub.user and sub.user.username else f"user_{sub.user_id}"
            sub_type = sub.submission_type or "public"
            candidates = []
            for fname in os.listdir(UPLOAD_DIR):
                if fname.endswith(".csv") and prob_code in fname and sub_type in fname:
                    candidates.append((1 if user_str in fname else 0, os.path.join(UPLOAD_DIR, fname)))
            if candidates:
                candidates.sort(key=lambda item: (item[0], os.path.getmtime(item[1])), reverse=True)
                file_path = candidates[0][1]

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="Tệp CSV bài nộp không tồn tại hoặc đã bị xóa sau khi kiểm tra định dạng."
        )

    prob_code = (sub.problem.code if sub.problem else f"prob_{sub.problem_id}").replace(" ", "_")
    sub_type = sub.submission_type or "public"
    orig_name = sub.filename or f"{sub_type}_submit.csv"
    download_filename = f"{prob_code}_{sub_type}_{orig_name}"
    if not download_filename.endswith(".csv"):
        download_filename += ".csv"

    return FileResponse(
        path=file_path,
        filename=download_filename,
        media_type="text/csv"
    )

@router.post("")
async def create_submission(
    problem_id: int = Form(...),
    submission_type: str = Form("public"), # "public" for public_submit.csv, "private" for private_submit.csv
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
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
    current_uid = current_user.id
    user = current_user
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

    # Kiểm tra khóa / thời gian mở khóa riêng cho vòng Private
    if not is_admin and clean_sub_type == "private":
        now = datetime.datetime.utcnow()
        priv_unlock = getattr(problem, 'private_unlock_at', None)
        if priv_unlock:
            priv_unlock_time = priv_unlock.replace(tzinfo=None) if hasattr(priv_unlock, 'tzinfo') and priv_unlock.tzinfo else priv_unlock
            if now < priv_unlock_time:
                raise HTTPException(
                    status_code=403, 
                    detail="Khu vực nộp bài Private đang trong thời gian đếm ngược chưa mở khóa."
                )
        elif getattr(problem, 'private_is_locked', False):
            raise HTTPException(
                status_code=403, 
                detail="Khu vực nộp bài Private hiện đang bị khóa bởi Ban Tổ Chức."
            )

    # 5. Kiểm tra giới hạn số lần nộp cho loại bài này
    # QUY TẮC: Chỉ tính các bài nộp thành công / đã được chấm điểm (có điểm số và không bị lỗi).
    # Các lần bị lỗi ở Quy trình 1 (LỖI ĐỊNH DẠNG / chưa có điểm) sẽ KHÔNG bị trừ số lần nộp của thí sinh.
    if clean_sub_type == "private":
        type_filter = (Submission.submission_type == "private")
    else:
        type_filter = or_(Submission.submission_type == "public", Submission.submission_type.is_(None))

    existing_count = db.query(Submission).filter(
        Submission.user_id == current_uid,
        Submission.problem_id == problem_id,
        type_filter,
        Submission.status.notin_(["LỖI ĐỊNH DẠNG", "INVALID_FORMAT", "LỖI CHẤM ĐIỂM"]),
        Submission.score.isnot(None)
    ).count()

    max_allowed = (
        getattr(problem, 'max_private_submissions', 2) or 2
        if clean_sub_type == "private"
        else (getattr(problem, 'max_public_submissions', 5) or 5)
    )

    if existing_count >= max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Đã hết số lần nộp bài {standard_filename} (Đã nộp thành công {existing_count}/{max_allowed} lần)."
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
            "result_line": f"❌ Quy trình kiểm tra thất bại: {val_result.message} (Không bị trừ lượt nộp)"
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

    is_private = (clean_sub_type == "private")
    score_in_response = score if (not is_private or is_admin) else None
    result_line = (
        f"Điểm số đạt được: {score} ({metric_name})"
        if (not is_private or is_admin)
        else "✅ Bài nộp Private hợp lệ và đã được hệ thống ghi nhận thành công (Điểm số được bảo mật)."
    )

    scoring_step = {
        "status": "PASS",
        "score": score_in_response,
        "metric": metric_name,
        "message": (
            scoring_msg if (not is_private or is_admin)
            else "Đã chấm điểm và lưu trữ an toàn trên hệ thống. Điểm Private sẽ được giữ bí mật cho đến lễ tổng kết."
        ),
        "details": getattr(score_result, 'details', {}) if (not is_private or is_admin) else {}
    }

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
        "step2_scoring": scoring_step,
        "final_status": "HỢP LỆ",
        "score": score_in_response,
        "result_line": result_line
    }
