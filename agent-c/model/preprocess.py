from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Iterable

from PIL import Image
from torchvision import transforms


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def list_images(root: Path) -> list[Path]:
    return [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]


def load_rgb_image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGB")


def decode_base64_image(payload: str) -> Image.Image:
    if "," in payload and payload.strip().lower().startswith("data:image"):
        payload = payload.split(",", 1)[1]
    raw = base64.b64decode(payload, validate=True)
    with Image.open(io.BytesIO(raw)) as image:
        return image.convert("RGB")


def build_transform(image_size: int = 300, train: bool = False):
    if train:
        return transforms.Compose(
            [
                transforms.Resize((image_size, image_size)),
                transforms.RandomHorizontalFlip(),
                transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.1),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ]
        )
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


def discover_class_names(split_root: Path) -> list[str]:
    if not split_root.exists():
        return []
    return sorted(path.name for path in split_root.iterdir() if path.is_dir())

