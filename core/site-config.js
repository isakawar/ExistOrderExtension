// Popup-only (no chrome.* calls) — maps a tab's hostname to a platform so the popup
// can show "Connected: <host>" and block a run when the selected platform doesn't
// match the open site. Real staging/production hostnames go here; edit freely,
// this is the single place that needs updating if domains change.
(function () {
  const SITE_HOSTNAMES = {
    UA: ['staging.exist.ua', 'exist.ua', 'www.exist.ua'],
    PL: ['staging.exist.pl', 'exist.pl', 'www.exist.pl'],
  };

  // Exact match or subdomain match (e.g. "beta.staging.exist.ua" still counts as UA).
  function detectPlatform(hostname) {
    if (!hostname) return null;
    for (const platform of Object.keys(SITE_HOSTNAMES)) {
      for (const host of SITE_HOSTNAMES[platform]) {
        if (hostname === host || hostname.endsWith('.' + host)) return platform;
      }
    }
    return null;
  }

  window.SmokeSiteConfig = { SITE_HOSTNAMES, detectPlatform };
})();
