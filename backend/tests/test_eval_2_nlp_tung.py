"""Parity with Tung's original scorer, including validation edge cases."""
import csv
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from app.evaluators import get_evaluator, list_available_evaluators
from app.evaluators import eval_2_nlp_tung as adapter
from app.evaluators.nlp_tung import scorer

SOURCE = BACKEND.parents[1] / "tung_nlp" / "olp_26" / "de_thi_nlp_chuan_hoa"


def csv_bytes(rows, header=("id", "van_ban_chuan")):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(header)
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


class NlpTungEvaluatorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nlp-tung-")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "any-name.csv"
        self.gt_path = Path(self.temp.name) / "ground_truth.csv"
        self.gt = {
            "pub_00001": "Xin chào bạn, hôm nay bạn khỏe không?",
            "pub_00002": "Tôi đang học tiếng Việt ở trường.",
            "prv_00001": "Ngày mai chúng ta cùng đi học nhé!",
        }
        self.gt_path.write_bytes(csv_bytes(self.gt.items()))
        self.evaluator = adapter.Eval2NlpTungEvaluator()
        self.evaluator.get_ground_truth_path = lambda: self.gt_path
        adapter._score_at_version.cache_clear()
        adapter._ground_truth_at_version.cache_clear()

    def compare(self, data, phase="public", valid=None):
        self.path.write_bytes(data)
        expected = scorer.score_submission(data, self.gt, phase)
        validation = self.evaluator.validate(str(self.path), phase, "bài nộp tùy ý.csv")
        self.assertEqual(validation.is_valid, expected["ok"])
        if valid is not None:
            self.assertEqual(validation.is_valid, valid)
        if expected["ok"]:
            actual = self.evaluator.evaluate(str(self.path), phase)
            self.assertEqual(actual.details, expected)
            self.assertEqual(actual.score, expected["sacrebleu"])
            self.assertEqual(actual.metric, "SacreBLEU")
            self.assertEqual(validation.row_count, expected["n"])
            self.assertNotIn("sacrebleu", validation.details)
        else:
            self.assertEqual(validation.message, expected["error"])
            with self.assertRaisesRegex(scorer.SubmissionError, ""):
                self.evaluator.evaluate(str(self.path), phase)
        return expected

    def test_registry_keeps_cv_and_exposes_second_configuration(self):
        ids = [item["id"] for item in list_available_evaluators()]
        self.assertEqual(ids, ["eval_1_cv_hico", "eval_2_nlp_tung"])
        self.assertIsInstance(get_evaluator("eval_2_nlp_tung"), adapter.Eval2NlpTungEvaluator)

    def test_combined_csv_scores_all_phases_with_original_scale(self):
        for phase, count in (("public", 2), ("private", 1), ("all", 3)):
            with self.subTest(phase=phase):
                result = self.compare(csv_bytes(reversed(list(self.gt.items()))), phase, True)
                self.assertEqual((result["sacrebleu"], result["cer"], result["exact_match"]), (100.0, 0.0, 1.0))
                self.assertEqual(result["n"], count)

    def test_bom_header_id_and_prediction_whitespace(self):
        rows = [(f" {key} ", " \t" + value.replace(" ", " \t ") + " \n") for key, value in self.gt.items()]
        result = self.compare(b"\xef\xbb\xbf" + csv_bytes(rows, (" id ", " van_ban_chuan ")), valid=True)
        self.assertEqual(result["exact_match"], 1.0)

    def test_case_accents_punctuation_and_empty_predictions_are_not_normalized_away(self):
        rows = [("pub_00001", "xin chao ban hom nay ban khoe khong"), ("pub_00002", "")]
        result = self.compare(csv_bytes(rows), valid=True)
        self.assertGreater(result["cer"], 0)
        self.assertEqual(result["exact_match"], 0)
        self.assertEqual(result["empty_predictions"], 1)

    def test_rejects_invalid_csv_with_identical_messages(self):
        rows = list(self.gt.items())
        cases = {
            "empty": b"", "invalid_utf8": b"\xff", "header_only": csv_bytes([]),
            "wrong_header": csv_bytes(rows, ("id", "text")),
            "extra_header": csv_bytes(rows, ("id", "van_ban_chuan", "extra")),
            "missing": csv_bytes(rows[1:]), "duplicate": csv_bytes(rows + [rows[0]]),
            "other_phase_duplicate": csv_bytes(rows + [rows[-1]]),
            "unknown": csv_bytes(rows + [("pub_99999", "x")]),
            "wrong_prefix": csv_bytes(rows + [("train_00001", "x")]),
            "wrong_columns": csv_bytes(rows + [("pub_00001", "x", "extra")]),
            "many_errors": csv_bytes([(f"bad_{i}", "x") for i in range(30)]),
        }
        for name, data in cases.items():
            with self.subTest(case=name):
                self.compare(data, valid=False)

    def test_other_phase_unknown_id_is_ignored_like_original(self):
        self.compare(csv_bytes(list(self.gt.items()) + [("prv_unknown", "x")]), valid=True)
        self.compare(csv_bytes(list(self.gt.items()) + [("pub_unknown", "x")]), "private", True)

    def test_blank_lines_and_quoted_comma_newline(self):
        self.compare(csv_bytes(self.gt.items()) + b"\n\r\n", valid=True)
        rows = [("pub_00001", 'Xin chào, "bạn"!\nBạn khỏe không?'), ("pub_00002", self.gt["pub_00002"])]
        self.compare(csv_bytes(rows), valid=True)

    def test_file_size_limit_is_original_20_mib(self):
        with self.path.open("wb") as output:
            output.truncate(scorer.MAX_BYTES + 1)
        result = self.evaluator.validate(str(self.path), "public")
        self.assertFalse(result.is_valid)
        self.assertEqual(result.message, "File quá lớn (> 20 MB).")

    def test_missing_file_labels_and_invalid_phase(self):
        self.assertFalse(self.evaluator.validate(str(self.path), "public").is_valid)
        self.path.write_bytes(csv_bytes(self.gt.items()))
        self.assertFalse(self.evaluator.validate(str(self.path), "unsupported").is_valid)
        with self.assertRaises(ValueError):
            self.evaluator.evaluate(str(self.path), "unsupported")
        self.gt_path.unlink()
        self.assertFalse(self.evaluator.validate(str(self.path), "public").is_valid)
        with self.assertRaises(FileNotFoundError):
            self.evaluator.evaluate(str(self.path), "public")

    def test_environment_can_override_ground_truth(self):
        with patch.dict(os.environ, {"EVAL_2_NLP_TUNG_GROUND_TRUTH": str(self.gt_path)}):
            self.assertEqual(adapter.Eval2NlpTungEvaluator().get_ground_truth_path(), self.gt_path)

    def rewrite(self, path, data):
        previous = path.stat().st_mtime_ns
        path.write_bytes(data)
        os.utime(path, ns=(previous + 1_000_000_000, previous + 1_000_000_000))

    def test_cache_reuses_only_matching_submission_labels_and_phase(self):
        self.path.write_bytes(csv_bytes(self.gt.items()))
        with patch.object(adapter, "score_submission", wraps=scorer.score_submission) as score:
            self.assertTrue(self.evaluator.validate(str(self.path), "public").is_valid)
            self.assertEqual(self.evaluator.evaluate(str(self.path), "public").score, 100)
            self.assertEqual(score.call_count, 1)
            self.evaluator.evaluate(str(self.path), "private")
            self.assertEqual(score.call_count, 2)
            self.rewrite(self.path, csv_bytes([(key, "sai") for key in self.gt]))
            self.assertLess(self.evaluator.evaluate(str(self.path), "public").score, 100)
            self.assertEqual(score.call_count, 3)
            self.rewrite(self.gt_path, csv_bytes([(key, "sai") for key in self.gt]))
            self.assertEqual(self.evaluator.evaluate(str(self.path), "public").details["exact_match"], 1)
            self.assertEqual(score.call_count, 4)

    def test_real_ground_truth_has_5000_ids_per_phase_and_perfect_scores(self):
        gt = scorer.load_ground_truth(str(adapter.DEFAULT_GROUND_TRUTH))
        self.assertEqual(len(gt), 10000)
        self.evaluator.get_ground_truth_path = lambda: adapter.DEFAULT_GROUND_TRUTH
        self.path.write_bytes(csv_bytes(gt.items()))
        for phase, count in (("public", 5000), ("private", 5000), ("all", 10000)):
            with self.subTest(phase=phase):
                self.assertTrue(self.evaluator.validate(str(self.path), phase).is_valid)
                result = self.evaluator.evaluate(str(self.path), phase)
                self.assertEqual(result.score, 100)
                self.assertEqual(result.details["n"], count)
                self.assertEqual(result.details["cer"], 0)
                self.assertEqual(result.details["exact_match"], 1)

    @unittest.skipUnless((SOURCE / "scorer.py").exists(), "Original project is optional at runtime")
    def test_source_scorer_and_ground_truth_are_byte_identical(self):
        self.assertEqual(Path(scorer.__file__).read_bytes(), (SOURCE / "scorer.py").read_bytes())
        self.assertEqual(adapter.DEFAULT_GROUND_TRUTH.read_bytes(), (SOURCE / "secret" / "ground_truth.csv").read_bytes())

    @unittest.skipUnless((SOURCE / "scorer.py").exists(), "Original project is optional at runtime")
    def test_actual_source_fixtures_produce_identical_results(self):
        spec = importlib.util.spec_from_file_location("original_tung_scorer", SOURCE / "scorer.py")
        original = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(original)
        fixtures = sorted((SOURCE.parent / "contest_web" / "tests" / "fixtures").glob("*.csv"))
        self.assertTrue(fixtures)
        self.evaluator.get_ground_truth_path = lambda: adapter.DEFAULT_GROUND_TRUTH
        for fixture in fixtures:
            self.path.write_bytes(fixture.read_bytes())
            for phase in ("public", "private", "all"):
                with self.subTest(fixture=fixture.name, phase=phase):
                    expected = original.score_submission(fixture.read_bytes(), str(SOURCE / "secret" / "ground_truth.csv"), phase)
                    self.assertTrue(expected["ok"])
                    self.assertEqual(self.evaluator.evaluate(str(self.path), phase).details, expected)


if __name__ == "__main__":
    unittest.main()
