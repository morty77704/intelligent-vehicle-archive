# Agent B Tool Schema

Agent B 负责车牌检测识别与车牌关联信息查询。以下工具定义供 Orchestrator / DeepSeek Function Calling 注册使用。

## detect_plate

```json
{
  "type": "function",
  "function": {
    "name": "detect_plate",
    "description": "检测并识别车辆图片中的车牌号码",
    "parameters": {
      "type": "object",
      "properties": {
        "image": {
          "type": "string",
          "description": "base64 编码的车辆图片"
        }
      },
      "required": ["image"]
    }
  }
}
```

对应接口：`POST /api/plate/infer`

## query_plate_info

```json
{
  "type": "function",
  "function": {
    "name": "query_plate_info",
    "description": "根据车牌号码查询归属地、车牌类型和车辆类型",
    "parameters": {
      "type": "object",
      "properties": {
        "plate": {
          "type": "string",
          "description": "车牌号码，例如 京A12345、沪AD12345、京A12345D；允许输入中包含空格、点号、短横线等常见分隔符"
        }
      },
      "required": ["plate"]
    }
  }
}
```

对应接口：`POST /api/plate/tools/plate_info`

## check_violation

```json
{
  "type": "function",
  "function": {
    "name": "check_violation",
    "description": "查询车辆违章记录，当前使用模拟数据",
    "parameters": {
      "type": "object",
      "properties": {
        "plate": {
          "type": "string",
          "description": "车牌号码，例如 京A12345、沪AD12345、京A12345D"
        }
      },
      "required": ["plate"]
    }
  }
}
```

对应接口：`POST /api/plate/tools/violation`

## query_vehicle_history

```json
{
  "type": "function",
  "function": {
    "name": "query_vehicle_history",
    "description": "查询车辆年检、保险到期和维保记录概要，当前使用模拟数据",
    "parameters": {
      "type": "object",
      "properties": {
        "plate": {
          "type": "string",
          "description": "车牌号码，例如 京A12345、沪AD12345、京A12345D"
        }
      },
      "required": ["plate"]
    }
  }
}
```

对应接口：`POST /api/plate/tools/history`
