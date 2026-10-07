"""Convert native metric scores for the overall leaderboard; keep stored scores unchanged."""

EVALUATOR_SCALES = {"eval_1_cv_hico": 1.0, "eval_2_nlp_tung": 100.0}


def score_on_hundred(score: float, metric: str = "", evaluation_config: str = "") -> float:
    scale = EVALUATOR_SCALES.get((evaluation_config or "").strip())
    if scale is None:
        # Legacy problems may have no evaluator ID. Infer from metric metadata,
        # never from the score's magnitude (BLEU below 1 is still on 0–100).
        scale = 100.0 if "bleu" in (metric or "").lower() else 1.0
    return float(score) * (100.0 / scale)
