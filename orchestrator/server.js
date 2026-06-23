// Orchestrator — LLM 调度中心
// 端口 8000
// 职责：接收用户请求 → 调用 DeepSeek Function Calling → 调度三个 Agent → 生成档案

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { AGENT_URLS, ALL_TOOLS, TOOL_ROUTES } = require('./tools-registry');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('../frontend'));

// ── 档案存储初始化 ────────────────────────────────────────
const ARCHIVE_FILE = path.join(__dirname, 'archive.json');

function readArchiveStore() {
  if (!fs.existsSync(ARCHIVE_FILE)) return { nextId: 1, archives: [] };

  try {
    const store = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
    return {
      nextId: Number(store.nextId) || 1,
      archives: Array.isArray(store.archives) ? store.archives : [],
    };
  } catch (e) {
    console.warn(`档案存储读取失败，将使用空存储: ${e.message}`);
    return { nextId: 1, archives: [] };
  }
}

function writeArchiveStore(store) {
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function saveArchive(report) {
  const store = readArchiveStore();
  const row = {
    id: store.nextId++,
    created_at: new Date().toLocaleString('zh-CN', { hour12: false }),
    image_path: '',
    vehicle_info: '',
    plate_info: '',
    condition_info: '',
    full_report: report,
  };
  store.archives.push(row);
  writeArchiveStore(store);
  return row;
}

function listArchives() {
  return readArchiveStore().archives
    .slice()
    .sort((a, b) => b.id - a.id)
    .map((row) => ({
      id: row.id,
      created_at: row.created_at,
      preview: (row.full_report || '').slice(0, 200),
    }));
}

function getArchive(id) {
  return readArchiveStore().archives.find((row) => row.id === Number(id));
}

function deleteArchive(id) {
  const store = readArchiveStore();
  const before = store.archives.length;
  store.archives = store.archives.filter((row) => row.id !== Number(id));
  if (store.archives.length !== before) writeArchiveStore(store);
}

// ── DeepSeek API 配置 ─────────────────────────────────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 15000);

const SYSTEM_PROMPT = `你是智能车辆档案系统助手。你可以使用工具来识别车辆信息。

工作流程：
1. 用户上传车辆图片后，同时调用 recognize_vehicle、detect_plate、assess_condition 获取基本信息
2. 根据识别结果，调用相应的查询工具获取详细信息
3. 最后整合所有信息，生成一份完整的车辆档案报告

报告格式要求：
- 用 Markdown 格式
- 包含：车型信息、车牌信息、车况评估、维修建议
- 语言简洁专业
- 如果某个识别结果置信度偏低，要提醒用户`;

// ── 工具执行器 ────────────────────────────────────────────
async function executeTool(name, args) {
  const route = TOOL_ROUTES[name];
  if (!route) return { error: `未知工具: ${name}` };

  const baseUrl = AGENT_URLS[route.agent];
  const url = `${baseUrl}${route.url}`;

  try {
    const body = route.url.includes('/infer')
      ? { image: args.image }
      : { params: args };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.detail || `Agent 返回错误: ${res.status}` };
    }

    return await res.json();
  } catch (e) {
    return { error: `调用 ${name} 失败: ${e.message}` };
  }
}

function emitToolStep(res, tool, result) {
  res.write(`data: ${JSON.stringify({ type: 'step', tool, result: !!result.status })}\n\n`);
}

function getResult(toolResult) {
  return toolResult && toolResult.status === 'ok' ? toolResult.result : null;
}

function getData(toolResult) {
  return toolResult && toolResult.status === 'ok' ? toolResult.data : null;
}

function confidenceText(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '未知';
}

