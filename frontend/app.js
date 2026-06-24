/* ============================================================
   智能车辆档案助手 — 对话式 + 3D + GSAP
   ============================================================ */

// ── DOM ──────────────────────────────────────────────────
const $sidebar      = document.getElementById('sidebar');
const $convList     = document.getElementById('conversationList');
const $btnNewChat   = document.getElementById('btnNewChat');
const $chatMessages = document.getElementById('chatMessages');
const $chatInput    = document.getElementById('chatInput');
const $btnSend      = document.getElementById('btnSend');
const $btnAttach    = document.getElementById('btnAttach');
const $btnRemoveImg = document.getElementById('btnRemoveImage');
const $btnClearChat = document.getElementById('btnClearChat');
const $btnToggle3D  = document.getElementById('btnToggle3D');
const $fileInput    = document.getElementById('fileInput');
const $imageChip    = document.getElementById('imageChip');
const $imagePreview = document.getElementById('imagePreview');
const $imageName    = document.getElementById('imageName');
const $viewerPanel  = document.getElementById('viewerPanel');
const $viewerContainer = document.getElementById('viewerContainer');
const $viewerPH     = document.getElementById('viewerPlaceholder');

const STORAGE_KEY = 'vehicle-chat-v2';

// ── 状态 ────────────────────────────────────────────────
const state = {
  messages: [],
  conversations: [],
  activeId: '',
  imageFile: null,
  imageBase64: '',
  imageUrl: '',
  sending: false,
};

// ── 工具函数 ────────────────────────────────────────────
function now() { return new Date().toLocaleString('zh-CN', { hour12: false }); }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2,10)}`; }

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderMD(content) {
  if (!content) return '';
  if (typeof marked !== 'undefined') return marked.parse(content);
  return '<pre style="white-space:pre-wrap;font-family:inherit">' + esc(content) + '</pre>';
}

function msgText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  return '';
}

function msgImage(msg) {
  if (!Array.isArray(msg.content)) return '';
  const img = msg.content.find(c => c.type === 'image_url');
  return img ? img.image_url.url : '';
}

function convTitle(msgs) {
  const u = msgs.find(m => m.role === 'user');
  if (!u) return '新对话';
  const t = msgText(u).trim();
  return t ? t.slice(0, 24) : '车辆图片分析';
}

function convPreview(msgs) {
  const a = [...msgs].reverse().find(m => m.role === 'assistant');
  if (!a) return '';
  return msgText(a).replace(/[#*`\n]/g,' ').slice(0, 40);
}

// ── 对话持久化 ──────────────────────────────────────────
function loadConvs() {
  try { state.conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) { state.conversations = []; }
}
function saveConvs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
}

function upsertConv() {
  if (!state.messages.length) return;
  if (!state.activeId) state.activeId = uid();
  const ts = now();
  const ex = state.conversations.find(c => c.id === state.activeId);
  const payload = { id: state.activeId, title: convTitle(state.messages), updatedAt: ts, messages: state.messages };
  if (ex) Object.assign(ex, payload);
  else state.conversations.unshift({ ...payload, createdAt: ts });
  state.conversations.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  saveConvs();
  renderConvList();
}

function renderConvList() {
  if (!state.conversations.length) {
    $convList.innerHTML = '<p class="empty-hint">暂无历史对话</p>';
    return;
  }
  $convList.innerHTML = state.conversations.map(c => {
    const cls = c.id === state.activeId ? ' active' : '';
    return `<button class="conversation-item${cls}" data-id="${c.id}">
      <span class="conversation-title">${esc(c.title || '未命名对话')}</span>
      <span class="conversation-preview">${esc(convPreview(c.messages))}</span>
      <span class="conversation-time">${esc(c.updatedAt || '')}</span>
    </button>`;
  }).join('');
  $convList.querySelectorAll('.conversation-item').forEach(el => {
    el.addEventListener('click', () => openConv(el.dataset.id));
  });
}

function openConv(id) {
  const c = state.conversations.find(c => c.id === id);
  if (!c) return;
  // 保存当前对话
  if (state.activeId && state.messages.length) upsertConv();
  state.activeId = c.id;
  state.messages = c.messages || [];
  state.imageFile = null; state.imageBase64 = ''; state.imageUrl = '';
  $imageChip.hidden = true;
  renderMessages();
  renderConvList();
}

function newChat() {
  if (state.messages.length) upsertConv();
  state.activeId = uid();
  state.messages = [];
  state.imageFile = null; state.imageBase64 = ''; state.imageUrl = '';
  $imageChip.hidden = true;
  $chatMessages.innerHTML = '';
  $viewerPanel.style.display = 'none';
  $chatInput.focus();
  renderConvList();
}

