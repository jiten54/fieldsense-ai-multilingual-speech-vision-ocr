# FieldSense AI — Multilingual Speech, Vision & OCR Intelligence
<img width="1920" height="860" alt="Screenshot 2026-11-21 082842" src="https://github.com/user-attachments/assets/c211effa-072c-4a0f-9568-13b96f6900b7" />

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
# FieldSense AI — Multilingual Speech, Vision & OCR Operations Platform

**An end-to-end ML engineering platform for public health and early-grade education in low-resource field environments.**

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![Machine Learning](https://img.shields.io/badge/AI-Machine%20Learning-purple)]()
[![Computer Vision](https://img.shields.io/badge/Computer%20Vision-CNN-green)]()
[![OCR](https://img.shields.io/badge/OCR-Tesseract-orange)]()
[![Status](https://img.shields.io/badge/Project-Active-success)]()

FieldSense AI is designed to support the machine-learning lifecycle for multilingual speech, audio, image and document data collected in real-world environments.

The platform focuses on data quality, annotation review, model lifecycle management, local CPU processing, privacy-aware data handling and offline field synchronization.

It is designed around a practical challenge: AI systems used by health workers, teachers and field data collectors must remain dependable even when devices are low-cost, connectivity is unreliable and input data is noisy.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Platform Modules](#platform-modules)
- [Architecture](#architecture)
- [Speech and Audio](#speech-and-audio)
- [Computer Vision and OCR](#computer-vision-and-ocr)
- [Data Annotation and Quality](#data-annotation-and-quality)
- [Privacy and Offline Workflows](#privacy-and-offline-workflows)
- [Model Lifecycle](#model-lifecycle)
- [Evaluation and Benchmarking](#evaluation-and-benchmarking)
- [Technology Stack](#technology-stack)
- [Current Implementation Boundaries](#current-implementation-boundaries)
- [Future Development](#future-development)
- [Intended Applications](#intended-applications)

---

## Overview

FieldSense AI brings multiple ML engineering workflows together in one operational platform.

It covers:

1. Audio preprocessing and quality validation.
2. Image quality assessment.
3. Speech evaluation using WER and CER.
4. Local document OCR.
5. Annotation review and quality assurance.
6. Model registration and lifecycle controls.
7. Privacy-aware data processing.
8. Offline field synchronization.
9. Local CPU benchmarking.

The platform separates capabilities that have been verified through local execution from GPU-dependent model-training workflows.

## Key Features

| Area | Capability |
|---|---|
| Audio | Audio DSP quality checks and augmentation |
| Speech | WER and CER evaluation |
| Computer Vision | Image blur and exposure quality checks |
| OCR | Local CPU OCR using Tesseract WebAssembly |
| Annotation | Traceable review and approval workflows |
| Data Quality | Dataset quality gates and validation |
| Privacy | PII redaction and masked storage |
| Model Management | Threshold-gated model registry |
| Offline Support | Field synchronization workflow |
| Persistence | SQLite-backed records and audit-oriented workflows |
| Benchmarking | Local CPU pipeline latency measurements |

## Platform Modules

### 1. Speech AI

Designed for multilingual speech-processing workflows.

Capabilities include:

- Audio preprocessing and quality checks.
- Audio DSP quality validation.
- Audio augmentation workflows.
- Speech evaluation using Word Error Rate (WER).
- Character Error Rate (CER) evaluation.
- Speech workflow monitoring.

### 2. Whisper Training

A dedicated workspace for pretrained speech-model experimentation.

The intended training workflow includes:

- Dataset preparation.
- Audio and transcript validation.
- Training and validation dataset separation.
- Fine-tuning experiment management.
- Evaluation and error analysis.

**Implementation note:** The presence of a training module does not by itself establish that Whisper fine-tuning has been completed. Training results should be added only after actual experiments have been executed and documented.

### 3. wav2vec2 Training

A dedicated module for wav2vec2-based speech-model experimentation.

Planned engineering workflow:

- Audio dataset preparation.
- Transcript and label validation.
- Model configuration.
- Fine-tuning experiments.
- Evaluation using WER and CER.
- Comparison of experiment results.

Actual training configurations and results should be documented after execution.

### 4. Speech Comparison

Provides a workflow for comparing speech-model outputs and evaluation results.

Focus areas:

- Recognition quality.
- WER and CER.
- Output comparison.
- Error identification.
- Evaluation reporting.

### 5. Computer Vision

Supports image-quality validation before downstream model processing.

Implemented quality-control capabilities include:

- Laplacian blur detection.
- Exposure quality checks.
- Image validation workflows.
- Quality-based review decisions.

### 6. OCR Documents

Provides local document text extraction using Tesseract WebAssembly.

Key capabilities:

- Local CPU OCR.
- Document text extraction.
- OCR-oriented processing workflows.
- Privacy-conscious local processing.

### 7. Dataset Management

Organises datasets and supports quality-oriented data workflows.

Focus areas:

- Dataset registration.
- Dataset quality gates.
- Dataset tracking.
- Data preparation workflows.
- Model and dataset lifecycle visibility.

### 8. Annotation & Review

Supports traceable annotation-review workflows.

Capabilities include:

- Annotation inspection.
- Review and approval states.
- Flagged annotation tracking.
- Quality-oriented validation.
- Traceable review outcomes.

### 9. Data Quality

Provides quality checks across audio, image and annotation workflows.

The objective is to identify problematic inputs before they affect model development or downstream processing.

---

## Architecture

The platform follows a modular ML operations structure.

```text
                  FieldSense AI
                       |
        +--------------+--------------+
        |              |              |
    Speech & Audio  Vision & OCR   Data & Annotation
        |              |              |
    Audio DSP       Image QC       Dataset QA
    WER / CER       Blur Check     Annotation Review
    Speech Models   Exposure QC    Approval / Flagging
        |              |              |
        +--------------+--------------+
                       |
                Quality Gates
                       |
          +------------+------------+
          |            |            |
       Privacy      Model       Local CPU
       Controls   Lifecycle    Processing
          |            |            |
          +------------+------------+
                       |
               Offline Workflows
                       |
               SQLite Persistence
                       |
                Audit & Review
```

## Privacy and Offline Workflows

FieldSense AI is designed with data protection and field constraints in mind.

Key design areas:

- PII redaction.
- PII-masked record storage.
- SQLite-backed persistence.
- Offline field synchronization.
- Traceable review and audit-oriented workflows.
- Separation of local processing and GPU-dependent training.

These capabilities are particularly relevant when handling sensitive health and child-related information.

## Model Lifecycle

The platform includes a threshold-gated model registry.

The intended lifecycle is:

1. Register a model.
2. Associate it with relevant dataset and evaluation information.
3. Apply quality and acceptance thresholds.
4. Track model registration and deployment state.
5. Maintain traceability across model lifecycle operations.

## Evaluation and Benchmarking

Model and data evaluation are essential parts of FieldSense AI.

Evaluation areas include:

| Metric / Check | Purpose |
|---|---|
| WER | Measures word-level speech recognition errors |
| CER | Measures character-level recognition errors |
| Laplacian blur | Identifies potentially blurred images |
| Exposure QC | Checks image exposure quality |
| CPU latency | Measures local pipeline execution time |
| Annotation review | Tracks approved and flagged samples |

The dashboard displays local CPU pipeline latency measurements, including average and P95 latency.

Reported dashboard values should be treated as environment-specific measurements, not universal performance guarantees.

## Technology Stack

The platform's visible engineering capabilities and project workflows involve:

- Python
- Machine Learning
- Speech and audio processing
- Computer Vision
- Tesseract WebAssembly
- WER and CER evaluation
- SQLite
- CPU-based inference and benchmarking
- Annotation quality workflows
- Privacy-aware data processing

Add additional libraries and frameworks to this list only when they are actually present in the repository.

## Current Implementation Boundaries

FieldSense AI distinguishes verified local capabilities from training workflows that require separate execution.

**Dashboard-marked verified capabilities:**

- Audio DSP quality and augmentation.
- Laplacian blur and exposure quality control.
- Local CPU OCR using Tesseract WebAssembly.
- WER/CER evaluation and PII redaction.

**Platform capabilities and workflows:**

- Dataset management.
- Annotation review and approval.
- Threshold-gated model registry.
- Offline field synchronization.
- SQLite-backed persistence.

**Separate training work:**

- Whisper fine-tuning.
- wav2vec2 fine-tuning.
- GPU-dependent training and experimentation.

Training metrics, model checkpoints and performance claims should be added only after actual training runs have been completed and verified.

## Future Development

Potential development directions include:

- Complete Whisper and wav2vec2 fine-tuning pipelines.
- Reproducible experiment tracking.
- Model evaluation dashboards.
- ONNX export and quantisation.
- Optimised CPU and mobile inference.
- Low-resource language dataset support.
- Child-speech evaluation workflows.
- Field testing under unreliable connectivity.
- Expanded public-health and early-grade-education use cases.

## Intended Applications

FieldSense AI is designed around potential use cases such as:

- Multilingual speech data processing.
- Speech recognition evaluation.
- Educational audio workflows.
- Image and document quality validation.
- Annotation quality assurance.
- Public-health data collection.
- Offline-first ML applications.

---

## Project Objective

The goal of FieldSense AI is to move beyond isolated ML experiments and develop practical, measurable and privacy-aware ML engineering workflows that can operate under real-world field constraints.

**Built around data quality, reliable evaluation, local processing and responsible AI deployment.**
