// "Order in 1 click" — the single-field flow available directly on a product page
// (phone number only, no delivery/payment choice; a manager calls back to confirm).
//
// Reverse-engineered from the live request fired by that button:
//   POST /api/v1/orders/one-click-order/
//   { product_id, supprice_id, supprice_letter, dc_code, price, office_id,
//     delivery_time, phone_number, user, xport_user_id, price_level,
//     contract_agent, contract_object, agreement_object }
//
// Every product-specific field (product_id/supprice_id/supprice_letter/dc_code/price/
// delivery_time) is read straight off that product's own detail page — it is embedded
// in `window.PRELOADED_STATE` (a plain JSON blob) as `product.price`. The account/
// session fields (user, xport_user_id, price_level, contract_agent, contract_object,
// agreement_object) live in `PRELOADED_STATE.session` and are identical for every
// product for the currently logged-in QA user, so they only need to be read once.
//
// IMPORTANT business rule verified live on staging: the endpoint throttles to
// one request per minute per phone number ("Вы уже сделали заказ в один клик...").
// The runner (core/smoke-runner.js) must space consecutive one-click calls accordingly.
(function () {
  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

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

  async function fetchProductState(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    const html = await res.text();
    return extractPreloadedState(html);
  }

  // Runs one "1 click" order for a product. `log(level, text)` streams progress.
  async function runOneClickScenario(product, phone, officeId, log) {
    log('step', 'Fetching product page state...');
    const state = await fetchProductState(product.url);
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
    const res = await fetch('/api/v1/orders/one-click-order/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      body: JSON.stringify(body),
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* no-op: not all responses are JSON */
    }

    if (res.status === 429 || (data && data.detail && String(data.detail).toLowerCase().includes('минут'))) {
      return { ok: false, error: 'Throttled: одне замовлення в 1 клік на телефон раз на хвилину', raw: data };
    }
    if (res.status !== 200 && res.status !== 201) {
      return { ok: false, error: 'HTTP ' + res.status + ' (one-click-order)', raw: data };
    }

    // The site does not return an order number synchronously — it queues the lead
    // for a manager to confirm by phone. We only confirm the request was accepted.
    return { ok: true, orderId: (data && (data.id || data.order_id)) || 'заявка прийнята', raw: data };
  }

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.runOneClickScenario = runOneClickScenario;
  self.SmokeUA.ONECLICK_THROTTLE_MS = 61000; // server allows 1 request/min per phone
})();
