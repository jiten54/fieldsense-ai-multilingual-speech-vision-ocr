# FieldSense AI — Evaluation Protocol

1. **Speech Normalization**: Unicode NFKC, lowercase, punctuation strip, whitespace collapse (`ml/evaluation/speech_metrics.py`).
2. **WER & CER**: Exact Levenshtein word and character edit distance with substitution/deletion/insertion backtrace and confusion pair ranking.
3. **Audio Robustness Conditions**: Clean 16 kHz baseline vs controlled Gaussian noise (`SNR=8 dB`), `-18 dB` attenuation, `+14 dB` hard clipping, and `8 kHz` narrowband decimation (`ml/preprocessing/noise_augmentation.py`).
4. **OCR Evaluation**: Character Error Rate, Word Error Rate, mean word confidence, and end-to-end processing latency (`ms`).
5. **Approval Threshold Gate**: Models cannot transition to `APPROVED` or `DEPLOYED` in `data/model_registry.json` unless `evaluation_status == "VERIFIED"`.
