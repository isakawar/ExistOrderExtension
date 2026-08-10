// Injected into the active tab last, after the platform adapter + scenario-generator.
// Orchestrates the sequential run and streams progress to the popup via
// chrome.runtime.sendMessage (the popup is always listening while a run is active).
(function () {
  let stopRequested = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SMOKE_STOP') stopRequested = true;
  });

  function send(type, payload) {
    chrome.runtime.sendMessage({ type, payload });
  }

  function labelOf(list, id) {
    const found = list.find((x) => x.id === id);
    return found ? found.label : String(id);
  }

  function productLabel(product) {
    return product ? product.trademark + ' ' + product.ware_num : '';
  }

  async function runCartScenario(adapter, scenario, phone, index, total) {
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
      send('SMOKE_ORDER_RESULT', { index, status: 'skipped', deliveryLabel, paymentLabel, reason: scenario.reason });
      return;
    }

    try {
      const outcome = await adapter.runScenario(scenario, phone, (level, text) => send('SMOKE_LOG', { level, text }));
      if (outcome.ok) {
        send('SMOKE_ORDER_RESULT', { index, status: 'passed', deliveryLabel, paymentLabel, orderId: outcome.orderId });
      } else {
        send('SMOKE_ORDER_RESULT', { index, status: 'failed', deliveryLabel, paymentLabel, error: outcome.error });
      }
    } catch (e) {
      send('SMOKE_ORDER_RESULT', {
        index,
        status: 'failed',
        deliveryLabel,
        paymentLabel,
        error: String((e && e.message) || e),
      });
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
        send('SMOKE_ORDER_RESULT', {
          index,
          status: 'passed',
          deliveryLabel: "1 клік",
          paymentLabel: '—',
          orderId: outcome.orderId,
        });
      } else {
        send('SMOKE_ORDER_RESULT', {
          index,
          status: 'failed',
          deliveryLabel: "1 клік",
          paymentLabel: '—',
          error: outcome.error,
        });
      }
    } catch (e) {
      send('SMOKE_ORDER_RESULT', {
        index,
        status: 'failed',
        deliveryLabel: "1 клік",
        paymentLabel: '—',
        error: String((e && e.message) || e),
      });
    }
  }

  async function runSmokeTest(config) {
    stopRequested = false;
    const { platform, phone, count, deliveries, payments, oneClickCount } = config;

    const adapter = platform === 'UA' ? self.SmokeUA : self.SmokePL;
    if (!adapter) {
      send('SMOKE_FATAL', { error: 'Адаптер платформи "' + platform + '" не знайдено' });
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

    const total = scenarios.length + oneClickTotal;
    if (!total) {
      send('SMOKE_FATAL', { error: 'Не вдалося сформувати жодного сценарію — перевірте вибір доставки/оплати/кількості' });
      return;
    }

    send('SMOKE_START', { total, platform });

    let index = 0;
    for (const scenario of scenarios) {
      if (stopRequested) {
        send('SMOKE_LOG', { level: 'warn', text: 'Зупинено користувачем' });
        send('SMOKE_DONE', {});
        return;
      }
      index++;
      await runCartScenario(adapter, scenario, phone, index, total);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (oneClickEnabled) {
      const products = adapter.ONECLICK_PRODUCTS;
      const officeId = adapter.CONFIG.OFFICE_ID_PICKUP;
      for (let i = 0; i < oneClickCount; i++) {
        if (stopRequested) {
          send('SMOKE_LOG', { level: 'warn', text: 'Зупинено користувачем' });
          break;
        }
        index++;
        const product = products[i % products.length];
        await runOneClickScenario(adapter, product, phone, officeId, index, total);
        if (i < oneClickCount - 1) {
          send('SMOKE_LOG', { level: 'warn', text: 'Очікування 60с (ліміт "1 клік" — 1 заявка/хв на телефон)...' });
          await new Promise((resolve) => setTimeout(resolve, adapter.ONECLICK_THROTTLE_MS || 61000));
        }
      }
    }

    send('SMOKE_DONE', {});
  }

  self.SmokeCore = self.SmokeCore || {};
  self.SmokeCore.runSmokeTest = runSmokeTest;
})();
