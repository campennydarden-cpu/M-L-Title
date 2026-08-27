// Covers two 2026-08-26 additions from the "close remaining gaps in built screens" pass:
//   1. Express HUD Pages 1-3 recreated with the same .cdform-* CD-recreation chrome the CDF
//      pages already had (previously plain .card-based) -- confirms the visual/structural
//      change didn't break field IDs, line-item wiring, or computed totals.
//   2. CDF Page 1's Projected Payments section gained an optional multi-period breakout
//      (Add Payment Period) for ARM/step loans, while staying backward-compatible with the
//      original single-period fields for a plain fixed-rate file.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrder = () => page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // ============ HUD Page 1: CD-recreation chrome ============
  await goTab('escrowHud1');
  await page.waitForTimeout(150);
  let wrapCount = await page.locator('.cdform-wrap').count();
  console.log('HUD1 uses cdform-wrap chrome (no longer plain .card sections)?', wrapCount >= 4);
  let panelText = await page.textContent('#tab-panel');
  console.log('HUD1 header still shows Loan/Settlement info blocks?', panelText.includes('Loan') && panelText.includes('Settlement'));

  await page.fill('#hud1gfb-new-desc', 'Contract Sales Price');
  await page.fill('#hud1gfb-new-amount', '300000');
  await page.click('[data-li-add="hud1gfb"]');
  await page.waitForTimeout(150);
  let o = await getOrder();
  console.log('HUD1 line-item wiring unaffected by styling swap (item saved)?', o.escrow.hud.page1.grossDueToSeller !== undefined && o.escrow.hud.page1.grossDueFromBorrower.length === 1 && o.escrow.hud.page1.grossDueFromBorrower[0].description === 'Contract Sales Price');
  panelText = await page.textContent('#tab-panel');
  console.log('HUD1 303 Cash at Settlement rendered as a computed total row?', panelText.includes('303') || panelText.includes('Cash') );

  // ============ HUD Page 2: CD-recreation chrome + totals ============
  await goTab('escrowHud2');
  await page.waitForTimeout(150);
  wrapCount = await page.locator('.cdform-wrap').count();
  console.log('HUD2 uses cdform-wrap chrome for all seven sections + 1400 total?', wrapCount >= 8);
  await page.fill('#hud2section1100-new-desc', 'Title Insurance Premium');
  await page.fill('#hud2section1100-new-borrowerAmount', '1200');
  await page.fill('#hud2section1100-new-sellerAmount', '300');
  await page.click('[data-li-add="hud2section1100"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('HUD2 1400 total row (.cdform-row.total) reflects Borrower amount ($1,200.00)?', panelText.includes('$1,200.00'));
  console.log('HUD2 1400 total row reflects Seller amount ($300.00)?', panelText.includes('$300.00'));

  // ============ HUD Page 3: CD-recreation chrome, GFE Comparison "Increase" still computes ============
  await goTab('escrowHud3');
  await page.waitForTimeout(150);
  wrapCount = await page.locator('.cdform-wrap').count();
  console.log('HUD3 uses cdform-wrap chrome for Loan Terms + GFE Comparison?', wrapCount === 2);
  await page.fill('#hud3-gfeCannotIncrease-gfeAmount', '500');
  await page.fill('#hud3-gfeCannotIncrease-hud1Amount', '575');
  await page.locator('#hud3-gfeCannotIncrease-hud1Amount').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('HUD3 GFE Comparison fields saved under new cdform row layout?', o.escrow.hud.page3.gfeCannotIncrease.gfeAmount === '500' && o.escrow.hud.page3.gfeCannotIncrease.hud1Amount === '575');
  // bindText doesn't force a re-render (same pre-existing app convention) -- tab away/back to see the computed Increase column.
  await goTab('entry');
  await page.waitForTimeout(120);
  await goTab('escrowHud3');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('HUD3 GFE "Increase" column still computes (hud1Amount - gfeAmount = $75.00)?', panelText.includes('$75.00'));

  // ============ CDF Page 1: Projected Payments stays single-period by default ============
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  let period1LabelCount = await page.locator('#cdf1-pp1-label').count();
  console.log('CDF1 Projected Payments: Period 1 label hidden when no extra periods exist (plain fixed-rate default)?', period1LabelCount === 0);
  await page.fill('#cdf1-principalInterestAmount', '1200');
  await page.fill('#cdf1-mortgageInsuranceAmount', '150');
  await page.fill('#cdf1-estimatedEscrowAmount', '300');
  await page.fill('#cdf1-estimatedTotalMonthlyPayment', '1650');
  await page.locator('#cdf1-estimatedTotalMonthlyPayment').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('CDF1 single-period Projected Payments fields still save exactly as before?', o.escrow.cdf.page1.principalInterestAmount === '1200' && o.escrow.cdf.page1.estimatedTotalMonthlyPayment === '1650');
  console.log('CDF1 new multi-period fields default to empty/no extra periods on a plain order?', o.escrow.cdf.page1.projectedPaymentsPeriod1Label === '' && o.escrow.cdf.page1.projectedPaymentsExtra.length === 0);

  // ============ CDF Page 1: Add Payment Period (ARM/step-loan breakout) ============
  await page.click('#btn-add-pp');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Add Payment Period creates one extra period?', o.escrow.cdf.page1.projectedPaymentsExtra.length === 1);
  period1LabelCount = await page.locator('#cdf1-pp1-label').count();
  console.log('Period 1 label field appears once a second period exists?', period1LabelCount === 1);
  await page.fill('#cdf1-pp1-label', 'Years 1-7');
  let pp1id = o.escrow.cdf.page1.projectedPaymentsExtra[0].id;
  await page.fill(`#cdf1-ppx-label-${pp1id}`, 'Years 8-30');
  await page.fill(`#cdf1-ppx-pi-${pp1id}`, '1450');
  await page.fill(`#cdf1-ppx-mi-${pp1id}`, '0');
  await page.fill(`#cdf1-ppx-esc-${pp1id}`, '300');
  await page.fill(`#cdf1-ppx-total-${pp1id}`, '1750');
  await page.locator(`#cdf1-ppx-total-${pp1id}`).blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Period 1 label saved?', o.escrow.cdf.page1.projectedPaymentsPeriod1Label === 'Years 1-7');
  console.log('Extra period fields (label + 4 amounts) all saved?', o.escrow.cdf.page1.projectedPaymentsExtra[0].label === 'Years 8-30' && o.escrow.cdf.page1.projectedPaymentsExtra[0].principalInterestAmount === '1450' && o.escrow.cdf.page1.projectedPaymentsExtra[0].estimatedTotalMonthlyPayment === '1750');
  console.log('Original Period 1 amount fields untouched by adding a period?', o.escrow.cdf.page1.principalInterestAmount === '1200' && o.escrow.cdf.page1.estimatedTotalMonthlyPayment === '1650');
  let period1LabelVal = await page.inputValue('#cdf1-pp1-label');
  let period2LabelVal = await page.inputValue(`#cdf1-ppx-label-${pp1id}`);
  console.log('Both period labels render on screen?', period1LabelVal === 'Years 1-7' && period2LabelVal === 'Years 8-30');
  console.log('Add Payment Period button still present to add a 3rd period?', (await page.locator('#btn-add-pp').count()) === 1);

  // A second period, then remove it -- confirm delete wiring and re-render both work.
  await page.click('#btn-add-pp');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('A third period can be added?', o.escrow.cdf.page1.projectedPaymentsExtra.length === 2);
  let pp2id = o.escrow.cdf.page1.projectedPaymentsExtra[1].id;
  await page.click(`[data-del-pp="${pp2id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Removing a period leaves the other extra period intact?', o.escrow.cdf.page1.projectedPaymentsExtra.length === 1 && o.escrow.cdf.page1.projectedPaymentsExtra[0].id === pp1id);

  // Remove the last extra period -- Period 1 label field should disappear again, matching the
  // plain single-period default a fixed-rate file should see.
  await page.click(`[data-del-pp="${pp1id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Removing all extra periods empties the array?', o.escrow.cdf.page1.projectedPaymentsExtra.length === 0);
  period1LabelCount = await page.locator('#cdf1-pp1-label').count();
  console.log('Period 1 label field hides again once back to single-period?', period1LabelCount === 0);
  o = await getOrder();
  console.log('Single-period amount fields survive the whole add/remove cycle untouched?', o.escrow.cdf.page1.principalInterestAmount === '1200' && o.escrow.cdf.page1.estimatedTotalMonthlyPayment === '1650');

  // ============ Legacy-order migration backfill for the new fields ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    delete orders[0].escrow.cdf.page1.projectedPaymentsPeriod1Label;
    delete orders[0].escrow.cdf.page1.projectedPaymentsExtra;
    localStorage.setItem('genesis_orders_v1', JSON.stringify(orders));
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('normalizeOrder backfills projectedPaymentsPeriod1Label on a legacy order?', o.escrow.cdf.page1.projectedPaymentsPeriod1Label === '');
  console.log('normalizeOrder backfills projectedPaymentsExtra as an empty array on a legacy order?', Array.isArray(o.escrow.cdf.page1.projectedPaymentsExtra) && o.escrow.cdf.page1.projectedPaymentsExtra.length === 0);
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Legacy order\'s CDF1 Projected Payments panel renders without error after backfill?', panelText.includes('Projected Payments'));

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
