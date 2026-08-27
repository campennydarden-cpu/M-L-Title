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
  const goSI = () => page.click('[data-tab="docPrepSI"]');
  const goAff = () => page.click('[data-tab="docPrepAffidavits"]');
  const goPoa = () => page.click('[data-tab="docPrepPoa"]');
  const goNotary = () => page.click('[data-tab="docPrepNotaryAck"]');

  async function addContact(role, name, opts){
    opts = opts || {};
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', role);
    await page.waitForTimeout(150);
    await page.fill('#cd-name', name);
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Purchase');
  await page.fill('#f-purchasePrice', '300000');
  await page.fill('#f-loanAmount', '240000');
  await page.waitForTimeout(150);

  // --- Nav structure ---
  const navText = await page.textContent('.section-nav');
  console.log('Nav shows "Document Preparation" group label?', navText.includes('Document Preparation'));
  console.log('Nav has separate Deed tab?', !!(await page.$('[data-tab="docPrepDeed"]')));
  console.log('Nav has separate Security Instrument tab?', !!(await page.$('[data-tab="docPrepSI"]')));
  console.log('Nav has separate Affidavits tab?', !!(await page.$('[data-tab="docPrepAffidavits"]')));
  console.log('Nav has separate POA tab?', !!(await page.$('[data-tab="docPrepPoa"]')));
  console.log('Nav has separate Notary Ack tab?', !!(await page.$('[data-tab="docPrepNotaryAck"]')));
  console.log('Old combined docPrep tab is gone?', !(await page.$('[data-tab="docPrep"]')));

  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Seller', 'Sam Seller');
  await addContact('Buyer/Borrower', 'Bob Buyer');
  await addContact('Lender', 'Big Bank');
  await addContact('Attorney', 'Andy Attorney');

  await goDeed();
  await page.waitForTimeout(200);
  console.log('No page errors on Deed screen?', errors.length === 0);

  // --- Draft status, no Recording Data card yet ---
  let panelText = await page.textContent('#tab-panel');
  console.log('Deed starts in Draft status?', panelText.includes('Status:') && panelText.includes('Draft'));
  console.log('Recording Data card hidden while Draft?', !panelText.includes('Recording Data'));

  // --- Prepared By / Return To ---
  console.log('Prepared By select lists Andy Attorney?', (await page.textContent('#dp-deed-preparedById')).includes('Andy Attorney'));
  await page.selectOption('#dp-deed-preparedById', { label: 'Andy Attorney (Attorney)' });
  await page.selectOption('#dp-deed-returnToId', { label: 'Big Bank (Lender)' });
  await page.waitForTimeout(150);
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Prepared By saved as Andy Attorney contact id?', saved.docPrep.deed.preparedById === saved.contacts.filter(c=>c.name==='Andy Attorney')[0].id);
  console.log('Return To saved as Big Bank contact id?', saved.docPrep.deed.returnToId === saved.contacts.filter(c=>c.name==='Big Bank')[0].id);

  // --- Exemption Code ---
  await page.fill('#dp-deed-exemptionCode', 'EX-12');
  await page.waitForTimeout(150);

  // --- Grantor/Grantee still work ---
  panelText = await page.textContent('#tab-panel');
  console.log('Grantor shows Sam Seller?', panelText.includes('Sam Seller'));
  console.log('Grantee shows Bob Buyer?', panelText.includes('Bob Buyer'));

  // --- Consideration auto-fill ---
  let considerationVal = await page.inputValue('#dp-deed-consideration');
  console.log('Consideration auto-fills from Purchase Price?', considerationVal === '300000');

  await page.selectOption('#dp-deed-instrumentType', 'Warranty Deed');
  await page.fill('#dp-deed-datedDate', '2026-08-01');
  await page.waitForTimeout(150);

  // --- Legal Exhibit checkbox ---
  panelText = await page.textContent('#tab-panel');
  console.log('Legal preview shows inline text by default (unchecked)?', !panelText.includes('See Legal Description attached hereto as Exhibit'));
  await page.check('#dp-deed-legalAsExhibit');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Legal preview switches to Exhibit A language when checked?', panelText.includes('See Legal Description attached hereto as Exhibit'));

  // --- Parcel / Derivation / Situs pulled sections exist ---
  console.log('Parcel section present?', panelText.includes('Parcel'));
  console.log('Derivation section present?', panelText.includes('Derivation'));
  console.log('Situs Address section present?', panelText.includes('Situs Address'));

  // --- Signature Lines / Notary Block (both independently editable as of Item H -- see
  // smoke_test_deed_independent.js for full coverage of seed/generate/edit/free-form behavior) ---
  console.log('Signature Lines card present?', panelText.includes('Signature Lines'));
  console.log('Notary Block card present, empty until Generated (not auto-populated)?', panelText.includes('Notary Block') && !panelText.includes('personally appeared Sam Seller'));

  // --- Subject To: add manual + chip from Exception Matters ---
  await page.fill('#dp-deed-subjectto-description', 'Easements and restrictions of record');
  await page.click('#btn-add-deed-subjectto');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Manual Subject To item added?', panelText.includes('Easements and restrictions of record'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Subject To saved on docPrep.deed.subjectTo?', saved.docPrep.deed.subjectTo.length === 1);

  // Edit it
  await page.click('[data-edit-deed-subjectto]');
  await page.waitForTimeout(150);
  const stId = await page.getAttribute('[data-save-deed-subjectto]', 'data-save-deed-subjectto');
  await page.fill('#edeedst-description-' + stId, 'Easements, restrictions, and ROW of record');
  await page.click('[data-save-deed-subjectto]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Subject To edited successfully?', panelText.includes('Easements, restrictions, and ROW of record'));

  // Delete it
  await page.click('[data-del-deed-subjectto]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Subject To deleted?', !panelText.includes('Easements, restrictions, and ROW of record'));

  // --- Finalize flow ---
  await page.click('#btn-finalize-deed');
  await page.waitForTimeout(150);
  console.log('Confirm strip appears after clicking Finalize?', !!(await page.$('#btn-confirm-finalize-deed')));
  await page.click('#btn-confirm-finalize-deed');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Status shows Final after confirming?', panelText.includes('Final'));
  console.log('Recording Data card now visible?', panelText.includes('Recording Data'));

  await page.fill('#dp-deed-recordedDate', '2026-08-15');
  await page.fill('#dp-deed-book', '900');
  await page.fill('#dp-deed-page', '10');
  await page.fill('#dp-deed-instrumentNumber', 'INST-DEED-1');
  await page.waitForTimeout(150);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('deed.final = true saved?', saved.docPrep.deed.final === true);
  console.log('Recording data saved (book=900)?', saved.docPrep.deed.book === '900');

  // --- Revert to Draft ---
  await page.click('#btn-unfinalize-deed');
  await page.waitForTimeout(150);
  console.log('Confirm strip appears after clicking Revert?', !!(await page.$('#btn-confirm-unfinalize-deed')));
  await page.click('#btn-confirm-unfinalize-deed');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Status reverted to Draft?', panelText.includes('Draft') && !(await page.$('#btn-unfinalize-deed')));
  console.log('Recording Data card hidden again?', !panelText.includes('Recording Data'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Recording data (book=900) preserved even though hidden?', saved.docPrep.deed.book === '900');
  console.log('deed.final = false after revert?', saved.docPrep.deed.final === false);

  // --- Other Doc Prep tabs still function as separate top-level tabs ---
  await goSI();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Security Instrument tab renders (Mortgagor/Mortgagee)?', panelText.includes('Mortgagor') && panelText.includes('Mortgagee'));

  await goAff();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Affidavits tab renders?', panelText.includes('Affidavits'));

  await goPoa();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('POA tab renders (empty state, no POA contacts)?', panelText.includes('Power of Attorney'));

  await goNotary();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Notary Ack tab renders (Sam Seller as Deed signer)?', panelText.includes('Sam Seller') && panelText.includes('Deed'));

  console.log('ERRORS:', errors);
  await browser.close();
})();
