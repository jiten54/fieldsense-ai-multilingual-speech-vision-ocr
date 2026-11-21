#!/usr/bin/env bash
set -euo pipefail

echo "=== FieldSense AI: CPU-Only Local Demo & Verification ==="
python3 scripts/generate_field_audio_fixtures.py
python3 ml/evaluation/field_condition_suite.py
python3 scripts/run_local_benchmarks.py
python3 -m unittest discover -s backend/tests -v

echo "Starting web server on http://localhost:3000 ..."
npm run dev
