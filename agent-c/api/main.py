# Agent C — 车况检测 + 维修方案工具
# 端口 8003

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import time

app = FastAPI(title="Agent C - Damage Detection")

# ============================================================
# 模型加载（占位，训练完成后替换）
# ============================================================
# import torch
# model = torch.load("model/damage_model.pt", map_location="cpu")
# model.eval()

DAMAGE_TYPES = ["scratch_front_bumper", "dent_left_door", "glass_crack", "paint_peel", "broken_light", "normal"]

# ============================================================
# 诊断/维修知识库
# ============================================================

DIAGNOSIS_KB = {
    ("scratch_front_bumper", "mild"): "前保险杠轻度划痕，未触及底漆，抛光即可",
    ("scratch_front_bumper", "moderate"): "前保险杠中度划痕，已触及底漆，需喷漆修复",
    ("scratch_front_bumper", "severe"): "前保险杠严重划伤，需更换保险杠",
    ("dent_left_door", "mild"): "左车门轻微凹陷，可无损修复",
    ("dent_left_door", "moderate"): "左车门中度凹陷，需钣金修复",
    ("dent_left_door", "severe"): "左车门严重凹陷，建议更换车门",
    ("glass_crack", "mild"): "玻璃轻微裂纹，可修复",
    ("glass_crack", "moderate"): "玻璃中度裂纹，建议更换",
    ("glass_crack", "severe"): "玻璃严重碎裂，必须更换",
    ("paint_peel", "mild"): "局部漆面轻微脱落，点漆即可",
    ("paint_peel", "moderate"): "漆面大面积脱落，需整面喷漆",
    ("broken_light", "severe"): "车灯破损，需更换总成",
}

REPAIR_KB = {
    ("scratch_front_bumper", "mild"): ("抛光处理", "50-200元", "30分钟"),
    ("scratch_front_bumper", "moderate"): ("前保险杠局部喷漆", "800-1200元", "1-2天"),
    ("scratch_front_bumper", "severe"): ("更换前保险杠", "3000-5000元", "2-3天"),
    ("dent_left_door", "mild"): ("无损凹陷修复", "300-500元", "2小时"),
    ("dent_left_door", "moderate"): ("左车门钣金+喷漆", "1500-2500元", "2-3天"),
    ("dent_left_door", "severe"): ("更换左车门", "4000-6000元", "3-5天"),
    ("glass_crack", "mild"): ("玻璃裂纹修复", "200-400元", "1小时"),
    ("glass_crack", "moderate"): ("更换玻璃", "1500-3000元", "1天"),
    ("glass_crack", "severe"): ("更换玻璃+检查框架", "3000-5000元", "1-2天"),
    ("paint_peel", "mild"): ("局部点漆", "100-300元", "1小时"),
    ("paint_peel", "moderate"): ("整面喷漆", "1000-2000元", "1-2天"),
    ("broken_light", "severe"): ("更换车灯总成", "2000-4000元", "1-2天"),
}

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

@app.get("/api/damage/health")
def health():
    return {"status": "ok", "model_loaded": False, "model_name": "efficientnet-damage"}

@app.post("/api/damage/infer", response_model=InferResponse)
def infer(req: InferRequest):
    t0 = time.time()

    # TODO: 实际推理
    result = {
        "conditions": ["scratch_front_bumper"],
        "severity": "mild",
        "confidence": 0.89
    }

    return InferResponse(
        status="ok",
        result=result,
        latency_ms=(time.time() - t0) * 1000
    )

@app.post("/api/damage/tools/diagnose", response_model=ToolResponse)
def tool_diagnose(req: ToolRequest):
    conditions = req.params.get("conditions", [])
    severity = req.params.get("severity", "mild")

    diagnoses = []
    for cond in conditions:
        key = (cond, severity)
        diag = DIAGNOSIS_KB.get(key, f"{cond}（{severity}），需进一步检查")
        diagnoses.append(diag)

    return ToolResponse(status="ok", data={
        "diagnosis": "；".join(diagnoses),
        "affected_parts": conditions,
        "safety_impact": "无安全隐患" if severity == "mild" else "可能影响行车安全，建议尽快维修"
    })

@app.post("/api/damage/tools/repair", response_model=ToolResponse)
def tool_repair(req: ToolRequest):
    conditions = req.params.get("conditions", [])
    severity = req.params.get("severity", "mild")

    plans = []
    total_cost_low = 0
    total_cost_high = 0
    max_time = ""

    for cond in conditions:
        key = (cond, severity)
        plan, cost, time_est = REPAIR_KB.get(key, ("需进一步评估", "待评估", "待定"))
        plans.append(f"{plan}（{cost}，{time_est}）")

        if "元" in cost:
            parts = cost.replace("元", "").split("-")
            try:
                total_cost_low += int(parts[0])
                if len(parts) > 1:
                    total_cost_high += int(parts[1])
                else:
                    total_cost_high += int(parts[0])
            except ValueError:
                pass

    return ToolResponse(status="ok", data={
        "repair_plan": "\n".join(plans),
        "estimated_cost": f"{total_cost_low}-{total_cost_high}元" if total_cost_high > 0 else "待评估",
        "estimated_time": max_time or "1-2天",
        "shop_type": "综合维修厂"
    })

@app.post("/api/damage/tools/insurance", response_model=ToolResponse)
def tool_insurance(req: ToolRequest):
    # 提取维修费用上限
    repair_cost_str = req.params.get("repair_cost", "0")
    try:
        parts = repair_cost_str.replace("元", "").split("-")
        cost_high = int(parts[-1])
    except (ValueError, IndexError):
        cost_high = 0

    if cost_high < 1500:
        return ToolResponse(status="ok", data={
            "recommendation": "不建议走保险",
            "reason": "维修费用低于次年保费涨幅（约1500元），建议自费修复"
        })
    else:
        return ToolResponse(status="ok", data={
            "recommendation": "建议走保险理赔",
            "reason": f"维修费用约{repair_cost_str}，超过次年保费涨幅，走保险更划算"
        })

# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
