import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from uuid import UUID, uuid4
from typing import List, Optional
from ..database import get_db
from ..models import Submission, SubmissionJob, User, Problem
from ..schemas import SubmissionResponse
from ..auth_utils import get_current_user
from ..submission_jobs import find_job, serialize_job, save_upload, enqueue_submission, validate_problem

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
    query = db.query(Submission).options(joinedload(Submission.user), joinedload(Submission.problem))
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

@router.get("/by-request/{client_request_id}")
def submission_by_request(
    client_request_id: UUID,
    current_user: User = Depends(get_current_user),
):
    job = find_job(current_user.id, str(client_request_id))
    if not job:
        raise HTTPException(404, "Chưa tìm thấy bài nộp cho yêu cầu này.")
    return serialize_job(job, current_user.role == "admin")


@router.get("/{submission_id}/status")
def submission_status(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(SubmissionJob).filter_by(submission_id=submission_id).first()
    if not job or (job.user_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(404, "Không tìm thấy bài nộp.")
    return serialize_job(job, current_user.role == "admin")


@router.post("", status_code=202)
def create_submission(
    problem_id: int = Form(...),
    submission_type: str = Form("public"),
    file: UploadFile = File(...),
    client_request_id: Optional[UUID] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if submission_type not in ("public", "private"):
        raise HTTPException(422, "Loại bài nộp phải là public hoặc private.")
    uid, is_admin = current_user.id, current_user.role == "admin"
    request_id = str(client_request_id or uuid4())
    # Replay must still work after the deadline/limit changes. New requests are
    # checked before copying, then checked again inside the atomic reservation.
    existing = db.query(SubmissionJob).filter_by(user_id=uid, client_request_id=request_id).first()
    if not existing:
        validate_problem(db.get(Problem, problem_id), submission_type, is_admin)
    # Release the authentication/read transaction before potentially slow I/O.
    db.rollback()
    path, digest = save_upload(file, uid, problem_id)
    return enqueue_submission(uid, problem_id, submission_type, request_id,
                              path, digest, file.filename, is_admin)
