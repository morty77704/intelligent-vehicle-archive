from __future__ import annotations

import json
import re
from pathlib import Path


KB_PATH = Path(__file__).resolve().parents[1] / "knowledge_base" / "insurance_rules.json"


def _load_rules() -> dict:
    return json.loads(KB_PATH.read_text(encoding="utf-8"))


def _parse_max_cost(repair_cost: str) -> int:
    numbers = [int(n) for n in re.findall(r"\d+", repair_cost or "")]
    if not numbers:
        return 0
    return max(numbers)


def recommend_insurance(conditions: list[str], repair_cost: str) -> dict:
    rules = _load_rules()
    threshold = int(rules["next_year_premium_increase_yuan"])
    max_cost = _parse_max_cost(repair_cost)
    severe_keywords = {"glass_crack", "broken_light"}
    has_safety_part = any(item in severe_keywords for item in conditions)

    if max_cost <= 0:
        return {
            "recommendation": "建议补充维修报价后再判断",
            "reason": "当前维修费用无法解析，无法与次年保费涨幅比较",
        }
    if max_cost < threshold and not has_safety_part:
        return {
            "recommendation": "不建议走保险",
            "reason": f"预估维修费用低于次年保费涨幅参考值（约{threshold}元），建议自费修复",
        }
    return {
        "recommendation": "建议走保险",
        "reason": f"预估维修费用已接近或高于次年保费涨幅参考值（约{threshold}元），且可能涉及较高维修风险",
    }

