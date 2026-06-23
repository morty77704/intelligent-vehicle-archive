import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.prepare_ccpd import decode_plate, parse_ccpd_filename, split_records, write_yolo_dataset, yolo_line


def test_decode_plate_from_ccpd_indices():
    assert decode_plate("0_0_3_30_30_25_31") == "皖AD6617"
    assert decode_plate("0_0_3_30_30_25_31_32") == "皖AD66178"


def test_parse_ccpd_filename_extracts_bbox_and_plate(tmp_path):
    from PIL import Image

    image = tmp_path / "0014128352490421455-90_90-212I467_271I489-271I489_212I489_212I467_271I467-0_0_3_30_30_25_31_32-79-4.jpg"
    Image.new("RGB", (720, 1160)).save(image)

    record = parse_ccpd_filename(image, tmp_path)

    assert record.plate == "皖AD66178"
    assert record.bbox_x1 == 212
    assert record.bbox_y1 == 467
    assert record.bbox_x2 == 271
    assert record.bbox_y2 == 489
    assert record.width == 720
    assert record.height == 1160


def test_yolo_line_uses_normalized_bbox_coordinates(tmp_path):
    from PIL import Image

    image = tmp_path / "sample-0_0-10I20_30I60-30I60_10I60_10I20_30I20-0_0_3_30_30_25_31-0-0.jpg"
    Image.new("RGB", (100, 100)).save(image)

    record = parse_ccpd_filename(image, tmp_path)

    assert yolo_line(record) == "0 0.200000 0.400000 0.200000 0.400000"


def test_write_yolo_dataset_creates_ultralytics_structure(tmp_path):
    from PIL import Image

    records = []
    for index in range(3):
        split_dir = tmp_path / "source" / "train"
        split_dir.mkdir(parents=True, exist_ok=True)
        image = split_dir / f"sample{index}-0_0-10I20_30I60-30I60_10I60_10I20_30I20-0_0_3_30_30_25_31-0-0.jpg"
        Image.new("RGB", (100, 100)).save(image)
        records.append(parse_ccpd_filename(image, tmp_path / "source"))

    dataset_dir = tmp_path / "dataset"
    write_yolo_dataset(records, dataset_dir, train_ratio=0.8, val_ratio=0.1, seed=2026)

    assert (dataset_dir / "plate.yaml").exists()
    assert (dataset_dir / "images" / "train" / "train_000000.jpg").exists()
    assert (dataset_dir / "labels" / "train" / "train_000000.txt").read_text(encoding="utf-8").startswith("0 ")
    assert "names:" in (dataset_dir / "plate.yaml").read_text(encoding="utf-8")


def test_split_records_falls_back_to_ratio_when_no_explicit_split(tmp_path):
    from PIL import Image

    records = []
    for index in range(10):
        image = tmp_path / f"sample{index}-0_0-10I20_30I60-30I60_10I60_10I20_30I20-0_0_3_30_30_25_31-0-0.jpg"
        Image.new("RGB", (100, 100)).save(image)
        records.append(parse_ccpd_filename(image, tmp_path))

    splits = split_records(records, train_ratio=0.8, val_ratio=0.1, seed=2026)

    assert len(splits["train"]) == 8
    assert len(splits["val"]) == 1
    assert len(splits["test"]) == 1
