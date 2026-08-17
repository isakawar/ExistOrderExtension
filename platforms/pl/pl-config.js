// Injected both into the popup (for rendering) and into the active tab (for execution).
// Delivery/payment codes and the compatibility matrix below were pulled live from
// GET /api/v1/cart/checkout/?delivery=<slug>&office_id=<id> on stagingpl.exist.ua —
// that endpoint returns exactly the payments valid for a given delivery, so this is
// not guesswork. Two PL delivery options are intentionally NOT included here:
// "Почтомат или Пункт выдачи" (apaczka) and "В отделение или почтомат Nova Post"
// (nova_post_global) both require picking a specific locker/point id via a lookup
// API that wasn't wired up in this pass — submitting them with just a free-text
// address 500s with KeyError('delivery_service_id'). Every method listed below was
// verified to accept a plain inline address and return a successful order.
(function () {
  const OFFICE_ID = 1; // Warszawa Reguły — the pickup store used for every scenario
  const ADDRESS_TEXT = 'Warszawa, Testowa 1'; // inline address for courier/international deliveries
  const CONTACT_FULL_NAME = 'QA Smoke Test';
  const CONTACT_EMAIL = 'isakawar1@gmail.com';

  const DELIVERY_METHODS = [
    { id: 'office', label: 'Самовывоз из автомагазина' },
    { id: 'exist_paid_courier', label: 'Курьер, оплата при получении' },
    { id: 'inpost_paczkomat', label: 'Курьер, оплаченный заказ' },
    { id: 'dhl_courier', label: 'DHL доставка в Германию' },
    { id: 'dhl_international', label: 'По Европе DHL или DPD' },
    { id: 'fedex', label: 'Международная доставка за пределы ЕС' },
    { id: 'nova_post_global_address', label: "Курьер Nova Post" },
  ];

  const PAYMENT_METHODS = [
    { id: 6, label: 'Оплата при получении (самовывоз)', cashLike: true },
    { id: 5, label: 'Оплата при получении (курьер)', cashLike: true },
    { id: 182, label: 'Оплата с баланса' },
    { id: 39, label: 'Оплата картой' },
    { id: 115, label: 'PayPal' },
    { id: 215, label: 'PayPal Expanded' },
  ];

  // Exact per-delivery payment sets, as returned by the live checkout API.
  const DELIVERY_PAYMENTS = {
    office: [6, 182],
    exist_paid_courier: [5],
    inpost_paczkomat: [182],
    dhl_courier: [115],
    dhl_international: [215, 39, 182, 115],
    fedex: [215, 115],
    nova_post_global_address: [39, 182],
  };

  function isCombinationAllowed(deliveryId, paymentId) {
    const allowed = DELIVERY_PAYMENTS[deliveryId] || [];
    if (!allowed.includes(paymentId)) {
      return { allowed: false, reason: 'Цей спосіб оплати недоступний для обраної доставки на PL' };
    }
    return { allowed: true };
  }

  self.SmokePL = self.SmokePL || {};
  self.SmokePL.CONFIG = { OFFICE_ID, ADDRESS_TEXT, CONTACT_FULL_NAME, CONTACT_EMAIL, DEFAULT_OFFICE_ID: OFFICE_ID };
  self.SmokePL.DELIVERY_METHODS = DELIVERY_METHODS;
  self.SmokePL.PAYMENT_METHODS = PAYMENT_METHODS;
  self.SmokePL.isCombinationAllowed = isCombinationAllowed;
})();
