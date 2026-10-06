"""SQL equivalents of Tung's rank_key, using persisted worker score details."""
from sqlalchemy import case, func

from ..models import Problem, Submission, SubmissionJob


def nlp_tie_breakers():
    # Callers join Problem and outer-join SubmissionJob. Legacy NLP rows without
    # details rank last among equal BLEU scores; missing CER is not perfect.
    is_nlp = func.trim(Problem.evaluation_config) == "eval_2_nlp_tung"
    cer = case((is_nlp, func.coalesce(
        func.json_extract(SubmissionJob.result_json, "$.step2_scoring.details.cer"), 1e308
    )), else_=0.0)
    exact = case((is_nlp, func.coalesce(
        func.json_extract(SubmissionJob.result_json, "$.step2_scoring.details.exact_match"), 0.0
    )), else_=0.0)
    return cer, exact


def submission_order_by(fallback_time_desc=False):
    cer, exact = nlp_tie_breakers()
    order = [Submission.score.desc(), cer.asc(), exact.desc()]
    if fallback_time_desc:
        # Preserve Admin's latest-equal-score CV exports; NLP uses earliest time.
        order.append(case(
            (func.trim(Problem.evaluation_config) == "eval_2_nlp_tung", Submission.created_at),
            else_=None,
        ).asc())
    order.extend([
        Submission.created_at.desc() if fallback_time_desc else Submission.created_at.asc(),
        Submission.id.asc(),
    ])
    return order
