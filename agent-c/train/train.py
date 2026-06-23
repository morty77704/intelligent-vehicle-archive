from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import torch
from torch import nn
from torch.utils.data import DataLoader, Subset
from torchvision.datasets import ImageFolder

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from model.model import DEFAULT_MODEL_NAME, build_model
from model.preprocess import build_transform


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train Agent C damage detection model.")
    parser.add_argument("--data-root", type=Path, default=ROOT.parent / "archive" / "data1a")
    parser.add_argument("--output", type=Path, default=ROOT / "model" / "weights" / "damage_efficientnet_b3.pt")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--image-size", type=int, default=300)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--pretrained", action="store_true", help="Use torchvision pretrained weights.")
    parser.add_argument("--max-train-samples", type=int, default=0, help="Limit training samples for smoke tests.")
    parser.add_argument("--max-val-samples", type=int, default=0, help="Limit validation samples for smoke tests.")
    return parser.parse_args()


def accuracy(model: nn.Module, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            preds = logits.argmax(dim=1)
            correct += int((preds == labels).sum().item())
            total += labels.numel()
    return correct / total if total else 0.0


def main() -> None:
    args = parse_args()
    train_dir = args.data_root / "training"
    val_dir = args.data_root / "validation"
    if not train_dir.exists():
        raise FileNotFoundError(f"Training directory not found: {train_dir}")
    if not val_dir.exists():
        raise FileNotFoundError(f"Validation directory not found: {val_dir}")

    train_dataset = ImageFolder(train_dir, transform=build_transform(args.image_size, train=True))
    val_dataset = ImageFolder(val_dir, transform=build_transform(args.image_size, train=False))
    class_names = train_dataset.classes
    train_size = len(train_dataset)
    val_size = len(val_dataset)
    if args.max_train_samples > 0:
        train_dataset = Subset(train_dataset, range(min(args.max_train_samples, len(train_dataset))))
    if args.max_val_samples > 0:
        val_dataset = Subset(val_dataset, range(min(args.max_val_samples, len(val_dataset))))
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
    )

    device = torch.device(args.device)
    model = build_model(num_classes=len(class_names), pretrained=args.pretrained).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    history = []
    best_val_acc = -1.0
    best_state_dict = None
    best_epoch = 0
    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            running_loss += float(loss.item()) * labels.size(0)

        train_loss = running_loss / max(len(train_dataset), 1)
        val_acc = accuracy(model, val_loader, device)
        row = {"epoch": epoch, "train_loss": round(train_loss, 4), "val_accuracy": round(val_acc, 4)}
        history.append(row)
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_epoch = epoch
            best_state_dict = {
                key: value.detach().cpu()
                for key, value in model.state_dict().items()
            }
        print(json.dumps(row, ensure_ascii=False))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model_name": DEFAULT_MODEL_NAME,
            "model_state_dict": best_state_dict or model.state_dict(),
            "class_names": class_names,
            "image_size": args.image_size,
            "history": history,
            "best_epoch": best_epoch,
            "best_val_accuracy": round(best_val_acc, 4),
            "source_train_size": train_size,
            "source_val_size": val_size,
        },
        args.output,
    )
    print(f"Saved best model from epoch {best_epoch} to {args.output}")


if __name__ == "__main__":
    main()
