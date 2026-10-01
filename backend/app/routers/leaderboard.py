from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from ..database import get_db
from ..models import Submission, User, Problem
from ..schemas import LeaderboardItem

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

@router.get("", response_model=List[LeaderboardItem])
def get_leaderboard(
    problem_code: Optional[str] = Query(None, description="Mã đề bài, ví dụ AI-01"),
    db: Session = Depends(get_db)
):
    # Find problem if specified, else take first problem
    query_problem = None
    if problem_code:
        query_problem = db.query(Problem).filter(Problem.code == problem_code).first()
    if not query_problem:
        query_problem = db.query(Problem).first()

    if not query_problem:
        return []

    # Get all users with their best score for this problem
    # Submissions with status SUCCESS and score not null
    submissions = (
        db.query(Submission)
        .filter(
            Submission.problem_id == query_problem.id,
            Submission.status == "SUCCESS",
            Submission.score != None
        )
        .all()
    )

    # Group by user_id to find max score and submission counts
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
        if sub.created_at > user_stats[uid]["last_submission_time"]:
            user_stats[uid]["last_submission_time"] = sub.created_at

    # Sort descending by score, then ascending by last_submission_time
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
                user_id=u.id,
                full_name=u.full_name,
                team_name=u.team_name or u.username,
                problem_code=query_problem.code,
                best_score=round(item["best_score"], 4),
                total_submissions=item["total_submissions"],
                last_submission_time=item["last_submission_time"]
            )
        )

    return leaderboard
