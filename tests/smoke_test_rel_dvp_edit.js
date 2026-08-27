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
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);

  // --- Derivation Vesting Principals (LLC roster) ---
  await page.selectOption('#dv-entityType', 'LLC');
  await page.waitForTimeout(150);
  await page.fill('#dvp-name', 'John Member');
  await page.selectOption('#dvp-role', 'Member');
  await page.click('#btn-add-dvp');
  await page.waitForTimeout(150);

  let panelText = await page.textContent('#tab-panel');
  console.log('Derivation principal appears?', panelText.includes('John Member'));
  console.log('Edit button visible on dvp row?', !!(await page.$('[data-edit-dvp]')));
  console.log('No edit form visible before clicking?', !(await page.$('[data-save-dvp]')));

  await page.click('[data-edit-dvp]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking edit?', !!(await page.$('[data-save-dvp]')));
  const dvpId = await page.getAttribute('[data-save-dvp]', 'data-save-dvp');
  await page.fill('#edvp-name-' + dvpId, 'John Member (updated)');
  await page.selectOption('#edvp-role-' + dvpId, 'Manager');
  await page.click('[data-save-dvp="' + dvpId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Row shows updated dvp name?', panelText.includes('John Member (updated)'));
  console.log('Row shows updated dvp role?', panelText.includes('Manager'));
  console.log('Edit form gone after save?', !(await page.$('[data-save-dvp]')));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.derivationPrincipals[0]);
  console.log('Saved dvp name correct?', saved.name === 'John Member (updated)');
  console.log('Saved dvp role correct?', saved.role === 'Manager');

  // Cancel discards
  await page.click('[data-edit-dvp]');
  await page.waitForTimeout(150);
  const dvpId2 = await page.getAttribute('[data-save-dvp]', 'data-save-dvp');
  await page.fill('#edvp-name-' + dvpId2, 'DISCARD ME');
  await page.click('[data-cancel-dvp="' + dvpId2 + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Cancel discards dvp edit?', panelText.includes('John Member (updated)') && !panelText.includes('DISCARD ME'));

  // --- Related Documents (nested under Security Instrument) ---
  await page.fill('#si-mortgagor', 'Jane Borrower');
  await page.fill('#si-mortgagee', 'Big Bank');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  // expand related documents
  await page.click('[data-toggle-si]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Related documents section expanded?', panelText.includes('No related documents'));

  const siId = await page.getAttribute('[data-add-rel]', 'data-add-rel');
  await page.selectOption('#rel-type-' + siId, 'Loan Modification Agreement');
  await page.fill('#rel-datedDate-' + siId, '2026-01-15');
  await page.fill('#rel-instrumentNumber-' + siId, 'INST-1001');
  await page.fill('#rel-notes-' + siId, 'original note');
  await page.click('[data-add-rel="' + siId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Related doc appears?', panelText.includes('Loan Modification Agreement'));
  console.log('Edit button visible on related doc row?', !!(await page.$('[data-edit-rel]')));
  console.log('No edit form visible before clicking?', !(await page.$('[data-save-rel]')));

  await page.click('[data-edit-rel]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking edit?', !!(await page.$('[data-save-rel]')));
  const relId = await page.getAttribute('[data-save-rel]', 'data-save-rel');
  await page.selectOption('#erel-type-' + relId, 'Substitution of Trustee');
  await page.fill('#erel-notes-' + relId, 'updated note text');
  await page.fill('#erel-book-' + relId, '450');
  await page.fill('#erel-page-' + relId, '12');
  await page.click('[data-save-rel="' + relId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Row shows updated related doc type?', panelText.includes('Substitution of Trustee'));
  console.log('Row shows updated notes?', panelText.includes('updated note text'));
  console.log('Row shows updated book/page?', panelText.includes('Bk 450 Pg 12'));
  console.log('Edit form gone after save?', !(await page.$('[data-save-rel]')));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.securityInstruments[0].related[0]);
  console.log('Saved related doc type correct?', saved.type === 'Substitution of Trustee');
  console.log('Saved related doc notes correct?', saved.notes === 'updated note text');
  console.log('Saved related doc book correct?', saved.book === '450');
  console.log('Original datedDate preserved (not cleared)?', saved.datedDate === '2026-01-15');

  // Cancel discards
  await page.click('[data-edit-rel]');
  await page.waitForTimeout(150);
  const relId2 = await page.getAttribute('[data-save-rel]', 'data-save-rel');
  await page.fill('#erel-notes-' + relId2, 'DISCARD THIS NOTE');
  await page.click('[data-cancel-rel="' + relId2 + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Cancel discards related doc edit?', panelText.includes('updated note text') && !panelText.includes('DISCARD THIS NOTE'));

  // Delete still works
  const delRelCountBefore = (await page.$$('[data-del-rel]')).length;
  await page.click('[data-del-rel]');
  await page.waitForTimeout(150);
  const delRelCountAfter = (await page.$$('[data-del-rel]')).length;
  console.log('Delete still works on related doc row?', delRelCountAfter === delRelCountBefore - 1);

  console.log('ERRORS:', errors);
  await browser.close();
})();
