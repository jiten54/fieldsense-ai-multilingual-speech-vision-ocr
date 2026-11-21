"""Real Image Quality Assessment module for FieldSense AI (Module B3).

Decodes PNG/JPG/BMP images via ffmpeg to raw grayscale PGM buffers and computes
exact pixel-level quality checks:
- Resolution check (width x height)
- Aspect ratio & orientation check
- Mean luminance (low-light vs overexposure)
- Underexposure / overexposure pixel percentages
- 3x3 Laplacian variance blur detection
- Actionable field warnings
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class ImageQualityReport:
    file_path: str
    width: int
    height: int
    megapixels: float
    orientation: str
    mean_luminance: float
    dynamic_range: int
    underexposed_pct: float
    overexposed_pct: float
    laplacian_variance: float
    status: str  # PASS | WARN | FAIL
    warnings: list[str]
    recommendations: list[str]


def _decode_grayscale_pgm(image_path: str) -> tuple[int, int, bytes]:
    """Decode any image to an 8-bit binary PGM buffer using ffmpeg."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg is required to decode image files.")

    with tempfile.NamedTemporaryFile(suffix=".pgm", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        # Probe/decode at max 1024px wide for fast, consistent Laplacian measurement
        cmd = [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-i",
            image_path,
            "-vf",
            "format=gray",
            "-f",
            "image2",
            tmp_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        data = Path(tmp_path).read_bytes()
        if not data.startswith(b"P5"):
            raise ValueError("Decoded image is not valid binary PGM (P5).")

        # Parse PGM header skipping optional comment lines
        idx = 2
        tokens: list[bytes] = []
        n = len(data)
        while len(tokens) < 3 and idx < n:
            while idx < n and data[idx] in b" \t\r\n":
                idx += 1
            if idx < n and data[idx] == ord("#"):
                while idx < n and data[idx] != ord("\n"):
                    idx += 1
                continue
            start = idx
            while idx < n and data[idx] not in b" \t\r\n":
                idx += 1
            tokens.append(data[start:idx])
        # Single whitespace byte after maxval
        idx += 1
        width = int(tokens[0])
        height = int(tokens[1])
        pixels = data[idx : idx + width * height]
        if len(pixels) < width * height:
            raise ValueError("Truncated image pixel buffer.")
        return width, height, pixels
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def analyze_image_file(image_path: str) -> ImageQualityReport:
    """Compute exact resolution, exposure, luminance, and Laplacian blur metrics."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    width, height, pixels = _decode_grayscale_pgm(image_path)
    total = width * height
    megapixels = round(total / 1_000_000.0, 3)

    if width > height:
        orientation = "landscape"
    elif height > width:
        orientation = "portrait"
    else:
        orientation = "square"

    # Compute luminance stats (subsample stride 1 for accuracy up to 1MP, stride 2 if huge)
    stride = 1 if total <= 1_500_000 else 2
    sampled = pixels[::stride]
    s_len = len(sampled)
    mean_lum = sum(sampled) / float(s_len)
    min_val = min(sampled)
    max_val = max(sampled)
    dynamic_range = int(max_val - min_val)
    under_pct = (sum(1 for p in sampled if p < 38) / float(s_len)) * 100.0
    over_pct = (sum(1 for p in sampled if p > 235) / float(s_len)) * 100.0

    # Downscale analysis grid to <= 512px wide for fast, resolution-independent Laplacian variance
    step_x = max(1, width // 512)
    step_y = max(1, height // 512)
    gw = width // step_x
    gh = height // step_y

    lap_values: list[int] = []
    if gw >= 3 and gh >= 3:
        for gy in range(1, gh - 1):
            y = gy * step_y
            row_prev = (y - step_y) * width
            row_curr = y * width
            row_next = (y + step_y) * width
            for gx in range(1, gw - 1):
                x = gx * step_x
                center = pixels[row_curr + x]
                lap = (
                    pixels[row_prev + x]
                    + pixels[row_next + x]
                    + pixels[row_curr + x - step_x]
                    + pixels[row_curr + x + step_x]
                    - 4 * center
                )
                lap_values.append(lap)

    if lap_values:
        mean_lap = sum(lap_values) / float(len(lap_values))
        lap_var = sum((v - mean_lap) ** 2 for v in lap_values) / float(len(lap_values))
    else:
        lap_var = 0.0

    warnings: list[str] = []
    recommendations: list[str] = []

    if width < 640 or height < 480:
        warnings.append(
            f"LOW_RESOLUTION: {width}x{height}px is below minimum 640x480 document threshold."
        )
        recommendations.append("Capture closer to document at higher camera resolution.")
    if mean_lum < 75.0 or under_pct > 45.0:
        warnings.append(
            f"LOW_LIGHT: Mean luminance {mean_lum:.1f}/255 ({under_pct:.1f}% dark pixels)."
        )
        recommendations.append("Enable diffuse daylight/flash or apply CLAHE contrast enhancement.")
    if mean_lum > 215.0 or over_pct > 35.0:
        warnings.append(
            f"OVEREXPOSED: Mean luminance {mean_lum:.1f}/255 ({over_pct:.1f}% saturated pixels)."
        )
        recommendations.append("Reduce direct glare and re-capture from an oblique lighting angle.")
    if lap_var < 85.0:
        warnings.append(
            f"BLURRY_IMAGE: Laplacian variance {lap_var:.1f} is below 85.0 sharpness threshold."
        )
        recommendations.append("Hold device steady, tap to focus on printed text, and re-capture.")
    if dynamic_range < 90:
        warnings.append(
            f"LOW_CONTRAST: Dynamic range is {dynamic_range} intensity levels (< 90)."
        )
        recommendations.append("Apply adaptive histogram normalization before OCR.")

    if lap_var < 35.0 or width < 320 or height < 240 or mean_lum < 35.0:
        status = "FAIL"
    elif warnings:
        status = "WARN"
    else:
        status = "PASS"

    return ImageQualityReport(
        file_path=str(image_path),
        width=width,
        height=height,
        megapixels=megapixels,
        orientation=orientation,
        mean_luminance=round(mean_lum, 2),
        dynamic_range=dynamic_range,
        underexposed_pct=round(under_pct, 2),
        overexposed_pct=round(over_pct, 2),
        laplacian_variance=round(lap_var, 2),
        status=status,
        warnings=warnings,
        recommendations=recommendations,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze document/field image quality.")
    parser.add_argument("--input", required=True, help="Path to image file.")
    args = parser.parse_args()
    report = analyze_image_file(args.input)
    print(json.dumps(asdict(report), indent=2))


if __name__ == "__main__":
    main()
