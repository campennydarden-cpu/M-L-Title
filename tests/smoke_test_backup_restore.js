const { chromium } = require('playwright');

// Covers the 2026-08-25 data-loss fix: visible save-failure banner, non-destructive load-failure
// handling (no more silently overwriting corrupted data with an empty array), and the new
// Backup/Restore modal (export-to-copyable-text + paste-to-restore, since downloads are inert
// inside a published Artifact's sandbox).

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';
  const STORAGE_KEY = 'genesis_orders_v1';

  function log(question, val) { console.log(question, val); }

  // ---------- Test A: save() failure surfaces a visible, non-silent error banner ----------
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
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

  await page.evaluate((k) => { localStorage.setItem(k, '{not valid json!!!'); }, STORAGE_KEY);
  await page.reload();
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
  // Reset to a clean, valid state with one known order.
  await page.evaluate((k) => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); }, STORAGE_KEY);
  await page.reload();
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
