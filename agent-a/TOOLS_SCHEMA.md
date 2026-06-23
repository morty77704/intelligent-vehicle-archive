# Agent A — Tool Definitions for DeepSeek Function Calling

## 1. query_vehicle_params

```json
{
    "type": "function",
    "function": {
        "name": "query_vehicle_params",
        "description": "根据车型品牌、型号和年份查询车辆详细参数，包括排量、马力、变速箱、驱动方式、油耗、配置等",
        "parameters": {
            "type": "object",
            "properties": {
                "brand": {
                    "type": "string",
                    "description": "车辆品牌，如'奔驰'、'宝马'、'比亚迪'。支持中英文（Mercedes/Benz → 奔驰）"
                },
                "model": {
                    "type": "string",
                    "description": "具体型号，如'E300L'、'530Li'、'汉'"
                },
                "year": {
                    "type": "string",
                    "description": "年份，如'2023'"
                }
            },
            "required": ["brand", "model", "year"]
        }
    }
}
```

## 2. estimate_market_price

```json
{
    "type": "function",
    "function": {
        "name": "estimate_market_price",
        "description": "根据车型、年份和车况估算二手车市场价格区间，返回估价范围、市场趋势和影响因素",
        "parameters": {
            "type": "object",
            "properties": {
                "brand": {
                    "type": "string",
                    "description": "车辆品牌，如'奔驰'、'宝马'"
                },
                "model": {
                    "type": "string",
                    "description": "具体型号，如'E300L'、'530Li'"
                },
                "year": {
                    "type": "string",
                    "description": "年份，如'2023'"
                },
                "condition": {
                    "type": "string",
                    "enum": ["excellent", "good", "fair", "poor"],
                    "description": "车况等级：excellent=优秀(95%-105%基价), good=良好(85%-95%), fair=一般(70%-85%), poor=较差(50%-70%)"
                }
            },
            "required": ["brand", "model", "year", "condition"]
        }
    }
}
```
