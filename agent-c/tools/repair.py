from __future__ import annotations

import json
from pathlib import Path


KB_PATH = Path(__file__).resolve().parents[1] / "knowledge_base" / "repair_cost.json"


def _load_repair_costs() -> dict:
    return json.loads(KB_PATH.read_text(encoding="utf-8"))


def estimate_repair(diagnosis: str) -> dict:
    costs = _load_repair_costs()
    text = diagnosis or ""
    if "无明显损伤" in text or "正常" in text:
        key = "normal"
    elif "玻璃" in text:
        key = "glass"
    elif "车灯" in text or "灯" in text:
        key = "light"
    elif "凹陷" in text or "变形" in text:
        key = "dent"
    elif "脱落" in text or "漆" in text:
        key = "paint"
    else:
        key = "scratch"
    return costs[key]

