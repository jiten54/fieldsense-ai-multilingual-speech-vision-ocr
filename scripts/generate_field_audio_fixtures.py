"""Generate deterministic synthetic field audio WAV fixtures for testing and benchmarks.

These are synthetic acoustic waveforms (formant-modulated tones + controlled noise/clipping)
for verifying DSP quality checks, augmentation, and offline pipelines without uploading
any human voice or sensitive recordings.
"""

from __future__ import annotations

import json
import math
import random
import struct
import wave
from pathlib import Path


def _write_wav(path: Path, samples: list[float], sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = [max(-32768, min(32767, int(round(s * 32767.0)))) for s in samples]
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))


def _synth_formant_phrase(duration_sec: float, sr: int, seed: int = 10) -> list[float]:
    rng = random.Random(seed)
    n = int(duration_sec * sr)
    samples = [0.0] * n
    # Create syllable-like amplitude envelope bursts over formant harmonics
    for i in range(n):
        t = i / float(sr)
        # 2.5 syllables per second with short pauses
        syllable_env = max(0.0, math.sin(2.0 * math.pi * 1.4 * t)) ** 1.6
        if t < 0.25 or t > duration_sec - 0.2:
            syllable_env = 0.0
        f0 = 145.0 + 25.0 * math.sin(2.0 * math.pi * 0.7 * t)
        sig = (
            0.45 * math.sin(2.0 * math.pi * f0 * t)
            + 0.30 * math.sin(2.0 * math.pi * (f0 * 3.1) * t)
            + 0.15 * math.sin(2.0 * math.pi * (f0 * 5.4) * t)
        )
        samples[i] = 0.42 * syllable_env * sig + rng.gauss(0.0, 0.002)
    return samples


def generate_all(output_dir: str = "data/fixtures/audio") -> list[dict[str, object]]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(42)

    clean = _synth_formant_phrase(3.2, 16000, seed=11)
    noisy = [s + rng.gauss(0.0, 0.085) for s in clean]
    low_vol = [s * 0.04 for s in clean]
    clipped = [max(-1.0, min(1.0, s * 4.5)) for s in clean]
    narrow_8k = _synth_formant_phrase(3.0, 8000, seed=22)

    specs = [
        ("clean_16khz.wav", clean, 16000, "Clean synthetic 16kHz baseline utterance"),
        ("noisy_street_16khz.wav", noisy, 16000, "Synthetic speech + street Gaussian noise (~8dB SNR)"),
        ("low_volume_16khz.wav", low_vol, 16000, "Attenuated distant-microphone synthetic recording"),
        ("clipped_mic_16khz.wav", clipped, 16000, "Overdriven clipped synthetic microphone capture"),
        ("narrowband_8khz.wav", narrow_8k, 8000, "8kHz narrowband rural telephony sample"),
    ]

    manifest = []
    for fname, sig, sr, desc in specs:
        fpath = out / fname
        _write_wav(fpath, sig, sr)
        manifest.append(
            {
                "filename": fname,
                "path": str(fpath),
                "sample_rate_hz": sr,
                "duration_sec": round(len(sig) / float(sr), 2),
                "description": desc,
                "synthetic": True,
                "license": "CC0-1.0 (Generated Synthetic Field Fixture)",
            }
        )

    (out / "fixtures_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    return manifest


if __name__ == "__main__":
    items = generate_all()
    print(f"Generated {len(items)} synthetic WAV fixtures in data/fixtures/audio/")
