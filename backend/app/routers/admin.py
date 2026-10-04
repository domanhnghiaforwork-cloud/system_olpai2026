import os
import io
import zipfile
import datetime
import secrets
import string
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Problem, Submission, Dataset
from ..schemas import AdminUserResponse, UserCreate, UserUpdate, UserBatchCreate
from ..auth_utils import require_admin
from ..pdf_utils import make_content_disposition

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


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
    submission_type: Optional[str] = None,
    mode: str = "all"
) -> List[Submission]:
    """
    Lấy danh sách các bài nộp hợp lệ theo bộ lọc:
    - mode = 'all': Tất cả các bài nộp hợp lệ
    - mode = 'best_per_user': Mỗi thí sinh chỉ lấy 1 bài có điểm cao nhất
    - submission_type: 'public' hoặc 'private'
    """
    query = db.query(Submission).filter(
        Submission.status.in_(["HỢP LỆ", "SUCCESS"]),
        Submission.score.isnot(None)
    )
    if problem_id:
        query = query.filter(Submission.problem_id == problem_id)
    if user_id:
        query = query.filter(Submission.user_id == user_id)
    if submission_type and submission_type in ["public", "private"]:
        query = query.filter(Submission.submission_type == submission_type)

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
    submission_type: Optional[str] = None, # "public" or "private"
    mode: str = Query("all"), # "all" or "best_per_user"
    db: Session = Depends(get_db)
):
    """
    Danh sách các bài nộp CSV hợp lệ của thí sinh.
    Hỗ trợ lọc theo:
    - Cuộc thi / Đề bài (problem_id)
    - Thí sinh (user_id)
    - Vòng thi (submission_type: 'public' hoặc 'private')
    - Chế độ: 'all' (tất cả bài nộp) hoặc 'best_per_user' (mỗi thí sinh 1 bài điểm cao nhất)
    """
    subs = get_valid_submissions(
        db, 
        problem_id=problem_id, 
        user_id=user_id, 
        submission_type=submission_type, 
        mode=mode
    )
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
    submission_type: Optional[str] = None, # "public" or "private"
    mode: str = Query("all"), # "all" or "best_per_user"
    db: Session = Depends(get_db)
):
    """
    Nén và tải về file ZIP chứa các file CSV bài nộp hợp lệ:
    - Theo cuộc thi (problem_id)
    - Theo thí sinh (user_id)
    - Theo vòng thi (submission_type: 'public' hoặc 'private')
    - Theo cuộc thi nhưng mỗi thí sinh lấy 1 bài điểm cao nhất (mode='best_per_user')
    """
    submissions = get_valid_submissions(
        db, 
        problem_id=problem_id, 
        user_id=user_id, 
        submission_type=submission_type, 
        mode=mode
    )
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
                arcname = f"best_top{idx:02d}_{username}_{prob_code}_{sub_type}_{score_str}.csv"
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
    type_suffix = f"_{submission_type}" if submission_type else ""
    if mode == "best_per_user" and problem_id:
        prob = db.query(Problem).filter(Problem.id == problem_id).first()
        code_str = prob.code if prob else f"Problem_{problem_id}"
        zip_filename = f"best_submissions_{code_str}{type_suffix}.zip"
    elif mode == "best_per_user":
        zip_filename = f"best_submissions_all_contests{type_suffix}.zip"
    elif problem_id:
        prob = db.query(Problem).filter(Problem.id == problem_id).first()
        code_str = prob.code if prob else f"Problem_{problem_id}"
        zip_filename = f"all_submissions_{code_str}{type_suffix}.zip"
    elif user_id:
        user = db.query(User).filter(User.id == user_id).first()
        user_str = user.username if user else f"User_{user_id}"
        zip_filename = f"submissions_{user_str}{type_suffix}.zip"
    else:
        ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"valid_submissions{type_suffix}_{ts}.zip"

    content_disp = make_content_disposition("attachment", zip_filename)
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": content_disp,
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# --------------------------------------------------------------------------
# Quản lý tài khoản thí sinh & đội thi (Account Management)
# --------------------------------------------------------------------------

