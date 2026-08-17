// Injected into the active tab last, after the platform adapter + scenario-generator.
// Orchestrates the sequential run and streams progress to the popup via
// chrome.runtime.sendMessage (the popup is always listening while a run is active).
//
// The popup is ephemeral — Chrome destroys its document whenever it loses focus or
// is closed, but this script keeps running in the tab regardless (it was injected
// via chrome.scripting.executeScript, independent of the popup's lifecycle). So we
// mirror progress into self.__smokeState too: if the popup reopens mid-run it can
// read that snapshot to reconnect instead of starting a duplicate test.
(function () {
  let stopRequested = false;

  self.__smokeRunning = self.__smokeRunning || false;
  self.__smokeState = self.__smokeState || null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SMOKE_STOP') stopRequested = true;
  });

  function send(type, payload) {
    chrome.runtime.sendMessage({ type, payload }, () => {
      // Swallow "Receiving end does not exist" when the popup is closed —
      // the run must keep going either way, only the live UI is missing it.
      void chrome.runtime.lastError;
    });
  }

  function pushResult(result) {
    if (self.__smokeState) self.__smokeState.results.push(result);
    send('SMOKE_ORDER_RESULT', result);
  }

  function labelOf(list, id) {
    const found = list.find((x) => x.id === id);
    return found ? found.label : String(id);
  }

  function productLabel(product) {
    return product ? product.trademark + ' ' + product.ware_num : '';
  }

  async function runCartScenario(adapter, scenario, phone, index, total, officeId) {
    const deliveryLabel = labelOf(adapter.DELIVERY_METHODS, scenario.delivery);
    const paymentLabel = labelOf(adapter.PAYMENT_METHODS, scenario.payment);

    send('SMOKE_ORDER_START', {
      index,
      total,
      deliveryLabel,
      paymentLabel,
      productLabel: productLabel(scenario.product),
    });

    if (!scenario.allowed) {
      pushResult({ index, status: 'skipped', deliveryLabel, paymentLabel, reason: scenario.reason });
      return;
    }

    try {
      const outcome = await adapter.runScenario(scenario, phone, (level, text) => send('SMOKE_LOG', { level, text }), officeId);
      if (outcome.ok) {
        pushResult({ index, status: 'passed', deliveryLabel, paymentLabel, orderId: outcome.orderId, raw: outcome.raw });
      } else {
        pushResult({ index, status: 'failed', deliveryLabel, paymentLabel, error: outcome.error, raw: outcome.raw });
      }
    } catch (e) {
      pushResult({ index, status: 'failed', deliveryLabel, paymentLabel, error: String((e && e.message) || e) });
    }
  }

  async function runOneClickScenario(adapter, product, phone, officeId, index, total) {
    send('SMOKE_ORDER_START', {
      index,
      total,
      deliveryLabel: "1 клік",
      paymentLabel: '—',
      productLabel: productLabel(product),
    });

    try {
      const outcome = await adapter.runOneClickScenario(product, phone, officeId, (level, text) =>
        send('SMOKE_LOG', { level, text })
      );
      if (outcome.ok) {
        pushResult({
          index,
          status: 'passed',
          deliveryLabel: "1 клік",
          paymentLabel: '—',
          orderId: outcome.orderId,
          raw: outcome.raw,
        });
      } else {
        pushResult({
          index,
          status: 'failed',
          deliveryLabel: "1 клік",
          paymentLabel: '—',
          error: outcome.error,
          raw: outcome.raw,
        });
      }
    } catch (e) {
      pushResult({
        index,
        status: 'failed',
        deliveryLabel: "1 клік",
        paymentLabel: '—',
        error: String((e && e.message) || e),
      });
    }
  }

  async function runGarageScenario(adapter, scenarioFn, label, index, total) {
    send('SMOKE_ORDER_START', { index, total, deliveryLabel: label, paymentLabel: '—', productLabel: '' });

    try {
      const outcome = await scenarioFn.call(adapter, (level, text) => send('SMOKE_LOG', { level, text }));
      if (outcome.ok) {
        pushResult({ index, status: 'passed', deliveryLabel: label, paymentLabel: '—', orderId: outcome.orderId, raw: outcome.raw });
      } else {
        pushResult({ index, status: 'failed', deliveryLabel: label, paymentLabel: '—', error: outcome.error, raw: outcome.raw });
      }
    } catch (e) {
      pushResult({ index, status: 'failed', deliveryLabel: label, paymentLabel: '—', error: String((e && e.message) || e) });
    }
  }

  async function runSmokeTest(config) {
    if (self.__smokeRunning) {
      send('SMOKE_FATAL', { error: 'Smoke test вже виконується на цій вкладці' });
      return;
    }

    stopRequested = false;
    self.__smokeRunning = true;
    const { platform, phone, count, deliveries, payments, oneClickCount, officeId, garageNewCarCount, garageExistingCarCount } = config;

    const adapter = platform === 'UA' ? self.SmokeUA : self.SmokePL;
    if (!adapter) {
      send('SMOKE_FATAL', { error: 'Адаптер платформи "' + platform + '" не знайдено' });
      self.__smokeRunning = false;
      return;
    }

    const cartEnabled = count > 0 && deliveries.length > 0 && payments.length > 0;
    const scenarios = cartEnabled
      ? self.SmokeCore.generateScenarios({
          deliveries,
          payments,
          products: adapter.PRODUCTS,
          count,
          isCombinationAllowed: adapter.isCombinationAllowed,
        })
      : [];

    const oneClickEnabled = oneClickCount > 0 && adapter.ONECLICK_PRODUCTS && adapter.ONECLICK_PRODUCTS.length > 0;
    const oneClickTotal = oneClickEnabled ? oneClickCount : 0;

    const garageNewCarEnabled = garageNewCarCount > 0 && !!adapter.runNewCarGarageScenario;
    const garageNewCarTotal = garageNewCarEnabled ? garageNewCarCount : 0;
    const garageExistingCarEnabled = garageExistingCarCount > 0 && !!adapter.runExistingCarGarageScenario;
    const garageExistingCarTotal = garageExistingCarEnabled ? garageExistingCarCount : 0;

    const total = scenarios.length + oneClickTotal + garageNewCarTotal + garageExistingCarTotal;
    if (!total) {
      send('SMOKE_FATAL', { error: 'Не вдалося сформувати жодного сценарію — перевірте вибір доставки/оплати/кількості' });
      self.__smokeRunning = false;
      return;
    }

    self.__smokeState = { platform, total, results: [], startTime: Date.now(), stopped: false, done: false };
    send('SMOKE_START', { total, platform });

    let index = 0;
    for (const scenario of scenarios) {
      if (stopRequested) {
        self.__smokeState.stopped = true;
        send('SMOKE_LOG', { level: 'warn', text: 'Зупинено користувачем' });
        break;
      }
      index++;
      await runCartScenario(adapter, scenario, phone, index, total, officeId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (oneClickEnabled && !stopRequested) {
      const products = adapter.ONECLICK_PRODUCTS;
      const resolvedOfficeId = officeId || adapter.CONFIG.OFFICE_ID_PICKUP;
      for (let i = 0; i < oneClickCount; i++) {
        if (stopRequested) {
          self.__smokeState.stopped = true;
          send('SMOKE_LOG', { level: 'warn', text: 'Зупинено користувачем' });
          break;
        }
        index++;
        const product = products[i % products.length];
        await runOneClickScenario(adapter, product, phone, resolvedOfficeId, index, total);
        if (i < oneClickCount - 1 && !stopRequested) {
          send('SMOKE_LOG', { level: 'warn', text: 'Очікування 60с (ліміт "1 клік" — 1 заявка/хв на телефон)...' });
          await new Promise((resolve) => setTimeout(resolve, adapter.ONECLICK_THROTTLE_MS || 61000));
        }
      }
    }

    if (garageNewCarEnabled && !stopRequested) {
      for (let i = 0; i < garageNewCarTotal; i++) {
        if (stopRequested) {
          self.__smokeState.stopped = true;
          send('SMOKE_LOG', { level: 'warn', text: 'Зупинено користувачем' });
          break;
        }
        index++;
        await runGarageScenario(adapter, adapter.runNewCarGarageScenario, 'Підбір (нове авто)', index, total);
      }
    }

    if (garageExistingCarEnabled && !stopRequested) {
      for (let i = 0; i < garageExistingCarTotal; i++) {
        if (stopRequested) {
          self.__smokeState.stopped = true;
          send('SMOKE_LOG', { level: 'warn', text: 'Зупинено користувачем' });
          break;
        }
        index++;
        await runGarageScenario(adapter, adapter.runExistingCarGarageScenario, 'Підбір (з гаража)', index, total);
      }
    }

    self.__smokeState.done = true;
    self.__smokeRunning = false;
    send('SMOKE_DONE', { stopped: self.__smokeState.stopped });
  }

  self.SmokeCore = self.SmokeCore || {};
  self.SmokeCore.runSmokeTest = runSmokeTest;
})();
