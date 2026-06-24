/* ============================================================
   智能车辆档案助手 — v3 简化稳健版
   ============================================================ */
(function () {
  'use strict';

  // ── DOM ────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const convList = $('conversationList');
  const chatMsgs = $('chatMessages');
  const chatInput = $('chatInput');
  const btnSend = $('btnSend');
  const btnAttach = $('btnAttach');
  const fileInput = $('fileInput');
  const imageChip = $('imageChip');
  const imagePreview = $('imagePreview');
  const imageName = $('imageName');
  const btnRemoveImg = $('btnRemoveImage');
  const btnNewChat = $('btnNewChat');
  const btnClear = $('btnClearChat');
  const btnToggle3D = $('btnToggle3D');
  const viewerPanel = $('viewerPanel');
  const viewerContainer = $('viewerContainer');

  if (!chatMsgs || !chatInput || !btnSend) {
    alert('页面加载失败，请刷新重试');
    return;
  }

  // ── 状态 ──────────────────────────────────────────────
  const STORAGE_KEY = 'vehicle-chat-v3';
  const state = {
    conversations: [],
    activeId: '',
    messages: [],
    imageBase64: '',
    imageUrl: '',
    sending: false,
  };

  // ── 工具函数 ──────────────────────────────────────────
  function uid() { return Date.now() + '-' + Math.random().toString(16).slice(2, 10); }
  function now() { return new Date().toLocaleString('zh-CN', { hour12: false }); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMD(text) {
    if (!text) return '';
    try {
      if (typeof marked !== 'undefined' && marked.parse) return marked.parse(text);
    } catch (_) {}
    return '<pre style="white-space:pre-wrap;font-family:inherit;margin:0">' + esc(text) + '</pre>';
  }

  function msgText(m) {
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content.filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('\n');
    }
    return '';
  }

  function msgImage(m) {
    if (!Array.isArray(m.content)) return '';
    var img = m.content.find(function (c) { return c.type === 'image_url'; });
    return img ? img.image_url.url : '';
  }

  // ── 对话持久化 ────────────────────────────────────────
  function loadConvs() {
    try { state.conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) { state.conversations = []; }
  }
  function saveConvs() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations)); } catch (_) {}
  }

  function upsertConv() {
    if (!state.messages.length) return;
    if (!state.activeId) state.activeId = uid();
    var ts = now();
    var firstUser = state.messages.find(function (m) { return m.role === 'user'; });
    var title = firstUser ? msgText(firstUser).trim().slice(0, 24) : '新对话';
    if (!title && firstUser && msgImage(firstUser)) title = '车辆图片分析';

    var ex = state.conversations.find(function (c) { return c.id === state.activeId; });
    var payload = { id: state.activeId, title: title, updatedAt: ts, messages: state.messages.slice() };
    if (ex) Object.assign(ex, payload);
    else state.conversations.unshift(Object.assign({}, payload, { createdAt: ts }));
    state.conversations.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    saveConvs();
    renderConvList();
  }

  function convPreview(msgs) {
    var last = msgs.slice().reverse().find(function (m) { return m.role === 'assistant' && !m.loading; });
    if (!last) return '';
    return msgText(last).replace(/[#*`\n]/g, ' ').slice(0, 35);
  }

  function renderConvList() {
    if (!state.conversations.length) {
      convList.innerHTML = '<p class="empty-hint">暂无历史对话</p>';
      return;
    }
    convList.innerHTML = state.conversations.map(function (c) {
      var cls = c.id === state.activeId ? ' active' : '';
      return '<button class="conversation-item' + cls + '" data-id="' + c.id + '">'
        + '<span class="conversation-title">' + esc(c.title || '未命名') + '</span>'
        + '<span class="conversation-preview">' + esc(convPreview(c.messages)) + '</span>'
        + '<span class="conversation-time">' + esc(c.updatedAt || '') + '</span>'
        + '</button>';
    }).join('');
    convList.querySelectorAll('.conversation-item').forEach(function (el) {
      el.addEventListener('click', function () { openConv(el.dataset.id); });
    });
  }

  function openConv(id) {
    var c = state.conversations.find(function (c) { return c.id === id; });
    if (!c) return;
    if (state.activeId && state.messages.length) upsertConv();
    state.activeId = c.id;
    state.messages = (c.messages || []).slice();
    state.imageBase64 = ''; state.imageUrl = '';
    imageChip.hidden = true;
    renderMessages();
    renderConvList();
  }

  function newChat() {
    if (state.messages.length) upsertConv();
    state.activeId = uid();
    state.messages = [];
    state.imageBase64 = ''; state.imageUrl = '';
    imageChip.hidden = true;
    chatMsgs.innerHTML = '';
    viewerPanel.style.display = 'none';
    renderConvList();
    chatInput.focus();
  }

  // ── 消息渲染 ──────────────────────────────────────────
  function renderMessages() {
    chatMsgs.innerHTML = state.messages.map(function (m) {
      var cls = m.role === 'user' ? 'user' : 'assistant';
      var avatar = m.role === 'user' ? 'U' : 'AI';
      var body = '';
      var img = msgImage(m);
      if (img) body += '<img class="msg-image" src="' + img + '" alt="车辆图片">';
      var text = msgText(m);
      if (text && m.role === 'assistant') body += renderMD(text);
      else if (text) body += esc(text);
      if (m.tools && m.tools.length) {
        body += m.tools.map(function (t) { return '<div class="msg-tool"><span class="tool-dot"></span>' + esc(t) + '</div>'; }).join('');
      }
      if (m.loading) body += '<div class="msg-loading"><span></span><span></span><span></span></div>';
      return '<div class="message ' + cls + '"><div class="msg-avatar">' + avatar + '</div><div class="msg-content">' + body + '</div></div>';
    }).join('');
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  // ── 消息操作 ──────────────────────────────────────────
  function pushUser(text, imgUrl) {
    var parts = [{ type: 'text', text: text }];
    if (imgUrl) parts.push({ type: 'image_url', image_url: { url: imgUrl } });
    state.messages.push({ role: 'user', content: parts, ts: now() });
    state.messages.push({ role: 'assistant', content: '', loading: true, ts: now() });
    renderMessages();
  }

  function finishBot(text, tools) {
    state.messages = state.messages.filter(function (m) { return !m.loading; });
    state.messages.push({ role: 'assistant', content: text || '（无内容）', tools: tools, ts: now() });
    renderMessages();
    upsertConv();
    if (text && text.length > 60) showViewer();
    if (text && carGroup) updateCarColor(text);
  }

  var TOOL_LABELS = {
    recognize_vehicle: '识别车型', detect_plate: '识别车牌', assess_condition: '检测车况',
    query_vehicle_params: '查询参数', estimate_market_price: '市场估价',
    query_plate_info: '查询车牌', check_violation: '违章查询', query_vehicle_history: '维保记录',
    diagnose_damage: '损伤诊断', estimate_repair: '维修估算', recommend_insurance: '保险建议',
  };

  function addToolStep(toolName) {
    var label = TOOL_LABELS[toolName] || toolName;
    var loading = state.messages.find(function (m) { return m.loading; });
    if (loading) {
      if (!loading.tools) loading.tools = [];
      loading.tools.push(label);
      renderMessages();
    }
  }

  // ── 图片上传 ──────────────────────────────────────────
  function clearImage() {
    state.imageBase64 = ''; state.imageUrl = '';
    imageChip.hidden = true; fileInput.value = '';
  }

  btnAttach.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    if (!file.type.match(/^image\//)) { alert('请选择图片文件'); return; }
    imageName.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (ev) {
      state.imageUrl = ev.target.result;
      state.imageBase64 = ev.target.result.split(',')[1] || '';
      imagePreview.src = ev.target.result;
      imageChip.hidden = false;
      chatInput.focus();
    };
    reader.onerror = function () { alert('图片读取失败，请重试'); };
    reader.readAsDataURL(file);
  });

  btnRemoveImg.addEventListener('click', clearImage);

  // ── 发送消息 ──────────────────────────────────────────
  async function doSend() {
    var text = chatInput.value.trim();
    if (!text && !state.imageBase64) return;
    if (state.sending) return;

    state.sending = true;
    btnSend.disabled = true;

    var imgUrl = state.imageUrl;
    var imgB64 = state.imageBase64;
    pushUser(text || '请分析这辆车', imgUrl);
    clearImage();
    chatInput.value = '';
    chatInput.style.height = 'auto';

    try {
      var response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imgB64, query: text || '帮我识别这辆车' }),
      });

      if (!response.ok) {
        finishBot('请求失败 (HTTP ' + response.status + ')', []);
        return;
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '', report = '';

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          try {
            var data = JSON.parse(line.slice(6));
            if (data.type === 'step' && data.tool) addToolStep(data.tool);
            if (data.type === 'report') report = data.content || '';
            if (data.type === 'error') report = '分析失败：' + (data.message || '未知错误');
          } catch (_) {}
        }
      }
      finishBot(report || '分析完成', []);
    } catch (e) {
      finishBot('请求失败：' + (e.message || '网络错误'), []);
    } finally {
      state.sending = false;
      btnSend.disabled = false;
      chatInput.focus();
    }
  }

  btnSend.addEventListener('click', doSend);
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });

  btnNewChat.addEventListener('click', newChat);
  btnClear.addEventListener('click', function () {
    if (!state.messages.length || !confirm('确定清空当前对话？')) return;
    state.messages = [];
    renderMessages();
    viewerPanel.style.display = 'none';
    upsertConv();
  });

  // ── 3D 查看器 ─────────────────────────────────────────
  var scene, camera, renderer, carGroup, viewerReady = false;

  function showViewer() {
    if (typeof THREE === 'undefined') return;
    viewerPanel.style.display = 'block';
    if (!viewerReady) initViewer();
  }

  btnToggle3D.addEventListener('click', function () {
    viewerPanel.style.display = viewerPanel.style.display === 'none' ? 'block' : 'none';
    if (viewerPanel.style.display !== 'none' && !viewerReady) initViewer();
  });

  function initViewer() {
    if (typeof THREE === 'undefined') return;
    viewerReady = true;
    var w = viewerContainer.clientWidth || 600;
    var h = viewerContainer.clientHeight || 240;

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
    viewerContainer.innerHTML = '';
    viewerContainer.appendChild(renderer.domElement);

    // 灯光
    scene.add(new THREE.AmbientLight(0x334466, 1.8));
    var key = new THREE.DirectionalLight(0xfff5ee, 4.5);
    key.position.set(5, 6, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    var f1 = new THREE.DirectionalLight(0x8899cc, 2.2); f1.position.set(-3, 2, -2); scene.add(f1);
    var f2 = new THREE.DirectionalLight(0x818cf8, 2.5); f2.position.set(0, 1.5, -4); scene.add(f2);
    var f3 = new THREE.DirectionalLight(0x445577, 1.5); f3.position.set(0, -0.5, 1); scene.add(f3);

    // 地面
    var gGeo = new THREE.PlaneGeometry(14, 14);
    var gMat = new THREE.MeshStandardMaterial({ color: 0x181b28, roughness: 0.45, metalness: 0.2 });
    var ground = new THREE.Mesh(gGeo, gMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.25; ground.receiveShadow = true;
    scene.add(ground);

    // 灯环
    var rGeo = new THREE.TorusGeometry(2.2, 0.02, 8, 64);
    var rMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.2, emissive: 0x6366f1, emissiveIntensity: 0.6 });
    var ring = new THREE.Mesh(rGeo, rMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.21; scene.add(ring);

    carGroup = new THREE.Group();
    buildCar(carGroup);
    carGroup.rotation.y = 0.3;
    scene.add(carGroup);

    // 拖拽
    var dragging = false, prevX = 0;
    renderer.domElement.addEventListener('mousedown', function (e) { dragging = true; prevX = e.clientX; });
    renderer.domElement.addEventListener('touchstart', function (e) { dragging = true; prevX = e.touches[0].clientX; });
    window.addEventListener('mouseup', function () { dragging = false; });
    window.addEventListener('touchend', function () { dragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging || !carGroup) return;
      carGroup.rotation.y += (e.clientX - prevX) * 0.01; prevX = e.clientX;
    });
    window.addEventListener('touchmove', function (e) {
      if (!dragging || !carGroup) return;
      carGroup.rotation.y += (e.touches[0].clientX - prevX) * 0.01; prevX = e.touches[0].clientX;
    });

    animateViewer();
  }

  function buildCar(group) {
    var paint = new THREE.MeshStandardMaterial({ color: 0xc0c8e0, roughness: 0.18, metalness: 0.8 });
    var plastic = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.55, metalness: 0.1 });
    var chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.1, metalness: 0.95 });
    var glass = new THREE.MeshPhysicalMaterial({ color: 0x111122, roughness: 0.03, metalness: 0.05, opacity: 0.5, transparent: true });
    var lightM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 1.2 });
    var tailM = new THREE.MeshStandardMaterial({ color: 0xff1111, roughness: 0.05, emissive: 0x440000, emissiveIntensity: 1 });
    var tireM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    var rimM = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.05, metalness: 0.95 });

    var W = 1.8, H = 0.55, L = 4.2, wR = 0.3, wT = 0.22;
    var aF = 1.25, aR = -1.25, wX = W / 2 + 0.07, bY = wR + 0.15;

    group.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, L), paint)).position.y = bY + H / 2;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.25, L), paint)).position.y = bY + H + 0.12;

    var cW = W - 0.3, cH = 0.38, cL = 1.5, cZ = -0.15;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(cW, cH, cL), glass)).position.set(0, bY + H + 0.28, cZ);
    var fg = new THREE.Mesh(new THREE.BoxGeometry(cW - 0.05, cH - 0.02, 0.04), glass);
    fg.position.set(0, bY + H + 0.28, cZ + cL / 2); fg.rotation.x = -0.55; group.add(fg);
    var rg = new THREE.Mesh(new THREE.BoxGeometry(cW - 0.05, cH - 0.02, 0.04), glass);
    rg.position.set(0, bY + H + 0.28, cZ - cL / 2); rg.rotation.x = 0.55; group.add(rg);

    group.add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.06, 0.8), paint)).position.set(0, bY + H + 0.03, L / 2 - 0.4);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.06, 0.55), paint)).position.set(0, bY + H + 0.03, -L / 2 + 0.3);

    var grille = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), chrome);
    grille.position.set(0, bY + 0.35, L / 2 + 0.02); group.add(grille);
    for (var i = -2; i <= 2; i++) {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.07), chrome)).position.set(i * 0.1, bY + 0.35, L / 2 + 0.03);
    }

    for (var s = 0; s < 2; s++) {
      var side = s === 0 ? -1 : 1;
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), lightM)).position.set(side * (W / 2 - 0.1), bY + 0.38, L / 2 - 0.02);
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), tailM)).position.set(side * (W / 2 - 0.1), bY + 0.38, -L / 2 + 0.02);
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), paint)).position.set(side * (W / 2 + 0.04), bY + H + 0.2, cZ + cL / 2 - 0.1);
    }

    var bf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.07, 0.12), plastic);
    bf.position.set(0, bY - 0.1, L / 2 + 0.01); group.add(bf);
    var br = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.07, 0.12), plastic);
    br.position.set(0, bY - 0.1, -L / 2 - 0.01); group.add(br);

    [aF, aR].forEach(function (zPos) {
      [-wX, wX].forEach(function (xPos) {
        var wg = new THREE.Group();
        var t = new THREE.Mesh(new THREE.CylinderGeometry(wR, wR, wT, 24), tireM);
        t.rotation.z = Math.PI / 2; wg.add(t);
        var r = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.65, wR * 0.65, wT + 0.02, 16), rimM);
        r.rotation.z = Math.PI / 2; wg.add(r);
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2;
          var sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, wR * 0.55, wT * 0.85), rimM);
          sp.position.set(Math.cos(a) * wR * 0.28, Math.sin(a) * wR * 0.28, 0); wg.add(sp);
        }
        var cap = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.2, wR * 0.2, wT + 0.03, 12), chrome);
        cap.rotation.z = Math.PI / 2; wg.add(cap);
        wg.position.set(xPos, wR, zPos); group.add(wg);
      });
    });

    [aF, aR].forEach(function (zPos) {
      [-wX, wX].forEach(function (xPos) {
        var arch = new THREE.Mesh(new THREE.TorusGeometry(wR + 0.04, 0.025, 6, 16, Math.PI), plastic);
        arch.position.set(xPos, bY + 0.06, zPos);
        arch.rotation.set(0, zPos > 0 ? -Math.PI / 2 : Math.PI / 2, 0); group.add(arch);
      });
    });

    group.add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.04, L - 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }))).position.y = bY - H / 2 + 0.02;
  }

  function updateCarColor(report) {
    var map = { '奔驰': 0xc0c0c0, '宝马': 0x3b5998, '奥迪': 0x333333, '大众': 0x4a90d9, '丰田': 0xcc0000, '本田': 0x0066cc, '日产': 0xee4400, '比亚迪': 0x00aa66, '特斯拉': 0xcc0000, '蔚来': 0x0077cc, '理想': 0x00aa88, '保时捷': 0xffcc00 };
    for (var brand in map) {
      if (report.indexOf(brand) !== -1) {
        setTimeout(function () {
          if (!carGroup) return;
          carGroup.traverse(function (ch) {
            if (ch.isMesh && ch.material.color && ch.material.color.getHex() === 0xc0c8e0) {
              ch.material.color.set(map[brand]);
            }
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

  window.addEventListener('resize', function () {
    if (!viewerReady || !renderer || !viewerContainer) return;
    var w = viewerContainer.clientWidth, h = viewerContainer.clientHeight;
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    renderer.setSize(w, h);
  });

  // ── 初始化 ────────────────────────────────────────────
  loadConvs();
  if (state.conversations.length) {
    openConv(state.conversations[0].id);
  } else {
    newChat();
  }
  chatInput.focus();

})();
