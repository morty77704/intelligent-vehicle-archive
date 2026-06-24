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

  camera = new THREE.PerspectiveCamera(38, w / h, 0.5, 50);
  camera.position.set(4.5, 2.4, 5.5);
  camera.lookAt(0, 0.35, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // 渐变背景
  scene.background = new THREE.Color(0x0F1117);
  scene.fog = new THREE.Fog(0x0F1117, 6, 16);

  // 多光源
  const ambient = new THREE.AmbientLight(0x334466, 1.8);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff5ee, 4.5);
  key.position.set(5, 6, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8899cc, 2.2);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x818cf8, 2.5);
  rim.position.set(0, 1.5, -4);
  scene.add(rim);

  const under = new THREE.DirectionalLight(0x445577, 1.5);
  under.position.set(0, -0.5, 1);
  scene.add(under);

  // 地面（暗色镜面）
  const groundGeo = new THREE.PlaneGeometry(14, 14);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x181b28, roughness: 0.45, metalness: 0.2 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.25;
  ground.receiveShadow = true;
  scene.add(ground);

  // 环形灯台
  const ringGeo = new THREE.TorusGeometry(2.2, 0.02, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.2, emissive: 0x6366f1, emissiveIntensity: 0.6 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.21;
  scene.add(ring);

  // 车辆组
  carGroup = new THREE.Group();
  buildCar(carGroup);
  scene.add(carGroup);

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
  // 坐标约定：X=宽度, Y=高度, Z=前后(前=+Z)
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xc0c8e0, roughness: 0.18, metalness: 0.8 });
  const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.55, metalness: 0.1 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.1, metalness: 0.95 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x111122, roughness: 0.03, metalness: 0.05, clearcoat: 0.5, opacity: 0.5, transparent: true });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1111, roughness: 0.05, emissive: 0x440000, emissiveIntensity: 1 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.05, metalness: 0.95 });

  const W = 1.8,  H_body = 0.55, L = 4.2;           // 车身：宽, 高, 长
  const cabinH = 0.38, cabinL = 1.5;                  // 驾驶舱
  const wheelR = 0.3, wheelT = 0.22;                  // 车轮半径/厚度
  const axleF = 1.25, axleR = -1.25;                  // 前后轴 Z 位置
  const wheelX = (W / 2) + 0.07;                       // 车轮 X 位置
  const bodyY = wheelR + 0.15;                         // 车身底部 Y

  // ── 车身下部 ──────────────────────────────────────
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W, H_body, L), paintMat);
  lower.position.y = bodyY + H_body / 2;
  lower.castShadow = true; lower.receiveShadow = true;
  group.add(lower);

  // ── 车身腰线上方逐渐收窄（侧面内缩片） ────────────
  const upperW = W - 0.15;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(upperW, 0.25, L), paintMat);
  upper.position.y = bodyY + H_body + 0.12;
  upper.castShadow = true;
  group.add(upper);

  // ── 驾驶舱 ────────────────────────────────────────
  const cabinW = W - 0.3;
  const cabinZ = -0.15;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), glassMat);
  cabin.position.set(0, bodyY + H_body + 0.28, cabinZ);
  cabin.castShadow = true;
  cabin.renderOrder = 1;
  group.add(cabin);

  // ── 前挡风（倾斜） ────────────────────────────────
  const fgGeo = new THREE.BoxGeometry(cabinW - 0.05, cabinH - 0.02, 0.04);
  const fg = new THREE.Mesh(fgGeo, glassMat);
  fg.position.set(0, bodyY + H_body + 0.28, cabinZ + cabinL / 2);
  fg.rotation.x = -0.55;
  fg.renderOrder = 1;
  group.add(fg);

  // ── 后挡风（倾斜） ────────────────────────────────
  const rg = new THREE.Mesh(fgGeo.clone(), glassMat);
  rg.position.set(0, bodyY + H_body + 0.28, cabinZ - cabinL / 2);
  rg.rotation.x = 0.55;
  rg.renderOrder = 1;
  group.add(rg);

  // ── 引擎盖 ────────────────────────────────────────
  const hoodGeo = new THREE.BoxGeometry(W - 0.1, 0.06, 0.8);
  const hood = new THREE.Mesh(hoodGeo, paintMat);
  hood.position.set(0, bodyY + H_body + 0.03, L / 2 - 0.4);
  hood.castShadow = true;
  group.add(hood);

  // ── 后备箱盖 ──────────────────────────────────────
  const trunkGeo = new THREE.BoxGeometry(W - 0.1, 0.06, 0.55);
  const trunk = new THREE.Mesh(trunkGeo, paintMat);
  trunk.position.set(0, bodyY + H_body + 0.03, -L / 2 + 0.3);
  trunk.castShadow = true;
  group.add(trunk);

  // ── 前脸进气格栅 ──────────────────────────────────
  const grilleW = 0.5, grilleH = 0.18;
  const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(grilleW, grilleH, 0.05), chromeMat);
  grilleFrame.position.set(0, bodyY + 0.35, L / 2 + 0.02);
  group.add(grilleFrame);
  // 竖条
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, grilleH - 0.03, 0.07), chromeMat);
    bar.position.set(i * 0.1, bodyY + 0.35, L / 2 + 0.03);
    group.add(bar);
  }

  // ── 前大灯 ────────────────────────────────────────
  for (let side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), lightMat);
    hl.position.set(side * (W / 2 - 0.1), bodyY + 0.38, L / 2 - 0.02);
    group.add(hl);
  }

  // ── 尾灯 ──────────────────────────────────────────
  for (let side of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), tailMat);
    tl.position.set(side * (W / 2 - 0.1), bodyY + 0.38, -L / 2 + 0.02);
    group.add(tl);
  }

  // ── 后视镜 ────────────────────────────────────────
  for (let side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), paintMat);
    mirror.position.set(side * (W / 2 + 0.04), bodyY + H_body + 0.2, cabinZ + cabinL / 2 - 0.1);
    group.add(mirror);
  }

  // ── 防撞杠 ────────────────────────────────────────
  const bf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.07, 0.12), darkPlastic);
  bf.position.set(0, bodyY - 0.1, L / 2 + 0.01);
  group.add(bf);
  const br = bf.clone();
  br.position.z = -L / 2 - 0.01;
  group.add(br);

  // ── 车轮 ──────────────────────────────────────────
  [axleF, axleR].forEach(zPos => {
    [-wheelX, wheelX].forEach(xPos => {
      const wg = new THREE.Group();

      // 轮胎 (CylinderGeometry 沿 Y 轴, 需旋转到 X 轴)
      const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelT, 24);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wg.add(tire);

      // 轮辋
      const rimGeo = new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, wheelT + 0.02, 16);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      wg.add(rim);

      // 5辐
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, wheelR * 0.55, wheelT * 0.85), rimMat);
        spoke.position.set(Math.cos(a) * wheelR * 0.28, Math.sin(a) * wheelR * 0.28, 0);
        wg.add(spoke);
      }

      // 中心盖
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.2, wheelR * 0.2, wheelT + 0.03, 12), chromeMat);
      cap.rotation.z = Math.PI / 2;
      wg.add(cap);

      wg.position.set(xPos, wheelR, zPos);
      group.add(wg);
    });
  });

  // ── 轮拱 ──────────────────────────────────────────
  [axleF, axleR].forEach(zPos => {
    [-wheelX, wheelX].forEach(xPos => {
      const archGeo = new THREE.TorusGeometry(wheelR + 0.04, 0.025, 6, 16, Math.PI);
      const arch = new THREE.Mesh(archGeo, darkPlastic);
      arch.position.set(xPos, bodyY + 0.06, zPos);
      arch.rotation.set(0, zPos > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      group.add(arch);
    });
  });

  // ── 底部护板 ──────────────────────────────────────
  const floorGeo = new THREE.BoxGeometry(W - 0.2, 0.04, L - 0.4);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
  floor.position.y = bodyY - H_body / 2 + 0.02;
  group.add(floor);
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

    const reportText = data.content || '分析完成';
    if (typeof marked !== 'undefined') {
      $reportContent.innerHTML = marked.parse(reportText);
    } else {
      $reportContent.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(reportText)}</pre>`;
    }
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
  try {
    const res = await fetch(`/api/archive/${id}`);
    const json = await res.json();
    const report = json.data?.full_report || '（无内容）';
    // 优先用 marked，不可用时退回纯文本
    if (typeof marked !== 'undefined') {
      $modalContent.innerHTML = marked.parse(report);
    } else {
      $modalContent.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(report)}</pre>`;
    }
    $modalOverlay.style.display = 'flex';
    gsap.fromTo('.modal-card', { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'power3.out' });
    document.body.style.overflow = 'hidden';
  } catch (e) {
    alert('加载详情失败：' + e.message);
  }
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
