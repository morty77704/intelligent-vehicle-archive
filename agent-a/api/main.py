# Agent A — 车型识别 + 车辆信息工具
# 端口 8001

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import time
import base64
import io
from PIL import Image

app = FastAPI(title="Agent A - Vehicle Recognition")

# ============================================================
# 模型加载（占位，训练完成后替换）
# ============================================================
# import torch
# from torchvision import transforms
# model = torch.load("model/best.pt", map_location="cpu")
# model.eval()

CLASSES = ["奔驰 E300L", "宝马 530Li", "奥迪 A6L", "大众 迈腾"]  # 示例，训练后替换

# ============================================================
# 车型参数数据（示例，后续补充完整数据库）
# ============================================================
VEHICLE_DB = {
    "奔驰 E300L 2023": {
        "brand": "奔驰", "model": "E300L", "year": "2023",
        "displacement": "2.0T", "horsepower": 258, "fuel_type": "汽油",
        "transmission": "9速手自一体",
        "config": ["全景天窗", "氛围灯", "自适应巡航", "柏林之声音响"]
    },
    "宝马 530Li 2023": {
        "brand": "宝马", "model": "530Li", "year": "2023",
        "displacement": "2.0T", "horsepower": 252, "fuel_type": "汽油",
        "transmission": "8速手自一体",
        "config": ["全景天窗", "哈曼卡顿音响", "HUD抬头显示"]
    }
}

PRICE_DATA = {
    ("奔驰", "E300L", "2023", "good"): {"range": "38-42万", "trend": "稳定", "factors": ["保值率高", "市场需求大"]},
    ("宝马", "530Li", "2023", "good"): {"range": "35-40万", "trend": "略降", "factors": ["新款上市影响"]},
}

# ============================================================
# 模型定义
# ============================================================

class InferRequest(BaseModel):
    image: str  # base64

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

@app.get("/api/vehicle/health")
def health():
    return {
        "status": "ok",
        "model_loaded": False,  # 训练完成后改 True
        "model_name": "efficientnet-b3-cars"
    }

@app.post("/api/vehicle/infer", response_model=InferResponse)
def infer(req: InferRequest):
    t0 = time.time()

    # TODO: 替换为实际模型推理
    # img_bytes = base64.b64decode(req.image)
    # img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    # tensor = transform(img).unsqueeze(0)
    # with torch.no_grad():
    #     logits = model(tensor)
    #     idx = logits.argmax().item()
    #     result = CLASSES[idx]

    # 占位返回
    result = {
        "brand": "奔驰",
        "model": "E300L",
        "year": "2023",
        "confidence": 0.94
    }

    return InferResponse(
        status="ok",
        result=result,
        latency_ms=(time.time() - t0) * 1000
    )

@app.post("/api/vehicle/tools/params", response_model=ToolResponse)
def tool_params(req: ToolRequest):
    key = f"{req.params.get('brand')} {req.params.get('model')} {req.params.get('year')}"
    data = VEHICLE_DB.get(key)

    if not data:
        # 模糊匹配
        for k, v in VEHICLE_DB.items():
            if req.params.get("brand") in k and req.params.get("model") in k:
                data = v
                break

    if not data:
        raise HTTPException(404, detail="未找到该车型参数")

    return ToolResponse(status="ok", data=data)

@app.post("/api/vehicle/tools/price", response_model=ToolResponse)
def tool_price(req: ToolRequest):
    brand = req.params.get("brand", "")
    model = req.params.get("model", "")
    year = req.params.get("year", "")
    condition = req.params.get("condition", "good")

    key = (brand, model, year, condition)
    data = PRICE_DATA.get(key)

    if not data:
        data = {
            "estimated_range": "价格数据收集中",
            "market_trend": "暂无",
            "factors": ["数据不足"],
            "confidence": 0.3
        }

    return ToolResponse(status="ok", data=data)

# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
