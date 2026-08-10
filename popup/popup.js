const $ = (sel) => document.querySelector(sel);

const state = {
  platform: 'UA',
  running: false,
  results: [],
  listener: null,
  startTime: 0,
};

// Only UA is wired up today; PL will register window.SmokePL once its adapter lands.
function getAdapterMeta(platform) {
  return platform === 'UA' ? window.SmokeUA : window.SmokePL;
}

function renderCheckboxes(container, items, groupName) {
  container.innerHTML = '';
  for (const item of items) {
    const wrap = document.createElement('label');
    wrap.className = 'check-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.group = groupName;
    input.value = String(item.id);
    input.checked = true;
    const span = document.createElement('span');
    span.textContent = item.label;
    wrap.appendChild(input);
    wrap.appendChild(span);
    container.appendChild(wrap);
  }
}

function renderPlatformOptions() {
  const meta = getAdapterMeta(state.platform);
  if (!meta) {
    $('#deliveryList').innerHTML = '<div class="hint">Платформа PL ще не реалізована в цій версії.</div>';
    $('#paymentList').innerHTML = '';
    return;
  }
  renderCheckboxes($('#deliveryList'), meta.DELIVERY_METHODS, 'delivery');
  renderCheckboxes($('#paymentList'), meta.PAYMENT_METHODS, 'payment');
}

document.querySelectorAll('input[name="platform"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    state.platform = e.target.value;
    renderPlatformOptions();
  });
});

document.querySelectorAll('.link-btn[data-select]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const group = btn.dataset.select;
    const checked = btn.dataset.value === 'all';
    document.querySelectorAll(`input[data-group="${group}"]`).forEach((el) => {
      el.checked = checked;
    });
  });
});

$('#oneClickEnabled').addEventListener('change', (e) => {
  $('#oneClickCountRow').classList.toggle('hidden', !e.target.checked);
});

function getSelected(groupName) {
  return Array.from(document.querySelectorAll(`input[data-group="${groupName}"]:checked`)).map((el) => {
    const v = el.value;
    return isNaN(Number(v)) ? v : Number(v);
  });
}

function logLine(text, cls) {
  const el = document.createElement('div');
  el.className = 'log-line ' + (cls || '');
  el.textContent = text;
  const log = $('#log');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function formatOrderId(orderId) {
  const looksLikeId = /^[\w-]+$/.test(String(orderId)) && !String(orderId).includes(' ');
  return looksLikeId ? `Order created: #${orderId}` : `Order created: ${orderId}`;
}

function clearLog() {
  $('#log').innerHTML = '';
}

function setRunning(running) {
  state.running = running;
  $('#runBtn').disabled = running;
  $('#stopBtn').disabled = !running;
  $('#confirmOverlay').classList.add('hidden');
}

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

$('#runBtn').addEventListener('click', () => {
  const phone = $('#phone').value.trim();
  const count = parseInt($('#count').value, 10) || 0;
  const deliveries = getSelected('delivery');
  const payments = getSelected('payment');
  const oneClickEnabled = $('#oneClickEnabled').checked;
  const oneClickCount = oneClickEnabled ? parseInt($('#oneClickCount').value, 10) || 0 : 0;

  if (state.platform !== 'UA') {
    alert('Платформа PL ще не реалізована в цій версії.');
    return;
  }
  if (!phone) return alert('Вкажіть номер телефону');

  const cartRequested = count > 0;
  if (cartRequested && (!deliveries.length || !payments.length)) {
    return alert('Виберіть хоча б один спосіб доставки і оплати (або встановіть кількість замовлень 0)');
  }
  if (!cartRequested && !oneClickCount) {
    return alert('Вкажіть кількість замовлень або увімкніть "Замовлення в 1 клік"');
  }

  const parts = [];
  if (cartRequested) parts.push(`${count} замовлень (кошик)`);
  if (oneClickCount) parts.push(`${oneClickCount} замовлень "в 1 клік" (~${oneClickCount} хв через ліміт сайту)`);

  $('#confirmText').textContent = `Ви збираєтесь створити на ${state.platform}:\n${parts.join('\n')}\n\nПродовжити?`;
  $('#confirmOverlay').classList.remove('hidden');
  $('#confirmYes').onclick = () =>
    startRun({ phone, count: cartRequested ? count : 0, deliveries, payments, oneClickCount });
  $('#confirmNo').onclick = () => $('#confirmOverlay').classList.add('hidden');
});

$('#stopBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SMOKE_STOP' });
});

