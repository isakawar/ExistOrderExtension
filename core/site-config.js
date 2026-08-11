// Popup-only (no chrome.* calls) — maps a tab's hostname to a platform so the popup
// can show "Connected: <host>" and block a run when the selected platform doesn't
// match the open site. Real staging/production hostnames go here; edit freely,
// this is the single place that needs updating if domains change.
(function () {
  const SITE_HOSTNAMES = {
    UA: ['staging.exist.ua', 'exist.ua', 'www.exist.ua'],
    // stagingpl.exist.ua is verified live (branded "2407.PL" in the UI). The
    // production domain wasn't confirmed — 2407.pl/www.2407.pl are best guesses
    // from the site's own branding; adjust once the real prod host is known.
    PL: ['stagingpl.exist.ua', '2407.pl', 'www.2407.pl'],
  };

  // Exact matches are checked across ALL platforms before any subdomain match is
  // considered. Without this, "stagingpl.exist.ua" would false-match UA's
  // "exist.ua" entry via the subdomain rule below (it genuinely IS a subdomain of
  // exist.ua, hostname-wise) and never even reach its own exact PL entry — that
  // bug let a QA run silently target the wrong platform's business logic.
  function detectPlatform(hostname) {
    if (!hostname) return null;
    for (const platform of Object.keys(SITE_HOSTNAMES)) {
      if (SITE_HOSTNAMES[platform].includes(hostname)) return platform;
    }
    for (const platform of Object.keys(SITE_HOSTNAMES)) {
      for (const host of SITE_HOSTNAMES[platform]) {
        if (hostname.endsWith('.' + host)) return platform;
      }
    }
    return null;
  }

  window.SmokeSiteConfig = { SITE_HOSTNAMES, detectPlatform };
})();
