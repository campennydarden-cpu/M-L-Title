const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goEntry = () => page.click('[data-tab="entry"]');
  const goContacts = () => page.click('[data-tab="contacts"]');
  const goPrelim = () => page.click('[data-tab="prelim"]');

  // --- Scenario 1: Purchase, single Seller -> auto-fill from Seller ---
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
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
