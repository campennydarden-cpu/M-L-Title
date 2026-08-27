// Covers the CD/HUD "Assign to CD/HUD" Payor-routing fix: assignItemToCdHud() used to hardcode
// every assigned amount into CDF borrowerAtClosing / HUD borrowerAmount regardless of who the
// source screen's Payor field said was actually paying -- so picking the Seller as Payor for the
// Owner's Title Insurance Premium (routine in many states) silently produced a materially wrong
// federal Closing Disclosure (money shown as coming from the Borrower that the Seller is actually
// paying). No prior smoke test exercised a non-Borrower Payor through the Assign-to-CD/HUD flow.
//
// Also covers: the refi fallback (no Seller-Paid columns on CDF_PAGE2_COLS_REFI -- a Seller Payor
// must land in Paid by Others instead of a key that doesn't exist there), the third-party fallback
// (Lender/Other payor -> CD Paid by Others, HUD gets neither column), the unchanged legacy default
// (no Payor selected at all -> Borrower, same as before this fix), and the "✓ Assigned" hint now
// naming the column.
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
  await page.goto(APP);
  await page.waitForTimeout(200);

  await page.click('#btn-new-order');
  await page.waitForTimeout(150);

  // ============ Order Entry: Simultaneous (Owner's + Loan cards both show) ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(100);
  let o = await getOrder();
  console.log('Fresh order defaults to Purchase (Seller-Paid columns available)?', o.transactionType === 'Purchase');

  // ============ Contacts: Seller + a third party (Lender) for Payor selectors ============
  await goTab('contacts');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'Marlene T. Cassidy');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Lender');
  await page.fill('#cd-name', 'Blue Ridge Community Bank');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'Daniel R. Whitfield');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // ============ Owner's Title Insurance Premium: Payor = Seller ============
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  await page.fill('#tp-owner-premium', '900.00');
  await page.locator('#tp-owner-premium').blur();
  await page.waitForTimeout(150);
  await page.selectOption('#tp-owner-payor-contact', { label: 'Marlene T. Cassidy — Seller' });
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Owner Payor resolves to the Seller contact?', o.titlePremiums.ownerPolicy.payor === 'Marlene T. Cassidy');

  await page.click('[data-cd-assign="tp-owner-assign"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  const ownerCdItem = o.escrow.cdf.page2.sectionH.find(it => it.description === "Owner's Title Insurance Premium");
  console.log('Seller-Payor premium lands in CDF sellerAtClosing (not borrowerAtClosing)?', !!ownerCdItem && ownerCdItem.sellerAtClosing === '900.00' && ownerCdItem.borrowerAtClosing === '');
  const ownerHudItem = o.escrow.hud.page2.section1100.find(it => it.description === "Owner's Title Insurance Premium");
  console.log('Seller-Payor premium mirrors onto HUD sellerAmount (not borrowerAmount)?', !!ownerHudItem && ownerHudItem.sellerAmount === '900.00' && ownerHudItem.borrowerAmount === '');

  let panelText = await page.textContent('main');
  console.log('"Assigned" hint names the Seller At Closing column?', panelText.includes('Assigned to CD Section H (Seller At Closing)'));

  // Confirm the Seller's own CDF/HUD totals actually pick this up (no total silently dropped) --
  // cdfSellerAtClosingCostsTotal() sums Section H's sellerAtClosing, and HUD 1100's own Seller
  // column total does the same.
  await goTab('escrowCdf2');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('CDF Section H shows the premium under Seller-Paid, not Borrower-Paid ($900.00)?', panelText.includes('$900.00'));

  // ============ Loan Policy Premium: no Payor selected at all -> unchanged Borrower default ============
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  await page.fill('#tp-loan-premium', '450.00');
  await page.locator('#tp-loan-premium').blur();
  await page.waitForTimeout(150);
  // bindText commits to the model + save()s but doesn't force a re-render (see the app's own
  // "misc fee amount fields" comment) -- the Assign control's sourceId is computed from the
  // template's last render, so it needs a nav-away/back (a full renderTabPanel) to pick up the
  // premium just typed, same round trip the existing Title Premiums smoke test relies on.
  await goTab('endorsements');
  await page.waitForTimeout(100);
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  await page.click('[data-cd-assign="tp-loan-premium-assign"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  const loanCdItem = o.escrow.cdf.page2.sectionC.find(it => it.description === "Lender's Title Insurance Premium");
  console.log('No Payor selected -> legacy Borrower-At-Closing default preserved?', !!loanCdItem && loanCdItem.borrowerAtClosing === '450.00' && loanCdItem.sellerAtClosing === '');

  // ============ Misc. Title Fee: Payor = Lender (third party) -> CD Paid by Others, HUD blank ============
  await page.click('#btn-add-tpmf');
  await page.waitForTimeout(150);
  o = await getOrder();
  const mf = o.titlePremiums.miscFees[0];
  await page.fill(`#tpmf-desc-${mf.id}`, 'Wire Fee');
  await page.fill(`#tpmf-amount-${mf.id}`, '25.00');
  await page.locator(`#tpmf-amount-${mf.id}`).blur();
  await page.waitForTimeout(150);
  await page.selectOption(`#tpmf-payor-${mf.id}-contact`, { label: 'Blue Ridge Community Bank — Lender' });
  await page.waitForTimeout(150);
  await page.click(`[data-cd-assign="tpmf-assign-${mf.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  const mfCdItem = o.escrow.cdf.page2.sectionC.find(it => it.description === 'Wire Fee');
  console.log('Lender (third-party) Payor routes onto CD Paid by Others?', !!mfCdItem && mfCdItem.paidByOthers === '25.00' && mfCdItem.borrowerAtClosing === '' && mfCdItem.sellerAtClosing === '');
  const mfHudItem = o.escrow.hud.page2.section1100.find(it => it.description === 'Wire Fee');
  console.log('Third-party Payor line on HUD has neither Borrower nor Seller amount set?', !!mfHudItem && mfHudItem.borrowerAmount === '' && mfHudItem.sellerAmount === '');

  // Third-party Paid by Others is excluded from the Borrower closing-costs total (D/I/J), matching
  // the real CD's convention -- confirm it doesn't leak into the Borrower total shown on Page 2.
  await goTab('escrowCdf2');
  await page.waitForTimeout(200);
  o = await getOrder();
  console.log('Paid-by-Others $25.00 excluded from CDF Borrower-At-Closing total?', o.escrow.cdf.page2.sectionC.reduce((s, it) => s + (parseFloat(it.borrowerAtClosing) || 0), 0) === 450);

  // ============ Refi fallback: a Seller Payor with no Seller-Paid CDF columns falls back safely ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  // Simultaneous Issue Fee only shows an assign control once a fee amount is entered.
  await page.fill('#tp-loan-simultaneousIssueFee', '15.00');
  await page.locator('#tp-loan-simultaneousIssueFee').blur();
  await page.waitForTimeout(150);
  await page.selectOption('#tp-loan-payor-contact', { label: 'Marlene T. Cassidy — Seller' });
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Refi file confirmed before assigning (cdfIsRefi drives the column fallback)?', o.transactionType === 'Refinance');
  await page.click('[data-cd-assign="tp-loan-si-assign"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  const siItem = o.escrow.cdf.page2.sectionC.find(it => it.description === 'Simultaneous Issue Fee');
  console.log('Refi + Seller Payor falls back to Paid by Others instead of a nonexistent sellerAtClosing key?', !!siItem && siItem.paidByOthers === '15.00' && !('sellerAtClosing' in siItem));

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
