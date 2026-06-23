# Agent A — 车型识别 + 车辆信息工具
# 端口 8001

import os
import sys
import time
import base64
import io
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image

app = FastAPI(title="Agent A - Vehicle Recognition")

# ============================================================
# 模型加载
# ============================================================

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
CLASSES_FILE = MODEL_DIR / "classes.txt"
MODEL_FILE = MODEL_DIR / "best.pt"

model = None
transform = None
CLASSES = []

if MODEL_FILE.exists() and CLASSES_FILE.exists():
    import torch
    from torchvision import transforms as T

    with open(CLASSES_FILE, "r", encoding="utf-8") as f:
        CLASSES = [line.strip() for line in f if line.strip()]

    checkpoint = torch.load(MODEL_FILE, map_location="cpu", weights_only=False)
    from train import build_model
    model = build_model(num_classes=len(CLASSES), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    transform = T.Compose([
        T.Resize((300, 300)),
        T.ToTensor(),
        T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    print(f"Model loaded: {len(CLASSES)} classes, val_acc={checkpoint.get('val_acc', 'N/A')}")


def parse_class_name(class_name: str) -> dict:
    """将 'Audi TTS Coupe 2012' 拆解为 brand, model, year
    格式: Brand ModelDescription Year (年份总是最后4位数字)
    """
    parts = class_name.strip().split()
    if len(parts) >= 3 and parts[-1].isdigit():
        brand = parts[0]
        year = parts[-1]
        model = " ".join(parts[1:-1])
        return {"brand": brand, "model": model, "year": year}
    return {"brand": class_name, "model": "", "year": ""}


# ============================================================
# 车型参数数据库（主流中国市场车型）
# ============================================================

VEHICLE_DB = {
    # 奔驰
    "奔驰 E300L 2023": {
        "brand": "奔驰", "model": "E300L", "year": "2023",
        "displacement": "2.0T", "horsepower": 258, "fuel_type": "汽油",
        "transmission": "9速手自一体", "drivetrain": "后驱",
        "config": ["全景天窗", "64色氛围灯", "自适应巡航", "柏林之声音响", "MBUX智能系统"],
        "fuel_consumption": "7.3L/100km",
    },
    "奔驰 C260L 2023": {
        "brand": "奔驰", "model": "C260L", "year": "2023",
        "displacement": "1.5T+48V", "horsepower": 204, "fuel_type": "汽油+轻混",
        "transmission": "9速手自一体", "drivetrain": "后驱",
        "config": ["全景天窗", "氛围灯", "MBUX系统", "倒车影像"],
        "fuel_consumption": "6.3L/100km",
    },
    "奔驰 GLC300 2023": {
        "brand": "奔驰", "model": "GLC300", "year": "2023",
        "displacement": "2.0T", "horsepower": 258, "fuel_type": "汽油",
        "transmission": "9速手自一体", "drivetrain": "四驱",
        "config": ["全景天窗", "空气悬架", "越野模式", "柏林之声音响"],
        "fuel_consumption": "7.8L/100km",
    },
    "奔驰 S400L 2023": {
        "brand": "奔驰", "model": "S400L", "year": "2023",
        "displacement": "2.5T", "horsepower": 367, "fuel_type": "汽油",
        "transmission": "9速手自一体", "drivetrain": "后驱",
        "config": ["后排娱乐屏", "航空座椅", "魔毯悬架", "后排冰箱"],
        "fuel_consumption": "8.5L/100km",
    },

    # 宝马
    "宝马 530Li 2023": {
        "brand": "宝马", "model": "530Li", "year": "2023",
        "displacement": "2.0T", "horsepower": 252, "fuel_type": "汽油",
        "transmission": "8速手自一体", "drivetrain": "后驱",
        "config": ["全景天窗", "哈曼卡顿音响", "HUD抬头显示", "无线CarPlay"],
        "fuel_consumption": "6.7L/100km",
    },
    "宝马 325Li 2023": {
        "brand": "宝马", "model": "325Li", "year": "2023",
        "displacement": "2.0T", "horsepower": 184, "fuel_type": "汽油",
        "transmission": "8速手自一体", "drivetrain": "后驱",
        "config": ["全景天窗", "iDrive系统", "三区空调"],
        "fuel_consumption": "6.2L/100km",
    },
    "宝马 X5 xDrive40i 2023": {
        "brand": "宝马", "model": "X5", "year": "2023",
        "displacement": "3.0T", "horsepower": 381, "fuel_type": "汽油",
        "transmission": "8速手自一体", "drivetrain": "四驱",
        "config": ["全景天窗", "空气悬架", "激光大灯", "水晶档把"],
        "fuel_consumption": "9.2L/100km",
    },

    # 奥迪
    "奥迪 A6L 45TFSI 2023": {
        "brand": "奥迪", "model": "A6L", "year": "2023",
        "displacement": "2.0T", "horsepower": 245, "fuel_type": "汽油",
        "transmission": "7速双离合", "drivetrain": "前驱",
        "config": ["全景天窗", "虚拟座舱", "矩阵大灯", "四区空调"],
        "fuel_consumption": "7.1L/100km",
    },
    "奥迪 A4L 40TFSI 2023": {
        "brand": "奥迪", "model": "A4L", "year": "2023",
        "displacement": "2.0T", "horsepower": 190, "fuel_type": "汽油",
        "transmission": "7速双离合", "drivetrain": "前驱",
        "config": ["全景天窗", "虚拟座舱", "自动泊车"],
        "fuel_consumption": "6.6L/100km",
    },
    "奥迪 Q5L 45TFSI 2023": {
        "brand": "奥迪", "model": "Q5L", "year": "2023",
        "displacement": "2.0T", "horsepower": 252, "fuel_type": "汽油",
        "transmission": "7速双离合", "drivetrain": "四驱",
        "config": ["全景天窗", "Bang & Olufsen音响", "360全景影像"],
        "fuel_consumption": "7.6L/100km",
    },

    # 大众
    "大众 迈腾 380TSI 2023": {
        "brand": "大众", "model": "迈腾", "year": "2023",
        "displacement": "2.0T", "horsepower": 220, "fuel_type": "汽油",
        "transmission": "7速双离合", "drivetrain": "前驱",
        "config": ["全景天窗", "丹拿音响", "自适应巡航", "电动尾门"],
        "fuel_consumption": "6.8L/100km",
    },
    "大众 帕萨特 330TSI 2023": {
        "brand": "大众", "model": "帕萨特", "year": "2023",
        "displacement": "2.0T", "horsepower": 186, "fuel_type": "汽油",
        "transmission": "7速双离合", "drivetrain": "前驱",
        "config": ["全景天窗", "后排遮阳帘", "三区空调"],
        "fuel_consumption": "6.5L/100km",
    },
    "大众 途观L 380TSI 2023": {
        "brand": "大众", "model": "途观L", "year": "2023",
        "displacement": "2.0T", "horsepower": 220, "fuel_type": "汽油",
        "transmission": "7速双离合", "drivetrain": "四驱",
        "config": ["全景天窗", "360全景影像", "自动泊车"],
        "fuel_consumption": "7.4L/100km",
    },

    # 丰田
    "丰田 凯美瑞 双擎 2023": {
        "brand": "丰田", "model": "凯美瑞", "year": "2023",
        "displacement": "2.5L混动", "horsepower": 218, "fuel_type": "油电混动",
        "transmission": "E-CVT", "drivetrain": "前驱",
        "config": ["全景天窗", "JBL音响", "TSS智行安全", "HUD抬头显示"],
        "fuel_consumption": "4.1L/100km",
    },
    "丰田 卡罗拉 双擎 2023": {
        "brand": "丰田", "model": "卡罗拉", "year": "2023",
        "displacement": "1.8L混动", "horsepower": 122, "fuel_type": "油电混动",
        "transmission": "E-CVT", "drivetrain": "前驱",
        "config": ["TSS智行安全", "倒车影像", "自动空调"],
        "fuel_consumption": "4.0L/100km",
    },
    "丰田 汉兰达 双擎 2023": {
        "brand": "丰田", "model": "汉兰达", "year": "2023",
        "displacement": "2.5L混动", "horsepower": 246, "fuel_type": "油电混动",
        "transmission": "E-CVT", "drivetrain": "四驱",
        "config": ["全景天窗", "JBL音响", "7座布局", "TSS智行安全"],
        "fuel_consumption": "5.8L/100km",
    },

    # 本田
    "本田 雅阁 260TURBO 2023": {
        "brand": "本田", "model": "雅阁", "year": "2023",
        "displacement": "1.5T", "horsepower": 194, "fuel_type": "汽油",
        "transmission": "CVT", "drivetrain": "前驱",
        "config": ["全景天窗", "Honda SENSING", "无线充电", "HUD"],
        "fuel_consumption": "6.6L/100km",
    },
    "本田 CR-V 240TURBO 2023": {
        "brand": "本田", "model": "CR-V", "year": "2023",
        "displacement": "1.5T", "horsepower": 193, "fuel_type": "汽油",
        "transmission": "CVT", "drivetrain": "前驱",
        "config": ["全景天窗", "Honda SENSING", "电动尾门"],
        "fuel_consumption": "7.1L/100km",
    },

    # 日产
    "日产 轩逸 e-POWER 2023": {
        "brand": "日产", "model": "轩逸", "year": "2023",
        "displacement": "1.2L增程式", "horsepower": 136, "fuel_type": "电驱",
        "transmission": "单速", "drivetrain": "前驱",
        "config": ["ProPILOT辅助驾驶", "Nissan Connect", "自动空调"],
        "fuel_consumption": "3.9L/100km",
    },

    # 比亚迪
    "比亚迪 汉 DM-i 2023": {
        "brand": "比亚迪", "model": "汉", "year": "2023",
        "displacement": "1.5T插混", "horsepower": 360, "fuel_type": "插电混动",
        "transmission": "E-CVT", "drivetrain": "前驱",
        "config": ["旋转大屏", "丹拿音响", "DiPilot智驾", "刀片电池"],
        "fuel_consumption": "1.7L/100km + 18.3kWh/100km",
    },
    "比亚迪 海豹 EV 2023": {
        "brand": "比亚迪", "model": "海豹", "year": "2023",
        "displacement": "纯电", "horsepower": 313, "fuel_type": "纯电动",
        "transmission": "单速", "drivetrain": "后驱",
        "config": ["全景天幕", "CTB电池车身一体化", "iTAC智能扭矩控制"],
        "range": "700km (CLTC)",
    },
    "比亚迪 宋PLUS DM-i 2023": {
        "brand": "比亚迪", "model": "宋PLUS", "year": "2023",
        "displacement": "1.5L插混", "horsepower": 197, "fuel_type": "插电混动",
        "transmission": "E-CVT", "drivetrain": "前驱",
        "config": ["旋转大屏", "DiPilot智驾", "刀片电池", "VTOL外放电"],
        "fuel_consumption": "5.3L/100km",
    },

    # 特斯拉
    "特斯拉 Model 3 2023": {
        "brand": "特斯拉", "model": "Model 3", "year": "2023",
        "displacement": "纯电", "horsepower": 283, "fuel_type": "纯电动",
        "transmission": "单速", "drivetrain": "后驱",
        "config": ["Autopilot", "15寸中控屏", "全景玻璃车顶", "哨兵模式"],
        "range": "556km (CLTC)",
    },
    "特斯拉 Model Y 2023": {
        "brand": "特斯拉", "model": "Model Y", "year": "2023",
        "displacement": "纯电", "horsepower": 299, "fuel_type": "纯电动",
        "transmission": "单速", "drivetrain": "后驱",
        "config": ["Autopilot", "HEPA空气过滤", "电动尾门", "哨兵模式"],
        "range": "545km (CLTC)",
    },

    # 蔚来
    "蔚来 ET5 2023": {
        "brand": "蔚来", "model": "ET5", "year": "2023",
        "displacement": "纯电", "horsepower": 490, "fuel_type": "纯电动",
        "transmission": "单速", "drivetrain": "四驱",
        "config": ["NIO Pilot", "NOMI智能助手", "换电", "电吸门"],
        "range": "560km (CLTC)",
    },

    # 理想
    "理想 L7 2023": {
        "brand": "理想", "model": "L7", "year": "2023",
        "displacement": "1.5T增程式", "horsepower": 449, "fuel_type": "增程式",
        "transmission": "单速", "drivetrain": "四驱",
        "config": ["后排娱乐屏", "空气悬架", "冰箱", "NOA导航辅助"],
        "fuel_consumption": "6.9L/100km + 21.9kWh/100km",
    },

    # 保时捷
    "保时捷 Cayenne 2023": {
        "brand": "保时捷", "model": "Cayenne", "year": "2023",
        "displacement": "3.0T", "horsepower": 354, "fuel_type": "汽油",
        "transmission": "8速Tiptronic", "drivetrain": "四驱",
        "config": ["空气悬架", "Sport Chrono组件", "Bose音响", "矩阵大灯"],
        "fuel_consumption": "10.3L/100km",
    },
}

# 品牌规范化映射（处理中文/英文品牌名）
BRAND_ALIASES = {
    "mercedes": "奔驰", "benz": "奔驰", "mercedes-benz": "奔驰",
    "bmw": "宝马",
    "audi": "奥迪",
    "volkswagen": "大众", "vw": "大众",
    "toyota": "丰田",
    "honda": "本田",
    "nissan": "日产",
    "byd": "比亚迪",
    "tesla": "特斯拉",
    "nio": "蔚来",
    "li": "理想", "lixiang": "理想",
    "porsche": "保时捷",
}

# ============================================================
# 估价数据（按品牌+车型+年份+车况分层）
# ============================================================

PRICE_BASELINE = {
    # brand -> { model -> { year -> base_price_wan } }
    "奔驰": {
        "E300L": {"2023": 42, "2022": 38, "2021": 34, "2020": 30},
        "C260L": {"2023": 32, "2022": 28, "2021": 25, "2020": 22},
        "GLC300": {"2023": 40, "2022": 36, "2021": 32, "2020": 28},
        "S400L": {"2023": 90, "2022": 82, "2021": 72, "2020": 62},
    },
    "宝马": {
        "530Li": {"2023": 40, "2022": 36, "2021": 32, "2020": 28},
        "325Li": {"2023": 30, "2022": 27, "2021": 24, "2020": 21},
        "X5": {"2023": 65, "2022": 60, "2021": 53, "2020": 46},
    },
    "奥迪": {
        "A6L": {"2023": 38, "2022": 34, "2021": 30, "2020": 26},
        "A4L": {"2023": 28, "2022": 25, "2021": 22, "2020": 19},
        "Q5L": {"2023": 35, "2022": 32, "2021": 28, "2020": 24},
    },
    "大众": {
        "迈腾": {"2023": 20, "2022": 18, "2021": 16, "2020": 14},
        "帕萨特": {"2023": 19, "2022": 17, "2021": 15, "2020": 13},
        "途观L": {"2023": 22, "2022": 20, "2021": 17, "2020": 15},
    },
    "丰田": {
        "凯美瑞": {"2023": 19, "2022": 17, "2021": 15, "2020": 13},
        "卡罗拉": {"2023": 12, "2022": 11, "2021": 9, "2020": 8},
        "汉兰达": {"2023": 28, "2022": 25, "2021": 22, "2020": 19},
    },
    "本田": {
        "雅阁": {"2023": 18, "2022": 16, "2021": 14, "2020": 12},
        "CR-V": {"2023": 19, "2022": 17, "2021": 15, "2020": 13},
    },
    "日产": {
        "轩逸": {"2023": 11, "2022": 10, "2021": 8, "2020": 7},
    },
    "比亚迪": {
        "汉": {"2023": 22, "2022": 19, "2021": 16},
        "海豹": {"2023": 20, "2022": 18},
        "宋PLUS": {"2023": 16, "2022": 14, "2021": 12},
    },
    "特斯拉": {
        "Model 3": {"2023": 19, "2022": 17, "2021": 15, "2020": 13},
        "Model Y": {"2023": 24, "2022": 22, "2021": 19},
    },
    "蔚来": {"ET5": {"2023": 25, "2022": 22}},
    "理想": {"L7": {"2023": 32, "2022": 29}},
    "保时捷": {"Cayenne": {"2023": 90, "2022": 80, "2021": 68, "2020": 55}},
}

CONDITION_MULTIPLIER = {
    "excellent": (0.95, 1.05, "优秀"),
    "good": (0.85, 0.95, "稳定"),
    "fair": (0.70, 0.85, "略降"),
    "poor": (0.50, 0.70, "下降"),
}

# ============================================================
# 模型定义（严格遵循 CONTRACT.md）
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
# 健康检查
# ============================================================

@app.get("/api/vehicle/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_name": "efficientnet-b3-cars",
    }


# ============================================================
# 车型识别推理
# ============================================================

@app.post("/api/vehicle/infer", response_model=InferResponse)
def infer(req: InferRequest):
    t0 = time.time()

    if model is not None and transform is not None:
        img_bytes = base64.b64decode(req.image)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        tensor = transform(img).unsqueeze(0)
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1)
            confidence, idx = probs.max(1)
            class_name = CLASSES[idx.item()]
        result = parse_class_name(class_name)
        result["confidence"] = round(confidence.item(), 4)
    else:
        result = {
            "brand": "奔驰",
            "model": "E300L",
            "year": "2023",
            "confidence": 0.94,
        }

    return InferResponse(
        status="ok",
        result=result,
        latency_ms=(time.time() - t0) * 1000,
    )


# ============================================================
# 车辆参数查询工具
# ============================================================

@app.post("/api/vehicle/tools/params", response_model=ToolResponse)
def tool_params(req: ToolRequest):
    brand = req.params.get("brand", "").strip()
    model = req.params.get("model", "").strip()
    year = req.params.get("year", "").strip()

    # 品牌名规范化
    brand_lower = brand.lower()
    if brand_lower in BRAND_ALIASES:
        brand = BRAND_ALIASES[brand_lower]

    key = f"{brand} {model} {year}"
    data = VEHICLE_DB.get(key)

    if not data:
        for k, v in VEHICLE_DB.items():
            if brand in k and model in k:
                data = v
                break

    if not data:
        raise HTTPException(404, detail=f"未找到该车型参数: {key}")

    return ToolResponse(status="ok", data=data)


# ============================================================
# 二手车估价工具
# ============================================================

@app.post("/api/vehicle/tools/price", response_model=ToolResponse)
def tool_price(req: ToolRequest):
    brand = req.params.get("brand", "").strip()
    model = req.params.get("model", "").strip()
    year = req.params.get("year", "").strip()
    condition = req.params.get("condition", "good").strip().lower()

    brand_lower = brand.lower()
    if brand_lower in BRAND_ALIASES:
        brand = BRAND_ALIASES[brand_lower]

    # 查基线价格
    brand_db = PRICE_BASELINE.get(brand, {})
    model_db = brand_db.get(model, {})
    base_price = model_db.get(year)

    if base_price is None:
        # 模糊查找
        for m, years in brand_db.items():
            if model in m or m in model:
                base_price = years.get(year)
                if base_price:
                    break
        if base_price is None:
            return ToolResponse(status="ok", data={
                "estimated_range": "价格数据收集中",
                "market_trend": "暂无",
                "factors": ["该车型暂无估价数据"],
                "confidence": 0.3,
            })

    # 车况系数
    cond_info = CONDITION_MULTIPLIER.get(condition, CONDITION_MULTIPLIER["good"])
    low = round(base_price * cond_info[0], 1)
    high = round(base_price * cond_info[1], 1)

    factors = []
    if condition == "excellent":
        factors = ["车况极佳", "里程少", "全程4S店保养"]
    elif condition == "good":
        factors = ["车况良好", "正常使用痕迹"]
    elif condition == "fair":
        factors = ["有轻微事故", "里程较高", "部分非4S店保养"]
    elif condition == "poor":
        factors = ["有较大事故维修", "里程高", "内饰磨损严重"]

    # 年份影响
    year_int = int(year) if year.isdigit() else 2023
    age = 2026 - year_int
    if age > 5:
        factors.append(f"车龄{age}年，进一步折旧")
        low = round(low * 0.9, 1)
        high = round(high * 0.9, 1)

    return ToolResponse(status="ok", data={
        "estimated_range": f"{low}-{high}万",
        "market_trend": cond_info[2],
        "factors": factors,
        "confidence": 0.75 if base_price else 0.3,
    })


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
