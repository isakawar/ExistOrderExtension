// Garage / "pick request" flow — UA only, verified live on staging via DevTools:
//   POST /api/v1/customer/create-garage/   — add a car to the QA account's garage
//   GET  /api/v1/customer/get-garage/      — list cars already in the garage
//   POST /api/v1/customer/create-request/  — "запит на підбір" (request-by-VIN) for a garage car
// Account/session fields (user id, contract/agreement ids, price level, office) come from
// window.PRELOADED_STATE.session — same source ua-oneclick-service.js already reads.
(function () {
  // One fixed test car (Audi A4 (8W2, B9) 2.0 TFSI, modification id 2040) — avoids
  // implementing the full marka→model→year→engine→modification picker just for QA smoke
  // coverage. To use a different car, open its page in the manufacturer→model→year→engine
  // picker on the site and copy the modification id from the resulting
  // /api/v1/unicat/car-modification/ response.
  const GARAGE_TEST_CAR = { modification: 2040, year: '2016' };

  const REQUEST_PART_NAME = 'QA smoke test — тормозні колодки передні';

  self.SmokeUA = self.SmokeUA || {};
  self.SmokeUA.GARAGE_TEST_CAR = GARAGE_TEST_CAR;
  self.SmokeUA.GARAGE_REQUEST_PART_NAME = REQUEST_PART_NAME;
})();
