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
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // --- History tab presence / navigation ---
  console.log('File History toolbar item present?', !!(await page.$('[data-tab="history"]')));
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('History tab renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('File Created milestone logged on new order?', panelText.includes('File Created'));

  // --- Simple bindText field change: no keystroke spam, only final value on blur/change ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.type('#f-propertyAddress', '123 Main St', { delay: 20 });
  // blur to fire "change"
  await page.click('body');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Property Address field-change entry logged?', panelText.includes('Property Address') && panelText.includes('123 Main St'));
  const entryCountAfterOneChange = (await page.$$('#tab-panel > div.card > div')).length;

  // Change it again to a different value - should log old->new correctly, not spam per keystroke
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '456 Oak Ave');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Second field-change shows old value 123 Main St -> new 456 Oak Ave?', panelText.includes('123 Main St') && panelText.includes('456 Oak Ave'));

  // --- Structured record: add + edit a Security Instrument ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#si-mortgagor', 'John Smith');
  await page.fill('#si-mortgagee', 'ABC Bank');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI add event logged?', panelText.includes('Security Instrument added: John Smith'));

  // Edit the SI's mortgagee via pencil icon
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.click('[data-edit-si]');
  await page.waitForTimeout(150);
  const siId = await page.$eval('[data-save-si]', el => el.getAttribute('data-save-si'));
  await page.fill('#esi-mortgagee-' + siId, 'XYZ Bank');
  await page.click('[data-save-si]');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI edit diff logged (Mortgagee ABC Bank -> XYZ Bank)?', panelText.includes('Mortgagee') && panelText.includes('ABC Bank') && panelText.includes('XYZ Bank'));

  // --- Delete the SI ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.click('[data-del-si]');
  await page.waitForTimeout(150);
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI delete event logged?', panelText.includes('Security Instrument deleted: John Smith'));

  // --- Milestones: Requirement + Exception, Generate, Finalize, Issue CTC, Rescind ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  await page.fill('#req-description', 'Requirement A');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.fill('#exc-description', 'Exception A');
  await page.click('#btn-add-exc');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(150);
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Requirement added event logged?', panelText.includes('Requirement added: Requirement A'));
  console.log('Exception added event logged?', panelText.includes('Exception added: Exception A'));
  console.log('Commitment Generated milestone logged?', panelText.includes('Commitment Generated'));
  console.log('Commitment Finalized milestone logged?', panelText.includes('Commitment Finalized'));
  console.log('Title Status change to Curative logged?', panelText.includes('Title Status'));

  // Disposition the requirement, issue CTC, then rescind
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.selectOption('[data-req-disposition]', 'Released');
  await page.waitForTimeout(150);
  await page.click('#btn-issue-ctc');
  await page.waitForTimeout(200);
  await page.click('#btn-rescind-ctc');
  await page.waitForTimeout(200);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Requirement Disposition change logged?', panelText.includes('Requirement Disposition') && panelText.includes('Released'));
  console.log('Clear to Close Issued milestone logged?', panelText.includes('Clear to Close Issued'));
  console.log('Clear to Close Rescinded milestone logged?', panelText.includes('Clear to Close Rescinded'));

  // --- Contacts: single consolidated event, not per-field ---
  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.fill('#cd-name', 'Jane Doe');
  await page.waitForTimeout(100);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Contact added event logged (consolidated, not per-field)?', panelText.includes('Contact added: Jane Doe'));

  // --- Newest-first ordering check ---
  const entryTexts = await page.$$eval('#tab-panel > div.card > div', els => els.filter(el => !el.classList.contains('card-title')).map(el => el.textContent));
  console.log('Newest-first ordering (most recent event is Contact added)?', entryTexts.length > 0 && entryTexts[0].includes('Jane Doe'));

  // --- Migration test: old order missing o.history ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDHIST', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' }
    }];
    window.__genesisWriteOrdersRaw(old);
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDHIST');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order (missing history) renders History tab w/o crash?', !panelText.includes('Something went wrong'));
  console.log('Old order shows empty-state message?', panelText.includes('No history recorded yet'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('history backfilled to []?', Array.isArray(savedOld.history) && savedOld.history.length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
