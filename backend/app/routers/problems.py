import os
import shutil
import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Problem, User
from ..schemas import ProblemResponse, ProblemCreate, ProblemUpdate, EvaluatorInfo
from ..pdf_utils import PDF_DIR, ensure_problem_pdf, generate_minimal_pdf, make_content_disposition, sanitize_filename
from ..auth_utils import get_current_user_optional, require_admin
from ..evaluators import list_available_evaluators

router = APIRouter(prefix="/api/problems", tags=["problems"])

def serialize_problem(p: Problem) -> ProblemResponse:
    # Ensure PDF exists on disk
    filename = ensure_problem_pdf(p.id, p.code, p.title, p.category, p.pdf_filename)
    if p.pdf_filename != filename:
        p.pdf_filename = filename

    raw_unlock = getattr(p, 'unlock_at', None)
    if raw_unlock is not None:
        if raw_unlock.tzinfo is None:
            raw_unlock = raw_unlock.replace(tzinfo=datetime.timezone.utc)
        else:
            raw_unlock = raw_unlock.astimezone(datetime.timezone.utc)

    raw_private_unlock = getattr(p, 'private_unlock_at', None)
    if raw_private_unlock is not None:
        if raw_private_unlock.tzinfo is None:
            raw_private_unlock = raw_private_unlock.replace(tzinfo=datetime.timezone.utc)
        else:
            raw_private_unlock = raw_private_unlock.astimezone(datetime.timezone.utc)

    return ProblemResponse(
        id=p.id,
        code=p.code,
        title=p.title,
        category=p.category or "CV",
        short_description=p.short_description,
        description=p.description,
        pdf_filename=filename,
        pdf_url=f"/api/problems/{p.id}/pdf",
        metric=p.metric,
        deadline=p.deadline,
        max_daily_submissions=p.max_daily_submissions,
        max_public_submissions=getattr(p, 'max_public_submissions', 5) or 5,
        max_private_submissions=getattr(p, 'max_private_submissions', 2) or 2,
        is_locked=bool(getattr(p, 'is_locked', False)),
        unlock_at=raw_unlock,
        private_is_locked=bool(getattr(p, 'private_is_locked', False)),
        private_unlock_at=raw_private_unlock,
        evaluation_config=getattr(p, 'evaluation_config', None),
        created_at=p.created_at
    )

@router.get("/evaluators", response_model=List[EvaluatorInfo])
def get_available_evaluators():
    """Lấy danh sách các module/loại đánh giá đang có sẵn trong hệ thống"""
    return list_available_evaluators()

@router.get("", response_model=List[ProblemResponse])
def list_problems(
    category: Optional[str] = None, # "CV" or "NLP"
    db: Session = Depends(get_db)
):
    query = db.query(Problem)
    if category and category.upper() in ["CV", "NLP"]:
        query = query.filter(Problem.category == category.upper())
    problems = query.order_by(Problem.id.asc()).all()
    return [serialize_problem(p) for p in problems]

