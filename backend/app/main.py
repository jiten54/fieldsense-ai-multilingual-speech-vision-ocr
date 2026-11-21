"""FieldSense AI FastAPI Inference & MLOps Serving Service (Module E)."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.schemas.api import SpeechCompareRequest
from backend.app.services.sqlite_store import FieldSenseStore
from ml.evaluation.speech_metrics import evaluate_pair
from ml.inference.model_router import ModelRouter
from ml.preprocessing.privacy_redactor import redact_pii

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fieldsense.api")

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Multilingual Speech, Vision, OCR, Quality & Edge ML Serving API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

router_service = ModelRouter()
store = FieldSenseStore(settings.database_path)


def _validate_upload(upload: UploadFile, allowed_exts: tuple[str, ...], raw: bytes) -> str:
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension '{ext}'. Allowed: {allowed_exts}",
        )
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.max_upload_bytes // (1024 * 1024)} MB limit.",
        )
    return ext


@app.middleware("http")
async def add_request_context(request: Request, call_next: Any):
    req_id = str(uuid.uuid4())[:12]
    request.state.request_id = req_id
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - t0) * 1000.0:.2f}"
    return response


@app.get("/api/v1/health")
def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.env,
    }


@app.post("/api/v1/quality/audio")
async def quality_audio(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    ext = _validate_upload(file, settings.allowed_audio_exts, raw)
    t0 = time.perf_counter()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        report = router_service.check_audio_quality(tmp_path)
        report["request_id"] = request.state.request_id
        report["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)
        return report
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/v1/quality/image")
async def quality_image(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    ext = _validate_upload(file, settings.allowed_image_exts, raw)
    t0 = time.perf_counter()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        report = router_service.check_image_quality(tmp_path)
        report["request_id"] = request.state.request_id
        report["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)
        return report
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/v1/speech/compare")
def speech_compare(request: Request, body: SpeechCompareRequest) -> dict[str, Any]:
    t0 = time.perf_counter()
    res = asdict(evaluate_pair(body.reference, body.hypothesis))
    res["request_id"] = request.state.request_id
    res["language"] = body.language
    res["condition"] = body.condition
    res["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)
    return res


@app.post("/api/v1/speech/transcribe")
async def speech_transcribe(
    request: Request,
    file: UploadFile = File(...),
    backend: str = Form("whisper"),
    checkpoint: str | None = Form(None),
) -> JSONResponse:
    raw = await file.read()
    ext = _validate_upload(file, settings.allowed_audio_exts, raw)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        quality = router_service.check_audio_quality(tmp_path)
        try:
            prediction = router_service.transcribe(tmp_path, backend=backend, checkpoint=checkpoint)
            return JSONResponse(
                {
                    "request_id": request.state.request_id,
                    "status": "OK",
                    "audio_quality": quality,
                    "prediction": prediction,
                }
            )
        except RuntimeError as exc:
            return JSONResponse(
                status_code=503,
                content={
                    "request_id": request.state.request_id,
                    "status": "MODEL_RUNTIME_UNAVAILABLE",
                    "detail": str(exc),
                    "audio_quality": quality,
                },
            )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/v1/vision/classify")
async def vision_classify(request: Request, file: UploadFile = File(...)) -> JSONResponse:
    raw = await file.read()
    ext = _validate_upload(file, settings.allowed_image_exts, raw)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        iq = router_service.check_image_quality(tmp_path)
        ckpt = Path("experiments/results/vision/best_cnn.pt")
        if not ckpt.exists():
            return JSONResponse(
                status_code=503,
                content={
                    "request_id": request.state.request_id,
                    "status": "CHECKPOINT_NOT_TRAINED",
                    "detail": "Run ml/vision/train_cnn.py first to produce best_cnn.pt.",
                    "image_quality": iq,
                },
            )
        return JSONResponse(
            {
                "request_id": request.state.request_id,
                "status": "READY",
                "image_quality": iq,
                "checkpoint": str(ckpt),
            }
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/v1/ocr/extract")
async def ocr_extract(
    request: Request,
    file: UploadFile = File(...),
    redact: bool = Form(True),
) -> JSONResponse:
    raw = await file.read()
    ext = _validate_upload(file, settings.allowed_image_exts, raw)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        from ml.ocr.ocr_pipeline import extract_text_tesseract

        try:
            res = extract_text_tesseract(tmp_path, preprocess=True)
            if redact:
                redacted = redact_pii(res["text"])
                res["redacted_text"] = redacted.redacted_text
                res["pii_findings"] = redacted.findings_count
            res["request_id"] = request.state.request_id
            return JSONResponse(res)
        except RuntimeError as exc:
            return JSONResponse(
                status_code=503,
                content={"request_id": request.state.request_id, "status": "UNAVAILABLE", "detail": str(exc)},
            )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.get("/api/v1/models")
def list_models() -> dict[str, Any]:
    path = settings.data_dir / "model_registry.json"
    if path.exists():
        return {"models": json.loads(path.read_text(encoding="utf-8"))}
    return {"models": []}


@app.get("/api/v1/datasets")
def list_datasets() -> dict[str, Any]:
    path = settings.data_dir / "dataset_registry.json"
    if path.exists():
        return {"datasets": json.loads(path.read_text(encoding="utf-8"))}
    return {"datasets": []}


@app.get("/api/v1/experiments")
def list_experiments() -> dict[str, Any]:
    bench_path = Path("experiments/results/cpu_benchmarks.json")
    bench = json.loads(bench_path.read_text(encoding="utf-8")) if bench_path.exists() else {}
    return {"cpu_benchmarks": bench}


@app.get("/api/v1/metrics")
def get_metrics() -> dict[str, Any]:
    audits = store.list_audits(limit=10)
    return {
        "recent_audit_events": len(audits),
        "database_path": str(settings.database_path),
    }
