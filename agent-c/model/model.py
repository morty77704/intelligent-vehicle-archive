from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from torch import nn
from torchvision import models

try:
    from .labels import BINARY_CLASS_TO_CONDITION, DAMAGE_LABELS
    from .preprocess import build_transform
except ImportError:  # pragma: no cover - allows direct script execution
    from labels import BINARY_CLASS_TO_CONDITION, DAMAGE_LABELS
    from preprocess import build_transform


DEFAULT_MODEL_NAME = "efficientnet-b3-damage"


def build_model(num_classes: int, pretrained: bool = False) -> nn.Module:
    weights = models.EfficientNet_B3_Weights.DEFAULT if pretrained else None
    model = models.efficientnet_b3(weights=weights)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


def estimate_severity(confidence: float, condition: str) -> str:
    if condition == "normal":
        return "mild"
    if confidence >= 0.85:
        return "severe"
    if confidence >= 0.65:
        return "moderate"
    return "mild"


def normalize_condition(label: str) -> str:
    label = label.strip()
    if label in DAMAGE_LABELS:
        return label
    return BINARY_CLASS_TO_CONDITION.get(label.lower(), "scratch_front_bumper")


@dataclass
class DamagePrediction:
    conditions: list[str]
    severity: str
    confidence: float


class DamageModelService:
    def __init__(
        self,
        weights_path: str | Path | None = None,
        class_names: list[str] | None = None,
        image_size: int = 300,
        device: str | None = None,
    ) -> None:
        self.weights_path = Path(weights_path) if weights_path else None
        self.image_size = image_size
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        self.class_names = class_names or ["00-damage", "01-whole"]
        self.model_name = DEFAULT_MODEL_NAME
        self.model: nn.Module | None = None
        self.transform = build_transform(image_size=image_size, train=False)
        self.loaded = False
        self._load()

    def _load(self) -> None:
        if not self.weights_path or not self.weights_path.exists():
            self.loaded = False
            return
        checkpoint = torch.load(self.weights_path, map_location=self.device)
        self.class_names = checkpoint.get("class_names", self.class_names)
        self.model_name = checkpoint.get("model_name", self.model_name)
        image_size = checkpoint.get("image_size", self.image_size)
        if image_size != self.image_size:
            self.image_size = image_size
            self.transform = build_transform(image_size=image_size, train=False)
        self.model = build_model(num_classes=len(self.class_names))
        state_dict = checkpoint.get("model_state_dict", checkpoint)
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()
        self.loaded = True

    def predict(self, image: Image.Image) -> DamagePrediction:
        if not self.loaded or self.model is None:
            return DamagePrediction(["normal"], "mild", 0.0)

        tensor = self.transform(image).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1)[0]
            confidence, index = torch.max(probs, dim=0)

        label = self.class_names[int(index)]
        condition = normalize_condition(label)
        conf = float(confidence.detach().cpu().item())
        return DamagePrediction(
            conditions=[condition],
            severity=estimate_severity(conf, condition),
            confidence=round(conf, 4),
        )

    def metadata(self) -> dict[str, Any]:
        return {
            "model_loaded": self.loaded,
            "model_name": self.model_name,
            "class_names": self.class_names,
            "device": str(self.device),
        }
