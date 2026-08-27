// Covers the stored-XSS gap in Attachments: a.snapshotHtml (a frozen Commitment/CTC document body
// from renderDocBody()/renderCtcBody()) is rendered directly via innerHTML in tplAttachments()
// (previewBlock), and is also restorable wholesale, unsanitized, from pasted Backup & Restore JSON
// (the "Restore" button's click handler JSON.parse()s pasted text and pushes it straight into
// state.orders). A malicious/tampered backup -- or any other future path that writes an attachment's
// snapshotHtml -- could plant a <script>, an <img onerror>, a javascript: href, or an on* handler
// that fires the moment "View snapshot" is expanded. This test drives two independent defenses:
// (1) render-time sanitization (sanitizeSnapshotHtml() wrapping a.snapshotHtml in tplAttachments),
// exercised by directly planting an already-malicious snapshotHtml into localStorage (simulating
// data that predates this fix, or arrived some other way) and expanding it; (2) import-time
// sanitization in the Backup & Restore handler, exercised via the real paste-JSON-and-click-Restore
// UI flow, checked BEFORE the attachment is ever rendered/expanded.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  let dialogFired = false;
  page.on('dialog', async d => { dialogFired = true; console.log('DIALOG FIRED (would be the XSS payload executing):', d.message()); await d.dismiss(); });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrders = () => page.evaluate(() => { if (window.__genesisFlushSave) window.__genesisFlushSave(); return JSON.parse(localStorage.getItem('genesis_orders_v1')); });

  const MALICIOUS = '<script>window.__xssFired=true;<\/script>' +
    '<img src="x" onerror="window.__xssFired=true">' +
    '<a href="javascript:window.__xssFired=true" id="xss-link">Click me</a>' +
    '<div onclick="window.__xssFired=true" id="xss-div">Looks legit</div>' +
    '<p>Safe paragraph text that should survive.</p>' +
    '<table><tr><td>Safe cell</td></tr></table>';

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

  // ============ (1) Render-time sanitization: plant already-malicious stored data ============
  // Bypasses the Commitment tab's Generate/Save Version buttons (gated on canGenerate, which a
  // blank new order doesn't satisfy) -- irrelevant here anyway, since this test only cares that
  // whatever ends up in an attachment's snapshotHtml gets sanitized when rendered, not how a real
  // Commitment snapshot is produced. Plants the attachment directly, matching the real shape
  // (id/docType/version/dateAdded/snapshotHtml/notes) that btn-save-version's handler produces.
  await page.click('#btn-new-order');
  await page.waitForTimeout(150);

  let orders = await getOrders();
  const orderId = orders[0].id;
  await page.evaluate(({ orderId, malicious }) => {
    const list = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    const o = list.find(x => x.id === orderId);
    o.attachments.push({ id: 'att-planted', docType: 'Commitment', version: 'v1', dateAdded: '2026-08-27', snapshotHtml: malicious, notes: '' });
    window.__genesisWriteOrdersRaw(list);
  }, { orderId, malicious: MALICIOUS });
  await page.reload();
  await page.waitForTimeout(200);
  // currentOrderId lives only in in-memory state, not localStorage -- reload always drops back to
  // the order list, so the planted order has to be re-opened explicitly.
  await page.click(`.order-item[data-order-id="${orderId}"]`);
  await page.waitForTimeout(150);

  orders = await getOrders();
  console.log('Planted attachment with malicious snapshotHtml present on the order?', orders.find(o => o.id === orderId).attachments.length === 1);

  await goTab('attachments');
  await page.waitForTimeout(150);
  await page.click('[data-toggle-att]'); // expand "View snapshot" -- this is the innerHTML render
  await page.waitForTimeout(200);

  const fired1 = await page.evaluate(() => !!window.__xssFired);
  console.log('Render-time: malicious snapshotHtml does NOT execute on expand (no script/onerror/onclick fired)?', fired1 === false);
  console.log('Render-time: no browser dialog fired?', dialogFired === false);

  // Checks real DOM attributes via querySelector, not a body.innerHTML substring scan -- the app's
  // own <script> source (including this very sanitizer's code comments) legitimately contains the
  // words "onerror"/"onclick" as text, which would false-positive a naive string search.
  const dangerSurvived = await page.evaluate(() => {
    const hasHandlerAttr = document.querySelectorAll('[onerror],[onclick],[onload]').length > 0;
    const hasJsHref = !!document.querySelector('a[href^="javascript:"]');
    const hasImg = !!document.querySelector('.card img'); // IMG is in SNAPSHOT_DANGEROUS_TAGS, should never survive
    return hasHandlerAttr || hasJsHref || hasImg;
  });
  console.log('Render-time: dangerous tags/attributes (img[onerror], on* handlers, javascript: href) stripped from the DOM?', dangerSurvived === false);

  const safeSurvived = await page.evaluate(() => document.body.innerHTML.indexOf('Safe paragraph text that should survive') !== -1);
  console.log('Render-time: benign structural content (safe paragraph/table) still renders?', safeSurvived === true);

  // ============ (2) Import-time sanitization: paste a malicious backup and Restore ============
  await page.evaluate(() => { window.__xssFired = false; });
  const importedId = 'xss-import-test-order';
  const backupJson = JSON.stringify([{
    id: importedId, fileNo: 'XSS-TEST-1', createdAt: new Date().toISOString(),
    attachments: [{ id: 'att-1', docType: 'Commitment', version: 'v1', dateAdded: '2026-08-27', snapshotHtml: MALICIOUS, notes: '' }]
  }]);
  await page.click('#btn-sidebar-backup'); // open Backup & Restore modal
  await page.waitForTimeout(150);
  await page.fill('#backup-restore-text', backupJson);
  await page.click('#backup-restore-btn');
  await page.waitForTimeout(200);

  orders = await getOrders();
  const imported = orders.find(o => o.id === importedId);
  const importedHasScript = imported ? (imported.attachments[0].snapshotHtml.indexOf('<script') !== -1 || imported.attachments[0].snapshotHtml.indexOf('onerror') !== -1 || imported.attachments[0].snapshotHtml.indexOf('onclick') !== -1) : null;
  console.log('Import-time: restored order actually landed in state.orders?', !!imported);
  console.log('Import-time: snapshotHtml sanitized in storage BEFORE ever being rendered/expanded?', importedHasScript === false);
  console.log('Import-time: sanitized snapshotHtml still keeps the safe paragraph text?', imported ? imported.attachments[0].snapshotHtml.indexOf('Safe paragraph text that should survive') !== -1 : null);

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
