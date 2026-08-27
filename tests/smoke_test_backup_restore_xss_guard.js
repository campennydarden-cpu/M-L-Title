// Acceptance test for the stored-XSS-via-backup-restore fix: Backup & Restore accepts an
// arbitrary pasted JSON array (Array.isArray(parsed) + incoming.id are the only checks) and
// pushes each entry into state.orders wholesale. Two sinks downstream of that untrusted data
// render raw/lightly-escaped HTML:
//   1. tplAttachments()'s expanded "View snapshot" block interpolates a.snapshotHtml directly
//      into panel.innerHTML with no esc()/sanitization (it has to hold markup by design -- it's
//      a frozen Commitment/CTC document body). Fixed by sanitizeSnapshotHtml(), applied both at
//      render time (tplAttachments) and at import time (Backup & Restore handler).
//   2. The "Other Rate Calculator / Quote Link" field (o.titlePremiums.rateCalculatorUrl) is
//      rendered into an <a href="..."> via esc(), which escapes HTML metacharacters but does NOT
//      block a "javascript:" scheme -- a one-click script-execution sink. Fixed by routing the
//      href (and the static RATE_CALCULATOR_LINKS hrefs) through sanitizeUrlScheme() (http/https/
//      mailto allowlist) before esc().
//
// This test drives the real paste-JSON-and-click-Restore UI flow for both, then visits the
// screens that render the restored data, checking for actual script execution (a window sentinel
// set only by the payloads themselves, plus Playwright's pageerror/dialog/console hooks) rather
// than just inspecting the stored strings -- and separately confirms the benign parts of a
// restored Commitment snapshot still render, so the sanitizer isn't overly aggressive.
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
  const restore = async (json) => {
    await page.click('#btn-sidebar-backup');
    await page.waitForTimeout(150);
    await page.fill('#backup-restore-text', json);
    await page.click('#backup-restore-btn');
    await page.waitForTimeout(200);
  };

  // Deterministic flush hook (test-harness only, not shipped app code): save() now debounces
  // its localStorage write, so a read immediately after typing/clicking can otherwise race a
  // still-pending write. Patching getItem to flush first (via the app's exposed
  // window.__genesisFlushSave) makes every existing localStorage.getItem(...) read in this suite
  // deterministic without having to touch each read site individually. saveNow() itself already
  // no-ops this flush when there's nothing pending and a load error is unresolved, so this is safe
  // even for the corrupted-load-must-not-be-overwritten checks in smoke_test_backup_restore.js.
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); window.__xssFired = false; });
  await page.reload();
  await page.waitForTimeout(200);

  // ============ (1) Backup JSON with a malicious attachment.snapshotHtml ============
  const ATT_ID = 'xss-guard-attachment-order';
  const MALICIOUS_SNAPSHOT =
    '<img src="x" onerror="window.__xssFired=true">' +
    '<div onclick="window.__xssFired=true" id="xss-guard-div">Looks legit</div>' +
    '<script>window.__xssFired=true;<\/script>' +
    '<p>This benign Commitment paragraph should survive sanitization.</p>' +
    '<table><tbody><tr><td>Benign table cell</td></tr></tbody></table>';

  const attachmentBackup = JSON.stringify([{
    id: ATT_ID, fileNo: 'XSS-GUARD-ATT', createdAt: new Date().toISOString(),
    attachments: [{ id: 'att-guard-1', docType: 'Commitment', version: 'v1', dateAdded: '2026-08-27', snapshotHtml: MALICIOUS_SNAPSHOT, notes: '' }]
  }]);

  await restore(attachmentBackup);

  let orders = await getOrders();
  const importedAtt = orders.find(o => o.id === ATT_ID);
  console.log('Attachment backup: restored order landed in state.orders?', !!importedAtt);

  const storedSnapshot = importedAtt ? importedAtt.attachments[0].snapshotHtml : '';
  console.log('Attachment backup: script/onerror/onclick sanitized out of storage at import time?',
    storedSnapshot.indexOf('<script') === -1 && storedSnapshot.indexOf('onerror') === -1 && storedSnapshot.indexOf('onclick') === -1);
  console.log('Attachment backup: benign paragraph text survives sanitization in storage?',
    storedSnapshot.indexOf('This benign Commitment paragraph should survive sanitization') !== -1);

  // Open the restored order and expand the attachment's "View snapshot" -- the innerHTML render.
  await page.click(`.order-item[data-order-id="${ATT_ID}"]`);
  await page.waitForTimeout(150);
  await goTab('attachments');
  await page.waitForTimeout(150);
  await page.click('[data-toggle-att]');
  await page.waitForTimeout(200);

  const xssFiredAfterExpand = await page.evaluate(() => !!window.__xssFired);
  console.log('Attachment backup: no script executed when the restored snapshot was expanded (window sentinel)?', xssFiredAfterExpand === false);
  console.log('Attachment backup: no browser dialog fired on expand?', dialogFired === false);

  const domIsClean = await page.evaluate(() => {
    const hasHandlerAttr = document.querySelectorAll('[onerror],[onclick],[onload]').length > 0;
    const hasScriptTag = !!document.querySelector('.card script');
    return !hasHandlerAttr && !hasScriptTag;
  });
  console.log('Attachment backup: no on* handler attributes or <script> tags present in the rendered DOM?', domIsClean === true);

  const benignRendered = await page.evaluate(() => document.body.innerHTML.indexOf('This benign Commitment paragraph should survive sanitization') !== -1);
  console.log('Attachment backup: benign snapshot markup (paragraph + table) actually renders on screen?', benignRendered === true);

  // ============ (2) Backup JSON with a javascript: rateCalculatorUrl ============
  await page.evaluate(() => { window.__xssFired = false; });
  const URL_ID = 'xss-guard-rateurl-order';
  const urlBackup = JSON.stringify([{
    id: URL_ID, fileNo: 'XSS-GUARD-URL', createdAt: new Date().toISOString(),
    titlePremiums: { rateCalculatorUrl: 'javascript:window.__xssFired=true' }
  }]);

  await restore(urlBackup);

  orders = await getOrders();
  const importedUrl = orders.find(o => o.id === URL_ID);
  console.log('Rate-calculator backup: restored order landed in state.orders?', !!importedUrl);
  console.log('Rate-calculator backup: javascript: scheme rateCalculatorUrl preserved verbatim in storage (only the render is guarded, not storage)?',
    importedUrl ? importedUrl.titlePremiums.rateCalculatorUrl === 'javascript:window.__xssFired=true' : null);

  await page.click(`.order-item[data-order-id="${URL_ID}"]`);
  await page.waitForTimeout(150);
  await goTab('titlePremiums');
  await page.waitForTimeout(150);

  const rateLinkHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a')).filter(a => a.textContent.indexOf('Open this link') !== -1);
    return links.length ? links[0].getAttribute('href') : undefined;
  });
  console.log('Rate-calculator link: no "Open this link" anchor rendered for a javascript: URL (link is suppressed rather than shown unsafe)?', rateLinkHref === undefined);

  const jsHrefAnywhere = await page.evaluate(() => !!document.querySelector('a[href^="javascript:" i]'));
  console.log('Rate-calculator link: no javascript: href present anywhere in the rendered DOM?', jsHrefAnywhere === false);

  // Clicking around the panel (if any stray anchor existed) should never fire the sentinel either.
  await page.mouse.move(200, 200);
  await page.waitForTimeout(100);
  const xssFiredAfterUrlRender = await page.evaluate(() => !!window.__xssFired);
  console.log('Rate-calculator link: no script executed merely by rendering the Title Insurance Premiums screen?', xssFiredAfterUrlRender === false);

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
