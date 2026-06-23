from __future__ import annotations

import os
import time
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel, Field

from model.model import DEFAULT_MODEL_NAME, DamageModelService
from model.preprocess import decode_base64_image
from tools.diagnose import diagnose_damage
from tools.insurance import recommend_insurance
from tools.repair import estimate_repair


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WEIGHTS = ROOT / "model" / "weights" / "damage_efficientnet_b3.pt"

app = FastAPI(title="Agent C Damage Detection Service", version="1.0.0")
model_service = DamageModelService(
    weights_path=os.getenv("AGENT_C_WEIGHTS", str(DEFAULT_WEIGHTS)),
)


class InferRequest(BaseModel):
    image: str = Field(..., min_length=1)


class ToolRequest(BaseModel):
    params: dict = Field(default_factory=dict)


def error_response(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


@app.get("/api/damage/health")
def health() -> dict:
    meta = model_service.metadata()
    return {
        "status": "ok",
        "model_loaded": bool(meta["model_loaded"]),
        "model_name": meta.get("model_name") or DEFAULT_MODEL_NAME,
    }


@app.post("/api/damage/infer")
def infer(request: InferRequest) -> dict:
    started = time.perf_counter()
    try:
        image = decode_base64_image(request.image)
    except Exception:
        return error_response("INVALID_IMAGE", "图片 base64 解码失败或不是有效图片")

    prediction = model_service.predict(image)
    latency_ms = int((time.perf_counter() - started) * 1000)
    return {
        "status": "ok",
        "result": {
            "conditions": prediction.conditions,
            "severity": prediction.severity,
            "confidence": prediction.confidence,
        },
        "latency_ms": latency_ms,
    }


@app.post("/api/damage/tools/diagnose")
def diagnose(request: ToolRequest) -> dict:
    params = request.params
    conditions = params.get("conditions")
    severity = params.get("severity")
    if not isinstance(conditions, list) or not severity:
        return error_response("INVALID_PARAMS", "params.conditions 和 params.severity 为必填参数")
    return {"status": "ok", "data": diagnose_damage(conditions, severity)}


@app.post("/api/damage/tools/repair")
def repair(request: ToolRequest) -> dict:
    params = request.params
    diagnosis = params.get("diagnosis")
    if not diagnosis:
        conditions = params.get("conditions")
        severity = params.get("severity", "mild")
        if isinstance(conditions, list):
            diagnosis = diagnose_damage(conditions, severity).get("diagnosis")
    if not diagnosis:
        return error_response("INVALID_PARAMS", "params.diagnosis 为必填参数")
    return {"status": "ok", "data": estimate_repair(diagnosis)}


@app.post("/api/damage/tools/insurance")
def insurance(request: ToolRequest) -> dict:
    params = request.params
    conditions = params.get("conditions")
    repair_cost = params.get("repair_cost")
    if not isinstance(conditions, list) or not repair_cost:
        return error_response("INVALID_PARAMS", "params.conditions 和 params.repair_cost 为必填参数")
    return {"status": "ok", "data": recommend_insurance(conditions, repair_cost)}

