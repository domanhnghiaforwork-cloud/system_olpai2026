import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from ..database import get_db
from ..models import Submission, User, Problem
from ..schemas import LeaderboardItem, OverallLeaderboardItem, ProblemScoreComponent
from ..auth_utils import get_current_user_optional

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

@router.get("/overall", response_model=List[OverallLeaderboardItem])
def get_overall_leaderboard(db: Session = Depends(get_db)):
    """
    Bảng xếp hạng tổng (Overall Leaderboard):
    Tính tổng tất cả điểm Public cao nhất của tất cả các đề hiện có của mỗi thí sinh để xếp hạng,
    đồng thời hiển thị điểm số chi tiết từng đề thành phần.
    """
    problems = db.query(Problem).order_by(Problem.id.asc()).all()
    if not problems:
        return []

    problem_ids = [p.id for p in problems]

    submissions = (
        db.query(Submission)
        .filter(
            Submission.problem_id.in_(problem_ids),
            Submission.status.in_(["HỢP LỆ", "SUCCESS"]),
            Submission.score.isnot(None),
            or_(Submission.submission_type == "public", Submission.submission_type.is_(None))
        )
        .order_by(Submission.created_at.asc())
        .all()
    )

    user_prob_stats = {}

    for sub in submissions:
        uid = sub.user_id
        pid = sub.problem_id

        if uid not in user_prob_stats:
            user_prob_stats[uid] = {
                "user": sub.user,
                "scores": {},
                "last_time": sub.created_at
            }

        if sub.created_at:
            if not user_prob_stats[uid]["last_time"] or sub.created_at > user_prob_stats[uid]["last_time"]:
                user_prob_stats[uid]["last_time"] = sub.created_at

        if pid not in user_prob_stats[uid]["scores"]:
            user_prob_stats[uid]["scores"][pid] = {
                "best_score": sub.score,
                "sub_id": sub.id,
                "submitted_at": sub.created_at
            }
        else:
            if sub.score > user_prob_stats[uid]["scores"][pid]["best_score"]:
                user_prob_stats[uid]["scores"][pid] = {
                    "best_score": sub.score,
                    "sub_id": sub.id,
                    "submitted_at": sub.created_at
                }

    user_results = []
    total_problems_count = len(problems)

    for uid, data in user_prob_stats.items():
        u = data["user"]
        scores_by_pid = data["scores"]

        components = []
        total_score = 0.0
        submitted_count = 0

        for p in problems:
            p_stat = scores_by_pid.get(p.id)
            if p_stat:
                score_val = round(p_stat["best_score"], 4)
                total_score += score_val
                submitted_count += 1
                components.append(
                    ProblemScoreComponent(
                        problem_id=p.id,
                        problem_code=p.code,
                        problem_title=p.title,
                        metric=p.metric,
                        score=score_val,
                        submission_id=p_stat["sub_id"],
                        submitted_at=p_stat["submitted_at"]
                    )
                )
            else:
                components.append(
                    ProblemScoreComponent(
                        problem_id=p.id,
                        problem_code=p.code,
                        problem_title=p.title,
                        metric=p.metric,
                        score=None,
                        submission_id=None,
                        submitted_at=None
                    )
                )

        user_results.append({
            "user": u,
            "total_score": round(total_score, 4),
            "submitted_count": submitted_count,
            "components": components,
            "last_time": data["last_time"]
        })

    user_results.sort(
        key=lambda x: (
            -x["total_score"],
            -x["submitted_count"],
            x["last_time"] if x["last_time"] else datetime.datetime.max
        )
    )

    overall_leaderboard = []
    for rank, item in enumerate(user_results, start=1):
        u = item["user"]
        overall_leaderboard.append(
            OverallLeaderboardItem(
                rank=rank,
                user_id=u.id if u else 0,
                full_name=u.full_name if u else "Thí sinh",
                team_name=(u.team_name or u.username) if u else "Đội thi",
                username=u.username if u else None,
                total_score=item["total_score"],
                total_problems_submitted=item["submitted_count"],
                total_problems_count=total_problems_count,
                components=item["components"],
                last_submission_time=item["last_time"]
            )
        )

    return overall_leaderboard

@router.get("", response_model=List[LeaderboardItem])
def get_leaderboard(
    problem_code: Optional[str] = Query(None, description="Mã đề bài, ví dụ CV-01"),
    type: str = Query("public", description="Loại bảng xếp hạng: 'public' hoặc 'private'"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    clean_type = "private" if type.strip().lower() == "private" else "public"

    # KIỂM TRA QUYỀN: Bảng xếp hạng Private CHỈ hiển thị cho tài khoản Quản trị viên (Admin)
    if clean_type == "private":
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
