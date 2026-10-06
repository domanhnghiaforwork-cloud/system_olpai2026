"""Bộ chấm điểm dùng chung cho web của trường và evaluate.py.

Web gọi:
    from scorer import score_submission
    result = score_submission(uploaded_bytes, "secret/ground_truth.csv", phase="public")
    # result là dict, có thể json.dumps trực tiếp

phase:
    "public"  — giờ 0–5: chỉ chấm các dòng id bắt đầu bằng "pub_" (bắt buộc đủ 5.000 dòng)
    "private" — giờ thứ 6: chỉ chấm các dòng "prv_" (bắt buộc đủ 5.000 dòng)
    "all"     — BTC: chấm cả hai
Các dòng thuộc phase khác trong file nộp được bỏ qua, không báo lỗi.

Xếp hạng: SacreBLEU giảm dần → CER tăng dần → exact_match giảm dần → thời điểm nộp sớm hơn (web tự lưu).
Dùng `rank_key(result)` để sắp xếp các kết quả hợp lệ.
"""
import csv
import io
import math

import sacrebleu

PREFIX = {"public": ("pub_",), "private": ("prv_",), "all": ("pub_", "prv_")}
MAX_BYTES = 20 * 1024 * 1024

try:
    from rapidfuzz.distance import Levenshtein as _Lev

    def _edit(a, b):
        return _Lev.distance(a, b)
except ImportError:  # fallback thuần Python
    def _edit(a, b):
        if len(a) < len(b):
            a, b = b, a
        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            cur = [i]
            for j, cb in enumerate(b, 1):
                cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
            prev = cur
        return prev[-1]


class SubmissionError(ValueError):
    pass


def _read_csv(data):
    if isinstance(data, (bytes, bytearray)):
        if len(data) > MAX_BYTES:
            raise SubmissionError("File quá lớn (> 20 MB).")
        try:
            data = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise SubmissionError("File phải được mã hóa UTF-8.")
    reader = csv.reader(io.StringIO(data, newline=""))
    try:
        header = [h.strip() for h in next(reader)]
    except StopIteration:
        raise SubmissionError("File rỗng.")
    return header, list(reader)


def load_ground_truth(path):
    gt = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            gt[row["id"]] = row["van_ban_chuan"]
    return gt


def rank_key(result):
    """Khóa sắp xếp (tăng dần = hạng cao trước). Thời điểm nộp do web phá hòa tiếp."""
    return (-result["sacrebleu"], result["cer"], -result["exact_match"])


def score_submission(data, ground_truth, phase="public"):
    """data: bytes | str (nội dung CSV). ground_truth: đường dẫn hoặc dict id->câu chuẩn."""
    if phase not in PREFIX:
        raise ValueError(f"phase không hợp lệ: {phase}")
    gt = load_ground_truth(ground_truth) if isinstance(ground_truth, str) else ground_truth
    want = {k: v for k, v in gt.items() if k.startswith(PREFIX[phase])}

    try:
        header, rows = _read_csv(data)
        if header[:2] != ["id", "van_ban_chuan"] or len(header) != 2:
            raise SubmissionError(f"Header phải đúng 2 cột 'id,van_ban_chuan', nhận được: {header}")
        pred, errors = {}, []
        for ln, r in enumerate(rows, start=2):
            if not r:
                continue
            if len(r) != 2:
                errors.append(f"Dòng {ln}: có {len(r)} cột (cần 2).")
                continue
            i, t = r[0].strip(), r[1]
            if not i.startswith(PREFIX["all"]):
                errors.append(f"Dòng {ln}: id '{i}' không tồn tại.")
            elif i in pred:
                errors.append(f"Dòng {ln}: id '{i}' bị trùng.")
            elif i.startswith(PREFIX[phase]):
                if i not in want:
                    errors.append(f"Dòng {ln}: id '{i}' không tồn tại.")
                pred[i] = " ".join(t.split())
            else:
                pred[i] = None  # thuộc phase khác: bỏ qua
            if len(errors) >= 20:
                break
        pred = {k: v for k, v in pred.items() if v is not None}
        missing = [k for k in want if k not in pred]
        if missing:
            errors.append(f"Thiếu {len(missing)} id của phase '{phase}', ví dụ: {missing[:5]}")
        if errors:
            raise SubmissionError("\n".join(errors[:20]))
    except (SubmissionError, csv.Error) as e:
        return {"ok": False, "phase": phase, "error": str(e)}

    ids = sorted(want)
    hyps = [pred[i] for i in ids]
    refs = [want[i] for i in ids]
    bleu = sacrebleu.corpus_bleu(hyps, [refs], tokenize="13a").score
    chars = sum(len(r) for r in refs)
    cer = sum(_edit(h, r) for h, r in zip(hyps, refs)) / max(1, chars)
    exact = sum(h == r for h, r in zip(hyps, refs)) / len(ids)
    empty = sum(not h for h in hyps)
    return {
        "ok": True,
        "phase": phase,
        "n": len(ids),
        "sacrebleu": round(bleu, 4),
        "cer": round(cer, 5),
        "exact_match": round(exact, 5),
        "empty_predictions": empty,
    }
