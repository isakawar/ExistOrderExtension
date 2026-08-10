// "Order in 1 click" needs the product's own detail-page URL (its API payload embeds
// price_id/price_letter/dc_code/product_id straight from that page's PRELOADED_STATE —
// there is no product-id mapping shared with the cart/add flow). Each entry here was
// opened and verified manually, the same way the cart PRODUCTS list was built.
// To add more: open the product page, confirm "Заказать в 1 клік" works, copy its path.
(function () {
  const ONECLICK_PRODUCTS = [
    {
      key: 'mahle_kx33822d',
      trademark: 'Mahle/Knecht',
      ware_num: 'KX 338/22D',
      url: '/mahle-knecht-brand/filtr-toplivnyj-kx-338-22d-14316059/',
    },
  ];

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.ONECLICK_PRODUCTS = ONECLICK_PRODUCTS;
})();
