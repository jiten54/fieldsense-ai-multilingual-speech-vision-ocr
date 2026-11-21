"""ONNX Runtime Dynamic & Static INT8 Quantisation (Module F)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def quantize_dynamic_int8(fp32_onnx: str, int8_onnx: str) -> dict[str, object]:
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except ImportError as exc:
        print(json.dumps({"status": "MISSING_ML_DEPENDENCIES", "error": str(exc)}, indent=2))
        sys.exit(2)

    Path(int8_onnx).parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=fp32_onnx,
        model_output=int8_onnx,
        weight_type=QuantType.QUInt8,
    )
    fp32_mb = Path(fp32_onnx).stat().st_size / (1024 * 1024)
    int8_mb = Path(int8_onnx).stat().st_size / (1024 * 1024)
    return {
        "fp32_path": fp32_onnx,
        "int8_path": int8_onnx,
        "fp32_size_mb": round(fp32_mb, 3),
        "int8_size_mb": round(int8_mb, 3),
        "compression_ratio": round(fp32_mb / max(int8_mb, 1e-6), 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Quantize ONNX model to INT8.")
    parser.add_argument("--input", default="deployment/onnx/vision_cnn_fp32.onnx")
    parser.add_argument("--output", default="deployment/onnx/vision_cnn_int8.onnx")
    args = parser.parse_args()
    print(json.dumps(quantize_dynamic_int8(args.input, args.output), indent=2))


if __name__ == "__main__":
    main()
