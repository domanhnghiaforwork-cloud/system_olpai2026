"""Adapter for Tung's Vietnamese text normalization scorer (SacreBLEU)."""
import os
from functools import lru_cache
from pathlib import Path

from .base import BaseEvaluator, EvaluationScoreResult, EvaluationValidationResult
from .nlp_tung.scorer import MAX_BYTES, PREFIX, SubmissionError, load_ground_truth, score_submission

DEFAULT_GROUND_TRUTH = Path(__file__).resolve().parent / "labels_eval_2" / "ground_truth.csv"


def file_version(path: Path):
    stat = path.stat()
    return str(path.resolve()), stat.st_mtime_ns, stat.st_size


@lru_cache(maxsize=2)
def _ground_truth_at_version(path, modified_ns, size):
    return load_ground_truth(path)


@lru_cache(maxsize=4)
def _score_at_version(submission_version, ground_truth_version, phase):
    # Share scoring between validation and evaluation, keyed by both files and
    # phase. Never reuse a public score for private or a changed submission/GT.
    with open(submission_version[0], "rb") as submission:
        data = submission.read(MAX_BYTES + 1)
    return score_submission(data, _ground_truth_at_version(*ground_truth_version), phase)


class Eval2NlpTungEvaluator(BaseEvaluator):
    eval_id = "eval_2_nlp_tung"
    name = "Đánh giá NLP Tùng (Chuẩn hóa văn bản tiếng Việt)"
    description = (
        "Giữ nguyên bộ chấm tung_nlp: CSV gồm id,van_ban_chuan; UTF-8, tối đa 20 MB. "
        "Chấm public (pub_) hoặc private (prv_), cho phép nộp chung hai tập. "
        "Điểm SacreBLEU (tokenize=13a); phá hòa bằng CER, exact match, thời điểm nộp."
    )
    metric_name = "SacreBLEU"

    def get_ground_truth_path(self) -> Path:
        return Path(os.getenv("EVAL_2_NLP_TUNG_GROUND_TRUTH", str(DEFAULT_GROUND_TRUTH)))

    def _score(self, filepath: str, submission_type: str):
        # The original scorer validates phases; do not silently choose public
        # for an unsupported phase.
        if submission_type not in PREFIX:
            raise ValueError(f"phase không hợp lệ: {submission_type}")
        return _score_at_version(
            file_version(Path(filepath)), file_version(self.get_ground_truth_path()), submission_type
        )

    def validate(self, filepath: str, submission_type: str, original_filename: str = "") -> EvaluationValidationResult:
        # No HICO filename/extension rules: all CSV content checks come directly
        # from scorer.py, including BOM, whitespace, duplicates and other phases.
        try:
            result = self._score(filepath, submission_type)
        except (OSError, ValueError) as error:
            return EvaluationValidationResult(is_valid=False, message=str(error), errors=[str(error)])
        if not result["ok"]:
            return EvaluationValidationResult(
                is_valid=False, message=result["error"], errors=result["error"].splitlines()
            )
        return EvaluationValidationResult(
            is_valid=True,
            message=f"Tệp CSV hợp lệ: đủ {result['n']} id của phase '{result['phase']}'.",
            row_count=result["n"],
            details={"phase": result["phase"], "n": result["n"]},
        )

    def evaluate(self, filepath: str, submission_type: str) -> EvaluationScoreResult:
        result = self._score(filepath, submission_type)
        if not result["ok"]:
            raise SubmissionError(result["error"])
        return EvaluationScoreResult(
            score=result["sacrebleu"],
            metric=self.metric_name,
            message=(f"Chấm điểm thành công trên tập {result['phase'].upper()}: "
                     f"SacreBLEU = {result['sacrebleu']:.4f}; CER = {result['cer']:.5f}; "
                     f"exact match = {result['exact_match']:.5f}."),
            details=dict(result),
        )
