// 工具注册表 — 汇总三个 Agent 的所有工具
// DeepSeek Function Calling 使用的 JSON Schema

const AGENT_URLS = {
  vehicle: process.env.AGENT_A_URL || 'http://localhost:8001',
  plate:    process.env.AGENT_B_URL || 'http://localhost:8002',
  damage:   process.env.AGENT_C_URL || 'http://localhost:8003',
};

// 推理工具（三个模型的核心能力）
const INFER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'recognize_vehicle',
      description: '识别车辆图片中的车型品牌和具体型号',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: 'base64编码的车辆图片' }
        },
        required: ['image']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detect_plate',
      description: '检测并识别车辆图片中的车牌号码',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: 'base64编码的车辆图片' }
        },
        required: ['image']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assess_condition',
      description: '检测车辆外观损伤情况（划痕、凹陷、碎裂等）',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: 'base64编码的车辆图片' }
        },
        required: ['image']
      }
    }
  }
];

// 信息查询工具（Agent A 的工具）
const VEHICLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_vehicle_params',
      description: '根据车型品牌、型号和年份查询车辆详细参数（排量、马力、配置等）',
      parameters: {
        type: 'object',
        properties: {
          brand: { type: 'string', description: '车辆品牌，如"奔驰"' },
          model: { type: 'string', description: '具体型号，如"E300L"' },
          year:  { type: 'string', description: '年份，如"2023"' }
        },
        required: ['brand', 'model', 'year']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estimate_market_price',
      description: '根据车型和车况估算二手车市场价格',
      parameters: {
        type: 'object',
        properties: {
          brand:     { type: 'string', description: '车辆品牌' },
          model:     { type: 'string', description: '具体型号' },
          year:      { type: 'string', description: '年份' },
          condition: { type: 'string', description: '车况：good/fair/poor' }
        },
        required: ['brand', 'model', 'year']
      }
    }
  }
];

// 车牌相关工具（Agent B 的工具）
const PLATE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_plate_info',
      description: '根据车牌号查询归属地和车辆类型',
      parameters: {
        type: 'object',
        properties: {
          plate: { type: 'string', description: '车牌号码，如"京A12345"' }
        },
        required: ['plate']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_violation',
      description: '查询车辆违章记录',
      parameters: {
        type: 'object',
        properties: {
          plate: { type: 'string', description: '车牌号码' }
        },
        required: ['plate']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_vehicle_history',
      description: '查询车辆年检状态和维保记录',
      parameters: {
        type: 'object',
        properties: {
          plate: { type: 'string', description: '车牌号码' }
        },
        required: ['plate']
      }
    }
  }
];

// 车况工具（Agent C 的工具）
const DAMAGE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'diagnose_damage',
      description: '根据损伤类型和严重程度给出诊断分析',
      parameters: {
        type: 'object',
        properties: {
          conditions: {
            type: 'array',
            items: { type: 'string' },
            description: '损伤类型列表，如["scratch_front_bumper"]'
          },
          severity: { type: 'string', description: '严重程度：mild/moderate/severe' }
        },
        required: ['conditions', 'severity']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estimate_repair',
      description: '根据诊断结果估算维修方案和费用',
      parameters: {
        type: 'object',
        properties: {
          conditions: { type: 'array', items: { type: 'string' }, description: '损伤类型列表' },
          severity:   { type: 'string', description: '严重程度' }
        },
        required: ['conditions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_insurance',
      description: '判断是否建议走保险理赔',
      parameters: {
        type: 'object',
        properties: {
          repair_cost: { type: 'string', description: '预估维修费用' },
          conditions:  { type: 'array', items: { type: 'string' } }
        },
        required: ['repair_cost']
      }
    }
  }
];

// 全部工具（注册给 DeepSeek）
const ALL_TOOLS = [...INFER_TOOLS, ...VEHICLE_TOOLS, ...PLATE_TOOLS, ...DAMAGE_TOOLS];

// 工具 -> API 路由映射
const TOOL_ROUTES = {
  // 推理
  recognize_vehicle:  { url: '/api/vehicle/infer',           method: 'POST', agent: 'vehicle' },
  detect_plate:       { url: '/api/plate/infer',             method: 'POST', agent: 'plate' },
  assess_condition:   { url: '/api/damage/infer',            method: 'POST', agent: 'damage' },
  // Agent A 工具
  query_vehicle_params:  { url: '/api/vehicle/tools/params', method: 'POST', agent: 'vehicle' },
  estimate_market_price: { url: '/api/vehicle/tools/price',  method: 'POST', agent: 'vehicle' },
  // Agent B 工具
  query_plate_info:      { url: '/api/plate/tools/plate_info', method: 'POST', agent: 'plate' },
  check_violation:       { url: '/api/plate/tools/violation',  method: 'POST', agent: 'plate' },
  query_vehicle_history: { url: '/api/plate/tools/history',    method: 'POST', agent: 'plate' },
  // Agent C 工具
  diagnose_damage:       { url: '/api/damage/tools/diagnose',  method: 'POST', agent: 'damage' },
  estimate_repair:       { url: '/api/damage/tools/repair',    method: 'POST', agent: 'damage' },
  recommend_insurance:   { url: '/api/damage/tools/insurance', method: 'POST', agent: 'damage' },
};

module.exports = { AGENT_URLS, INFER_TOOLS, ALL_TOOLS, TOOL_ROUTES };
