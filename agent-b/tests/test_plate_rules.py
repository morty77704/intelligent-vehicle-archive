import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.plate_rules import get_plate_kind, is_valid_plate, normalize_plate, parse_plate


def test_normalize_plate_removes_common_separators_and_full_width_chars():
    assert normalize_plate(" 京Ａ·１２３４５ ") == "京A12345"
    assert normalize_plate("京A-12345") == "京A12345"
    assert normalize_plate("京a.12345") == "京A12345"


def test_blue_plate_rule():
    assert get_plate_kind("京A12345") == "blue"
    assert is_valid_plate("京A12345") is True
    assert parse_plate("京A12345") == {
        "plate": "京A12345",
        "location": "北京市",
        "plate_type": "蓝牌",
        "vehicle_type": "小型汽车",
        "is_new_energy": False,
    }


def test_small_new_energy_plate_rule():
    data = parse_plate("沪AD12345")

    assert get_plate_kind("沪AD12345") == "new_energy_small"
    assert data["plate_type"] == "绿牌"
    assert data["vehicle_type"] == "小型汽车"
    assert data["is_new_energy"] is True


def test_large_new_energy_plate_rule():
    data = parse_plate("京A12345D")

    assert get_plate_kind("京A12345D") == "new_energy_large"
    assert data["plate_type"] == "绿牌"
    assert data["vehicle_type"] == "大型新能源汽车"
    assert data["is_new_energy"] is True


def test_rejects_invalid_plate_patterns():
    assert is_valid_plate("粤B123456") is False
    assert is_valid_plate("京A1234") is False
    assert is_valid_plate("BAD") is False
    assert is_valid_plate("京012345") is False
