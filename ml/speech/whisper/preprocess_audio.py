"""Audio preprocessing pipeline for Whisper and wav2vec2 training.

Validates audio files, resamples to 16 kHz mono PCM WAV via torchaudio/ffmpeg,
filters corrupted or out-of-range duration samples, and generates clean manifests.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import wave
from pathlib import Path
from typing import Any


def _probe_wav(path: str) -> tuple[int, int, float]:
    with wave.open(path, "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        frames = wf.getnframes()
        dur = frames / float(max(sr, 1))
        return sr, ch, dur


def resample_to_16k_mono(src: str, dst: str, target_sr: int = 16000) -> float:
    """Resample an audio file to 16 kHz mono 16-bit WAV and return duration in seconds."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg is required for audio resampling.")
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-v",
        "error",
        "-i",
        src,
        "-ar",
        str(target_sr),
        "-ac",
        "1",
        "-sample_fmt",
        "s16",
        dst,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    _, _, dur = _probe_wav(dst)
    return dur


def prepare_manifest(
    input_manifest: str,
    output_manifest: str,
    processed_dir: str,
    min_duration: float = 0.5,
    max_duration: float = 30.0,
    target_sr: int = 16000,
) -> dict[str, Any]:
    """Clean, validate, and resample a JSONL speech manifest."""
    records = []
    skipped = []
    in_path = Path(input_manifest)
    out_dir = Path(processed_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for line in in_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        audio_path = item.get("audio_path", "")
        transcript = str(item.get("transcript", "")).strip()
        sample_id = str(item.get("id", Path(audio_path).stem))

        if not audio_path or not os.path.exists(audio_path):
            skipped.append({"id": sample_id, "reason": "missing_audio_file"})
            continue
        if not transcript:
            skipped.append({"id": sample_id, "reason": "empty_transcript"})
            continue

        dst_wav = str(out_dir / f"{sample_id}.wav")
        try:
            dur = resample_to_16k_mono(audio_path, dst_wav, target_sr=target_sr)
        except Exception as exc:
            skipped.append({"id": sample_id, "reason": f"decode_error:{exc}"})
            continue

        if dur < min_duration or dur > max_duration:
            skipped.append({"id": sample_id, "reason": f"duration_out_of_range:{dur:.2f}s"})
            continue

        records.append(
            {
                "id": sample_id,
                "audio_path": dst_wav,
                "transcript": transcript,
                "language": item.get("language", "en"),
                "duration_sec": round(dur, 3),
                "sample_rate": target_sr,
            }
        )

    Path(output_manifest).parent.mkdir(parents=True, exist_ok=True)
    with open(output_manifest, "w", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    summary = {
        "input_manifest": input_manifest,
        "output_manifest": output_manifest,
        "kept_count": len(records),
        "skipped_count": len(skipped),
        "skipped": skipped,
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Preprocess audio manifest for ASR training.")
    parser.add_argument("--input-manifest", required=True)
    parser.add_argument("--output-manifest", required=True)
    parser.add_argument("--processed-dir", default="data/processed/audio")
    parser.add_argument("--min-duration", type=float, default=0.5)
    parser.add_argument("--max-duration", type=float, default=30.0)
    args = parser.parse_args()
    summary = prepare_manifest(
        args.input_manifest,
        args.output_manifest,
        args.processed_dir,
        args.min_duration,
        args.max_duration,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
