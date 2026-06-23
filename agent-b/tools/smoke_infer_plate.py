"""Smoke-test plate detection + OCR integration on a generated manifest sample."""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

try:
    from api.plate_rules import is_valid_plate, normalize_plate, parse_plate
except ImportError:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from api.plate_rules import is_valid_plate, normalize_plate, parse_plate


def iter_manifest_records(manifest_path: Path):
    with manifest_path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if line.strip():
                yield json.loads(line)


def load_detector(weights: Path):
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("ultralytics is not installed. Run: pip install -r agent-b/requirements.txt") from exc
    return YOLO(str(weights))


def detect_plate(model, image_path: Path):
    results = model.predict(str(image_path), verbose=False)
    if not results or results[0].boxes is None or len(results[0].boxes) == 0:
        return None

    box = max(results[0].boxes, key=lambda item: float(item.conf[0]))
    return {
        "xyxy": [round(float(value), 2) for value in box.xyxy[0].tolist()],
        "confidence": round(float(box.conf[0]), 4),
    }


def try_paddle_ocr(image_path: Path) -> tuple[str, float, str]:
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        return "", 0.0, "paddleocr_not_installed"

    try:
        ocr = PaddleOCR(
            lang="ch",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        result = ocr.predict(
            str(image_path),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    except (AttributeError, TypeError):
        ocr = PaddleOCR(use_angle_cls=True, lang="ch")
        result = ocr.ocr(str(image_path), cls=True)
    except Exception as exc:
        return "", 0.0, f"paddleocr_runtime_error:{type(exc).__name__}"

    candidates = []
    for page in result or []:
        if hasattr(page, "json"):
            data = page.json
            if callable(data):
                data = data()
            res = data.get("res", data) if isinstance(data, dict) else {}
            texts = res.get("rec_texts") or []
            scores = res.get("rec_scores") or []
            for text, score in zip(texts, scores):
                candidates.append((str(text), float(score)))
            continue
        for item in page or []:
            if len(item) >= 2 and isinstance(item[1], (list, tuple)) and len(item[1]) >= 2:
                candidates.append((str(item[1][0]), float(item[1][1])))
    if not candidates:
        return "", 0.0, "ocr_empty"
    text, confidence = max(candidates, key=lambda item: item[1])
    return text, confidence, "ok"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke-test Agent B YOLO + OCR inference flow.")
    parser.add_argument("--manifest", default=r"agent-b\data\generated\ccpd_manifest.jsonl")
    parser.add_argument("--weights", default=r"agent-b\model\weights\plate_yolov8n.pt")
    parser.add_argument("--max-images", type=int, default=30, help="Maximum manifest images to scan for a YOLO detection.")
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    manifest_path = Path(args.manifest).resolve()
    weights = Path(args.weights).resolve()
    if not manifest_path.exists():
        raise SystemExit(f"Manifest not found: {manifest_path}")
    if not weights.exists():
        raise SystemExit(f"YOLO weights not found: {weights}")

    model = load_detector(weights)
    selected = None
    detection = None
    for index, record in enumerate(iter_manifest_records(manifest_path)):
        if index >= args.max_images:
            break
        image_path = Path(record["image_path"])
        detection = detect_plate(model, image_path)
        if detection:
            selected = record
            break

    if not selected or not detection:
        raise SystemExit(f"YOLO did not detect any plate boxes in first {args.max_images} manifest images.")

    record = selected
    image_path = Path(record["image_path"])
    ocr_text, ocr_confidence, ocr_status = try_paddle_ocr(image_path)
    text_for_rules = ocr_text if ocr_status == "ok" else record["plate"]
    normalized = normalize_plate(text_for_rules)

    if not is_valid_plate(normalized):
        raise SystemExit(f"Recognized plate is invalid: {normalized}")

    parsed = parse_plate(normalized)
    result = {
        "image": str(image_path),
        "detection": detection,
        "ocr_status": ocr_status,
        "ocr_text": ocr_text,
        "ocr_confidence": round(ocr_confidence, 4),
        "plate": parsed["plate"],
        "plate_type": parsed["plate_type"],
        "location": parsed["location"],
        "fallback_used": ocr_status != "ok",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
