// ── DOM 元素 ──────────────────────────────────────────
const uploadSection   = document.getElementById('uploadSection');
const uploadArea      = document.getElementById('uploadArea');
const fileInput       = document.getElementById('fileInput');
const preview         = document.getElementById('preview');
const uploadActions   = document.getElementById('uploadActions');
const placeholder     = document.querySelector('.upload-placeholder');
const btnRetake       = document.getElementById('btnRetake');
const btnAnalyze      = document.getElementById('btnAnalyze');
const btnNew          = document.getElementById('btnNew');
const progressSection = document.getElementById('progressSection');
const progressFill    = document.getElementById('progressFill');
const progressSteps   = document.getElementById('progressSteps');
const resultSection   = document.getElementById('resultSection');
const reportContent   = document.getElementById('reportContent');
const historyList     = document.getElementById('historyList');

let currentImageBase64 = '';
let currentImageFile = null;

// ── 图片上传 ──────────────────────────────────────────
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', handleFileSelect);

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#4f46e5';
  uploadArea.style.background = '#f8f7ff';
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.style.borderColor = '#d0d5dd';
  uploadArea.style.background = '';
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#d0d5dd';
  uploadArea.style.background = '';
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('请上传图片文件');
    return;
  }

  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageBase64 = e.target.result.split(',')[1];
    preview.src = e.target.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    uploadActions.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

btnRetake.addEventListener('click', () => {
  currentImageBase64 = '';
  currentImageFile = null;
  fileInput.value = '';
  preview.style.display = 'none';
  placeholder.style.display = '';
  uploadActions.style.display = 'none';
});

// ── 分析流程 ──────────────────────────────────────────
btnAnalyze.addEventListener('click', startAnalysis);
btnNew.addEventListener('click', () => {
  resultSection.style.display = 'none';
  progressSection.style.display = 'none';
  uploadSection.style.display = 'block';
  btnRetake.click();
});

const STEPS = [
  { key: 'recognize_vehicle', label: '识别车型...' },
  { key: 'detect_plate',      label: '识别车牌...' },
  { key: 'assess_condition',  label: '检测车况...' },
  { key: 'query',             label: '查询车辆信息...' },
  { key: 'report',            label: '生成档案报告...' },
];

const STEP_BY_TOOL = {
  recognize_vehicle: 'recognize_vehicle',
  detect_plate: 'detect_plate',
  assess_condition: 'assess_condition',
  query_vehicle_params: 'query',
  estimate_market_price: 'query',
  query_plate_info: 'query',
  check_violation: 'query',
  query_vehicle_history: 'query',
  diagnose_damage: 'query',
  estimate_repair: 'query',
  recommend_insurance: 'query',
};

async function startAnalysis() {
  if (!currentImageBase64) return;

  // 切换 UI
  uploadSection.style.display = 'none';
  resultSection.style.display = 'none';
  progressSection.style.display = 'block';
  progressFill.style.width = '0%';

  // 初始化步骤
  progressSteps.innerHTML = STEPS.map(s =>
    `<div class="step" id="step-${s.key}"><span class="dot"></span>${s.label}</div>`
  ).join('');

  const completedStepKeys = new Set();

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentImageBase64, query: '帮我识别这辆车，生成完整的车辆档案' })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          handleSSE(data);
          if (data.type === 'step' && data.tool) {
            const stepKey = STEP_BY_TOOL[data.tool] || data.tool;
            completedStepKeys.add(stepKey);
            updateStep(stepKey);
            progressFill.style.width = `${Math.min(completedStepKeys.size / STEPS.length, 0.9) * 100}%`;
          }
          if (data.type === 'report') {
            completedStepKeys.add('report');
            updateStep('report');
            progressFill.style.width = '100%';
            reportContent.innerHTML = marked.parse(data.content || '分析完成');
            progressSection.style.display = 'none';
            resultSection.style.display = 'block';
            loadHistory();
          }
          if (data.type === 'error') {
            alert('分析失败：' + data.message);
            uploadSection.style.display = 'block';
            progressSection.style.display = 'none';
          }
        } catch (e) { /* 跳过解析失败的行 */ }
      }
    }
  } catch (e) {
    alert('请求失败：' + e.message);
    uploadSection.style.display = 'block';
    progressSection.style.display = 'none';
  }
}

function updateStep(activeKey) {
  let found = false;
  for (const s of STEPS) {
    const el = document.getElementById(`step-${s.key}`);
    if (!el) continue;
    if (s.key === activeKey) {
      el.className = 'step active';
      found = true;
    } else if (!found) {
      el.className = 'step done';
    }
  }
}

function handleSSE(data) {
  console.log('SSE:', data);
}

// ── 历史档案 ──────────────────────────────────────────
async function loadHistory() {
  try {
    const res = await fetch('/api/archive');
    const { data } = await res.json();
    if (!data || data.length === 0) {
      historyList.innerHTML = '<p class="empty-hint">暂无档案记录</p>';
      return;
    }
    historyList.innerHTML = data.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-time">${item.created_at}</div>
        <div class="history-preview">${item.preview || '（无预览）'}</div>
      </div>
    `).join('');

    // 点击查看详情
    document.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const res = await fetch(`/api/archive/${id}`);
        const { data } = await res.json();
        reportContent.innerHTML = marked.parse(data.full_report || '无内容');
        resultSection.style.display = 'block';
        uploadSection.style.display = 'none';
        progressSection.style.display = 'none';
      });
    });
  } catch (e) {
    console.error('加载历史失败:', e);
  }
}

// ── 初始化 ────────────────────────────────────────────
// 加载 marked.js（用于 Markdown 渲染）
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
script.onload = () => loadHistory();
document.head.appendChild(script);
