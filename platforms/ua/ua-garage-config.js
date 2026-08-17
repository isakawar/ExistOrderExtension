// Garage / "pick request" flow — UA only, verified live on staging via DevTools:
//   POST /api/v1/customer/create-garage/   — add a car to the QA account's garage
//   GET  /api/v1/customer/get-garage/      — list cars already in the garage
//   POST /api/v1/customer/create-request/  — "запит на підбір" (request-by-VIN) for a garage car
// Account/session fields (user id, contract/agreement ids, price level, office) come from
// window.PRELOADED_STATE.session — same source ua-oneclick-service.js already reads.
(function () {
  // Pool of real, verified modification ids across different manufacturers (each POSTed
  // to /api/v1/customer/create-garage/ live on staging and confirmed 201) — avoids
  // implementing the full manufacturer→model→year→engine→modification picker just for QA
  // smoke coverage, while still exercising more than one car. One is picked at random per
  // run. To add more: GET /api/v1/unicat/car-modification/?model_type=<slug>&short=true
  // (model_type slug comes from /api/v1/unicat/car-universal/?manufacture=<x>&model_slug=<y>)
  // and copy an entry's `id` + `yearStart`.
  const GARAGE_TEST_CARS = [
    { modification: 2040, year: '2016', label: 'Audi A4 (8W2, B9) 2.0 TFSI' },
    { modification: 4145, year: '2014', label: 'BMW 3 (F30, F80) M3' },
    { modification: 136497, year: '2013', label: 'Volvo XC60 1 Van (156) D3' },
    { modification: 108134, year: '2017', label: 'Toyota Camry (V7, VA7, VH7) 2.0' },
    { modification: 136501, year: '2020', label: 'Volkswagen Golf 8 Variant (CG5) 1.0 eTSI' },
    { modification: 136072, year: '2020', label: 'Skoda Octavia 4 Combi (NX5) 1.0 TSI' },
    { modification: 135062, year: '2021', label: 'Mercedes C-Class (W206) C 180' },
    { modification: 133956, year: '2021', label: 'Honda Civic 2021 1.5 Turbo' },
    { modification: 107985, year: '2015', label: 'Mazda 6 Van/Universal (GJ) 2.0' },
    { modification: 134188, year: '2018', label: 'Hyundai Tucson crossover (TLE) 1.6 CRDi' },
  ];

  const REQUEST_PART_NAME = 'QA smoke test — тормозні колодки передні';

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.GARAGE_TEST_CARS = GARAGE_TEST_CARS;
  self.SmokeUA.GARAGE_REQUEST_PART_NAME = REQUEST_PART_NAME;
})();
