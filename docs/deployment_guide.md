# FieldSense AI — Deployment & Edge Guide

## Local Development (Port 3000)
```bash
npm install
npm run dev
```

## Production Docker Compose (Frontend + FastAPI + MLflow)
```bash
docker compose up --build
```
- Web UI & Gateway: `http://localhost:3000`
- FastAPI Serving Docs: `http://localhost:8000/docs`
- MLflow Tracking UI: `http://localhost:5000`

## ONNX Export & CPU Quantisation
```bash
python3 ml/optimization/export_onnx.py --checkpoint experiments/results/vision/best_cnn.pt
python3 ml/optimization/quantize_onnx.py
python3 ml/optimization/benchmark_cpu.py --model deployment/onnx/vision_cnn_int8.onnx --precision INT8
```
Note: Mobile ARM benchmarks are never claimed unless measured on actual mobile hardware; x86_64 CPU measurements are explicitly labeled as CPU benchmarks.
