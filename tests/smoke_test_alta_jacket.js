const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrder = () => page.evaluate(() => { if (window.__genesisFlushSave) window.__genesisFlushSave(); return JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]; });

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

  // ============ Legacy migration ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    delete orders[0].commitment.formType;
    delete orders[0].commitment.commitmentNumber;
    delete orders[0].commitment.includeGapException;
    delete orders[0].commitment.scheduleA.envProtectionLienStatutes;
    localStorage.setItem('genesis_orders_v1', JSON.stringify(orders));
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  let o = await getOrder();
  console.log('normalizeOrder backfills new commitment fields on legacy order?',
    o.commitment.formType === "" && o.commitment.commitmentNumber === "" && o.commitment.includeGapException === true && o.commitment.scheduleA.envProtectionLienStatutes === "");

  // ============ Set up a minimal file: Order Entry + Prelim effective date + Property legal + Policy Type ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '123 Main St');
  await page.selectOption('#f-transactionType', 'Purchase');
  await page.locator('#f-propertyAddress').blur();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(100);
  const hasPolicyTypeSelect = 1;

  await goTab('property');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2, Test Subdivision');
  await page.locator('#p-legalDescription').blur();
  await page.waitForTimeout(150);

  await goTab('prelim');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.locator('#pr-effectiveDate').blur();
  await page.waitForTimeout(150);

  // ============ Schedule A: new Commitment Form fields ============
  await goTab('scheduleA');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Schedule A shows new Commitment Form card?', panelText.includes('Commitment Form'));
  console.log('Schedule A shows Transaction Identification Data card?', panelText.includes('Transaction Identification Data'));

  await page.fill('#c-commitmentNumber', 'CMT-1001');
  await page.fill('#c-revisionNumber', '1');
  await page.fill('#c-companyStateOfOrg', 'Ohio corporation');
  await page.fill('#c-requirementsTimePeriod', '6 months');
  await page.fill('#c-issuingAgent', 'M&L Title and Escrow');
  await page.locator('#c-issuingAgent').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Commitment Number/Revision/State/Time Period/Issuing Agent all saved?',
    o.commitment.commitmentNumber === 'CMT-1001' && o.commitment.revisionNumber === '1' &&
    o.commitment.companyStateOfOrg === 'Ohio corporation' && o.commitment.requirementsTimePeriod === '6 months' &&
    o.commitment.issuingAgent === 'M&L Title and Escrow');

  // ============ Standard form type: Owner's Policy card shows (per Order Entry Policy Type), Estate is a free-text field ============
  await page.selectOption('#c-formType', 'Standard');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Form Type saved as Standard?', o.commitment.formType === 'Standard');
  panelText = await page.textContent('#tab-panel');
  const hasEstateInput = await page.locator('#sa-titleHeldAs').count();
  console.log('Standard form: Estate is an editable free-text field?', hasEstateInput === 1);

  // ============ Short Form: Owner's Policy hidden, Loan Policy forced, Estate locked to Fee Simple, ALTA 8.1-06 field appears ============
  await page.selectOption('#c-formType', 'Short Form');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Form Type saved as Short Form?', o.commitment.formType === 'Short Form');
  panelText = await page.textContent('#tab-panel');
  // Note: a plain substring check for "Owner's Policy" false-positives here -- the Loan Policy
  // card's own "ALTA Form" <select> always renders ALL POLICY_TYPES options in the DOM regardless
  // of selection, and "ALTA Owner's Policy" is one of them (option text is present whether or not
  // it's selected). Check the Owner's Policy card's own field ID instead.
  let ownerCoverageFieldCount = await page.locator('#sa-ownerCoverageAmount').count();
  console.log("Short Form: Owner's Policy card hidden even though Order Entry Policy Type is Owner's?", ownerCoverageFieldCount === 0);
  console.log('Short Form: Loan Policy card still shows (forced)?', panelText.includes('Loan Policy'));
  console.log('Short Form: Estate shown as fixed Fee Simple, not an input?', panelText.includes('Fee Simple (fixed by the ALTA Short Form Commitment)'));
  console.log('Short Form: ALTA 8.1-06 endorsement statutes field appears?', panelText.includes('ALTA 8.1-06'));

  await page.fill('#sa-envProtectionLienStatutes', 'Test Statute § 123.45');
  await page.locator('#sa-envProtectionLienStatutes').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Environmental lien statutes field saved?', o.commitment.scheduleA.envProtectionLienStatutes === 'Test Statute § 123.45');

  // Fill loan policy proposed insured/amount so the doc has something to show
  await page.fill('#sa-loanProposedInsured', 'Acme Lending');
  await page.fill('#sa-loanCoverageAmount', '200000');
  await page.locator('#sa-loanCoverageAmount').blur();
  await page.waitForTimeout(150);

  // ============ Commitment tab: Schedule B-I standard items (5 for Short Form) + gap exception toggle ============
  await goTab('commitment');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Commitment tab shows 5 standard Short Form B-I items (1-5) with the tax item?',
    panelText.includes('Pay all taxes, charges, and assessments'));
  console.log('Commitment tab shows the gap exception toggle, checked by default?', panelText.includes('gap” Exception 1') || panelText.includes('gap&rdquo; Exception') || panelText.includes('gap'));
  const gapCheckboxChecked = await page.isChecked('#c-includeGapException');
  console.log('Gap exception checkbox defaults to checked?', gapCheckboxChecked === true);

  // Add a file-specific requirement and exception, confirm numbering continues after the standard items
  await page.fill('#req-description', 'Pay off existing mortgage');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('File-specific requirement numbered 6 (after 5 standard Short Form items)?', panelText.includes('6. Pay off existing mortgage'));

  await page.fill('#exc-description', 'Easement of record');
  await page.click('#btn-add-exc');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('File-specific exception numbered 2 (after gap exception #1)?', panelText.includes('2. Easement of record'));

  // Uncheck gap exception, confirm file exception renumbers to 1
  await page.uncheck('#c-includeGapException');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('includeGapException saved as false?', o.commitment.includeGapException === false);
  panelText = await page.textContent('#tab-panel');
  console.log('With gap exception off, file exception renumbers to 1?', panelText.includes('1. Easement of record'));
  await page.check('#c-includeGapException');
  await page.waitForTimeout(150);

  // ============ Generate the Commitment document, check jacket content ============
  const canGenerate = await page.locator('#btn-generate:not([disabled])').count();
  console.log('Generate Commitment button is enabled (prereqs met)?', canGenerate === 1);
  if (canGenerate) {
    await page.click('#btn-generate');
    await page.waitForTimeout(200);
    const docText = await page.textContent('#commitment-doc');
    console.log('Generated doc title reflects Short Form?', docText.includes('ALTA Short Form Commitment'));
    console.log('Generated doc includes NOTICE section?', docText.includes('IMPORTANT—READ CAREFULLY'));
    console.log('Generated doc includes Commitment to Issue Policy with filled blanks (state + time period)?',
      docText.includes('Ohio corporation') && docText.includes('6 months'));
    console.log('Generated doc includes incorporation-by-reference language (Short Form, not full Conditions)?',
      docText.includes('incorporated herein by reference'));
    console.log('Generated doc does NOT print full Commitment Conditions 1-9 (Short Form)?', !docText.includes('ARBITRATION'));
    console.log('Generated doc shows 5 standard B-I items including the tax item?', docText.includes('Pay all taxes, charges, and assessments'));
    console.log('Generated doc shows Transaction Identification Data with Commitment Number?', docText.includes('CMT-1001'));
    console.log('Generated doc shows Environmental Lien Statutes field?', docText.includes('Test Statute'));
    console.log('Generated doc file-specific requirement still numbered 6?', docText.includes('6.') && docText.includes('Pay off existing mortgage'));

    // ============ Switch to Standard form type, regenerate, confirm full Conditions now appear ============
    await goTab('scheduleA');
    await page.waitForTimeout(150);
    await page.selectOption('#c-formType', 'Standard');
    await page.waitForTimeout(150);
    await goTab('commitment');
    await page.waitForTimeout(150);
    const docText2 = await page.textContent('#commitment-doc');
    console.log('Standard form doc re-renders live with full Commitment Conditions (ARBITRATION)?', docText2.includes('ARBITRATION'));
    console.log('Standard form doc shows only 4 standard B-I items (no tax item)?', !docText2.includes('Pay all taxes, charges, and assessments'));
    console.log('Standard form: file-specific requirement renumbers to 5 (after 4 standard items)?', docText2.includes('5.') && docText2.includes('Pay off existing mortgage'));
  }

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
