# Agent C Tool Definitions

供 Orchestrator 注册 Function Calling 工具使用。

```json
[
  {
    "type": "function",
    "function": {
      "name": "diagnose_damage",
      "description": "根据车辆损伤类型和严重程度进行诊断分析，给出受损部件和安全影响评估",
      "parameters": {
        "type": "object",
        "properties": {
          "conditions": {
            "type": "array",
            "items": { "type": "string" },
            "description": "损伤类型列表，如 ['scratch_front_bumper', 'dent_left_door']"
          },
          "severity": {
            "type": "string",
            "enum": ["mild", "moderate", "severe"],
            "description": "损伤严重程度"
          }
        },
        "required": ["conditions", "severity"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "estimate_repair",
      "description": "根据损伤诊断结果生成维修方案和预估费用",
      "parameters": {
        "type": "object",
        "properties": {
          "diagnosis": {
            "type": "string",
            "description": "diagnose_damage 返回的诊断文字"
          }
        },
        "required": ["diagnosis"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "recommend_insurance",
      "description": "根据损伤情况和维修费用，判断是否建议走保险理赔",
      "parameters": {
        "type": "object",
        "properties": {
          "conditions": {
            "type": "array",
            "items": { "type": "string" },
            "description": "损伤类型列表"
          },
          "repair_cost": {
            "type": "string",
            "description": "预估维修费用范围，如'800-1200元'"
          }
        },
        "required": ["conditions", "repair_cost"]
      }
    }
  }
]
```

