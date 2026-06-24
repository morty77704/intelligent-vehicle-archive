/* ============================================================
   智能车辆档案系统 — 前端逻辑
   GSAP 动画 + SSE + 页面切换
   ============================================================ */

// ── DOM 引用 ──────────────────────────────────────────────
const $analysisView   = document.getElementById('analysisView');
const $historyView    = document.getElementById('historyView');
const $uploadSection  = document.getElementById('uploadSection');
const $uploadArea     = document.getElementById('uploadArea');
const $fileInput      = document.getElementById('fileInput');
const $placeholder    = document.getElementById('placeholder');
const $preview        = document.getElementById('preview');
const $uploadActions  = document.getElementById('uploadActions');
const $btnRetake      = document.getElementById('btnRetake');
const $btnAnalyze     = document.getElementById('btnAnalyze');
const $btnNew         = document.getElementById('btnNew');
const $progressSection = document.getElementById('progressSection');
const $progressFill   = document.getElementById('progressFill');
const $progressSteps  = document.getElementById('progressSteps');
const $resultSection  = document.getElementById('resultSection');
const $reportContent  = document.getElementById('reportContent');
const $btnToHistory   = document.getElementById('btnToHistory');
const $btnBack        = document.getElementById('btnBack');
const $historyList    = document.getElementById('historyList');
const $historyDetail  = document.getElementById('historyDetail');
const $detailContent  = document.getElementById('detailContent');
const $btnBackList    = document.getElementById('btnBackList');

let currentImageBase64 = '';

// ── GSAP 动画工具 ─────────────────────────────────────────
const anim = {
  fadeIn(el, opts = {}) {
    gsap.fromTo(el, { opacity: 0, y: opts.y ?? 16 }, { opacity: 1, y: 0, duration: opts.dur ?? 0.4, ease: 'power2.out', delay: opts.delay ?? 0 });
  },
  fadeOut(el, dur = 0.2) {
    return gsap.to(el, { opacity: 0, duration: dur, ease: 'power2.in' });
  },
  swapViews(hideView, showView) {
    const tl = gsap.timeline();
    tl.to(hideView, { opacity: 0, duration: 0.18, ease: 'power2.in' })
      .set(hideView, { display: 'none' })
      .set(showView, { display: 'block', opacity: 0 })
      .to(showView, { opacity: 1, duration: 0.25, ease: 'power2.out' }, '-=0.05');
    return tl;
  }
};

// ── 页面入场动画 ─────────────────────────────────────────
function animateAnalysisEntrance() {
  gsap.from('.header', { y: -24, opacity: 0, duration: 0.45, ease: 'power2.out' });
  gsap.from('.upload-section', { y: 24, opacity: 0, duration: 0.45, delay: 0.08, ease: 'power2.out' });
}

// ── 图片上传 ──────────────────────────────────────────────
$uploadArea.addEventListener('click', () => $fileInput.click());

$fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) processFile(e.target.files[0]);
});

$uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  $uploadArea.classList.add('drag-over');
});
$uploadArea.addEventListener('dragleave', () => {
  $uploadArea.classList.remove('drag-over');
});
$uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  $uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
});

function processFile(file) {
  if (!file.type.startsWith('image/')) { alert('请上传图片文件'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageBase64 = e.target.result.split(',')[1];
    $preview.src = e.target.result;
    $preview.style.display = 'block';
    $placeholder.style.display = 'none';
    $uploadActions.style.display = 'flex';

    gsap.from($preview, { scale: 0.92, opacity: 0, duration: 0.3, ease: 'back.out(1.6)' });
    gsap.from($uploadActions.children, { y: 8, opacity: 0, duration: 0.25, stagger: 0.04 });
  };
  reader.readAsDataURL(file);
}

$btnRetake.addEventListener('click', () => {
  currentImageBase64 = '';
  $fileInput.value = '';
  $preview.style.display = 'none';
  $placeholder.style.display = '';
  $uploadActions.style.display = 'none';
});

// ── 进度步骤 ──────────────────────────────────────────────
const STEP_LABELS = {
  recognize_vehicle:  '识别车型',
  detect_plate:       '识别车牌',
  assess_condition:   '检测车况',
  query_vehicle_params: '查询参数',
  estimate_market_price: '估价',
  query_plate_info:   '车牌信息',
  report:             '生成档案',
};

function initSteps() {
  $progressSteps.innerHTML = [
    'recognize_vehicle', 'detect_plate', 'assess_condition',
    'query_vehicle_params', 'estimate_market_price', 'report'
  ].map(key => `<div class="step-item" id="step-${key}"><span class="step-dot"></span>${STEP_LABELS[key] || key}</div>`).join('');
  $progressFill.style.width = '0%';
}

function markStep(key) {
  const el = document.getElementById(`step-${key}`);
  if (!el) return;
  el.classList.add('done');
  gsap.from(el.querySelector('.step-dot'), { scale: 2, duration: 0.35, ease: 'back.out(2)' });
}

function setStepActive(key) {
  const el = document.getElementById(`step-${key}`);
  if (el) el.classList.add('active');
}

let completedCount = 0;
function updateProgress(toolName) {
  completedCount++;
  markStep(toolName);
  const ratio = Math.min(completedCount / 6, 1);
  gsap.to($progressFill, { width: `${ratio * 100}%`, duration: 0.4, ease: 'power2.out' });
}

// ── SSE 分析流程 ─────────────────────────────────────────
$btnAnalyze.addEventListener('click', startAnalysis);
$btnNew.addEventListener('click', resetToUpload);

function resetToUpload() {
  gsap.to($resultSection, { opacity: 0, duration: 0.2, onComplete: () => {
    $resultSection.style.display = 'none';
    $uploadSection.style.display = 'block';
    gsap.fromTo('.upload-section', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3 });
  }});
  $btnRetake.click();
}

