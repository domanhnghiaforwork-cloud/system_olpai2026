"""
Evaluation module: eval_1_cv_hico
Computer Vision - Human-Object Interaction (HICO) benchmark evaluation.
Metric: mAP (Mean Average Precision 11-point interpolation - VOC 2007 / HICO standard)
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import List, Tuple, Set, Optional

import numpy as np
import pandas as pd

from .base import BaseEvaluator, EvaluationValidationResult, EvaluationScoreResult

# Define paths to test labels (stored in evaluators/labels_eval_1)
EVALUATOR_DIR = Path(__file__).resolve().parent
LABELS_DIR = Path(os.getenv("EVAL_1_LABELS_DIR", EVALUATOR_DIR / "labels_eval_1"))

CLASS_COLUMNS = [f"hoi_{index:03d}" for index in range(600)]
EXPECTED_COLUMNS = ["image_id", *CLASS_COLUMNS]


@lru_cache(maxsize=4)
def _labels_at_version(filepath: str, modified_ns: int, size: int):
    # Keep only immutable IDs and the compact binary matrix, not a large frame.
    frame = pd.read_csv(filepath, dtype={"image_id": "string", **{c: np.int8 for c in CLASS_COLUMNS}})
    values = frame[CLASS_COLUMNS].to_numpy(dtype=np.int8)
    values.flags.writeable = False
    return pd.Index(frame["image_id"]), values


def load_labels(path: Path):
    stat = path.stat()
    return _labels_at_version(str(path.resolve()), stat.st_mtime_ns, stat.st_size)


def file_version(path: Path):
    stat = path.stat()
    return str(path.resolve()), stat.st_mtime_ns, stat.st_size

SPLITS_FILES = {
    "public": {
        "submit_filename": "public_submit.csv",
        "labels_filename": "public_test_labels.csv",
        "expected_rows": 4843,
    },
    "private": {
        "submit_filename": "private_submit.csv",
        "labels_filename": "private_test_labels.csv",
        "expected_rows": 7199,
    },
}

# Regex pattern for HICO image filename
# Examples: HICO_test2015_00000005.jpg, HICO_train2015_00000016.jpg
IMAGE_ID_PATTERN = re.compile(r"^HICO_(train|test)2015_\d{8}\.jpg$")


def validate_binary_inputs(y_true: np.ndarray, scores: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Validate known labels before casting; metric functions do not mask -1."""
    y_true = np.asarray(y_true)
    scores = np.asarray(scores, dtype=np.float64)
    if y_true.ndim != 1 or scores.ndim != 1 or y_true.shape != scores.shape:
        raise ValueError("Labels and scores must be one-dimensional arrays of equal length")
    if len(y_true) == 0:
        raise ValueError("Class has no known labels")
    if not np.isin(y_true, [0, 1]).all():
        raise ValueError("Known labels must be exactly 0 or 1")
    if not np.isfinite(scores).all():
        raise ValueError("Scores must be finite")
    return y_true.astype(np.int8), scores


def average_precision(y_true: np.ndarray, scores: np.ndarray) -> float:
    """AP from score thresholds, using HICO/VOC 11-point interpolation."""
    y_true, scores = validate_binary_inputs(y_true, scores)
    positives = int(y_true.sum())
    if positives == 0:
        return 0.0

    order = np.argsort(-scores, kind="stable")
    ranked_scores = scores[order]
    ranked_true = y_true[order]
    true_positives = np.cumsum(ranked_true)
    threshold_ends = np.r_[np.flatnonzero(np.diff(ranked_scores)), len(scores) - 1]
    precision = true_positives[threshold_ends] / (threshold_ends + 1)
    recall = true_positives[threshold_ends] / positives
    # p_interp(r) = max precision at any attained recall >= r.
    return float(np.mean([
        np.max(precision[recall >= target], initial=0.0)
        for target in np.arange(11) / 10.0
    ]))


