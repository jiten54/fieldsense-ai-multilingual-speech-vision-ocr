"""Document OCR & Preprocessing Pipeline (Module B2).

Implements OpenCV deskewing, denoising, CLAHE contrast enhancement,
and Tesseract / PaddleOCR text & bounding-box extraction with CER/WER evaluation.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.evaluation.speech_metrics import evaluate_pair  # noqa: E402


def preprocess_document_image(image_path: str, output_path: str) -> dict[str, Any]:
    """Apply grayscale conversion, denoising, CLAHE contrast enhancement, and deskewing."""
    import cv2  # type: ignore
    import numpy as np

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not decode image: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Estimate skew angle from foreground coordinates
    thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    angle = 0.0
    if len(coords) > 20:
        rect = cv2.minAreaRect(coords)
        raw_angle = rect[-1]
        angle = -(90 + raw_angle) if raw_angle < -45 else -raw_angle
        if abs(angle) > 15.0:
            angle = 0.0
    if abs(angle) > 0.3:
        h, w = enhanced.shape[:2]
        mat = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        enhanced = cv2.warpAffine(
            enhanced, mat, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(output_path, enhanced)
    return {"deskew_angle_deg": round(float(angle), 2), "preprocessed_path": output_path}


def extract_text_tesseract(image_path: str, preprocess: bool = True) -> dict[str, Any]:
    try:
        import pytesseract  # type: ignore
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"pytesseract/Pillow not installed: {exc}") from exc

    t0 = time.perf_counter()
    target = image_path
    prep_info: dict[str, Any] = {}
    if preprocess:
        try:
            prep_path = str(Path(image_path).with_suffix(".prep.png"))
            prep_info = preprocess_document_image(image_path, prep_path)
            target = prep_path
        except ImportError:
            prep_info = {"note": "opencv-python not installed; running direct OCR"}

    data = pytesseract.image_to_data(Image.open(target), output_type=pytesseract.Output.DICT)
    words = []
    confs = []
    for i, text in enumerate(data["text"]):
        token = text.strip()
        if not token:
            continue
        conf = float(data["conf"][i]) if str(data["conf"][i]) != "-1" else 0.0
        confs.append(conf)
        words.append(
            {
                "text": token,
                "confidence": conf,
                "bbox": [
                    int(data["left"][i]),
                    int(data["top"][i]),
                    int(data["width"][i]),
                    int(data["height"][i]),
                ],
            }
        )

    full_text = " ".join(w["text"] for w in words)
    latency_ms = (time.perf_counter() - t0) * 1000.0
    avg_conf = sum(confs) / max(len(confs), 1)

    return {
        "engine": "tesseract",
        "text": full_text,
        "mean_confidence": round(avg_conf, 2),
        "word_count": len(words),
        "words": words,
        "preprocessing": prep_info,
        "latency_ms": round(latency_ms, 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run FieldSense OCR extraction and optional eval.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--reference", default=None)
    parser.add_argument("--no-preprocess", action="store_true")
    args = parser.parse_args()
    try:
        out = extract_text_tesseract(args.input, preprocess=not args.no_preprocess)
        if args.reference:
            metrics = evaluate_pair(args.reference, out["text"])
            out["evaluation"] = {"wer": metrics.wer, "cer": metrics.cer}
        print(json.dumps(out, indent=2))
    except Exception as exc:
        print(json.dumps({"status": "UNAVAILABLE", "error": str(exc)}, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()
