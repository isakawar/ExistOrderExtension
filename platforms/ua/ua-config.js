// Injected both into the popup (for rendering) and into the active tab (for execution).
// Keep this file dependency-free — it attaches to a shared global namespace.
(function () {
  // ==== НАЛАШТУВАННЯ МАГАЗИНУ ====
  // Перенесено як є з існуючого console-скрипта. За потреби QA може відредагувати тут.
  const CITY_ID_NP = 1364; // Київ
  const OFFICE_ID_SHIP = 34; // внутрішній ID міста для НП/Укрпошта/кур'єр
  const OFFICE_ID_PICKUP = 8; // ID магазину самовивозу (Київ, Нивки)
  const ADDRESS_TEXT = 'Київ, вулиця Хрещатик, 1'; // адреса для кур'єрської доставки

  const DELIVERY_METHODS = [
    { id: 'office', label: 'Самовивіз' },
    { id: 'nova_pochta', label: 'Нова Пошта — відділення' },
    { id: 'nova_pochta_postomat', label: 'Нова Пошта — поштомат' },
    { id: 'ukrpochta', label: 'Укрпошта' },
    { id: 'exist_courier', label: "Кур'єр" },
    { id: 'exist_paid_courier', label: "Платний кур'єр" },
  ];

  const PAYMENT_METHODS = [
    { id: 5, label: 'Готівка', cashLike: true },
    { id: 6, label: 'Наложний платіж', cashLike: true },
    { id: 175, label: 'Plata by mono' },
    { id: 177, label: 'Mono розстрочка', installment: true },
    { id: 178, label: 'Privat розстрочка', installment: true },
    { id: 1, label: 'LiqPay' },
    { id: 72, label: 'Баланс' },
    { id: 2, label: 'Portmone' },
  ];

  // Бізнес-правило: платний кур'єр не може використовувати готівкові способи оплати.
  function isCombinationAllowed(deliveryId, paymentId) {
    const payment = PAYMENT_METHODS.find((p) => p.id === paymentId);
    if (deliveryId === 'exist_paid_courier' && payment && payment.cashLike) {
      return { allowed: false, reason: "Платний кур'єр не підтримує готівкові способи оплати" };
    }
    return { allowed: true };
  }

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.CONFIG = { CITY_ID_NP, OFFICE_ID_SHIP, OFFICE_ID_PICKUP, ADDRESS_TEXT };
  self.SmokeUA.DELIVERY_METHODS = DELIVERY_METHODS;
  self.SmokeUA.PAYMENT_METHODS = PAYMENT_METHODS;
  self.SmokeUA.isCombinationAllowed = isCombinationAllowed;
})();
