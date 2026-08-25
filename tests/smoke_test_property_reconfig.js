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

  // --- Fill Order Entry address fields for prefill test ---
  await page.fill('#f-propertyAddress', '1421 Cypress Bend Ct.');
  await page.fill('#f-city', 'Austin');
  await page.fill('#f-county', 'Travis');
  await page.fill('#f-stateCode', 'TX');
  await page.fill('#f-zip', '78701');
  await page.fill('#f-parcelNumber', 'PCL-9988');
  await page.click('body');
  await page.waitForTimeout(150);

  // --- Sub-tab presence / navigation ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Property tab renders w/o error?', !panelText.includes('Something went wrong'));

  const subtabLabels = await page.$$eval('.subtab-btn', els => els.map(e => e.textContent));
  console.log('Three sub-tabs present w/ correct labels?', JSON.stringify(subtabLabels) === JSON.stringify(['Identification', 'Legal Description', 'Plat / Survey Matters']));
  console.log('Identification sub-tab active by default?', await page.$eval('[data-subtab="identification"]', el => el.classList.contains('active')));

  // --- Prefill from Order Entry (non-destructive one-time) ---
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('property.city prefilled from Order Entry?', saved.property.city === 'Austin');
  console.log('property.county prefilled?', saved.property.county === 'Travis');
  console.log('property.stateCode prefilled?', saved.property.stateCode === 'TX');
  console.log('property.zip prefilled?', saved.property.zip === '78701');
  console.log('property.parcelNumber prefilled?', saved.property.parcelNumber === 'PCL-9988');
  console.log('property.houseNumber NOT auto-parsed (blank)?', saved.property.houseNumber === '');
  console.log('property.streetName NOT auto-parsed (blank)?', saved.property.streetName === '');

  // Reference note to original Order Entry address shows on tab 1
  console.log('Identification tab shows on-file Order Entry address reference?', panelText.includes('1421 Cypress Bend Ct.'));

  // --- Tab 1 fields: fill House Number/Street/Suffix/Directional/Section/Township/Range/Brief Legal/Block-Lot/Use Type ---
  await page.fill('#p-houseNumber', '1421');
  await page.fill('#p-streetName', 'Cypress Bend');
  await page.fill('#p-streetSuffix', 'Ct.');
  await page.fill('#p-directional', 'N');
  await page.fill('#p-section', '14');
  await page.fill('#p-township', '2N');
  await page.fill('#p-range', '3E');
  await page.fill('#p-briefLegal', 'Lot 14, Block 3, Cypress Bend');
  await page.fill('#p-blockLot', 'Blk 3 / Lot 14');
  await page.selectOption('#p-useType', 'Residential');
  await page.click('body');
  await page.waitForTimeout(150);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('houseNumber saved?', saved.property.houseNumber === '1421');
  console.log('streetName saved?', saved.property.streetName === 'Cypress Bend');
  console.log('streetSuffix saved?', saved.property.streetSuffix === 'Ct.');
  console.log('directional saved?', saved.property.directional === 'N');
  console.log('section saved?', saved.property.section === '14');
  console.log('township saved?', saved.property.township === '2N');
  console.log('range saved?', saved.property.range === '3E');
  console.log('briefLegal saved?', saved.property.briefLegal === 'Lot 14, Block 3, Cypress Bend');
  console.log('blockLot saved?', saved.property.blockLot === 'Blk 3 / Lot 14');
  console.log('useType saved?', saved.property.useType === 'Residential');

  // Editing an Identification field should NOT clobber other subtab fields already filled
  console.log('city preserved after tab-1 edits?', saved.property.city === 'Austin');

  // --- Non-destructive prefill: manual edit survives later Order Entry change ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-city', 'Dallas');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('property.city NOT clobbered by later Order Entry change (still Austin)?', saved.property.city === 'Austin');
  console.log('Order Entry city updated to Dallas?', saved.city === 'Dallas');

  // --- Sub-tab 2: Legal Description ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.selectOption('#dv-instrumentType', 'Warranty Deed');
  await page.fill('#dv-grantorName', 'Prior Grantor Inc');
  await page.fill('#dv-name', 'Current Owner LLC');
  await page.fill('#dv-recordedDate', '2018-03-01');
  await page.fill('#dv-book', '10');
  await page.fill('#dv-page', '20');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  console.log('Legal Description sub-tab active after click?', await page.$eval('[data-subtab="legal"]', el => el.classList.contains('active')));
  panelText = await page.textContent('#tab-panel');
  console.log('Legal Description sub-tab shows Parcel Number field?', !!(await page.$('#p-parcelNumber')));
  console.log('Legal Description sub-tab shows pulled Derivation Clause?', panelText.includes('Derivation Clause') && panelText.includes('Current Owner LLC'));
  console.log('Legal Description sub-tab mentions disclaimer note?', panelText.includes('no additional coverage is provided'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('parcelNumber prefilled onto Legal tab from Order Entry?', saved.property.parcelNumber === 'PCL-9988');

  await page.fill('#p-legalDescription', 'Lot 14, Block 3, Cypress Bend, a subdivision in Travis County, Texas');
  await page.click('body');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('legalDescription saved?', saved.property.legalDescription.indexOf('Cypress Bend') !== -1);

  // --- Sub-tab 3: Plat / Survey Matters ---
  await page.click('[data-subtab="platSurvey"]');
  await page.waitForTimeout(150);
  console.log('Plat/Survey sub-tab active after click?', await page.$eval('[data-subtab="platSurvey"]', el => el.classList.contains('active')));
  console.log('Plat/Survey field present?', !!(await page.$('#p-platSurvey')));
  await page.fill('#p-platSurvey', 'Book 12, Page 45');
  await page.click('body');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('platSurvey saved?', saved.property.platSurvey === 'Book 12, Page 45');

  // --- Disclaimer appears in generated Commitment doc ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Commitment summary card shows disclaimer (pre-generate)?', panelText.includes('no additional coverage is provided'));
  await page.click('#btn-generate');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Generated Commitment doc Legal Description includes disclaimer?', panelText.includes('Cypress Bend, a subdivision in Travis County, Texas However by showing this, no additional coverage is provided.'));

  // --- Migration test: old order missing new property sub-fields ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDPROP', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' },
      property: { briefLegal: 'Old Brief Legal', legalDescription: 'Old Legal Desc', blockLot: '', platSurvey: '', useType: 'Residential' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDPROP');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Identification sub-tab renders w/o crash?', !panelText.includes('Something went wrong'));
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Legal Description sub-tab renders w/o crash (Old Legal Desc preserved)?', !panelText.includes('Something went wrong') && panelText.includes('Old Legal Desc'));
  await page.click('[data-subtab="platSurvey"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Plat/Survey sub-tab renders w/o crash?', !panelText.includes('Something went wrong'));

  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Old order property.houseNumber backfilled to ""?', savedOld.property.houseNumber === '');
  console.log('Old order property.section backfilled to ""?', savedOld.property.section === '');
  console.log('Old order property.parcelNumber backfilled to ""?', savedOld.property.parcelNumber === '');
  console.log('Old order o.city backfilled to ""?', savedOld.city === '');

  console.log('ERRORS:', errors);
  await browser.close();
})();
