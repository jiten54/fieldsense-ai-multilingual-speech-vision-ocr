"""Single-file wav2vec2 CTC inference wrapper with cached model instance."""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

_CACHE: dict[str, tuple[Any, Any, str]] = {}


def transcribe_audio(
    audio_path: str, checkpoint: str = "facebook/wav2vec2-base-960h"
) -> dict[str, Any]:
    try:
        import soundfile as sf
        import torch
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    except ImportError as exc:
        raise RuntimeError(f"wav2vec2 dependencies not installed: {exc}") from exc

    if checkpoint not in _CACHE:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        processor = Wav2Vec2Processor.from_pretrained(checkpoint)
        model = Wav2Vec2ForCTC.from_pretrained(checkpoint).to(device)
        model.eval()
        _CACHE[checkpoint] = (processor, model, device)

    processor, model, device = _CACHE[checkpoint]
    audio, sr = sf.read(audio_path)
    t0 = time.perf_counter()
    inputs = processor(audio, sampling_rate=sr, return_tensors="pt", padding=True).to(device)
    with torch.no_grad():
        logits = model(inputs.input_values).logits
    pred_ids = torch.argmax(logits, dim=-1)
    text = processor.batch_decode(pred_ids)[0].strip()
    latency_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "model": checkpoint,
        "device": device,
        "transcript": text,
        "latency_ms": round(latency_ms, 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run wav2vec2 CTC inference.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--checkpoint", default="facebook/wav2vec2-base-960h")
    args = parser.parse_args()
    try:
        print(json.dumps(transcribe_audio(args.input, args.checkpoint), indent=2))
    except RuntimeError as exc:
        print(json.dumps({"status": "UNAVAILABLE", "error": str(exc)}, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()
