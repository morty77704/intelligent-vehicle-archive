"""Prepare CCPD data manifests and YOLO plate-detection labels.

The CCPD annotation is encoded in each image filename. This script reads the
filename metadata and writes lightweight outputs under agent-b/data/generated
without copying the source images by default.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image


PROVINCES = [
    "皖", "沪", "津", "渝", "冀", "晋", "蒙", "辽", "吉", "黑",
    "苏", "浙", "京", "闽", "赣", "鲁", "豫", "鄂", "湘", "粤",
    "桂", "琼", "川", "贵", "云", "藏", "陕", "甘", "青", "宁",
    "新",
]

ALPHABETS = [
    "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
    "L", "M", "N", "P", "Q", "R", "S", "T", "U", "V",
    "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5",
    "6", "7", "8", "9",
]


@dataclass
class CcpdRecord:
    image_path: str
    split: str
    plate: str
    bbox_x1: int
    bbox_y1: int
    bbox_x2: int
    bbox_y2: int
    width: int
    height: int
    plate_type: str


def decode_plate(indices: str) -> str:
    values = [int(item) for item in indices.split("_")]
    if len(values) not in (7, 8):
        raise ValueError(f"Expected 7 or 8 plate indices, got {len(values)}")

    province = PROVINCES[values[0]]
    chars = [ALPHABETS[index] for index in values[1:]]
    return province + "".join(chars)


def parse_point_pair(value: str) -> tuple[int, int]:
    x, y = value.split("I", 1)
    return int(x), int(y)


def parse_ccpd_filename(path: Path, dataset_root: Path) -> CcpdRecord:
    parts = path.stem.split("-")
    if len(parts) < 5:
        raise ValueError("Filename does not contain CCPD annotation segments")

    left_top, right_bottom = parts[2].split("_", 1)
    x1, y1 = parse_point_pair(left_top)
    x2, y2 = parse_point_pair(right_bottom)
    plate = decode_plate(parts[4])

    with Image.open(path) as image:
        width, height = image.size

    relative_parent = path.parent.relative_to(dataset_root)
    split = str(relative_parent).replace("\\", "/")
    plate_type = "green" if len(plate) == 8 or "green" in split.lower() else "blue"

    return CcpdRecord(
        image_path=str(path),
        split=split,
        plate=plate,
        bbox_x1=x1,
        bbox_y1=y1,
        bbox_x2=x2,
        bbox_y2=y2,
        width=width,
        height=height,
        plate_type=plate_type,
    )


def iter_images(dataset_root: Path) -> list[Path]:
    return sorted(dataset_root.rglob("*.jpg"))


def sample_images(images: list[Path], limit: int | None, seed: int) -> list[Path]:
    if limit is None or limit >= len(images):
        return images
    rng = random.Random(seed)
    return sorted(rng.sample(images, limit))


def split_records(records: list[CcpdRecord], train_ratio: float, val_ratio: float, seed: int) -> dict[str, list[CcpdRecord]]:
    grouped = {"train": [], "val": [], "test": []}
    explicit_split = all(any(item in record.split.lower().split("/") for item in ("train", "val", "test")) for record in records)
    if explicit_split:
        for record in records:
            parts = record.split.lower().split("/")
            if "train" in parts:
                grouped["train"].append(record)
            elif "val" in parts:
                grouped["val"].append(record)
            else:
                grouped["test"].append(record)
        return grouped

    shuffled = records[:]
    random.Random(seed).shuffle(shuffled)
    train_end = int(len(shuffled) * train_ratio)
    val_end = train_end + int(len(shuffled) * val_ratio)
    grouped["train"] = shuffled[:train_end]
    grouped["val"] = shuffled[train_end:val_end]
    grouped["test"] = shuffled[val_end:]
    return grouped


def yolo_line(record: CcpdRecord) -> str:
    x_center = ((record.bbox_x1 + record.bbox_x2) / 2) / record.width
    y_center = ((record.bbox_y1 + record.bbox_y2) / 2) / record.height
    box_width = (record.bbox_x2 - record.bbox_x1) / record.width
    box_height = (record.bbox_y2 - record.bbox_y1) / record.height
    return f"0 {x_center:.6f} {y_center:.6f} {box_width:.6f} {box_height:.6f}"


def write_manifest(records: list[CcpdRecord], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = output_dir / "ccpd_manifest.jsonl"
    csv_path = output_dir / "ccpd_manifest.csv"

    with jsonl_path.open("w", encoding="utf-8") as fp:
        for record in records:
            fp.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")

    with csv_path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=list(asdict(records[0]).keys()))
        writer.writeheader()
        for record in records:
            writer.writerow(asdict(record))


def write_yolo_labels(records: list[CcpdRecord], output_dir: Path) -> None:
    labels_dir = output_dir / "yolo_plate" / "labels"
    images_txt = output_dir / "yolo_plate" / "images.txt"
    labels_dir.mkdir(parents=True, exist_ok=True)

    with images_txt.open("w", encoding="utf-8") as image_list:
        for index, record in enumerate(records):
            label_path = labels_dir / f"{index:06d}.txt"
            label_path.write_text(yolo_line(record) + "\n", encoding="utf-8")
            image_list.write(f"{record.image_path}\t{label_path}\t{record.plate}\n")


def link_or_copy(src: Path, dst: Path) -> None:
    if dst.exists():
        return
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def write_yolo_dataset(records: list[CcpdRecord], dataset_dir: Path, train_ratio: float, val_ratio: float, seed: int) -> None:
    splits = split_records(records, train_ratio, val_ratio, seed)
    for split_name, split_records_value in splits.items():
        (dataset_dir / "images" / split_name).mkdir(parents=True, exist_ok=True)
        (dataset_dir / "labels" / split_name).mkdir(parents=True, exist_ok=True)

        for index, record in enumerate(split_records_value):
            source = Path(record.image_path)
            target_name = f"{split_name}_{index:06d}{source.suffix.lower()}"
            image_target = dataset_dir / "images" / split_name / target_name
            label_target = dataset_dir / "labels" / split_name / f"{Path(target_name).stem}.txt"
            link_or_copy(source, image_target)
            label_target.write_text(yolo_line(record) + "\n", encoding="utf-8")

    yaml_text = "\n".join([
        f"path: {dataset_dir.as_posix()}",
        "train: images/train",
        "val: images/val",
        "test: images/test",
        "names:",
        "  0: plate",
        "",
    ])
    (dataset_dir / "plate.yaml").write_text(yaml_text, encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare CCPD manifest and YOLO labels for Agent B.")
    parser.add_argument("--dataset-root", default=r"D:\车牌数据集\datasets", help="Root directory containing CCPD images.")
    parser.add_argument("--output-dir", default=r"agent-b\data\generated", help="Output directory for generated metadata.")
    parser.add_argument("--limit", type=int, default=500, help="Maximum number of images to parse; use 0 for all images.")
    parser.add_argument("--seed", type=int, default=2026, help="Random seed for sampling.")
    parser.add_argument("--materialize-yolo", action="store_true", help="Create a trainable YOLO dataset with image links/copies.")
    parser.add_argument("--yolo-dataset-dir", default=r"agent-b\data\yolo_plate_dataset", help="Output directory for trainable YOLO dataset.")
    parser.add_argument("--train-ratio", type=float, default=0.8, help="Train split ratio when source data has no explicit split.")
    parser.add_argument("--val-ratio", type=float, default=0.1, help="Validation split ratio when source data has no explicit split.")
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    dataset_root = Path(args.dataset_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    limit = None if args.limit == 0 else args.limit

    images = iter_images(dataset_root)
    if not images:
        raise SystemExit(f"No .jpg images found under {dataset_root}")

    selected = sample_images(images, limit, args.seed)
    records = [parse_ccpd_filename(path, dataset_root) for path in selected]

    write_manifest(records, output_dir)
    write_yolo_labels(records, output_dir)

    if args.materialize_yolo:
        write_yolo_dataset(
            records,
            Path(args.yolo_dataset_dir).resolve(),
            args.train_ratio,
            args.val_ratio,
            args.seed,
        )

    green_count = sum(1 for item in records if item.plate_type == "green")
    blue_count = len(records) - green_count
    print(f"Prepared {len(records)} CCPD records.")
    print(f"Blue plates: {blue_count}; green plates: {green_count}.")
    print(f"Output: {output_dir}")
    if args.materialize_yolo:
        print(f"YOLO dataset: {Path(args.yolo_dataset_dir).resolve()}")


if __name__ == "__main__":
    main()
