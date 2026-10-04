import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Dataset, Problem, User
from ..schemas import DatasetResponse, DatasetCreate, DatasetUpdate
from ..auth_utils import get_current_user_optional, require_admin

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

def serialize_dataset(d: Dataset, is_admin: bool = False, prob_locked: bool = False, item_locked: bool = False) -> DatasetResponse:
    url_to_show = d.download_url
    if not is_admin and (prob_locked or item_locked):
        url_to_show = ""

    raw_unlock = getattr(d, 'unlock_at', None)
    if raw_unlock is not None:
        if raw_unlock.tzinfo is None:
            raw_unlock = raw_unlock.replace(tzinfo=datetime.timezone.utc)
        else:
            raw_unlock = raw_unlock.astimezone(datetime.timezone.utc)

    return DatasetResponse(
        id=d.id,
        problem_id=d.problem_id,
        title=d.title,
        filename=d.filename,
        size_str=d.size_str,
        category=d.category,
        download_url=url_to_show,
        description=d.description,
        is_locked=bool(getattr(d, 'is_locked', False)),
        unlock_at=raw_unlock,
        created_at=d.created_at
    )

@router.get("", response_model=List[DatasetResponse])
def list_datasets(
    problem_id: Optional[int] = None, 
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Dataset)
    if problem_id:
        query = query.filter(Dataset.problem_id == problem_id)
    items = query.order_by(Dataset.id.asc()).all()

    is_admin = bool(current_user and current_user.role == "admin")
    now = datetime.datetime.utcnow()

    results = []
    for d in items:
        # Check problem lock / countdown
        prob = d.problem
        prob_locked = False
        if prob:
            if prob.unlock_at:
                prob_unlock = prob.unlock_at.replace(tzinfo=None) if prob.unlock_at.tzinfo else prob.unlock_at
                prob_locked = (now < prob_unlock)
            elif getattr(prob, 'is_locked', False):
                prob_locked = True

        # Check dataset lock / countdown
        item_locked = False
        if d.unlock_at:
            d_unlock = d.unlock_at.replace(tzinfo=None) if d.unlock_at.tzinfo else d.unlock_at
            item_locked = (now < d_unlock)
        elif getattr(d, 'is_locked', False):
            item_locked = True

        results.append(serialize_dataset(d, is_admin, prob_locked, item_locked))
    return results

@router.post("", response_model=DatasetResponse)
def create_dataset(
    item_in: DatasetCreate, 
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    problem = db.query(Problem).filter(Problem.id == item_in.problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề bài tương ứng")

    val = item_in.unlock_at
    if val is not None and val.tzinfo is not None:
        val = val.astimezone(datetime.timezone.utc).replace(tzinfo=None)

    dataset = Dataset(
        problem_id=item_in.problem_id,
        title=item_in.title.strip(),
        download_url=item_in.download_url.strip(),
        size_str=item_in.size_str.strip() if item_in.size_str else "",
        category=item_in.category or "train",
        filename=item_in.filename or "link",
        description=item_in.description,
        is_locked=bool(item_in.is_locked),
        unlock_at=val
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return serialize_dataset(dataset, is_admin=True)

@router.put("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: int, 
    item_in: DatasetUpdate, 
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục dữ liệu")

    fields_set = item_in.model_fields_set if hasattr(item_in, "model_fields_set") else item_in.__fields_set__

    if item_in.title is not None:
        dataset.title = item_in.title.strip()
    if item_in.download_url is not None:
        dataset.download_url = item_in.download_url.strip()
    if item_in.size_str is not None:
        dataset.size_str = item_in.size_str.strip()
    if item_in.category is not None:
        dataset.category = item_in.category.strip()
    if item_in.description is not None:
        dataset.description = item_in.description.strip()
    if "is_locked" in fields_set:
        dataset.is_locked = bool(item_in.is_locked)
    if "unlock_at" in fields_set:
        val = item_in.unlock_at
        if val is not None and val.tzinfo is not None:
            val = val.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        dataset.unlock_at = val

    db.commit()
    db.refresh(dataset)
    return serialize_dataset(dataset, is_admin=True)

@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: int, 
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục dữ liệu")
    db.delete(dataset)
    db.commit()
    return {"status": "success", "message": "Đã xóa mục dữ liệu thành công"}

from ..pdf_utils import make_content_disposition

@router.get("/download/{filename}")
def download_sample_dataset(filename: str):
    content = f"id,feature_1,feature_2,feature_3,label\n1,0.25,1.43,0.88,1\n2,0.12,0.55,0.21,0\n3,0.98,2.11,1.45,2\n"
    content_disp = make_content_disposition("attachment", filename)
    return PlainTextResponse(
        content,
        headers={"Content-Disposition": content_disp}
    )
