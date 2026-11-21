#!/usr/bin/env bash
set -euo pipefail

echo "=== FieldSense AI: Optional GPU Fine-Tuning Pipeline ==="
echo "Requires: pip install -r requirements.txt and downloaded datasets (FLEURS/Common Voice)"

python3 ml/speech/whisper/preprocess_audio.py \
  --input-manifest data/manifests/speech_manifest.jsonl \
  --output-manifest data/processed/speech_manifest_16k.jsonl

python3 ml/speech/whisper/train_whisper.py --config ml/speech/whisper/whisper_config.yaml
python3 ml/speech/wav2vec2/train_wav2vec2.py --config ml/speech/wav2vec2/wav2vec2_config.yaml
python3 ml/vision/train_cnn.py --config ml/vision/cnn_config.yaml
python3 ml/optimization/export_onnx.py
python3 ml/optimization/quantize_onnx.py
python3 ml/optimization/benchmark_cpu.py --model deployment/onnx/vision_cnn_int8.onnx --precision INT8