async function startAnalysis() {
  if (!currentImageBase64) return;

  // 过渡动画
  const tl = gsap.timeline();
  tl.to([$uploadSection, $resultSection], { opacity: 0, duration: 0.18 })
    .set([$uploadSection, $resultSection], { display: 'none' })
    .set($progressSection, { display: 'block', opacity: 0 })
    .to($progressSection, { opacity: 1, duration: 0.25 });

  initSteps();
  completedCount = 0;

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
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          handleSSE(data);
        } catch (_) { /* 跳过不完整的 JSON */ }
      }
    }
  } catch (e) {
    alert('请求失败：' + e.message);
    resetToUpload();
  }
}

function handleSSE(data) {
  if (data.type === 'step' && data.tool) {
    updateProgress(data.tool);
    setStepActive(data.tool);
  }

  if (data.type === 'report') {
    completedCount = 6;
    gsap.to($progressFill, { width: '100%', duration: 0.3 });

    const tl = gsap.timeline();
    tl.to($progressSection, { opacity: 0, duration: 0.2 })
      .set($progressSection, { display: 'none' })
      .set($resultSection, { display: 'block', opacity: 0 })
      .to($resultSection, { opacity: 1, duration: 0.3 });

    $reportContent.innerHTML = marked.parse(data.content || '分析完成');
    gsap.from($reportContent, { y: 20, opacity: 0, duration: 0.45, delay: 0.1, ease: 'power3.out' });
    gsap.from($btnNew, { y: 8, opacity: 0, duration: 0.3, delay: 0.2 });

    loadHistory();
  }

  if (data.type === 'error') {
    alert('分析失败：' + data.message);
    resetToUpload();
  }
}

// ── 页面切换 ──────────────────────────────────────────────

$btnToHistory.addEventListener('click', () => {
  anim.swapViews($analysisView, $historyView);
  loadHistory();
  setTimeout(() => animHistoryItems(), 300);
});
$btnBack.addEventListener('click', () => {
  anim.swapViews($historyView, $analysisView);
  animateAnalysisEntrance();
});

// ── 历史档案 ──────────────────────────────────────────────

async function loadHistory() {
  try {
    const res = await fetch('/api/archive');
    const { data } = await res.json();
    if (!data || data.length === 0) {
      $historyList.innerHTML = '<p class="empty-hint">暂无档案记录</p>';
      return;
    }
    $historyList.innerHTML = data.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-time">${item.created_at}</div>
        <div class="history-preview">${escapeHtml(item.preview || '（无预览）')}</div>
        <button class="history-delete" data-id="${item.id}" title="删除">✕</button>
      </div>
    `).join('');

    // 绑定事件
    $historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('history-delete')) return;
        showDetail(el.dataset.id);
      });
    });
    $historyList.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('确定删除此档案？')) return;
        await fetch(`/api/archive/${btn.dataset.id}`, { method: 'DELETE' });
        loadHistory();
      });
    });
  } catch (_) { /* 网络不可达时静默 */ }
}

async function showDetail(id) {
  const res = await fetch(`/api/archive/${id}`);
  const { data } = await res.json();
  $detailContent.innerHTML = marked.parse(data.full_report || '无内容');
  $historyList.style.display = 'none';
  $historyDetail.style.display = 'block';
  gsap.from($detailContent, { y: 16, opacity: 0, duration: 0.35 });
}

$btnBackList.addEventListener('click', () => {
  gsap.to($historyDetail, { opacity: 0, duration: 0.15, onComplete: () => {
    $historyDetail.style.display = 'none';
    $historyList.style.display = 'block';
    gsap.fromTo($historyList, { opacity: 0 }, { opacity: 1, duration: 0.2 });
  }});
});

function animHistoryItems() {
  const items = $historyList.querySelectorAll('.history-item');
  if (items.length) {
    gsap.from(items, { y: 20, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── 初始化 ────────────────────────────────────────────────
animateAnalysisEntrance();
loadHistory();
