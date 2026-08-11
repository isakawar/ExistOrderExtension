/**
 * PL Order Smoke Test — standalone console script (no extension install needed)
 * ===============================================================================
 *
 * Same business logic as the "Exist Order Creator" Chrome extension
 * (platforms/pl/*.js), just flattened into one paste-and-run file for anyone
 * who doesn't want to install the extension.
 *
 * HOW TO USE
 * 1. Open the PL site (stagingpl.exist.ua), log in as usual.
 * 2. Open DevTools (F12 or Cmd+Option+I) → Console tab.
 * 3. Edit the CONFIG block right below — phone, how many orders, which
 *    delivery/payment methods to test.
 * 4. Paste this WHOLE file into the console and press Enter.
 * 5. Watch progress logs; a copy-paste-ready summary prints at the end.
 *
 * To stop a run early, type in the console:  window.__plSmokeStop = true
 *
 * NOTE: 2 of PL's 9 delivery options are NOT supported here (same as the
 * extension) — "Почтомат или Пункт выдачи" and "В отделение или почтомат
 * Nova Post" both require picking a specific locker/point id via a lookup
 * API that isn't wired up; submitting them with just a plain address 500s.
 */
(async function () {
  // ============================================================
  // ==================  CONFIG — EDIT THIS  ===================
  // ============================================================
  const CONFIG_INPUT = {
    PHONE: '+380666746222',
    COUNT: 10, // how many orders to create

    // Pick which delivery ids to test. Comment out / remove lines you don't want.
    DELIVERIES: [
      'office', // Самовывоз из автомагазина
      'exist_paid_courier', // Курьер, оплата при получении
      'inpost_paczkomat', // Курьер, оплаченный заказ
      'dhl_courier', // DHL доставка в Германию
      'dhl_international', // По Европе DHL или DPD
      'fedex', // Международная доставка за пределы ЕС
      'nova_post_global_address', // Курьер Nova Post
    ],

    // Pick which payment ids to test.
    PAYMENTS: [
      6, // Оплата при получении (самовывоз)
      5, // Оплата при получении (курьер)
      182, // Оплата с баланса
      39, // Оплата картой
      115, // PayPal
      215, // PayPal Expanded
    ],
  };
  // ============================================================
  // ================  END OF CONFIG — DO NOT EDIT BELOW  =======
  // ============================================================

  // ---- pl-config.js -------------------------------------------------------
  const STORE = {
    OFFICE_ID: 1, // Warszawa Reguły
    ADDRESS_TEXT: 'Warszawa, Testowa 1',
    CONTACT_FULL_NAME: 'QA Smoke Test',
    CONTACT_EMAIL: 'isakawar1@gmail.com',
  };

  const DELIVERY_METHODS = [
    { id: 'office', label: 'Самовывоз из автомагазина' },
    { id: 'exist_paid_courier', label: 'Курьер, оплата при получении' },
    { id: 'inpost_paczkomat', label: 'Курьер, оплаченный заказ' },
    { id: 'dhl_courier', label: 'DHL доставка в Германию' },
    { id: 'dhl_international', label: 'По Европе DHL или DPD' },
    { id: 'fedex', label: 'Международная доставка за пределы ЕС' },
    { id: 'nova_post_global_address', label: 'Курьер Nova Post' },
  ];

  const PAYMENT_METHODS = [
    { id: 6, label: 'Оплата при получении (самовывоз)' },
    { id: 5, label: 'Оплата при получении (курьер)' },
    { id: 182, label: 'Оплата с баланса' },
    { id: 39, label: 'Оплата картой' },
    { id: 115, label: 'PayPal' },
    { id: 215, label: 'PayPal Expanded' },
  ];

  // Exact per-delivery payment sets, pulled live from
  // GET /api/v1/cart/checkout/?delivery=<slug>&office_id=<id> on stagingpl.exist.ua.
  const DELIVERY_PAYMENTS = {
    office: [6, 182],
    exist_paid_courier: [5],
    inpost_paczkomat: [182],
    dhl_courier: [115],
    dhl_international: [215, 39, 182, 115],
    fedex: [215, 115],
    nova_post_global_address: [39, 182],
  };

  function isCombinationAllowed(deliveryId, paymentId) {
    const allowed = DELIVERY_PAYMENTS[deliveryId] || [];
    if (!allowed.includes(paymentId)) {
      return { allowed: false, reason: 'Цей спосіб оплати недоступний для обраної доставки на PL' };
    }
    return { allowed: true };
  }

  // ---- pl-products.js ------------------------------------------------------
  const SEARCH_TERMS = [
    'подушка двигателя', 'ступица колеса', 'подшипник ступицы', 'рулевая тяга',
    'наконечник рулевой тяги', 'сайлентблок', 'глушитель', 'катализатор',
    'радиатор кондиционера', 'компрессор кондиционера', 'помпа водяная', 'термостат',
    'датчик коленвала', 'датчик распредвала', 'катушка зажигания', 'провода зажигания',
    'сцепление комплект', 'маховик', 'шрус наружный', 'пыльник шруса',
    'амортизатор багажника', 'радиатор печки', 'патрубок радиатора', 'клапан egr',
    'турбина', 'форсунка топливная', 'бензонасос', 'генератор', 'реле стартера',
    'подушка коробки передач',
  ];
  const PRODUCTS = SEARCH_TERMS.map((term) => ({ searchTerm: term, trademark: 'Пошук:', ware_num: term }));

  // ---- pl-order-service.js -------------------------------------------------
  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

  async function api(path, method, body) {
    const csrf = getCookie('csrftoken');
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* not all responses are JSON */
    }
    return { status: res.status, data };
  }

  async function clearCart() {
    const { data } = await api('/api/v1/cart/?clear=0', 'GET');
    if (!data || !data.items) return;
    for (const item of data.items) await api('/api/v1/cart/delete/' + item.id + '/', 'DELETE');
  }

  async function resolveProduct(searchTerm) {
    const searchRes = await fetch('/api/v1/fulltext/search-v2/?query=' + encodeURIComponent(searchTerm) + '&short=true', {
      credentials: 'same-origin',
    });
    const searchData = await searchRes.json();
    const category = searchData.result && searchData.result.categories && searchData.result.categories[0];
    if (!category) return null;

    const indexRes = await fetch(
      '/api/v1/catalogue/product-index/?page=1&slug=' + encodeURIComponent(category.slug) + '&with_categories=true',
      { credentials: 'same-origin' }
    );
    const indexData = await indexRes.json();
    const results = (indexData.data && indexData.data.results) || [];
    const found = results.find((p) => p.price && p.price.price_id && p.price.quantity > 0);
    if (!found) return null;

    return {
      product: found.id,
      trademark: found.trademark && found.trademark.description,
      ware_num: found.upc,
      prag_price_id: found.price.price_id,
    };
  }

  async function addToCart(p) {
    return api('/api/v1/cart/add/', 'POST', {
      product: p.product,
      quantity: 1,
      request_trademark: p.trademark,
      request_ware_num: p.ware_num,
      cart_block: 12,
      prag_price_id: p.prag_price_id,
    });
  }

  async function submitOrder(cfg, phone) {
    const body = {
      delivery: cfg.delivery,
      deliveryDescription: cfg.deliveryDescription,
      payment: cfg.payment,
      office_id: STORE.OFFICE_ID,
      contact_phone: phone,
      contact_full_name: STORE.CONTACT_FULL_NAME,
      contact_email: STORE.CONTACT_EMAIL,
    };
    if (cfg.delivery !== 'office') {
      body.address = STORE.ADDRESS_TEXT;
      body.delivery_info = STORE.ADDRESS_TEXT;
    }
    return api('/api/v1/cart/checkout/add/', 'POST', body);
  }

  async function fetchOrderId() {
    const { data } = await api('/api/v1/cart/checkout/success/', 'GET');
    const orders = Array.isArray(data && data.orders) ? data.orders : [data && data.orders];
    const entry = orders[0];
    const ordersData = entry && entry.orders_data;
    const first = Array.isArray(ordersData) ? ordersData[0] : ordersData;
    return first ? { orderId: first.order_id, raw: first } : { orderId: null, raw: data };
  }

  async function runScenario(scenario, phone) {
    log('step', 'Searching product ("' + scenario.product.searchTerm + '")...');
    await clearCart();
    const resolved = await resolveProduct(scenario.product.searchTerm);
    if (!resolved) {
      return { ok: false, error: 'No purchasable product found for search "' + scenario.product.searchTerm + '"' };
    }
    log('ok', 'Found ' + (resolved.trademark || '') + ' ' + resolved.ware_num);

    log('step', 'Adding product...');
    const add = await addToCart(resolved);
    if (add.status !== 200 && add.status !== 201) {
      return { ok: false, error: 'HTTP ' + add.status + ' (cart/add)', raw: add.data };
    }
    log('ok', 'Product added');

    const deliveryMeta = DELIVERY_METHODS.find((d) => d.id === scenario.delivery);
    log('step', 'Creating order...');
    const result = await submitOrder(
      { delivery: scenario.delivery, deliveryDescription: (deliveryMeta && deliveryMeta.label) || scenario.delivery, payment: scenario.payment },
      phone
    );
    if (result.status !== 200 && result.status !== 201) {
      return { ok: false, error: 'HTTP ' + result.status + ' (checkout/add)', raw: result.data };
    }

    const { orderId } = await fetchOrderId();
    return { ok: true, orderId: orderId || 'created' };
  }

  // ---- core/scenario-generator.js ------------------------------------------
  function generateScenarios({ deliveries, payments, products, count }) {
    const validCombos = [];
    for (const delivery of deliveries) {
      for (const payment of payments) {
        if (isCombinationAllowed(delivery, payment).allowed) validCombos.push({ delivery, payment });
      }
    }
    const scenarios = [];
    if (validCombos.length === 0) return scenarios;
    for (let i = 0; i < count; i++) {
      const combo = validCombos[i % validCombos.length];
      const product = products.length ? products[i % products.length] : null;
      scenarios.push({ ...combo, product, index: i + 1 });
    }
    return scenarios;
  }

  // ---- console logging + summary -------------------------------------------
  const results = [];
  function log(level, text) {
    const icon = { step: '⏳', ok: '✅', warn: '⚠️', fail: '❌', title: '🚗' }[level] || '·';
    console.log(icon, text);
  }

  function labelOf(list, id) {
    const found = list.find((x) => x.id === id);
    return found ? found.label : String(id);
  }

  function printSummary(startTime) {
    const passed = results.filter((r) => r.status === 'passed');
    const failed = results.filter((r) => r.status === 'failed');
    const durationSec = Math.round((Date.now() - startTime) / 1000);

    console.log('\n================================\n');
    console.log(`Smoke Test completed (PL)`);
    console.log(`Total: ${results.length}`);
    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`Duration: ${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`);
    console.log('\n================================\n');

    let text = `Order Smoke Test — PL\n\nTotal: ${results.length}\nPassed: ${passed.length}\nFailed: ${failed.length}\n`;
    if (failed.length) {
      text += `\nFailed:\n`;
      for (const f of failed) text += `- #${f.index} ${f.deliveryLabel} + ${f.paymentLabel} — ${f.error}\n`;
    }
    if (passed.length) {
      text += `\nCreated orders:\n`;
      for (const p of passed) text += `#${p.orderId}\n`;
    }
    console.log(text);
    window.__plSmokeSummary = text;
    console.log('👉 Копія summary збережена в window.__plSmokeSummary — можна виконати copy(window.__plSmokeSummary)');
  }

  // ---- main run --------------------------------------------------------
  window.__plSmokeStop = false;
  const startTime = Date.now();
  log('title', 'PL Smoke Test started');

  const scenarios = generateScenarios({
    deliveries: CONFIG_INPUT.DELIVERIES,
    payments: CONFIG_INPUT.PAYMENTS,
    products: PRODUCTS,
    count: CONFIG_INPUT.COUNT,
  });

  if (!scenarios.length) {
    console.error('❌ Жодної валідної комбінації доставки/оплати — перевірте CONFIG.DELIVERIES/PAYMENTS');
    return;
  }

  for (const scenario of scenarios) {
    if (window.__plSmokeStop) {
      log('warn', 'Зупинено (window.__plSmokeStop = true)');
      break;
    }
    const deliveryLabel = labelOf(DELIVERY_METHODS, scenario.delivery);
    const paymentLabel = labelOf(PAYMENT_METHODS, scenario.payment);
    console.log(`\n[${scenario.index}/${scenarios.length}] ${deliveryLabel} + ${paymentLabel}`);

    try {
      const outcome = await runScenario(scenario, CONFIG_INPUT.PHONE);
      if (outcome.ok) {
        log('ok', `Order created: #${outcome.orderId}`);
        results.push({ index: scenario.index, status: 'passed', deliveryLabel, paymentLabel, orderId: outcome.orderId });
      } else {
        log('fail', `Failed — ${outcome.error}`);
        results.push({ index: scenario.index, status: 'failed', deliveryLabel, paymentLabel, error: outcome.error });
      }
    } catch (e) {
      log('fail', 'Failed — ' + String((e && e.message) || e));
      results.push({ index: scenario.index, status: 'failed', deliveryLabel, paymentLabel, error: String(e) });
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  printSummary(startTime);
})();
