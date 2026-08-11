/**
 * UA Order Smoke Test — standalone console script (no extension install needed)
 * =============================================================================
 *
 * Same business logic as the "Exist Order Creator" Chrome extension
 * (platforms/ua/*.js), just flattened into one paste-and-run file for anyone
 * who doesn't want to install the extension.
 *
 * HOW TO USE
 * 1. Open the UA site (e.g. staging.exist.ua), log in as usual.
 * 2. Open DevTools (F12 or Cmd+Option+I) → Console tab.
 * 3. Edit the CONFIG block right below — phone, how many orders, which
 *    delivery/payment methods to test.
 * 4. Paste this WHOLE file into the console and press Enter.
 * 5. Watch progress logs; a copy-paste-ready summary prints at the end.
 *
 * To stop a run early, type in the console:  window.__uaSmokeStop = true
 */
(async function () {
  // ============================================================
  // ==================  CONFIG — EDIT THIS  ===================
  // ============================================================
  const CONFIG_INPUT = {
    PHONE: '+380666746222',
    COUNT: 10, // how many cart-based orders to create (0 to skip and only run one-click)

    // Pick which delivery ids to test. Comment out / remove lines you don't want.
    DELIVERIES: [
      'office', // Самовивіз
      'nova_pochta', // Нова Пошта — відділення
      'nova_pochta_postomat', // Нова Пошта — поштомат
      'ukrpochta', // Укрпошта
      'exist_courier', // Кур'єр
      'exist_paid_courier', // Платний кур'єр
    ],

    // Pick which payment ids to test.
    PAYMENTS: [
      5, // Готівка
      6, // Наложний платіж
      175, // Plata by mono
      177, // Mono розстрочка
      178, // Privat розстрочка
      1, // LiqPay
      72, // Баланс
      2, // Portmone
    ],

    // "Order in 1 click" — separate flow, no delivery/payment choice.
    ONE_CLICK_ENABLED: false,
    ONE_CLICK_COUNT: 1, // each one takes ~60s (site throttles to 1/min per phone)
  };
  // ============================================================
  // ================  END OF CONFIG — DO NOT EDIT BELOW  =======
  // ============================================================

  // ---- ua-config.js -----------------------------------------------------
  const STORE = {
    CITY_ID_NP: 1364, // Київ
    OFFICE_ID_SHIP: 34,
    OFFICE_ID_PICKUP: 8, // Київ, Нивки
    ADDRESS_TEXT: 'Київ, вулиця Хрещатик, 1',
  };

  const DELIVERY_METHODS = [
    { id: 'office', label: 'Самовивіз' },
    { id: 'nova_pochta', label: 'Нова Пошта — відділення' },
    { id: 'nova_pochta_postomat', label: 'Нова Пошта — поштомат' },
    { id: 'ukrpochta', label: 'Укрпошта' },
    { id: 'exist_courier', label: "Кур'єр" },
    { id: 'exist_paid_courier', label: "Платний кур'єр" },
  ];

  const PAYMENT_METHODS = [
    { id: 5, label: 'Готівка', cashLike: true },
    { id: 6, label: 'Наложний платіж', cashLike: true },
    { id: 175, label: 'Plata by mono' },
    { id: 177, label: 'Mono розстрочка', installment: true },
    { id: 178, label: 'Privat розстрочка', installment: true },
    { id: 1, label: 'LiqPay' },
    { id: 72, label: 'Баланс' },
    { id: 2, label: 'Portmone' },
  ];

  function isCombinationAllowed(deliveryId, paymentId) {
    const payment = PAYMENT_METHODS.find((p) => p.id === paymentId);
    if (deliveryId === 'exist_paid_courier' && payment && payment.cashLike) {
      return { allowed: false, reason: "Платний кур'єр не підтримує готівкові способи оплати" };
    }
    return { allowed: true };
  }

  // ---- ua-products.js -----------------------------------------------------
  const PRODUCTS = [
    { key: 'abe', product: 10415187, trademark: 'ABE', ware_num: 'C1A024ABE', prag_price_id: 4905 },
    { key: 'wix', product: 11632940, trademark: 'WIX', ware_num: 'WF8388', prag_price_id: 1925 },
    { key: 'bosch', product: 24072610, trademark: 'Bosch', ware_num: '3 397 004 673', prag_price_id: 2339 },
    { key: 'sato', product: 44366609, trademark: 'SATO tech', ware_num: '21807R', prag_price_id: 3156 },
    { key: 'toyota', product: 1529790, trademark: 'Toyota', ware_num: '08880-80845', prag_price_id: 1938 },
  ];

  // ---- ua-oneclick-products.js --------------------------------------------
  const ONECLICK_PRODUCTS = [
    {
      key: 'mahle_kx33822d',
      trademark: 'Mahle/Knecht',
      ware_num: 'KX 338/22D',
      url: '/mahle-knecht-brand/filtr-toplivnyj-kx-338-22d-14316059/',
    },
  ];
  const ONECLICK_THROTTLE_MS = 61000; // site allows 1 "order in 1 click" per minute per phone

  // ---- ua-order-service.js -------------------------------------------------
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

  async function firstDepartmentId(service, cityId) {
    const res = await fetch('/api/v1/address/departments/?city_id=' + cityId + '&service=' + service, {
      credentials: 'same-origin',
    });
    const list = await res.json();
    return list && list.length ? list[0].id : null;
  }

  async function submitOrder(cfg, phone) {
    const body = {
      delivery: cfg.delivery,
      deliveryDescription: cfg.deliveryDescription,
      payment: cfg.payment,
      office_id: cfg.office_id,
      contact_phone: phone,
    };
    if (cfg.comment) body.comment = cfg.comment;
    if (cfg.delivery_service_id) body.delivery_service_id = cfg.delivery_service_id;
    if (cfg.address) {
      body.address = cfg.address;
      body.delivery_info = cfg.address;
    }
    const paymentMeta = PAYMENT_METHODS.find((p) => p.id === cfg.payment);
    if (paymentMeta && paymentMeta.installment) {
      body.financial_phone = phone;
      body.parts_count = 3;
    }
    return api('/api/v1/cart/checkout/add/', 'POST', body);
  }

  function extractOrderId(data) {
    if (!data) return null;
    if (data.order_id) return data.order_id;
    if (data.number) return data.number;
    if (data.order && (data.order.id || data.order.number)) return data.order.id || data.order.number;
    if (data.id) return data.id;
    return null;
  }

  async function runScenario(scenario, phone) {
    log('step', 'Adding product...');
    await clearCart();
    const add = await addToCart(scenario.product);
    if (add.status !== 200 && add.status !== 201) {
      return { ok: false, error: 'HTTP ' + add.status + ' (cart/add)', raw: add.data };
    }
    log('ok', 'Product added');

    let office_id = STORE.OFFICE_ID_SHIP;
    let delivery_service_id = null;
    let address = null;
    let deliveryDescription = '';

    if (scenario.delivery === 'office') {
      office_id = STORE.OFFICE_ID_PICKUP;
      deliveryDescription = 'Самовывоз из автомагазина: Киев, Нивки';
    } else if (['nova_pochta', 'nova_pochta_postomat', 'ukrpochta'].includes(scenario.delivery)) {
      delivery_service_id = await firstDepartmentId(scenario.delivery, STORE.CITY_ID_NP);
      deliveryDescription = 'Доставка (' + scenario.delivery + '), Киев';
    } else {
      address = STORE.ADDRESS_TEXT;
      deliveryDescription = 'Доставка курьером по адресу: ' + STORE.ADDRESS_TEXT;
    }

    log('step', 'Creating order...');
    const result = await submitOrder(
      {
        delivery: scenario.delivery,
        deliveryDescription,
        payment: scenario.payment,
        office_id,
        delivery_service_id,
        address,
        comment: 'Console smoke test — ' + new Date().toISOString(),
      },
      phone
    );

    if (result.status !== 200 && result.status !== 201) {
      return { ok: false, error: 'HTTP ' + result.status + ' (checkout/add)', raw: result.data };
    }

    const paymentMeta = PAYMENT_METHODS.find((p) => p.id === scenario.payment);
    if (paymentMeta && paymentMeta.installment) {
      log('step', 'Finalizing installment application...');
      const successCall = await api('/api/v1/cart/checkout/success/', 'GET');
      if (successCall.status === 200) log('ok', 'Installment application registered');
      else log('warn', 'Installment finalize call failed (HTTP ' + successCall.status + ')');
    }

    return { ok: true, orderId: extractOrderId(result.data), raw: result.data };
  }

  // ---- ua-oneclick-service.js ----------------------------------------------
  function extractPreloadedState(html) {
    const marker = 'window.PRELOADED_STATE = ';
    const start = html.indexOf(marker);
    if (start === -1) return null;
    const jsonStart = start + marker.length;
    const end = html.indexOf('</script>', jsonStart);
    let jsonText = html.slice(jsonStart, end).trim();
    if (jsonText.endsWith(';')) jsonText = jsonText.slice(0, -1);
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      return null;
    }
  }

  async function runOneClickScenario(product, phone, officeId) {
    log('step', 'Fetching product page state...');
    const res = await fetch(product.url, { credentials: 'same-origin' });
    const html = await res.text();
    const state = extractPreloadedState(html);
    if (!state || !state.product || !state.product.price || !state.session) {
      return { ok: false, error: 'Не вдалося прочитати PRELOADED_STATE з сторінки товару' };
    }

    const price = state.product.price;
    const session = state.session;
    const body = {
      product_id: price.product_id,
      supprice_id: price.price_id,
      supprice_letter: price.price_letter,
      dc_code: price.dc_code,
      price: price.price,
      office_id: officeId,
      delivery_time: price.delivery && price.delivery.string,
      phone_number: phone,
      user: session.user && session.user.id,
      xport_user_id: session.user && session.user.id,
      price_level: session.contract && session.contract.price_level,
      contract_agent: session.contract && session.contract.contract_agent_id,
      contract_object: session.contract && session.contract.id,
      agreement_object: session.contract && session.contract.agreement_id,
    };

    log('step', 'Sending "1 click" order request...');
    const csrf = getCookie('csrftoken');
    const orderRes = await fetch('/api/v1/orders/one-click-order/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await orderRes.json();
    } catch (e) {
      /* not all responses are JSON */
    }

    if (orderRes.status === 429 || (data && data.detail && String(data.detail).toLowerCase().includes('минут'))) {
      return { ok: false, error: 'Throttled: одне замовлення в 1 клік на телефон раз на хвилину', raw: data };
    }
    if (orderRes.status !== 200 && orderRes.status !== 201) {
      return { ok: false, error: 'HTTP ' + orderRes.status + ' (one-click-order)', raw: data };
    }
    return { ok: true, orderId: (data && (data.id || data.order_id)) || 'заявка прийнята', raw: data };
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
    console.log(`Smoke Test completed (UA)`);
    console.log(`Total: ${results.length}`);
    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`Duration: ${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`);
    console.log('\n================================\n');

    let text = `Order Smoke Test — UA\n\nTotal: ${results.length}\nPassed: ${passed.length}\nFailed: ${failed.length}\n`;
    if (failed.length) {
      text += `\nFailed:\n`;
      for (const f of failed) text += `- #${f.index} ${f.deliveryLabel} + ${f.paymentLabel} — ${f.error}\n`;
    }
    if (passed.length) {
      text += `\nCreated orders:\n`;
      for (const p of passed) text += `#${p.orderId}\n`;
    }
    console.log(text);
    window.__uaSmokeSummary = text;
    console.log('👉 Копія summary збережена в window.__uaSmokeSummary — можна виконати copy(window.__uaSmokeSummary)');
  }

  // ---- main run --------------------------------------------------------
  window.__uaSmokeStop = false;
  const startTime = Date.now();
  log('title', 'UA Smoke Test started');

  const scenarios = generateScenarios({
    deliveries: CONFIG_INPUT.DELIVERIES,
    payments: CONFIG_INPUT.PAYMENTS,
    products: PRODUCTS,
    count: CONFIG_INPUT.COUNT,
  });

  if (CONFIG_INPUT.COUNT > 0 && !scenarios.length) {
    console.error('❌ Жодної валідної комбінації доставки/оплати — перевірте CONFIG.DELIVERIES/PAYMENTS');
    return;
  }

  for (const scenario of scenarios) {
    if (window.__uaSmokeStop) {
      log('warn', 'Зупинено (window.__uaSmokeStop = true)');
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

  if (CONFIG_INPUT.ONE_CLICK_ENABLED && ONECLICK_PRODUCTS.length) {
    for (let i = 0; i < CONFIG_INPUT.ONE_CLICK_COUNT; i++) {
      if (window.__uaSmokeStop) break;
      const product = ONECLICK_PRODUCTS[i % ONECLICK_PRODUCTS.length];
      console.log(`\n[1 клік ${i + 1}/${CONFIG_INPUT.ONE_CLICK_COUNT}] ${product.trademark} ${product.ware_num}`);
      try {
        const outcome = await runOneClickScenario(product, CONFIG_INPUT.PHONE, STORE.OFFICE_ID_PICKUP);
        if (outcome.ok) {
          log('ok', `1-click order: ${outcome.orderId}`);
          results.push({ index: scenarios.length + i + 1, status: 'passed', deliveryLabel: '1 клік', paymentLabel: '—', orderId: outcome.orderId });
        } else {
          log('fail', `1-click failed — ${outcome.error}`);
          results.push({ index: scenarios.length + i + 1, status: 'failed', deliveryLabel: '1 клік', paymentLabel: '—', error: outcome.error });
        }
      } catch (e) {
        log('fail', '1-click failed — ' + String(e));
      }
      if (i < CONFIG_INPUT.ONE_CLICK_COUNT - 1) {
        log('warn', 'Waiting 60s (site allows 1 "1-click" order/min per phone)...');
        await new Promise((r) => setTimeout(r, ONECLICK_THROTTLE_MS));
      }
    }
  }

  printSummary(startTime);
})();
