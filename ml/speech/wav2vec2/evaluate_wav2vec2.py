"""Evaluate wav2vec2 CTC checkpoint on test manifest using WER and CER."""

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


def evaluate(checkpoint: str, test_manifest: str, output_json: str) -> None:
    try:
        import soundfile as sf
        import torch
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    except ImportError as exc:
        print(json.dumps({"status": "MISSING_ML_DEPENDENCIES", "error": str(exc)}, indent=2))
        sys.exit(2)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = Wav2Vec2Processor.from_pretrained(checkpoint)
    model = Wav2Vec2ForCTC.from_pretrained(checkpoint).to(device)
    model.eval()

    rows = [json.loads(l) for l in Path(test_manifest).read_text(encoding="utf-8").splitlines() if l.strip()]
    records = []
    latencies = []
    for row in rows:
        audio, sr = sf.read(row["audio_path"])
        t0 = time.perf_counter()
        inputs = processor(audio, sampling_rate=sr, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            logits = model(inputs.input_values).logits
        pred_ids = torch.argmax(logits, dim=-1)
        hyp = processor.batch_decode(pred_ids)[0]
        latencies.append((time.perf_counter() - t0) * 1000.0)
        records.append(
            {
                "id": row.get("id", row["audio_path"]),
                "language": row.get("language", "en"),
                "condition": row.get("condition", "standard"),
                "reference": row["transcript"],
                "hypothesis": hyp,
            }
        )

    report = evaluate_corpus(records)
    report["checkpoint"] = checkpoint
    report["device"] = device
    report["avg_latency_ms"] = round(sum(latencies) / max(len(latencies), 1), 2)
    Path(output_json).parent.mkdir(parents=True, exist_ok=True)
    Path(output_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate wav2vec2 CTC checkpoint.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--test-manifest", required=True)
    parser.add_argument("--output", default="experiments/results/wav2vec2_eval.json")
    args = parser.parse_args()
    evaluate(args.checkpoint, args.test_manifest, args.output)


if __name__ == "__main__":
    main()
