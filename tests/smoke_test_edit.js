const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goPrelim = () => page.click('[data-tab="prelim"]');

  // Deterministic flush hook (test-harness only, not shipped app code): save() now debounces
  // its localStorage write, so a read immediately after typing/clicking can otherwise race a
  // still-pending write. Patching getItem to flush first (via the app's exposed
  // window.__genesisFlushSave) makes every existing localStorage.getItem(...) read in this suite
  // deterministic without having to touch each read site individually. saveNow() itself already
  // no-ops this flush when there's nothing pending and a load error is unresolved, so this is safe
  // even for the corrupted-load-must-not-be-overwritten checks in smoke_test_backup_restore.js.
  // Pre-seed the "demo already seeded" flag via addInitScript (runs before genesis-app's own
  // script, on every navigation of this page) instead of the old clear()-then-reload() dance.
  // save()'s new beforeunload/visibilitychange flush hooks mean that dance is no longer reliable:
  // this is the FIRST-ever load for a fresh browser context (browser.newPage() creates an isolated
  // context each time), so with no flag yet present, load() auto-seeds a demo order and schedules
  // a debounced save; localStorage.clear() then wipes the flag from disk but NOT the demo order
  // still sitting in state.orders, and the very next reload's beforeunload flush faithfully (if
  // unhelpfully, here) writes that in-memory demo order straight back -- leaving a stray
  // "GEN-DEMO-1001" order alongside whatever this test creates instead of a clean slate. Setting
  // the flag before the app ever boots avoids the demo seed entirely, so there's nothing to race.
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
  await page.waitForTimeout(200);
  await goPrelim();
  await page.waitForTimeout(200);

  // --- Add a Security Instrument ---
  await page.selectOption('#si-instrumentType', 'Deed of Trust');
  await page.fill('#si-datedDate', '2020-01-05');
  await page.fill('#si-recordedDate', '2020-01-10');
  await page.fill('#si-instrumentNumber', 'INS-2020-0055');
  await page.fill('#si-mortgagor', 'John Doe');
  await page.fill('#si-mortgagee', 'Big Bank NA');
  await page.fill('#si-trustee', 'ABC Trustee Services');
  await page.fill('#si-consideration', '250000');
  await page.fill('#si-book', '4021');
  await page.fill('#si-page', '118');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  // No edit form visible yet
  console.log('Edit form NOT visible before clicking edit?', !(await page.$('[data-save-si]')));

  // Click edit
  await page.click('[data-edit-si]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking edit?', !!(await page.$('[data-save-si]')));

  // Find the SI id from the save button attribute
  const siId = await page.getAttribute('[data-save-si]', 'data-save-si');
  const mortgageePrefill = await page.inputValue('#esi-mortgagee-' + siId);
  console.log('Mortgagee prefilled correctly?', mortgageePrefill === 'Big Bank NA');
  const trusteePrefill = await page.inputValue('#esi-trustee-' + siId);
  console.log('Trustee prefilled correctly?', trusteePrefill === 'ABC Trustee Services');

  // Edit mortgagee and trustee, save
  await page.fill('#esi-mortgagee-' + siId, 'Second National Bank');
  await page.fill('#esi-trustee-' + siId, 'XYZ Trustee Co');
  await page.click('[data-save-si="' + siId + '"]');
  await page.waitForTimeout(150);

  console.log('Edit form gone after save?', !(await page.$('[data-save-si]')));
  const panelText1 = await page.textContent('#tab-panel');
  console.log('Row shows updated mortgagee?', panelText1.includes('Second National Bank'));
  console.log('Row shows updated trustee?', panelText1.includes('XYZ Trustee Co'));
  console.log('Row no longer shows old mortgagee?', !panelText1.includes('Big Bank NA'));

  const savedSi = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.securityInstruments[0]);
  console.log('Saved SI mortgagee correct?', savedSi.mortgagee === 'Second National Bank');
  console.log('Saved SI mortgagor unchanged?', savedSi.mortgagor === 'John Doe');
  console.log('Saved SI book unchanged?', savedSi.book === '4021');

  // --- Test Cancel discards changes ---
  await page.click('[data-edit-si]');
  await page.waitForTimeout(150);
  await page.fill('#esi-mortgagee-' + siId, 'SHOULD NOT SAVE');
  await page.click('[data-cancel-si="' + siId + '"]');
  await page.waitForTimeout(150);
  const savedSiAfterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.securityInstruments[0]);
  console.log('Cancel discards edits (mortgagee still Second National Bank)?', savedSiAfterCancel.mortgagee === 'Second National Bank');

  // --- Add a Lien and edit it --- (Tax Lien's field set is Debtor/Taxing Authority/Tax Type/Filed Date/Amount/Book/Page/Instrument)
  await page.selectOption('#lien-lienType', 'Tax Lien');
  await page.waitForTimeout(100);
  await page.fill('#lien-amount', '4500');
  await page.fill('#lien-filedDate', '2019-06-15');
  await page.fill('#lien-debtor', 'John Doe');
  await page.fill('#lien-taxingAuthority', 'NC Dept of Revenue');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  await page.click('[data-edit-lien]');
  await page.waitForTimeout(150);
  const lienId = await page.getAttribute('[data-save-lien]', 'data-save-lien');
  const amountPrefill = await page.inputValue('#elien-amount-' + lienId);
  console.log('Lien amount prefilled correctly?', amountPrefill === '4500');

  await page.fill('#elien-amount-' + lienId, '9999');
  await page.selectOption('#elien-lienType-' + lienId, 'Judgment');
  await page.waitForTimeout(100);
  // Amount is common to both Tax Lien and Judgment, so the live reshape should carry the just-typed 9999 forward.
  const amountAfterReshape = await page.inputValue('#elien-amount-' + lienId);
  console.log('Amount carried forward through live Type reshape?', amountAfterReshape === '9999');
  await page.fill('#elien-debtor-' + lienId, 'John Doe'); // debtor field re-rendered fresh by the reshape; re-affirm it
  await page.click('[data-save-lien="' + lienId + '"]');
  await page.waitForTimeout(150);

  const panelText2 = await page.textContent('#tab-panel');
  console.log('Lien row shows updated amount?', panelText2.includes('$9,999.00'));
  console.log('Lien row shows updated type?', panelText2.includes('Judgment:'));

  const savedLien = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.liens[0]);
  console.log('Saved lien amount correct?', savedLien.amount === '9999');
  console.log('Saved lien type correct?', savedLien.lienType === 'Judgment');
  console.log('Saved lien debtor unchanged?', savedLien.debtor === 'John Doe');

  // --- Add an Exception Matter and edit it ---
  await page.fill('#em-description', 'Utility easement along rear lot line');
  await page.fill('#em-recordedDate', '2005-03-01');
  await page.fill('#em-book', '900');
  await page.fill('#em-page', '12');
  await page.click('#btn-add-em');
  await page.waitForTimeout(150);

  await page.click('[data-edit-em]');
  await page.waitForTimeout(150);
  const emId = await page.getAttribute('[data-save-em]', 'data-save-em');
  await page.fill('#eem-description-' + emId, 'Utility easement along SIDE lot line');
  await page.click('[data-save-em="' + emId + '"]');
  await page.waitForTimeout(150);

  const panelText3 = await page.textContent('#tab-panel');
  console.log('Exception matter shows updated description?', panelText3.includes('SIDE lot line'));

  const savedEm = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.exceptionMatters[0]);
  console.log('Saved EM description correct?', savedEm.description === 'Utility easement along SIDE lot line');

  console.log('ERRORS:', errors);
  await browser.close();
})();
