# 前端依赖的后端接口契约

> 此文件是 orchestrator 接口的参考副本，源为 `orchestrator/server.js` 和 `CONTRACT.md`

---

## POST /api/analyze

### 请求
```json
{
  "image": "base64编码的图片字符串（不含 data:image/xxx;base64, 前缀）",
  "query": "帮我查查这辆车"
}
```

### 响应 (SSE 流)

```
data: {"type":"step","content":"正在分析车辆信息..."}

data: {"type":"step","tool":"recognize_vehicle","result":true}
data: {"type":"step","tool":"detect_plate","result":true}
data: {"type":"step","tool":"assess_condition","result":true}
data: {"type":"step","tool":"query_vehicle_params","result":true}
...

data: {"type":"report","content":"## 车辆档案\n\n**车型**：奔驰 E300L 2023款\n..."}

data: {"type":"done"}
```

### SSE 事件类型

| type | 含义 | 前端行为 |
|------|------|---------|
| `step` (content) | 通用进度消息 | 显示在进度区 |
| `step` (tool) | 工具调用完成 | 更新步骤列表 |
| `report` | 最终档案 Markdown | 渲染到 report-card |
| `error` | 错误 | alert 提示，回退到上传页 |
| `done` | 流结束 | 刷新历史列表 |

---

## GET /api/archive

### 响应
```json
{
  "status": "ok",
  "data": [
    {
      "id": 1,
      "created_at": "2026-06-23 14:30:00",
      "preview": "车型：奔驰 E300L 2023..."
    }
  ]
}
```

---

## GET /api/archive/:id

### 响应
```json
{
  "status": "ok",
  "data": {
    "id": 1,
    "created_at": "2026-06-23 14:30:00",
    "full_report": "## 车辆档案\n\n..."
  }
}
```

---

## 错误格式

```json
{ "error": { "code": "ERROR_CODE", "message": "描述" } }
```

前端对任何非 2xx 响应展示 `message` 字段内容。
