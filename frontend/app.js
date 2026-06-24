const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const btnAttach = document.getElementById('btnAttach');
const btnRemoveImage = document.getElementById('btnRemoveImage');
const btnClear = document.getElementById('btnClear');
const btnNewChat = document.getElementById('btnNewChat');
const fileInput = document.getElementById('fileInput');
const imageChip = document.getElementById('imageChip');
const imagePreview = document.getElementById('imagePreview');
const imageName = document.getElementById('imageName');
const conversationList = document.getElementById('conversationList');

const STORAGE_KEY = 'vehicle-chat-conversations-v1';

const state = {
  messages: [],
  conversations: [],
  activeConversationId: '',
  selectedImage: null,
  selectedImageBase64: '',
  selectedImageUrl: '',
  sending: false,
};

const TOOL_LABELS = {
  recognize_vehicle: '识别车型',
  detect_plate: '识别车牌',
  assess_condition: '评估车况',
  query_vehicle_params: '查询车辆参数',
  estimate_market_price: '估算市场价格',
  query_plate_info: '查询车牌信息',
  check_violation: '查询违章记录',
  query_vehicle_history: '查询车辆历史',
  diagnose_damage: '诊断损伤',
  estimate_repair: '估算维修费用',
  recommend_insurance: '生成保险建议',
};

function renderMarkdown(content) {
  if (!content) return '';
  if (window.marked) return marked.parse(content);
  return escapeHtml(content).replace(/\n/g, '<br>');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getMessageText(message) {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  }
  return '';
}

function getMessageImage(message) {
  if (!Array.isArray(message.content)) return '';
  return message.content.find((item) => item.type === 'image_url')?.image_url?.url || '';
}

function getConversationTitle(messages) {
  const firstUser = messages.find((message) => message.role === 'user');
  const text = firstUser ? getMessageText(firstUser).trim() : '';
  if (text) return text.slice(0, 28);
  if (firstUser && getMessageImage(firstUser)) return '车辆图片分析';
  return '新对话';
}

function loadConversations() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    state.conversations = Array.isArray(data) ? data : [];
  } catch (e) {
    state.conversations = [];
  }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
}

function upsertCurrentConversation() {
  if (!state.messages.length) return;
  const now = nowText();
  if (!state.activeConversationId) {
    state.activeConversationId = createId();
  }

  const existing = state.conversations.find((item) => item.id === state.activeConversationId);
  const payload = {
    id: state.activeConversationId,
    title: getConversationTitle(state.messages),
    updatedAt: now,
    messages: state.messages,
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    state.conversations.unshift({ ...payload, createdAt: now });
  }

  state.conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  saveConversations();
  renderConversationList();
}

function renderConversationList() {
  if (!state.conversations.length) {
    conversationList.innerHTML = '<p class="empty-hint">暂无历史对话</p>';
    return;
  }

  conversationList.innerHTML = state.conversations.map((item) => {
    const active = item.id === state.activeConversationId ? ' active' : '';
    const preview = getConversationPreview(item.messages);
    return `
      <button class="conversation-item${active}" type="button" data-id="${item.id}">
        <span class="conversation-title">${escapeHtml(item.title || '未命名对话')}</span>
        <span class="conversation-preview">${escapeHtml(preview)}</span>
        <span class="conversation-time">${escapeHtml(item.updatedAt || '')}</span>
      </button>
    `;
  }).join('');

  conversationList.querySelectorAll('.conversation-item').forEach((item) => {
    item.addEventListener('click', () => openConversation(item.dataset.id));
  });
}

function getConversationPreview(messages) {
  const last = [...messages].reverse().find((message) => getMessageText(message).trim() || getMessageImage(message));
  if (!last) return '暂无内容';
  const text = getMessageText(last).trim();
  if (text) return text.slice(0, 48);
  return '图片消息';
}

function openConversation(id) {
  const conversation = state.conversations.find((item) => item.id === id);
  if (!conversation || state.sending) return;
  state.activeConversationId = conversation.id;
  state.messages = JSON.parse(JSON.stringify(conversation.messages || []));
  resetComposer();
  renderMessages();
  renderConversationList();
}

function startNewConversation() {
  if (state.sending) return;
  state.activeConversationId = '';
  state.messages = [];
  resetComposer();
  renderMessages();
  renderConversationList();
}

