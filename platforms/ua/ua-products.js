// Перевірений список товарів з існуючого console-скрипта. Використовуються по черзі (циклічно).
(function () {
  const PRODUCTS = [
    { key: 'abe', product: 10415187, trademark: 'ABE', ware_num: 'C1A024ABE', prag_price_id: 4905 },
    { key: 'wix', product: 11632940, trademark: 'WIX', ware_num: 'WF8388', prag_price_id: 1925 },
    { key: 'bosch', product: 24072610, trademark: 'Bosch', ware_num: '3 397 004 673', prag_price_id: 2339 },
    { key: 'sato', product: 44366609, trademark: 'SATO tech', ware_num: '21807R', prag_price_id: 3156 },
    { key: 'toyota', product: 1529790, trademark: 'Toyota', ware_num: '08880-80845', prag_price_id: 1938 },
  ];

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.PRODUCTS = PRODUCTS;
})();
