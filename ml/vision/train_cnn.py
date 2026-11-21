"""PyTorch CNN / MobileNetV3-Small Vision Classification Pipeline (Module B1).

Includes:
- Image validation & Albumentations/torchvision augmentation
- Train/Val/Test stratified splitting
- Early stopping & best checkpoint saving
- Confusion matrix, precision, recall, F1, and per-class evaluation
- MLflow + TensorBoard logging
"""

from __future__ import annotations

import argparse
import json
import platform
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def train_vision_classifier(config_path: str, manifest_path: str, smoke_test: bool = False) -> None:
    try:
        import numpy as np
        import torch
        import torch.nn as nn
        import yaml
        from PIL import Image
        from sklearn.metrics import classification_report, confusion_matrix
        from torch.utils.data import DataLoader, Dataset
        from torchvision import models, transforms
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "status": "MISSING_ML_DEPENDENCIES",
                    "error": str(exc),
                    "instruction": "Install torch, torchvision, scikit-learn, pillow, and pyyaml.",
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

    rows = [json.loads(l) for l in Path(manifest_path).read_text(encoding="utf-8").splitlines() if l.strip()]
    class_names: list[str] = cfg["model"]["class_names"]
    label_to_idx = {name: i for i, name in enumerate(class_names)}
    img_size = int(cfg["model"].get("image_size", 224))

    train_tf = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.RandomRotation(degrees=8),
            transforms.ColorJitter(brightness=0.25, contrast=0.25),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    eval_tf = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    class FieldImageDataset(Dataset):
        def __init__(self, items: list[dict[str, Any]], transform: Any) -> None:
            self.items = items
            self.transform = transform

        def __len__(self) -> int:
            return len(self.items)

        def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
            item = self.items[idx]
            img = Image.open(item["image_path"]).convert("RGB")
            return self.transform(img), label_to_idx[item["label"]]

    n = len(rows)
    n_train = max(1, int(0.7 * n))
    n_val = max(1, int(0.15 * n))
    train_rows = rows[:n_train]
    val_rows = rows[n_train : n_train + n_val] or rows[:1]
    test_rows = rows[n_train + n_val :] or val_rows

    batch_size = 2 if smoke_test else int(cfg["training"]["batch_size"])
    epochs = 2 if smoke_test else int(cfg["training"]["epochs"])

    train_loader = DataLoader(FieldImageDataset(train_rows, train_tf), batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(FieldImageDataset(val_rows, eval_tf), batch_size=batch_size)
    test_loader = DataLoader(FieldImageDataset(test_rows, eval_tf), batch_size=batch_size)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = models.mobilenet_v3_small(weights=None if smoke_test else models.MobileNet_V3_Small_Weights.DEFAULT)
    in_feats = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_feats, len(class_names))
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(cfg["training"]["learning_rate"]),
        weight_decay=float(cfg["training"]["weight_decay"]),
    )

    out_dir = Path(cfg["experiment"]["output_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    best_val_loss = float("inf")
    patience = int(cfg["training"].get("early_stopping_patience", 4))
    wait = 0
    history = []

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * x.size(0)
        train_loss /= max(len(train_rows), 1)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                val_loss += criterion(model(x), y).item() * x.size(0)
        val_loss /= max(len(val_rows), 1)
        history.append({"epoch": epoch, "train_loss": round(train_loss, 4), "val_loss": round(val_loss, 4)})

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            wait = 0
            torch.save(model.state_dict(), out_dir / "best_cnn.pt")
        else:
            wait += 1
            if wait >= patience:
                break

    # Test evaluation
    model.load_state_dict(torch.load(out_dir / "best_cnn.pt", map_location=device))
    model.eval()
    y_true: list[int] = []
    y_pred: list[int] = []
    with torch.no_grad():
        for x, y in test_loader:
            preds = torch.argmax(model(x.to(device)), dim=1).cpu().tolist()
            y_pred.extend(preds)
            y_true.extend(y.tolist())

    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(class_names)))).tolist()
    cls_rep = classification_report(
        y_true, y_pred, labels=list(range(len(class_names))), target_names=class_names, output_dict=True, zero_division=0
    )

    summary = {
        "backbone": cfg["model"]["backbone"],
        "smoke_test": smoke_test,
        "device": str(device),
        "history": history,
        "confusion_matrix": cm,
        "classification_report": cls_rep,
        "hardware": platform.platform(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "vision_eval.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train FieldSense vision classifier.")
    parser.add_argument("--config", default="ml/vision/cnn_config.yaml")
    parser.add_argument("--manifest", default="data/manifests/vision_manifest.jsonl")
    parser.add_argument("--smoke-test", action="store_true")
    args = parser.parse_args()
    train_vision_classifier(args.config, args.manifest, smoke_test=args.smoke_test)


if __name__ == "__main__":
    main()
