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
  await page.goto(APP);
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);

  // --- Requirements: add via seed, then edit ---
  await page.click('[data-seed-req]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Seeded requirement appears?', panelText.includes('1.'));

  console.log('Edit button visible on requirement row?', !!(await page.$('[data-edit-req]')));
  console.log('No edit form visible before clicking edit?', !(await page.$('[data-save-req]')));

  await page.click('[data-edit-req]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking edit?', !!(await page.$('[data-save-req]')));

  const reqId = await page.getAttribute('[data-save-req]', 'data-save-req');
  await page.fill('#ereq-description-' + reqId, 'Custom edited requirement text');
  await page.fill('#ereq-notes-' + reqId, 'Edited note for req');
  await page.click('[data-save-req="' + reqId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Row shows updated requirement text?', panelText.includes('Custom edited requirement text'));
  console.log('Row shows updated notes?', panelText.includes('Edited note for req'));
  console.log('Edit form gone after save?', !(await page.$('[data-save-req]')));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.requirements[0]);
  console.log('Saved requirement description correct?', saved.description === 'Custom edited requirement text');
  console.log('Saved requirement notes correct?', saved.notes === 'Edited note for req');

  // Cancel discards changes
  await page.click('[data-edit-req]');
  await page.waitForTimeout(150);
  const reqId2 = await page.getAttribute('[data-save-req]', 'data-save-req');
  await page.fill('#ereq-description-' + reqId2, 'THIS SHOULD BE DISCARDED');
  await page.click('[data-cancel-req="' + reqId2 + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Cancel discards edits (still shows prior text)?', panelText.includes('Custom edited requirement text') && !panelText.includes('THIS SHOULD BE DISCARDED'));

  // --- Exceptions: add via seed, then edit ---
  await page.click('[data-seed-exc]');
  await page.waitForTimeout(150);
  console.log('Edit button visible on exception row?', !!(await page.$('[data-edit-exc]')));

  await page.click('[data-edit-exc]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking exception edit?', !!(await page.$('[data-save-exc]')));
  const excId = await page.getAttribute('[data-save-exc]', 'data-save-exc');
  await page.fill('#eexc-description-' + excId, 'Custom edited exception text');
  await page.fill('#eexc-notes-' + excId, 'Edited note for exc');
  await page.click('[data-save-exc="' + excId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Row shows updated exception text?', panelText.includes('Custom edited exception text'));
  console.log('Row shows updated exception notes?', panelText.includes('Edited note for exc'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.exceptions[0]);
  console.log('Saved exception description correct?', saved.description === 'Custom edited exception text');
  console.log('Saved exception notes correct?', saved.notes === 'Edited note for exc');

  // Delete still works alongside edit button present
  const delReqCountBefore = (await page.$$('[data-del-req]')).length;
  await page.click('[data-del-req]');
  await page.waitForTimeout(150);
  const delReqCountAfter = (await page.$$('[data-del-req]')).length;
  console.log('Delete still works on requirement row?', delReqCountAfter === delReqCountBefore - 1);

  // --- Sourced requirement (from Security Instrument) still editable, doesn't break source dedup ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  // Add an SI first via prelim tab (need one for the file chip to exist) -- verify via existing commitment_source test coverage instead;
  // here just confirm no console errors thrown from the new edit paths interacting with sourceType/sourceId fields.
  console.log('ERRORS:', errors);
  await browser.close();
})();
