"""Pydantic request and response schemas for FieldSense AI API."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class SpeechCompareRequest(BaseModel):
    reference: str = Field(..., min_length=1, max_length=20000)
    hypothesis: str = Field(..., max_length=20000)
    language: str = "en"
    condition: str = "standard"


class VisionClassifyResponse(BaseModel):
    request_id: str
    model_name: str
    status: str
    predicted_class: str | None = None
    confidence: float | None = None
    latency_ms: float
    note: str | None = None


class ModelPromoteRequest(BaseModel):
    target_stage: Literal[
        "DEVELOPMENT", "TRAINED", "EVALUATED", "APPROVED", "DEPLOYED", "RETIRED"
    ]
    actor_role: str = "ML Engineer"
    max_wer_threshold: float = 0.25


class AnnotationReviewRequest(BaseModel):
    corrected_transcript: str | None = None
    label: str | None = None
    status: Literal["PENDING", "APPROVED", "FLAGGED"]
    reviewer: str = "ml-annotator"
    notes: str = ""
