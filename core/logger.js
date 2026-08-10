// Popup-only. Builds the final summary block (HTML for display, plain text for the
// "Copy Summary" button). Never injected into the page tab.
(function () {
  function groupStats(results, key) {
    const stats = {};
    for (const r of results) {
      const label = r[key];
      if (!stats[label]) stats[label] = { total: 0, pass: 0, fail: 0, skip: 0 };
      stats[label].total++;
      stats[label][r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : 'skip']++;
    }
    return stats;
  }

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = String(s == null ? '' : s);
    return div.innerHTML;
  }

  function buildSummaryHtml(platform, results, durationSec) {
    const passed = results.filter((r) => r.status === 'passed');
    const failed = results.filter((r) => r.status === 'failed');
    const skipped = results.filter((r) => r.status === 'skipped');

    const byDelivery = groupStats(results, 'deliveryLabel');
    const byPayment = groupStats(results, 'paymentLabel');

    const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
    const ss = String(durationSec % 60).padStart(2, '0');

    let html = '';
    html += `<div class="summary-title">Smoke Test completed</div>`;
    html += `<div>Platform: ${esc(platform)}</div>`;
    html += `<div>Orders requested: ${results.length}</div>`;
    html += `<div class="summary-stats">`;
    html += `<span class="pass">✅ Passed: ${passed.length}</span>`;
    html += `<span class="fail">❌ Failed: ${failed.length}</span>`;
    html += `<span class="skip">⚠️ Skipped: ${skipped.length}</span>`;
    html += `</div>`;
    html += `<div>Duration: ${mm}:${ss}</div>`;

    html += `<div class="summary-section">Delivery</div>`;
    for (const [label, s] of Object.entries(byDelivery)) {
      const mark = s.fail || s.skip ? '⚠️' : '✅';
      html += `<div class="summary-row">${esc(label)} — ${s.pass}/${s.total} ${mark}</div>`;
    }

    html += `<div class="summary-section">Payment</div>`;
    for (const [label, s] of Object.entries(byPayment)) {
      const mark = s.fail || s.skip ? '⚠️' : '✅';
      html += `<div class="summary-row">${esc(label)} — ${s.pass}/${s.total} ${mark}</div>`;
    }

    const formatOrderId = (id) => {
      const looksLikeId = /^[\w-]+$/.test(String(id)) && !String(id).includes(' ');
      return looksLikeId ? `Order #${esc(id)}` : esc(id);
    };

    html += `<div class="summary-section">Details</div>`;
    results.forEach((r, i) => {
      if (r.status === 'passed') {
        html += `<div class="detail pass">#${i + 1} ✅ ${formatOrderId(r.orderId)}<br><span class="dim">${esc(r.deliveryLabel)} + ${esc(r.paymentLabel)}</span></div>`;
      } else if (r.status === 'failed') {
        html += `<div class="detail fail">#${i + 1} ❌ Failed<br><span class="dim">${esc(r.deliveryLabel)} + ${esc(r.paymentLabel)} — ${esc(r.error)}</span></div>`;
      } else {
        html += `<div class="detail skip">#${i + 1} ⚠️ Skipped<br><span class="dim">${esc(r.deliveryLabel)} + ${esc(r.paymentLabel)} — ${esc(r.reason)}</span></div>`;
      }
    });

    return html;
  }

  function formatSummaryForCopy(platform, results) {
    const passed = results.filter((r) => r.status === 'passed');
    const failed = results.filter((r) => r.status === 'failed');
    const skipped = results.filter((r) => r.status === 'skipped');

    let text = `Order Smoke Test — ${platform}\n\n`;
    text += `Total: ${results.length}\n`;
    text += `Passed: ${passed.length}\n`;
    text += `Failed: ${failed.length}\n`;
    text += `Skipped: ${skipped.length}\n`;

    if (failed.length) {
      text += `\nFailed:\n`;
      for (const f of failed) text += `- ${f.deliveryLabel} + ${f.paymentLabel} — ${f.error}\n`;
    }
    if (skipped.length) {
      text += `\nSkipped:\n`;
      for (const s of skipped) text += `- ${s.deliveryLabel} + ${s.paymentLabel} — ${s.reason}\n`;
    }
    if (passed.length) {
      text += `\nCreated orders:\n`;
      for (const p of passed) {
        const id = String(p.orderId);
        const looksLikeId = /^[\w-]+$/.test(id) && !id.includes(' ');
        text += (looksLikeId ? `#${id}` : id) + '\n';
      }
    }
    return text;
  }

  window.SmokeLogger = { buildSummaryHtml, formatSummaryForCopy };
})();
