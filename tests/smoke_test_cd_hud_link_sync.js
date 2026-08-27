// Covers the CD/HUD assignment link-awareness fix (Counsel of Five audit gap #3).
//
// assignItemToCdHud() does not LINK a source fee to a CD/HUD line -- it COPIES the amount once into
// two independently-editable rows (one CDF Page 2 row, one HUD Page 2 row). Three copies of every
// dollar figure then drift freely, while the old unconditional green "✓ Assigned to CD Section X"
// badge kept asserting a link that had stopped being true. This test pins:
//   1. the snapshot stamped on both generated rows at assign time (sourceAmount/sourceAmountKey/assignedAt),
//   2. the honest out-of-sync indicator when the source fee is edited afterwards,
//   3. the same indicator when a closer hand-edits the CD line instead (rows stay editable by design),
//   4. Re-sync pushing the current source amount into BOTH the CDF and HUD rows,
//   5. the orphan fix: deleting the CDF row also removes its paired HUD row, so re-assigning cannot
//      double-book the charge in HUD 1100 (isAssignedToCdHud() used to scan only the CDF sections,
//      and the shared line-item delete handler spliced only its own array),
//   6. a legacy file that already holds a HUD-only orphan: the fee reads as partially-orphaned and
//      the Assign button is withheld rather than silently duplicating the line.
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
  // Premium/fee inputs save via bindText (no re-render), so the assign block only reflects a new
  // amount after the panel is rebuilt -- bounce off the tab the way a user would.
  const rerenderPremiums = async () => {
    await goTab('entry'); await page.waitForTimeout(150);
    await goTab('titlePremiums'); await page.waitForTimeout(250);
  };

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

  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(150);

  // ============ Assign: snapshot stamped on BOTH generated rows ============
  await goTab('titlePremiums');
  await page.waitForTimeout(250);
  await page.fill('#tp-owner-premium', '900.00');
  await page.locator('#tp-owner-premium').blur();
  await rerenderPremiums();
  await page.click('[data-cd-assign="tp-owner-assign"]');
  await page.waitForTimeout(250);

  let o = await getOrder();
  const cdfRow = o.escrow.cdf.page2.sectionH.find(it => it.sourceType === 'tpremium' && it.sourceId === 'owner');
  const hudRow = o.escrow.hud.page2.section1100.find(it => it.sourceType === 'tpremium' && it.sourceId === 'owner');
  console.log('Assign creates exactly one CDF Section H row and one HUD 1100 row?',
    o.escrow.cdf.page2.sectionH.length === 1 && o.escrow.hud.page2.section1100.length === 1);
  console.log('CDF row carries the sourceAmount snapshot ($900.00)?', !!cdfRow && cdfRow.sourceAmount === '900.00');
  console.log('HUD row carries the sourceAmount snapshot ($900.00)?', !!hudRow && hudRow.sourceAmount === '900.00');
  console.log('Both rows record which column the money went into (sourceAmountKey)?',
    cdfRow.sourceAmountKey === 'borrowerAtClosing' && hudRow.sourceAmountKey === 'borrowerAmount');
  console.log('Both rows carry an assignedAt timestamp?', !!cdfRow.assignedAt && !!hudRow.assignedAt);

  let panelText = await page.textContent('main');
  console.log('In-sync assignment shows the green confirmation naming the agreed amount?',
    panelText.includes('Assigned to CD Section H') && panelText.includes('in sync at $900.00'));
  console.log('No out-of-sync warning while all three copies agree?', !panelText.includes('Out of sync with CD/HUD line'));

  // ============ Edit the SOURCE fee: staleness must surface ============
  await page.fill('#tp-owner-premium', '1200.00');
  await page.locator('#tp-owner-premium').blur();
  await rerenderPremiums();
  o = await getOrder();
  console.log('Source premium edited to 1,200 while the copied CD/HUD rows still say 900?',
    o.titlePremiums.ownerPolicy.premium === '1200.00' &&
    o.escrow.cdf.page2.sectionH[0].borrowerAtClosing === '900.00' &&
    o.escrow.hud.page2.section1100[0].borrowerAmount === '900.00');

  panelText = await page.textContent('main');
  console.log('Out-of-sync indicator replaces the green badge?',
    panelText.includes('Out of sync with CD/HUD line') && !panelText.includes('in sync at'));
  console.log('Indicator names the source amount vs. the assigned CD/HUD amounts?',
    panelText.includes('this fee $1,200.00') && panelText.includes('CD line $900.00') && panelText.includes('HUD line $900.00'));
  console.log('Indicator still reports what was originally assigned ($900.00)?', panelText.includes('Assigned as $900.00'));
  console.log('A Re-sync button is offered?', (await page.locator('[data-cd-resync="tp-owner-assign"]').count()) === 1);
  console.log('Assign button is NOT re-offered while a stale assignment exists (no double-booking)?',
    (await page.locator('[data-cd-assign="tp-owner-assign"]').count()) === 0);

  // ============ Re-sync: all three copies agree again ============
  await page.click('[data-cd-resync="tp-owner-assign"]');
  await page.waitForTimeout(250);
  o = await getOrder();
  console.log('Re-sync pushes the current source amount into the CDF row?', o.escrow.cdf.page2.sectionH[0].borrowerAtClosing === '1200.00');
  console.log('Re-sync pushes the current source amount into the HUD row too?', o.escrow.hud.page2.section1100[0].borrowerAmount === '1200.00');
  console.log('Re-sync re-stamps the snapshot on both rows?',
    o.escrow.cdf.page2.sectionH[0].sourceAmount === '1200.00' && o.escrow.hud.page2.section1100[0].sourceAmount === '1200.00');
  console.log('Re-sync does not duplicate either row?',
    o.escrow.cdf.page2.sectionH.length === 1 && o.escrow.hud.page2.section1100.length === 1);

  panelText = await page.textContent('main');
  console.log('Green in-sync confirmation returns after Re-sync ($1,200.00)?',
    panelText.includes('in sync at $1,200.00') && !panelText.includes('Out of sync with CD/HUD line'));

  // ============ Hand-editing the CD line surfaces the same drift (rows stay editable) ============
  const cdfRowId = o.escrow.cdf.page2.sectionH[0].id;
  await goTab('escrowCdf2');
  await page.waitForTimeout(300);
  console.log('Assigned CD row is still editable (not read-only)?',
    (await page.locator(`#cdf2sectionH-borrowerAtClosing-${cdfRowId}`).count()) === 1 &&
    !(await page.locator(`#cdf2sectionH-borrowerAtClosing-${cdfRowId}`).isDisabled()));
  await page.fill(`#cdf2sectionH-borrowerAtClosing-${cdfRowId}`, '1000.00');
  await page.locator(`#cdf2sectionH-borrowerAtClosing-${cdfRowId}`).blur();
  await page.waitForTimeout(250);

  await goTab('titlePremiums');
  await page.waitForTimeout(250);
  panelText = await page.textContent('main');
  console.log('Editing the CD line by hand also surfaces out-of-sync on the source screen?',
    panelText.includes('Out of sync with CD/HUD line') && panelText.includes('CD line $1,000.00') && panelText.includes('this fee $1,200.00'));

  await page.click('[data-cd-resync="tp-owner-assign"]');
  await page.waitForTimeout(250);
  o = await getOrder();
  console.log('Re-sync repairs a hand-edited CD line back to the source amount?',
    o.escrow.cdf.page2.sectionH[0].borrowerAtClosing === '1200.00' && o.escrow.hud.page2.section1100[0].borrowerAmount === '1200.00');

  // ============ Orphan fix: deleting the CDF row takes its paired HUD row with it ============
  await goTab('escrowCdf2');
  await page.waitForTimeout(300);
  await page.click(`[data-li-del="cdf2sectionH:${cdfRowId}"]`);
  await page.waitForTimeout(300);
  o = await getOrder();
  console.log('Deleting the CDF row removes it?', o.escrow.cdf.page2.sectionH.length === 0);
  console.log('Deleting the CDF row also removes the paired HUD 1100 row (no orphan)?', o.escrow.hud.page2.section1100.length === 0);

  await goTab('titlePremiums');
  await page.waitForTimeout(250);
  console.log('Assign control returns once BOTH halves are gone?', (await page.locator('[data-cd-assign="tp-owner-assign"]').count()) === 1);

  await page.click('[data-cd-assign="tp-owner-assign"]');
  await page.waitForTimeout(250);
  o = await getOrder();
  const hud1100Owner = o.escrow.hud.page2.section1100.filter(it => it.sourceType === 'tpremium' && it.sourceId === 'owner');
  console.log('Re-assigning after the delete produces exactly ONE HUD 1100 line (no double-booking)?', hud1100Owner.length === 1);
  console.log('Re-assigned HUD line carries the current amount ($1,200.00)?', hud1100Owner[0].borrowerAmount === '1200.00');
  console.log('Re-assigning after the delete produces exactly ONE CDF Section H line?', o.escrow.cdf.page2.sectionH.length === 1);

  // ============ Legacy file already holding a HUD-only orphan ============
  // Simulates a file saved before this fix, where the CDF half was deleted and the HUD half survived.
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    orders[0].escrow.cdf.page2.sectionH = [];
    window.__genesisWriteOrdersRaw(orders);
  });
  await page.reload();
  await page.waitForTimeout(250);
  await page.click('.order-item');
  await page.waitForTimeout(200);
  await goTab('titlePremiums');
  await page.waitForTimeout(300);
  panelText = await page.textContent('main');
  console.log('Pre-existing HUD-only orphan reads as an incomplete assignment, not as unassigned?',
    panelText.includes('CD/HUD assignment is incomplete') && panelText.includes('The paired CD line is missing.'));
  console.log('Assign button withheld while the orphan survives (cannot double-book HUD 1100)?',
    (await page.locator('[data-cd-assign="tp-owner-assign"]').count()) === 0);

  // Deleting the surviving HUD row from the HUD screen clears the assignment for real.
  o = await getOrder();
  const orphanHudId = o.escrow.hud.page2.section1100[0].id;
  await goTab('escrowHud2');
  await page.waitForTimeout(300);
  await page.click(`[data-li-del="hud2section1100:${orphanHudId}"]`);
  await page.waitForTimeout(300);
  o = await getOrder();
  console.log('Deleting the orphaned HUD row clears it?', o.escrow.hud.page2.section1100.length === 0);

  await goTab('titlePremiums');
  await page.waitForTimeout(300);
  console.log('Assign control available again once the orphan is cleared?', (await page.locator('[data-cd-assign="tp-owner-assign"]').count()) === 1);

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
