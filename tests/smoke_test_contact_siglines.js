const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goContacts = () => page.click('[data-tab="contacts"]');

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
  await goContacts();
  await page.waitForTimeout(150);

  // ============ Non-vesting role: no signature line section ============
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Lender');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Signature Line(s) section absent for Lender (non-vesting role)?', !panelText.includes('Signature Line(s)'));
  await page.fill('#cd-name', 'Big Bank');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  let lender = saved.contacts.filter(c => c.name === 'Big Bank')[0];
  console.log('Lender contact has empty signatureLines array (not undefined)?', Array.isArray(lender.signatureLines) && lender.signatureLines.length === 0);

  // ============ New Buyer/Borrower (Individual): section present, empty until save, auto-seeds on save ============
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Signature Line(s) section present for new Buyer/Borrower?', panelText.includes('Signature Line(s)'));
  console.log('No lines yet before name is typed (empty state shown)?', panelText.includes('No signature lines yet.'));

  await page.fill('#cd-name', 'Bob Buyer');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  let bob = saved.contacts.filter(c => c.name === 'Bob Buyer')[0];
  console.log('Bob auto-seeded one signature line on save (never opened the section)?', bob.signatureLines.length === 1 && bob.signatureLines[0].text === 'Bob Buyer');

  // ============ Editing existing contact: section pre-fills from saved data, and is independently editable ============
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('text=Bob Buyer');
  await page.waitForTimeout(150);
  let siglineVal = await page.inputValue('#sigline-text-' + bob.signatureLines[0].id);
  console.log('Existing contact reopens with saved signature line pre-filled?', siglineVal === 'Bob Buyer');

  await page.fill('#sigline-text-' + bob.signatureLines[0].id, 'Robert "Bob" Buyer');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  bob = saved.contacts.filter(c => c.name === 'Bob Buyer')[0];
  console.log('Edited signature line text saved?', bob.signatureLines[0].text === 'Robert "Bob" Buyer');

  // ============ Add a second signature line (multi-signer support) ============
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('text=Bob Buyer');
  await page.waitForTimeout(150);
  await page.fill('#sigline-new-text', 'Bob Buyer, individually and as attorney-in-fact');
  await page.click('#btn-add-sigline');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  bob = saved.contacts.filter(c => c.name === 'Bob Buyer')[0];
  console.log('Second line added (not saved to storage yet -- draft only)?', bob.signatureLines.length === 1);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  bob = saved.contacts.filter(c => c.name === 'Bob Buyer')[0];
  console.log('Second line persisted after Save?', bob.signatureLines.length === 2 && bob.signatureLines[1].text === 'Bob Buyer, individually and as attorney-in-fact');

  // ============ Delete a signature line ============
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('text=Bob Buyer');
  await page.waitForTimeout(150);
  await page.click('[data-del-sigline="' + bob.signatureLines[0].id + '"]');
  await page.waitForTimeout(150);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  bob = saved.contacts.filter(c => c.name === 'Bob Buyer')[0];
  console.log('Signature line deleted, one remains?', bob.signatureLines.length === 1 && bob.signatureLines[0].text === 'Bob Buyer, individually and as attorney-in-fact');

  // ============ Regenerate default from entity details ============
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('text=Bob Buyer');
  await page.waitForTimeout(150);
  await page.click('#btn-regenerate-siglines');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  let regenVal = await page.inputValue('input[id^="sigline-text-"]');
  console.log('Regenerate replaces list with a single fresh default line ("Bob Buyer")?', regenVal === 'Bob Buyer');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  bob = saved.contacts.filter(c => c.name === 'Bob Buyer')[0];
  console.log('Regenerated line persisted after Save?', bob.signatureLines.length === 1 && bob.signatureLines[0].text === 'Bob Buyer');

  // ============ POA-aware default (Individual, POA enabled) ============
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.waitForTimeout(150);
  await page.fill('#cd-name', 'Sam Seller');
  await page.check('#cd-poaEnabled');
  await page.waitForTimeout(150);
  await page.fill('#cd-poaName', 'Pam Poa');
  await page.waitForTimeout(150);
  await page.click('#btn-regenerate-siglines');
  await page.waitForTimeout(150);
  regenVal = await page.inputValue('input[id^="sigline-text-"]');
  console.log('POA-aware default signature line generated?', regenVal.includes('Sam Seller') && regenVal.includes('Pam Poa') && regenVal.includes('Attorney-in-Fact'));
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // ============ Entity (LLC) with multiple principals: default single combined line, expandable ============
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.waitForTimeout(150);
  await page.fill('#cd-name', 'ABC Holdings, LLC');
  await page.selectOption('#cd-entityType', 'LLC');
  await page.waitForTimeout(150);
  await page.fill('#dp-name', 'Mike Manager');
  await page.selectOption('#dp-role', { label: 'Manager' });
  await page.click('#btn-add-draft-principal');
  await page.waitForTimeout(150);
  await page.click('#btn-regenerate-siglines');
  await page.waitForTimeout(150);
  regenVal = await page.inputValue('input[id^="sigline-text-"]');
  console.log('LLC default signature line includes entity name + principal?', regenVal.includes('ABC Holdings, LLC') && regenVal.includes('Mike Manager'));
  await page.fill('#sigline-new-text', 'ABC Holdings, LLC — By: Second Signer, Member');
  await page.click('#btn-add-sigline');
  await page.waitForTimeout(150);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  let abc = saved.contacts.filter(c => c.name === 'ABC Holdings, LLC')[0];
  console.log('LLC contact has two signature lines after manual add?', abc.signatureLines.length === 2);

  // ============ Legacy contact migration: signatureLines backfilled as array ============
  await page.evaluate(() => {
    var legacy = {
      id: 'legacyOrder1', transactionType: 'Purchase', purchasePrice: '', loanAmount: '',
      contacts: [
        { id: 'legacyContact1', role: 'Buyer/Borrower', name: 'Legacy Contact', entityType: 'Individual', maritalStatus: 'Single' }
      ],
      history: []
    };
    window.__genesisWriteOrdersRaw([legacy]);
  });
  await page.reload();
  await page.waitForTimeout(300);
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const legacyContact = migrated.contacts.filter(c => c.id === 'legacyContact1')[0];
  console.log('Legacy contact migration: signatureLines backfilled as array?', Array.isArray(legacyContact.signatureLines) && legacyContact.signatureLines.length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
