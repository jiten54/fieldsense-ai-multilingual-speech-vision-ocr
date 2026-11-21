"""Backend configuration settings for FieldSense AI FastAPI service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str = "FieldSense AI Inference & MLOps API"
    app_version: str = "1.0.0"
    env: str = os.getenv("FIELDSENSE_ENV", "development")
    data_dir: Path = Path(os.getenv("FIELDSENSE_DATA_DIR", "data"))
    database_path: Path = Path(os.getenv("FIELDSENSE_DB_PATH", "data/fieldsense.db"))
    max_upload_bytes: int = int(os.getenv("FIELDSENSE_MAX_UPLOAD_MB", "25")) * 1024 * 1024
    allowed_audio_exts: tuple[str, ...] = (".wav", ".mp3", ".ogg", ".flac", ".m4a", ".webm")
    allowed_image_exts: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff")
    mlflow_tracking_uri: str = os.getenv("MLFLOW_TRACKING_URI", "experiments/mlruns")


settings = Settings()
