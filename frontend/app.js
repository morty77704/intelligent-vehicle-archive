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
const AI_MODE_KEY = 'vehicle-chat-ai-mode-v1';

const conversationMenu = document.createElement('div');
conversationMenu.className = 'conversation-menu';
conversationMenu.hidden = true;
conversationMenu.innerHTML = '<button type="button" data-action="delete">删除</button>';
document.body.appendChild(conversationMenu);

const btnAiMode = document.createElement('button');
btnAiMode.id = 'btnAiMode';
btnAiMode.type = 'button';
btnAiMode.className = 'mode-toggle active';
btnAiMode.setAttribute('aria-pressed', 'true');
btnAiMode.title = '切换 AI 模式';

const composerRow = document.querySelector('.composer-row');
if (composerRow && chatInput) {
  composerRow.insertBefore(btnAiMode, chatInput);
}

const state = {
  messages: [],
  conversations: [],
  activeConversationId: '',
  selectedImages: [],
  sending: false,
  abortController: null,
  currentAiBubble: null,
  currentUserMessage: null,
  currentFinalContent: '',
  menuConversationId: '',
  aiMode: localStorage.getItem(AI_MODE_KEY) !== 'off',
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
  return getMessageImages(message)[0] || '';
}

function getMessageImages(message) {
  if (!Array.isArray(message.content)) return [];
  return message.content
    .filter((item) => item.type === 'image_url')
    .map((item) => item.image_url?.url || '')
    .filter(Boolean);
}

function stripMessageImages(message) {
  if (!Array.isArray(message.content)) return message;
  return {
    ...message,
    content: message.content.map((item) => {
      if (item?.type !== 'image_url') return item;
      return {
        ...item,
        image_url: {
          ...(item.image_url || {}),
          url: '',
        },
      };
    }),
  };
}

function prepareMessagesForStorage(messages) {
  return messages.map(stripMessageImages);
}

function prepareMessagesForRequest(messages, currentMessage) {
  return messages.map((message) => (message === currentMessage ? message : stripMessageImages(message)));
}

function sanitizeConversationForStorage(conversation) {
  return {
    ...conversation,
    messages: prepareMessagesForStorage(conversation.messages || []),
  };
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
    state.conversations = Array.isArray(data) ? data.map(sanitizeConversationForStorage) : [];
  } catch (e) {
    state.conversations = [];
  }
}

function saveConversations() {
  const sanitized = state.conversations.map(sanitizeConversationForStorage);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    state.conversations = sanitized;
  } catch (e) {
    console.warn('Unable to persist conversation history.', e);
  }
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
    messages: prepareMessagesForStorage(state.messages),
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
    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showConversationMenu(item.dataset.id, event.clientX, event.clientY);
    });
  });
}

function showConversationMenu(id, x, y) {
  state.menuConversationId = id;
  conversationMenu.hidden = false;
  conversationMenu.style.left = `${x}px`;
  conversationMenu.style.top = `${y}px`;

  const rect = conversationMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  conversationMenu.style.left = `${Math.max(8, left)}px`;
  conversationMenu.style.top = `${Math.max(8, top)}px`;
}

function hideConversationMenu() {
  conversationMenu.hidden = true;
  state.menuConversationId = '';
}

