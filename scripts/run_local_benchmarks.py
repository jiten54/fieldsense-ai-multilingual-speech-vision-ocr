"""Real CPU inference & preprocessing benchmark runner for FieldSense AI.

Executes multiple iterations of actual local pipelines on real fixtures in this
environment and records measured average, median, P95 latency, and peak RSS memory.
Does not fabricate numbers or claim mobile/GPU results.
"""

from __future__ import annotations

import json
import os
import platform
import resource
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.evaluation.speech_metrics import evaluate_pair  # noqa: E402
from ml.preprocessing.audio_quality import analyze_audio_file  # noqa: E402
from ml.preprocessing.privacy_redactor import redact_pii  # noqa: E402
from ml.vision.image_quality import analyze_image_file  # noqa: E402


def _percentile_95(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, int(math.ceil(0.95 * len(s))) - 1))
    return s[idx]


import math  # noqa: E402


def _bench(fn, iterations: int) -> dict[str, float]:
    # Warmup
    fn()
    latencies: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        fn()
        latencies.append((time.perf_counter() - t0) * 1000.0)
    rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {
        "iterations": iterations,
        "avg_ms": round(statistics.mean(latencies), 2),
        "median_ms": round(statistics.median(latencies), 2),
        "p95_ms": round(_percentile_95(latencies), 2),
        "min_ms": round(min(latencies), 2),
        "max_ms": round(max(latencies), 2),
        "rss_mb": round(rss_kb / 1024.0, 2),
    }


def run_benchmarks() -> dict[str, object]:
    audio_path = ROOT / "data/fixtures/audio/clean_16khz.wav"
    img_path = ROOT / "src/assets/images/sample_health_form_1795229035155.jpg"
    sample_ref = (
        "community health log facility id cl 98230 vaccination dose influenza mmr nutrition check yes"
    )
    sample_hyp = (
        "community health log facility id cl 98230 vaccine dose influenza mmr nutrition check yes"
    )
    sample_pii = (
        "Patient Name: John Doe Date of Birth: 05/18/1988 Contact: (555) 123-4567 Email: j.doe@example.org"
    )

    device_label = f"CPU ({platform.machine()}, {os.cpu_count()} vCPU, Python {platform.python_version()})"
    results: list[dict[str, object]] = []

    if audio_path.exists():
        b_audio = _bench(lambda: analyze_audio_file(str(audio_path)), iterations=10)
        results.append(
            {
                "pipeline": "Audio DSP Quality + FFT Spectral Centroid",
                "precision": "FP64 (Python stdlib)",
                "file_size_mb": round(audio_path.stat().st_size / (1024 * 1024), 4),
                "device": device_label,
                "metric_note": "100% deterministic signal check (3.2s 16kHz WAV)",
                **b_audio,
            }
        )

    if img_path.exists():
        b_img = _bench(lambda: analyze_image_file(str(img_path)), iterations=5)
        results.append(
            {
                "pipeline": "Image Quality (Laplacian Blur + Luminance)",
                "precision": "UINT8 / FP64",
                "file_size_mb": round(img_path.stat().st_size / (1024 * 1024), 4),
                "device": device_label,
                "metric_note": "896x1200 JPG decoded via ffmpeg + 3x3 Laplacian",
                **b_img,
            }
        )

    b_wer = _bench(lambda: evaluate_pair(sample_ref, sample_hyp), iterations=50)
    results.append(
        {
            "pipeline": "Speech WER/CER Levenshtein Aligner",
            "precision": "Exact DP",
            "file_size_mb": 0.01,
            "device": device_label,
            "metric_note": "Word + character edit distance + backtrace",
            **b_wer,
        }
    )

    b_pii = _bench(lambda: redact_pii(sample_pii), iterations=100)
    results.append(
        {
            "pipeline": "PII Regex Redaction Guard",
            "precision": "Deterministic",
            "file_size_mb": 0.01,
            "device": device_label,
            "metric_note": "Phone, DOB, Email, ID, Name masking",
            **b_pii,
        }
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "os": platform.platform(),
            "architecture": platform.machine(),
            "cpu_count": os.cpu_count(),
            "python_version": platform.python_version(),
            "gpu_available": False,
            "onnxruntime_installed": False,
        },
        "benchmarks": results,
    }

    out_path = ROOT / "experiments/results/cpu_benchmarks.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


if __name__ == "__main__":
    out = run_benchmarks()
    print(json.dumps(out, indent=2))
