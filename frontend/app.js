/* ============================================================
   智能车辆档案助手
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
    upsertConv();
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
