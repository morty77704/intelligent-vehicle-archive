"""Train a YOLOv8 plate detector for Agent B."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train YOLOv8 plate detector for Agent B.")
    parser.add_argument("--data", default=r"agent-b\data\yolo_plate_dataset\plate.yaml", help="Ultralytics dataset yaml.")
    parser.add_argument("--model", default="yolov8n.pt", help="Base YOLOv8 model or checkpoint.")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs.")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size.")
    parser.add_argument("--batch", type=int, default=8, help="Batch size.")
    parser.add_argument("--device", default="cpu", help="Training device, e.g. cpu, 0.")
    parser.add_argument("--project", default=r"agent-b\model\runs", help="Ultralytics project output directory.")
    parser.add_argument("--name", default="plate_yolov8n", help="Run name.")
    parser.add_argument("--export-best", default=r"agent-b\model\weights\plate_yolov8n.pt", help="Copy best.pt to this path after training.")
    parser.add_argument("--dry-run", action="store_true", help="Only validate paths and print the training command.")
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    data_path = Path(args.data).resolve()
    project_dir = Path(args.project).resolve()
    export_best = Path(args.export_best).resolve()
    if not data_path.exists():
        raise SystemExit(f"Dataset yaml not found: {data_path}")

    print("YOLOv8 training configuration:")
    print(f"  data: {data_path}")
    print(f"  model: {args.model}")
    print(f"  epochs: {args.epochs}")
    print(f"  imgsz: {args.imgsz}")
    print(f"  batch: {args.batch}")
    print(f"  device: {args.device}")
    print(f"  project: {project_dir}")
    print(f"  name: {args.name}")
    print(f"  export_best: {export_best}")

    if args.dry_run:
        print("Dry run passed. Remove --dry-run to start training.")
        return

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("ultralytics is not installed. Run: pip install -r agent-b/requirements.txt") from exc

    model = YOLO(args.model)
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(project_dir),
        name=args.name,
    )
    save_dir = Path(results.save_dir)
    best_path = save_dir / "weights" / "best.pt"
    if best_path.exists():
        export_best.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(best_path, export_best)
        print(f"Exported best weights to {export_best}")


if __name__ == "__main__":
    main()