def generate_random_password(length: int = 8) -> str:
    """
    Sinh chuỗi mật khẩu ngẫu nhiên an toàn, dễ đọc cho thí sinh:
    Bao gồm chữ hoa, chữ thường, chữ số và ký tự an toàn.
    Loại bỏ các ký tự dễ gây nhầm lẫn thị giác như: (I, O, l, o, 0, 1).
    """
    length = max(6, min(length, 32))
    uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ" # loại I, O
    lowercase = "abcdefghijkmnpqrstuvwxyz" # loại l, o
    digits = "23456789" # loại 0, 1
    specials = "@#$%&*"
    all_chars = uppercase + lowercase + digits + specials

    password = [
        secrets.choice(uppercase),
        secrets.choice(lowercase),
        secrets.choice(digits),
        secrets.choice(specials),
    ]
    for _ in range(length - 4):
        password.append(secrets.choice(all_chars))
    
    secrets.SystemRandom().shuffle(password)
    return "".join(password)

@router.get("/users", response_model=List[AdminUserResponse])
def get_admin_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách tất cả tài khoản người dùng / đội thi,
    kèm mật khẩu dự thi và số lượng bài nộp.
    """
    query = db.query(User)
    if role and role in ["user", "admin"]:
        query = query.filter(User.role == role)
    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            (User.username.ilike(search_term)) |
            (User.full_name.ilike(search_term)) |
            (User.team_name.ilike(search_term)) |
            (User.email.ilike(search_term))
        )

    users = query.order_by(User.id.asc()).all()
    result = []
    for u in users:
        sub_count = db.query(Submission).filter(Submission.user_id == u.id).count()
        result.append(
            AdminUserResponse(
                id=u.id,
                username=u.username,
                full_name=u.full_name,
                email=u.email,
                role=u.role,
                team_name=u.team_name,
                password=u.password,
                created_at=u.created_at,
                submissions_count=sub_count
            )
        )
    return result

@router.post("/users", response_model=AdminUserResponse)
def create_admin_user(data: UserCreate, db: Session = Depends(get_db)):
    """
    Tạo 1 tài khoản mới đơn lẻ (admin hoặc thí sinh).
    Nếu mật khẩu không nhập, hệ thống sẽ tự sinh ngẫu nhiên.
    """
    uname = data.username.strip()
    if not uname:
        raise HTTPException(status_code=400, detail="Tên đăng nhập không được để trống")

    if db.query(User).filter(User.username == uname).first():
        raise HTTPException(status_code=400, detail=f"Tên đăng nhập '{uname}' đã tồn tại")

    email = data.email.strip() if data.email else f"{uname}@olpai.kma.edu.vn"
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail=f"Email '{email}' đã được sử dụng")

    pwd = data.password.strip() if data.password and data.password.strip() else generate_random_password(8)
    fname = data.full_name.strip() if data.full_name and data.full_name.strip() else uname
    tname = data.team_name.strip() if data.team_name and data.team_name.strip() else fname

    new_user = User(
        username=uname,
        password=pwd,
        full_name=fname,
        email=email,
        role=data.role or "user",
        team_name=tname,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return AdminUserResponse(
        id=new_user.id,
        username=new_user.username,
        full_name=new_user.full_name,
        email=new_user.email,
        role=new_user.role,
        team_name=new_user.team_name,
        password=new_user.password,
        created_at=new_user.created_at,
        submissions_count=0
    )

@router.post("/users/batch")
def batch_create_admin_users(data: UserBatchCreate, db: Session = Depends(get_db)):
    """
    Tạo hàng loạt tài khoản tự động tăng dần (VD: doi_thi_01, doi_thi_02, ...),
    mỗi tài khoản được sinh một mật khẩu ngẫu nhiên hoặc dùng mật khẩu chung.
    """
    count = max(1, min(data.count, 200))
    prefix = (data.prefix or "doi_thi_").strip()
    start_idx = max(1, data.start_index)
    padding = max(1, min(data.padding_digits, 5))
    team_prefix = (data.team_prefix or "Đội thi").strip()
    email_domain = (data.email_domain or "olpai.kma.edu.vn").strip().lstrip("@")
    pwd_len = max(6, min(data.password_length, 32))
    custom_pwd = data.custom_password.strip() if data.custom_password and data.custom_password.strip() else None

    created_users = []
    skipped_users = []

    curr_idx = start_idx
    added_count = 0

    # Chạy vòng lặp đến khi tạo đủ số lượng yêu cầu hoặc duyệt tối đa 1000 lượt
    max_loops = count * 5
    loop_count = 0

    while added_count < count and loop_count < max_loops:
        loop_count += 1
        num_str = f"{curr_idx:0{padding}d}"
        uname = f"{prefix}{num_str}"
        curr_email = f"{uname}@{email_domain}"

        # Kiểm tra trùng tên hoặc email
        if db.query(User).filter((User.username == uname) | (User.email == curr_email)).first():
            skipped_users.append(uname)
            curr_idx += 1
            continue

        pwd = custom_pwd if custom_pwd else generate_random_password(pwd_len)
        fname = f"{team_prefix} {num_str}"
        tname = f"{team_prefix} {num_str}"

        u = User(
            username=uname,
            password=pwd,
            full_name=fname,
            email=curr_email,
            role=data.role or "user",
            team_name=tname,
            created_at=datetime.datetime.utcnow()
        )
        db.add(u)
        db.flush()

        created_users.append({
            "id": u.id,
            "username": u.username,
            "password": u.password,
            "full_name": u.full_name,
            "team_name": u.team_name,
            "email": u.email,
            "role": u.role,
            "created_at": u.created_at.isoformat()
        })
        added_count += 1
        curr_idx += 1

    db.commit()

    return {
        "success": True,
        "created_count": len(created_users),
        "skipped_count": len(skipped_users),
        "skipped_usernames": skipped_users,
        "users": created_users
    }

@router.put("/users/{user_id}", response_model=AdminUserResponse)
def update_admin_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    """
    Cập nhật thông tin hoặc mật khẩu của tài khoản.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    if data.full_name is not None and data.full_name.strip():
        user.full_name = data.full_name.strip()
    if data.team_name is not None:
        user.team_name = data.team_name.strip()
    if data.email is not None and data.email.strip():
        email = data.email.strip()
        existing = db.query(User).filter(User.email == email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Email '{email}' đã được sử dụng bởi người dùng khác")
        user.email = email
    if data.role is not None and data.role in ["user", "admin"]:
        user.role = data.role
    if data.password is not None and data.password.strip():
        user.password = data.password.strip()

    db.commit()
    db.refresh(user)

    sub_count = db.query(Submission).filter(Submission.user_id == user.id).count()
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        team_name=user.team_name,
        password=user.password,
        created_at=user.created_at,
        submissions_count=sub_count
    )

