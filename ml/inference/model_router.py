"""Unified Model Router for FieldSense AI Serving Layer."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from ml.preprocessing.audio_quality import analyze_audio_file
from ml.vision.image_quality import analyze_image_file


class ModelRouter:
    """Routes inference and quality-check requests to local or FastAPI backends."""

    def check_audio_quality(self, audio_path: str) -> dict[str, Any]:
        return asdict(analyze_audio_file(audio_path))

    def check_image_quality(self, image_path: str) -> dict[str, Any]:
        return asdict(analyze_image_file(image_path))

    def transcribe(self, audio_path: str, backend: str = "whisper", checkpoint: str | None = None) -> dict[str, Any]:
        if backend == "whisper":
            from ml.speech.whisper.inference_whisper import transcribe_audio

            return transcribe_audio(audio_path, checkpoint=checkpoint or "openai/whisper-tiny")
        if backend == "wav2vec2":
            from ml.speech.wav2vec2.inference_wav2vec2 import transcribe_audio

            return transcribe_audio(audio_path, checkpoint=checkpoint or "facebook/wav2vec2-base-960h")
        raise ValueError(f"Unsupported speech backend: {backend}")
