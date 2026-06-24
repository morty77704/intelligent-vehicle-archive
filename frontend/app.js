/* ============================================================
   智能车辆档案系统 — GSAP + Three.js + SSE
   ============================================================ */

// ── DOM 引用 ──────────────────────────────────────────────
const $uploadSection   = document.getElementById('uploadSection');
const $uploadArea      = document.getElementById('uploadArea');
const $fileInput       = document.getElementById('fileInput');
const $placeholder     = document.getElementById('placeholder');
const $preview         = document.getElementById('preview');
const $uploadActions   = document.getElementById('uploadActions');
const $btnRetake       = document.getElementById('btnRetake');
const $btnAnalyze      = document.getElementById('btnAnalyze');
const $btnNew          = document.getElementById('btnNew');
const $progressSection = document.getElementById('progressSection');
const $progressFill    = document.getElementById('progressFill');
const $progressSteps   = document.getElementById('progressSteps');
const $resultLayout    = document.getElementById('resultLayout');
const $resultActions   = document.getElementById('resultActions');
const $reportContent   = document.getElementById('reportContent');
const $viewerPlaceholder = document.getElementById('viewerPlaceholder');
const $viewerContainer = document.getElementById('viewerContainer');
const $historyList     = document.getElementById('historyList');
const $historyCount    = document.getElementById('historyCount');
const $modalOverlay    = document.getElementById('modalOverlay');
const $modalContent    = document.getElementById('modalContent');
const $btnModalClose   = document.getElementById('btnModalClose');
const $btnModalDelete  = document.getElementById('btnModalDelete');
const $particleCanvas  = document.getElementById('particleCanvas');
const $scanLine        = document.getElementById('scanLine');

let currentImageBase64 = '';
let currentModalId = null;

// ── GSAP 工具 ─────────────────────────────────────────────
const anim = {
  fadeIn(el, opts = {}) {
    return gsap.fromTo(el, { opacity: 0, y: opts.y ?? 16 }, { opacity: 1, y: 0, duration: opts.dur ?? 0.4, ease: 'power2.out', delay: opts.delay ?? 0 });
  },
  fadeOut(el, dur = 0.2) {
    return gsap.to(el, { opacity: 0, duration: dur, ease: 'power2.in' });
  }
};

// ── 页面入场 ──────────────────────────────────────────────
function pageEntrance() {
  const tl = gsap.timeline();
  tl.from('.header', { y: -20, opacity: 0, duration: 0.45, ease: 'power3.out' })
    .from('.upload-section', { y: 24, opacity: 0, duration: 0.45, ease: 'power2.out' }, '-=0.2')
    .from('.history-section', { y: 20, opacity: 0, duration: 0.4, ease: 'power2.out' }, '-=0.15');
}

// ── 粒子系统 ──────────────────────────────────────────────
let particleCtx, particles = [], particleAnimId;

function initParticles() {
  const canvas = $particleCanvas;
  if (!canvas) return;
  canvas.width = $uploadArea.offsetWidth;
  canvas.height = $uploadArea.offsetHeight;
  particleCtx = canvas.getContext('2d');
  particles = [];
  for (let i = 0; i < 35; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + 0.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.4 + 0.1
    });
  }
  drawParticles();
}

function drawParticles() {
  if (!particleCtx) return;
  const ctx = particleCtx;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(129,140,248,${p.alpha})`;
    ctx.fill();
  });
  // 连线
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      if (dx * dx + dy * dy < 5000) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(129,140,248,0.06)`;
        ctx.stroke();
      }
    }
  }
  particleAnimId = requestAnimationFrame(drawParticles);
}

// ── 3D 查看器 ────────────────────────────────────────────
let scene, camera, renderer, carGroup, viewerActive = false;

