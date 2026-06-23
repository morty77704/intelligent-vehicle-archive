"""Plate normalization and validation helpers for Agent B."""

import re
import unicodedata
from typing import Optional


PROVINCE_LOCATIONS = {
    "京": "北京市",
    "沪": "上海市",
    "津": "天津市",
    "渝": "重庆市",
    "冀": "河北省",
    "晋": "山西省",
    "蒙": "内蒙古自治区",
    "辽": "辽宁省",
    "吉": "吉林省",
    "黑": "黑龙江省",
    "苏": "江苏省",
    "浙": "浙江省",
    "皖": "安徽省",
    "闽": "福建省",
    "赣": "江西省",
    "鲁": "山东省",
    "豫": "河南省",
    "鄂": "湖北省",
    "湘": "湖南省",
    "粤": "广东省",
    "桂": "广西壮族自治区",
    "琼": "海南省",
    "川": "四川省",
    "贵": "贵州省",
    "云": "云南省",
    "藏": "西藏自治区",
    "陕": "陕西省",
    "甘": "甘肃省",
    "青": "青海省",
    "宁": "宁夏回族自治区",
    "新": "新疆维吾尔自治区",
}

PROVINCE_SHORT_NAMES = {
    "京": "北京",
    "沪": "上海",
    "津": "天津",
    "渝": "重庆",
    "冀": "河北",
    "晋": "山西",
    "蒙": "内蒙古",
    "辽": "辽宁",
    "吉": "吉林",
    "黑": "黑龙江",
    "苏": "江苏",
    "浙": "浙江",
    "皖": "安徽",
    "闽": "福建",
    "赣": "江西",
    "鲁": "山东",
    "豫": "河南",
    "鄂": "湖北",
    "湘": "湖南",
    "粤": "广东",
    "桂": "广西",
    "琼": "海南",
    "川": "四川",
    "贵": "贵州",
    "云": "云南",
    "藏": "西藏",
    "陕": "陕西",
    "甘": "甘肃",
    "青": "青海",
    "宁": "宁夏",
    "新": "新疆",
}

PROVINCE_CHARS = "".join(PROVINCE_LOCATIONS.keys())
SEPARATORS_PATTERN = re.compile(r"[\s·.\-_—–]+")
BLUE_PLATE_PATTERN = re.compile(rf"^[{PROVINCE_CHARS}][A-Z][A-Z0-9]{{5}}$")
NEW_ENERGY_SMALL_PATTERN = re.compile(rf"^[{PROVINCE_CHARS}][A-Z][DF][A-Z0-9]{{5}}$")
NEW_ENERGY_LARGE_PATTERN = re.compile(rf"^[{PROVINCE_CHARS}][A-Z][A-Z0-9]{{5}}[DF]$")


def normalize_plate(plate: str) -> str:
    """Normalize OCR/user plate text to the compact uppercase plate form."""
    text = unicodedata.normalize("NFKC", plate or "")
    return SEPARATORS_PATTERN.sub("", text).upper()


def get_plate_kind(plate: str) -> Optional[str]:
    """Return blue/new-energy plate kind when the normalized plate is valid."""
    normalized = normalize_plate(plate)
    if BLUE_PLATE_PATTERN.fullmatch(normalized):
        return "blue"
    if NEW_ENERGY_SMALL_PATTERN.fullmatch(normalized):
        return "new_energy_small"
    if NEW_ENERGY_LARGE_PATTERN.fullmatch(normalized):
        return "new_energy_large"
    return None


def is_valid_plate(plate: str) -> bool:
    return get_plate_kind(plate) is not None


def parse_plate(plate: str) -> dict:
    """Parse a valid plate into contract-friendly metadata."""
    normalized = normalize_plate(plate)
    kind = get_plate_kind(normalized)
    is_new_energy = kind in {"new_energy_small", "new_energy_large"}

    return {
        "plate": normalized,
        "location": PROVINCE_LOCATIONS.get(normalized[:1], "未知"),
        "plate_type": "绿牌" if is_new_energy else "蓝牌" if kind == "blue" else "未知",
        "vehicle_type": "大型新能源汽车" if kind == "new_energy_large" else "小型汽车",
        "is_new_energy": is_new_energy,
    }


def short_location(plate: str) -> str:
    normalized = normalize_plate(plate)
    return PROVINCE_SHORT_NAMES.get(normalized[:1], "未知")
