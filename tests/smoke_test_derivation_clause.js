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

  // --- Instrument Type dropdown present with correct options ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  console.log('Instrument Type field present?', !!(await page.$('#dv-instrumentType')));
  const instrOptions = await page.$eval('#dv-instrumentType', el => Array.from(el.options).map(o => o.value));
  const expected = ["", "Warranty Deed", "Special Warranty Deed", "Limited Warranty Deed", "Trustee's Deed", "Deed of Distribution", "Gift Deed", "Quitclaim Deed", "Grant Deed", "Deed of Bargain and Sale", "Interspousal Transfer Deed", "Transfer on Death Deed", "Affidavit", "Death Certificate", "Divorce Decree", "Quiet Title Action", "Confirmatory Deed"];
  console.log('Instrument Type options correct?', JSON.stringify(instrOptions) === JSON.stringify(expected));

  // --- Both preview boxes present, initially incomplete ---
  console.log('Derivation Clause preview box present?', !!(await page.$('#dv-clause-preview')));
  console.log('Vested In preview box present?', !!(await page.$('#dv-vesting-preview')));
  let clauseText = await page.textContent('#dv-clause-preview');
  console.log('Derivation Clause preview shows incomplete-state message initially?', clauseText.includes('Fill in Instrument Type'));

  // --- Fill Derivation fields but NOT county yet -> clause should stay incomplete ---
  await page.selectOption('#dv-instrumentType', 'Warranty Deed');
  await page.fill('#dv-grantorName', 'Old Owner LLC');
  await page.fill('#dv-name', 'Jane Buyer');
  await page.fill('#dv-recordedDate', '2020-05-10');
  await page.fill('#dv-book', '123');
  await page.fill('#dv-page', '456');
  await page.fill('#dv-instrumentNumber', 'INS-001');
  await page.click('body');
  await page.waitForTimeout(150);
  clauseText = await page.textContent('#dv-clause-preview');
  console.log('Clause still incomplete without County?', clauseText.includes('Fill in Instrument Type'));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('instrumentType saved?', saved.prelim.derivation.instrumentType === 'Warranty Deed');
  console.log('grantorName saved?', saved.prelim.derivation.grantorName === 'Old Owner LLC');
  console.log('recordedDate saved?', saved.prelim.derivation.recordedDate === '2020-05-10');

  // --- Add County via Property Identification tab -> clause completes ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.fill('#p-county', 'Travis');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  clauseText = await page.textContent('#dv-clause-preview');
  const expectedClause = 'Being the same parcel conveyed unto Jane Buyer by Warranty Deed of Old Owner LLC recorded May 10, 2020 as Book 123, Page 456, Instrument No. INS-001 of the Travis County records.';
  console.log('Full derivation clause correct once County is on file?', clauseText.trim() === expectedClause);

  // --- Vested In preview still shows the separate vesting-naming clause ---
  const vestingText = await page.textContent('#dv-vesting-preview');
  console.log('Vested In preview shows plain grantee name (not the derivation sentence)?', vestingText.trim() === 'Jane Buyer');

  // --- Property > Legal Description tab shows the corrected Derivation Clause ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Property Legal Description tab shows correct Derivation Clause?', panelText.includes(expectedClause));
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.click('body');
  await page.waitForTimeout(150);

  // --- Commitment tab summary card shows Derivation row separately from Vesting ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '123 Main St');
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Commitment summary card shows Derivation label?', panelText.includes('Derivation'));
  console.log('Commitment summary card shows full derivation clause?', panelText.includes(expectedClause));
  console.log('Commitment summary card still shows Vesting label separately?', panelText.includes('Vesting'));

  // --- Generated doc includes Derivation line distinct from Vested In line ---
  await page.click('#btn-generate');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Generated doc shows Derivation doc line?', panelText.includes('Derivation'));
  console.log('Generated doc shows full derivation clause text?', panelText.includes(expectedClause));
  console.log('Generated doc still shows Vested In line?', panelText.includes('Vested In'));
  console.log('Generated doc Vested In shows plain grantee name?', panelText.includes('Vested In') && panelText.includes('Jane Buyer'));

  // --- Copy from Derivation seed chip on Chain of Title now carries actual instrument type ---
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  await page.click('[data-seed-cot-derivation]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const lastCot = saved.commitment.chainOfTitle[saved.commitment.chainOfTitle.length - 1];
  console.log('Chain of Title seed carries actual Warranty Deed instrument type (not hardcoded Deed)?', lastCot.instrumentType === 'Warranty Deed');

  // --- File History logs Instrument Type field change ---
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('History logs Instrument Type field change?', panelText.includes('Instrument Type') && panelText.includes('Warranty Deed'));

  // --- Migration test: old order missing derivation.instrumentType ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDDERIV', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01', derivation: { datedDate: '', recordedDate: '2019-01-01', book: '1', page: '2', instrumentNumber: '', consideration: '', name: 'Old Grantee', entityType: 'Individual', grantorName: 'Old Grantor' } },
      property: { county: 'Dallas' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDDERIV');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Prelim/Derivation card renders w/o crash?', !panelText.includes('Something went wrong'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Old order derivation.instrumentType backfilled to ""?', savedOld.prelim.derivation.instrumentType === '');
  console.log('Old order clause preview shows incomplete-state (no instrument type)?', (await page.textContent('#dv-clause-preview')).includes('Fill in Instrument Type'));

  console.log('ERRORS:', errors);
  await browser.close();
})();
