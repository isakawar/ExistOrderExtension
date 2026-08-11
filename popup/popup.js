const $ = (sel) => document.querySelector(sel);

const STORAGE_KEY = 'smokeSettings';
// Never store credentials/session data — only QA's own form choices.
const STORAGE_FIELDS = ['platform', 'phone', 'count', 'deliveries', 'payments', 'oneClickEnabled', 'oneClickCount'];

const state = {
  platform: 'UA',
  detectedPlatform: null,
  siteHostname: null,
  tabId: null,
  phase: 'INITIAL', // INITIAL | RUNNING | COMPLETED
  stopped: false,
  results: [],
  orderEntries: new Map(), // index -> merged order data, for re-rendering
  total: 0,
  startTime: 0,
  listener: null,
  environment: null,
  lastConfig: null,
};

function getAdapterMeta(platform) {
  return platform === 'UA' ? window.SmokeUA : window.SmokePL;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ============================================================
// Settings persistence (chrome.storage.local) — form choices only
// ============================================================

function loadSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(STORAGE_KEY, (data) => resolve((data && data[STORAGE_KEY]) || {}));
    } catch (e) {
      resolve({});
    }
  });
}

function saveSettings() {
  const settings = {
    platform: state.platform,
    phone: $('#phone').value.trim(),
    count: $('#count').value,
    deliveries: getSelected('delivery'),
    payments: getSelected('payment'),
    oneClickEnabled: $('#oneClickEnabled').checked,
    oneClickCount: $('#oneClickCount').value,
  };
  try {
    chrome.storage.local.set({ [STORAGE_KEY]: settings });
  } catch (e) {
    console.warn('Не вдалося зберегти налаштування:', e);
  }
}

// ============================================================
// Site detection
// ============================================================

async function detectSite() {
  const tab = await getActiveTab();
  state.tabId = tab && tab.id;
  let hostname = null;
  try {
    hostname = tab && tab.url ? new URL(tab.url).hostname : null;
  } catch (e) {
    hostname = null;
  }
  state.siteHostname = hostname;
  state.detectedPlatform = window.SmokeSiteConfig ? window.SmokeSiteConfig.detectPlatform(hostname) : null;
}

