"""Executable unit & integration test suite for FieldSense AI Python modules.

Compatible with both `python3 -m unittest` and `pytest`.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.services.sqlite_store import FieldSenseStore  # noqa: E402
from ml.evaluation.field_condition_suite import run_field_suite  # noqa: E402
from ml.evaluation.speech_metrics import evaluate_pair, normalize_text  # noqa: E402
from ml.preprocessing.annotation_validator import validate_annotations  # noqa: E402
from ml.preprocessing.audio_quality import analyze_audio_file  # noqa: E402
from ml.preprocessing.noise_augmentation import augment_wav  # noqa: E402
from ml.preprocessing.privacy_redactor import redact_pii  # noqa: E402
from ml.speech.wav2vec2.build_tokenizer import build_vocab_from_manifest  # noqa: E402
from ml.vision.image_quality import analyze_image_file  # noqa: E402


class TestSpeechMetrics(unittest.TestCase):
    def test_normalization_and_exact_wer_cer(self) -> None:
        self.assertEqual(normalize_text("Hello, World!"), "hello world")
        res = evaluate_pair("The child read four words", "The child read five words")
        self.assertAlmostEqual(res.wer, 0.2, places=3)
        self.assertEqual(res.word_substitutions, 1)
        self.assertEqual(res.word_hits, 4)

    def test_empty_hypothesis_penalizes_deletions(self) -> None:
        res = evaluate_pair("one two three", "")
        self.assertEqual(res.wer, 1.0)
        self.assertEqual(res.word_deletions, 3)


class TestPrivacyRedactor(unittest.TestCase):
    def test_redacts_sensitive_fields(self) -> None:
        raw = "Patient Name: Jane Doe Date of Birth: 04/12/1991 Contact: (555) 234-5678 Email: jane@clinic.org"
        res = redact_pii(raw)
        self.assertNotIn("Jane Doe", res.redacted_text)
        self.assertNotIn("04/12/1991", res.redacted_text)
        self.assertNotIn("234-5678", res.redacted_text)
        self.assertNotIn("jane@clinic.org", res.redacted_text)
        self.assertGreaterEqual(res.findings_count, 4)


class TestAudioAndImageQuality(unittest.TestCase):
    def test_audio_quality_and_augmentation(self) -> None:
        clean = ROOT / "data/fixtures/audio/clean_16khz.wav"
        self.assertTrue(clean.exists())
        rep = analyze_audio_file(str(clean))
        self.assertEqual(rep.sample_rate_hz, 16000)
        self.assertEqual(rep.status, "PASS")

        with tempfile.TemporaryDirectory() as td:
            clipped = str(Path(td) / "clipped.wav")
            augment_wav(str(clean), clipped, "clipped_mic")
            clip_rep = analyze_audio_file(clipped)
            self.assertGreater(clip_rep.clipping_ratio_pct, 1.0)
            self.assertIn(clip_rep.status, ("WARN", "FAIL"))

    def test_image_quality_clear_vs_lowlight(self) -> None:
        clear = ROOT / "src/assets/images/sample_health_form_1795229035155.jpg"
        low = ROOT / "src/assets/images/sample_lowlight_form_1795229036505.jpg"
        if clear.exists() and low.exists():
            r_clear = analyze_image_file(str(clear))
            r_low = analyze_image_file(str(low))
            self.assertEqual(r_clear.status, "PASS")
            self.assertLess(r_low.mean_luminance, 75.0)
            self.assertIn(r_low.status, ("WARN", "FAIL"))


class TestAnnotationValidatorAndTokenizer(unittest.TestCase):
    def test_detects_missing_media_and_duplicates(self) -> None:
        records = [
            {
                "id": "rec-1",
                "modality": "audio",
                "media_path": "data/fixtures/audio/clean_16khz.wav",
                "raw_transcript": "sample speech",
                "duration_sec": 3.2,
                "status": "APPROVED",
            },
            {
                "id": "rec-1",
                "modality": "audio",
                "media_path": "data/fixtures/audio/missing.wav",
                "raw_transcript": "",
                "duration_sec": 0.1,
                "status": "PENDING",
            },
        ]
        report = validate_annotations(records, base_dir=str(ROOT))
        self.assertFalse(report.ready_for_training)
        self.assertEqual(report.duplicate_ids, 1)
        self.assertEqual(report.missing_files, 1)
        self.assertEqual(report.empty_transcripts, 1)

    def test_build_wav2vec2_vocab(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            manifest = Path(td) / "m.jsonl"
            vocab_out = Path(td) / "vocab.json"
            manifest.write_text('{"transcript": "hello field"}\n', encoding="utf-8")
            vocab = build_vocab_from_manifest(str(manifest), str(vocab_out))
            self.assertIn("|", vocab)
            self.assertIn("[PAD]", vocab)
            self.assertIn("h", vocab)


class TestSQLiteStoreAndFieldSuite(unittest.TestCase):
    def test_idempotency_and_audit(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            store = FieldSenseStore(Path(td) / "test.db")
            self.assertTrue(store.register_idempotent("key-1", "health"))
            self.assertFalse(store.register_idempotent("key-1", "health"))
            store.append_audit("ML Engineer", "TEST", "unit", "OK", {"k": 1})
            self.assertEqual(len(store.list_audits()), 1)

    def test_field_condition_suite(self) -> None:
        summary = run_field_suite()
        self.assertEqual(summary["passed"], summary["total"])


if __name__ == "__main__":
    unittest.main()
