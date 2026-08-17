// Injected into the active tab. Mirrors platforms/ua/ua-garage-service.js — verified live
// on stagingpl.exist.ua that the endpoints, PRELOADED_STATE.session shape, and modification
// ids are identical to UA (see pl-garage-config.js).
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

  async function fetchSession() {
    const res = await fetch('/garage/', { credentials: 'same-origin' });
    const html = await res.text();
    const state = extractPreloadedState(html);
    return state && state.session;
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

  function sessionIds(session) {
    return {
      userId: session.user && session.user.id,
      email: session.user && session.user.email,
      contractAgentId: session.contract && session.contract.contract_agent_id,
      contractId: session.contract && session.contract.id,
      agreementId: session.contract && session.contract.agreement_id,
      priceLevel: session.contract && session.contract.price_level,
      officeId: session.office && session.office.id,
    };
  }

  async function fetchGarageList() {
    const res = await api('/api/v1/customer/get-garage/', 'GET');
    return Array.isArray(res.data) ? res.data : [];
  }

  async function createGarageCar(session) {
    const ids = sessionIds(session);
    const pool = self.SmokePL.GARAGE_TEST_CARS;
    const car = pool[Math.floor(Math.random() * pool.length)];
    return api('/api/v1/customer/create-garage/', 'POST', {
      is_main: false,
      vin: null,
      comment: '',
      year: car.year,
      modification: car.modification,
      xport_kag_id: ids.contractAgentId,
      xport_user_id: ids.userId,
      contract_agent: ids.contractAgentId,
    });
  }

  async function submitPickRequest(session, garageEntry) {
    const ids = sessionIds(session);
    return api('/api/v1/customer/create-request/', 'POST', {
      email: ids.email,
      answer_by_email: false,
      mileage: null,
      general_user_comment: null,
      parts: [{ req_text: self.SmokePL.GARAGE_REQUEST_PART_NAME }],
      agreement_id: ids.agreementId,
      contract_id: ids.contractId,
      price_level: ids.priceLevel,
      xport_user_id: ids.userId,
      user: ids.userId,
      xport_kag_id: ids.contractAgentId,
      office: ids.officeId,
      vin: garageEntry.vin,
      year: garageEntry.year,
      garage: garageEntry.id,
      modification: garageEntry.modification && garageEntry.modification.id,
      agreement_object: ids.agreementId,
      contract_object: ids.contractId,
      contract_agent: ids.contractAgentId,
      notifyMessage: 'QA smoke test',
    });
  }

  async function runNewCarGarageScenario(log) {
    log('step', 'Reading session state...');
    const session = await fetchSession();
    if (!session) {
      return { ok: false, error: 'Не вдалося прочитати PRELOADED_STATE.session' };
    }

    log('step', 'Adding test car to garage...');
    const addRes = await createGarageCar(session);
    if (addRes.status !== 200 && addRes.status !== 201) {
      return { ok: false, error: 'HTTP ' + addRes.status + ' (create-garage)', raw: addRes.data };
    }
    const list = Array.isArray(addRes.data) ? addRes.data : [];
    const newEntry = list[list.length - 1];
    if (!newEntry) {
      return { ok: false, error: 'create-garage не повернув новий запис гаража', raw: addRes.data };
    }
    log('ok', 'Car added to garage (id ' + newEntry.id + ')');

    log('step', 'Sending pick request...');
    const reqRes = await submitPickRequest(session, newEntry);
    if (reqRes.status !== 200 && reqRes.status !== 201) {
      return { ok: false, error: 'HTTP ' + reqRes.status + ' (create-request)', raw: reqRes.data };
    }
    return { ok: true, orderId: 'garage #' + newEntry.id, raw: reqRes.data };
  }

  async function runExistingCarGarageScenario(log) {
    log('step', 'Reading session state...');
    const session = await fetchSession();
    if (!session) {
      return { ok: false, error: 'Не вдалося прочитати PRELOADED_STATE.session' };
    }

    log('step', 'Fetching garage list...');
    const list = await fetchGarageList();
    if (!list.length) {
      return { ok: false, error: 'Гараж порожній — немає авто для запиту' };
    }
    const car = list[0];
    log('ok', 'Using garage car id ' + car.id);

    log('step', 'Sending pick request...');
    const reqRes = await submitPickRequest(session, car);
    if (reqRes.status !== 200 && reqRes.status !== 201) {
      return { ok: false, error: 'HTTP ' + reqRes.status + ' (create-request)', raw: reqRes.data };
    }
    return { ok: true, orderId: 'garage #' + car.id, raw: reqRes.data };
  }

  self.SmokePL = self.SmokePL || {};
  self.SmokePL.runNewCarGarageScenario = runNewCarGarageScenario;
  self.SmokePL.runExistingCarGarageScenario = runExistingCarGarageScenario;
  self.SmokePL.fetchGarageList = fetchGarageList;
})();
