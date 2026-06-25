// Orchestrator — LLM 调度中心
// 端口 8000
// 职责：接收用户请求 → 调用 DeepSeek Function Calling → 调度三个 Agent → 生成档案

const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const { AGENT_URLS, ALL_TOOLS, TOOL_ROUTES } = require('./tools-registry');

const DB_PATH = 'archive.db';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('../frontend'));

// ── 数据库初始化 ──────────────────────────────────────────
let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      image_path TEXT,
      vehicle_info TEXT,
      plate_info TEXT,
      condition_info TEXT,
      full_report TEXT
    )
  `);
  saveDB();
}

function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDB();
}


// ── DeepSeek API 配置 ─────────────────────────────────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

const SYSTEM_PROMPT = `你是一个专业的智能车辆助手。你可以进行日常对话，也能使用工具对车辆图片进行分析。

## 对话能力
- 友好回答用户的日常问题（如问候、车辆知识咨询等）
- 可以对比不同车型的优劣、参数、价格
- 回答关于汽车的任何问题

## 车辆分析能力（当用户上传图片时）
当用户上传了车辆图片，你需要：
1. 调用工具获取识别结果
2. 根据识别结果调用查询工具获取详细信息
3. 整合生成完整的 Markdown 车辆档案报告

## 报告格式
用 Markdown，包含车型/车牌/车况/维修建议/估价。
如果置信度偏低要提醒用户。
语言简洁专业，不使用emoji。`;

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
      signal: AbortSignal.timeout(15000)
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

// ── DeepSeek 对话循环 ─────────────────────────────────────
async function chatWithTools(messages, res) {
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

// ── 第一阶段：预调用推理工具（图片→文本） ─────────────────
async function runInferencePhase(image, res) {
  const inferTools = ['recognize_vehicle', 'detect_plate', 'assess_condition'];
  const results = {};

  await Promise.all(inferTools.map(async (toolName) => {
    const result = await executeTool(toolName, { image });
    results[toolName] = result;
    res.write(`data: ${JSON.stringify({ type: 'step', tool: toolName, result: !!result.status })}\n\n`);
  }));

  return results;
}

// ── 第二阶段：DeepSeek 对话 → 查工具 → 生成报告 ──────────
async function chatWithLLM(inferenceResults, res) {
  const context = `以下是车辆图片的AI识别结果：

1. 车型识别：${JSON.stringify(inferenceResults.recognize_vehicle)}
2. 车牌识别：${JSON.stringify(inferenceResults.detect_plate)}
3. 车况检测：${JSON.stringify(inferenceResults.assess_condition)}

请基于以上信息，调用相关查询工具获取更多细节，最后生成一份完整的车辆档案报告。`;

  const messages = [{ role: 'user', content: context }];
  const history = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

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

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
          // 推理工具已经调用过了，跳过（避免重复推理返回不同结果）
          if (['recognize_vehicle', 'detect_plate', 'assess_condition'].includes(tc.function.name)) {
            return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(inferenceResults[tc.function.name]) };
          }
          const result = await executeTool(tc.function.name, args);
          res.write(`data: ${JSON.stringify({ type: 'step', tool: tc.function.name, result: !!result.status })}\n\n`);
          return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
        })
      );
      history.push(...toolResults);
      continue;
    }

    return msg.content;
  }

  return '已达到最大推理轮次，请稍后重试。';
}

// ── 纯文本对话 ──────────────────────────────────────────
async function chatTextOnly(query, res) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── 主入口 ────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { image, query } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    let report;

    if (image && image.length > 100) {
      // 有图片：先推理再生成报告
      res.write(`data: ${JSON.stringify({ type: 'step', content: '正在识别车辆信息...' })}\n\n`);
      const inferenceResults = await runInferencePhase(image, res);
      report = await chatWithLLM(inferenceResults, res);
    } else {
      // 纯文本：直接对话
      res.write(`data: ${JSON.stringify({ type: 'step', content: '思考中...' })}\n\n`);
      report = await chatTextOnly(query || '你好', res);
    }

    if (report) {
      dbRun('INSERT INTO archives (image_path, full_report) VALUES (?, ?)', ['', report]);
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
  const rows = dbAll('SELECT id, created_at, substr(full_report, 1, 200) as preview FROM archives ORDER BY id DESC');
  res.json({ status: 'ok', data: rows });
});

app.get('/api/archive/:id', (req, res) => {
  const row = dbGet('SELECT * FROM archives WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: '档案不存在' } });
  res.json({ status: 'ok', data: row });
});

app.delete('/api/archive/:id', (req, res) => {
  dbRun('DELETE FROM archives WHERE id = ?', [req.params.id]);
  res.json({ status: 'ok' });
});

// ── /api/chat (兼容前端新接口) ───────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, useAI, user } = req.body;
  // 从 messages 中提取最后一条用户消息的文本和图片
  const lastMsg = (messages || []).slice().reverse().find(m => m.role === 'user');
  let query = '';
  let image = '';

  if (lastMsg) {
    if (typeof lastMsg.content === 'string') {
      query = lastMsg.content;
    } else if (Array.isArray(lastMsg.content)) {
      for (const part of lastMsg.content) {
        if (part.type === 'text') query = part.text;
        if (part.type === 'image_url' && part.image_url?.url) {
          const url = part.image_url.url;
          image = url.includes('base64,') ? url.split('base64,')[1] : url;
        }
      }
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    let report;
    if (image && image.length > 100) {
      res.write(`data: ${JSON.stringify({ type: 'step', content: '正在识别车辆信息...' })}\n\n`);
      const inferenceResults = await runInferencePhase(image, res);
      if (useAI !== false) {
        report = await chatWithLLM(inferenceResults, res);
      } else {
        report = JSON.stringify(inferenceResults, null, 2);
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: 'step', content: '思考中...' })}\n\n`);
      report = await chatTextOnly(query || '你好', res);
    }

    if (report) {
      dbRun('INSERT INTO archives (image_path, full_report) VALUES (?, ?)', ['', report]);
    }

    res.write(`data: ${JSON.stringify({ type: 'message', content: report })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } finally {
    res.end();
  }
});

// ── Auth 代理 (转发到 8004) ──────────────────────────────
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:8004';
app.post('/api/auth/:action', async (req, res) => {
  try {
    const url = `${AUTH_URL}/api/auth/${req.params.action}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ status: 500, msg: `认证服务不可用: ${e.message}` });
  }
});
app.post('/api/auth/:action1/:action2', async (req, res) => {
  try {
    const url = `${AUTH_URL}/api/auth/${req.params.action1}/${req.params.action2}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ status: 500, msg: `认证服务不可用: ${e.message}` });
  }
});

// ── 启动 ──────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚗 Orchestrator 启动: http://localhost:${PORT}`);
  });
});
