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
  const goScheduleA = () => page.click('[data-tab="scheduleA"]');

  async function addContact(role, name, marital, marriedToLabel){
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', role);
    await page.fill('#cd-name', name);
    if(marital) await page.selectOption('#cd-maritalStatus', marital);
    if(marriedToLabel){
      await page.waitForTimeout(100);
      await page.selectOption('#cd-marriedTo', { label: marriedToLabel });
    }
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

  // --- Scenario 1: Purchase, 2 married Sellers -> Derivation Grantee auto-fills combined ---
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
  await addContact('Seller', 'Jane Married', 'Married');
  await addContact('Seller', 'John Married', 'Married', 'Jane Married');

  await goPrelim();
  await page.waitForTimeout(200);
  const grantee1 = await page.inputValue('#dv-name');
  console.log('Married-pair Sellers auto-fill Grantee as combined clause?', grantee1 === 'Jane Married and John Married, husband and wife');

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim.derivation);
  console.log('Saved derivation.name is combined pair?', saved.name === 'Jane Married and John Married, husband and wife');
  console.log('Saved derivation.entityType stays Individual?', saved.entityType === 'Individual');

  // --- Scenario 2: regression -- 2 UNRELATED sellers still bail out (ambiguous, blank) ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Seller', 'Unrelated One', 'Single');
  await addContact('Seller', 'Unrelated Two', 'Single');
  await goPrelim();
  await page.waitForTimeout(200);
  const grantee2 = await page.inputValue('#dv-name');
  console.log('Two unrelated sellers still leave Grantee blank (no false-positive pairing)?', grantee2 === '');

  // "Both" option should NOT be offered when the pair isn't actually married
  const dropdownOpts2 = await page.$$eval('#dv-copySource option', els => els.map(e => e.textContent));
  console.log('No "Both" option for unrelated sellers?', !dropdownOpts2.some(t => t.startsWith('Both (')));

  // --- Scenario 3: 3 sellers (married pair + 1 unrelated) -> stays ambiguous, does not silently drop the 3rd ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Seller', 'Trio Jane', 'Married');
  await addContact('Seller', 'Trio John', 'Married', 'Trio Jane');
  await addContact('Seller', 'Trio Extra', 'Single');
  await goPrelim();
  await page.waitForTimeout(200);
  const grantee3 = await page.inputValue('#dv-name');
  console.log('3 sellers (pair + 1 extra) stays ambiguous/blank (does not drop the extra seller)?', grantee3 === '');
  const dropdownOpts3 = await page.$$eval('#dv-copySource option', els => els.map(e => e.textContent));
  console.log('No "Both" convenience shown when a 3rd unrelated candidate is present?', !dropdownOpts3.some(t => t.startsWith('Both (')));

  // --- Scenario 4: manual "Both (...)" dropdown option on a 2-person married pair ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Buyer/Borrower', 'Manual Jane', 'Married');
  await addContact('Buyer/Borrower', 'Manual John', 'Married', 'Manual Jane');
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  await goPrelim();
  await page.waitForTimeout(200);
  const grantee4 = await page.inputValue('#dv-name');
  console.log('Married Buyer/Borrower pair auto-fills Grantee on Refinance too?', grantee4 === 'Manual Jane and Manual John, husband and wife');

  // Clear it, then use the manual "Both" dropdown option to re-copy it in
  await page.fill('#dv-name', '');
  await page.waitForTimeout(150);
  const dropdownOpts4 = await page.$$eval('#dv-copySource option', els => els.map(e => e.textContent));
  console.log('"Both" option present in Copy Grantee dropdown?', dropdownOpts4.includes('Both (Manual Jane and Manual John, husband and wife)'));
  await page.selectOption('#dv-copySource', { label: 'Both (Manual Jane and Manual John, husband and wife)' });
  await page.click('#btn-copy-derivation');
  await page.waitForTimeout(150);
  const grantee5 = await page.inputValue('#dv-name');
  console.log('Manual "Both" copy sets combined Grantee?', grantee5 === 'Manual Jane and Manual John, husband and wife');

  // --- Scenario 5: Owner's Policy "All Buyer/Borrowers" seed chip ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Buyer/Borrower', 'Chip Jane', 'Married');
  await addContact('Buyer/Borrower', 'Chip John', 'Married', 'Chip Jane');

  await goScheduleA();
  await page.waitForTimeout(200);
  const allChipVisible = !!(await page.$('[data-seed-owner-insured-all]'));
  console.log('"All Buyer/Borrowers" chip appears with 2+ buyer/borrowers?', allChipVisible);
  const allChipText = await page.textContent('[data-seed-owner-insured-all]').catch(() => '');
  console.log('Chip preview shows combined married-pair clause?', allChipText.includes('Chip Jane and Chip John, husband and wife'));

  await page.click('[data-seed-owner-insured-all]');
  await page.waitForTimeout(150);
  const ownerProposed = await page.inputValue('#sa-ownerProposedInsured');
  console.log('Clicking "All Buyer/Borrowers" sets combined Proposed Insured?', ownerProposed === 'Chip Jane and Chip John, husband and wife');

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.scheduleA.ownerPolicy.proposedInsured);
  console.log('Saved to ownerPolicy.proposedInsured?', saved === 'Chip Jane and Chip John, husband and wife');

  // Single buyer/borrower -> no "All" chip (individual chip is enough)
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Buyer/Borrower', 'Solo Buyer', 'Single');
  await goScheduleA();
  await page.waitForTimeout(200);
  const allChipHiddenSolo = !(await page.$('[data-seed-owner-insured-all]'));
  console.log('No "All Buyer/Borrowers" chip with only 1 buyer/borrower?', allChipHiddenSolo);
  const soloChipVisible = !!(await page.$('[data-seed-owner-insured]'));
  console.log('Individual seed chip still present for the solo buyer?', soloChipVisible);

  console.log('ERRORS:', errors);
  await browser.close();
})();