function initViewer() {
  if (viewerActive) return;
  viewerActive = true;

  const container = $viewerContainer;
  const w = container.clientWidth, h = container.clientHeight;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 50);
  camera.position.set(4, 2.2, 5);
  camera.lookAt(0, 0.3, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // 光照
  const ambient = new THREE.AmbientLight(0x3b3b5c, 2.5);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(5, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x818cf8, 2);
  rim.position.set(-2, 1, -3);
  scene.add(rim);

  // 地面
  const groundGeo = new THREE.PlaneGeometry(12, 12);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 车辆组
  carGroup = new THREE.Group();
  buildCar(carGroup);
  scene.add(carGroup);

  // 网格线装饰
  const gridHelper = new THREE.PolarGridHelper(3, 32, 24, 64, 0x6366f1, 0x6366f1);
  gridHelper.position.y = -1.19;
  scene.add(gridHelper);

  $viewerPlaceholder.style.display = 'none';
  animateViewer();

  // 鼠标交互
  let isDragging = false, prevX = 0;
  renderer.domElement.addEventListener('mousedown', (e) => { isDragging = true; prevX = e.clientX; });
  renderer.domElement.addEventListener('touchstart', (e) => { isDragging = true; prevX = e.touches[0].clientX; });
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('touchend', () => isDragging = false);
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !carGroup) return;
    const dx = e.clientX - prevX;
    carGroup.rotation.y += dx * 0.01;
    prevX = e.clientX;
  });
  window.addEventListener('touchmove', (e) => {
    if (!isDragging || !carGroup) return;
    const dx = e.touches[0].clientX - prevX;
    carGroup.rotation.y += dx * 0.01;
    prevX = e.touches[0].clientX;
  });

  // 自动旋转
  carGroup.rotation.y = 0.3;
}

function buildCar(group) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc0c8e0, roughness: 0.25, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.1, metalness: 0.1, opacity: 0.5, transparent: true });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffeedd, roughness: 0.2, metalness: 0.1, emissive: 0x331100, emissiveIntensity: 0.3 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.2, metalness: 0.9 });

  // 车身底部
  const bodyBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 4.2), bodyMat);
  bodyBase.position.y = 0.35;
  bodyBase.castShadow = true;
  group.add(bodyBase);

  // 车身顶部（驾驶舱）
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.45, 1.8), glassMat);
  cabin.position.set(0, 0.7, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  // 前挡风
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.38, 0.05), glassMat);
  frontGlass.position.set(0, 0.78, 0.7);
  frontGlass.rotation.x = -0.4;
  group.add(frontGlass);

  // 后挡风
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.35, 0.05), glassMat);
  rearGlass.position.set(0, 0.76, -0.95);
  rearGlass.rotation.x = 0.4;
  group.add(rearGlass);

  // 引擎盖
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 0.9), bodyMat);
  hood.position.set(0, 0.6, 1.3);
  hood.castShadow = true;
  group.add(hood);

  // 后备箱
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 0.75), bodyMat);
  trunk.position.set(0, 0.6, -1.3);
  trunk.castShadow = true;
  group.add(trunk);

  // 前大灯
  const headlightL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lightMat);
  headlightL.position.set(0.65, 0.45, 1.85);
  group.add(headlightL);
  const headlightR = headlightL.clone();
  headlightR.position.x = -0.65;
  group.add(headlightR);

  // 尾灯
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.2, emissive: 0x330000, emissiveIntensity: 0.5 });
  const taillightL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.08), tailMat);
  taillightL.position.set(0.6, 0.5, -2.05);
  group.add(taillightL);
  const taillightR = taillightL.clone();
  taillightR.position.x = -0.6;
  group.add(taillightR);

  // 车轮
  for (let side of [-1, 1]) {
    for (let z of [1.2, -1.2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 24), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.95, 0.26, z);
      wheel.castShadow = true;
      group.add(wheel);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.23, 8), hubMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(side * 0.95, 0.26, z);
      group.add(hub);
    }
  }
}

function updateCarColor(hex) {
  if (!carGroup) return;
  carGroup.traverse(child => {
    if (child.isMesh && child.material.color && child.material.color.getHex() === 0xc0c8e0) {
      child.material.color.set(hex);
    }
  });
}

function animateViewer() {
  if (!viewerActive || !renderer) return;
  requestAnimationFrame(animateViewer);
  if (carGroup && !carGroup.userData?.dragging) {
    carGroup.rotation.y += 0.003;
  }
  renderer.render(scene, camera);
}

