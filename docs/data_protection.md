# FieldSense AI — Privacy, Data Protection & Responsible AI Policy

## 1. Non-Diagnostic Boundary
FieldSense AI is a **data-capture, transcription, OCR, and ML engineering demonstration platform**. It is **not** a clinical diagnostic tool, medical device, or child assessment instrument. All public-health and early-grade education workflows enforce mandatory **human-in-the-loop review** before saving any structured record.

## 2. Data Minimisation & Local Processing
- Uploaded audio and document images are validated for extension and size (`<= 25 MB`), processed in temporary files, and deleted immediately after analysis.
- **No external LLM or cloud AI APIs** receive user-uploaded audio, health forms, or reading recordings. OCR runs locally via Tesseract WASM / Python Tesseract; signal and image checks run locally via `ffmpeg` and Python 3.11.

## 3. Consent & PII Redaction
- Both field workflows require explicit consent confirmation before submission.
- `ml/preprocessing/privacy_redactor.py` detects and masks phone numbers, email addresses, dates of birth, national/clinic IDs, and labeled person names (`[REDACTED_NAME]`, `[REDACTED_PHONE]`, `[REDACTED_DOB]`).

## 4. Access Control & Auditability
- Role-based access control (RBAC) distinguishes `Field Collector`, `ML Annotator`, `ML Engineer`, and `Privacy Auditor`.
- Every ingestion, redaction, annotation edit, model promotion, and field record confirmation writes an immutable entry to SQLite `audit_logs` without storing raw sensitive payloads in server logs.
