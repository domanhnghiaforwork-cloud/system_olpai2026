"""Store students' notebooks; uploaded notebook code is never executed."""
import json
import os
from pathlib import Path
from typing import Literal, Optional
from uuid import uuid4

import nbformat
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth_utils import get_current_user
from ..database import get_db
from ..models import Problem, TrainingNotebook, User
from ..schemas import TrainingNotebookResponse
from ..submission_jobs import validate_problem

router = APIRouter(prefix="/api/training-notebooks", tags=["training-notebooks"])
MAX_NOTEBOOK_BYTES = 20 * 1024**2
NOTEBOOK_DIR = Path(os.getenv("TRAINING_NOTEBOOK_UPLOAD_DIR", "./uploads/training_notebooks"))


def response_for(notebook):
    return TrainingNotebookResponse(
        id=notebook.id, user_id=notebook.user_id, problem_id=notebook.problem_id,
        submission_type=notebook.submission_type, filename=notebook.filename,
        size_bytes=notebook.size_bytes, created_at=notebook.created_at,
        download_url=f"/api/training-notebooks/{notebook.id}/download",
    )


@router.get("", response_model=list[TrainingNotebookResponse])
def list_notebooks(
    problem_id: int,
    user_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(TrainingNotebook).filter_by(problem_id=problem_id)
    if current_user.role != "admin":
        query = query.filter_by(user_id=current_user.id)
    elif user_id is not None:
        query = query.filter_by(user_id=user_id)
    return [response_for(item) for item in query.order_by(TrainingNotebook.created_at.desc()).all()]


@router.post("", response_model=TrainingNotebookResponse, status_code=201)
def upload_notebook(
    problem_id: int = Form(...),
    submission_type: Literal["public", "private"] = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "user":
        raise HTTPException(403, "Chỉ tài khoản sinh viên được nộp notebook huấn luyện.")
    uid = current_user.id
    validate_problem(db.get(Problem, problem_id), submission_type, False)
    if db.query(TrainingNotebook).filter_by(
        user_id=uid, problem_id=problem_id, submission_type=submission_type
    ).first():
        raise HTTPException(409, "Bạn đã nộp notebook cho tập này. Mỗi tập chỉ được nộp một lần.")
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if not filename.lower().endswith(".ipynb") or len(filename) > 255:
        raise HTTPException(422, "Vui lòng nộp file huấn luyện có đuôi .ipynb (tên tối đa 255 ký tự).")
    # Release the read transaction during file parsing and I/O.
    db.rollback()
    data = file.file.read(MAX_NOTEBOOK_BYTES + 1)
    if len(data) > MAX_NOTEBOOK_BYTES:
        raise HTTPException(413, "Notebook vượt giới hạn 20 MB.")
    try:
        document = json.loads(data.decode("utf-8-sig"))
        if not isinstance(document, dict):
            raise ValueError("Notebook must be a JSON object")
        nbformat.validate(nbformat.from_dict(document))
    except (UnicodeDecodeError, ValueError, TypeError, AttributeError, nbformat.ValidationError) as error:
        raise HTTPException(422, "File không phải notebook Jupyter .ipynb hợp lệ.") from error

    NOTEBOOK_DIR.mkdir(parents=True, exist_ok=True)
    path = NOTEBOOK_DIR / f"{problem_id}_{uid}_{submission_type}_{uuid4().hex}.ipynb"
    committed = False
    try:
        path.write_bytes(data)
        # Lock/phase may have changed while uploading. The database constraint
        # ensures concurrent submissions still consume exactly one notebook slot.
        validate_problem(db.get(Problem, problem_id), submission_type, False)
        item = TrainingNotebook(user_id=uid, problem_id=problem_id, submission_type=submission_type,
                                filename=filename, stored_path=str(path), size_bytes=len(data))
        db.add(item)
        db.flush()
        result = response_for(item)
        db.commit()
        committed = True
        return result
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Bạn đã nộp notebook cho tập này. Mỗi tập chỉ được nộp một lần.") from error
    finally:
        if not committed:
            path.unlink(missing_ok=True)


@router.get("/{notebook_id}/download")
def download_notebook(
    notebook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(TrainingNotebook, notebook_id)
    if not item or (current_user.role != "admin" and item.user_id != current_user.id):
        raise HTTPException(404, "Không tìm thấy notebook.")
    path = Path(item.stored_path).resolve()
    if not path.is_relative_to(NOTEBOOK_DIR.resolve()) or not path.is_file():
        raise HTTPException(404, "File notebook không còn trên hệ thống.")
    return FileResponse(path, filename=item.filename, media_type="application/octet-stream")