function buildLocalReport(results) {
  const vehicle = getResult(results.vehicleInfer);
  const plate = getResult(results.plateInfer);
  const damage = getResult(results.damageInfer);
  const vehicleParams = getData(results.vehicleParams);
  const vehiclePrice = getData(results.vehiclePrice);
  const plateInfo = getData(results.plateInfo);
  const violation = getData(results.violation);
  const history = getData(results.history);
  const diagnosis = getData(results.diagnosis);
  const repair = getData(results.repair);
  const insurance = getData(results.insurance);
  const priceRange = vehiclePrice?.estimated_range || vehiclePrice?.range || '暂无估价';
  const marketTrend = vehiclePrice?.market_trend || vehiclePrice?.trend || '暂无趋势';
  const warnings = [];

  for (const [label, item] of [
    ['车型识别', vehicle],
    ['车牌识别', plate],
    ['车况检测', damage],
  ]) {
    if (!item) warnings.push(`[DEGRADED] ${label}服务暂不可用，报告已按可用信息降级生成。`);
    if (item?.confidence && item.confidence < 0.8) warnings.push(`${label}置信度偏低，建议人工复核。`);
  }

  const lines = [
    '## 车辆档案',
    '',
    '### 车型信息',
    `- 识别结果：${vehicle?.brand || '未知'} ${vehicle?.model || ''} ${vehicle?.year || ''}`.trim(),
    `- 置信度：${confidenceText(vehicle?.confidence)}`,
    `- 动力参数：${vehicleParams?.displacement || '未知'} / ${vehicleParams?.horsepower || '未知'} 马力 / ${vehicleParams?.fuel_type || '未知'}`,
    `- 变速箱：${vehicleParams?.transmission || '未知'}`,
    `- 主要配置：${vehicleParams?.config?.join('、') || '暂无'}`,
    `- 二手车估价：${priceRange}（趋势：${marketTrend}）`,
    '',
    '### 车牌信息',
    `- 车牌号：${plate?.plate || plateInfo?.plate || '未知'}`,
    `- 类型/归属：${plateInfo?.plate_type || plate?.plate_type || '未知'} / ${plateInfo?.location || plate?.location || '未知'}`,
    `- 车辆类型：${plateInfo?.vehicle_type || '未知'}`,
    `- 新能源：${plateInfo?.is_new_energy ? '是' : '否'}`,
    `- 违章记录：${violation ? `${violation.total_count} 条` : '暂无数据'}`,
    `- 年检/保险：下次年检 ${history?.next_inspection || '暂无记录'}，保险到期 ${history?.insurance_expiry || '暂无记录'}`,
    '',
    '### 车况评估',
    `- 检测结果：${damage?.conditions?.join('、') || '未知'}`,
    `- 严重程度：${damage?.severity || '未知'}`,
    `- 诊断：${diagnosis?.diagnosis || '暂无诊断'}`,
    `- 安全影响：${diagnosis?.safety_impact || '暂无评估'}`,
    '',
    '### 维修与保险建议',
    `- 维修方案：${repair?.repair_plan || '暂无方案'}`,
    `- 预估费用：${repair?.estimated_cost || '待评估'}`,
    `- 预估时间：${repair?.estimated_time || '待评估'}`,
    `- 保险建议：${insurance?.recommendation || '暂无建议'}`,
    `- 理由：${insurance?.reason || '暂无'}`,
  ];

  if (violation?.records?.length) {
    lines.push('', '### 违章明细');
    for (const record of violation.records) {
      lines.push(`- ${record.date}：${record.type}，罚款 ${record.fine} 元，扣 ${record.points} 分`);
    }
  }

  if (warnings.length) {
    lines.push('', '### 风险提示', ...warnings.map((item) => `- ${item}`));
  }

  return lines.join('\n');
}

