// Platform-agnostic. Injected into the active tab alongside a platform adapter.
//
// Builds the full delivery x payment combination matrix for the user's selection,
// tags each combo as allowed/blocked via the platform's business rules, then cycles
// through that matrix (round-robin, deterministic order) to produce exactly `count`
// scenarios — reusing combos and products as needed if the user asked for more
// orders than there are valid combinations.
(function () {
  function generateScenarios({ deliveries, payments, products, count, isCombinationAllowed }) {
    const combos = [];
    for (const delivery of deliveries) {
      for (const payment of payments) {
        const check = isCombinationAllowed(delivery, payment);
        combos.push({ delivery, payment, allowed: check.allowed, reason: check.reason });
      }
    }

    const scenarios = [];
    if (combos.length === 0) return scenarios;

    for (let i = 0; i < count; i++) {
      const combo = combos[i % combos.length];
      const product = products.length ? products[i % products.length] : null;
      scenarios.push({ ...combo, product, index: i + 1 });
    }
    return scenarios;
  }

  self.SmokeCore = self.SmokeCore || {};
  self.SmokeCore.generateScenarios = generateScenarios;
})();
