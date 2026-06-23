"""Recognizer abstraction for Agent B plate inference."""

from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

try:
    from .plate_rules import parse_plate, short_location
except ImportError:  # pragma: no cover
    from plate_rules import parse_plate, short_location


@dataclass
class PlateRecognitionResult:
    plate: str
    plate_type: str
    location: str
    confidence: float

    def as_dict(self) -> dict:
        return {
            "plate": self.plate,
            "plate_type": self.plate_type,
            "location": self.location,
            "confidence": self.confidence,
        }


class MockPlateRecognizer:
    model_loaded = False
    model_name = "mock-yolov8-paddleocr-plate"

    def recognize(self, image_base64: str) -> PlateRecognitionResult:
        return PlateRecognitionResult(
            plate="京A12345",
            plate_type="蓝牌",
            location=short_location("京A12345"),
            confidence=0.97,
        )


class YoloPaddlePlateRecognizer:
    model_loaded = True
    model_name = "yolov8-paddleocr-plate"

    def __init__(self, yolo_weights: str | Path, ocr_kwargs: dict[str, Any] | None = None):
        try:
            from paddleocr import PaddleOCR
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("YOLO/PaddleOCR dependencies are not installed.") from exc

        default_ocr_kwargs = {
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "lang": "ch",
        }
        default_ocr_kwargs.update(ocr_kwargs or {})
        self.detector = YOLO(str(yolo_weights))
        self.ocr = PaddleOCR(**default_ocr_kwargs)

    def recognize(self, image_base64: str) -> PlateRecognitionResult:
        image = Image.open(io.BytesIO(base64.b64decode(image_base64))).convert("RGB")
        detections = self.detector.predict(image, verbose=False)
        if not detections or detections[0].boxes is None or len(detections[0].boxes) == 0:
            raise ValueError("未检测到车牌")

        box = max(detections[0].boxes, key=lambda item: float(item.conf[0]))
        x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
        crop = image.crop((x1, y1, x2, y2))
        try:
            ocr_result = self.ocr.predict(
                crop,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        except (AttributeError, TypeError):
            ocr_result = self.ocr.ocr(crop, cls=True)
        text, ocr_conf = self._best_ocr_text(ocr_result)
        info = parse_plate(text)
        detector_conf = float(box.conf[0])
        confidence = round(detector_conf * ocr_conf, 4)

        return PlateRecognitionResult(
            plate=info["plate"],
            plate_type=info["plate_type"],
            location=short_location(info["plate"]),
            confidence=confidence,
        )

    @staticmethod
    def _best_ocr_text(ocr_result: Any) -> tuple[str, float]:
        candidates: list[tuple[str, float]] = []
        for page in ocr_result or []:
            if hasattr(page, "json"):
                data = page.json
                if callable(data):
                    data = data()
                res = data.get("res", data) if isinstance(data, dict) else {}
                texts = res.get("rec_texts") or res.get("text") or []
                scores = res.get("rec_scores") or res.get("scores") or []
                for text, score in zip(texts, scores):
                    candidates.append((str(text), float(score)))
                continue
            for item in page or []:
                if len(item) >= 2 and isinstance(item[1], (list, tuple)) and len(item[1]) >= 2:
                    candidates.append((str(item[1][0]), float(item[1][1])))
        if not candidates:
            raise ValueError("OCR 未识别到车牌文本")
        return max(candidates, key=lambda item: item[1])


def build_recognizer() -> MockPlateRecognizer | YoloPaddlePlateRecognizer:
    weights = os.getenv("PLATE_YOLO_WEIGHTS", "").strip()
    if weights:
        return YoloPaddlePlateRecognizer(weights)
    return MockPlateRecognizer()
