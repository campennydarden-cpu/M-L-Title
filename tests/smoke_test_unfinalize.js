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

  await page.fill('#f-propertyAddress', '123 Main St');
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);

  await page.fill('#req-description', 'Requirement One');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(200);

  // --- Finalize ---
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  let panelText = await page.textContent('#tab-panel');
  console.log('Status: Final shown after finalize?', panelText.includes('Final'));
  console.log('Revert to Draft button visible (no CTC issued)?', !!(await page.$('#btn-unfinalize-commitment')));

  // --- Un-finalize: confirm strip ---
  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(150);
  console.log('Confirm strip appears?', !!(await page.$('#btn-confirm-unfinalize')));
  await page.click('#btn-cancel-unfinalize');
  await page.waitForTimeout(150);
  console.log('Cancel dismisses confirm strip (still Final)?', !!(await page.$('#btn-unfinalize-commitment')) && !(await page.$('#btn-confirm-unfinalize')));

  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-unfinalize');
  await page.waitForTimeout(200);

  panelText = await page.textContent('#tab-panel');
  console.log('Status: Draft shown again after revert?', panelText.includes('Draft'));
  console.log('Delete button back on requirement rows (Draft)?', !!(await page.$('[data-del-req]')));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('commitment.final = false?', saved.commitment.final === false);
  console.log('finalizedAt cleared?', saved.commitment.finalizedAt === null);
  console.log('titleStatus reverted to Exam?', saved.titleStatus === 'Exam');

  // Curative tab should show "still Draft" again
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Curative shows "still Draft" again after revert?', panelText.includes('still Draft'));

  // --- Re-finalize, disposition + Don't Show a requirement, issue CTC, verify revert is blocked while CTC issued ---
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.selectOption('[data-req-disposition]', 'Released');
  await page.waitForTimeout(150);
  await page.check('[data-req-dontshow]');
  await page.waitForTimeout(150);
  await page.click('#btn-issue-ctc');
  await page.waitForTimeout(200);

  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Revert to Draft button hidden while CTC issued?', !(await page.$('#btn-unfinalize-commitment')));
  console.log('Message explains to Rescind CTC first?', panelText.includes('Rescind the Clear to Close'));

  // Rescind CTC, then revert should work and dispositions/dontShow should be preserved
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.click('#btn-rescind-ctc');
  await page.waitForTimeout(200);
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  console.log('Revert to Draft button visible again after Rescind?', !!(await page.$('#btn-unfinalize-commitment')));

  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-unfinalize');
  await page.waitForTimeout(200);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Disposition preserved through revert (not cleared)?', saved.commitment.requirements[0].disposition === 'Released');
  console.log('dontShow preserved through revert (not cleared)?', saved.commitment.requirements[0].dontShow === true);
  console.log('commitment.final = false after this second revert?', saved.commitment.final === false);

  console.log('ERRORS:', errors);
  await browser.close();
})();