function createBubble(role, options = {}) {
  const row = document.createElement('article');
  row.className = `message-row ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'assistant') {
    const steps = document.createElement('div');
    steps.className = 'tool-steps';
    steps.hidden = true;
    bubble.appendChild(steps);
  }

  const content = document.createElement('div');
  content.className = 'message-content';
  if (options.html) content.innerHTML = options.html;
  if (options.text) content.textContent = options.text;
  bubble.appendChild(content);

  row.appendChild(bubble);
  chatMessages.appendChild(row);
  scrollToBottom();

  return {
    row,
    bubble,
    content,
    steps: bubble.querySelector('.tool-steps'),
  };
}

function addUserBubble(message) {
  const text = getMessageText(message);
  const imageUrl = getMessageImage(message);
  const parts = [];
  if (imageUrl) parts.push(`<img class="message-image" src="${imageUrl}" alt="用户上传的车辆图片">`);
  if (text) parts.push(`<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`);
  createBubble('user', { html: parts.join('') || '（空消息）' });
}

function addAssistantMessage(message) {
  const bubble = createBubble('assistant');
  setAssistantContent(bubble, getMessageText(message) || '已完成。');
}

function addAssistantBubble() {
  return createBubble('assistant', {
    html: '<span class="loading-dot"></span><span class="muted">正在思考...</span>'
  });
}

function renderMessages() {
  chatMessages.innerHTML = '';
  if (!state.messages.length) {
    createBubble('assistant', {
      html: '你好，我可以回答车辆相关问题，也可以分析你上传的车辆图片。'
    });
    return;
  }

  state.messages.forEach((message) => {
    if (message.role === 'user') addUserBubble(message);
    if (message.role === 'assistant') addAssistantMessage(message);
  });
}

function addStep(aiBubble, data) {
  if (!aiBubble.steps) return;
  aiBubble.steps.hidden = false;
  const item = document.createElement('div');
  const ok = data.result === true;
  item.className = `tool-step ${ok ? 'ok' : 'warn'}`;
  const label = data.tool ? (TOOL_LABELS[data.tool] || data.tool) : (data.content || '处理中');
  item.textContent = ok ? `${label}完成` : label;
  aiBubble.steps.appendChild(item);
  scrollToBottom();
}

function setAssistantContent(aiBubble, markdown, isError = false) {
  aiBubble.content.classList.toggle('error-text', isError);
  aiBubble.content.innerHTML = isError
    ? `<strong>请求失败：</strong>${escapeHtml(markdown)}`
    : renderMarkdown(markdown || '已完成。');
  scrollToBottom();
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function autoResizeInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
}

function setSending(sending) {
  state.sending = sending;
  chatInput.disabled = sending;
  btnSend.disabled = sending;
  btnAttach.disabled = sending;
  btnRemoveImage.disabled = sending;
  btnNewChat.disabled = sending;
  btnClear.disabled = sending;
  btnSend.textContent = sending ? '发送中' : '发送';
}

function updateImageChip() {
  imageChip.hidden = !state.selectedImageUrl;
  imagePreview.src = state.selectedImageUrl || '';
  imageName.textContent = state.selectedImage?.name || '车辆图片';
}

function clearSelectedImage() {
  state.selectedImage = null;
  state.selectedImageBase64 = '';
  state.selectedImageUrl = '';
  fileInput.value = '';
  updateImageChip();
}

function resetComposer() {
  chatInput.value = '';
  autoResizeInput();
  clearSelectedImage();
}

function buildUserMessage(text) {
  if (state.selectedImageBase64) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: text || '请分析这张车辆图片' },
        { type: 'image_url', image_url: { url: state.selectedImageUrl } }
      ]
    };
  }
  return { role: 'user', content: text };
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (state.sending || (!text && !state.selectedImageBase64)) return;

  const message = buildUserMessage(text);
  state.messages.push(message);
  addUserBubble(message);
  upsertCurrentConversation();

  const aiBubble = addAssistantBubble();
  setSending(true);

  try {
    let finalContent = '';
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || `请求失败：${response.status}`);
    }

    await readSSE(response, (data) => {
      if (data.type === 'step') addStep(aiBubble, data);
      if (['message', 'report', 'text'].includes(data.type)) {
        finalContent = data.content || data.text || '';
        setAssistantContent(aiBubble, finalContent);
      }
      if (data.type === 'error') {
        finalContent = '';
        setAssistantContent(aiBubble, data.message || '未知错误', true);
      }
      if (data.type === 'done') {
        setSending(false);
      }
    });

    if (finalContent) {
      state.messages.push({ role: 'assistant', content: finalContent });
      upsertCurrentConversation();
    }
  } catch (e) {
    setAssistantContent(aiBubble, e.message, true);
  } finally {
    setSending(false);
    resetComposer();
  }
}

async function readSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLines = event
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6));
      if (!dataLines.length) continue;
      try {
        onEvent(JSON.parse(dataLines.join('\n')));
      } catch (e) {
        console.warn('跳过无法解析的 SSE 事件', e);
      }
    }
  }
}

function processFile(file) {
  if (!file.type.startsWith('image/')) {
    createBubble('assistant', { html: '<span class="error-text">请上传图片文件。</span>' });
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    state.selectedImage = file;
    state.selectedImageUrl = event.target.result;
    state.selectedImageBase64 = state.selectedImageUrl.split(',')[1] || '';
    updateImageChip();
  };
  reader.readAsDataURL(file);
}

btnAttach.addEventListener('click', () => fileInput.click());
btnRemoveImage.addEventListener('click', clearSelectedImage);
btnSend.addEventListener('click', sendMessage);
btnNewChat.addEventListener('click', startNewConversation);
btnClear.addEventListener('click', startNewConversation);

fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) processFile(file);
});

chatInput.addEventListener('input', autoResizeInput);
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

chatMessages.addEventListener('dragover', (event) => {
  event.preventDefault();
  chatMessages.classList.add('drag-over');
});

chatMessages.addEventListener('dragleave', () => {
  chatMessages.classList.remove('drag-over');
});

chatMessages.addEventListener('drop', (event) => {
  event.preventDefault();
  chatMessages.classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) processFile(file);
});

loadConversations();
renderConversationList();
renderMessages();
autoResizeInput();
