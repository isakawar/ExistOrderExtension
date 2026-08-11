// PL has no fixed product catalogue like UA — products are discovered live via
// fulltext search (see pl-order-service.js). This is the search-term pool it
// cycles through, carried over from the original manual PL smoke script.
(function () {
  const SEARCH_TERMS = [
    'подушка двигателя',
    'ступица колеса',
    'подшипник ступицы',
    'рулевая тяга',
    'наконечник рулевой тяги',
    'сайлентблок',
    'глушитель',
    'катализатор',
    'радиатор кондиционера',
    'компрессор кондиционера',
    'помпа водяная',
    'термостат',
    'датчик коленвала',
    'датчик распредвала',
    'катушка зажигания',
    'провода зажигания',
    'сцепление комплект',
    'маховик',
    'шрус наружный',
    'пыльник шруса',
    'амортизатор багажника',
    'радиатор печки',
    'патрубок радиатора',
    'клапан egr',
    'турбина',
    'форсунка топливная',
    'бензонасос',
    'генератор',
    'реле стартера',
    'подушка коробки передач',
  ];

  // scenario-generator.js expects a flat PRODUCTS list it can cycle through
  // synchronously (same shape as UA's fixed catalogue: needs .trademark/.ware_num
  // for display). PL has no fixed catalogue, so each "product" here is really a
  // pending search — pl-order-service.js resolves it to a real product (via
  // fulltext search -> category -> product-index) at scenario execution time.
  const PRODUCTS = SEARCH_TERMS.map((term) => ({ searchTerm: term, trademark: 'Пошук:', ware_num: term }));

  self.SmokePL = self.SmokePL || {};
  self.SmokePL.SEARCH_TERMS = SEARCH_TERMS;
  self.SmokePL.PRODUCTS = PRODUCTS;
})();