@router.get("/{problem_id}", response_model=ProblemResponse)
def get_problem(problem_id: int, db: Session = Depends(get_db)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return serialize_problem(problem)

@router.get("/{problem_id}/pdf")
def view_problem_pdf(
    problem_id: int, 
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    # Access check: If problem is locked or in countdown, only Admin can access
    is_admin = bool(current_user and current_user.role == "admin")
    if not is_admin:
        now = datetime.datetime.utcnow()
        if problem.unlock_at:
            unlock_time = problem.unlock_at.replace(tzinfo=None) if hasattr(problem.unlock_at, 'tzinfo') and problem.unlock_at.tzinfo else problem.unlock_at
            if now < unlock_time:
                raise HTTPException(status_code=403, detail="Đề bài đang trong thời gian đếm ngược chưa mở.")
        elif getattr(problem, 'is_locked', False):
            raise HTTPException(status_code=403, detail="Đề bài đang bị khóa bởi Quản trị viên.")

    filename = ensure_problem_pdf(problem.id, problem.code, problem.title, problem.category, problem.pdf_filename)
    filepath = os.path.join(PDF_DIR, filename)
    content_disp = make_content_disposition("inline", filename)

    if not os.path.exists(filepath):
        pdf_data = generate_minimal_pdf(problem.title, problem.code, problem.category)
        return Response(
            content=pdf_data,
            media_type="application/pdf",
            headers={"Content-Disposition": content_disp}
        )

    return FileResponse(
        path=filepath,
        media_type="application/pdf",
        headers={"Content-Disposition": content_disp}
    )

@router.post("", response_model=ProblemResponse)
def create_problem(
    code: str = Form(...),
    title: str = Form(...),
    category: str = Form("CV"), # "CV" or "NLP"
    metric: str = Form("F1-Score"),
    deadline: str = Form("2026-11-30 23:59:59"),
    max_public_submissions: int = Form(5),
    max_private_submissions: int = Form(2),
    is_locked: bool = Form(False),
    unlock_at: Optional[str] = Form(None),
    private_is_locked: bool = Form(False),
    private_unlock_at: Optional[str] = Form(None),
    evaluation_config: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    if not code or not code.strip():
        raise HTTPException(status_code=400, detail="Mã đề bài là trường bắt buộc, không được để trống")

    clean_code = code.strip()
    clean_cat = "NLP" if category.strip().upper() == "NLP" else "CV"
    existing = db.query(Problem).filter(Problem.code == clean_code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mã đề bài '{clean_code}' đã tồn tại trên hệ thống")

    saved_filename = None
    if file and file.filename:
        clean_raw_name = sanitize_filename(file.filename, fallback_prefix="de_thi")
        safe_name = f"de_thi_{clean_code.lower()}_{clean_cat.lower()}_{clean_raw_name}"
        dest_path = os.path.join(PDF_DIR, safe_name)
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_filename = safe_name

    parsed_unlock_at = None
    if unlock_at and unlock_at.strip():
        try:
            parsed_unlock_at = datetime.datetime.fromisoformat(unlock_at.strip().replace("Z", "+00:00"))
            if parsed_unlock_at.tzinfo is not None:
                parsed_unlock_at = parsed_unlock_at.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except Exception:
            try:
                parsed_unlock_at = datetime.datetime.strptime(unlock_at.strip(), "%Y-%m-%d %H:%M:%S")
            except Exception:
                parsed_unlock_at = None

    parsed_private_unlock_at = None
    if private_unlock_at and private_unlock_at.strip():
        try:
            parsed_private_unlock_at = datetime.datetime.fromisoformat(private_unlock_at.strip().replace("Z", "+00:00"))
            if parsed_private_unlock_at.tzinfo is not None:
                parsed_private_unlock_at = parsed_private_unlock_at.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except Exception:
            try:
                parsed_private_unlock_at = datetime.datetime.strptime(private_unlock_at.strip(), "%Y-%m-%d %H:%M:%S")
            except Exception:
                parsed_private_unlock_at = None

    clean_eval_config = evaluation_config.strip() if evaluation_config and evaluation_config.strip() else None

    problem = Problem(
        code=code.strip(),
        title=title.strip(),
        category=clean_cat,
        metric=metric.strip(),
        deadline=deadline.strip(),
        max_public_submissions=max_public_submissions,
        max_private_submissions=max_private_submissions,
        is_locked=is_locked,
        unlock_at=parsed_unlock_at,
        private_is_locked=private_is_locked,
        private_unlock_at=parsed_private_unlock_at,
        evaluation_config=clean_eval_config,
        pdf_filename=saved_filename,
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)

    if not saved_filename:
        saved_filename = ensure_problem_pdf(problem.id, problem.code, problem.title, problem.category)
        problem.pdf_filename = saved_filename
        db.commit()

    return serialize_problem(problem)

@router.put("/{problem_id}", response_model=ProblemResponse)
def update_problem(
    problem_id: int,
    problem_in: ProblemUpdate,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    fields_set = problem_in.model_fields_set if hasattr(problem_in, "model_fields_set") else problem_in.__fields_set__

    if problem_in.title is not None:
        problem.title = problem_in.title.strip()
    if problem_in.category is not None:
        problem.category = "NLP" if problem_in.category.strip().upper() == "NLP" else "CV"
    if problem_in.code is not None:
        problem.code = problem_in.code.strip()
    if problem_in.metric is not None:
        problem.metric = problem_in.metric.strip()
    if problem_in.deadline is not None:
        problem.deadline = problem_in.deadline.strip()
    if problem_in.max_public_submissions is not None:
        problem.max_public_submissions = problem_in.max_public_submissions
    if problem_in.max_private_submissions is not None:
        problem.max_private_submissions = problem_in.max_private_submissions
    if "is_locked" in fields_set:
        problem.is_locked = bool(problem_in.is_locked)
    if "unlock_at" in fields_set:
        val = problem_in.unlock_at
        if val is not None and val.tzinfo is not None:
            val = val.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        problem.unlock_at = val
    if "private_is_locked" in fields_set:
        problem.private_is_locked = bool(problem_in.private_is_locked)
    if "private_unlock_at" in fields_set:
        val = problem_in.private_unlock_at
        if val is not None and val.tzinfo is not None:
            val = val.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        problem.private_unlock_at = val
    if "evaluation_config" in fields_set:
        problem.evaluation_config = (
            problem_in.evaluation_config.strip()
            if problem_in.evaluation_config and problem_in.evaluation_config.strip()
            else None
        )

    db.commit()
    db.refresh(problem)
    return serialize_problem(problem)

@router.post("/{problem_id}/upload-pdf", response_model=ProblemResponse)
def upload_problem_pdf(
    problem_id: int,
    file: UploadFile = File(...),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    clean_raw_name = sanitize_filename(file.filename, fallback_prefix="de_thi")
    safe_name = f"de_thi_{problem.code.lower()}_{problem.category.lower()}_{clean_raw_name}"
    dest_path = os.path.join(PDF_DIR, safe_name)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    problem.pdf_filename = safe_name
    db.commit()
    db.refresh(problem)
    return serialize_problem(problem)

@router.delete("/{problem_id}")
def delete_problem(
    problem_id: int, 
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    db.delete(problem)
    db.commit()
    return {"status": "success", "message": f"Đã xóa đề bài {problem.code}"}
