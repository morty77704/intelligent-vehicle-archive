from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path
import sys

from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.pop("api", None)
sys.modules.pop("model", None)
sys.modules.pop("tools", None)

from api.server import app


client = TestClient(app)


def _sample_image_b64() -> str:
    image = Image.new("RGB", (32, 32), color=(220, 220, 220))
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_health_contract():
    response = client.get("/api/damage/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "model_loaded" in payload
    assert "model_name" in payload


def test_infer_contract_without_weights_returns_valid_result():
    response = client.post("/api/damage/infer", json={"image": _sample_image_b64()})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "conditions" in payload["result"]
    assert payload["result"]["severity"] in {"mild", "moderate", "severe"}
    assert "latency_ms" in payload


def test_infer_invalid_image_returns_error_contract():
    response = client.post("/api/damage/infer", json={"image": "not-base64"})
    assert response.status_code == 200
    assert "error" in response.json()


def test_diagnose_tool_contract():
    response = client.post(
        "/api/damage/tools/diagnose",
        json={"params": {"conditions": ["scratch_front_bumper"], "severity": "moderate"}},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "diagnosis" in payload["data"]


def test_repair_tool_contract():
    response = client.post(
        "/api/damage/tools/repair",
        json={"params": {"diagnosis": "前保险杠中度划痕，建议局部喷漆修复"}},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_repair_tool_accepts_orchestrator_params():
    response = client.post(
        "/api/damage/tools/repair",
        json={"params": {"conditions": ["scratch_front_bumper"], "severity": "moderate"}},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_insurance_tool_contract():
    response = client.post(
        "/api/damage/tools/insurance",
        json={"params": {"conditions": ["scratch_front_bumper"], "repair_cost": "800-1200元"}},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

