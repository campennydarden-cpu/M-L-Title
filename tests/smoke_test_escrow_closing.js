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

  // ============ Legacy migration: strip escrow, reload, verify normalizeOrder backfills it ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    delete orders[0].escrow;
    window.__genesisWriteOrdersRaw(orders);
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  let o = await getOrder();
  console.log('normalizeOrder backfills o.escrow on legacy order?', !!o.escrow && Array.isArray(o.escrow.charges) && !!o.escrow.cdf && !!o.escrow.hud);
  console.log('backfilled cdf.page1 has borrowerNames/sellerNames/lenderName (not totalClosingCosts)?', 'borrowerNames' in o.escrow.cdf.page1 && 'sellerNames' in o.escrow.cdf.page1 && 'lenderName' in o.escrow.cdf.page1 && !('totalClosingCosts' in o.escrow.cdf.page1));

  // ============ Granular migration: pre-2026-08-25 o.escrow with the OLD Page 2 column shape
  // (borrowerAmount/sellerAmount) and OLD Page 3 flat cash-to-close fields ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    const ord = orders[0];
    delete ord.escrow.cdf.page1.loanAmount;
    ord.escrow.cdf.page2.sectionA = [{ id: 'legacy1', description: 'Old Origination Fee', borrowerAmount: '500', sellerAmount: '0', paidByOthers: '0' }];
    delete ord.escrow.cdf.page3.payoffsAndPayments;
    delete ord.escrow.cdf.page3.calc;
    ord.escrow.cdf.page3.loanEstimateTotalCashToClose = '55000';
    window.__genesisWriteOrdersRaw(orders);
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('normalizeOrder backfills cdf.page1.loanAmount on legacy escrow?', o.escrow.cdf.page1.loanAmount === '');
  console.log('normalizeOrder migrates old Page 2 borrowerAmount -> borrowerAtClosing?', o.escrow.cdf.page2.sectionA[0].borrowerAtClosing === '500' && o.escrow.cdf.page2.sectionA[0].borrowerBeforeClosing === '' && !('borrowerAmount' in o.escrow.cdf.page2.sectionA[0]));
  console.log('normalizeOrder migrates old Page 2 sellerAmount -> sellerAtClosing?', o.escrow.cdf.page2.sectionA[0].sellerAtClosing === '0' && o.escrow.cdf.page2.sectionA[0].sellerBeforeClosing === '' && !('sellerAmount' in o.escrow.cdf.page2.sectionA[0]));
  console.log('normalizeOrder backfills Page 3 payoffsAndPayments?', Array.isArray(o.escrow.cdf.page3.payoffsAndPayments));
  console.log('normalizeOrder backfills Page 3 calc, carrying forward old loanEstimateTotalCashToClose as cashToCloseLE?', !!o.escrow.cdf.page3.calc && o.escrow.cdf.page3.calc.cashToCloseLE === '55000');
  let migratedPanelText = await page.textContent('.order-item');
  console.log('Migrated order still opens/renders w/o error (order list visible)?', migratedPanelText.length > 0);
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  // Description is an <input>'s value, not DOM text, so check it via inputValue; the computed
  // Subtotal is a static span and shows up fine in textContent.
  let migratedDescVal = await page.inputValue('#cdf2sectionA-desc-legacy1');
  let migratedCdf2Text = await page.textContent('#tab-panel');
  console.log('Migrated legacy Page 2 item renders w/o error, description intact, $500.00 subtotal?', migratedDescVal === 'Old Origination Fee' && migratedCdf2Text.includes('$500.00'));

  // Start a fresh order for the rest of the test (the migrated one has stale contact-less state);
  // clear storage first so the new order lands at index 0, matching getOrder()'s assumption.
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // ============ Nav gating ============
  await goTab('entry');
  await page.waitForTimeout(150);
  let navText = await page.textContent('.section-nav');
  console.log('Both CDF and HUD tabs visible when settlementType unset?', navText.includes('CDF Page 1') && navText.includes('Express HUD Page 1'));

  await goTab('escrowSettlementType');
  await page.waitForTimeout(150);
  await page.selectOption('#esc-settlementType', 'CDF');
  await page.waitForTimeout(150);
  navText = await page.textContent('.section-nav');
  console.log('CDF selected: CDF tabs shown, HUD tabs hidden?', navText.includes('CDF Page 1') && !navText.includes('Express HUD Page 1'));

  // Redirect check: go to a CDF tab, then switch to HUD, verify redirect away from now-hidden tab
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  await goTab('escrowSettlementType');
  await page.waitForTimeout(150);
  await page.selectOption('#esc-settlementType', 'HUD');
  await page.waitForTimeout(150);
  navText = await page.textContent('.section-nav');
  console.log('HUD selected: HUD tabs shown, CDF tabs hidden?', navText.includes('Express HUD Page 1') && !navText.includes('CDF Page 1'));
  let panelIntro = await page.textContent('#tab-panel');
  console.log('Redirect check: currently on Settlement Type screen (not stuck on now-hidden CDF tab)?', panelIntro.includes('Choose which closing disclosure form'));


  // Reset to unset so both families show for the rest of the test
  await page.selectOption('#esc-settlementType', '');
  await page.waitForTimeout(150);

  // ============ Order Entry / Contacts setup for auto-fill tests ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '300000');
  await page.fill('#f-loanAmount', '240000');
  await page.locator('#f-purchasePrice').blur();
  await page.waitForTimeout(150);

  await goTab('contacts');
  await page.waitForTimeout(150);
  async function addContact(role, name, extra) {
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(120);
    await page.selectOption('#cd-role', role);
    await page.waitForTimeout(120);
    await page.fill('#cd-name', name);
    if (extra) await extra();
    await page.click('#btn-save-contact');
    await page.waitForTimeout(120);
  }
  await addContact('Buyer/Borrower', 'Bob Buyer');
  await addContact('Seller', 'Sally Seller');
  await addContact('Lender', 'Acme Lending', async () => {
    await page.fill('#cd-address', '1 Bank Plaza');
    await page.fill('#cd-phone', '555-1000');
    await page.fill('#cd-email', 'lender@acme.example');
  });
  await addContact('Settlement Agent', 'M&L Title Agent', async () => {
    await page.fill('#cd-address', '99 Escrow Way');
    await page.fill('#cd-phone', '555-2000');
    await page.fill('#cd-email', 'agent@mltitle.example');
    await page.fill('#cd-licenseNumber', 'LIC-555');
  });

  // ============ CDF Page 1 auto-fill (independent copy) ============
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  let borrowerVal = await page.inputValue('#cdf1-borrowerNames');
  let sellerVal = await page.inputValue('#cdf1-sellerNames');
  let lenderVal = await page.inputValue('#cdf1-lenderName');
  let saleVal = await page.inputValue('#cdf1-salePrice');
  console.log('CDF1 borrowerNames auto-filled from Contacts?', borrowerVal === 'Bob Buyer');
  console.log('CDF1 sellerNames auto-filled from Contacts?', sellerVal === 'Sally Seller');
  console.log('CDF1 lenderName auto-filled from Contacts?', lenderVal === 'Acme Lending');
  console.log('CDF1 salePrice auto-filled from Purchase Price?', saleVal === '300000');

  // Independent copy: edit it, navigate away and back, should NOT get overwritten
  await page.fill('#cdf1-borrowerNames', 'Robert Buyer (edited)');
  await page.locator('#cdf1-borrowerNames').blur();
  await page.waitForTimeout(150);
  await goTab('entry');
  await page.waitForTimeout(120);
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  borrowerVal = await page.inputValue('#cdf1-borrowerNames');
  console.log('CDF1 borrowerNames independently editable (edit persists, not silently re-synced)?', borrowerVal === 'Robert Buyer (edited)');

  // Refill button recomputes and overwrites
  await page.click('#btn-refill-cdf1-parties');
  await page.waitForTimeout(150);
  borrowerVal = await page.inputValue('#cdf1-borrowerNames');
  console.log('Refill button recomputes borrowerNames from Contacts?', borrowerVal === 'Bob Buyer');

  // ============ CDF Page 5 contact auto-fill ============
  await goTab('escrowCdf5');
  await page.waitForTimeout(150);
  let lenderNameVal = await page.inputValue('#cdf5-lender-name');
  let lenderAddrVal = await page.inputValue('#cdf5-lender-address');
  let saNameVal = await page.inputValue('#cdf5-settlementAgent-name');
  let saLicenseVal = await page.inputValue('#cdf5-settlementAgent-license');
  console.log('CDF5 Lender name/address auto-filled from Contacts?', lenderNameVal === 'Acme Lending' && lenderAddrVal === '1 Bank Plaza');
  console.log('CDF5 Settlement Agent name/license auto-filled from Contacts?', saNameVal === 'M&L Title Agent' && saLicenseVal === 'LIC-555');

  // ============ HUD Page 1 auto-fill (place of settlement) ============
  await goTab('escrowHud1');
  await page.waitForTimeout(150);
  let posVal = await page.inputValue('#hud1-placeOfSettlement');
  console.log('HUD1 Place of Settlement auto-filled from Settlement Agent address?', posVal === '99 Escrow Way');

  // ============ Loan Amount field on Page 1 (new) ============
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  let loanAmtVal = await page.inputValue('#cdf1-loanAmount');
  console.log('CDF1 Loan Amount auto-filled from Order Entry?', loanAmtVal === '240000');

  // ============ CD-recreation line-item table: At-Closing/Before-Closing split (CDF Page 2, Section A) ============
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('CDF2 shows Borrower-Paid At Closing/Before Closing grouped columns?', panelText.includes('Borrower-Paid') && panelText.includes('At Closing') && panelText.includes('Before Closing'));
  console.log('CDF2 shows Seller-Paid columns (purchase mode)?', panelText.includes('Seller-Paid'));
  await page.fill('#cdf2sectionA-new-desc', 'Origination Fee');
  await page.fill('#cdf2sectionA-new-borrowerAtClosing', '750');
  await page.fill('#cdf2sectionA-new-borrowerBeforeClosing', '250');
  await page.fill('#cdf2sectionA-new-paidByOthers', '0');
  await page.click('[data-li-add="cdf2sectionA"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  let sectionA = o.escrow.cdf.page2.sectionA;
  console.log('CDF2 Section A line item added w/ At/Before split?', sectionA.length === 1 && sectionA[0].description === 'Origination Fee' && sectionA[0].borrowerAtClosing === '750' && sectionA[0].borrowerBeforeClosing === '250');
  panelText = await page.textContent('#tab-panel');
  console.log('CDF2 D. Total Loan Costs sums At + Before Closing ($1,000.00)?', panelText.includes('D. Total Loan Costs') && panelText.includes('$1,000.00'));
  console.log('CDF2 J. Total Closing Costs shown ($1,000.00)?', panelText.includes('J. Total Closing Costs') && panelText.includes('$1,000.00'));

  // ============ CDF Page 1 <-> Page 2 flow-down ============
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF1 Total Closing Costs reflects Page 2 line item ($1,000.00)?', panelText.includes('$1,000.00'));

  // Confirm Cash to Close flows to Page 1. K/L/M/N's Sale Price (K.01) and Loan Amount (L.02)
  // are now structured fixed rows that flow down automatically from Order Entry/Page 1 rather
  // than being typed in as free-text "Other Items" (that was the pre-K/L/M/N-restructure
  // workflow this test used to exercise) -- so K = salePrice(300000) + closing-costs-at-closing
  // J (750, from the Section A item added above) = 300,750; L = loanAmount(240000); K - L = 60,750.
  await goTab('escrowCdf3');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF3 Cash to/from Borrower computed as K - L ($60,750.00)?', panelText.includes('$60,750.00'));

  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF1 Cash to Close (Borrower) flows down from Page 3 ($60,750.00)?', panelText.includes('$60,750.00'));

  // ============ Calculating Cash to Close table (purchase mode, Page 3) ============
  await goTab('escrowCdf3');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Page 3 shows Calculating Cash to Close bar?', panelText.includes('Calculating Cash to Close'));
  console.log('Calculating Cash to Close: Total Closing Costs (J) Final computed from Page 2 ($1,000.00)?', panelText.includes('Total Closing Costs (J)') && panelText.includes('$1,000.00'));
  console.log('Calculating Cash to Close: Cash to Close Final matches K - L ($60,750.00)?', panelText.includes('$60,750.00'));
  await page.fill('#cdf3calc-totalClosingCostsLE', '950');
  await page.fill('#cdf3calc-closingCostsFinancedFinal', '100');
  await page.locator('#cdf3calc-closingCostsFinancedFinal').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Calculating Cash to Close LE + manual Final fields saved?', o.escrow.cdf.page3.calc.totalClosingCostsLE === '950' && o.escrow.cdf.page3.calc.closingCostsFinancedFinal === '100');

  // Delete the Section A item, confirm total goes back to $0.00
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  await page.click(`[data-li-del="cdf2sectionA:${sectionA[0].id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('CDF2 Section A line item deleted?', o.escrow.cdf.page2.sectionA.length === 0);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF2 Total Closing Costs back to $0.00 after delete?', panelText.includes('$0.00'));

  // ============ HUD Page 1/2 flow-down ============
  await goTab('escrowHud1');
  await page.waitForTimeout(150);
  await page.fill('#hud1gfb-new-desc', 'Contract Sales Price');
  await page.fill('#hud1gfb-new-amount', '300000');
  await page.click('[data-li-add="hud1gfb"]');
  await page.waitForTimeout(150);
  await page.fill('#hud1pfb-new-desc', 'Deposit');
  await page.fill('#hud1pfb-new-amount', '5000');
  await page.click('[data-li-add="hud1pfb"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('HUD1 Cash at Settlement (303) computed as 100 - 200 ($295,000.00)?', panelText.includes('$295,000.00'));

  await goTab('escrowHud2');
  await page.waitForTimeout(150);
  await page.fill('#hud2section1100-new-desc', 'Title Insurance Premium');
  await page.fill('#hud2section1100-new-borrowerAmount', '1200');
  await page.fill('#hud2section1100-new-sellerAmount', '0');
  await page.click('[data-li-add="hud2section1100"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('HUD2 1400 Total Settlement Charges (Borrower) reflects line item ($1,200.00)?', panelText.includes('$1,200.00'));

  // ============ Additional Title/Escrow Charges CRUD ============
  await goTab('escrowCharges');
  await page.waitForTimeout(150);
  await page.click('#btn-add-charge');
  await page.waitForTimeout(150);
  o = await getOrder();
  let chg = o.escrow.charges[0];
  console.log('Charge row added?', o.escrow.charges.length === 1);
  await page.fill(`#chg-desc-${chg.id}`, 'Wire Fee');
  await page.fill(`#chg-amount-${chg.id}`, '25');
  await page.locator(`#chg-amount-${chg.id}`).blur();
  await page.waitForTimeout(150);
  await page.check(`[data-chg-passthrough="${chg.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Charge fields + Pass-Through checkbox saved?', o.escrow.charges[0].description === 'Wire Fee' && o.escrow.charges[0].amount === '25' && o.escrow.charges[0].passThrough === true);
  await page.click(`[data-del-charge="${chg.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Charge row deleted?', o.escrow.charges.length === 0);

  // ============ Tax Proration split calculation ============
  await goTab('escrowTaxProrations');
  await page.waitForTimeout(150);
  await page.click('#btn-add-tax-proration');
  await page.waitForTimeout(150);
  o = await getOrder();
  let txp = o.escrow.taxProrations[0];
  await page.fill(`#txp-amt-${txp.id}`, '3650');
  await page.fill(`#txp-start-${txp.id}`, '2026-01-01');
  await page.fill(`#txp-end-${txp.id}`, '2026-12-31');
  await page.fill(`#txp-prdate-${txp.id}`, '2026-07-02');
  await page.locator(`#txp-prdate-${txp.id}`).blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  // 365 days total (2026-01-01..2026-12-31), $10/day. Settle 2026-07-02: seller days = round(days from 1/1 to 7/2) = 182, buyer = 183.
  console.log('Tax Proration computes the expected 182/183 day split?', panelText.includes('182 days Seller') && panelText.includes('183 days Buyer'));
  console.log('Tax Proration split shows dollar amounts formatted as money?', /Seller \$[\d,]+\.\d{2}, Buyer \$[\d,]+\.\d{2}/.test(panelText));

  // ============ Other Prorations (no type dropdown) ============
  await goTab('escrowOtherProrations');
  await page.waitForTimeout(150);
  await page.click('#btn-add-other-proration');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Other Proration row added (description-based, no type)?', o.escrow.otherProrations.length === 1 && !('type' in o.escrow.otherProrations[0]));

  // ============ Options screen ============
  await goTab('escrowOptions');
  await page.waitForTimeout(150);
  await page.selectOption('#esc-opt-cdfVersion', 'Seller CD');
  await page.fill('#esc-opt-notes', 'Test note');
  await page.locator('#esc-opt-notes').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Options screen CDF Version + Notes saved?', o.escrow.options.cdfVersion === 'Seller CD' && o.escrow.options.notes === 'Test note');

  // ============ Refi-mode branching (Loan Purpose = Refinance, derived per Cam's call) ============
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  await page.selectOption('#cdf1-loanPurpose', 'Refinance');
  await page.waitForTimeout(150);
  // bindText's change handler doesn't force a full re-render of the current screen (matches the
  // rest of the app -- only fields with a dedicated live-summary patch do that), so re-enter the
  // tab to see the label update, same as a real user tabbing away and back would.
  await goTab('entry');
  await page.waitForTimeout(120);
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF1: Cash to Close label drops "(Borrower)" in refi mode?', panelText.includes('Cash to Close') && !/Cash to Close\s*\(Borrower\)/.test(panelText));

  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  // Check the actual column-header cell text, not the panel-intro sentence (which itself mentions
  // "Seller-Paid" while explaining that it's dropped -- a plain substring check on the whole panel
  // would false-positive off that sentence).
  console.log('CDF2 refi mode: Seller At Closing / Seller Before Closing column headers dropped?', !panelText.includes('Seller At Closing') && !panelText.includes('Seller Before Closing'));
  console.log('CDF2 refi mode: Borrower At Closing / Before Closing column headers still shown?', panelText.includes('Borrower At Closing') && panelText.includes('Borrower Before Closing'));
  console.log('CDF2 refi mode: panel-intro flags refi mode?', panelText.includes('Refinance mode'));

  await goTab('escrowCdf3');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  // Same collision issue: the panel-intro sentence itself says "...replaced by a single Payoffs
  // and Payments table", so check for the K/L section-label text (only rendered in purchase mode)
  // instead of the phrase "Summaries of Transactions".
  console.log('CDF3 refi mode: Payoffs and Payments table shown?', panelText.includes('Payoffs and Payments'));
  console.log('CDF3 refi mode: K/L Due-from-Borrower sections NOT shown?', !panelText.includes('K. Due from Borrower at Closing') && !panelText.includes('L. Paid Already by or on Behalf of Borrower'));
  console.log('CDF3 refi mode: Calculating Cash to Close shows Loan Amount row?', panelText.includes('Loan Amount'));
  console.log('CDF3 refi mode: Calculating Cash to Close shows Total Payoffs and Payments (K) row?', panelText.includes('Total Payoffs and Payments (K)'));
  await page.fill('#cdf3payoffs-new-desc', 'Payoff existing first mortgage');
  await page.fill('#cdf3payoffs-new-amount', '150000');
  await page.click('[data-li-add="cdf3payoffs"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('CDF3 refi mode: Payoffs and Payments row saved?', o.escrow.cdf.page3.payoffsAndPayments.length === 1 && o.escrow.cdf.page3.payoffsAndPayments[0].amount === '150000');
  panelText = await page.textContent('#tab-panel');
  // Section A was deleted earlier in the test, so At-Closing costs = $0 here.
  // Cash to Close (refi, Final) = Loan Amount (240000) - At-Closing costs portion (0) - Payoffs total (150000) = 90,000.00
  console.log('CDF3 refi mode: Cash to Close computed as Loan Amount - At-Closing Costs - Payoffs ($90,000.00)?', panelText.includes('$90,000.00'));

  await goTab('escrowCdf5');
  await page.waitForTimeout(150);
  // Check actual field presence, not text -- the panel-intro sentence mentions "Real Estate Broker
  // (Buyer)/(Seller)" by name while explaining that the cards are dropped.
  let buyerBrokerCount = await page.locator('#cdf5-realEstateBrokerBuyer-name').count();
  let sellerBrokerCount = await page.locator('#cdf5-realEstateBrokerSeller-name').count();
  console.log('CDF5 refi mode: Real Estate Broker (Buyer)/(Seller) cards dropped?', buyerBrokerCount === 0 && sellerBrokerCount === 0);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF5 refi mode: Lender/Settlement Agent cards still shown?', panelText.includes('Lender') && panelText.includes('Settlement Agent'));

  // Switch back to Purchase, confirm the purchase-mode layout returns live
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  await page.selectOption('#cdf1-loanPurpose', 'Purchase');
  await page.waitForTimeout(150);
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Switching back to Purchase restores Seller-Paid columns on Page 2?', panelText.includes('Seller-Paid'));
  await goTab('escrowCdf3');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Switching back to Purchase restores Summaries of Transactions on Page 3?', panelText.includes('Summaries of Transactions') && !panelText.includes('Payoffs and Payments'));

  console.log('\\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
