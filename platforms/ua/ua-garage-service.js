// Injected into the active tab. Two independent scenarios:
//   1. runNewCarGarageScenario  — add the fixed test car to the garage, then request a pick for it.
//   2. runExistingCarGarageScenario — request a pick for the first car already in the garage
//      (the popup blocks this scenario before a run if the garage is empty — see popup.js canRun()).
(function () {
  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

  // A VIN with a correct ISO 3779 check digit (position 9) — a garage entry created with
  // vin: null doesn't show up properly under "Мои запросы по VIN/FRAME", so every test car
  // needs a syntactically valid one instead. Random 16 chars + computed check digit.
  const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; // no I, O, Q
  const VIN_VALUES = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
    P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  };
  const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  function generateVin() {
    const chars = new Array(17);
    for (let i = 0; i < 17; i++) {
      chars[i] = i === 8 ? '0' : VIN_CHARS[Math.floor(Math.random() * VIN_CHARS.length)];
    }
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += VIN_VALUES[chars[i]] * VIN_WEIGHTS[i];
    const remainder = sum % 11;
    chars[8] = remainder === 10 ? 'X' : String(remainder);
    return chars.join('');
  }

  // Same PRELOADED_STATE extraction ua-oneclick-service.js uses for product pages —
  // here we fetch /garage/ instead, since that's guaranteed to embed `session`.
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
    const pool = self.SmokeUA.GARAGE_TEST_CARS;
    const car = pool[Math.floor(Math.random() * pool.length)];
    return api('/api/v1/customer/create-garage/', 'POST', {
      is_main: false,
      vin: generateVin(),
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
      parts: [{ req_text: self.SmokeUA.GARAGE_REQUEST_PART_NAME }],
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
      notifyMessage: 'QA smoke test — запит на підбір',
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
    // create-garage returns the account's full, updated garage list — the entry just
    // created is the last one (verified live: ids are assigned in increasing order).
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

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.runNewCarGarageScenario = runNewCarGarageScenario;
  self.SmokeUA.runExistingCarGarageScenario = runExistingCarGarageScenario;
  self.SmokeUA.fetchGarageList = fetchGarageList;
})();