function deleteConversation(id) {
  if (!id || (state.sending && id === state.activeConversationId)) return;

  state.conversations = state.conversations.filter((item) => item.id !== id);

  if (state.activeConversationId === id) {
    state.activeConversationId = '';
    state.messages = [];
    resetComposer();
    renderMessages();
  }

  saveConversations();
  renderConversationList();
  hideConversationMenu();
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

  const actions = document.createElement('div');
  actions.className = 'message-actions';
  bubble.appendChild(actions);

  row.appendChild(bubble);
  chatMessages.appendChild(row);
  scrollToBottom();

  return {
    row,
    bubble,
    content,
    steps: bubble.querySelector('.tool-steps'),
    actions,
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

function addUserBubbleWithImages(message) {
  const text = getMessageText(message);
  const imageUrls = getMessageImages(message);
  const parts = [];

  if (imageUrls.length) {
    parts.push(`
      <div class="message-image-grid">
        ${imageUrls.map((imageUrl, index) => `<img class="message-image" src="${imageUrl}" alt="uploaded vehicle image ${index + 1}">`).join('')}
      </div>
    `);
  }

  if (text) parts.push(`<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`);
  createBubble('user', { html: parts.join('') || '(empty message)' });
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
    if (message.role === 'user') addUserBubbleWithImages(message);
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

function addRegenerateButton(aiBubble, userMessage) {
  if (!aiBubble?.actions || !userMessage) return;
  aiBubble.actions.innerHTML = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'regenerate-btn';
  button.textContent = '重新生成';
  button.addEventListener('click', () => regenerateResponse(userMessage, aiBubble));
  aiBubble.actions.appendChild(button);
  scrollToBottom();
}

function clearAssistantActions(aiBubble) {
  if (aiBubble?.actions) aiBubble.actions.innerHTML = '';
}

function updateAiModeButton() {
  btnAiMode.classList.toggle('active', state.aiMode);
  btnAiMode.setAttribute('aria-pressed', String(state.aiMode));
  btnAiMode.textContent = state.aiMode ? 'AI模式' : '普通识别';
  btnAiMode.title = state.aiMode
    ? 'AI模式已开启，点击切换为普通三模型识别'
    : '普通三模型识别已开启，点击切换为AI模式';
}

function toggleAiMode() {
  if (state.sending) return;
  state.aiMode = !state.aiMode;
  localStorage.setItem(AI_MODE_KEY, state.aiMode ? 'on' : 'off');
  updateAiModeButton();
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
  btnSend.disabled = false;
  btnAttach.disabled = sending;
  btnRemoveImage.disabled = sending;
  btnNewChat.disabled = sending;
  btnClear.disabled = sending;
  btnAiMode.disabled = sending;
  btnSend.classList.toggle('stop-mode', sending);
  btnSend.textContent = sending ? '停止' : '发送';
  btnSend.title = sending ? '停止生成' : '发送消息';
}

function resetComposer() {
  chatInput.value = '';
  autoResizeInput();
  clearSelectedImage();
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

function readImageFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve({
      name: file.name,
      url: event.target.result,
      base64: String(event.target.result).split(',')[1] || '',
    });
    reader.readAsDataURL(file);
  });
}

function processFiles(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
  if (!imageFiles.length) {
    createBubble('assistant', { html: '<span class="error-text">Please upload image files.</span>' });
    return;
  }

  Promise.all(imageFiles.map(readImageFile)).then((images) => {
    state.selectedImages = images;
    updateImageChip();
  });
}

function processFile(file) {
  processFiles([file]);
}

function updateImageChip() {
  imageChip.hidden = !state.selectedImages.length;
  imagePreview.src = state.selectedImages[0]?.url || '';
  imageName.textContent = state.selectedImages.length > 1
    ? `${state.selectedImages.length} images selected`
    : (state.selectedImages[0]?.name || 'Vehicle image');
}

function clearSelectedImage() {
  state.selectedImages = [];
  fileInput.value = '';
  updateImageChip();
}

function buildUserMessage(text) {
  if (state.selectedImages.length) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: text || 'Please compare these vehicle images.' },
        ...state.selectedImages.map((image) => ({ type: 'image_url', image_url: { url: image.url } }))
      ]
    };
  }
  return { role: 'user', content: text };
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (state.sending || (!text && !state.selectedImages.length)) return;

  const message = buildUserMessage(text);
  state.messages.push(message);
  addUserBubbleWithImages(message);
  upsertCurrentConversation();

  await requestAssistantResponse(message);
}

async function requestAssistantResponse(message, existingAiBubble = null) {
  const aiBubble = addAssistantBubble();
  if (existingAiBubble) existingAiBubble.row.remove();
  clearAssistantActions(aiBubble);

  const controller = new AbortController();
  state.abortController = controller;
  state.currentAiBubble = aiBubble;
  state.currentUserMessage = message;
  state.currentFinalContent = '';
  setSending(true);

  try {
    let finalContent = '';
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: prepareMessagesForRequest(state.messages, message),
        useAI: state.aiMode,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || `Request failed: ${response.status}`);
    }

    await readSSE(response, (data) => {
      if (data.type === 'step') addStep(aiBubble, data);
      if (['message', 'report', 'text'].includes(data.type)) {
        finalContent = data.content || data.text || '';
        state.currentFinalContent = finalContent;
        setAssistantContent(aiBubble, finalContent);
      }
      if (data.type === 'error') {
        finalContent = '';
        state.currentFinalContent = '';
        setAssistantContent(aiBubble, data.message || 'Unknown error', true);
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
    if (e.name !== 'AbortError') {
      setAssistantContent(aiBubble, e.message, true);
    }
  } finally {
    setSending(false);
    state.abortController = null;
    state.currentAiBubble = null;
    state.currentUserMessage = null;
    state.currentFinalContent = '';
    resetComposer();
  }
}

function stopGeneration() {
  if (!state.sending) return;

  state.abortController?.abort();

  if (state.currentAiBubble) {
    if (state.currentFinalContent) {
      setAssistantContent(state.currentAiBubble, state.currentFinalContent);
    } else {
      setAssistantContent(state.currentAiBubble, '已停止生成。');
    }
    addRegenerateButton(state.currentAiBubble, state.currentUserMessage);
  }

  setSending(false);
}

function regenerateResponse(userMessage, aiBubble) {
  if (state.sending) return;

  while (state.messages.length && state.messages[state.messages.length - 1].role === 'assistant') {
    state.messages.pop();
  }

  requestAssistantResponse(userMessage, aiBubble);
}

btnAttach.addEventListener('click', () => fileInput.click());
btnAiMode.addEventListener('click', toggleAiMode);
btnRemoveImage.addEventListener('click', clearSelectedImage);
btnSend.addEventListener('click', () => {
  if (state.sending) {
    stopGeneration();
    return;
  }

  sendMessage();
});
btnNewChat.addEventListener('click', startNewConversation);
btnClear.addEventListener('click', startNewConversation);

conversationMenu.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="delete"]');
  if (!button) return;
  deleteConversation(state.menuConversationId);
});

document.addEventListener('click', (event) => {
  if (!conversationMenu.hidden && !conversationMenu.contains(event.target)) {
    hideConversationMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideConversationMenu();
});

window.addEventListener('resize', hideConversationMenu);
window.addEventListener('scroll', hideConversationMenu, true);

fileInput.addEventListener('change', (event) => {
  processFiles(event.target.files);
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
  processFiles(event.dataTransfer.files);
});

loadConversations();
renderConversationList();
renderMessages();
updateAiModeButton();
autoResizeInput();
