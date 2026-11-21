# FieldSense AI — Multilingual Speech, Vision & OCR Intelligence

**FieldSense AI** is an end-to-end Machine Learning Engineering platform designed for public-health field data capture and early-grade education support under low-connectivity, resource-constrained conditions.

> **Honesty & Verification Notice**: Every metric shown by default in this repository comes from real local execution (Audio DSP quality, Laplacian image quality, Tesseract WASM OCR, exact Levenshtein WER/CER, PII redaction, and x86_64 CPU benchmarks). GPU fine-tuning scripts (`Whisper`, `wav2vec2`, `MobileNetV3`, `ONNX INT8`) are fully implemented and tested for syntax/data contracts, and explicitly marked as awaiting a GPU/PyTorch environment (`requirements.txt` / `docker-compose.yml`).

## Architecture
- **Web Dashboard & Local Inference Gateway** (`server.ts` + `src/`): React 19, TypeScript, Tailwind CSS v4, Recharts, Express, Multer, Tesseract.js.
- **FastAPI Serving Layer** (`backend/app/main.py`): Pydantic schemas, 11 REST endpoints (`/api/v1/*`), SQLite persistence & audit logging.
- **ML Pipelines** (`ml/`):
  - `ml/speech/whisper/`: `train_whisper.py`, `evaluate_whisper.py`, `inference_whisper.py`, `preprocess_audio.py`, `whisper_config.yaml`
  - `ml/speech/wav2vec2/`: `train_wav2vec2.py`, `evaluate_wav2vec2.py`, `inference_wav2vec2.py`, `build_tokenizer.py`, `wav2vec2_config.yaml`
  - `ml/vision/`: `train_cnn.py`, `image_quality.py`, `cnn_config.yaml`
  - `ml/ocr/`: `ocr_pipeline.py`
  - `ml/preprocessing/`: `audio_quality.py`, `noise_augmentation.py`, `annotation_validator.py`, `privacy_redactor.py`
  - `ml/evaluation/`: `speech_metrics.py`, `field_condition_suite.py`
  - `ml/optimization/`: `export_onnx.py`, `quantize_onnx.py`, `benchmark_cpu.py`

## Quick Start (CPU-Only Local Demo)
```bash
npm install
python3 scripts/generate_field_audio_fixtures.py
python3 scripts/run_local_benchmarks.py
python3 -m unittest discover -s backend/tests -v
npm run dev
```
Open `http://localhost:3000`.

## Full ML & GPU Training (Colab / Kaggle / Docker)
```bash
pip install -r requirements.txt
bash deployment/scripts/run_gpu_train.sh
```
Or launch the full stack with FastAPI + MLflow:
```bash
docker compose up --build
```
