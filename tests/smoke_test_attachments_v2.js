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

  // Minimal fields to enable Generate
  await page.fill('#f-propertyAddress', '123 Main St');
  await page.waitForTimeout(100);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.waitForTimeout(100);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.waitForTimeout(100);

  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  await page.click('[data-seed-req]'); // add a boilerplate requirement
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(200);

  console.log('Save Version button visible after generate?', !!(await page.$('#btn-save-version')));

  // Save version 1 with custom label
  await page.fill('#save-version-label', 'Draft 1');
  await page.click('#btn-save-version');
  await page.waitForTimeout(150);

  // Save version 2 with no label -> auto v2
  await page.click('#btn-save-version');
  await page.waitForTimeout(150);

  await page.click('[data-tab="attachments"]');
  await page.waitForTimeout(200);
  let panelText = await page.textContent('#tab-panel');
  console.log('Attachments shows Commitment - Draft 1?', panelText.includes('Draft 1'));
  console.log('Attachments shows Commitment - v2 (auto label)?', panelText.includes('v2'));
  console.log('Attachments shows docType Commitment?', panelText.includes('Commitment'));

  // View snapshot
  const viewLinkCount = (await page.$$('[data-toggle-att]')).length;
  console.log('Two saved versions present?', viewLinkCount === 2);
  await page.click('[data-toggle-att]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Snapshot expands to show doc content (property address)?', panelText.includes('123 Main St'));
  console.log('Snapshot shows Schedule A?', panelText.includes('Schedule A'));

  // Collapse
  await page.click('[data-toggle-att]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Snapshot collapses again (Schedule A hidden)?', !panelText.includes('Schedule A'));

  // Edit a version's metadata
  await page.click('[data-edit-att]');
  await page.waitForTimeout(150);
  const attId = await page.getAttribute('[data-save-att]', 'data-save-att');
  await page.fill('#eatt-version-' + attId, 'Draft 1 (renamed)');
  await page.fill('#eatt-notes-' + attId, 'sent to lender for review');
  await page.click('[data-save-att="' + attId + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Renamed version shows?', panelText.includes('Draft 1 (renamed)'));
  console.log('Notes show?', panelText.includes('sent to lender for review'));

  // --- Frozen snapshot check: change requirements after saving, confirm old snapshot unaffected ---
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  await page.fill('#req-description', 'BRAND NEW REQUIREMENT ADDED AFTER SNAPSHOT');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(150);

  await page.click('[data-tab="attachments"]');
  await page.waitForTimeout(200);
  await page.click('[data-toggle-att]'); // expand the renamed "Draft 1" snapshot (oldest, saved before the new requirement)
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old snapshot frozen (does NOT show post-save requirement)?', !panelText.includes('BRAND NEW REQUIREMENT ADDED AFTER SNAPSHOT'));

  // Delete a version
  const delBtnCountBefore = (await page.$$('[data-del-att]')).length;
  await page.click('[data-del-att]');
  await page.waitForTimeout(150);
  const delBtnCountAfter = (await page.$$('[data-del-att]')).length;
  console.log('Delete removes a version?', delBtnCountAfter === delBtnCountBefore - 1);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].attachments);
  console.log('Remaining saved attachment has snapshotHtml?', typeof saved[0].snapshotHtml === 'string' && saved[0].snapshotHtml.length > 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
