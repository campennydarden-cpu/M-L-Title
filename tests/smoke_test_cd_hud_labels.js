// Covers the CD/HUD section-assignment <select> in cdAssignBlock() showing full plain-English
// CDF Page 2 section labels (e.g. "B. Services Borrower Did Not Shop For") instead of the bare
// "Section B" it used to render, while the underlying <option value="..."> stays unchanged
// ("sectionB" etc.) since other tests select by that value.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrder = () => page.evaluate(() => { if (window.__genesisFlushSave) window.__genesisFlushSave(); return JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]; });

  await page.addInitScript(() => { localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
  await page.goto(APP);
  await page.waitForTimeout(200);

  await page.click('#btn-new-order');
  await page.waitForTimeout(150);

  // Additional Title/Escrow Charges uses cdAssignBlock(..., ["sectionB","sectionC","sectionH"]) --
  // the one call site with all three of the multi-choice sections, so it exercises the full label
  // map in one dropdown.
  await goTab('escrowCharges');
  await page.waitForTimeout(150);
  await page.click('#btn-add-charge');
  await page.waitForTimeout(150);
  let o = await getOrder();
  let chg = o.escrow.charges[0];
  await page.fill(`#chg-desc-${chg.id}`, 'Wire Fee');
  await page.fill(`#chg-amount-${chg.id}`, '25.00');
  await page.locator(`#chg-amount-${chg.id}`).blur();
  await page.waitForTimeout(150);
  // Amount input only commits to state (save()) without a re-render; cdAssignBlock's assign row
  // only appears once amount is non-empty at render time, so force a fresh render pass by leaving
  // and returning to the tab (same as any real navigation would do).
  await goTab('orderInfo');
  await page.waitForTimeout(150);
  await goTab('escrowCharges');
  await page.waitForTimeout(150);

  const optionLocator = page.locator(`#chg-assign-${chg.id}-cdsection option`);
  console.log('Section dropdown offers 3 choices?', await optionLocator.count() === 3);

  const expected = {
    sectionB: 'B. Services Borrower Did Not Shop For',
    sectionC: 'C. Services Borrower Did Shop For',
    sectionH: 'H. Other'
  };
  const optValues = await optionLocator.evaluateAll(opts => opts.map(o => o.value));
  const optTexts = await optionLocator.evaluateAll(opts => opts.map(o => o.textContent));
  console.log('Option values unchanged (sectionB/sectionC/sectionH, still selectable by value)?',
    JSON.stringify(optValues) === JSON.stringify(['sectionB', 'sectionC', 'sectionH']));
  console.log('Option text for sectionB is full label, not "Section B"?', optTexts[0] === expected.sectionB);
  console.log('Option text for sectionC is full label, not "Section C"?', optTexts[1] === expected.sectionC);
  console.log('Option text for sectionH is full label, not "Section H"?', optTexts[2] === expected.sectionH);

  // Selecting by value (as every other existing test does) still works with the new option text.
  await page.selectOption(`#chg-assign-${chg.id}-cdsection`, 'sectionC');
  await page.waitForTimeout(100);
  o = await getOrder();
  chg = o.escrow.charges[0];
  console.log('selectOption by value still sets item.cdSection correctly?', chg.cdSection === 'sectionC');

  // CDF Page 2 section headings (tplEscrowCdf2) read from the same CD_SECTION_LABELS map now --
  // spot-check a couple to confirm the dedup didn't change the rendered text.
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  const panelText = await page.textContent('main');
  console.log('CDF Page 2 still shows full "B. Services Borrower Did Not Shop For" heading?', panelText.includes('B. Services Borrower Did Not Shop For'));
  console.log('CDF Page 2 still shows full "E. Taxes and Other Government Fees" heading?', panelText.includes('E. Taxes and Other Government Fees'));
  console.log('CDF Page 2 still shows full "H. Other" heading?', panelText.includes('H. Other'));

  console.log('\nPage errors:', errors.length ? errors : 'none');
  await browser.close();
})();