function renderConnectionBar() {
  const bar = $('#connectionBar');
  if (state.siteHostname) {
    bar.textContent = `🟢 Connected: ${state.siteHostname}`;
  } else {
    bar.textContent = '⚪ Немає активної вкладки';
  }

  const banner = $('#platformMismatch');
  if (!state.siteHostname) {
    banner.className = 'mismatch-banner warn';
    banner.textContent = '⚠️ Unknown site';
    banner.classList.remove('hidden');
  } else if (!state.detectedPlatform) {
    banner.className = 'mismatch-banner warn';
    banner.textContent = '⚠️ Unknown site — платформу поточного сайту не розпізнано';
    banner.classList.remove('hidden');
  } else if (state.detectedPlatform !== state.platform) {
    banner.className = 'mismatch-banner error';
    banner.textContent = `🔴 Невірна платформа\nВибрано: ${state.platform}\nПоточний сайт: ${state.detectedPlatform}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function siteOkForRun() {
  return !!state.siteHostname && !!state.detectedPlatform && state.detectedPlatform === state.platform;
}

// ============================================================
// Delivery / payment checkboxes
// ============================================================

function renderCheckboxes(container, items, groupName, checkedIds) {
  container.innerHTML = '';
  for (const item of items) {
    const wrap = el('label', 'check-item');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.group = groupName;
    input.value = String(item.id);
    input.checked = checkedIds ? checkedIds.includes(item.id) : true;
    wrap.appendChild(input);
    wrap.appendChild(el('span', null, item.label));
    container.appendChild(wrap);
  }
}

function renderPlatformOptions(savedDeliveries, savedPayments) {
  const meta = getAdapterMeta(state.platform);
  if (!meta) {
    $('#deliveryList').innerHTML = `<div class="hint">Платформа ${state.platform} ще не реалізована в цій версії.</div>`;
    $('#paymentList').innerHTML = '';
    $('#oneClickSection').classList.add('hidden');
    return;
  }
  renderCheckboxes($('#deliveryList'), meta.DELIVERY_METHODS, 'delivery', savedDeliveries);
  renderCheckboxes($('#paymentList'), meta.PAYMENT_METHODS, 'payment', savedPayments);

  // "1 клік" is UA-only business logic — only show the toggle when the adapter
  // actually implements it (see platforms/ua/ua-oneclick-*.js).
  const hasOneClick = !!(meta.ONECLICK_PRODUCTS && meta.ONECLICK_PRODUCTS.length);
  $('#oneClickSection').classList.toggle('hidden', !hasOneClick);
  if (!hasOneClick) {
    $('#oneClickEnabled').checked = false;
    $('#oneClickCountRow').classList.add('hidden');
  }
}

function getSelected(groupName) {
  return Array.from(document.querySelectorAll(`input[data-group="${groupName}"]:checked`)).map((elm) => {
    const v = elm.value;
    return isNaN(Number(v)) ? v : Number(v);
  });
}

document.querySelectorAll('input[name="platform"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    state.platform = e.target.value;
    renderPlatformOptions();
    renderConnectionBar();
    refreshValidation();
  });
});

document.querySelectorAll('.link-btn[data-select]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const group = btn.dataset.select;
    const checked = btn.dataset.value === 'all';
    document.querySelectorAll(`input[data-group="${group}"]`).forEach((elm) => {
      elm.checked = checked;
    });
    refreshValidation();
  });
});

$('#oneClickEnabled').addEventListener('change', (e) => {
  $('#oneClickCountRow').classList.toggle('hidden', !e.target.checked);
  refreshValidation();
});

['input', 'change'].forEach((evt) => {
  $('#phone').addEventListener(evt, refreshValidation);
  $('#count').addEventListener(evt, refreshValidation);
  $('#oneClickCount').addEventListener(evt, refreshValidation);
  $('#deliveryList').addEventListener(evt, refreshValidation);
  $('#paymentList').addEventListener(evt, refreshValidation);
});

// ============================================================
// Pre-run scenario summary
// ============================================================

function computeComboStats(deliveries, payments, isAllowed) {
  let validCombos = 0;
  for (const d of deliveries) {
    for (const p of payments) {
      if (!isAllowed || isAllowed(d, p).allowed) validCombos++;
    }
  }
  return { totalCombos: deliveries.length * payments.length, validCombos };
}

function updatePreRunSummary() {
  const box = $('#preRunSummary');
  const meta = getAdapterMeta(state.platform);
  const deliveries = getSelected('delivery');
  const payments = getSelected('payment');
  const count = parseInt($('#count').value, 10) || 0;
  const oneClickEnabled = $('#oneClickEnabled').checked;
  const oneClickCount = oneClickEnabled ? parseInt($('#oneClickCount').value, 10) || 0 : 0;

  if (!meta || (!deliveries.length && !oneClickCount)) {
    box.classList.add('hidden');
    return;
  }

  const stats = computeComboStats(deliveries, payments, meta.isCombinationAllowed);

  box.innerHTML = '';
  box.appendChild(el('div', 'prs-title', 'Сценарії'));
  if (count > 0) {
    box.appendChild(el('div', null, `Доставка: ${deliveries.length}`));
    box.appendChild(el('div', null, `Оплата: ${payments.length}`));
    box.appendChild(el('div', null, `Валідних комбінацій: ${stats.validCombos} з ${stats.totalCombos}`));
  }
  const totalLine = [];
  if (count > 0) totalLine.push(`${count} замовлень (кошик)`);
  if (oneClickCount > 0) totalLine.push(`${oneClickCount} замовлень "в 1 клік"`);
  box.appendChild(el('div', 'prs-total', `Буде створено: ${totalLine.join(' + ') || '0'}`));
  box.classList.remove('hidden');
}

// ============================================================
// Run validation
// ============================================================

function canRun() {
  if (!getAdapterMeta(state.platform)) {
    return { ok: false, reason: `Платформа ${state.platform} ще не реалізована в цій версії.` };
  }
  if (!siteOkForRun()) return { ok: false, reason: 'Невірний або невідомий сайт для вибраної платформи.' };

  const phone = $('#phone').value.trim();
  if (!phone) return { ok: false, reason: 'Вкажіть номер телефону.' };

  const count = parseInt($('#count').value, 10) || 0;
  const deliveries = getSelected('delivery');
  const payments = getSelected('payment');
  const oneClickEnabled = $('#oneClickEnabled').checked;
  const oneClickCount = oneClickEnabled ? parseInt($('#oneClickCount').value, 10) || 0 : 0;

  const cartRequested = count > 0;
  if (cartRequested && (!deliveries.length || !payments.length)) {
    return { ok: false, reason: 'Виберіть хоча б один спосіб доставки і оплати (або встановіть кількість 0).' };
  }
  if (!cartRequested && !oneClickCount) {
    return { ok: false, reason: 'Вкажіть кількість замовлень або увімкніть "Замовлення в 1 клік".' };
  }
  return { ok: true };
}

function refreshValidation() {
  if (state.phase !== 'INITIAL') return;
  updatePreRunSummary();
  const check = canRun();
  $('#runBtn').disabled = !check.ok;
  saveSettings();
}

// ============================================================
// Tab helpers
// ============================================================

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function preflightCheck(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      try {
        const res = await fetch('/api/v1/cart/?clear=0', { credentials: 'same-origin' });
        return { ok: res.status === 200, status: res.status };
      } catch (e) {
        return { ok: false, status: 0, error: String(e) };
      }
    },
  });
  return result;
}

async function injectEngine(tabId, platform) {
  const platformFiles =
    platform === 'UA'
      ? [
          'platforms/ua/ua-config.js',
          'platforms/ua/ua-products.js',
          'platforms/ua/ua-order-service.js',
          'platforms/ua/ua-oneclick-products.js',
          'platforms/ua/ua-oneclick-service.js',
        ]
      : ['platforms/pl/pl-config.js', 'platforms/pl/pl-products.js', 'platforms/pl/pl-order-service.js'];

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [...platformFiles, 'core/scenario-generator.js', 'core/smoke-runner.js'],
  });
}

async function checkAlreadyRunning(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ running: !!self.__smokeRunning, state: self.__smokeState || null }),
    });
    return result;
  } catch (e) {
    return { running: false, state: null };
  }
}

// ============================================================
// Run button / confirmation
// ============================================================

$('#runBtn').addEventListener('click', () => {
  const check = canRun();
  if (!check.ok) return alert(check.reason);

  const phone = $('#phone').value.trim();
  const count = parseInt($('#count').value, 10) || 0;
  const deliveries = getSelected('delivery');
  const payments = getSelected('payment');
  const oneClickEnabled = $('#oneClickEnabled').checked;
  const oneClickCount = oneClickEnabled ? parseInt($('#oneClickCount').value, 10) || 0 : 0;
  const cartRequested = count > 0;

  const parts = [];
  if (cartRequested) parts.push(`Замовлень: ${count}`);
  if (oneClickCount) parts.push(`"1 клік": ${oneClickCount} (~${oneClickCount} хв через ліміт сайту)`);

  $('#confirmText').textContent =
    `🚗 Запуск Smoke Test\n\n` +
    `Платформа: ${state.platform}\n` +
    `Сайт: ${state.siteHostname}\n` +
    `${parts.join('\n')}\n\n` +
    `Буде створено реальні тестові замовлення.\n\nПродовжити?`;
  $('#confirmOverlay').classList.remove('hidden');
  $('#confirmYes').onclick = () => {
    $('#confirmOverlay').classList.add('hidden');
    startRun({ phone, count: cartRequested ? count : 0, deliveries, payments, oneClickCount });
  };
  $('#confirmNo').onclick = () => $('#confirmOverlay').classList.add('hidden');
});

$('#stopBtn').addEventListener('click', async () => {
  if (state.tabId) chrome.tabs.sendMessage(state.tabId, { type: 'SMOKE_STOP' });
  $('#stopBtn').disabled = true;
  $('#progressStatusPill').textContent = '⏳ Зупинення...';
});

$('#newTestBtn').addEventListener('click', () => resetToInitial());

$('#copySummaryBtn').addEventListener('click', () => {
  const text = window.SmokeLogger.formatSummaryForCopy(state.platform, state.environment, state.results, state.stopped);
  navigator.clipboard.writeText(text);
  const btn = $('#copySummaryBtn');
  const original = btn.textContent;
  btn.textContent = '✅ Скопійовано';
  setTimeout(() => {
    btn.textContent = original;
  }, 1500);
});

$('#logToggle').addEventListener('click', () => {
  const log = $('#log');
  const collapsed = log.classList.toggle('hidden');
  $('#logToggle').textContent = collapsed ? 'Показати технічний лог ▾' : 'Сховати технічний лог ▴';
});

// ============================================================
// Run lifecycle
// ============================================================

function logLine(text, cls) {
  const line = el('div', 'log-line ' + (cls || ''), text);
  const log = $('#log');
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function enterRunningView(total, platform, environment) {
  state.phase = 'RUNNING';
  state.total = total;
  state.results = [];
  state.orderEntries = new Map();
  state.stopped = false;
  state.environment = environment;

  $('#settingsView').classList.add('hidden');
  $('#completedHeader').classList.add('hidden');
  $('#progressView').classList.remove('hidden');
  $('#orderList').classList.remove('hidden');
  $('#orderList').innerHTML = '';
  $('#logSection').classList.remove('hidden');
  $('#log').innerHTML = '';
  $('#log').classList.add('hidden');
  $('#logToggle').textContent = 'Показати технічний лог ▾';

  $('#footerRun').classList.remove('hidden');
  $('#footerCompleted').classList.add('hidden');
  $('#runBtn').disabled = true;
  $('#stopBtn').disabled = false;

  $('#progressStatusPill').className = 'status-pill running';
  $('#progressStatusPill').textContent = '🟢 RUNNING';
  $('#progressCount').textContent = `0 / ${total}`;
  $('#progressBarFill').style.width = '0%';
  $('#currentOrderBox').classList.add('hidden');

  $('#headerStatus').classList.remove('hidden');
  $('#headerStatus').textContent = `${platform === 'UA' ? '🇺🇦' : '🇵🇱'} ${platform} · RUNNING`;
}

function updateProgress(index, total) {
  $('#progressCount').textContent = `${index} / ${total}`;
  $('#progressBarFill').style.width = Math.round((index / total) * 100) + '%';
}

function statusIcon(status) {
  return { running: '⏳', passed: '✅', failed: '❌', skipped: '⚠️' }[status] || '•';
}

function statusLabel(status) {
  return { running: 'Running', passed: 'Passed', failed: 'Failed', skipped: 'Skipped' }[status] || status;
}

function renderOrderItem(entry) {
  const existing = document.getElementById('order-' + entry.index);
  const item = el('div', `order-item ${entry.status}`);
  item.id = 'order-' + entry.index;

  const top = el('div', 'oi-top');
  top.appendChild(el('span', null, `${statusIcon(entry.status)} #${entry.index}`));
  top.appendChild(el('span', null, statusLabel(entry.status)));
  item.appendChild(top);

  item.appendChild(el('div', 'oi-meta', `${entry.deliveryLabel} + ${entry.paymentLabel}`));

  if (entry.productLabel) item.appendChild(el('div', 'oi-extra', `Product: ${entry.productLabel}`));

  if (entry.status === 'passed') {
    item.appendChild(el('div', 'oi-extra', window.SmokeLogger.formatOrderId(entry.orderId)));
  } else if (entry.status === 'failed') {
    item.appendChild(el('div', 'oi-extra', entry.error || 'Помилка'));
  } else if (entry.status === 'skipped') {
    item.appendChild(el('div', 'oi-extra', entry.reason || 'Пропущено'));
  } else if (entry.status === 'running') {
    item.appendChild(el('div', 'oi-extra', entry.step || 'Виконується...'));
  }

  if (entry.raw) {
    const toggle = el('button', 'link-btn oi-details-toggle', 'Details ▾');
    toggle.type = 'button';
    const details = el('pre', 'oi-details hidden');
    let rawText;
    try {
      rawText = JSON.stringify(entry.raw, null, 2);
    } catch (e) {
      rawText = String(entry.raw);
    }
    details.textContent = rawText;
    toggle.addEventListener('click', () => {
      const collapsed = details.classList.toggle('hidden');
      toggle.textContent = collapsed ? 'Details ▾' : 'Details ▴';
    });
    item.appendChild(toggle);
    item.appendChild(details);
  }

  if (existing) existing.replaceWith(item);
  else $('#orderList').appendChild(item);
}

function updateCurrentOrderBox(payload) {
  $('#currentOrderBox').classList.remove('hidden');
  $('#currentOrderTitle').textContent = `#${payload.index}`;
  $('#currentOrderMeta').textContent = `${payload.deliveryLabel} + ${payload.paymentLabel}`;
  $('#currentOrderStep').textContent = '⏳ Creating order...';
}

function handleRunnerMessage(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === 'SMOKE_START') {
    state.total = msg.payload.total;
    updateProgress(0, state.total);
  } else if (msg.type === 'SMOKE_ORDER_START') {
    const entry = {
      index: msg.payload.index,
      status: 'running',
      deliveryLabel: msg.payload.deliveryLabel,
      paymentLabel: msg.payload.paymentLabel,
      productLabel: msg.payload.productLabel,
      step: '⏳ Creating order...',
    };
    state.orderEntries.set(entry.index, entry);
    renderOrderItem(entry);
    updateCurrentOrderBox(msg.payload);
    updateProgress(msg.payload.index, msg.payload.total);
    logLine(`[${msg.payload.index}/${msg.payload.total}] ${msg.payload.deliveryLabel} + ${msg.payload.paymentLabel}`, 'title');
  } else if (msg.type === 'SMOKE_LOG') {
    const icon = msg.payload.level === 'ok' ? '✅' : msg.payload.level === 'warn' ? '⚠️' : '⏳';
    logLine(`${icon} ${msg.payload.text}`);
    const box = $('#currentOrderBox');
    if (!box.classList.contains('hidden')) $('#currentOrderStep').textContent = `${icon} ${msg.payload.text}`;
  } else if (msg.type === 'SMOKE_ORDER_RESULT') {
    const r = msg.payload;
    const entry = { ...(state.orderEntries.get(r.index) || {}), ...r };
    state.orderEntries.set(r.index, entry);
    state.results.push(entry);
    renderOrderItem(entry);
    if (entry.status === 'passed') logLine(`✅ ${window.SmokeLogger.formatOrderId(entry.orderId)}`, 'pass');
    else if (entry.status === 'failed') logLine(`❌ Failed — ${entry.error}`, 'fail');
    else logLine(`⚠️ Skipped — ${entry.reason}`, 'skip');
  } else if (msg.type === 'SMOKE_DONE') {
    finishRun(!!(msg.payload && msg.payload.stopped));
  } else if (msg.type === 'SMOKE_FATAL') {
    logLine('❌ ' + msg.payload.error, 'fail');
    finishRun(true, msg.payload.error);
  }
}

