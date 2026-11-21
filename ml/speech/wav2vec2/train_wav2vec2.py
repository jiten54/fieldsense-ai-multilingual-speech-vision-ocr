"""Fine-tuning pipeline for wav2vec2 CTC Speech Recognition (Module A2)."""

from __future__ import annotations

import argparse
import json
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


def run_training(config_path: str, smoke_test: bool = False, resume_ckpt: str | None = None) -> None:
    try:
        import numpy as np
        import soundfile as sf
        import torch
        import yaml
        from datasets import Dataset
        from transformers import (
            Trainer,
            TrainingArguments,
            Wav2Vec2CTCTokenizer,
            Wav2Vec2FeatureExtractor,
            Wav2Vec2ForCTC,
            Wav2Vec2Processor,
        )
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "status": "MISSING_ML_DEPENDENCIES",
                    "error": str(exc),
                    "instruction": "Install torch, transformers, datasets, soundfile, and pyyaml via `pip install -r requirements.txt`.",
                },
                indent=2,
            )
        )
        sys.exit(2)

    with open(config_path, "r", encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)

    seed = int(cfg["experiment"].get("seed", 42))
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    manifest_path = Path(cfg["data"]["manifest_path"])
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    rows = [json.loads(l) for l in manifest_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    if smoke_test:
        rows = rows[: int(cfg["smoke_test"]["max_train_samples"])]

    vocab_path = Path(cfg["model"]["vocab_path"])
    if not vocab_path.exists():
        from ml.speech.wav2vec2.build_tokenizer import build_vocab_from_manifest

        build_vocab_from_manifest(str(manifest_path), str(vocab_path))

    tokenizer = Wav2Vec2CTCTokenizer(
        str(vocab_path), unk_token="[UNK]", pad_token="[PAD]", word_delimiter_token="|"
    )
    feature_extractor = Wav2Vec2FeatureExtractor(
        feature_size=1, sampling_rate=16000, padding_value=0.0, do_normalize=True, return_attention_mask=True
    )
    processor = Wav2Vec2Processor(feature_extractor=feature_extractor, tokenizer=tokenizer)

    model = Wav2Vec2ForCTC.from_pretrained(
        cfg["model"]["pretrained_checkpoint"],
        ctc_loss_reduction=cfg["model"].get("ctc_loss_reduction", "mean"),
        ctc_zero_infinity=bool(cfg["model"].get("ctc_zero_infinity", True)),
        pad_token_id=processor.tokenizer.pad_token_id,
        vocab_size=len(processor.tokenizer),
        ignore_mismatched_sizes=True,
    )
    if cfg["model"].get("freeze_feature_encoder", True):
        model.freeze_feature_encoder()

    split_idx = max(1, int(len(rows) * float(cfg["data"].get("train_split", 0.8))))
    train_rows = rows[:split_idx]
    val_rows = rows[split_idx:] or rows[:1]

    def _prepare(batch: dict[str, Any]) -> dict[str, Any]:
        audio, sr = sf.read(batch["audio_path"])
        processed = processor(audio, sampling_rate=sr)
        batch["input_values"] = processed.input_values[0]
        batch["labels"] = processor.tokenizer(batch["transcript"].lower()).input_ids
        return batch

    train_ds = Dataset.from_list(train_rows).map(_prepare, remove_columns=list(train_rows[0].keys()))
    val_ds = Dataset.from_list(val_rows).map(_prepare, remove_columns=list(val_rows[0].keys()))

    def data_collator(features: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        input_features = [{"input_values": f["input_values"]} for f in features]
        label_features = [{"input_ids": f["labels"]} for f in features]
        batch = processor.pad(input_features, padding=True, return_tensors="pt")
        labels_batch = processor.pad(labels=label_features, padding=True, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        batch["labels"] = labels
        return batch

    output_dir = Path(cfg["experiment"]["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    train_cfg = cfg["training"]
    use_fp16 = bool(train_cfg.get("fp16", False)) and torch.cuda.is_available() and not smoke_test

    args = TrainingArguments(
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
        seed=seed,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=data_collator,
        processing_class=processor.feature_extractor,
    )
    out = trainer.train(resume_from_checkpoint=resume_ckpt or train_cfg.get("resume_from_checkpoint"))
    model.save_pretrained(str(output_dir / "final_checkpoint"))
    processor.save_pretrained(str(output_dir / "final_checkpoint"))

    summary = {
        "model_checkpoint": cfg["model"]["pretrained_checkpoint"],
        "smoke_test": smoke_test,
        "train_loss": float(out.training_loss),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "git_commit": _get_git_commit(),
        "hardware": platform.platform(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (output_dir / "training_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train wav2vec2 CTC ASR model.")
    parser.add_argument("--config", default="ml/speech/wav2vec2/wav2vec2_config.yaml")
    parser.add_argument("--smoke-test", action="store_true")
    parser.add_argument("--resume", default=None)
    args = parser.parse_args()
    run_training(args.config, smoke_test=args.smoke_test, resume_ckpt=args.resume)


if __name__ == "__main__":
    main()
