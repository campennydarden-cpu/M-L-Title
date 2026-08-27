const { chromium } = require('playwright');

// Covers the 2026-08-25 data-loss fix: visible save-failure banner, non-destructive load-failure
// handling (no more silently overwriting corrupted data with an empty array), and the new
// Backup/Restore modal (export-to-copyable-text + paste-to-restore, since downloads are inert
// inside a published Artifact's sandbox).

(async () => {
  const browser = await chromium.launch();
  let page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;
  const STORAGE_KEY = 'genesis_orders_v1';

  function log(question, val) { console.log(question, val); }

  // ---------- Test A: save() failure surfaces a visible, non-silent error banner ----------
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

  // Force every future localStorage.setItem to throw, simulating a quota/write failure.
  await page.evaluate(() => {
    window.__origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(){ throw new Error('QuotaExceededError (simulated)'); };
  });

  await page.fill('#f-propertyAddress', '123 Test St');
  // bindText fires save() on the "input" event already covered by fill(); give it a tick.
  await page.waitForTimeout(150);
  // Blur the field explicitly (still while the stub is active) so any native blur-triggered
  // "change" event also fails and settles the banner into "error", rather than firing later
  // mid-click on the backup button (which would blur the field, succeed, and self-heal the
  // banner right out from under the click — a real self-healing behavior, just not what this
  // block of the test is trying to isolate).
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  // save() now debounces (~400ms); the two 150ms waits above aren't enough for it to have fired on
  // its own yet, so force it now -- deterministically, while the setItem stub is still installed --
  // rather than stretching the wait past the debounce window.
  await page.evaluate(() => { if (window.__genesisFlushSave) window.__genesisFlushSave(); });

  const bannerVisibleAfterFailedSave = await page.$eval('#save-status-banner', el => el.classList.contains('show') && el.classList.contains('error'));
  log('Error banner shows after a simulated save failure?', bannerVisibleAfterFailedSave);

  const bannerHasBackupButton = await page.$('#save-banner-backup-btn') !== null;
  log('Banner offers a Back Up Data button?', bannerHasBackupButton);

  // Restore real localStorage so we can inspect what actually happened underneath.
  await page.evaluate(() => { Storage.prototype.setItem = window.__origSetItem; });

  // ---------- Test B: opening Backup modal from the banner works, shows valid JSON ----------
  await page.click('#save-banner-backup-btn');
  await page.waitForTimeout(150);
  const modalOpenFromBanner = await page.$('#backup-overlay') !== null;
  log('Backup modal opens from the error banner?', modalOpenFromBanner);

  const exportTextValid = await page.$eval('#backup-export-text', el => {
    try { const parsed = JSON.parse(el.value); return Array.isArray(parsed); } catch(e){ return false; }
  });
  log('Backup modal export textarea contains valid JSON array?', exportTextValid);

  await page.click('#backup-close-btn');
  await page.waitForTimeout(100);
  const modalClosedAfterX = await page.$('#backup-overlay') === null;
  log('Backup modal closes on Close click?', modalClosedAfterX);

  // Now let a real save go through so subsequent state is on disk (localStorage) for Test C/D.
  await page.fill('#f-propertyAddress', '123 Test St Saved');
  await page.waitForTimeout(150);
  const bannerClearedAfterGoodSave = await page.$eval('#save-status-banner', el => !el.classList.contains('show'));
  log('Banner clears again once a save actually succeeds?', bannerClearedAfterGoodSave);

  // ---------- Test C: corrupted localStorage on load is preserved, not overwritten ----------
  const rawBeforeReload = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  const hadRealData = !!rawBeforeReload && rawBeforeReload !== '[]';
  log('Had real order data on disk before corrupting it?', hadRealData);

  // browser.newPage() opens a brand-new, fully isolated browser context (confirmed: it does not
  // share storage with the page above), so writing the corruption via a fresh page's addInitScript
  // -- which runs before ANY page script, including genesis-app.html's own -- lands it in a
  // pristine store with nothing else around to react to it. That sidesteps a real problem with
  // writing the corruption into the OLD (still-open) page and then reloading/closing it: that
  // page's in-memory state.orders is still perfectly valid, and its beforeunload/visibilitychange
  // flush hooks both fire during navigation/close (Playwright's page.close() skips beforeunload by
  // default, but still flips the document to hidden first, which alone triggers the
  // visibilitychange hook) -- either one would "self-heal" the corruption by overwriting it with
  // that known-good in-memory data before the fresh load() on the new page ever got a chance to
  // see it.
  await page.close();
  page = await browser.newPage();
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript((corrupt) => { localStorage.setItem('genesis_orders_v1', corrupt); }, '{not valid json!!!');
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
  await page.goto(APP);
  await page.waitForTimeout(250);

  const bannerVisibleAfterLoadFailure = await page.$eval('#save-status-banner', el => el.classList.contains('show') && el.classList.contains('error'));
  log('Error banner shows after a corrupted load?', bannerVisibleAfterLoadFailure);

  const rawStillCorruptedNotWiped = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  const originalNotOverwrittenWithEmptyArray = rawStillCorruptedNotWiped === '{not valid json!!!';
  log('Original corrupted value left untouched instead of being overwritten with []?', originalNotOverwrittenWithEmptyArray);

  const corruptBackupKeyCreated = await page.evaluate((k) => {
    return Object.keys(localStorage).some(key => key.indexOf(k + '_corrupt_backup_') === 0);
  }, STORAGE_KEY);
  log('A timestamped corrupt-backup copy was created as a second safety net?', corruptBackupKeyCreated);

  // Recovery text should be visible/copyable from the backup modal after a load failure.
  await page.click('#btn-sidebar-backup');
  await page.waitForTimeout(150);
  const recoveryTextShown = await page.$eval('#backup-recovery-text', el => el.value).catch(() => null);
  log('Backup modal shows the raw recovered text after a load failure?', recoveryTextShown === '{not valid json!!!');
  await page.click('#backup-close-btn');
  await page.waitForTimeout(100);

  // ---------- Test D: restore-from-backup upserts by id, never deletes ----------
  // browser.newPage() creates a brand-new, fully ISOLATED browser context each time (confirmed:
  // it is not just a fresh document in the same context) -- so start Test D on a fresh page/context
  // and pre-seed the "demo already seeded" flag via addInitScript, which runs before genesis-app's
  // own script on that first load. That gets a guaranteed-clean, zero-order starting state in one
  // shot, with no leftover corrupted value, no leftover in-memory order to race against, and no
  // localStorage.clear()-then-reload window in which a beforeunload/visibilitychange flush of
  // still-in-memory state (e.g. an auto-seeded demo order from a first load with no flag set yet)
  // could sneak back in ahead of the reload actually taking effect.
  await page.close();
  page = await browser.newPage();
  page.on('pageerror', err => errors.push(err.message));
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
  await page.fill('#f-propertyAddress', 'Existing Untouched Order');
  await page.waitForTimeout(150);

  const existingOrderId = await page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0].id, STORAGE_KEY);

  const restorePayload = JSON.stringify([
    { id: existingOrderId, fileNo: 'GEN-RESTORED', propertyAddress: 'Existing Untouched Order (Restored Overwrite)' },
    { id: 'brand-new-restored-id', fileNo: 'GEN-NEW', propertyAddress: 'Brand New From Backup' }
  ]);

  await page.click('#btn-sidebar-backup');
  await page.waitForTimeout(150);
  await page.fill('#backup-restore-text', restorePayload);
  await page.click('#backup-restore-btn');
  await page.waitForTimeout(200);

  const ordersAfterRestore = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
  log('Restore added the brand-new order?', ordersAfterRestore.some(o => o.id === 'brand-new-restored-id'));
  log('Restore updated the existing order in place (same id, new fileNo)?', ordersAfterRestore.find(o => o.id === existingOrderId) && ordersAfterRestore.find(o => o.id === existingOrderId).fileNo === 'GEN-RESTORED');
  log('Restore left exactly 2 orders total (no silent duplication or deletion)?', ordersAfterRestore.length === 2);

  await browser.close();

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
  }
})();