// ── 消息渲染 ────────────────────────────────────────────
function renderMessages() {
  $chatMessages.innerHTML = state.messages.map(m => {
    const text = msgText(m);
    const img = msgImage(m);
    const cls = m.role === 'user' ? 'user' : 'assistant';
    const avatar = m.role === 'user' ? 'U' : 'AI';
    let body = '';
    if (img) body += `<img class="msg-image" src="${esc(img)}" alt="车辆图片">`;
    if (text) body += (m.role === 'assistant' ? renderMD(text) : esc(text));
    if (m.tools && m.tools.length) {
      body += m.tools.map(t => `<div class="msg-tool"><span class="tool-dot"></span>${t}</div>`).join('');
    }
    if (m.loading) body += '<div class="msg-loading"><span></span><span></span><span></span></div>';
    return `<div class="message ${cls}"><div class="msg-avatar">${avatar}</div><div class="msg-content">${body}</div></div>`;
  }).join('');
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

function botMsg(content, tools) {
  return { role: 'assistant', content, tools, ts: now() };
}
function userMsg(content, imageUrl) {
  const parts = [{ type: 'text', text: content }];
  if (imageUrl) parts.push({ type: 'image_url', image_url: { url: imageUrl } });
  return { role: 'user', content: parts, ts: now() };
}

function pushUser(text, imgUrl) {
  state.messages.push(userMsg(text, imgUrl));
  state.messages.push({ role: 'assistant', content: '', loading: true, ts: now() });
  renderMessages();
}

function finishBot(text, tools) {
  // 替换 loading 消息
  state.messages = state.messages.filter(m => !m.loading);
  state.messages.push(botMsg(text, tools));
  renderMessages();
  upsertConv();
  // 如果有报告内容，显示 3D 面板
  if (text && text.length > 100) {
    showViewer();
    updateCarColorFromReport(text);
  }
}

function addToolStep(toolName) {
  const TOOLS_LABEL = {
    recognize_vehicle:'识别车型', detect_plate:'识别车牌', assess_condition:'检测车况',
    query_vehicle_params:'查询参数', estimate_market_price:'市场估价',
    query_plate_info:'车牌信息', check_violation:'违章查询', query_vehicle_history:'维保记录',
    diagnose_damage:'损伤诊断', estimate_repair:'维修方案', recommend_insurance:'保险建议',
  };
  const label = TOOLS_LABEL[toolName] || toolName;
  // 更新 loading 消息的 tools 列表
  const loading = state.messages.find(m => m.loading);
  if (loading) {
    if (!loading.tools) loading.tools = [];
    loading.tools.push(label);
    renderMessages();
  }
}

// ── 图片上传 ────────────────────────────────────────────
$btnAttach.addEventListener('click', () => $fileInput.click());
$fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
  state.imageFile = file;
  state.imageName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    state.imageUrl = ev.target.result;
    state.imageBase64 = ev.target.result.split(',')[1];
    $imagePreview.src = ev.target.result;
    $imageChip.hidden = false;
    gsap.from($imageChip, { y: -8, opacity: 0, duration: 0.25 });
    $chatInput.focus();
  };
  reader.readAsDataURL(file);
});

$btnRemoveImg.addEventListener('click', () => {
  state.imageFile = null; state.imageBase64 = ''; state.imageUrl = '';
  $imageChip.hidden = true; $fileInput.value = '';
});

$btnClearChat.addEventListener('click', () => {
  if (!state.messages.length || !confirm('确定清空当前对话？')) return;
  state.messages = [];
  renderMessages();
  $viewerPanel.style.display = 'none';
  upsertConv();
});

$btnNewChat.addEventListener('click', newChat);

// ── 发送消息 ────────────────────────────────────────────
$btnSend.addEventListener('click', send);
$chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

async function send() {
  const text = $chatInput.value.trim();
  if (!text && !state.imageBase64) return;
  if (state.sending) return;

  state.sending = true;
  $btnSend.disabled = true;

  const imgUrl = state.imageUrl;
  const imgB64 = state.imageBase64;
  pushUser(text || '请分析这辆车', imgUrl);

  // 清除输入
  $chatInput.value = '';
  $chatInput.style.height = 'auto';
  if (state.imageBase64) {
    state.imageFile = null; state.imageBase64 = ''; state.imageUrl = '';
    $imageChip.hidden = true; $fileInput.value = '';
  }

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imgB64, query: text || '帮我识别这辆车' }),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', report = '';
    const tools = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim().startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.trim().slice(6));
          if (data.type === 'step' && data.tool) addToolStep(data.tool);
          if (data.type === 'report') report = data.content || '';
          if (data.type === 'error') report = '分析失败：' + (data.message || '未知错误');
        } catch (_) {}
      }
    }
    finishBot(report || '分析完成', tools);
  } catch (e) {
    finishBot('请求失败：' + e.message, []);
  } finally {
    state.sending = false;
    $btnSend.disabled = false;
    $chatInput.focus();
  }
}

