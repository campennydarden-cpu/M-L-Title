const { chromium } = require('playwright');

// Covers schema-versioning: every order carries an explicit schemaVersion, and migrateOrder()
// is the single versioned entry point that wraps normalizeOrder()'s existing field-backfill
// logic -- both for orders loaded on startup (load()) and for orders pasted through the
// Backup/Restore modal.

(async () => {
  const browser = await chromium.launch();
  let page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;
  const STORAGE_KEY = 'genesis_orders_v1';

  function log(question, val) { console.log(question, val); }

  // Deterministic flush hook (test-harness only, not shipped app code): save() now debounces
  // its localStorage write, so a read immediately after typing/clicking can otherwise race a
  // still-pending write. Patching getItem to flush first (via the app's exposed
  // window.__genesisFlushSave) makes every existing localStorage.getItem(...) read in this suite
  // deterministic without having to touch each read site individually.
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
  // Deterministic legacy-migration injection helper (test-harness only): writes a legacy-shaped
  // order straight into localStorage, bypassing the running app's in-memory state.orders, then
  // reload()s to exercise migrateOrder(). Blocking further writes to the key right after our own
  // write closes the window where a stale beforeunload flush from the about-to-be-replaced page
  // could clobber the legacy JSON we're deliberately injecting.
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
  // First-ever load in a fresh browser context would auto-seed a demo order; pre-set the
  // "already seeded" flag so Test A's #btn-new-order click produces exactly one order.
  await page.addInitScript(() => { localStorage.setItem('genesis_demo_seeded_v1', '1'); });

  await page.goto(APP);
  await page.waitForTimeout(200);

  // ---------- Test A: a freshly created order is stamped at CURRENT_SCHEMA_VERSION ----------
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  const newOrderVersion = await page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0].schemaVersion, STORAGE_KEY);
  log('Freshly created order has schemaVersion === 1?', newOrderVersion === 1);

  // ---------- Test B: a legacy order (no schemaVersion, missing sub-object fields) gets ----------
  // ---------- migrated on load: schemaVersion set AND normalizeOrder's backfills applied ----------
  await page.close();
  page = await browser.newPage();
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
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

  function legacyOrder(id, fileNo) {
    return {
      id: id, createdAt: new Date().toISOString(), fileNo: fileNo, titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '456 Legacy Ln', contacts: []
      // Deliberately no schemaVersion, no escrow.recording, no titlePremiums.miscFees, no endorsements.
    };
  }

  await page.evaluate((o) => { window.__genesisWriteOrdersRaw([o]); }, legacyOrder('legacy1', 'GEN-LEGACY'));
  await page.reload();
  await page.waitForTimeout(300);

  const migrated = await page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0], STORAGE_KEY);
  log('No page errors after loading legacy order?', errors.length === 0);
  log('Legacy order migrated to schemaVersion === 1?', migrated.schemaVersion === 1);
  log('normalizeOrder backfill ran: escrow.recording.documents is an array?', Array.isArray(migrated.escrow && migrated.escrow.recording && migrated.escrow.recording.documents));
  log('normalizeOrder backfill ran: titlePremiums.miscFees is an array?', Array.isArray(migrated.titlePremiums && migrated.titlePremiums.miscFees));
  log('normalizeOrder backfill ran: endorsements is an array?', Array.isArray(migrated.endorsements));

  // ---------- Test C: pasting the same legacy-shaped JSON through Backup & Restore also ----------
  // ---------- results in schemaVersion === 1 on the restored order ----------
  await page.click('#btn-sidebar-backup');
  await page.waitForTimeout(150);
  const restorePayload = JSON.stringify([legacyOrder('legacy2-pasted', 'GEN-LEGACY-PASTED')]);
  await page.fill('#backup-restore-text', restorePayload);
  await page.click('#backup-restore-btn');
  await page.waitForTimeout(200);

  const restored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).find(o => o.id === 'legacy2-pasted'), STORAGE_KEY);
  log('Pasted legacy order restored via Backup & Restore has schemaVersion === 1?', restored && restored.schemaVersion === 1);

  console.log('ERRORS:', errors);
  await browser.close();
})();
