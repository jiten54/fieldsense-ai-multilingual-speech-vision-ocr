"""ONNX Runtime CPU Latency & Memory Benchmarking (FP32 vs INT8)."""

from __future__ import annotations

import argparse
import json
import math
import platform
import resource
import statistics
import sys
import time
from pathlib import Path


def benchmark_onnx_cpu(model_path: str, precision: str, runs: int = 30) -> dict[str, object]:
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError as exc:
        print(json.dumps({"status": "MISSING_ML_DEPENDENCIES", "error": str(exc)}, indent=2))
        sys.exit(2)

    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    x = np.random.randn(1, 3, 224, 224).astype(np.float32)

    # Warmup
    for _ in range(3):
        sess.run(None, {input_name: x})

    times_ms: list[float] = []
    for _ in range(runs):
        t0 = time.perf_counter()
        sess.run(None, {input_name: x})
        times_ms.append((time.perf_counter() - t0) * 1000.0)

    times_ms.sort()
    p95 = times_ms[min(len(times_ms) - 1, max(0, int(math.ceil(0.95 * len(times_ms))) - 1))]
    rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
    return {
        "model_path": model_path,
        "precision": precision,
        "file_size_mb": round(Path(model_path).stat().st_size / (1024 * 1024), 3),
        "device": f"CPU ({platform.machine()})",
        "avg_ms": round(statistics.mean(times_ms), 2),
        "median_ms": round(statistics.median(times_ms), 2),
        "p95_ms": round(p95, 2),
        "rss_mb": round(rss_mb, 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark ONNX model on CPU.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--precision", default="FP32")
    parser.add_argument("--runs", type=int, default=30)
    args = parser.parse_args()
    print(json.dumps(benchmark_onnx_cpu(args.model, args.precision, args.runs), indent=2))


if __name__ == "__main__":
    main()