$('#copySummaryBtn').addEventListener('click', () => {
  const text = window.SmokeLogger.formatSummaryForCopy(state.platform, state.results);
  navigator.clipboard.writeText(text);
  const btn = $('#copySummaryBtn');
  const original = btn.textContent;
  btn.textContent = '✅ Скопійовано';
  setTimeout(() => {
    btn.textContent = original;
  }, 1500);
});

async function startRun(config) {
  clearLog();
  $('#summary').classList.add('hidden');
  $('#copySummaryBtn').classList.add('hidden');
  state.results = [];
  setRunning(true);
  logLine('🚀 Smoke Test started', 'title');

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    logLine('❌ Не вдалося визначити активну вкладку', 'fail');
    setRunning(false);
    return;
  }

  let pre;
  try {
    pre = await preflightCheck(tab.id);
  } catch (e) {
    pre = { ok: false, error: String(e) };
  }
  if (!pre || !pre.ok) {
    logLine(
      `❌ Не вдалося підтвердити сесію на цій вкладці. Переконайтесь, що ви авторизовані та знаходитесь на сайті ${state.platform}.`,
      'fail'
    );
    setRunning(false);
    return;
  }

  try {
    await injectEngine(tab.id, state.platform);
  } catch (e) {
    logLine('❌ Не вдалося запустити engine: ' + String(e), 'fail');
    setRunning(false);
    return;
  }

  state.startTime = Date.now();

  const listener = (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'SMOKE_START') {
      logLine(`Всього сценаріїв: ${msg.payload.total}`, 'hint');
    } else if (msg.type === 'SMOKE_ORDER_START') {
      logLine('────────────────────────', 'sep');
      logLine(`[${msg.payload.index}/${msg.payload.total}] Створення замовлення`, 'title');
      logLine(`Product: ${msg.payload.productLabel}`);
      logLine(`Delivery: ${msg.payload.deliveryLabel}`);
      logLine(`Payment: ${msg.payload.paymentLabel}`);
    } else if (msg.type === 'SMOKE_LOG') {
      const icon = msg.payload.level === 'ok' ? '✅' : msg.payload.level === 'warn' ? '⚠️' : '⏳';
      logLine(`${icon} ${msg.payload.text}`);
    } else if (msg.type === 'SMOKE_ORDER_RESULT') {
      const r = msg.payload;
      state.results.push(r);
      if (r.status === 'passed') logLine(`✅ ${formatOrderId(r.orderId)}`, 'pass');
      else if (r.status === 'failed') logLine(`❌ Failed — ${r.error}`, 'fail');
      else logLine(`⚠️ Skipped — ${r.reason}`, 'skip');
    } else if (msg.type === 'SMOKE_DONE') {
      finishRun();
    } else if (msg.type === 'SMOKE_FATAL') {
      logLine('❌ ' + msg.payload.error, 'fail');
      setRunning(false);
      chrome.runtime.onMessage.removeListener(state.listener);
    }
  };
  state.listener = listener;
  chrome.runtime.onMessage.addListener(listener);

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (cfg) => {
      self.SmokeCore.runSmokeTest(cfg);
    },
    args: [{ platform: state.platform, ...config }],
  });
}

function finishRun() {
  if (state.listener) chrome.runtime.onMessage.removeListener(state.listener);
  setRunning(false);

  const durationSec = Math.round((Date.now() - state.startTime) / 1000);
  $('#summary').innerHTML = window.SmokeLogger.buildSummaryHtml(state.platform, state.results, durationSec);
  $('#summary').classList.remove('hidden');
  if (state.results.length) $('#copySummaryBtn').classList.remove('hidden');
  logLine('=== Готово! ===', 'title');
}

renderPlatformOptions();