// ── 3D 查看器 ───────────────────────────────────────────
let scene, camera, renderer, carGroup, viewerReady = false;

function showViewer() {
  $viewerPanel.style.display = 'block';
  if (!viewerReady) initViewer();
}

$btnToggle3D.addEventListener('click', () => {
  if ($viewerPanel.style.display === 'none') showViewer();
  else $viewerPanel.style.display = 'none';
});

function initViewer() {
  viewerReady = true;
  const w = $viewerContainer.clientWidth || 600;
  const h = $viewerContainer.clientHeight || 240;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0F1117);
  scene.fog = new THREE.Fog(0x0F1117, 5, 14);

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
  $viewerContainer.innerHTML = '';
  $viewerContainer.appendChild(renderer.domElement);

  // 灯光
  scene.add(new THREE.AmbientLight(0x334466, 1.8));
  const key = new THREE.DirectionalLight(0xfff5ee, 4.5);
  key.position.set(5, 6, 3); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  scene.add(new THREE.DirectionalLight(0x8899cc, 2.2)).position.set(-3, 2, -2);
  scene.add(new THREE.DirectionalLight(0x818cf8, 2.5)).position.set(0, 1.5, -4);
  scene.add(new THREE.DirectionalLight(0x445577, 1.5)).position.set(0, -0.5, 1);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ color: 0x181b28, roughness: 0.45, metalness: 0.2 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.25; ground.receiveShadow = true;
  scene.add(ground);

  // 环形灯
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.02, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.2, emissive: 0x6366f1, emissiveIntensity: 0.6 })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = -1.21;
  scene.add(ring);

  carGroup = new THREE.Group();
  buildCar(carGroup);
  carGroup.rotation.y = 0.3;
  scene.add(carGroup);

  // 拖拽旋转
  let dragging = false, prevX = 0;
  renderer.domElement.addEventListener('mousedown', e => { dragging = true; prevX = e.clientX; });
  renderer.domElement.addEventListener('touchstart', e => { dragging = true; prevX = e.touches[0].clientX; });
  window.addEventListener('mouseup', () => dragging = false);
  window.addEventListener('touchend', () => dragging = false);
  window.addEventListener('mousemove', e => {
    if (!dragging || !carGroup) return;
    carGroup.rotation.y += (e.clientX - prevX) * 0.01;
    prevX = e.clientX;
  });
  window.addEventListener('touchmove', e => {
    if (!dragging || !carGroup) return;
    carGroup.rotation.y += (e.touches[0].clientX - prevX) * 0.01;
    prevX = e.touches[0].clientX;
  });

  animateViewer();
}