class Eval1CvHicoEvaluator(BaseEvaluator):
    eval_id = "eval_1_cv_hico"
    name = "Đánh giá CV HICO (mAP 600 Classes)"
    description = (
        "Đánh giá bài toán Computer Vision nhận diện tương tác người - vật (HOI) "
        "trên bộ dữ liệu HICO benchmark 600 classes. "
        "Yêu cầu nộp file CSV chứa 601 cột (image_id + 600 classes hoi_000..hoi_599). "
        "Độ đo chấm điểm: mAP (Mean Average Precision 11-point nội suy VOC 2007)."
    )
    metric_name = "mAP"

    def get_labels_path(self, split: str) -> Path:
        split_key = "private" if "private" in split.lower() else "public"
        split_info = SPLITS_FILES[split_key]
        path = LABELS_DIR / split_info["labels_filename"]
        if not path.is_file():
            # Fallback relative to evaluators directory
            alt_path = EVALUATOR_DIR / "labels_eval_1" / split_info["labels_filename"]
            if alt_path.is_file():
                return alt_path
            alt_path2 = Path("backend/app/evaluators/labels_eval_1") / split_info["labels_filename"]
            if alt_path2.is_file():
                return alt_path2
            alt_path3 = Path("evaluators/labels_eval_1") / split_info["labels_filename"]
            if alt_path3.is_file():
                return alt_path3
        return path

    def validate(self, filepath: str, submission_type: str, original_filename: str = "") -> EvaluationValidationResult:
        """
        Kiểm tra toàn diện chuẩn đầu vào cho tập nộp bài:
        1. Định dạng file (.csv), không giới hạn tên file nộp
        2. Kích thước và sự tồn tại của file
        3. Cấu trúc cột header: đúng 601 cột ('image_id', 'hoi_000' ... 'hoi_599')
        4. Từng tên file ảnh trong cột image_id:
           - Không rỗng, không chứa khoảng trắng ở đầu/cuối/giữa
           - Không chứa ký tự lạ/ký tự điều khiển
           - Đúng định dạng tên file ảnh HICO (ví dụ: HICO_test2015_00000005.jpg)
           - Không trùng lặp image_id
        5. Đối chiếu danh sách image_id với nhãn chuẩn:
           - Đúng số lượng ảnh theo split (public: 4843, private: 7199)
           - Không thiếu bất kỳ ảnh nào
           - Không thừa bất kỳ ảnh lạ nào
        6. Kiểm tra ma trận xác suất (600 cột hoi):
           - Phải là số thực, nằm trong đoạn [0.0, 1.0]
           - Không chứa NaN, None, Inf, chuỗi văn bản
        """
        self._validated = None
        path = Path(filepath)
        split_key = "private" if "private" in submission_type.lower() else "public"
        split_info = SPLITS_FILES[split_key]
        expected_rows = split_info["expected_rows"]

        # 1. Kiểm tra sự tồn tại của file
        if not path.is_file():
            return EvaluationValidationResult(
                is_valid=False,
                message=f"File nộp bài không tồn tại trên hệ thống: {filepath}",
                errors=["Tệp không tồn tại"]
            )

        # 2. Kiểm tra phần mở rộng file
        if path.suffix.lower() != ".csv":
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Định dạng tệp không hợp lệ: '{path.name}'. Hệ thống chỉ chấp nhận tệp có phần mở rộng .csv",
                errors=["Tệp không phải định dạng .csv"]
            )

        # 4. Kiểm tra kích thước file
        file_size = path.stat().st_size
        if file_size < 1000:
            return EvaluationValidationResult(
                is_valid=False,
                message=f"File CSV quá nhỏ hoặc rỗng ({file_size} bytes), không đủ dữ liệu dự đoán.",
                errors=["File rỗng hoặc không đủ dữ liệu"]
            )

        # 5. Đọc và kiểm tra Header
        try:
            # Đọc dòng đầu tiên để kiểm tra header mà không tốn nhiều RAM
            with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
                header_line = f.readline().strip()
            
            header_cols = [c.strip() for c in header_line.split(",")]
        except Exception as e:
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Không thể đọc dòng tiêu đề file CSV: {str(e)}",
                errors=[str(e)]
            )

        if len(header_cols) != len(EXPECTED_COLUMNS):
            return EvaluationValidationResult(
                is_valid=False,
                message=(
                    f"Số lượng cột không hợp lệ: File có {len(header_cols)} cột, "
                    f"yêu cầu phải có đúng {len(EXPECTED_COLUMNS)} cột (cột đầu 'image_id' và 600 cột 'hoi_000'..'hoi_599')."
                ),
                errors=[f"Số lượng cột là {len(header_cols)}, mong đợi {len(EXPECTED_COLUMNS)}"]
            )

        if header_cols != EXPECTED_COLUMNS:
            mismatched = []
            for i, (act, exp) in enumerate(zip(header_cols, EXPECTED_COLUMNS)):
                if act != exp:
                    mismatched.append(f"Cột thứ {i}: '{act}' (mong đợi: '{exp}')")
                if len(mismatched) >= 5:
                    break
            return EvaluationValidationResult(
                is_valid=False,
                message=(
                    "Dòng tiêu đề (header) không đúng định dạng hoặc sai thứ tự cột. "
                    f"Sai khác: {', '.join(mismatched)}."
                ),
                errors=mismatched
            )

        # 6. Đọc toàn bộ DataFrame bằng pandas
        try:
            df = pd.read_csv(path, dtype={"image_id": "string"}, encoding="utf-8-sig")
        except Exception as e:
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Lỗi khi phân tích dữ liệu CSV: {str(e)}",
                errors=[str(e)]
            )

        actual_rows = len(df)
        if actual_rows != expected_rows:
            return EvaluationValidationResult(
                is_valid=False,
                message=(
                    f"Số lượng dòng dự đoán ({actual_rows}) không khớp với tập {split_key.upper()} "
                    f"(yêu cầu đúng {expected_rows} dòng)."
                ),
                row_count=actual_rows,
                errors=[f"Số dòng {actual_rows} != {expected_rows}"]
            )

        # 7. Kiểm tra chi tiết cột image_id
        image_ids = df["image_id"]

        # 7.1 Kiểm tra null/rỗng
        if image_ids.isna().any():
            nan_count = int(image_ids.isna().sum())
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Cột 'image_id' chứa {nan_count} giá trị rỗng hoặc null.",
                row_count=actual_rows,
                errors=["image_id chứa giá trị null"]
            )

        # 7.2 Kiểm tra khoảng trắng và ký tự lạ trong từng image_id
        invalid_id_reasons = []
        for idx, img_id in enumerate(image_ids):
            val = str(img_id)
            if val != val.strip():
                invalid_id_reasons.append(f"Dòng {idx + 2}: '{val}' có chứa khoảng trắng ở đầu hoặc cuối.")
            elif " " in val:
                invalid_id_reasons.append(f"Dòng {idx + 2}: '{val}' có chứa dấu cách ở giữa tên file.")
            elif not IMAGE_ID_PATTERN.match(val):
                invalid_id_reasons.append(
                    f"Dòng {idx + 2}: '{val}' không đúng định dạng tên file ảnh HICO (ví dụ mẫu: 'HICO_test2015_00000005.jpg')."
                )
            if len(invalid_id_reasons) >= 5:
                break

        if invalid_id_reasons:
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Phát hiện tên file ảnh trong cột 'image_id' không hợp lệ: {'; '.join(invalid_id_reasons)}",
                row_count=actual_rows,
                errors=invalid_id_reasons
            )

        # 7.3 Kiểm tra trùng lặp image_id
        duplicates = df[image_ids.duplicated()]["image_id"].tolist()
        if duplicates:
            sample_dups = duplicates[:3]
            return EvaluationValidationResult(
                is_valid=False,
                message=(
                    f"Cột 'image_id' có {len(duplicates)} dòng bị trùng lặp tên ảnh. "
                    f"Ví dụ: {', '.join(sample_dups)}"
                ),
                row_count=actual_rows,
                errors=["Trùng lặp image_id"]
            )

        # 8. Đối chiếu danh sách image_id với file nhãn chuẩn (Ground Truth)
        labels_path = self.get_labels_path(split_key)
        if not labels_path.is_file():
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Hệ thống thiếu file nhãn chuẩn: {labels_path.name}. Vui lòng liên hệ ban quản trị.",
                errors=["Thiếu file nhãn chuẩn hệ thống"]
            )

        try:
            label_ids, _ = load_labels(labels_path)
            expected_ids = set(label_ids)
            actual_ids = set(image_ids)

            missing_ids = expected_ids - actual_ids
            extra_ids = actual_ids - expected_ids

            if missing_ids or extra_ids:
                msg_parts = []
                if missing_ids:
                    sample_miss = list(missing_ids)[:3]
                    msg_parts.append(f"Thiếu {len(missing_ids)} ảnh (ví dụ: {', '.join(sample_miss)})")
                if extra_ids:
                    sample_extra = list(extra_ids)[:3]
                    msg_parts.append(f"Thừa {len(extra_ids)} ảnh không thuộc tập nhãn (ví dụ: {', '.join(sample_extra)})")

                return EvaluationValidationResult(
                    is_valid=False,
                    message=f"Danh sách image_id không khớp với file nhãn chuẩn: {'; '.join(msg_parts)}.",
                    row_count=actual_rows,
                    errors=msg_parts
                )
        except Exception as e:
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Lỗi khi đối chiếu với nhãn chuẩn: {str(e)}",
                errors=[str(e)]
            )

        # 9. Kiểm tra ma trận xác suất trong 600 cột hoi_000 .. hoi_599
        try:
            # Kiểm tra nhanh kiểu dữ liệu số
            class_df = df[CLASS_COLUMNS]
            numeric_df = class_df if all(pd.api.types.is_numeric_dtype(t) for t in class_df.dtypes) else class_df.apply(pd.to_numeric, errors="coerce")
            
            # Kiểm tra ô nào không phải số hoặc NaN
            nan_mask = numeric_df.isna()
            if nan_mask.any().any():
                bad_cols = nan_mask.any()
                first_bad_col = bad_cols[bad_cols].index[0]
                first_bad_row = nan_mask[first_bad_col].idxmax()
                bad_val = df.loc[first_bad_row, first_bad_col]
                return EvaluationValidationResult(
                    is_valid=False,
                    message=(
                        f"Phát hiện giá trị không phải số hoặc để trống (NaN) tại dòng {first_bad_row + 2}, "
                        f"cột '{first_bad_col}': '{bad_val}'."
                    ),
                    row_count=actual_rows,
                    errors=["Giá trị xác suất không hợp lệ hoặc để trống"]
                )

            # Chuyển thành numpy array để kiểm tra giá trị hữu hạn và nằm trong [0, 1]
            probs = numeric_df.to_numpy(dtype=np.float64)
            if not np.isfinite(probs).all():
                return EvaluationValidationResult(
                    is_valid=False,
                    message="Dữ liệu xác suất chứa giá trị vô hạn (+Inf hoặc -Inf).",
                    row_count=actual_rows,
                    errors=["Giá trị xác suất vô hạn"]
                )

            if (probs < 0.0).any() or (probs > 1.0).any():
                min_val = float(np.min(probs))
                max_val = float(np.max(probs))
                return EvaluationValidationResult(
                    is_valid=False,
                    message=(
                        f"Tất cả giá trị xác suất dự đoán phải nằm trong khoảng [0.0, 1.0]. "
                        f"Phát hiện giá trị vượt ngưỡng: min = {min_val}, max = {max_val}."
                    ),
                    row_count=actual_rows,
                    errors=["Giá trị xác suất ngoài khoảng [0, 1]"]
                )

        except Exception as e:
            return EvaluationValidationResult(
                is_valid=False,
                message=f"Lỗi kiểm tra ma trận xác suất: {str(e)}",
                errors=[str(e)]
            )

        # Hoàn tất kiểm tra hợp lệ!
        # A worker evaluates this same immutable uploaded file immediately. Store
        # the key/frame together so concurrent callers cannot mix their frames.
        self._validated = (file_version(path), df)
        return EvaluationValidationResult(
            is_valid=True,
            message=(
                f"Tệp CSV hoàn toàn hợp lệ: Đầy đủ 601 cột chuẩn, đúng {actual_rows} dòng ảnh "
                f"khớp 100% với danh mục nhãn tập {split_key.upper()}, định dạng tên ảnh chuẩn không có dấu cách/dấu lạ, "
                f"toàn bộ xác suất thuộc [0, 1]."
            ),
            row_count=actual_rows,
            details={
                "split": split_key,
                "rows": actual_rows,
                "classes": len(CLASS_COLUMNS),
                "filename": original_filename or path.name
            }
        )

    def evaluate(self, filepath: str, submission_type: str) -> EvaluationScoreResult:
        """
        Chấm điểm theo metric mAP 600 classes của HICO benchmark (VOC 2007 11-point interpolated AP).
        """
        path = Path(filepath)
        split_key = "private" if "private" in submission_type.lower() else "public"
        labels_path = self.get_labels_path(split_key)

        if not labels_path.is_file():
            raise FileNotFoundError(f"Không tìm thấy file nhãn chuẩn hệ thống: {labels_path}")

        # Đọc nhãn và submission
        expected_ids, raw_labels = load_labels(labels_path)
        cached = getattr(self, "_validated", None)
        self._validated = None
        submission = cached[1] if cached and cached[0] == file_version(path) else pd.read_csv(path, dtype={"image_id": "string"})

        # Re-index submission theo đúng thứ tự image_id của file nhãn
        submission = submission.set_index("image_id").loc[expected_ids]

        probabilities = submission[CLASS_COLUMNS].to_numpy(dtype=np.float64)

        average_precisions = []
        for column_index in range(len(CLASS_COLUMNS)):
            known = raw_labels[:, column_index] != -1
            y_true = raw_labels[known, column_index]
            y_score = probabilities[known, column_index]
            ap = average_precision(y_true, y_score)
            average_precisions.append(ap)

        mean_ap = float(np.mean(average_precisions))
        score_rounded = round(mean_ap, 6)

        return EvaluationScoreResult(
            score=score_rounded,
            metric=self.metric_name,
            message=f"Chấm điểm thành công trên tập {split_key.upper()}: mAP = {score_rounded:.6f} ({score_rounded * 100:.2f}%)",
            details={
                "mean_ap": score_rounded,
                "percentage": round(score_rounded * 100, 2),
                "split": split_key,
                "total_classes": len(CLASS_COLUMNS),
                "evaluated_samples": len(expected_ids),
            }
        )
