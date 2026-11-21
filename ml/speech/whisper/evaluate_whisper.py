"""Evaluate a Whisper checkpoint (pretrained or fine-tuned) on a test manifest."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.evaluation.speech_metrics import evaluate_corpus  # noqa: E402


def evaluate(checkpoint: str, test_manifest: str, output_json: str, language: str = "en") -> None:
    try:
        import soundfile as sf
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "status": "MISSING_ML_DEPENDENCIES",
                    "error": str(exc),
                    "instruction": "Install transformers, torch, and soundfile to evaluate Whisper.",
                },
                indent=2,
            )
        )
        sys.exit(2)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = WhisperProcessor.from_pretrained(checkpoint, language=language, task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(checkpoint).to(device)
    model.eval()

    rows = [json.loads(l) for l in Path(test_manifest).read_text(encoding="utf-8").splitlines() if l.strip()]
    eval_records = []
    latencies_ms = []

    for row in rows:
        audio, sr = sf.read(row["audio_path"])
        t0 = time.perf_counter()
        inputs = processor(audio, sampling_rate=sr, return_tensors="pt").input_features.to(device)
        with torch.no_grad():
            pred_ids = model.generate(inputs)
        hyp = processor.batch_decode(pred_ids, skip_special_tokens=True)[0]
        latencies_ms.append((time.perf_counter() - t0) * 1000.0)
        eval_records.append(
            {
                "id": row.get("id", row["audio_path"]),
                "language": row.get("language", language),
                "condition": row.get("condition", "standard"),
                "reference": row["transcript"],
                "hypothesis": hyp,
            }
        )

    report = evaluate_corpus(eval_records)
    report["checkpoint"] = checkpoint
    report["device"] = device
    report["avg_latency_ms"] = round(sum(latencies_ms) / max(len(latencies_ms), 1), 2)

    Path(output_json).parent.mkdir(parents=True, exist_ok=True)
    Path(output_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Whisper ASR model.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--test-manifest", required=True)
    parser.add_argument("--output", default="experiments/results/whisper_eval.json")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()
    evaluate(args.checkpoint, args.test_manifest, args.output, args.language)


if __name__ == "__main__":
    main()
