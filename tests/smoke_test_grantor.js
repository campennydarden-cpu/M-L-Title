const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goEntry = () => page.click('[data-tab="entry"]');
  const goContacts = () => page.click('[data-tab="contacts"]');
  const goPrelim = () => page.click('[data-tab="prelim"]');

  // --- Scenario 1: Purchase, single Seller -> auto-fill from Seller ---
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

  await goContacts();
  await page.waitForTimeout(200);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'Jane Seller');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // transactionType defaults to Purchase already; go to prelim
  await goPrelim();
  await page.waitForTimeout(200);

  const graneteVal1 = await page.inputValue('#dv-name');
  console.log('Auto-filled Grantee from single Seller (Purchase)?', graneteVal1 === 'Jane Seller');

  const dvGrantorPresent = !!(await page.$('#dv-grantorName'));
  console.log('Grantor field present?', dvGrantorPresent);
  await page.fill('#dv-grantorName', 'Prior Owner LLC');
  await page.waitForTimeout(100);

  const saved1 = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.derivation);
  console.log('Grantor saved?', saved1.grantorName === 'Prior Owner LLC');
  console.log('Grantee (name) saved from auto-fill?', saved1.name === 'Jane Seller');

  // --- Scenario 2: switch to Refinance with a single Buyer/Borrower -> should NOT overwrite existing Grantee ---
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'Bob Borrower');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await goPrelim();
  await page.waitForTimeout(200);
  const graneteVal2 = await page.inputValue('#dv-name');
  console.log('Existing Grantee NOT overwritten by refi auto-fill (still Jane Seller)?', graneteVal2 === 'Jane Seller');

  // --- Scenario 3: fresh order, Refinance with single Buyer/Borrower -> auto-fill from Buyer/Borrower ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'Rita Refi');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await goPrelim();
  await page.waitForTimeout(200);
  const graneteVal3 = await page.inputValue('#dv-name');
  console.log('Auto-filled Grantee from single Buyer/Borrower (Refinance)?', graneteVal3 === 'Rita Refi');

  // --- Scenario 4: fresh order, Purchase with TWO sellers -> no auto-fill (ambiguous), dropdown shows both ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'Seller One');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'Seller Two');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await goPrelim();
  await page.waitForTimeout(200);
  const graneteVal4 = await page.inputValue('#dv-name');
  console.log('No auto-fill with 2 sellers (ambiguous)?', graneteVal4 === '');
  const dropdownOptions = await page.$$eval('#dv-copySource option', els => els.map(e => e.textContent));
  console.log('Dropdown shows both sellers, filtered to Seller role?', dropdownOptions.includes('Seller One') && dropdownOptions.includes('Seller Two'));

  // Manually pick Seller Two and copy in
  await page.selectOption('#dv-copySource', { label: 'Seller Two' });
  await page.click('#btn-copy-derivation');
  await page.waitForTimeout(150);
  const graneteVal5 = await page.inputValue('#dv-name');
  console.log('Manual copy picks Seller Two?', graneteVal5 === 'Seller Two');

  // --- Liens Amount field --- (Tax Lien's field set is Debtor/Taxing Authority/Tax Type/Filed Date/Amount/Book/Page/Instrument)
  await page.selectOption('#lien-lienType', 'Tax Lien');
  await page.waitForTimeout(100);
  await page.fill('#lien-amount', '4500');
  await page.fill('#lien-debtor', 'Seller Two');
  await page.fill('#lien-taxingAuthority', 'County Tax Office');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);
  const panelText = await page.textContent('#tab-panel');
  console.log('Lien amount displayed formatted?', panelText.includes('$4,500.00'));

  const savedLien = await page.evaluate(() => {
    var order = JSON.parse(localStorage.getItem('genesis_orders_v1'))[0];
    return order.prelim.liens[0];
  });
  console.log('Lien amount saved?', savedLien.amount === '4500');

  console.log('ERRORS:', errors);
  await browser.close();
})();
