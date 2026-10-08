"""Caching may reduce I/O, but changed predictions/labels must still change the score."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
from app.evaluators.eval_1_cv_hico import Eval1CvHicoEvaluator, CLASS_COLUMNS, SPLITS_FILES


class EvaluatorCacheTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='evaluator-cache-')
        self.addCleanup(self.temp.cleanup)
        self.labels = Path(self.temp.name) / 'labels.csv'
        self.prediction = Path(self.temp.name) / 'public_submit.csv'
        self.ids = ['HICO_test2015_00000001.jpg', 'HICO_test2015_00000002.jpg']
        self.write(self.labels, [1, 0])
        self.write(self.prediction, [.9, .1])
        self.evaluator = Eval1CvHicoEvaluator()
        self.evaluator.get_labels_path = lambda split: self.labels
        self.split = patch.dict(SPLITS_FILES, {'public': {**SPLITS_FILES['public'], 'expected_rows': 2}})
        self.split.start()
        self.addCleanup(self.split.stop)

    def write(self, path, values):
        previous = path.stat().st_mtime_ns if path.exists() else 0
        frame = pd.DataFrame(np.repeat(np.array(values)[:, None], 600, axis=1), columns=CLASS_COLUMNS)
        frame.insert(0, 'image_id', self.ids)
        frame.to_csv(path, index=False)
        if previous:
            os.utime(path, ns=(previous + 1_000_000_000, previous + 1_000_000_000))

    def test_validated_and_fresh_paths_produce_identical_scores(self):
        self.assertTrue(self.evaluator.validate(str(self.prediction), 'public', 'public_submit.csv').is_valid)
        self.assertEqual(self.evaluator.evaluate(str(self.prediction), 'public').score, 1.0)
        self.assertEqual(self.evaluator.evaluate(str(self.prediction), 'public').score, 1.0)

    def test_changed_prediction_does_not_reuse_validated_frame(self):
        self.evaluator.validate(str(self.prediction), 'public', 'public_submit.csv')
        self.write(self.prediction, [.1, .9])
        self.assertEqual(self.evaluator.evaluate(str(self.prediction), 'public').score, .5)

    def test_changed_labels_invalidate_cache_and_unknown_labels_remain_masked(self):
        self.assertEqual(self.evaluator.evaluate(str(self.prediction), 'public').score, 1.0)
        self.write(self.labels, [0, 1])
        self.assertEqual(self.evaluator.evaluate(str(self.prediction), 'public').score, .5)
        self.write(self.labels, [1, -1])
        self.assertEqual(self.evaluator.evaluate(str(self.prediction), 'public').score, 1.0)

    def test_numeric_fast_path_still_rejects_nan_and_out_of_range(self):
        self.write(self.prediction, [np.nan, .1])
        self.assertFalse(self.evaluator.validate(str(self.prediction), 'public', 'public_submit.csv').is_valid)
        self.write(self.prediction, [1.1, .1])
        self.assertFalse(self.evaluator.validate(str(self.prediction), 'public', 'public_submit.csv').is_valid)

    def test_cv_accepts_arbitrary_upload_names_for_both_splits(self):
        with patch.dict(SPLITS_FILES, {'private': {**SPLITS_FILES['private'], 'expected_rows': 2}}):
            for split in ('public', 'private'):
                for name in ('model_v2.csv', 'dự đoán đội 01 (bản cuối).CSV', 'public_submit.csv'):
                    with self.subTest(split=split, filename=name):
                        uploaded = Path(self.temp.name) / name
                        uploaded.write_bytes(self.prediction.read_bytes())
                        result = self.evaluator.validate(str(uploaded), split, name)
                        self.assertTrue(result.is_valid, result.message)
                        self.assertEqual(result.details['filename'], name)
                        self.assertEqual(self.evaluator.evaluate(str(uploaded), split).score, 1.0)

    def test_arbitrary_name_does_not_bypass_csv_validation(self):
        name = 'dự đoán đội 01.csv'
        self.write(self.prediction, [1.1, .1])
        self.assertFalse(self.evaluator.validate(str(self.prediction), 'public', name).is_valid)
        non_csv = Path(self.temp.name) / 'prediction.txt'
        non_csv.write_bytes(self.prediction.read_bytes())
        self.assertFalse(self.evaluator.validate(str(non_csv), 'public', name).is_valid)


if __name__ == '__main__':
    unittest.main()
