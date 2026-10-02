import os
import io
import zipfile
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Problem, Submission, Dataset

router = APIRouter(prefix="/api/admin", tags=["admin"])

def resolve_stored_path(sub: Submission) -> Optional[str]:
    """Tìm đường dẫn file nộp đã lưu trên đĩa máy chủ."""
    if sub.stored_path and os.path.exists(sub.stored_path):
        return sub.stored_path
    
    upload_dir = "./uploads/submissions"
    if not os.path.exists(upload_dir):
        return None
        
    prob_code = sub.problem.code if sub.problem else ""
    user_name = sub.user.username if sub.user else ""
    sub_type = sub.submission_type or "public"
    
    candidates = []
    try:
        for fname in os.listdir(upload_dir):
            if not fname.endswith(".csv"):
                continue
            # Match problem code and submission type
            if prob_code and prob_code in fname and sub_type in fname:
                # If username is also present, higher priority
                candidates.append((1 if user_name and user_name in fname else 0, os.path.join(upload_dir, fname)))
    except Exception:
        pass
        
    if candidates:
        # Sort by user_name match first, then by mtime descending
        candidates.sort(key=lambda item: (item[0], os.path.getmtime(item[1])), reverse=True)
        return candidates[0][1]
        
    return None

def get_valid_submissions(
    db: Session,
    problem_id: Optional[int] = None,
    user_id: Optional[int] = None,
    mode: str = "all"
) -> List[Submission]:
    """
    Lấy danh sách các bài nộp hợp lệ theo bộ lọc:
    - mode = 'all': Tất cả các bài nộp hợp lệ
    - mode = 'best_per_user': Mỗi thí sinh chỉ lấy 1 bài có điểm cao nhất
    """
    query = db.query(Submission).filter(
        Submission.status.in_(["HỢP LỆ", "SUCCESS"]),
        Submission.score.isnot(None)
    )
    if problem_id:
        query = query.filter(Submission.problem_id == problem_id)
    if user_id:
        query = query.filter(Submission.user_id == user_id)

    all_subs = query.order_by(Submission.score.desc(), Submission.created_at.desc()).all()

    if mode == "best_per_user":
        best_subs = {}
        for sub in all_subs:
            key = (sub.user_id, sub.problem_id)
            if key not in best_subs:
                best_subs[key] = sub
        # Sắp xếp danh sách điểm cao nhất theo điểm giảm dần
        return sorted(
            best_subs.values(),
            key=lambda s: (s.score if s.score is not None else -1, s.created_at or datetime.datetime.min),
            reverse=True
        )
    else:
        # Sắp xếp theo thời gian nộp mới nhất
        return sorted(
            all_subs,
            key=lambda s: s.created_at or datetime.datetime.min,
            reverse=True
        )

