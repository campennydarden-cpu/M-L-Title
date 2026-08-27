// Covers the 2026-08-26 rebuild of Additional Title/Escrow Charges (contact-selector Payor/Payee
// + the "Assign to CD/HUD" control offering Section B, C, or H) and the brand-new Recording screen
// (Recording Fees, Transfer Taxes, Stamp Taxes -- flat/per-page and basis*rate arithmetic, all of
// which report to CD Section E / HUD 1200). Also verifies that deleting an assigned CD/HUD line
// frees its source item to be reassigned (the shared isAssignedToCdHud dedup mechanism).
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

  // ============ Contacts (for Payor/Payee selectors) ============
  await goTab('contacts');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'Daniel R. Whitfield');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // ============ Additional Title/Escrow Charges ============
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

  // Payor via contact selector, Payee via "Other" free text
  await page.selectOption(`#chg-payor-${chg.id}-contact`, { label: 'Daniel R. Whitfield — Buyer/Borrower' });
  await page.waitForTimeout(150);
  await page.selectOption(`#chg-payee-${chg.id}-contact`, '__other__');
  await page.waitForTimeout(150);
  await page.fill(`#chg-payee-${chg.id}-other`, 'Wire Service Co');
  await page.locator(`#chg-payee-${chg.id}-other`).blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  chg = o.escrow.charges[0];
  console.log('Charge Payor resolves from selected contact?', chg.payor === 'Daniel R. Whitfield');
  console.log('Charge Payee resolves from "Other" free text?', chg.payee === 'Wire Service Co');

  // Assign control offers Section B/C/H (3 choices)
  console.log('Charge assign control offers a Section dropdown with 3 choices?', await page.locator(`#chg-assign-${chg.id}-cdsection option`).count() === 3);
  await page.selectOption(`#chg-assign-${chg.id}-cdsection`, 'sectionH');
  await page.waitForTimeout(100);
  await page.click(`[data-cd-assign="chg-assign-${chg.id}"]`);
  await page.waitForTimeout(150);
  let panelText = await page.textContent('main');
  console.log('Charge shows assigned confirmation (Section H)?', panelText.includes('Assigned to CD Section H'));

  o = await getOrder();
  console.log('Charge assigned onto CD Section H?', o.escrow.cdf.page2.sectionH.some(it => it.description === 'Wire Fee' && it.borrowerAtClosing === '25.00'));
  console.log('Charge also mirrored onto HUD 1100?', o.escrow.hud.page2.section1100.some(it => it.description === 'Wire Fee'));

  // Delete the resulting CD Section H line, then confirm the charge is free to be reassigned
  const cdChargeLine = o.escrow.cdf.page2.sectionH.filter(it => it.description === 'Wire Fee')[0];
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Wire Fee line visible on CDF Page 2 / Section H?', await page.inputValue(`#cdf2sectionH-desc-${cdChargeLine.id}`) === 'Wire Fee');
  await page.click(`[data-li-del="cdf2sectionH:${cdChargeLine.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Deleting the CD line removes it from Section H?', !o.escrow.cdf.page2.sectionH.some(it => it.id === cdChargeLine.id));

  await goTab('escrowCharges');
  await page.waitForTimeout(150);
  console.log('Charge is reassignable after its CD line was deleted?', await page.locator(`[data-cd-assign="chg-assign-${chg.id}"]`).count() === 1);

  // ============ Recording ============
  await goTab('escrowRecording');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Recording panel renders all three cards?', panelText.includes('Recording Fees') && panelText.includes('Transfer Taxes') && panelText.includes('Stamp Taxes'));

  // Recording Fee: flat fee + per-page fee * pages
  await page.click('#btn-add-recdoc');
  await page.waitForTimeout(150);
  o = await getOrder();
  let rd = o.escrow.recording.documents[0];
  await page.fill(`#rd-desc-${rd.id}`, 'Warranty Deed');
  await page.locator(`#rd-desc-${rd.id}`).blur();
  await page.fill(`#rd-pages-${rd.id}`, '3');
  await page.locator(`#rd-pages-${rd.id}`).blur();
  await page.waitForTimeout(100);
  await page.fill(`#rd-feePerDoc-${rd.id}`, '15.00');
  await page.locator(`#rd-feePerDoc-${rd.id}`).blur();
  await page.waitForTimeout(100);
  await page.fill(`#rd-feePerPage-${rd.id}`, '5.00');
  await page.locator(`#rd-feePerPage-${rd.id}`).blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Recording Fee computed amount is $30.00 (flat $15 + $5 x 3 pages)?', panelText.includes('$30.00'));

  await page.selectOption(`#rd-payor-${rd.id}-contact`, { label: 'Daniel R. Whitfield — Buyer/Borrower' });
  await page.waitForTimeout(150);
  await page.selectOption(`#rd-payee-${rd.id}-contact`, '__other__');
  await page.waitForTimeout(150);
  await page.fill(`#rd-payee-${rd.id}-other`, 'County Register of Deeds');
  await page.locator(`#rd-payee-${rd.id}-other`).blur();
  await page.waitForTimeout(150);

  // Fixed to Section E -- no Section dropdown
  console.log('Recording Fee assign control has no Section dropdown (fixed to E)?', await page.locator(`#rd-assign-${rd.id}-cdsection`).count() === 0);
  await page.click(`[data-cd-assign="rd-assign-${rd.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Recording Fee assigned onto CD Section E?', o.escrow.cdf.page2.sectionE.some(it => it.description === 'Recording Fee: Warranty Deed' && Number(it.borrowerAtClosing) === 30));
  console.log('Recording Fee also mirrored onto HUD 1200?', o.escrow.hud.page2.section1200.some(it => it.description === 'Recording Fee: Warranty Deed'));

  // Transfer Tax: basis * percent rate
  await page.click('#btn-add-rtt');
  await page.waitForTimeout(150);
  o = await getOrder();
  let rtt = o.escrow.recording.transferTaxes[0];
  await page.fill(`#rtt-desc-${rtt.id}`, 'County Transfer Tax');
  await page.locator(`#rtt-desc-${rtt.id}`).blur();
  await page.fill(`#rtt-basisAmount-${rtt.id}`, '200000');
  await page.locator(`#rtt-basisAmount-${rtt.id}`).blur();
  await page.waitForTimeout(100);
  await page.fill(`#rtt-rate-${rtt.id}`, '1');
  await page.locator(`#rtt-rate-${rtt.id}`).blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Transfer Tax computed amount is $2,000.00 (200000 x 1%)?', panelText.includes('$2,000.00'));
  await page.click(`[data-cd-assign="rtt-assign-${rtt.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Transfer Tax assigned onto CD Section E?', o.escrow.cdf.page2.sectionE.some(it => it.description === 'Transfer Tax: County Transfer Tax' && Number(it.borrowerAtClosing) === 2000));

  // Stamp Tax: basis / 1000 * rate (per-thousand)
  await page.click('#btn-add-rst');
  await page.waitForTimeout(150);
  o = await getOrder();
  let rst = o.escrow.recording.stampTaxes[0];
  await page.fill(`#rst-desc-${rst.id}`, 'State Excise Stamp');
  await page.locator(`#rst-desc-${rst.id}`).blur();
  await page.fill(`#rst-basisAmount-${rst.id}`, '200000');
  await page.locator(`#rst-basisAmount-${rst.id}`).blur();
  await page.waitForTimeout(100);
  await page.selectOption(`#rst-rateUnit-${rst.id}`, 'perThousand');
  await page.waitForTimeout(100);
  await page.fill(`#rst-rate-${rst.id}`, '2');
  await page.locator(`#rst-rate-${rst.id}`).blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Stamp Tax computed amount is $400.00 (200000 / 1000 x 2)?', panelText.includes('$400.00'));
  await page.click(`[data-cd-assign="rst-assign-${rst.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Stamp Tax assigned onto CD Section E?', o.escrow.cdf.page2.sectionE.some(it => it.description === 'Stamp Tax: State Excise Stamp' && Number(it.borrowerAtClosing) === 400));

  console.log('All three Recording items landed in the same CD Section E array?', o.escrow.cdf.page2.sectionE.length === 3);
  console.log('All three Recording items mirrored onto HUD 1200?', o.escrow.hud.page2.section1200.length === 3);

  panelText = await page.textContent('main');
  console.log('Recording Fees Subtotal shows $30.00?', panelText.includes('Recording Fees Subtotal') && panelText.includes('$30.00'));
  console.log('Transfer Taxes Subtotal shows $2,000.00?', panelText.includes('Transfer Taxes Subtotal') && panelText.includes('$2,000.00'));
  console.log('Stamp Taxes Subtotal shows $400.00?', panelText.includes('Stamp Taxes Subtotal') && panelText.includes('$400.00'));
  console.log('Total Recording & Transfer Charges shows $2,430.00?', panelText.includes('$2,430.00'));

  console.log('\nPage errors:', errors.length ? errors : 'none');
  await browser.close();
})();