async function startRun(config) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return alert('Не вдалося визначити активну вкладку');
  state.tabId = tab.id;

  let pre;
  try {
    pre = await preflightCheck(tab.id);
  } catch (e) {
    pre = { ok: false };
  }
  if (!pre || !pre.ok) {
    alert(`Не вдалося підтвердити сесію на цій вкладці. Переконайтесь, що ви авторизовані на сайті ${state.platform}.`);
    return;
  }

  try {
    await injectEngine(tab.id, state.platform);
  } catch (e) {
    alert('Не вдалося запустити engine: ' + String(e));
    return;
  }

  state.lastConfig = config;
  state.startTime = Date.now();
  enterRunningView(config.count + config.oneClickCount, state.platform, state.siteHostname);

  state.listener = (msg) => handleRunnerMessage(msg);
  chrome.runtime.onMessage.addListener(state.listener);

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (cfg) => {
      self.SmokeCore.runSmokeTest(cfg);
    },
    args: [{ platform: state.platform, ...config }],
  });
}

function finishRun(stopped, fatalError) {
  if (state.listener) {
    chrome.runtime.onMessage.removeListener(state.listener);
    state.listener = null;
  }
  state.phase = 'COMPLETED';
  state.stopped = stopped;

  const durationSec = Math.round((Date.now() - state.startTime) / 1000);
  const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const ss = String(durationSec % 60).padStart(2, '0');

  const passed = state.results.filter((r) => r.status === 'passed').length;
  const failed = state.results.filter((r) => r.status === 'failed').length;
  const skipped = state.results.filter((r) => r.status === 'skipped').length;
  const notRun = Math.max(0, state.total - state.results.length);

  $('#progressView').classList.add('hidden');
  $('#logSection').classList.remove('hidden');
  $('#footerRun').classList.add('hidden');
  $('#footerCompleted').classList.remove('hidden');
  $('#copySummaryBtn').disabled = state.results.length === 0;

  const header = $('#completedHeader');
  header.innerHTML = '';
  const top = el('div', 'ch-top');
  top.appendChild(el('span', null, `${state.platform === 'UA' ? '🇺🇦' : '🇵🇱'} ${state.platform}`));
  top.appendChild(el('span', `status-pill ${stopped ? 'stopped' : 'completed'}`, stopped ? '⚠️ STOPPED' : '🟢 Completed'));
  header.appendChild(top);

  header.appendChild(
    el('div', 'ch-big', stopped ? `${state.results.length} / ${state.total} виконано` : `${passed} / ${state.total} PASSED`)
  );

  const stats = el('div', 'ch-stats');
  stats.appendChild(el('span', 'pass', `✅ ${passed}`));
  stats.appendChild(el('span', 'fail', `❌ ${failed}`));
  stats.appendChild(el('span', 'skip', `⚠️ ${skipped}`));
  if (stopped && notRun > 0) stats.appendChild(el('span', 'notrun', `⏹ ${notRun}`));
  header.appendChild(stats);

  header.appendChild(el('div', 'ch-duration', `Duration: ${mm}:${ss}`));
  if (fatalError) header.appendChild(el('div', 'ch-duration', `Причина зупинки: ${fatalError}`));

  header.classList.remove('hidden');

  $('#headerStatus').textContent = `${state.platform === 'UA' ? '🇺🇦' : '🇵🇱'} ${state.platform} · ${
    stopped ? 'STOPPED' : 'Completed'
  }`;
}

