"""Controlled deterministic audio robustness augmentation for Module A4.

Creates reproducible degraded versions of clean WAV files to benchmark ASR
and quality check resilience under field conditions:
- background_noise (controlled Gaussian noise at target SNR)
- low_volume (-18 dB attenuation)
- clipped_mic (+14 dB overdrive hard clipping)
- narrowband_8khz (8 kHz downsampled + upsampled telephone/low-bandwidth profile)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import struct
import wave
from pathlib import Path
from typing import Literal

AugmentationMode = Literal[
    "background_noise", "low_volume", "clipped_mic", "narrowband_8khz"
]


def _clamp16(val: float) -> int:
    if val > 32767.0:
        return 32767
    if val < -32768.0:
        return -32768
    return int(round(val))


def augment_wav(
    input_wav: str,
    output_wav: str,
    mode: AugmentationMode,
    seed: int = 42,
    snr_db: float = 8.0,
) -> dict[str, object]:
    """Apply deterministic field degradation to a 16-bit mono WAV file."""
    rng = random.Random(seed)
    with wave.open(input_wav, "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        if sw != 2:
            raise ValueError("Only 16-bit PCM WAV inputs are supported for augmentation.")
        frames = wf.readframes(wf.getnframes())

    raw = struct.unpack(f"<{len(frames)//2}h", frames)
    if ch > 1:
        samples = [
            sum(raw[i : i + ch]) / float(ch) for i in range(0, len(raw), ch)
        ]
    else:
        samples = [float(x) for x in raw]

    n = len(samples)
    if mode == "background_noise":
        sig_rms = math.sqrt(sum(x * x for x in samples) / max(n, 1))
        noise_rms = sig_rms / (10.0 ** (snr_db / 20.0))
        out_samples = [
            _clamp16(x + rng.gauss(0.0, noise_rms)) for x in samples
        ]
        out_sr = sr
        notes = f"Deterministic Gaussian noise added at target SNR={snr_db} dB (seed={seed})."
    elif mode == "low_volume":
        gain = 10.0 ** (-18.0 / 20.0)
        out_samples = [_clamp16(x * gain) for x in samples]
        out_sr = sr
        notes = "Attenuated by -18 dB to simulate distant field microphone."
    elif mode == "clipped_mic":
        gain = 10.0 ** (14.0 / 20.0)
        out_samples = [_clamp16(x * gain) for x in samples]
        out_sr = sr
        notes = "Overdriven by +14 dB and hard-clipped at 16-bit full scale."
    elif mode == "narrowband_8khz":
        # Simple 2x decimation average when source is 16kHz
        step = max(1, sr // 8000)
        decimated = [
            sum(samples[i : i + step]) / float(len(samples[i : i + step]))
            for i in range(0, n, step)
        ]
        out_samples = [_clamp16(x) for x in decimated]
        out_sr = 8000
        notes = f"Decimated from {sr} Hz to 8000 Hz narrowband channel profile."
    else:
        raise ValueError(f"Unsupported augmentation mode: {mode}")

    Path(output_wav).parent.mkdir(parents=True, exist_ok=True)
    with wave.open(output_wav, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(out_sr)
        wf.writeframes(struct.pack(f"<{len(out_samples)}h", *out_samples))

    return {
        "input_wav": input_wav,
        "output_wav": output_wav,
        "mode": mode,
        "sample_rate_hz": out_sr,
        "num_samples": len(out_samples),
        "seed": seed,
        "notes": notes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply field audio augmentation.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--mode",
        required=True,
        choices=["background_noise", "low_volume", "clipped_mic", "narrowband_8khz"],
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--snr-db", type=float, default=8.0)
    args = parser.parse_args()
    meta = augment_wav(args.input, args.output, args.mode, args.seed, args.snr_db)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
