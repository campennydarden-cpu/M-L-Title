const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goContacts = () => page.click('[data-tab="contacts"]');

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
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
    localStorage.setItem('genesis_orders_v1', JSON.stringify([legacy]));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const legacyContact = migrated.contacts.filter(c => c.id === 'legacyContact1')[0];
  console.log('Legacy contact migration: signatureLines backfilled as array?', Array.isArray(legacyContact.signatureLines) && legacyContact.signatureLines.length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
