// Covers the HUD line-insert reordering bug in assignItemToCdHud(): CDF Sections B, C, and H all
// funnel into the SAME shared HUD array (o.escrow.hud.page2.section1100 -- see CD_TO_HUD_SECTION),
// but the "Insert at line N" position dropdown is built from the TARGET CDF SECTION's own array
// length (cdSectionItemCount), and that raw N used to get spliced straight into the much longer
// combined HUD array too. Reachable failure: assign one item each to Sections B, C, and H (HUD
// section1100 now has 3 rows in that order), then assign a 4th item to Section H and pick "Insert
// at line 1" -- Section H's own CDF array only has 1 item, so index 0 is correct for the CDF, but
// splicing HUD section1100 at raw index 0 used to jump the new row ahead of ALL three prior
// entries (B, C, and H's own existing row), an order the user never chose or saw. No prior smoke
// test asserted section1100's ordering after an explicit-position insert.
//
// This test drives the fix via the "Additional Title/Escrow Charges" screen (tplEscrowCharges),
// the one candFn source whose cdAssignBlock offers all three of Section B/C/H from a single
// dropdown, so all three shared-array feeders can be exercised without touching multiple tabs.
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

  await goTab('escrowCharges');
  await page.waitForTimeout(150);

  // Adds one Additional Charge row, fills description/amount, forces the re-render that reveals
  // the Assign control (bindText commits to the model but doesn't re-render on its own -- same
  // nav-away/back round trip the existing Payor-routing smoke test relies on), picks the target
  // CD section, optionally picks an explicit insert position, then clicks Assign.
  async function addAndAssign(desc, amount, cdSection, posValue) {
    await page.click('#btn-add-charge');
    await page.waitForTimeout(150);
    let o = await getOrder();
    const c = o.escrow.charges[o.escrow.charges.length - 1];
    await page.fill(`#chg-desc-${c.id}`, desc);
    await page.fill(`#chg-amount-${c.id}`, amount);
    await page.locator(`#chg-amount-${c.id}`).blur();
    await page.waitForTimeout(150);
    await goTab('endorsements');
    await page.waitForTimeout(100);
    await goTab('escrowCharges');
    await page.waitForTimeout(150);
    await page.selectOption(`#chg-assign-${c.id}-cdsection`, cdSection);
    await page.waitForTimeout(150);
    if (posValue) {
      await page.selectOption(`#chg-assign-${c.id}-cdpos`, posValue);
      await page.waitForTimeout(100);
    }
    await page.click(`[data-cd-assign="chg-assign-${c.id}"]`);
    await page.waitForTimeout(150);
    return c.id;
  }

  // ============ Seed section1100 with one item each from B, C, H (in that order) ============
  await addAndAssign('Charge B1', '100.00', 'sectionB');
  await addAndAssign('Charge C1', '200.00', 'sectionC');
  await addAndAssign('Charge H1', '300.00', 'sectionH');

  let o = await getOrder();
  let hudDescs = o.escrow.hud.page2.section1100.map(it => it.description);
  console.log('Seed: section1100 holds B1, C1, H1 in assignment order before the explicit-position insert?', JSON.stringify(hudDescs) === JSON.stringify(['Charge B1', 'Charge C1', 'Charge H1']));

  // ============ Assign a 4th item to Section H, explicitly "Insert at line 1" ============
  // Section H's own CDF array only has 1 item (H1) at this point, so "Insert at line 1" (value
  // "1" -> index 0) is a request to place H2 before H1 *within Section H* -- not ahead of every
  // other CDF section's rows already sitting in the shared HUD array.
  await addAndAssign('Charge H2', '400.00', 'sectionH', '1');

  o = await getOrder();
  const cdSectionH = o.escrow.cdf.page2.sectionH.map(it => it.description);
  console.log('CDF Section H itself gets H2 inserted before H1 (Insert at line 1 honored)?', JSON.stringify(cdSectionH) === JSON.stringify(['Charge H2', 'Charge H1']));

  hudDescs = o.escrow.hud.page2.section1100.map(it => it.description);
  // The bug: splicing HUD at the CDF-section-relative index 0 used to produce
  // ['Charge H2','Charge B1','Charge C1','Charge H1'] -- H2 jumping ahead of every prior row.
  // The fix: H2 lands immediately before H1 (its actual CDF neighbour), and B1/C1/H1 keep their
  // original relative order.
  console.log('section1100 keeps B1, C1 ahead of H2/H1 -- new insert does not reorder prior entries?', JSON.stringify(hudDescs) === JSON.stringify(['Charge B1', 'Charge C1', 'Charge H2', 'Charge H1']));
  console.log('section1100 places H2 immediately before its CDF-neighbour H1 (not at the array head)?', hudDescs.indexOf('Charge H2') === hudDescs.indexOf('Charge H1') - 1);
  console.log('section1100 total row count is exactly 4 (no dupes, nothing dropped)?', hudDescs.length === 4);

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
