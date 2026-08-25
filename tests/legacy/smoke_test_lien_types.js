const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);

  // --- Type select present with all 11 options ---
  const typeOptions = await page.$eval('#lien-lienType', el => Array.from(el.options).map(o => o.value));
  const expectedTypes = ["Judgment","Tax Lien","HOA/COA Lien","Mechanics Lien","Lis Pendens","Assignment","Loan Modification Agreement","Tax Sale Certificate","Municipal Lien","Utility Lien","Other"];
  console.log('Lien Type select has all 11 options in order?', JSON.stringify(typeOptions) === JSON.stringify(expectedTypes));

  // --- Default (Judgment) field set present ---
  console.log('Judgment default: Debtor field present?', !!(await page.$('#lien-debtor')));
  console.log('Judgment default: Creditor field present?', !!(await page.$('#lien-creditor')));
  console.log('Judgment default: Docket Date (datedDate) field present?', !!(await page.$('#lien-datedDate')));
  console.log('Judgment default: Case Number field present?', !!(await page.$('#lien-caseNumber')));
  console.log('Judgment default: Court field present?', !!(await page.$('#lien-court')));
  console.log('Judgment default: Amount field present?', !!(await page.$('#lien-amount')));
  console.log('Judgment default: Book field NOT present?', !(await page.$('#lien-book')));

  // --- Fill and add a Judgment (uses the default-selected type, no explicit selectOption needed) ---
  await page.fill('#lien-debtor', 'Original Debtor');
  await page.fill('#lien-creditor', 'Original Creditor');
  await page.fill('#lien-datedDate', '2017-03-01');
  await page.fill('#lien-caseNumber', 'JG-2017-01');
  await page.fill('#lien-court', 'Wake County District Court');
  await page.fill('#lien-amount', '2500');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // --- Live reshape: switch to Tax Lien in ADD form (unsaved) ---
  await page.selectOption('#lien-lienType', 'Tax Lien');
  await page.waitForTimeout(100);
  console.log('Tax Lien: Taxing Authority field present?', !!(await page.$('#lien-taxingAuthority')));
  console.log('Tax Lien: Tax Type select present?', !!(await page.$('#lien-taxType')));
  const taxTypeOptions = await page.$eval('#lien-taxType', el => Array.from(el.options).map(o => o.value));
  console.log('Tax Lien: Tax Type options correct?', JSON.stringify(taxTypeOptions) === JSON.stringify(["", "Income","Property","Franchise","Sales/Use","Estate","Other"]));
  console.log('Tax Lien: Book/Page/Instrument present?', !!(await page.$('#lien-book')) && !!(await page.$('#lien-page')) && !!(await page.$('#lien-instrumentNumber')));
  console.log('Tax Lien: Court/Case Number NOT present (Judgment-only)?', !(await page.$('#lien-court')) && !(await page.$('#lien-caseNumber')));

  // --- Fill and add a Tax Lien ---
  await page.fill('#lien-debtor', 'John Doe');
  await page.fill('#lien-taxingAuthority', 'NC Dept of Revenue');
  await page.selectOption('#lien-taxType', 'Property');
  await page.fill('#lien-filedDate', '2019-06-15');
  await page.fill('#lien-amount', '4500');
  await page.fill('#lien-book', '77');
  await page.fill('#lien-page', '88');
  await page.fill('#lien-instrumentNumber', 'TL-2019-01');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  let liens = saved.prelim.liens;
  console.log('Tax Lien saved with correct fields?', liens[1].lienType === 'Tax Lien' && liens[1].debtor === 'John Doe' && liens[1].taxingAuthority === 'NC Dept of Revenue' && liens[1].taxType === 'Property' && liens[1].filedDate === '2019-06-15' && liens[1].amount === '4500' && liens[1].book === '77' && liens[1].page === '88' && liens[1].instrumentNumber === 'TL-2019-01');
  console.log('Tax Lien saved w/ unrelated fields blank (court)?', liens[1].court === '');

  // --- ADD form reset back to Judgment default after add (fresh render) ---
  let panelText = await page.textContent('#tab-panel');
  console.log('Row title shows Tax Lien: Taxing Authority v Debtor?', panelText.includes('Tax Lien: NC Dept of Revenue v. John Doe'));
  console.log('Row bits show Tax Type?', panelText.includes('Tax Type: Property'));

  // --- HOA/COA Lien ---
  await page.selectOption('#lien-lienType', 'HOA/COA Lien');
  await page.waitForTimeout(100);
  console.log('HOA/COA Lien: HOA/COA Company field present?', !!(await page.$('#lien-hoaCompany')));
  await page.fill('#lien-debtor', 'Jane Roe');
  await page.fill('#lien-hoaCompany', 'Sunset Ridge HOA');
  await page.fill('#lien-filedDate', '2021-02-01');
  await page.fill('#lien-amount', '1200');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // --- Mechanics Lien ---
  await page.selectOption('#lien-lienType', 'Mechanics Lien');
  await page.waitForTimeout(100);
  console.log('Mechanics Lien: Materialman field present?', !!(await page.$('#lien-materialman')));
  console.log('Mechanics Lien: Date of Last Service/Furnishing field present?', !!(await page.$('#lien-lastServiceDate')));
  await page.fill('#lien-debtor', 'Bob Builder');
  await page.fill('#lien-materialman', 'ACME Supply Co');
  await page.fill('#lien-lastServiceDate', '2022-01-10');
  await page.fill('#lien-recordedDate', '2022-02-01');
  await page.fill('#lien-amount', '3000');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // --- Lis Pendens ---
  await page.selectOption('#lien-lienType', 'Lis Pendens');
  await page.waitForTimeout(100);
  console.log('Lis Pendens: Plaintiff/Defendant/Court/Case Number present, no Amount?', !!(await page.$('#lien-plaintiff')) && !!(await page.$('#lien-defendant')) && !!(await page.$('#lien-court')) && !!(await page.$('#lien-caseNumber')) && !(await page.$('#lien-amount')));
  await page.fill('#lien-plaintiff', 'ACME Bank');
  await page.fill('#lien-defendant', 'John Doe');
  await page.fill('#lien-court', 'Wake County Superior Court');
  await page.fill('#lien-caseNumber', 'LP-2023-99');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // --- Assignment ---
  await page.selectOption('#lien-lienType', 'Assignment');
  await page.waitForTimeout(100);
  console.log('Assignment: Assignor/Assignee/Effective/Affects-SI fields present?', !!(await page.$('#lien-assignor')) && !!(await page.$('#lien-assignee')) && !!(await page.$('#lien-effectiveDate')) && !!(await page.$('#lien-affectsBook')) && !!(await page.$('#lien-affectsPage')) && !!(await page.$('#lien-affectsInstrumentNumber')));
  await page.fill('#lien-assignor', 'Big Bank NA');
  await page.fill('#lien-assignee', 'Loan Servicer LLC');
  await page.fill('#lien-effectiveDate', '2020-05-01');
  await page.fill('#lien-recordedDate', '2020-05-10');
  await page.fill('#lien-affectsBook', '4021');
  await page.fill('#lien-affectsPage', '118');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // --- Loan Modification Agreement ---
  await page.selectOption('#lien-lienType', 'Loan Modification Agreement');
  await page.waitForTimeout(100);
  console.log('Loan Mod Agreement: Recorded Date/Affects-SI present, no Assignor?', !!(await page.$('#lien-recordedDate')) && !!(await page.$('#lien-affectsBook')) && !(await page.$('#lien-assignor')));
  await page.fill('#lien-recordedDate', '2023-01-01');
  await page.fill('#lien-affectsBook', '4021');
  await page.fill('#lien-affectsPage', '118');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // --- Tax Sale Certificate ---
  await page.selectOption('#lien-lienType', 'Tax Sale Certificate');
  await page.waitForTimeout(100);
  console.log('Tax Sale Certificate: Certificate ID/Redemption Expiration present?', !!(await page.$('#lien-certificateId')) && !!(await page.$('#lien-redemptionExpiration')));
  await page.fill('#lien-certificateId', 'TSC-001');
  await page.fill('#lien-datedDate', '2021-01-01');
  await page.fill('#lien-recordedDate', '2021-01-15');
  await page.fill('#lien-debtor', 'John Doe');
  await page.fill('#lien-creditor', 'County Tax Collector');
  await page.fill('#lien-redemptionExpiration', '2024-01-15');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  liens = saved.prelim.liens;
  console.log('All 8 liens saved (Judgment + Tax Lien + HOA/COA + Mechanics + Lis Pendens + Assignment + Loan Mod + Tax Sale Cert)?', liens.length === 8);
  console.log('First lien is the Judgment?', liens[0].lienType === 'Judgment' && liens[0].debtor === 'Original Debtor');
  const tsc = liens.filter(l => l.lienType === 'Tax Sale Certificate')[0];
  console.log('Tax Sale Certificate saved correctly?', tsc && tsc.certificateId === 'TSC-001' && tsc.redemptionExpiration === '2024-01-15' && tsc.creditor === 'County Tax Collector');
  const asg = liens.filter(l => l.lienType === 'Assignment')[0];
  console.log('Assignment saved correctly w/ affects-SI fields?', asg && asg.assignor === 'Big Bank NA' && asg.affectsBook === '4021' && asg.affectsPage === '118');

  // --- Requirement chips: Assignment / Loan Modification Agreement get NO chip; others do ---
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  const chipCount = await page.$$eval('[data-seed-req-lien]', els => els.length);
  console.log('Exactly 6 lien Requirement chips (8 liens minus Assignment minus Loan Mod Agreement)?', chipCount === 6);

  // Click the Lis Pendens chip and check dismissal-style requirement text
  const chipTitles = await page.$$eval('[data-seed-req-lien]', els => els.map(e => e.getAttribute('title')));
  console.log('Lis Pendens chip has dismissal-style text?', chipTitles.some(t => t.includes('Dismissal of Lis Pendens') && t.includes('ACME Bank') && t.includes('John Doe')));
  console.log('Tax Lien chip mentions taxing authority as payee?', chipTitles.some(t => t.includes('Satisfaction of Tax Lien') && t.includes('NC Dept of Revenue')));
  console.log('No chip title mentions Assignment/Loan Modification Agreement boilerplate (excluded from chips)?', !chipTitles.some(t => t.includes('Satisfaction of Assignment') || t.includes('Satisfaction of Loan Modification')));

  // --- Edit flow: live reshape on an EXISTING lien, then Cancel discards the type change ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  const lienId = liens[0].id; // first lien = Judgment
  await page.click('[data-edit-lien="' + lienId + '"]');
  await page.waitForTimeout(150);
  console.log('Edit form shows Judgment fields (Debtor present)?', !!(await page.$('#elien-debtor-' + lienId)));
  const debtorBeforeSwitch = await page.inputValue('#elien-debtor-' + lienId);
  console.log('Debtor prefilled in edit form?', debtorBeforeSwitch.length > 0);

  await page.selectOption('#elien-lienType-' + lienId, 'HOA/COA Lien');
  await page.waitForTimeout(100);
  console.log('Edit form reshapes to HOA/COA Lien fields (hoaCompany present)?', !!(await page.$('#elien-hoaCompany-' + lienId)));
  console.log('Edit form Debtor value carried forward through reshape?', (await page.inputValue('#elien-debtor-' + lienId)) === debtorBeforeSwitch);
  console.log('Edit form no longer shows Judgment-only Case Number field?', !(await page.$('#elien-caseNumber-' + lienId)));

  // Cancel -- should discard the in-progress type switch entirely
  await page.click('[data-cancel-lien="' + lienId + '"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const lienAfterCancel = saved.prelim.liens.filter(l => l.id === lienId)[0];
  console.log('Cancel discards in-progress type change (still Judgment)?', lienAfterCancel.lienType === 'Judgment');

  // --- Edit flow: actually SAVE a type change ---
  await page.click('[data-edit-lien="' + lienId + '"]');
  await page.waitForTimeout(150);
  await page.selectOption('#elien-lienType-' + lienId, 'HOA/COA Lien');
  await page.waitForTimeout(100);
  await page.fill('#elien-hoaCompany-' + lienId, 'Maple Grove HOA');
  await page.click('[data-save-lien="' + lienId + '"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const lienAfterSave = saved.prelim.liens.filter(l => l.id === lienId)[0];
  console.log('Saved type change to HOA/COA Lien?', lienAfterSave.lienType === 'HOA/COA Lien' && lienAfterSave.hoaCompany === 'Maple Grove HOA');
  console.log('Old Judgment-only fields (caseNumber, court) preserved but hidden, not wiped?', lienAfterSave.caseNumber !== undefined);

  // --- File History logging ---
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('History logs Lien added event?', panelText.includes('Lien / Encumbrance added'));
  console.log('History logs Lien deleted-or-edited (HOA/COA Company field change) event?', panelText.includes('HOA/COA Company'));

  // --- Migration test: old order with flat/legacy lien shape ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDLIEN', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01', liens: [
        { id: 'oldlien1', lienType: 'Judgment', amount: '5000', datedDate: '2018-01-01', filedDate: '2018-01-05', court: 'Old County Court', caseNumber: 'OLD-001', debtor: 'Legacy Debtor', creditor: 'Legacy Creditor' }
      ] },
      property: { county: 'Dallas' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDLIEN');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Liens section renders w/o crash?', !panelText.includes('Something went wrong'));
  console.log('Old order legacy Judgment lien still displays correctly?', panelText.includes('Legacy Creditor v. Legacy Debtor'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const oldLien = savedOld.prelim.liens[0];
  console.log('Old lien backfilled with new keys (e.g. taxingAuthority = "")?', oldLien.taxingAuthority === '');
  console.log('Old lien backfilled with assignor/assignee/affectsBook etc?', oldLien.assignor === '' && oldLien.affectsBook === '' && oldLien.redemptionExpiration === '');
  console.log('Old lien original Judgment fields preserved?', oldLien.debtor === 'Legacy Debtor' && oldLien.court === 'Old County Court');

  // Editing the migrated old lien should not crash and should show Judgment fields correctly
  await page.click('[data-edit-lien="oldlien1"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old lien edit form renders w/o crash and shows Judgment fields?', !panelText.includes('Something went wrong') && !!(await page.$('#elien-debtor-oldlien1')));

  console.log('ERRORS:', errors);
  await browser.close();
})();
