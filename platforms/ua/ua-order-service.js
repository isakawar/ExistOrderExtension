// Injected into the active tab. Runs in the page's own session (cookies), so fetch()
// calls use the same-origin credentials of the currently logged-in QA user.
// API calls and business logic are adapted 1:1 from the original console script —
// see /api/v1/cart, /api/v1/address/departments, /api/v1/cart/checkout/add.
(function () {
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
      /* no-op: not all responses are JSON */
    }
    return { status: res.status, data };
  }

  async function clearCart() {
    const { data } = await api('/api/v1/cart/?clear=0', 'GET');
    if (!data || !data.items) return;
    for (const item of data.items) {
      await api('/api/v1/cart/delete/' + item.id + '/', 'DELETE');
    }
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
    const res = await fetch(
      '/api/v1/address/departments/?city_id=' + cityId + '&service=' + service,
      { credentials: 'same-origin' }
    );
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
    const paymentMeta = self.SmokeUA.PAYMENT_METHODS.find((p) => p.id === cfg.payment);
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

  // Runs one full scenario (clear cart -> add product -> resolve delivery -> checkout).
  // `log(level, text)` streams progress back to the popup; level is 'step' | 'ok' | 'warn'.
  async function runScenario(scenario, phone, log) {
    const CONFIG = self.SmokeUA.CONFIG;

    log('step', 'Adding product...');
    await clearCart();
    const add = await addToCart(scenario.product);
    if (add.status !== 200 && add.status !== 201) {
      return { ok: false, error: 'HTTP ' + add.status + ' (cart/add)', raw: add.data };
    }
    log('ok', 'Product added');

    let office_id = CONFIG.OFFICE_ID_SHIP;
    let delivery_service_id = null;
    let address = null;
    let deliveryDescription = '';

    if (scenario.delivery === 'office') {
      office_id = CONFIG.OFFICE_ID_PICKUP;
      deliveryDescription = 'Самовывоз из автомагазина: Киев, Нивки';
    } else if (['nova_pochta', 'nova_pochta_postomat', 'ukrpochta'].includes(scenario.delivery)) {
      delivery_service_id = await firstDepartmentId(scenario.delivery, CONFIG.CITY_ID_NP);
      deliveryDescription = 'Доставка (' + scenario.delivery + '), Киев';
    } else {
      address = CONFIG.ADDRESS_TEXT;
      deliveryDescription = 'Доставка курьером по адресу: ' + CONFIG.ADDRESS_TEXT;
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
        comment: 'QA smoke test — ' + new Date().toISOString(),
      },
      phone
    );

    if (result.status !== 200 && result.status !== 201) {
      return { ok: false, error: 'HTTP ' + result.status + ' (checkout/add)', raw: result.data };
    }

    return { ok: true, orderId: extractOrderId(result.data), raw: result.data };
  }

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.runScenario = runScenario;
  self.SmokeUA.preflightPath = '/api/v1/cart/?clear=0';
})();
