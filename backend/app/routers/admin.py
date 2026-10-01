from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Problem, Submission, Dataset

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/overview")
def get_admin_overview(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_problems = db.query(Problem).count()
    total_submissions = db.query(Submission).count()
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
