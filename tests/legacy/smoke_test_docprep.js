const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goEntry = () => page.click('[data-tab="entry"]');
  const goContacts = () => page.click('[data-tab="contacts"]');
  const goDocPrep = () => page.click('[data-tab="docPrep"]');

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
    if(opts.poa){
      await page.check('#cd-poaEnabled');
      await page.waitForTimeout(150);
      await page.fill('#cd-poaName', opts.poaAtifName);
    }
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
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

  // --- Nav tab exists ---
  console.log('Document Preparation nav tab exists?', !!(await page.$('[data-tab="docPrep"]')));

  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Seller', 'Sam Seller');
  await addContact('Buyer/Borrower', 'Bob Buyer');
  await addContact('Lender', 'Big Bank');
  await addContact('Buyer/Borrower', 'Wanda Buyer', { poa: true, poaAtifName: 'Pat Proxy' });

  await goDocPrep();
  await page.waitForTimeout(200);
  console.log('No page errors after opening Doc Prep?', errors.length === 0);

  // --- Deed subtab (default) ---
  let panelText = await page.textContent('#tab-panel');
  console.log('Deed subtab shows Grantor = Seller?', panelText.includes('Sam Seller'));
  console.log('Deed subtab shows Grantee includes Buyer/Borrowers?', panelText.includes('Bob Buyer') && panelText.includes('Wanda Buyer'));

  await page.selectOption('#dp-deed-instrumentType', 'Warranty Deed');
  await page.waitForTimeout(150);
  let considerationVal = await page.inputValue('#dp-deed-consideration');
  console.log('Deed Consideration auto-fills from Purchase Price?', considerationVal === '300000');

  await page.fill('#dp-deed-datedDate', '2026-08-01');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Deed generated summary mentions Warranty Deed and conveyance?', panelText.includes('This Warranty Deed conveys the Property from'));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Saved deed.instrumentType?', saved.docPrep.deed.instrumentType === 'Warranty Deed');
  console.log('Saved deed.consideration?', saved.docPrep.deed.consideration === '300000');
  console.log('Saved deed.datedDate?', saved.docPrep.deed.datedDate === '2026-08-01');

  // Tenancy selector writes to o.vesting.buyerTenancy
  await page.selectOption('#dp-deed-tenancy', 'Joint Tenants with Right of Survivorship');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Tenancy selector wrote to o.vesting.buyerTenancy?', saved.vesting.buyerTenancy === 'Joint Tenants with Right of Survivorship');
  panelText = await page.textContent('#tab-panel');
  console.log('Grantee clause reflects tenancy?', panelText.includes('as Joint Tenants with Right of Survivorship'));

  // --- Security Instrument subtab ---
  await page.click('[data-docprep-subtab="securityInstrument"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI subtab shows Mortgagor = Buyer/Borrowers?', panelText.includes('Bob Buyer') && panelText.includes('Wanda Buyer'));
  console.log('SI subtab shows Mortgagee = Lender?', panelText.includes('Big Bank'));

  let loanAmtVal = await page.inputValue('#dp-si-loanAmount');
  console.log('SI Loan Amount auto-fills from Order Entry Loan Amount?', loanAmtVal === '240000');

  await page.selectOption('#dp-si-instrumentType', 'Deed of Trust');
  await page.fill('#dp-si-trusteeName', 'ABC Title Co.');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI generated summary mentions Deed of Trust + Trustee?', panelText.includes('grants this Deed of Trust to Big Bank') && panelText.includes('ABC Title Co. as Trustee'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Saved securityInstrument fields?', saved.docPrep.securityInstrument.instrumentType === 'Deed of Trust' && saved.docPrep.securityInstrument.trusteeName === 'ABC Title Co.' && saved.docPrep.securityInstrument.loanAmount === '240000');

  // --- Affidavits subtab: add, edit, delete ---
  await page.click('[data-docprep-subtab="affidavits"]');
  await page.waitForTimeout(150);
  await page.selectOption('#aff-type', "Non-Foreign Affidavit (FIRPTA)");
  await page.fill('#aff-affiant', 'Sam Seller');
  await page.fill('#aff-datedDate', '2026-08-10');
  await page.click('#btn-add-aff');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Affidavit added and listed?', panelText.includes('Non-Foreign Affidavit (FIRPTA)') && panelText.includes('Affiant: Sam Seller'));
  console.log('Unrecorded affidavit shows "Not recorded"?', panelText.includes('Not recorded'));

  // Edit it, mark recorded
  await page.click('[data-edit-aff]');
  await page.waitForTimeout(150);
  const affId = await page.getAttribute('[data-save-aff]', 'data-save-aff');
  await page.check('#eaff-recorded-' + affId);
  await page.fill('#eaff-recordedDate-' + affId, '2026-08-11');
  await page.fill('#eaff-book-' + affId, '55');
  await page.fill('#eaff-page-' + affId, '66');
  await page.click('[data-save-aff]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('After edit, shows recorded info (Book 55)?', panelText.includes('Book 55'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Saved affidavit recorded=true, book/page set?', saved.docPrep.affidavits[0].recorded === true && saved.docPrep.affidavits[0].book === '55');

  await page.click('[data-del-aff]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Affidavit deleted (list empty again)?', panelText.includes('No affidavits on this file yet.'));

  // --- POA subtab ---
  await page.click('[data-docprep-subtab="poa"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('POA subtab lists Wanda Buyer (poaEnabled)?', panelText.includes('Wanda Buyer') && panelText.includes('Pat Proxy'));
  console.log('POA subtab does NOT list Bob Buyer (no POA)?', !panelText.includes('Bob Buyer'));

  const poaDatedInput = await page.$('[data-poa-dated]');
  const poaCid = await poaDatedInput.getAttribute('data-poa-dated');
  await page.fill('[data-poa-dated]', '2026-07-01');
  await page.fill('[data-poa-recorded="' + poaCid + '"]', '2026-07-02');
  await page.fill('[data-poa-book="' + poaCid + '"]', '10');
  await page.fill('[data-poa-page="' + poaCid + '"]', '20');
  await page.fill('[data-poa-instrnum="' + poaCid + '"]', 'INST-POA-1');
  await page.locator('[data-poa-instrnum="' + poaCid + '"]').blur();
  await page.waitForTimeout(150);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const wandaContact = saved.contacts.filter(c => c.name === 'Wanda Buyer')[0];
  console.log('POA structured fields saved onto the Contact record?', wandaContact.poaDatedDate === '2026-07-01' && wandaContact.poaBook === '10' && wandaContact.poaInstrumentNumber === 'INST-POA-1');

  // --- Notary Ack subtab ---
  await page.click('[data-docprep-subtab="notaryAck"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Notary Ack lists Sam Seller (Deed grantor)?', panelText.includes('Sam Seller') && panelText.includes('Deed'));
  console.log('Notary Ack lists Bob Buyer (SI mortgagor)?', panelText.includes('Bob Buyer') && panelText.includes('Security Instrument'));
  console.log('Notary Ack for Wanda Buyer (POA) uses Attorney-in-Fact language?', panelText.includes('Pat Proxy') && panelText.includes('as Attorney-in-Fact for Wanda Buyer'));
  console.log('Notary Ack has no recording-data fields (Book/Page inputs)?', !(await page.$('#tab-panel input[type="text"]')));

  console.log('ERRORS:', errors);
  await browser.close();
})();