async function runLocalAnalysis(image, res) {
  const [vehicleInfer, plateInfer, damageInfer] = await Promise.all([
    executeTool('recognize_vehicle', { image }),
    executeTool('detect_plate', { image }),
    executeTool('assess_condition', { image }),
  ]);

  emitToolStep(res, 'recognize_vehicle', vehicleInfer);
  emitToolStep(res, 'detect_plate', plateInfer);
  emitToolStep(res, 'assess_condition', damageInfer);

  const vehicle = getResult(vehicleInfer) || {};
  const plate = getResult(plateInfer) || {};
  const damage = getResult(damageInfer) || {};

  const [vehicleParams, vehiclePrice, plateInfo, violation, history, diagnosis, repair] = await Promise.all([
    vehicle.brand ? executeTool('query_vehicle_params', vehicle) : Promise.resolve({ error: '缺少车型识别结果' }),
    vehicle.brand ? executeTool('estimate_market_price', { ...vehicle, condition: damage.severity === 'severe' ? 'poor' : 'good' }) : Promise.resolve({ error: '缺少车型识别结果' }),
    plate.plate ? executeTool('query_plate_info', { plate: plate.plate }) : Promise.resolve({ error: '缺少车牌识别结果' }),
    plate.plate ? executeTool('check_violation', { plate: plate.plate }) : Promise.resolve({ error: '缺少车牌识别结果' }),
    plate.plate ? executeTool('query_vehicle_history', { plate: plate.plate }) : Promise.resolve({ error: '缺少车牌识别结果' }),
    damage.conditions ? executeTool('diagnose_damage', damage) : Promise.resolve({ error: '缺少车况识别结果' }),
    damage.conditions ? executeTool('estimate_repair', damage) : Promise.resolve({ error: '缺少车况识别结果' }),
  ]);

  for (const [tool, result] of [
    ['query_vehicle_params', vehicleParams],
    ['estimate_market_price', vehiclePrice],
    ['query_plate_info', plateInfo],
    ['check_violation', violation],
    ['query_vehicle_history', history],
    ['diagnose_damage', diagnosis],
    ['estimate_repair', repair],
  ]) {
    emitToolStep(res, tool, result);
  }

  const repairData = getData(repair);
  const insurance = repairData
    ? await executeTool('recommend_insurance', {
      repair_cost: repairData.estimated_cost,
      conditions: damage.conditions || [],
    })
    : { error: '缺少维修估价结果' };

  emitToolStep(res, 'recommend_insurance', insurance);

  return buildLocalReport({
    vehicleInfer,
    plateInfer,
    damageInfer,
    vehicleParams,
    vehiclePrice,
    plateInfo,
    violation,
    history,
    diagnosis,
    repair,
    insurance,
  });
}

// ── DeepSeek 对话循环 ─────────────────────────────────────
async function chatWithTools(messages, res) {
  if (!DEEPSEEK_API_KEY) {
    const imageUrl = messages[0]?.content?.find?.((item) => item.type === 'image_url')?.image_url?.url || '';
    const image = imageUrl.includes(',') ? imageUrl.split(',')[1] : '';
    return runLocalAnalysis(image, res);
  }

  const history = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
  ];

  for (let turn = 0; turn < 10; turn++) {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: history,
        tools: ALL_TOOLS,
        tool_choice: turn === 0 ? 'auto' : 'auto',
        temperature: 0.7,
        max_tokens: 4096
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API 错误: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const msg = data.choices[0].message;

    history.push(msg);

    // 如果模型决定调用工具
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // 并行执行所有工具调用
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, args);

          // SSE 通知前端
          res.write(`data: ${JSON.stringify({ type: 'step', tool: tc.function.name, result: !!result.status })}\n\n`);

          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          };
        })
      );

      history.push(...toolResults);
      continue; // 把工具结果送回模型
    }

    // 模型给出最终回复
    return msg.content;
  }

  return '已达到最大推理轮次，请稍后重试。';
}

// ── 主入口 ────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { image, query } = req.body;
  if (!image) return res.status(400).json({ error: { code: 'NO_IMAGE', message: '请提供车辆图片' } });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    res.write(`data: ${JSON.stringify({ type: 'step', content: '正在分析车辆信息...' })}\n\n`);

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: query || '请帮我识别这辆车，生成完整的车辆档案' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
        ]
      }
    ];

    const report = await chatWithTools(messages, res);

    // 保存档案
    if (report) {
      saveArchive(report);
    }

    res.write(`data: ${JSON.stringify({ type: 'report', content: report })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } finally {
    res.end();
  }
});

// ── 档案查询 ──────────────────────────────────────────────
app.get('/api/archive', (req, res) => {
  res.json({ status: 'ok', data: listArchives() });
});

app.get('/api/archive/:id', (req, res) => {
  const row = getArchive(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: '档案不存在' } });
  res.json({ status: 'ok', data: row });
});

app.delete('/api/archive/:id', (req, res) => {
  deleteArchive(req.params.id);
  res.json({ status: 'ok' });
});

// ── 启动 ──────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚗 Orchestrator 启动: http://localhost:${PORT}`);
});
