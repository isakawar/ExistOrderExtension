// Platform-agnostic. Injected into the active tab alongside a platform adapter.
//
// Builds the delivery x payment matrix for the user's selection, drops any combo
// the platform's business rules reject, then cycles through the REMAINING valid
// combos (round-robin, deterministic order) to produce exactly `count` scenarios —
// reusing valid combos and products as needed if the user asked for more orders
// than there are valid combinations. Invalid combos are never generated at all
// (not even as a "skipped" placeholder) — if the user picked delivery/payment
// checkboxes whose only overlap is invalid, that's caught earlier by the popup's
// pre-run summary, not here.
(function () {
  function generateScenarios({ deliveries, payments, products, count, isCombinationAllowed }) {
    const validCombos = [];
    for (const delivery of deliveries) {
      for (const payment of payments) {
        if (isCombinationAllowed(delivery, payment).allowed) {
          validCombos.push({ delivery, payment, allowed: true });
        }
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

  self.SmokeCore = self.SmokeCore || {};
  self.SmokeCore.generateScenarios = generateScenarios;
})();