function resizeViewer() {
  if (!renderer || !$viewerContainer) return;
  const w = $viewerContainer.clientWidth, h = $viewerContainer.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ── 图片上传 ──────────────────────────────────────────────
$uploadArea.addEventListener('click', () => $fileInput.click());
$fileInput.addEventListener('change', (e) => { if (e.target.files[0]) processFile(e.target.files[0]); });

$uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  $uploadArea.classList.add('drag-over');
});
$uploadArea.addEventListener('dragleave', () => $uploadArea.classList.remove('drag-over'));
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
    gsap.from($preview, { scale: 0.9, opacity: 0, duration: 0.35, ease: 'back.out(1.7)' });
    gsap.from($uploadActions.children, { y: 8, opacity: 0, duration: 0.25, stagger: 0.05 });
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

// ── 分析流程 ──────────────────────────────────────────────
$btnAnalyze.addEventListener('click', startAnalysis);
$btnNew.addEventListener('click', resetAnalysis);

const STEP_LABELS = {
  recognize_vehicle: '识别车型', detect_plate: '识别车牌', assess_condition: '检测车况',
  query_vehicle_params: '查询参数', estimate_market_price: '市场估价', report: '生成档案',
};
const STEP_ORDER = ['recognize_vehicle','detect_plate','assess_condition','query_vehicle_params','estimate_market_price','report'];
let completedCount = 0;

function initSteps() {
  $progressSteps.innerHTML = STEP_ORDER.map(key =>
    `<div class="step-item" id="step-${key}"><span class="step-dot"></span>${STEP_LABELS[key] || key}</div>`
  ).join('');
  $progressFill.style.width = '0%';
  completedCount = 0;
}

function markStep(key) {
  const el = document.getElementById(`step-${key}`);
  if (!el) return;
  el.classList.add('done');
  gsap.from(el.querySelector('.step-dot'), { scale: 2.5, duration: 0.35, ease: 'back.out(2)' });
}

function advanceProgress(toolName) {
  completedCount++;
  markStep(toolName);
  const ratio = Math.min(completedCount / STEP_ORDER.length, 1);
  gsap.to($progressFill, { width: `${ratio * 100}%`, duration: 0.4, ease: 'power2.out' });
  // 激活下一步
  const nextIdx = STEP_ORDER.indexOf(toolName) + 1;
  if (nextIdx < STEP_ORDER.length) {
    const nextEl = document.getElementById(`step-${STEP_ORDER[nextIdx]}`);
    if (nextEl) nextEl.classList.add('active');
  }
}

async function startAnalysis() {
  if (!currentImageBase64) return;

  // 过渡
  const tl = gsap.timeline();
  tl.to([$uploadSection, $resultLayout, $resultActions], { opacity: 0, duration: 0.15 })
    .set([$uploadSection, $resultLayout, $resultActions], { display: 'none' })
    .set($progressSection, { display: 'block', opacity: 0 })
    .to($progressSection, { opacity: 1, duration: 0.25 });

  initSteps();
  document.getElementById('step-recognize_vehicle').classList.add('active');

  // 3D 查看器
  $viewerContainer.innerHTML = '';
  $viewerPlaceholder.style.display = 'flex';
  viewerActive = false;

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
        if (!line.trim().startsWith('data: ')) continue;
        try { handleSSE(JSON.parse(line.trim().slice(6))); } catch (_) {}
      }
    }
  } catch (e) {
    alert('请求失败：' + e.message);
    resetAnalysis();
  }
}

