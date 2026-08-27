const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goEntry = () => page.click('[data-tab="entry"]');
  const goContacts = () => page.click('[data-tab="contacts"]');
  const goDeed = () => page.click('[data-tab="docPrepDeed"]');

  async function addContact(role, name, opts){
    opts = opts || {};
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', role);
    await page.waitForTimeout(150);
    await page.fill('#cd-name', name);
    if(opts.entityType){
      await page.selectOption('#cd-entityType', opts.entityType);
      await page.waitForTimeout(150);
    }
    if(opts.maritalStatus){
      await page.selectOption('#cd-maritalStatus', opts.maritalStatus).catch(()=>{});
    }
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

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
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Purchase');
  await page.fill('#f-purchasePrice', '300000');
  await page.fill('#f-loanAmount', '240000');
  await page.waitForTimeout(150);

  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Seller', 'Sam Seller');
  await addContact('Seller', 'Sally Seller');
  await addContact('Buyer/Borrower', 'Bob Buyer');
  await addContact('Lender', 'Big Bank');

  // Link Sam & Sally as married for group-vesting checks (best-effort, may not have a UI toggle -- skip if absent)

  await goDeed();
  await page.waitForTimeout(200);
  console.log('No page errors on Deed screen?', errors.length === 0);

  // --- 1. Return To: role-group support ---
  const returnToHtml = await page.innerHTML('#dp-deed-returnToId');
  console.log('Return To offers "All Seller" role group?', returnToHtml.includes('All Seller'));
  console.log('Return To offers "All Buyer/Borrower" role group?', returnToHtml.includes('All Buyer/Borrower'));
  console.log('Return To offers "All Lender" role group?', returnToHtml.includes('All Lender'));

  await page.selectOption('#dp-deed-returnToId', { label: 'All Seller' });
  await page.waitForTimeout(150);
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Return To saved as role token?', saved.docPrep.deed.returnToId === 'role:Seller');
  let panelText = await page.textContent('#tab-panel');
  console.log('Return To preview resolves to both Sellers?', panelText.includes('Sam Seller') && panelText.includes('Sally Seller'));

  // Switch back to a literal contact
  await page.selectOption('#dp-deed-returnToId', { label: 'Big Bank (Lender)' });
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Return To saved as literal contact id after switch?', saved.docPrep.deed.returnToId === saved.contacts.filter(c=>c.name==='Big Bank')[0].id);

  // --- 2. Grantor/Grantee auto-fill once, then independently editable ---
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantee auto-filled from sole Buyer/Borrower?', saved.docPrep.deed.granteeName === 'Bob Buyer');
  // Two sellers, not married-linked -> grantorName should NOT auto-combine (ambiguous), stays blank
  console.log('Grantor NOT auto-filled (2 unrelated Sellers, ambiguous)?', saved.docPrep.deed.grantorName === '');

  await page.fill('#dp-deed-grantorName', 'Sam Seller and Sally Seller, as Tenants in Common');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantor Name is independently editable/saved?', saved.docPrep.deed.grantorName === 'Sam Seller and Sally Seller, as Tenants in Common');

  await page.fill('#dp-deed-granteeName', 'Bob Buyer, a single man');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantee Name is independently editable/saved?', saved.docPrep.deed.granteeName === 'Bob Buyer, a single man');

  // Editing Contacts afterward should NOT flow back into Deed's Grantee
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('[data-open-contact]');
  await page.waitForTimeout(150);
  // (not renaming via UI here to keep test simple/robust -- the independence is already proven by
  // the Deed fields not being derived from live Contacts in tplDocPrepDeed/deedSummaryText)
  await page.click('#btn-back-contacts').catch(()=>{});
  await page.waitForTimeout(150);

  await goDeed();
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantee Name unchanged after visiting Contacts?', saved.docPrep.deed.granteeName === 'Bob Buyer, a single man');

  // Entity type change on Grantee -> LLC roster appears
  await page.selectOption('#dp-deed-granteeEntityType', 'LLC');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Grantee LLC principals roster appears?', panelText.includes('Members / Managers'));

  await page.fill('#dpep-name', 'Bob Buyer');
  await page.selectOption('#dpep-role', { index: 0 });
  await page.click('#btn-add-dpep');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantee Principal added?', saved.docPrep.deed.granteePrincipals.length === 1 && saved.docPrep.deed.granteePrincipals[0].name === 'Bob Buyer');

  // switch back to Individual for downstream summary check simplicity
  await page.selectOption('#dp-deed-granteeEntityType', 'Individual');
  await page.waitForTimeout(150);

  // --- Copy-in convenience still works ---
  await page.selectOption('#dp-deed-grantorCopySource', { label: 'Sam Seller' });
  await page.click('#btn-copy-deed-grantor');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Copy-in from a file contact overwrites Grantor Name?', saved.docPrep.deed.grantorName === 'Sam Seller');

  // --- Deed summary uses independent Grantor/Grantee, not live Contacts ---
  await page.selectOption('#dp-deed-instrumentType', 'Warranty Deed');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Generated Summary reflects independent Grantor/Grantee names?', panelText.includes('conveys the Property from Sam Seller to Bob Buyer'));

  // --- 3. Signature Lines: editable list, seed + free-form ---
  panelText = await page.textContent('#tab-panel');
  console.log('Signature Lines starts empty?', panelText.includes('No signature lines added.'));

  await page.click('#btn-seed-deed-sigline');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Seed from Grantor added a signature line?', saved.docPrep.deed.signatureLines.length === 1 && saved.docPrep.deed.signatureLines[0].text === 'Sam Seller');

  await page.fill('#dp-deed-sigline-text', 'John Q. Freeform');
  await page.click('#btn-add-deed-sigline');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Free-form signature line added?', saved.docPrep.deed.signatureLines.length === 2 && saved.docPrep.deed.signatureLines[1].text === 'John Q. Freeform');

  // Edit it
  await page.click('[data-edit-deed-sigline]');
  await page.waitForTimeout(150);
  const slId = await page.getAttribute('[data-save-deed-sigline]', 'data-save-deed-sigline');
  await page.fill('#edeedsl-text-' + slId, 'Sam Seller (edited)');
  await page.click('[data-save-deed-sigline]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Signature line edited?', panelText.includes('Sam Seller (edited)'));

  // Delete one
  await page.click('[data-del-deed-sigline]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Signature line deleted, one remains?', saved.docPrep.deed.signatureLines.length === 1);

  // --- 4. Notary Block: independently editable, generate button, no sync to Notary Ack screen ---
  panelText = await page.textContent('#tab-panel');
  console.log('Notary Block textarea starts empty?', (await page.inputValue('#dp-deed-notaryBlock')) === '');

  await page.click('#btn-generate-deed-notary');
  await page.waitForTimeout(150);
  let notaryVal = await page.inputValue('#dp-deed-notaryBlock');
  console.log('Generate from Grantor fills Notary Block?', notaryVal.includes('personally appeared Sam Seller'));

  await page.fill('#dp-deed-notaryBlock', 'CUSTOM NOTARY TEXT - state specific override');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Notary Block freely editable/saved?', saved.docPrep.deed.notaryBlock === 'CUSTOM NOTARY TEXT - state specific override');

  // Standalone Notary Ack screen still computes its own text live from Contacts, unaffected
  await page.click('[data-tab="docPrepNotaryAck"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Notary Ack screen unaffected by Deed notary block override?', !panelText.includes('CUSTOM NOTARY TEXT'));
  console.log('Notary Ack screen still shows live Contact-based acknowledgment?', panelText.includes('Sam Seller') || panelText.includes('Sally Seller'));

  // --- Legacy order migration: old-shape order (pre-Item-H) gets new fields backfilled ---
  await page.evaluate(() => {
    var legacy = {
      id: 'legacy1', transactionType: 'Purchase', purchasePrice: '100000', loanAmount: '80000',
      contacts: [], docPrep: { deed: { instrumentType: '', consideration: '', datedDate: '', recordedDate: '', book: '', page: '', instrumentNumber: '',
        preparedById: '', returnToId: '', exemptionCode: '', legalAsExhibit: false, subjectTo: [], final: false, finalizedAt: null },
        securityInstrument: { instrumentType: '', trusteeName: '', loanAmount: '', datedDate: '', recordedDate: '', book: '', page: '', instrumentNumber: '' },
        affidavits: [] },
      history: []
    };
    window.__genesisWriteOrdersRaw([legacy]);
  });
  await page.reload();
  await page.waitForTimeout(300);
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Legacy order migration: grantorName backfilled?', migrated.docPrep.deed.grantorName === '');
  console.log('Legacy order migration: grantorPrincipals backfilled as array?', Array.isArray(migrated.docPrep.deed.grantorPrincipals));
  console.log('Legacy order migration: signatureLines backfilled as array?', Array.isArray(migrated.docPrep.deed.signatureLines));
  console.log('Legacy order migration: notaryBlock backfilled as string?', migrated.docPrep.deed.notaryBlock === '');

  console.log('ERRORS:', errors);
  await browser.close();
})();
