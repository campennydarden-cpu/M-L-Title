const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goPrelim = () => page.click('[data-tab="prelim"]');
  const goCommitment = () => page.click('[data-tab="commitment"]');

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goPrelim();
  await page.waitForTimeout(200);

  // Add a Security Instrument (Deed of Trust w/ Trustee)
  await page.selectOption('#si-instrumentType', 'Deed of Trust');
  await page.fill('#si-datedDate', '2020-01-05');
  await page.fill('#si-recordedDate', '2020-01-10');
  await page.fill('#si-instrumentNumber', 'INS-2020-0055');
  await page.fill('#si-mortgagor', 'John Doe');
  await page.fill('#si-mortgagee', 'Big Bank NA');
  await page.fill('#si-trustee', 'ABC Trustee Services');
  await page.fill('#si-consideration', '250000');
  await page.fill('#si-book', '4021');
  await page.fill('#si-page', '118');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  // Add a Lien (Tax Lien) -- Tax Lien's field set is Debtor/Taxing Authority/Tax Type/Filed Date/Amount/Book/Page/Instrument
  await page.selectOption('#lien-lienType', 'Tax Lien');
  await page.waitForTimeout(100);
  await page.fill('#lien-amount', '4500');
  await page.fill('#lien-filedDate', '2019-06-15');
  await page.fill('#lien-book', '900');
  await page.fill('#lien-page', '45');
  await page.fill('#lien-debtor', 'John Doe');
  await page.fill('#lien-taxingAuthority', 'NC Dept of Revenue');
  await page.selectOption('#lien-taxType', 'Property');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  // Add an Exception Matter
  await page.fill('#em-description', 'Utility easement along rear lot line');
  await page.fill('#em-recordedDate', '2005-03-01');
  await page.fill('#em-book', '900');
  await page.fill('#em-page', '12');
  await page.click('#btn-add-em');
  await page.waitForTimeout(150);

  await goCommitment();
  await page.waitForTimeout(200);

  console.log('SI file chip visible?', !!(await page.$('[data-seed-req-si]')));
  console.log('Lien file chip visible?', !!(await page.$('[data-seed-req-lien]')));
  console.log('EM file chip visible?', !!(await page.$('[data-seed-exc-em]')));

  // Click SI chip
  await page.click('[data-seed-req-si]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Requirement text includes Deed of Trust language?', panelText.includes('Release of Deed of Trust'));
  console.log('Requirement text includes mortgagor/mortgagee?', panelText.includes('John Doe') && panelText.includes('Big Bank NA'));
  console.log('Requirement text includes trustee?', panelText.includes('ABC Trustee Services'));
  console.log('Requirement text includes recorded date (long form)?', panelText.includes('January 10, 2020'));
  console.log('Requirement text includes book/page?', panelText.includes('Book 4021') && panelText.includes('Page 118'));
  console.log('Requirement text includes consideration?', panelText.includes('$250,000.00'));

  // SI chip should now be gone (already pulled in)
  console.log('SI chip gone after use?', !(await page.$('[data-seed-req-si]')));

  // Click Lien chip
  await page.click('[data-seed-req-lien]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Lien requirement includes Satisfaction of Tax Lien?', panelText.includes('Satisfaction of Tax Lien'));
  console.log('Lien requirement includes debtor/taxing authority?', panelText.includes('John Doe') && panelText.includes('NC Dept of Revenue'));
  console.log('Lien requirement includes book/page?', panelText.includes('Book 900') && panelText.includes('Page 45'));
  console.log('Lien requirement includes amount?', panelText.includes('$4,500.00'));
  console.log('Lien chip gone after use?', !(await page.$('[data-seed-req-lien]')));

  // Click EM chip
  await page.click('[data-seed-exc-em]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Exception text includes description?', panelText.includes('Utility easement along rear lot line'));
  console.log('Exception text includes recorded date/book/page?', panelText.includes('March 1, 2005') && panelText.includes('Book 900') && panelText.includes('Page 12'));
  console.log('EM chip gone after use?', !(await page.$('[data-seed-exc-em]')));

  // Verify saved data has sourceType/sourceId
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment);
  console.log('Requirement 1 sourceType si?', saved.requirements[0].sourceType === 'si');
  console.log('Requirement 2 sourceType lien?', saved.requirements[1].sourceType === 'lien');
  console.log('Exception 1 sourceType em?', saved.exceptions[0].sourceType === 'em');

  // Delete the SI-sourced requirement -> chip should reappear
  const reqDelBtn = await page.$('[data-del-req]');
  await reqDelBtn.click();
  await page.waitForTimeout(150);
  console.log('SI chip reappears after deleting SI-sourced requirement?', !!(await page.$('[data-seed-req-si]')));

  // Also add a manual/boilerplate requirement, confirm it still works alongside
  await page.click('[data-seed-req]');
  await page.waitForTimeout(150);
  const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment);
  console.log('Boilerplate requirement has null sourceType?', savedAfter.requirements[savedAfter.requirements.length-1].sourceType === null);

  // Generate commitment and confirm requirement text renders in the doc
  await page.evaluate(() => {
    // fill minimal fields to enable generate
  });
  // set property/legal/effective date via other tabs quickly
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '123 Main St');
  await page.waitForTimeout(100);
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.waitForTimeout(100);
  await goPrelim();
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.waitForTimeout(100);
  await goCommitment();
  await page.waitForTimeout(200);

  const genBtn = await page.$('#btn-generate');
  const isDisabled = genBtn ? await genBtn.isDisabled() : true;
  console.log('Generate button enabled?', !isDisabled);
  if(!isDisabled){
    await genBtn.click();
    await page.waitForTimeout(200);
    const docText = await page.textContent('#commitment-doc');
    console.log('Generated doc includes lien requirement language?', docText.includes('Satisfaction of Tax Lien'));
    console.log('Generated doc includes exception language?', docText.includes('Utility easement along rear lot line'));
  }

  console.log('ERRORS:', errors);
  await browser.close();
})();
