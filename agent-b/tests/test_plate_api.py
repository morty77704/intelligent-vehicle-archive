import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.main import app


client = TestClient(app)


def test_health_contract():
    response = client.get("/api/plate/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "model_loaded" in data
    assert data["model_loaded"] is False
    assert "plate" in data["model_name"]


def test_infer_contract():
    response = client.post("/api/plate/infer", json={"image": "ZmFrZS1pbWFnZQ=="})

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["result"]["plate"] == "京A12345"
    assert data["result"]["plate_type"] == "蓝牌"
    assert data["result"]["location"] == "北京"
    assert data["result"]["confidence"] > 0
    assert data["latency_ms"] >= 0


def test_plate_info_normalizes_plate_number():
    response = client.post(
        "/api/plate/tools/plate_info",
        json={"params": {"plate": "京A·12345"}},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"] == {
        "plate": "京A12345",
        "location": "北京市",
        "plate_type": "蓝牌",
        "vehicle_type": "小型汽车",
        "is_new_energy": False,
    }


def test_plate_info_detects_new_energy_plate():
    response = client.post(
        "/api/plate/tools/plate_info",
        json={"params": {"plate": "粤BDF5678"}},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["plate"] == "粤BDF5678"
    assert data["location"] == "广东省"
    assert data["plate_type"] == "绿牌"
    assert data["is_new_energy"] is True


def test_plate_info_normalizes_full_width_and_lowercase_input():
    response = client.post(
        "/api/plate/tools/plate_info",
        json={"params": {"plate": " 京ａ．１２３４５ "}},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["plate"] == "京A12345"
    assert data["location"] == "北京市"


def test_plate_info_detects_large_new_energy_plate():
    response = client.post(
        "/api/plate/tools/plate_info",
        json={"params": {"plate": "京A12345D"}},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["plate"] == "京A12345D"
    assert data["plate_type"] == "绿牌"
    assert data["vehicle_type"] == "大型新能源汽车"
    assert data["is_new_energy"] is True


def test_violation_contract():
    response = client.post(
        "/api/plate/tools/violation",
        json={"params": {"plate": "京A12345"}},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["total_count"] == 2
    assert data["data"]["records"][0]["fine"] == 200


def test_history_contract():
    response = client.post(
        "/api/plate/tools/history",
        json={"params": {"plate": "京A12345"}},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["next_inspection"] == "2025-01-10"
    assert data["data"]["maintenance_records"] == 5


def test_invalid_plate_returns_400():
    response = client.post(
        "/api/plate/tools/plate_info",
        json={"params": {"plate": "BAD"}},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "车牌号格式不正确"
