# FieldSense AI — Known Limitations & Scope Boundaries

1. **No Fabricated Low-Resource ASR Claims**: Assamese, Bengali, and Hindi dataset entries (`Google FLEURS`, `Mozilla Common Voice`, `OpenSLR`) are cataloged with exact licenses and preprocessing specs, but are **not downloaded or fine-tuned** in this 2-vCPU / 4 GiB RAM sandbox. No WER/CER metrics are claimed for these languages until real evaluation runs execute on GPU.
2. **OCR Script Scope**: Local Tesseract WASM (`eng`) is verified on printed English forms (`sample_health_form`, 85% mean confidence). Handwritten cursive text and non-Latin Indic scripts require dedicated script-trained checkpoints and separate validation.
3. **CPU vs Mobile Deployment**: Measured latency/memory tables (`experiments/results/cpu_benchmarks.json`) reflect x86_64 2-vCPU desktop/container execution, not Android/ARM mobile hardware.
4. **Synthetic Default Fixtures**: Default audio WAVs and sample documents are synthetic and contain zero real patient or child records.
