# CONTRACT — 智能车辆档案系统

> 共享 API 合约。任何接口变更必须先更新此文件，再改代码。

---

## 统一约定

### 错误格式
```json
{ "error": { "code": "ERROR_CODE", "message": "人可读描述" } }
```

### 推理接口（三个模型统一）

```
POST /api/{module}/infer
Content-Type: application/json

Request:  { "image": "<base64 string>" }
Response: { "status": "ok", "result": { ... }, "latency_ms": 120 }
```

### 工具接口（统一）

```
POST /api/{module}/tools/{tool_name}
Content-Type: application/json

Request:  { "params": { ... } }
Response: { "status": "ok", "data": { ... } }
```

### 健康检查

```
GET /api/{module}/health

Response: { "status": "ok", "model_loaded": true, "model_name": "xxx" }
```

---

## Agent A — 车型识别 (member-a)

端口：`8001`

### POST /api/vehicle/infer

```json
// Request
{ "image": "<base64>" }

// Response
{
    "status": "ok",
    "result": {
        "brand": "奔驰",
        "model": "E300L",
        "year": "2023",
        "confidence": 0.94
    },
    "latency_ms": 120
}
```

### POST /api/vehicle/tools/params

```json
// Request
{ "params": { "brand": "奔驰", "model": "E300L", "year": "2023" } }

// Response
{
    "status": "ok",
    "data": {
        "brand": "奔驰",
        "model": "E300L",
        "year": "2023",
        "displacement": "2.0T",
        "horsepower": 258,
        "fuel_type": "汽油",
        "transmission": "9速手自一体",
        "config": ["全景天窗", "氛围灯", "自适应巡航"]
    }
}
```

### POST /api/vehicle/tools/price

```json
// Request
{ "params": { "brand": "奔驰", "model": "E300L", "year": "2023", "condition": "good" } }

// Response
{
    "status": "ok",
    "data": {
        "estimated_range": "38-42万",
        "market_trend": "稳定",
        "factors": ["里程少", "无事故", "4S店保养"],
        "confidence": 0.75
    }
}
```

---

## Agent B — 车牌识别 (member-b)

端口：`8002`

### POST /api/plate/infer

```json
// Request
{ "image": "<base64>" }

// Response
{
    "status": "ok",
    "result": {
        "plate": "京A12345",
        "plate_type": "蓝牌",
        "location": "北京",
        "confidence": 0.97
    },
    "latency_ms": 80
}
```

### POST /api/plate/tools/plate_info

```json
// Request
{ "params": { "plate": "京A12345" } }

// Response
{
    "status": "ok",
    "data": {
        "plate": "京A12345",
        "location": "北京市",
        "plate_type": "蓝牌",
        "vehicle_type": "小型汽车",
        "is_new_energy": false
    }
}
```

### POST /api/plate/tools/violation

```json
// Request
{ "params": { "plate": "京A12345" } }

// Response
{
    "status": "ok",
    "data": {
        "total_count": 2,
        "records": [
            { "date": "2024-03-15", "type": "违停", "fine": 200, "points": 0 },
            { "date": "2024-05-20", "type": "超速", "fine": 500, "points": 6 }
        ]
    }
}
```

### POST /api/plate/tools/history

```json
// Request
{ "params": { "plate": "京A12345" } }

// Response
{
    "status": "ok",
    "data": {
        "last_inspection": "2024-01-10",
        "next_inspection": "2025-01-10",
        "insurance_expiry": "2024-12-31",
        "maintenance_records": 5
    }
}
```

---

## Agent C — 车况检测 (member-c)

端口：`8003`

### POST /api/damage/infer

```json
// Request
{ "image": "<base64>" }

// Response
{
    "status": "ok",
    "result": {
        "conditions": ["scratch_front_bumper", "dent_left_door"],
        "severity": "moderate",
        "confidence": 0.89
    },
    "latency_ms": 150
}
```

条件标签枚举：`scratch_xxx`, `dent_xxx`, `glass_crack`, `paint_peel`, `broken_light`, `normal`

严重程度枚举：`mild`, `moderate`, `severe`

### POST /api/damage/tools/diagnose

```json
// Request
{ "params": { "conditions": ["scratch_front_bumper"], "severity": "moderate" } }

// Response
{
    "status": "ok",
    "data": {
        "diagnosis": "前保险杠中度划痕，已触及底漆，需喷漆修复",
        "affected_parts": ["前保险杠"],
        "safety_impact": "无安全隐患，仅影响外观"
    }
}
```

### POST /api/damage/tools/repair

```json
// Request
{ "params": { "diagnosis": "前保险杠中度划痕，已触及底漆，需喷漆修复" } }

// Response
{
    "status": "ok",
    "data": {
        "repair_plan": "前保险杠局部喷漆",
        "estimated_cost": "800-1200元",
        "estimated_time": "1-2天",
        "shop_type": "普通维修店"
    }
}
```

### POST /api/damage/tools/insurance

```json
// Request
{ "params": { "conditions": ["scratch_front_bumper"], "repair_cost": "800-1200元" } }

// Response
{
    "status": "ok",
    "data": {
        "recommendation": "不建议走保险",
        "reason": "维修费用低于次年保费涨幅（约1500元），建议自费修复"
    }
}
```

---

## Orchestrator — LLM 调度层

端口：`8000`

### POST /api/analyze

```json
// Request
{ "image": "<base64>", "query": "帮我查查这辆车" }

// Response (SSE 流式)
{ "type": "step", "content": "正在识别车型..." }
{ "type": "step", "content": "正在识别车牌..." }
{ "type": "step", "content": "正在检测车况..." }
{ "type": "report", "content": "## 车辆档案\n\n..." }
{ "type": "done" }
```

---

## 数据存档接口

### GET /api/archive
查询已保存的车辆档案列表

### GET /api/archive/:id
查询单条档案详情

### DELETE /api/archive/:id
删除一条档案
