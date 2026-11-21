# FieldSense AI — Training & Fine-Tuning Guide

## 1. Data Preparation & Quality Gate
1. Register dataset source and license in `data/dataset_registry.json`.
2. Resample and validate audio manifests:
   ```bash
   python3 ml/speech/whisper/preprocess_audio.py \
     --input-manifest data/manifests/raw.jsonl \
     --output-manifest data/manifests/speech_manifest.jsonl
   ```
3. Run pre-training annotation audit:
   ```bash
   python3 ml/preprocessing/annotation_validator.py --manifest data/annotations/annotations_store.json
   ```

## 2. Whisper Fine-Tuning (CPU Smoke Test vs GPU)
- **CPU Smoke Test**: `python3 ml/speech/whisper/train_whisper.py --config ml/speech/whisper/whisper_config.yaml --smoke-test`
- **GPU Full Fine-Tuning**: `python3 ml/speech/whisper/train_whisper.py --config ml/speech/whisper/whisper_config.yaml`

## 3. wav2vec2 CTC Fine-Tuning
- Build character CTC vocabulary:
  `python3 ml/speech/wav2vec2/build_tokenizer.py --manifest data/manifests/speech_manifest.jsonl`
- Train CTC model:
  `python3 ml/speech/wav2vec2/train_wav2vec2.py --config ml/speech/wav2vec2/wav2vec2_config.yaml`

## 4. Vision CNN Training
- `python3 ml/vision/train_cnn.py --config ml/vision/cnn_config.yaml --manifest data/manifests/vision_manifest.jsonl`
