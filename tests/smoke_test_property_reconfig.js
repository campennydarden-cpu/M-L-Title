const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

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
  // Deterministic legacy-migration injection helper (test-harness only): this suite writes a
  // legacy-shaped order straight into localStorage, bypassing the running app's in-memory
  // state.orders entirely, then reload()s to exercise normalizeOrder(). But save()'s new
  // beforeunload flush is registered on THIS (about to be replaced) page and still holds the
  // pre-injection state.orders -- reload() fires beforeunload before navigating, so that stale
  // flush would otherwise land AFTER our raw write and silently clobber the legacy JSON we're
  // deliberately injecting. Blocking further writes to the key right after our own write closes
  // that window; the fresh page loaded by reload() gets an unblocked Storage.prototype again.
  await page.addInitScript(() => {
    window.__genesisWriteOrdersRaw = function(orders){
      localStorage.setItem('genesis_orders_v1', JSON.stringify(orders));
      var origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, val){
        if (key === 'genesis_orders_v1') return;
        return origSetItem.call(this, key, val);
      };
    };
  });
  await page.goto(APP);
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // --- Fill Order Entry address fields for prefill test ---
  await page.fill('#f-propertyAddress', '1421 Cypress Bend Ct.');
  await page.fill('#f-city', 'Austin');
  await page.fill('#f-county', 'Travis');
  await page.fill('#f-stateCode', 'TX');
  await page.fill('#f-zip', '78701');
  await page.fill('#f-parcelNumber', 'PCL-9988');
  await page.click('body');
  await page.waitForTimeout(150);

  // --- Sub-tab presence / navigation ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Property tab renders w/o error?', !panelText.includes('Something went wrong'));

  const subtabLabels = await page.$$eval('.subtab-btn', els => els.map(e => e.textContent));
  console.log('Three sub-tabs present w/ correct labels?', JSON.stringify(subtabLabels) === JSON.stringify(['Identification', 'Legal Description', 'Plat / Survey Matters']));
  console.log('Identification sub-tab active by default?', await page.$eval('[data-subtab="identification"]', el => el.classList.contains('active')));

  // --- Prefill from Order Entry (non-destructive one-time) ---
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('property.city prefilled from Order Entry?', saved.property.city === 'Austin');
  console.log('property.county prefilled?', saved.property.county === 'Travis');
  console.log('property.stateCode prefilled?', saved.property.stateCode === 'TX');
  console.log('property.zip prefilled?', saved.property.zip === '78701');
  console.log('property.parcelNumber prefilled?', saved.property.parcelNumber === 'PCL-9988');
  console.log('property.houseNumber NOT auto-parsed (blank)?', saved.property.houseNumber === '');
  console.log('property.streetName NOT auto-parsed (blank)?', saved.property.streetName === '');

  // Reference note to original Order Entry address shows on tab 1
  console.log('Identification tab shows on-file Order Entry address reference?', panelText.includes('1421 Cypress Bend Ct.'));

  // --- Tab 1 fields: fill House Number/Street/Suffix/Directional/Section/Township/Range/Brief Legal/Block-Lot/Use Type ---
  await page.fill('#p-houseNumber', '1421');
  await page.fill('#p-streetName', 'Cypress Bend');
  await page.fill('#p-streetSuffix', 'Ct.');
  await page.fill('#p-directional', 'N');
  await page.fill('#p-section', '14');
  await page.fill('#p-township', '2N');
  await page.fill('#p-range', '3E');
  await page.fill('#p-briefLegal', 'Lot 14, Block 3, Cypress Bend');
  await page.fill('#p-blockLot', 'Blk 3 / Lot 14');
  await page.selectOption('#p-useType', 'Residential');
  await page.click('body');
  await page.waitForTimeout(150);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('houseNumber saved?', saved.property.houseNumber === '1421');
  console.log('streetName saved?', saved.property.streetName === 'Cypress Bend');
  console.log('streetSuffix saved?', saved.property.streetSuffix === 'Ct.');
  console.log('directional saved?', saved.property.directional === 'N');
  console.log('section saved?', saved.property.section === '14');
  console.log('township saved?', saved.property.township === '2N');
  console.log('range saved?', saved.property.range === '3E');
  console.log('briefLegal saved?', saved.property.briefLegal === 'Lot 14, Block 3, Cypress Bend');
  console.log('blockLot saved?', saved.property.blockLot === 'Blk 3 / Lot 14');
  console.log('useType saved?', saved.property.useType === 'Residential');

  // Editing an Identification field should NOT clobber other subtab fields already filled
  console.log('city preserved after tab-1 edits?', saved.property.city === 'Austin');

  // --- Non-destructive prefill: manual edit survives later Order Entry change ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-city', 'Dallas');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('property.city NOT clobbered by later Order Entry change (still Austin)?', saved.property.city === 'Austin');
  console.log('Order Entry city updated to Dallas?', saved.city === 'Dallas');

  // --- Sub-tab 2: Legal Description ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.selectOption('#dv-instrumentType', 'Warranty Deed');
  await page.fill('#dv-grantorName', 'Prior Grantor Inc');
  await page.fill('#dv-name', 'Current Owner LLC');
  await page.fill('#dv-recordedDate', '2018-03-01');
  await page.fill('#dv-book', '10');
  await page.fill('#dv-page', '20');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  console.log('Legal Description sub-tab active after click?', await page.$eval('[data-subtab="legal"]', el => el.classList.contains('active')));
  panelText = await page.textContent('#tab-panel');
  console.log('Legal Description sub-tab shows Parcel Number field?', !!(await page.$('#p-parcelNumber')));
  console.log('Legal Description sub-tab shows pulled Derivation Clause?', panelText.includes('Derivation Clause') && panelText.includes('Current Owner LLC'));
  console.log('Legal Description sub-tab mentions disclaimer note?', panelText.includes('no additional coverage is provided'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('parcelNumber prefilled onto Legal tab from Order Entry?', saved.property.parcelNumber === 'PCL-9988');

  await page.fill('#p-legalDescription', 'Lot 14, Block 3, Cypress Bend, a subdivision in Travis County, Texas');
  await page.click('body');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('legalDescription saved?', saved.property.legalDescription.indexOf('Cypress Bend') !== -1);

  // --- Sub-tab 3: Plat / Survey Matters ---
  await page.click('[data-subtab="platSurvey"]');
  await page.waitForTimeout(150);
  console.log('Plat/Survey sub-tab active after click?', await page.$eval('[data-subtab="platSurvey"]', el => el.classList.contains('active')));
  console.log('Plat/Survey field present?', !!(await page.$('#p-platSurvey')));
  await page.fill('#p-platSurvey', 'Book 12, Page 45');
  await page.click('body');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('platSurvey saved?', saved.property.platSurvey === 'Book 12, Page 45');

  // --- Disclaimer appears in generated Commitment doc ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Commitment summary card shows disclaimer (pre-generate)?', panelText.includes('no additional coverage is provided'));
  await page.click('#btn-generate');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Generated Commitment doc Legal Description includes disclaimer?', panelText.includes('Cypress Bend, a subdivision in Travis County, Texas However by showing this, no additional coverage is provided.'));

  // --- Migration test: old order missing new property sub-fields ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDPROP', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' },
      property: { briefLegal: 'Old Brief Legal', legalDescription: 'Old Legal Desc', blockLot: '', platSurvey: '', useType: 'Residential' }
    }];
    window.__genesisWriteOrdersRaw(old);
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDPROP');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Identification sub-tab renders w/o crash?', !panelText.includes('Something went wrong'));
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Legal Description sub-tab renders w/o crash (Old Legal Desc preserved)?', !panelText.includes('Something went wrong') && panelText.includes('Old Legal Desc'));
  await page.click('[data-subtab="platSurvey"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Plat/Survey sub-tab renders w/o crash?', !panelText.includes('Something went wrong'));

  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Old order property.houseNumber backfilled to ""?', savedOld.property.houseNumber === '');
  console.log('Old order property.section backfilled to ""?', savedOld.property.section === '');
  console.log('Old order property.parcelNumber backfilled to ""?', savedOld.property.parcelNumber === '');
  console.log('Old order o.city backfilled to ""?', savedOld.city === '');

  console.log('ERRORS:', errors);
  await browser.close();
})();
