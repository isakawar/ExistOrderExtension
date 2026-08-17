// Popup-only. Validates the phone number format each platform's checkout actually
// accepts (verified against the site's own client-side validation on staging).
(function () {
  const PATTERNS = {
    UA: /^\+380\d{9}$/,
    // PL platform accepts either a Polish or a Ukrainian number (site staff regularly
    // test with both).
    PL: /^\+(48|380)\d{9}$/,
  };

  function isValidPhone(phone, platform) {
    const pattern = PATTERNS[platform];
    return !!pattern && pattern.test(String(phone || '').trim());
  }

  self.SmokePhoneValidator = { isValidPhone };
})();
