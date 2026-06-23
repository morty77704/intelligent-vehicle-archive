"""Smoke-test PaddleOCR text recognition and plate-rule parsing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from api.plate_rules import is_valid_plate, normalize_plate, parse_plate
except ImportError:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from api.plate_rules import is_valid_plate, normalize_plate, parse_plate


def read_manifest_record(manifest_path: Path, index: int) -> dict:
    with manifest_path.open("r", encoding="utf-8") as fp:
        for current, line in enumerate(fp):
            if current == index and line.strip():
                return json.loads(line)
    raise SystemExit(f"No record at index {index} in {manifest_path}")


def extract_candidates(result) -> list[tuple[str, float]]:
    candidates: list[tuple[str, float]] = []
    for page in result or []:
        if hasattr(page, "json"):
            data = page.json
            if callable(data):
                data = data()
            res = data.get("res", data) if isinstance(data, dict) else {}
            for text, score in zip(res.get("rec_texts") or [], res.get("rec_scores") or []):
                candidates.append((str(text), float(score)))
            continue
        for item in page or []:
            if len(item) >= 2 and isinstance(item[1], (list, tuple)) and len(item[1]) >= 2:
                candidates.append((str(item[1][0]), float(item[1][1])))
    return candidates


def run_ocr(image_path: Path) -> tuple[str, float]:
    from paddleocr import PaddleOCR

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
        ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        result = ocr.ocr(str(image_path), cls=True)

    candidates = extract_candidates(result)
    if not candidates:
        raise SystemExit("PaddleOCR returned no text candidates.")
    return max(candidates, key=lambda item: item[1])


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke-test PaddleOCR + Agent B plate rules.")
    parser.add_argument("--manifest", default=r"agent-b\data\generated\ccpd_manifest.jsonl")
    parser.add_argument("--index", type=int, default=1, help="Manifest row index to test.")
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    record = read_manifest_record(Path(args.manifest).resolve(), args.index)
    image_path = Path(record["image_path"])
    text, confidence = run_ocr(image_path)
    normalized = normalize_plate(text)
    valid = is_valid_plate(normalized)
    parsed = parse_plate(normalized) if valid else {}

    output = {
        "image": str(image_path),
        "expected_plate": record["plate"],
        "ocr_text": text,
        "ocr_confidence": round(confidence, 4),
        "normalized": normalized,
        "valid": valid,
        "parsed": parsed,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if not valid:
        raise SystemExit(f"OCR text is not a valid plate after normalization: {normalized}")


if __name__ == "__main__":
    main()