function resetToInitial() {
  state.phase = 'INITIAL';
  state.results = [];
  state.orderEntries = new Map();
  state.stopped = false;

  $('#settingsView').classList.remove('hidden');
  $('#progressView').classList.add('hidden');
  $('#completedHeader').classList.add('hidden');
  $('#orderList').classList.add('hidden');
  $('#orderList').innerHTML = '';
  $('#logSection').classList.add('hidden');
  $('#log').innerHTML = '';

  $('#footerRun').classList.remove('hidden');
  $('#footerCompleted').classList.add('hidden');
  $('#stopBtn').disabled = true;

  $('#headerStatus').classList.add('hidden');

  detectSite().then(() => {
    renderConnectionBar();
    refreshValidation();
  });
}

// ============================================================
// Reconnect: if a run is already active in the tab (popup was closed
// mid-run), resume listening instead of letting QA start a duplicate.
// ============================================================

async function tryReconnect(tabId) {
  const check = await checkAlreadyRunning(tabId);
  if (!check.running || !check.state) return false;

  const s = check.state;
  if (state.platform !== s.platform) {
    state.platform = s.platform;
    const radio = document.querySelector(`input[name="platform"][value="${s.platform}"]`);
    if (radio) radio.checked = true;
    renderPlatformOptions();
  }

  state.phase = 'RUNNING';
  state.total = s.total;
  state.startTime = s.startTime;
  state.results = s.results || [];
  state.orderEntries = new Map();
  state.environment = state.siteHostname;

  enterRunningView(s.total, s.platform, state.siteHostname);
  logLine('🔄 Реконект до активного тесту (прогрес до цього моменту відновлено)', 'title');

  for (const r of state.results) {
    state.orderEntries.set(r.index, r);
    renderOrderItem(r);
  }
  if (state.results.length) updateProgress(state.results[state.results.length - 1].index, s.total);

  state.listener = (msg) => handleRunnerMessage(msg);
  chrome.runtime.onMessage.addListener(state.listener);
  return true;
}

