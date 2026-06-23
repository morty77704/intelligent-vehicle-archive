from __future__ import annotations

import json
from pathlib import Path


KB_PATH = Path(__file__).resolve().parents[1] / "knowledge_base" / "damage_map.json"


def _load_damage_map() -> dict:
    return json.loads(KB_PATH.read_text(encoding="utf-8"))


def diagnose_damage(conditions: list[str], severity: str) -> dict:
    damage_map = _load_damage_map()
    items = []
    affected_parts: list[str] = []
    safety_notes: list[str] = []

    for condition in conditions or ["normal"]:
        info = damage_map.get(condition, damage_map["normal"])
        severity_text = info.get("severity_notes", {}).get(severity, info["description"])
        items.append(severity_text)
        affected_parts.extend(info.get("affected_parts", []))
        safety_notes.append(info.get("safety_impact", "需进一步检查"))

    affected_parts = sorted(set(affected_parts))
    if conditions == ["normal"] or "normal" in conditions:
        safety_impact = "无明显安全隐患"
    elif severity == "severe":
        safety_impact = "可能影响行车安全，建议暂停长途行驶并尽快检修"
    else:
        safety_impact = "主要影响外观，建议维修前继续观察是否扩大"

    return {
        "diagnosis": "；".join(items),
        "affected_parts": affected_parts,
        "safety_impact": safety_impact,
    }

