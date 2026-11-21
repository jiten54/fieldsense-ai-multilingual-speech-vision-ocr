"""Fine-tuning pipeline for OpenAI Whisper (Module A1).

Supports:
- Full GPU fine-tuning with Hugging Face Seq2SeqTrainer, fp16, checkpoint resume
- CPU smoke-test mode (--smoke-test) on minimal subsets
- MLflow + TensorBoard logging and git/seed reproducibility metadata
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _get_git_commit() -> str:
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL)
            .decode("utf-8")
            .strip()
        )
    except Exception:
        return "uncommitted"


def _load_yaml(path: str) -> dict[str, Any]:
    import yaml  # type: ignore

    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def run_training(config_path: str, smoke_test: bool = False, resume_ckpt: str | None = None) -> None:
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from datasets import Dataset
        from transformers import (
            Seq2SeqTrainer,
            Seq2SeqTrainingArguments,
            WhisperForConditionalGeneration,
            WhisperProcessor,
        )
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "status": "MISSING_ML_DEPENDENCIES",
                    "error": str(exc),
                    "instruction": "Install full ML dependencies via `pip install -r requirements.txt` or run inside Docker/Colab GPU.",
                },
                indent=2,
            )
        )
        sys.exit(2)

    cfg = _load_yaml(config_path)
    seed = int(cfg["experiment"].get("seed", 42))
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    model_name = cfg["model"]["pretrained_checkpoint"]
    language = cfg["model"].get("language", "en")
    task = cfg["model"].get("task", "transcribe")
    manifest_path = Path(cfg["data"]["manifest_path"])

    if not manifest_path.exists():
        raise FileNotFoundError(
            f"Manifest not found: {manifest_path}. Run preprocess_audio.py first."
        )

    rows = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if smoke_test:
        rows = rows[: int(cfg["smoke_test"]["max_train_samples"])]

    if len(rows) < 2:
        raise ValueError("Need at least 2 valid samples in manifest to create train/val split.")

    split_idx = max(1, int(len(rows) * float(cfg["data"].get("train_split", 0.8))))
    train_rows = rows[:split_idx]
    val_rows = rows[split_idx:] or rows[:1]

    processor = WhisperProcessor.from_pretrained(model_name, language=language, task=task)
    model = WhisperForConditionalGeneration.from_pretrained(model_name)
    model.generation_config.language = language
    model.generation_config.task = task
    model.generation_config.forced_decoder_ids = None

    def _prepare_batch(batch: dict[str, Any]) -> dict[str, Any]:
        audio_arr, sr = sf.read(batch["audio_path"])
        if sr != 16000:
            raise ValueError(f"Expected 16000 Hz audio, got {sr} Hz for {batch['audio_path']}")
        feats = processor.feature_extractor(audio_arr, sampling_rate=16000).input_features[0]
        labels = processor.tokenizer(batch["transcript"]).input_ids
        return {"input_features": feats, "labels": labels}

    train_ds = Dataset.from_list(train_rows).map(_prepare_batch, remove_columns=list(train_rows[0].keys()))
    val_ds = Dataset.from_list(val_rows).map(_prepare_batch, remove_columns=list(val_rows[0].keys()))

    def data_collator(features: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        input_features = [{"input_features": f["input_features"]} for f in features]
        batch = processor.feature_extractor.pad(input_features, return_tensors="pt")
        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch = processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        batch["labels"] = labels
        return batch

    use_fp16 = bool(cfg["training"].get("fp16", False)) and torch.cuda.is_available() and not smoke_test
    output_dir = Path(cfg["experiment"]["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    train_cfg = cfg["training"]
    args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=int(
            cfg["smoke_test"]["per_device_train_batch_size"] if smoke_test else train_cfg["per_device_train_batch_size"]
        ),
        per_device_eval_batch_size=int(train_cfg["per_device_eval_batch_size"]),
        gradient_accumulation_steps=1 if smoke_test else int(train_cfg["gradient_accumulation_steps"]),
        learning_rate=float(train_cfg["learning_rate"]),
        warmup_steps=0 if smoke_test else int(train_cfg["warmup_steps"]),
        num_train_epochs=1 if smoke_test else int(train_cfg["num_train_epochs"]),
        max_steps=int(cfg["smoke_test"]["max_steps"]) if smoke_test else -1,
        fp16=use_fp16,
        eval_strategy="steps" if not smoke_test else "no",
        eval_steps=int(train_cfg["eval_steps"]),
        save_steps=int(train_cfg["save_steps"]),
        logging_steps=1 if smoke_test else int(train_cfg["logging_steps"]),
        logging_dir=cfg["experiment"]["tensorboard_dir"],
        report_to=["tensorboard"],
        predict_with_generate=False,
        seed=seed,
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=data_collator,
        processing_class=processor.feature_extractor,
    )

    train_output = trainer.train(resume_from_checkpoint=resume_ckpt or train_cfg.get("resume_from_checkpoint"))
    model.save_pretrained(str(output_dir / "final_checkpoint"))
    processor.save_pretrained(str(output_dir / "final_checkpoint"))

    # Optional MLflow tracking
    try:
        import mlflow

        mlflow.set_tracking_uri(cfg["experiment"]["mlflow_tracking_uri"])
        mlflow.set_experiment(cfg["experiment"]["name"])
        with mlflow.start_run(run_name="whisper_smoke" if smoke_test else "whisper_finetune"):
            mlflow.log_params(
                {
                    "model_checkpoint": model_name,
                    "language": language,
                    "seed": seed,
                    "smoke_test": smoke_test,
                    "git_commit": _get_git_commit(),
                    "cuda_available": torch.cuda.is_available(),
                }
            )
            mlflow.log_metrics({"train_loss": float(train_output.training_loss)})
    except ImportError:
        pass

    report = {
        "model_checkpoint": model_name,
        "smoke_test": smoke_test,
        "train_loss": float(train_output.training_loss),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "git_commit": _get_git_commit(),
        "hardware": platform.platform(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (output_dir / "training_summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train/fine-tune Whisper ASR model.")
    parser.add_argument("--config", default="ml/speech/whisper/whisper_config.yaml")
    parser.add_argument("--smoke-test", action="store_true")
    parser.add_argument("--resume", default=None)
    args = parser.parse_args()
    run_training(args.config, smoke_test=args.smoke_test, resume_ckpt=args.resume)


if __name__ == "__main__":
    main()
