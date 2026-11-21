"""Single-file Whisper inference wrapper with singleton model cache."""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

_MODEL_CACHE: dict[str, tuple[Any, Any, str]] = {}


def transcribe_audio(
    audio_path: str, checkpoint: str = "openai/whisper-tiny", language: str = "en"
) -> dict[str, Any]:
    try:
        import soundfile as sf
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
    except ImportError as exc:
        raise RuntimeError(
            f"Whisper dependencies (torch, transformers, soundfile) not installed: {exc}"
        ) from exc

    if checkpoint not in _MODEL_CACHE:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        processor = WhisperProcessor.from_pretrained(checkpoint, language=language, task="transcribe")
        model = WhisperForConditionalGeneration.from_pretrained(checkpoint).to(device)
        model.eval()
        _MODEL_CACHE[checkpoint] = (processor, model, device)

    processor, model, device = _MODEL_CACHE[checkpoint]
    audio, sr = sf.read(audio_path)
    t0 = time.perf_counter()
    inputs = processor(audio, sampling_rate=sr, return_tensors="pt").input_features.to(device)
    with torch.no_grad():
        out = model.generate(inputs, return_dict_in_generate=True, output_scores=True)
    text = processor.batch_decode(out.sequences, skip_special_tokens=True)[0].strip()
    latency_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "model": checkpoint,
        "device": device,
        "language": language,
        "transcript": text,
        "latency_ms": round(latency_ms, 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Whisper inference on an audio file.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--checkpoint", default="openai/whisper-tiny")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()
    try:
        res = transcribe_audio(args.input, args.checkpoint, args.language)
        print(json.dumps(res, indent=2))
    except RuntimeError as exc:
        print(json.dumps({"status": "UNAVAILABLE", "error": str(exc)}, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()
