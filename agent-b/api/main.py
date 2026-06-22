# Agent B — 车牌检测识别 + 车主关联工具
# 端口 8002

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import time

app = FastAPI(title="Agent B - Plate Recognition")

# ============================================================
# 模型加载（占位，训练完成后替换）
# ============================================================
# from ultralytics import YOLO
# from paddleocr import PaddleOCR
# detect_model = YOLO("model/plate_detect.pt")
# ocr = PaddleOCR(use_angle_cls=True, lang="ch")

# ============================================================
# 模拟数据（后续替换为实际数据库或 API）
# ============================================================

PLATE_INFO_DB = {
    "京A12345": {"location": "北京市", "plate_type": "蓝牌", "vehicle_type": "小型汽车", "is_new_energy": False},
    "沪B67890": {"location": "上海市", "plate_type": "蓝牌", "vehicle_type": "小型汽车", "is_new_energy": False},
    "粤BDF5678": {"location": "深圳市", "plate_type": "绿牌", "vehicle_type": "小型汽车", "is_new_energy": True},
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
# 车牌编码规则解析
# ============================================================

def parse_plate(plate: str) -> dict:
    """根据车牌号解析归属地"""
    province_map = {"京": "北京", "沪": "上海", "粤": "广东", "苏": "江苏", "浙": "浙江"}

    info = {"plate": plate, "location": "未知", "plate_type": "蓝牌", "vehicle_type": "小型汽车", "is_new_energy": False}

    if len(plate) >= 1 and plate[0] in province_map:
        info["location"] = province_map[plate[0]]

    if len(plate) >= 7 and len(plate) <= 8:
        info["is_new_energy"] = len(plate) == 8
        info["plate_type"] = "绿牌" if info["is_new_energy"] else "蓝牌"

    return info

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
    return {"status": "ok", "model_loaded": False, "model_name": "yolov8-paddleocr-plate"}

@app.post("/api/plate/infer", response_model=InferResponse)
def infer(req: InferRequest):
    t0 = time.time()

    # TODO: 实际推理
    # img_bytes = base64.b64decode(req.image)
    # img = Image.open(io.BytesIO(img_bytes))
    # results = detect_model(img)
    # crop plate region -> OCR

    result = {
        "plate": "京A12345",
        "plate_type": "蓝牌",
        "location": "北京",
        "confidence": 0.97
    }

    return InferResponse(
        status="ok",
        result=result,
        latency_ms=(time.time() - t0) * 1000
    )

@app.post("/api/plate/tools/plate_info", response_model=ToolResponse)
def tool_plate_info(req: ToolRequest):
    plate = req.params.get("plate", "")
    data = PLATE_INFO_DB.get(plate) or parse_plate(plate)
    return ToolResponse(status="ok", data=data)

@app.post("/api/plate/tools/violation", response_model=ToolResponse)
def tool_violation(req: ToolRequest):
    plate = req.params.get("plate", "")
    records = VIOLATION_DB.get(plate, [])
    return ToolResponse(status="ok", data={"total_count": len(records), "records": records})

@app.post("/api/plate/tools/history", response_model=ToolResponse)
def tool_history(req: ToolRequest):
    plate = req.params.get("plate", "")
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
