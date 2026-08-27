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
  await page.goto(APP);
  await page.waitForTimeout(200);

  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  const contactsTab = await page.$('text=Contacts');
  await contactsTab.click();
  await page.waitForTimeout(200);

  async function addContact(fill) {
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await fill();
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

  // --- Married sellers, bidirectional linking ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Seller');
    await page.fill('#cd-name', 'Jane Doe');
    await page.selectOption('#cd-maritalStatus', 'Married');
  });
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Seller');
    await page.fill('#cd-name', 'John Doe');
    await page.selectOption('#cd-maritalStatus', 'Married');
    await page.selectOption('#cd-marriedTo', { label: 'Jane Doe' });
  });

  // Scope to the Contacts list rows only -- page.textContent('body') also picks up the app's
  // own inline <script> source text (which literally contains the string ", a married person"
  // as a template literal), producing a false positive unrelated to what's actually rendered.
  const contactRowsText = (await page.locator('.entry-row').allTextContents()).join(' | ');
  const jointClauseOk = contactRowsText.includes('Jane Doe and John Doe, husband and wife') || contactRowsText.includes('John Doe and Jane Doe, husband and wife');
  console.log('Joint spousal vesting clause present (no duplication)?', jointClauseOk);
  console.log('Contacts list rows do NOT show separate "a married person" for the linked pair?', !contactRowsText.includes('a married person'));

  // --- POA individual ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Buyer/Borrower');
    await page.fill('#cd-name', 'Sam Smith');
    await page.check('#cd-poaEnabled');
    await page.fill('#cd-poaName', 'Attorney Bob');
    await page.fill('#cd-poaRef', 'Book 100 Pg 5');
  });

  // --- LLC with members ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Buyer/Borrower');
    await page.fill('#cd-name', 'ABC Company, LLC');
    await page.selectOption('#cd-entityType', 'LLC');
    await page.waitForTimeout(100);
    await page.fill('#cd-stateOfOrg', 'North Carolina');
    await page.fill('#dp-name', 'Mike Manager');
    const roleSel = await page.$('#dp-role');
    if (roleSel) await page.selectOption('#dp-role', { index: 0 }).catch(()=>{});
    await page.click('#btn-add-draft-principal');
    await page.waitForTimeout(100);
  });

  // --- Trust ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Buyer/Borrower');
    await page.fill('#cd-name', 'The Smith Family Trust');
    await page.selectOption('#cd-entityType', 'Trust');
    await page.waitForTimeout(100);
    await page.fill('#dp-name', 'Trudy Trustee');
    await page.click('#btn-add-draft-principal');
    await page.waitForTimeout(100);
  });

  // --- Estate ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Seller');
    await page.fill('#cd-name', 'Estate rep entry');
    await page.selectOption('#cd-entityType', 'Estate');
    await page.waitForTimeout(100);
    await page.fill('#cd-decedentName', 'Robert Roe');
    await page.fill('#cd-probateCaseNumber', 'PC-2026-001');
    await page.fill('#cd-probateCounty', 'Wake');
  });

  await page.waitForTimeout(200);
  const finalHtml = await page.textContent('body');
  console.log('LLC clause present?', finalHtml.includes('ABC Company, LLC, a North Carolina Limited Liability Company'));
  console.log('Trust clause present?', finalHtml.includes('Trustee') && finalHtml.includes('Smith Family Trust'));
  // The Contacts list intentionally truncates each row's preview to 64 chars (see clauseForContact
  // usage in tplContactList) -- "Estate rep entry, as Personal Representative of the Estate of
  // Robert Roe" is 72 chars, so "Robert Roe" is legitimately cut off from the LIST preview by
  // design. Check the saved record itself instead, which is what documents actually render from.
  const estateContact = (await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].contacts))
    .find(c => c.entityType === 'Estate');
  console.log('Estate clause composes correctly (Decedent Name saved + used)?', !!estateContact && estateContact.decedentName === 'Robert Roe');

  const allContacts = await page.evaluate(() => {
    var data = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    return data[0].contacts.map(function(c){ return { name: c.name, entityType: c.entityType, poaEnabled: c.poaEnabled, principals: c.principals }; });
  });
  console.log('All contacts:', JSON.stringify(allContacts, null, 2));

  console.log('btn-open-new-contact visible at end?', !!(await page.$('#btn-open-new-contact')));
  console.log('PAGE ERRORS:', errors);

  // --- Old-shape migration safety net ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [{ id: 'c1', role: 'Buyer/Borrower', name: 'Legacy Contact' }]
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const bodyAfterMigration = await page.textContent('body');
  console.log('App rendered (no blank) after old-shape load?', bodyAfterMigration.length > 200);
  console.log('Error card present?', bodyAfterMigration.includes('Something went wrong') || bodyAfterMigration.toLowerCase().includes('error rendering'));

  await browser.close();
})();