function buildCar(group) {
  const paint = new THREE.MeshStandardMaterial({ color: 0xc0c8e0, roughness: 0.18, metalness: 0.8 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.55, metalness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.1, metalness: 0.95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x111122, roughness: 0.03, metalness: 0.05, clearcoat: 0.5, opacity: 0.5, transparent: true });
  const light = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 1.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff1111, roughness: 0.05, emissive: 0x440000, emissiveIntensity: 1 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.05, metalness: 0.95 });

  const W = 1.8, H = 0.55, L = 4.2, wheelR = 0.3, wheelT = 0.22;
  const axleF = 1.25, axleR = -1.25, wheelX = W / 2 + 0.07, bodyY = wheelR + 0.15;

  // 车身
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), paint);
  lower.position.y = bodyY + H / 2; lower.castShadow = true; lower.receiveShadow = true;
  group.add(lower);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.25, L), paint);
  upper.position.y = bodyY + H + 0.12; upper.castShadow = true;
  group.add(upper);

  // 驾驶舱 + 玻璃
  const cabinW = W - 0.3, cabinH = 0.38, cabinL = 1.5, cabinZ = -0.15;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), glass);
  cabin.position.set(0, bodyY + H + 0.28, cabinZ); cabin.renderOrder = 1;
  group.add(cabin);
  const fgGeo = new THREE.BoxGeometry(cabinW - 0.05, cabinH - 0.02, 0.04);
  const fg = new THREE.Mesh(fgGeo, glass);
  fg.position.set(0, bodyY + H + 0.28, cabinZ + cabinL / 2); fg.rotation.x = -0.55; fg.renderOrder = 1;
  group.add(fg);
  const rg = new THREE.Mesh(fgGeo.clone(), glass);
  rg.position.set(0, bodyY + H + 0.28, cabinZ - cabinL / 2); rg.rotation.x = 0.55; rg.renderOrder = 1;
  group.add(rg);

  // 引擎盖 + 后备箱
  const hood = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.06, 0.8), paint);
  hood.position.set(0, bodyY + H + 0.03, L / 2 - 0.4); hood.castShadow = true;
  group.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.06, 0.55), paint);
  trunk.position.set(0, bodyY + H + 0.03, -L / 2 + 0.3); trunk.castShadow = true;
  group.add(trunk);

  // 格栅
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), chrome);
  grille.position.set(0, bodyY + 0.35, L / 2 + 0.02); group.add(grille);
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.07), chrome);
    bar.position.set(i * 0.1, bodyY + 0.35, L / 2 + 0.03); group.add(bar);
  }

  // 大灯 + 尾灯 + 后视镜
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), light)).position.set(side * (W / 2 - 0.1), bodyY + 0.38, L / 2 - 0.02);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), tail)).position.set(side * (W / 2 - 0.1), bodyY + 0.38, -L / 2 + 0.02);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), paint)).position.set(side * (W / 2 + 0.04), bodyY + H + 0.2, cabinZ + cabinL / 2 - 0.1);
  }

  // 保险杠
  const bf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.07, 0.12), plastic);
  bf.position.set(0, bodyY - 0.1, L / 2 + 0.01); group.add(bf);
  const br = bf.clone(); br.position.z = -L / 2 - 0.01; group.add(br);

  // 车轮
  [axleF, axleR].forEach(zPos => {
    [-wheelX, wheelX].forEach(xPos => {
      const wg = new THREE.Group();
      const tGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelT, 24);
      const t = new THREE.Mesh(tGeo, tire); t.rotation.z = Math.PI / 2; t.castShadow = true; wg.add(t);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, wheelT + 0.02, 16), rim);
      r.rotation.z = Math.PI / 2; wg.add(r);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, wheelR * 0.55, wheelT * 0.85), rim);
        s.position.set(Math.cos(a) * wheelR * 0.28, Math.sin(a) * wheelR * 0.28, 0); wg.add(s);
      }
      const c = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.2, wheelR * 0.2, wheelT + 0.03, 12), chrome);
      c.rotation.z = Math.PI / 2; wg.add(c);
      wg.position.set(xPos, wheelR, zPos); group.add(wg);
    });
  });

  // 轮拱
  [axleF, axleR].forEach(zPos => {
    [-wheelX, wheelX].forEach(xPos => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(wheelR + 0.04, 0.025, 6, 16, Math.PI), plastic);
      a.position.set(xPos, bodyY + 0.06, zPos);
      a.rotation.set(0, zPos > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      group.add(a);
    });
  });

  // 底盘
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.04, L - 0.4), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
  floor.position.y = bodyY - H / 2 + 0.02; group.add(floor);
}

function updateCarColorFromReport(report) {
  const colorMap = { '奔驰':0xc0c0c0,'宝马':0x3b5998,'奥迪':0x333333,'大众':0x4a90d9,'丰田':0xcc0000,'本田':0x0066cc,'日产':0xee4400,'比亚迪':0x00aa66,'特斯拉':0xcc0000,'蔚来':0x0077cc,'理想':0x00aa88,'保时捷':0xffcc00 };
  for (const [brand, color] of Object.entries(colorMap)) {
    if (report.includes(brand)) {
      setTimeout(() => {
        if (!carGroup) return;
        carGroup.traverse(ch => {
          if (ch.isMesh && ch.material.color && ch.material.color.getHex() === 0xc0c8e0) ch.material.color.set(color);
        });
      }, 300);
      break;
    }
  }
}

function animateViewer() {
  if (!viewerReady || !renderer) return;
  requestAnimationFrame(animateViewer);
  if (carGroup) carGroup.rotation.y += 0.003;
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  if (!viewerReady || !renderer || !$viewerContainer) return;
  const w = $viewerContainer.clientWidth, h = $viewerContainer.clientHeight;
  if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  renderer.setSize(w, h);
});

// ── 页面入场 ────────────────────────────────────────────
gsap.from('.sidebar', { x: -40, opacity: 0, duration: 0.4, ease: 'power3.out' });
gsap.from('.chat-header', { y: -12, opacity: 0, duration: 0.35, delay: 0.1 });
gsap.from('.composer', { y: 12, opacity: 0, duration: 0.35, delay: 0.15 });

// ── 初始化 ────────────────────────────────────────────────
loadConvs();
if (state.conversations.length) {
  openConv(state.conversations[0].id);
} else {
  newChat();
}
$chatInput.focus();