// ============================================================
// Init
// ============================================================

async function init() {
  await detectSite();
  // Auto-detected site takes priority over any remembered platform — it prevents
  // starting a run against the wrong environment by default.
  if (state.detectedPlatform) state.platform = state.detectedPlatform;

  // Render the settings panel with sane defaults FIRST, independent of storage —
  // a storage failure (e.g. extension not fully reloaded after a permission
  // change) must never leave the popup showing empty delivery/payment lists.
  document.querySelector(`input[name="platform"][value="${state.platform}"]`).checked = true;
  renderPlatformOptions();
  renderConnectionBar();
  refreshValidation();

  // Restoring remembered form values is a nice-to-have on top of that baseline —
  // any failure here is caught and ignored rather than blocking the UI above.
  try {
    const saved = await loadSettings();
    if (!state.detectedPlatform && saved.platform && (saved.platform === 'UA' || saved.platform === 'PL')) {
      state.platform = saved.platform;
      document.querySelector(`input[name="platform"][value="${state.platform}"]`).checked = true;
    }
    renderPlatformOptions(saved.deliveries, saved.payments);

    if (saved.phone) $('#phone').value = saved.phone;
    if (saved.count != null) $('#count').value = saved.count;
    if (saved.oneClickEnabled) {
      $('#oneClickEnabled').checked = true;
      $('#oneClickCountRow').classList.remove('hidden');
    }
    if (saved.oneClickCount != null) $('#oneClickCount').value = saved.oneClickCount;

    refreshValidation();
  } catch (e) {
    console.warn('Не вдалося відновити збережені налаштування:', e);
  }

  if (state.tabId) {
    try {
      await tryReconnect(state.tabId);
    } catch (e) {
      console.warn('Reconnect до активного тесту не вдався:', e);
    }
  }
}

init().catch((e) => console.error('Popup init failed:', e));
