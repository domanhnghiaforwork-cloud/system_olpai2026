import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, select
from typing import List, Optional
from ..database import get_db
from ..models import Submission, SubmissionJob, User, Problem
from ..evaluators.ranking import nlp_tie_breakers, submission_order_by
from ..evaluators.score_scale import score_on_hundred
from ..schemas import LeaderboardItem, OverallLeaderboardItem, ProblemScoreComponent
from ..auth_utils import get_current_user_optional
from ..leaderboard_events import leaderboard_event_stream

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("/events")
def leaderboard_events(
    request: Request,
    type: str = Query("public", pattern="^(public|private)$"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if type == "private" and (not current_user or current_user.role != "admin"):
        raise HTTPException(403, "Thông báo bảng xếp hạng Private chỉ dành cho Admin.")
    # Release the authentication query's connection before streaming.
    db.rollback()
    return StreamingResponse(
        leaderboard_event_stream(request, type), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def best_submission_rows(db, problem_ids, submission_type):
    type_filter = Submission.submission_type == submission_type
    if submission_type == "public":
        type_filter = or_(type_filter, Submission.submission_type.is_(None))
    # Rank inside SQL and load one row per user/problem. NLP applies the original
    # CER/exact-match tie breakers before the earliest submission timestamp.
    cer, exact = nlp_tie_breakers()
    ranked = select(
        Submission.id.label("submission_id"), Submission.user_id, Submission.problem_id,
        Submission.score, Submission.created_at,
        cer.label("rank_cer"), exact.label("rank_exact_match"),
        func.row_number().over(
            partition_by=(Submission.user_id, Submission.problem_id),
            order_by=submission_order_by(),
        ).label("position"),
        func.count(Submission.id).over(partition_by=(Submission.user_id, Submission.problem_id)).label("total_submissions"),
    ).join(Problem, Problem.id == Submission.problem_id).outerjoin(
        SubmissionJob, SubmissionJob.submission_id == Submission.id
    ).where(
        Submission.problem_id.in_(problem_ids), type_filter,
        Submission.status.in_(("HỢP LỆ", "SUCCESS")), Submission.score.isnot(None),
    ).subquery()
    return db.execute(select(ranked).where(ranked.c.position == 1)).mappings().all()


@router.get("/overall", response_model=List[OverallLeaderboardItem])
def get_overall_leaderboard(
    type: str = Query("public", pattern="^(public|private)$"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if type == "private" and (not current_user or current_user.role != "admin"):
        raise HTTPException(403, "Bảng xếp hạng tổng Private chỉ dành cho Quản trị viên (Admin).")
    problems = db.query(Problem).order_by(Problem.id.asc()).all()
    if not problems:
        return []
    rows = best_submission_rows(db, [p.id for p in problems], type)
    users = {u.id: u for u in db.query(User).filter(User.id.in_({r["user_id"] for r in rows})).all()}
    grouped = {}
    for row in rows:
        grouped.setdefault(row["user_id"], {})[row["problem_id"]] = row
    items = []
    for uid, scores in grouped.items():
        user = users.get(uid)
        components = []
        total = 0.0
        for problem in problems:
            row = scores.get(problem.id)
            score = score_on_hundred(row["score"], problem.metric, problem.evaluation_config) if row else None
            if score is not None:
                total += score
            components.append(ProblemScoreComponent(
                problem_id=problem.id, problem_code=problem.code, problem_title=problem.title,
                metric=problem.metric, score=round(score, 4) if score is not None else None,
                submission_id=row["submission_id"] if row else None,
                submitted_at=row["created_at"] if row else None,
            ))
        items.append(OverallLeaderboardItem(
            rank=0, user_id=user.id if user else 0,
            full_name=user.full_name if user else "Thí sinh",
            team_name=(user.team_name or user.username) if user else "Đội thi",
            username=user.username if user else None, total_score=round(total, 4),
            total_problems_submitted=len(scores), total_problems_count=len(problems),
            # Time when the selected best scores forming this total were achieved.
            components=components,
            last_submission_time=max(row["created_at"] for row in scores.values()),
        ))
    items.sort(key=lambda item: (-item.total_score, -item.total_problems_submitted,
                               item.last_submission_time or datetime.datetime.max))
    for rank, item in enumerate(items, 1):
        item.rank = rank
    return items


@router.get("", response_model=List[LeaderboardItem])
def get_leaderboard(
    problem_code: Optional[str] = Query(None),
    type: str = Query("public"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    split = "private" if type.strip().lower() == "private" else "public"
    if split == "private" and (not current_user or current_user.role != "admin"):
        raise HTTPException(403, "Bảng xếp hạng Private chỉ hiển thị cho tài khoản Quản trị viên (Admin).")
    problem = db.query(Problem).filter_by(code=problem_code).first() if problem_code else None
    problem = problem or db.query(Problem).first()
    if not problem:
        return []
    rows = best_submission_rows(db, [problem.id], split)
    users = {u.id: u for u in db.query(User).filter(User.id.in_({r["user_id"] for r in rows})).all()}
    if (problem.evaluation_config or "").strip() == "eval_2_nlp_tung":
        rows.sort(key=lambda row: (-row["score"], row["rank_cer"], -row["rank_exact_match"],
                                   row["created_at"], row["submission_id"]))
    else:
        rows.sort(key=lambda row: (-row["score"], row["created_at"], row["submission_id"]))
    items = []
    for rank, row in enumerate(rows, 1):
        user = users.get(row["user_id"])
        items.append(LeaderboardItem(
            rank=rank, user_id=user.id if user else 0,
            full_name=user.full_name if user else "User",
            team_name=(user.team_name or user.username) if user else "Team",
            problem_code=problem.code, best_score=row["score"],
            total_submissions=row["total_submissions"], last_submission_time=row["created_at"],
            submission_type=split,
        ))
    return items
