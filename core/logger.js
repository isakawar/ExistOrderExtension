// Popup-only. Builds the clipboard-ready summary text for the "Copy Summary" button.
// Never injected into the page tab.
(function () {
  function formatOrderId(id) {
    const looksLikeId = /^[\w-]+$/.test(String(id)) && !String(id).includes(' ');
    return looksLikeId ? `#${id}` : String(id);
  }

  function formatSummaryForCopy(platform, environment, results, stopped) {
    const passed = results.filter((r) => r.status === 'passed');
    const failed = results.filter((r) => r.status === 'failed');
    const skipped = results.filter((r) => r.status === 'skipped');

    let text = `Order Smoke Test — ${platform}\n\n`;
    if (environment) text += `Environment: ${environment}\n\n`;
    if (stopped) text += `Status: STOPPED (не всі сценарії виконано)\n\n`;
    text += `Total: ${results.length}\n`;
    text += `Passed: ${passed.length}\n`;
    text += `Failed: ${failed.length}\n`;
    text += `Skipped: ${skipped.length}\n`;

    if (failed.length) {
      text += `\nFailed:\n`;
      for (const f of failed) text += `- #${f.index} ${f.deliveryLabel} + ${f.paymentLabel} — ${f.error}\n`;
    }
    if (skipped.length) {
      text += `\nSkipped:\n`;
      for (const s of skipped) text += `- #${s.index} ${s.deliveryLabel} + ${s.paymentLabel} — ${s.reason}\n`;
    }

    if (!failed.length && !skipped.length) {
      text += `\nAll smoke scenarios passed successfully.\n`;
    }

    if (passed.length) {
      text += `\nCreated orders:\n`;
      for (const p of passed) text += formatOrderId(p.orderId) + '\n';
    }

    return text;
  }

  window.SmokeLogger = { formatSummaryForCopy, formatOrderId };
})();