@router.get("/overview")
def get_admin_overview(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_problems = db.query(Problem).count()
    total_submissions = db.query(Submission).count()
    valid_submissions = db.query(Submission).filter(
        Submission.status.in_(["HỢP LỆ", "SUCCESS"]),
        Submission.score.isnot(None)
    ).count()
    total_datasets = db.query(Dataset).count()

    recent_submissions = (
        db.query(Submission)
        .order_by(Submission.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "stats": {
            "total_users": total_users,
            "total_problems": total_problems,
            "total_submissions": total_submissions,
            "valid_submissions": valid_submissions,
            "total_datasets": total_datasets,
            "system_status": "ONLINE",
            "evaluator_engine": "READY (Python 3.11 Worker Pool)"
        },
        "recent_submissions": [
            {
                "id": s.id,
                "user": s.user.full_name if s.user else "Unknown",
                "problem": s.problem.code if s.problem else "Unknown",
                "score": s.score,
                "status": s.status,
                "time": s.created_at
            }
            for s in recent_submissions
        ]
    }

@router.get("/submissions/valid")
def list_valid_submissions(
    problem_id: Optional[int] = None,
    user_id: Optional[int] = None,
    mode: str = Query("all"), # "all" or "best_per_user"
    db: Session = Depends(get_db)
):
    """
    Danh sách các bài nộp CSV hợp lệ của thí sinh.
    Hỗ trợ lọc theo:
    - Cuộc thi / Đề bài (problem_id)
    - Thí sinh (user_id)
    - Chế độ: 'all' (tất cả bài nộp) hoặc 'best_per_user' (mỗi thí sinh 1 bài điểm cao nhất)
    """
    subs = get_valid_submissions(db, problem_id=problem_id, user_id=user_id, mode=mode)
    result = []
    
    for idx, s in enumerate(subs, start=1):
        fpath = resolve_stored_path(s)
        file_exists = bool(fpath and os.path.exists(fpath))
        file_size_str = None
        if file_exists:
            try:
                sz = os.path.getsize(fpath)
                if sz < 1024:
                    file_size_str = f"{sz} B"
                elif sz < 1024 * 1024:
                    file_size_str = f"{sz / 1024:.1f} KB"
                else:
                    file_size_str = f"{sz / (1024 * 1024):.1f} MB"
            except Exception:
                file_size_str = None

        result.append({
            "id": s.id,
            "rank": idx if mode == "best_per_user" else None,
            "user_id": s.user_id,
            "username": s.user.username if s.user else f"user_{s.user_id}",
            "user_name": s.user.full_name if s.user else f"User {s.user_id}",
            "team_name": s.user.team_name if s.user else "KMA AI Team",
            "problem_id": s.problem_id,
            "problem_code": s.problem.code if s.problem else f"P-{s.problem_id}",
            "problem_title": s.problem.title if s.problem else f"Problem {s.problem_id}",
            "filename": s.filename,
            "submission_type": s.submission_type or "public",
            "status": s.status,
            "score": s.score,
            "stored_path": fpath,
            "file_exists": file_exists,
            "file_size_str": file_size_str,
            "description": s.description,
            "logs": s.logs,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "download_url": f"/api/admin/submissions/{s.id}/download"
        })
    return result

@router.get("/submissions/{submission_id}/download")
def download_submission_file(
    submission_id: int,
    db: Session = Depends(get_db)
):
    """
    Tải về 1 file CSV bài nộp cụ thể của thí sinh.
    """
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi bài nộp")

    file_path = resolve_stored_path(sub)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"File bài nộp '{sub.filename}' không còn tồn tại trên bộ nhớ máy chủ"
        )

    prob_code = (sub.problem.code if sub.problem else f"prob_{sub.problem_id}").replace(" ", "_")
    username = (sub.user.username if sub.user else f"user_{sub.user_id}").replace(" ", "_")
    sub_type = sub.submission_type or "public"
    score_str = f"score_{sub.score:.4f}" if sub.score is not None else "no_score"
    
    download_filename = f"{prob_code}_{username}_{sub_type}_{score_str}_id{sub.id}.csv"

    return FileResponse(
        path=file_path,
        filename=download_filename,
        media_type="text/csv"
    )

@router.get("/submissions/export-zip")
def export_submissions_zip(
    problem_id: Optional[int] = None,
    user_id: Optional[int] = None,
    mode: str = Query("all"), # "all" or "best_per_user"
    db: Session = Depends(get_db)
):
    """
    Nén và tải về file ZIP chứa các file CSV bài nộp hợp lệ:
    - Theo cuộc thi (problem_id)
    - Theo thí sinh (user_id)
    - Theo cuộc thi nhưng mỗi thí sinh lấy 1 bài điểm cao nhất (mode='best_per_user')
    """
    submissions = get_valid_submissions(db, problem_id=problem_id, user_id=user_id, mode=mode)
    if not submissions:
        raise HTTPException(status_code=404, detail="Không có bài nộp hợp lệ nào phù hợp với điều kiện lọc để xuất ZIP")

    zip_buffer = io.BytesIO()
    files_added_count = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zip_file:
        for idx, sub in enumerate(submissions, start=1):
            file_path = resolve_stored_path(sub)
            if not file_path or not os.path.exists(file_path):
                continue
            
            prob_code = (sub.problem.code if sub.problem else f"P{sub.problem_id}").replace(" ", "_")
            username = (sub.user.username if sub.user else f"user{sub.user_id}").replace(" ", "_")
            score_str = f"{sub.score:.4f}" if sub.score is not None else "0.0000"
            sub_type = sub.submission_type or "public"

            if mode == "best_per_user":
                arcname = f"best_top{idx:02d}_{username}_{prob_code}_{score_str}.csv"
            elif problem_id:
                arcname = f"{username}_{sub_type}_{score_str}_id{sub.id}.csv"
            elif user_id:
                arcname = f"{prob_code}_{sub_type}_{score_str}_id{sub.id}.csv"
            else:
                arcname = f"{prob_code}/{username}_{sub_type}_{score_str}_id{sub.id}.csv"

            zip_file.write(file_path, arcname=arcname)
            files_added_count += 1

    if files_added_count == 0:
        raise HTTPException(status_code=404, detail="Các file CSV bài nộp được chọn hiện không tồn tại trên bộ nhớ máy chủ")

    zip_buffer.seek(0)

    # Đặt tên file ZIP rõ ràng theo ngữ cảnh
    if mode == "best_per_user" and problem_id:
        prob = db.query(Problem).filter(Problem.id == problem_id).first()
        code_str = prob.code if prob else f"Problem_{problem_id}"
        zip_filename = f"best_submissions_{code_str}.zip"
    elif mode == "best_per_user":
        zip_filename = "best_submissions_all_contests.zip"
    elif problem_id:
        prob = db.query(Problem).filter(Problem.id == problem_id).first()
        code_str = prob.code if prob else f"Problem_{problem_id}"
        zip_filename = f"all_submissions_{code_str}.zip"
    elif user_id:
        user = db.query(User).filter(User.id == user_id).first()
        user_str = user.username if user else f"User_{user_id}"
        zip_filename = f"submissions_{user_str}.zip"
    else:
        ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"valid_submissions_{ts}.zip"

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