function handleSSE(data) {
  if (data.type === 'step' && data.tool) {
    advanceProgress(data.tool);
  }
  if (data.type === 'report') {
    gsap.to($progressFill, { width: '100%', duration: 0.3 });
    const tl = gsap.timeline();
    tl.to($progressSection, { opacity: 0, duration: 0.18 })
      .set($progressSection, { display: 'none' })
      .set([$resultLayout, $resultActions], { display: 'flex' })
      .set($resultActions, { display: 'block' })
      .to([$resultLayout, $resultActions], { opacity: 1, duration: 0.3 });

    $reportContent.innerHTML = marked.parse(data.content || '分析完成');
    gsap.from('#reportCard', { y: 16, opacity: 0, duration: 0.4, ease: 'power3.out' });
    gsap.from('#viewerCard', { y: 16, opacity: 0, duration: 0.4, delay: 0.06, ease: 'power3.out' });
    gsap.from($btnNew, { y: 6, opacity: 0, duration: 0.25, delay: 0.15 });

    // 启动 3D 查看器 + 根据车型调颜色
    setTimeout(() => {
      initViewer();
      // 尝试从报告中提取车型关键词来调色
      const report = data.content || '';
      const colorMap = { '奔驰': 0xc0c0c0, '宝马': 0x3b5998, '奥迪': 0x333333, '大众': 0x4a90d9, '丰田': 0xcc0000, '本田': 0x0066cc, '日产': 0xee4400, '比亚迪': 0x00aa66, '特斯拉': 0xcc0000, '蔚来': 0x0077cc, '理想': 0x00aa88, '保时捷': 0xffcc00 };
      for (const [brand, color] of Object.entries(colorMap)) {
        if (report.includes(brand)) { updateCarColor(color); break; }
      }
    }, 200);

    loadHistory();
  }
  if (data.type === 'error') {
    alert('分析失败：' + data.message);
    resetAnalysis();
  }
}

function resetAnalysis() {
  const tl = gsap.timeline();
  tl.to([$progressSection, $resultLayout, $resultActions], { opacity: 0, duration: 0.15 })
    .set([$progressSection, $resultLayout, $resultActions], { display: 'none' })
    .set($uploadSection, { display: 'block', opacity: 0 })
    .to($uploadSection, { opacity: 1, duration: 0.25 });
  $btnRetake.click();
}

// ── 历史档案 ──────────────────────────────────────────────
async function loadHistory() {
  try {
    const res = await fetch('/api/archive');
    const { data } = await res.json();
    $historyCount.textContent = data && data.length ? `${data.length} 条` : '';
    if (!data || data.length === 0) {
      $historyList.innerHTML = '<p class="empty-hint">暂无档案记录</p>';
      return;
    }
    $historyList.innerHTML = data.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-time">${item.created_at}</div>
        <div class="history-preview">${escapeHtml(item.preview || '（无预览）')}</div>
      </div>
    `).join('');

    $historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => showDetail(el.dataset.id));
    });
    gsap.from($historyList.querySelectorAll('.history-item'), { y: 16, opacity: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out' });
  } catch (_) {}
}

async function showDetail(id) {
  currentModalId = id;
  const res = await fetch(`/api/archive/${id}`);
  const { data } = await res.json();
  $modalContent.innerHTML = marked.parse(data.full_report || '无内容');
  $modalOverlay.style.display = 'flex';
  gsap.from('.modal-card', { scale: 0.95, opacity: 0, duration: 0.25, ease: 'power3.out' });
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  gsap.to('.modal-card', { scale: 0.95, opacity: 0, duration: 0.15, onComplete: () => {
    $modalOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }});
  currentModalId = null;
}

$btnModalClose.addEventListener('click', closeModal);
$modalOverlay.addEventListener('click', (e) => { if (e.target === $modalOverlay) closeModal(); });
$btnModalDelete.addEventListener('click', async () => {
  if (!currentModalId || !confirm('确定删除此档案？')) return;
  await fetch(`/api/archive/${currentModalId}`, { method: 'DELETE' });
  closeModal();
  loadHistory();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $modalOverlay.style.display !== 'none') closeModal(); });

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── 窗口 resize ───────────────────────────────────────────
window.addEventListener('resize', () => {
  if ($particleCanvas && $uploadArea) {
    $particleCanvas.width = $uploadArea.offsetWidth;
    $particleCanvas.height = $uploadArea.offsetHeight;
  }
  if (viewerActive) resizeViewer();
});

// ── 初始化 ────────────────────────────────────────────────
pageEntrance();
initParticles();
loadHistory();
