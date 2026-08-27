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

  // ============ Set up a purchase file: purchase price, loan amount, Refinance NOT selected ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '300000');
  await page.fill('#f-loanAmount', '240000');
  await page.locator('#f-loanAmount').blur();
  await page.waitForTimeout(150);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  let panelText = await page.textContent('#tab-panel');

  console.log('K shows Sale Price of Property flowed from Page 1?', panelText.includes('Sale Price of Property') && panelText.includes('$300,000.00'));
  console.log('L shows Loan Amount flowed from Page 1?', panelText.includes('Loan Amount') && panelText.includes('$240,000.00'));
  console.log('M also shows Sale Price of Property (mirrored)?', (panelText.match(/Sale Price of Property/g) || []).length === 2);
  console.log('K/L/M/N total rows present?', panelText.includes('Total Due from Borrower at Closing (K)') && panelText.includes('Total Paid Already by/on Behalf of Borrower (L)') && panelText.includes('Total Due to Seller at Closing (M)') && panelText.includes('Total Due from Seller at Closing (N)'));

  // ============ Fill Deposit, Seller Credit, mortgage payoffs ============
  await page.fill('#cdf3fixed-deposit', '10000');
  await page.locator('#cdf3fixed-deposit').blur();
  await page.waitForTimeout(150);
  await page.fill('#cdf3fixed-sellerCredit', '2000');
  await page.locator('#cdf3fixed-sellerCredit').blur();
  await page.waitForTimeout(150);
  await page.fill('#cdf3fixed-firstMortgagePayoff', '150000');
  await page.locator('#cdf3fixed-firstMortgagePayoff').blur();
  await page.waitForTimeout(150);

  let o = await getOrder();
  console.log('Deposit/Seller Credit/Payoff saved to page3.fixed?', o.escrow.cdf.page3.fixed.deposit === '10000' && o.escrow.cdf.page3.fixed.sellerCredit === '2000' && o.escrow.cdf.page3.fixed.firstMortgagePayoff === '150000');

  panelText = await page.textContent('#tab-panel');
  console.log('Seller Credit mirrored read-only in N column?', (panelText.match(/Seller Credit\b(?!s)/g) || []).length === 2);

  // K = 300000 (sale price) + 0 (closing costs J, none yet) = 300000
  // L = 10000 (deposit) + 240000 (loan amount) + 2000 (seller credit) = 252000
  // Cash to/from Borrower = K - L = 48000
  console.log('Cash to/from Borrower computed correctly (K-L = 48,000.00)?', panelText.includes('$48,000.00'));

  // ============ Tax proration NOT paid in advance (arrears -- flows to L credit / N charge) ============
  await goTab('escrowTaxProrations');
  await page.waitForTimeout(150);
  await page.click('#btn-add-tax-proration');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  const taxRows = await page.$$('.card');
  // Fill the first (only) proration row's fields
  await page.selectOption('select[id^="txp-type-"]', 'County Tax');
  await page.fill('input[id^="txp-amt-"]', '3650');
  await page.fill('input[id^="txp-start-"]', '2026-01-01');
  await page.fill('input[id^="txp-end-"]', '2026-12-31');
  await page.fill('input[id^="txp-prdate-"]', '2026-07-02');
  await page.locator('input[id^="txp-prdate-"]').blur();
  await page.waitForTimeout(150);
  // Leave "Paid in advance" UNCHECKED (arrears -- the default)

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Unpaid/arrears proration flows into "Adjustments for Items Unpaid by Seller"?', panelText.includes('Adjustments for Items Unpaid by Seller') && panelText.includes('County Tax'));
  console.log('Arrears proration does NOT appear under "Paid by Seller in Advance"?', !panelText.includes('Adjustments for Items Paid by Seller in Advance'));

  // ============ Switch that same proration to Paid in Advance -- should move from L/N to K/M ============
  await goTab('escrowTaxProrations');
  await page.waitForTimeout(150);
  await page.check('input[id^="txp-advance-"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('paidInAdvance saved as true?', o.escrow.taxProrations[0].paidInAdvance === true);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Now flows into "Adjustments for Items Paid by Seller in Advance" instead?', panelText.includes('Adjustments for Items Paid by Seller in Advance') && panelText.includes('County Tax'));
  console.log('No longer shows under "Unpaid by Seller"?', !panelText.includes('Adjustments for Items Unpaid by Seller'));

  // ============ Migration: simulate a pre-K/L/M/N-restructure order ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    delete orders[0].escrow.cdf.page3.fixed;
    orders[0].escrow.taxProrations.forEach(p => delete p.paidInAdvance);
    orders[0].escrow.otherProrations.push({ id: 'legacy1', description: 'Legacy HOA', annualAmount: '1200', periodStart: '2026-01-01', periodEnd: '2026-12-31', prorationDate: '2026-06-01' });
    delete orders[0].escrow.otherProrations[orders[0].escrow.otherProrations.length - 1].paidInAdvance;
    window.__genesisWriteOrdersRaw(orders);
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('normalizeOrder backfills page3.fixed on legacy order?', !!o.escrow.cdf.page3.fixed && o.escrow.cdf.page3.fixed.deposit === '');
  console.log('normalizeOrder backfills paidInAdvance=false on legacy proration items?', o.escrow.taxProrations[0].paidInAdvance === false && o.escrow.otherProrations[o.escrow.otherProrations.length - 1].paidInAdvance === false);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('App renders CDF Page 3 without error after legacy-order migration?', panelText.includes('Summaries of Transactions'));

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
