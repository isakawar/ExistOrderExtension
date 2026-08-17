// Garage / "pick request" flow — verified live on stagingpl.exist.ua the same way as
// platforms/ua/ua-garage-config.js: identical endpoints, identical PRELOADED_STATE.session
// shape, and (confirmed live) the same TecDoc modification ids resolve on both platforms —
// so this pool is a direct copy of the UA one, each re-verified with its own 201 on PL.
(function () {
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

  const REQUEST_PART_NAME = 'QA smoke test — тормозные колодки передние';

  self.SmokePL = self.SmokePL || {};
  self.SmokePL.GARAGE_TEST_CARS = GARAGE_TEST_CARS;
  self.SmokePL.GARAGE_REQUEST_PART_NAME = REQUEST_PART_NAME;
})();
