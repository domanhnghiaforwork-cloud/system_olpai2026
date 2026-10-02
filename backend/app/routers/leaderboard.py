from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from ..database import get_db
from ..models import Submission, User, Problem
from ..schemas import LeaderboardItem
from .auth import get_current_user_id

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

@router.get("", response_model=List[LeaderboardItem])
def get_leaderboard(
    problem_code: Optional[str] = Query(None, description="Mã đề bài, ví dụ CV-01"),
    type: str = Query("public", description="Loại bảng xếp hạng: 'public' hoặc 'private'"),
    db: Session = Depends(get_db)
):
    clean_type = "private" if type.strip().lower() == "private" else "public"

    # KIỂM TRA QUYỀN: Bảng xếp hạng Private CHỈ hiển thị cho tài khoản Quản trị viên (Admin)
    if clean_type == "private":
        current_uid = get_current_user_id()
        current_user = db.query(User).filter(User.id == current_uid).first()
        if not current_user or current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Bảng xếp hạng Private chỉ hiển thị cho tài khoản Quản trị viên (Admin)."
            )

    # Tìm đề bài theo mã đề, nếu không có lấy đề đầu tiên
    query_problem = None
    if problem_code:
        query_problem = db.query(Problem).filter(Problem.code == problem_code).first()
    if not query_problem:
        query_problem = db.query(Problem).first()

    if not query_problem:
        return []

    # Lọc bài nộp theo loại bảng xếp hạng (public hoặc private)
    if clean_type == "private":
        type_filter = (Submission.submission_type == "private")
    else:
        type_filter = or_(Submission.submission_type == "public", Submission.submission_type.is_(None))

    submissions = (
        db.query(Submission)
        .filter(
            Submission.problem_id == query_problem.id,
            Submission.status.in_(["HỢP LỆ", "SUCCESS"]),
            Submission.score.isnot(None),
            type_filter
        )
        .all()
    )

    # Nhóm theo từng thí sinh (user_id) để lấy điểm số cao nhất
    user_stats = {}
    for sub in submissions:
        uid = sub.user_id
        if uid not in user_stats:
            user_stats[uid] = {
                "user": sub.user,
                "best_score": sub.score,
                "total_submissions": 0,
                "last_submission_time": sub.created_at
            }
        user_stats[uid]["total_submissions"] += 1
        if sub.score > user_stats[uid]["best_score"]:
            user_stats[uid]["best_score"] = sub.score
        if sub.created_at and user_stats[uid]["last_submission_time"] and sub.created_at > user_stats[uid]["last_submission_time"]:
            user_stats[uid]["last_submission_time"] = sub.created_at

    # Sắp xếp theo điểm giảm dần, thời gian nộp mới nhất
    sorted_users = sorted(
        user_stats.values(),
        key=lambda x: (-x["best_score"], x["last_submission_time"])
    )

    leaderboard = []
    for rank, item in enumerate(sorted_users, start=1):
        u = item["user"]
        leaderboard.append(
            LeaderboardItem(
                rank=rank,
                user_id=u.id if u else 0,
                full_name=u.full_name if u else "User",
                team_name=(u.team_name or u.username) if u else "Team",
                problem_code=query_problem.code,
                best_score=round(item["best_score"], 4),
                total_submissions=item["total_submissions"],
                last_submission_time=item["last_submission_time"],
                submission_type=clean_type
            )
        )

    return leaderboard
