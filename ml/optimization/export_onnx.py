"""ONNX Export and Structural Parity Validation (Module F)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def export_vision_cnn_to_onnx(checkpoint_path: str, output_onnx: str, num_classes: int = 3) -> None:
    try:
        import numpy as np
        import onnx
        import onnxruntime as ort
        import torch
        import torch.nn as nn
        from torchvision import models
    except ImportError as exc:
        print(json.dumps({"status": "MISSING_ML_DEPENDENCIES", "error": str(exc)}, indent=2))
        sys.exit(2)

    model = models.mobilenet_v3_small(weights=None)
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, num_classes)
    if Path(checkpoint_path).exists():
        model.load_state_dict(torch.load(checkpoint_path, map_location="cpu"))
    model.eval()

    dummy_input = torch.randn(1, 3, 224, 224)
    Path(output_onnx).parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy_input,
        output_onnx,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=17,
    )

    onnx_model = onnx.load(output_onnx)
    onnx.checker.check_model(onnx_model)

    with torch.no_grad():
        torch_out = model(dummy_input).numpy()
    sess = ort.InferenceSession(output_onnx, providers=["CPUExecutionProvider"])
    ort_out = sess.run(["logits"], {"input": dummy_input.numpy()})[0]
    max_diff = float(np.max(np.abs(torch_out - ort_out)))

    print(
        json.dumps(
            {
                "onnx_path": output_onnx,
                "size_mb": round(Path(output_onnx).stat().st_size / (1024 * 1024), 3),
                "max_abs_diff_vs_pytorch": max_diff,
                "valid": max_diff < 1e-4,
            },
            indent=2,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Export PyTorch vision model to ONNX.")
    parser.add_argument("--checkpoint", default="experiments/results/vision/best_cnn.pt")
    parser.add_argument("--output", default="deployment/onnx/vision_cnn_fp32.onnx")
    parser.add_argument("--num-classes", type=int, default=3)
    args = parser.parse_args()
    export_vision_cnn_to_onnx(args.checkpoint, args.output, args.num_classes)


if __name__ == "__main__":
    main()
