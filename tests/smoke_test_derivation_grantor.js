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

  // Set up County on Property screen so the clause can fully render
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.fill('#p-county', 'Travis');
  await page.click('body');
  await page.waitForTimeout(150);

  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);

  // --- Grantor now has its own Entity Type field ---
  console.log('Grantor Entity Type field present?', !!(await page.$('#dv-grantorEntityType')));
  console.log('Copy Grantor from a file contact control present?', !!(await page.$('#dv-grantorCopySource')));

  // --- Create a Trust contact (Buyer/Borrower on a Refinance so it's the Grantee-role source) ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'The Smith Family Trust');
  await page.selectOption('#cd-entityType', 'Trust');
  await page.waitForTimeout(150);
  await page.fill('#dp-name', 'Jane Smith');
  await page.selectOption('#dp-role', 'Trustee');
  await page.click('#btn-add-draft-principal');
  await page.waitForTimeout(150);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // --- Create a Grantor-side contact too: an LLC ---
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'Prior Holdings LLC');
  await page.selectOption('#cd-entityType', 'LLC');
  await page.waitForTimeout(150);
  await page.fill('#dp-name', 'Bob Prior');
  await page.selectOption('#dp-role', 'Manager');
  await page.click('#btn-add-draft-principal');
  await page.waitForTimeout(150);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);

  // --- Copy Grantee (current owner) from the Trust contact ---
  const granteeOptions = await page.$eval('#dv-copySource', el => Array.from(el.options).map(o => o.textContent));
  console.log('Grantee copy source lists the Trust contact?', granteeOptions.some(t => t.includes('Smith Family Trust')));
  await page.selectOption('#dv-copySource', { label: 'The Smith Family Trust' });
  await page.click('#btn-copy-derivation');
  await page.waitForTimeout(150);

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantee name copied?', saved.prelim.derivation.name === 'The Smith Family Trust');
  console.log('Grantee entityType copied (Trust)?', saved.prelim.derivation.entityType === 'Trust');
  console.log('Grantee principals copied (Jane Smith, Trustee)?', saved.prelim.derivationPrincipals.length === 1 && saved.prelim.derivationPrincipals[0].name === 'Jane Smith' && saved.prelim.derivationPrincipals[0].role === 'Trustee');

  // --- Copy Grantor from the LLC contact ---
  const grantorOptions = await page.$eval('#dv-grantorCopySource', el => Array.from(el.options).map(o => o.textContent));
  console.log('Grantor copy source lists the LLC contact?', grantorOptions.some(t => t.includes('Prior Holdings LLC')));
  await page.selectOption('#dv-grantorCopySource', { label: 'Prior Holdings LLC (Seller)' });
  await page.click('#btn-copy-derivation-grantor');
  await page.waitForTimeout(150);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantor name copied?', saved.prelim.derivation.grantorName === 'Prior Holdings LLC');
  console.log('Grantor entityType copied (LLC)?', saved.prelim.derivation.grantorEntityType === 'LLC');
  console.log('Grantor principals copied (Bob Prior, Manager)?', saved.prelim.derivationGrantorPrincipals.length === 1 && saved.prelim.derivationGrantorPrincipals[0].name === 'Bob Prior' && saved.prelim.derivationGrantorPrincipals[0].role === 'Manager');

  // --- Fill remaining fields to complete the clause ---
  await page.selectOption('#dv-instrumentType', 'Warranty Deed');
  await page.fill('#dv-recordedDate', '2019-06-15');
  await page.fill('#dv-book', '55');
  await page.fill('#dv-page', '200');
  await page.click('body');
  await page.waitForTimeout(150);

  let clauseText = await page.textContent('#dv-clause-preview');
  const expectedDefault = 'Being the same parcel conveyed unto Jane Smith, as Trustee of the The Smith Family Trust by Warranty Deed of Prior Holdings LLC, by Bob Prior (Manager) recorded June 15, 2019 as Book 55, Page 200 of the Travis County records.';
  console.log('Derivation Clause uses entity-qualified Grantee AND Grantor naming?', clauseText.trim() === expectedDefault);

  // --- Vested In preview still shows only the Grantee-side qualified naming ---
  const vestingText = await page.textContent('#dv-vesting-preview');
  console.log('Vested In shows Grantee-qualified naming only?', vestingText.trim() === 'Jane Smith, as Trustee of the The Smith Family Trust');

  // --- Portion of Parcel checkbox toggles the clause lead-in ---
  console.log('Portion of Parcel checkbox present?', !!(await page.$('#dv-isPortion')));
  console.log('Checkbox unchecked by default?', !(await page.$eval('#dv-isPortion', el => el.checked)));
  await page.check('#dv-isPortion');
  await page.waitForTimeout(150);
  clauseText = await page.textContent('#dv-clause-preview');
  console.log('Clause switches to "Being a portion of the same parcel" when checked?', clauseText.trim().indexOf('Being a portion of the same parcel conveyed unto') === 0);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('isPortion saved as true?', saved.prelim.derivation.isPortion === true);

  await page.uncheck('#dv-isPortion');
  await page.waitForTimeout(150);
  clauseText = await page.textContent('#dv-clause-preview');
  console.log('Clause reverts to "Being the same parcel" when unchecked?', clauseText.trim().indexOf('Being the same parcel conveyed unto') === 0);

  // --- Manual Grantor Principal add/edit/delete (pencil-icon pattern) ---
  await page.selectOption('#dv-grantorEntityType', 'LLC');
  await page.waitForTimeout(150);
  console.log('Grantor roster shows Bob Prior after entity type re-selection?', (await page.textContent('#tab-panel')).includes('Bob Prior'));

  await page.fill('#dgp-name', 'Second Member LLC Person');
  await page.selectOption('#dgp-role', 'Manager');
  await page.click('#btn-add-dgp');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantor principal manually added (2 total)?', saved.prelim.derivationGrantorPrincipals.length === 2);

  await page.click('[data-edit-dgp]');
  await page.waitForTimeout(150);
  const dgpId = saved.prelim.derivationGrantorPrincipals[0].id;
  await page.fill('#edgp-name-' + dgpId, 'Bob Prior Jr.');
  await page.click('[data-save-dgp="' + dgpId + '"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantor principal edited?', saved.prelim.derivationGrantorPrincipals.some(p => p.name === 'Bob Prior Jr.'));

  await page.click('[data-del-dgp="' + dgpId + '"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Grantor principal deleted (1 remaining)?', saved.prelim.derivationGrantorPrincipals.length === 1);

  // --- File History logs the new facts ---
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('History logs Grantor Principal added event?', panelText.includes('Derivation Grantor Principal added'));
  console.log('History logs Grantor Principal deleted event?', panelText.includes('Derivation Grantor Principal deleted'));
  console.log('History logs Portion of Parcel toggle?', panelText.includes('Portion of Parcel'));
  console.log('History logs Grantor copied-from-contact milestone?', panelText.includes('Derivation Grantor copied from contact'));
  console.log('History logs Grantee copied-from-contact milestone?', panelText.includes('Derivation Grantee copied from contact'));

  // --- Migration test: old order missing new derivation fields ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDGRANTOR', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01', derivation: { datedDate: '', recordedDate: '2019-01-01', book: '1', page: '2', instrumentNumber: '', consideration: '', name: 'Old Grantee', entityType: 'Individual', grantorName: 'Old Grantor', instrumentType: 'Warranty Deed' } },
      property: { county: 'Dallas' }
    }];
    window.__genesisWriteOrdersRaw(old);
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDGRANTOR');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Derivation card renders w/o crash?', !panelText.includes('Something went wrong'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Old order grantorEntityType backfilled to Individual?', savedOld.prelim.derivation.grantorEntityType === 'Individual');
  console.log('Old order isPortion backfilled to false?', savedOld.prelim.derivation.isPortion === false);
  console.log('Old order derivationGrantorPrincipals backfilled to []?', Array.isArray(savedOld.prelim.derivationGrantorPrincipals) && savedOld.prelim.derivationGrantorPrincipals.length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
