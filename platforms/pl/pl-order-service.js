// Injected into the active tab. Runs in the page's own session (cookies), so fetch()
// calls use the same-origin credentials of the currently logged-in QA user.
//
// PL has no fixed product catalogue (unlike UA) — every scenario's product is a
// search term (see pl-products.js) that gets resolved live, right before it's
// needed, via the same three calls the site's own search box uses:
//   GET /api/v1/fulltext/search-v2/?query=...&short=true   -> categories
//   GET /api/v1/catalogue/product-index/?slug=...           -> purchasable products
//   POST /api/v1/cart/add/                                  -> same shape as UA
//   POST /api/v1/cart/checkout/add/                         -> creates the order
//   GET  /api/v1/cart/checkout/success/                     -> the ONLY place that
//     returns the actual order number; checkout/add's response is just the
//     (now-emptied) cart state. Verified live against stagingpl.exist.ua.
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

  // Mirrors the search box: query -> first category -> first purchasable product
  // in that category. Returns null if nothing purchasable turns up.
  async function resolveProduct(searchTerm) {
    const searchRes = await fetch(
      '/api/v1/fulltext/search-v2/?query=' + encodeURIComponent(searchTerm) + '&short=true',
      { credentials: 'same-origin' }
    );
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
    const CONFIG = self.SmokePL.CONFIG;
    const body = {
      delivery: cfg.delivery,
      deliveryDescription: cfg.deliveryDescription,
      payment: cfg.payment,
      office_id: CONFIG.OFFICE_ID,
      contact_phone: phone,
      contact_full_name: CONFIG.CONTACT_FULL_NAME,
      contact_email: CONFIG.CONTACT_EMAIL,
    };
    if (cfg.delivery !== 'office') {
      body.address = CONFIG.ADDRESS_TEXT;
      body.delivery_info = CONFIG.ADDRESS_TEXT;
    }
    return api('/api/v1/cart/checkout/add/', 'POST', body);
  }

  // checkout/add only echoes the (emptied) cart — the order number only shows up
  // in the follow-up success call, keyed by the currently logged-in session/cart.
  async function fetchOrderId() {
    const { data } = await api('/api/v1/cart/checkout/success/', 'GET');
    const orders = Array.isArray(data && data.orders) ? data.orders : [data && data.orders];
    const entry = orders[0];
    const ordersData = entry && entry.orders_data;
    const first = Array.isArray(ordersData) ? ordersData[0] : ordersData;
    return first ? { orderId: first.order_id, raw: first } : { orderId: null, raw: data };
  }

  async function runScenario(scenario, phone, log) {
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

    const deliveryLabel = self.SmokePL.DELIVERY_METHODS.find((d) => d.id === scenario.delivery);
    log('step', 'Creating order...');
    const result = await submitOrder(
      { delivery: scenario.delivery, deliveryDescription: (deliveryLabel && deliveryLabel.label) || scenario.delivery, payment: scenario.payment },
      phone
    );
    if (result.status !== 200 && result.status !== 201) {
      return { ok: false, error: 'HTTP ' + result.status + ' (checkout/add)', raw: result.data };
    }

    const { orderId, raw } = await fetchOrderId();
    return { ok: true, orderId: orderId || 'створено', raw };
  }

  self.SmokePL = self.SmokePL || {};
  self.SmokePL.runScenario = runScenario;
  self.SmokePL.preflightPath = '/api/v1/cart/?clear=0';
})();