@router.delete("/users/{user_id}")
def delete_admin_user(user_id: int, db: Session = Depends(get_db)):
    """
    Xóa tài khoản thí sinh và toàn bộ bài nộp liên quan.
    Bảo vệ không cho phép xóa tài khoản admin mặc định.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản Quản trị viên mặc định ('admin')")

    # Xóa các bài nộp liên quan của thí sinh
    db.query(Submission).filter(Submission.user_id == user.id).delete()
    db.delete(user)
    db.commit()

    return {"success": True, "detail": f"Đã xóa tài khoản '{user.username}' thành công"}

@router.post("/users/{user_id}/reset-password")
def reset_admin_user_password(
    user_id: int, 
    length: int = Query(8, ge=6, le=32),
    db: Session = Depends(get_db)
):
    """
    Sinh ngẫu nhiên mật khẩu mới cho tài khoản.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    new_pwd = generate_random_password(length)
    user.password = new_pwd
    db.commit()

    return {
        "success": True, 
        "username": user.username, 
        "new_password": new_pwd,
        "detail": f"Đã đặt lại mật khẩu mới cho tài khoản '{user.username}'"
    }

@router.get("/users/export-txt")
def export_users_txt(
    role: Optional[str] = "user",
    db: Session = Depends(get_db)
):
    """
    Tải về danh sách tài khoản thí sinh và mật khẩu dưới dạng file TXT đơn giản.
    Định dạng:
    Thời gian xuất : 02/10/2026 11:16:59
    Tổng số tài khoản: 15
    Danh sách tài khoản:
    doi_thi_01
    NtkmRU4#
    doi_thi_02
    NtkmRU4#
    """
    query = db.query(User).order_by(User.id.asc())
    # Mặc định chỉ lấy danh sách của thí sinh (role == 'user')
    target_role = role if role in ["user", "admin"] else "user"
    users = query.filter(User.role == target_role).all()

    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    lines = [
        f"Thời gian xuất : {now_str}",
        f"Tổng số tài khoản: {len(users)}",
        "Danh sách tài khoản:"
    ]

    for u in users:
        pwd = u.password or ""
        lines.append(u.username)
        lines.append(pwd)

    content_str = "\n".join(lines)
    filename = f"danh_sach_thi_sinh_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    content_disp = make_content_disposition("attachment", filename)

    return Response(
        content=content_str.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": content_disp,
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

