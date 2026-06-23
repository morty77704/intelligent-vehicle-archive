# Agent B — 车牌检测识别 + 车主关联工具
# 端口 8002

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import time

try:
    from .recognizer import build_recognizer
    from .plate_rules import is_valid_plate, normalize_plate, parse_plate, short_location
except ImportError:  # pragma: no cover - allows `python api/main.py` style execution
    from recognizer import build_recognizer
    from plate_rules import is_valid_plate, normalize_plate, parse_plate, short_location

app = FastAPI(title="Agent B - Plate Recognition")

# ============================================================
# 模型加载（占位，训练完成后替换）
# ============================================================
plate_recognizer = build_recognizer()

# ============================================================
# 模拟数据（后续替换为实际数据库或 API）
# ============================================================

PLATE_INFO_DB = {
    "京A12345": {"location": "北京市", "plate_type": "蓝牌", "vehicle_type": "小型汽车", "is_new_energy": False},
    "沪B67890": {"location": "上海市", "plate_type": "蓝牌", "vehicle_type": "小型汽车", "is_new_energy": False},
    "粤BDF5678": {"location": "广东省", "plate_type": "绿牌", "vehicle_type": "小型汽车", "is_new_energy": True},
    "沪AD12345": {"location": "上海市", "plate_type": "绿牌", "vehicle_type": "小型汽车", "is_new_energy": True},
    "京A12345D": {"location": "北京市", "plate_type": "绿牌", "vehicle_type": "大型新能源汽车", "is_new_energy": True},
}

VIOLATION_DB = {
    "京A12345": [
        {"date": "2024-03-15", "type": "违停", "fine": 200, "points": 0},
        {"date": "2024-05-20", "type": "超速", "fine": 500, "points": 6},
    ]
}

HISTORY_DB = {
    "京A12345": {
        "last_inspection": "2024-01-10",
        "next_inspection": "2025-01-10",
        "insurance_expiry": "2024-12-31",
        "maintenance_records": 5
    }
}

# ============================================================
def require_plate(params: dict) -> str:
    plate = normalize_plate(params.get("plate", ""))
    if not is_valid_plate(plate):
        raise HTTPException(status_code=400, detail="车牌号格式不正确")
    return plate

# ============================================================
# 模型定义
# ============================================================

class InferRequest(BaseModel):
    image: str

class InferResponse(BaseModel):
    status: str
    result: dict
    latency_ms: float

class ToolRequest(BaseModel):
    params: dict

class ToolResponse(BaseModel):
    status: str
    data: dict

# ============================================================
# API 路由
# ============================================================

@app.get("/api/plate/health")
def health():
    return {
        "status": "ok",
        "model_loaded": plate_recognizer.model_loaded,
        "model_name": plate_recognizer.model_name,
    }

@app.post("/api/plate/infer", response_model=InferResponse)
def infer(req: InferRequest):
    t0 = time.time()

    if not req.image:
        raise HTTPException(status_code=400, detail="请提供 base64 图片")

    try:
        result = plate_recognizer.recognize(req.image).as_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return InferResponse(
        status="ok",
        result=result,
        latency_ms=(time.time() - t0) * 1000
    )

@app.post("/api/plate/tools/plate_info", response_model=ToolResponse)
def tool_plate_info(req: ToolRequest):
    plate = require_plate(req.params)
    data = PLATE_INFO_DB.get(plate) or parse_plate(plate)
    return ToolResponse(status="ok", data={"plate": plate, **data})

@app.post("/api/plate/tools/violation", response_model=ToolResponse)
def tool_violation(req: ToolRequest):
    plate = require_plate(req.params)
    records = VIOLATION_DB.get(plate, [])
    return ToolResponse(status="ok", data={"total_count": len(records), "records": records})

@app.post("/api/plate/tools/history", response_model=ToolResponse)
def tool_history(req: ToolRequest):
    plate = require_plate(req.params)
    data = HISTORY_DB.get(plate, {
        "last_inspection": "暂无记录",
        "next_inspection": "暂无记录",
        "insurance_expiry": "暂无记录",
        "maintenance_records": 0
    })
    return ToolResponse(status="ok", data=data)

# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
