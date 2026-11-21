# FieldSense AI — System Architecture

```
USER APPLICATION (React 19 + TypeScript + Offline Queue)
   |-- Voice Recording / WAV Upload
   |-- Document & Flashcard Capture
   |-- Structured Public Health & Education Review Forms
   v
API & INGESTION GATEWAY (server.ts / FastAPI backend/app/main.py)
   |-- Extension & Size Validation (<= 25 MB)
   |-- Safe Temporary File Isolation
   |-- PII Detection & Redaction Guard
   |-- SQLite Audit Log & Idempotent Sync Store
   v
LOCAL & ML PROCESSING PIPELINES (ml/)
   |-- Audio DSP Quality + Noise Augmentation (ffmpeg + Python 3.11)
   |-- Image Quality Assessment (3x3 Laplacian Blur + Luminance)
   |-- Tesseract WASM / Python OCR Extraction + BBoxes
   |-- Whisper & wav2vec2 CTC Training/Eval/Inference Pipelines
   |-- MobileNetV3-Small Vision Trainer & ONNX INT8 Quantisation
   v
EVALUATION & MODEL REGISTRY
   |-- Exact WER / CER & Word Alignment (ml/evaluation/speech_metrics.py)
   |-- Pre-training Data Quality Validator (ml/preprocessing/annotation_validator.py)
   |-- Threshold-Gated Lifecycle (DEVELOPMENT -> TRAINED -> EVALUATED -> APPROVED -> DEPLOYED)
```
