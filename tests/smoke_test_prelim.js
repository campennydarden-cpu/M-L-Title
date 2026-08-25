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
  const prelimTab = await page.$('text=Prelim Search');
  if (!prelimTab) { console.log('No "Prelim Search" tab text found, listing tab texts...'); }
  await (prelimTab || await page.$('text=Prelim')).click();
  await page.waitForTimeout(200);

  console.log('pr-searchFromTime absent (no time on start)?', !(await page.$('#pr-searchFromTime')));
  console.log('pr-searchToTime present (end keeps time)?', !!(await page.$('#pr-searchToTime')));
  console.log('pr-searchType present?', !!(await page.$('#pr-searchType')));

  // Security Instrument
  await page.fill('#si-datedDate', '2020-01-05');
  await page.fill('#si-recordedDate', '2020-01-10');
  await page.fill('#si-mortgagor', 'John Doe');
  await page.fill('#si-mortgagee', 'Big Bank NA');
  await page.fill('#si-consideration', '250000');
  await page.fill('#si-book', '4021');
  await page.fill('#si-page', '118');
  await page.fill('#si-instrumentNumber', 'INS-2020-0055');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  // Judgment
  await page.fill('#j-datedDate', '2019-06-01');
  await page.fill('#j-filedDate', '2019-06-15');
  await page.fill('#j-court', 'Wake County Superior Court');
  await page.fill('#j-caseNumber', '19-CV-0456');
  await page.fill('#j-debtor', 'John Doe');
  await page.fill('#j-creditor', 'ABC Collections LLC');
  await page.click('#btn-add-j');
  await page.waitForTimeout(150);

  // Notice of Commencement
  await page.fill('#c-datedDate', '2018-03-01');
  await page.fill('#c-recordedDate', '2018-03-05');
  await page.fill('#c-owner', 'John Doe');
  await page.fill('#c-contractor', 'Acme Builders Inc');
  await page.fill('#c-book', '3900');
  await page.fill('#c-page', '22');
  await page.fill('#c-instrumentNumber', 'INS-2018-0099');
  await page.click('#btn-add-c');
  await page.waitForTimeout(150);

  const bodyText = await page.textContent('#tab-panel');
  console.log('Security instrument row visible?', bodyText.includes('John Doe') && bodyText.includes('Big Bank NA'));
  console.log('Consideration formatted?', bodyText.includes('$250,000.00'));
  console.log('Judgment row visible (creditor v debtor)?', bodyText.includes('ABC Collections LLC') && bodyText.includes('v. John Doe'));
  console.log('Commencement row visible?', bodyText.includes('Acme Builders Inc'));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim);
  console.log('SAVED PRELIM:', JSON.stringify(saved, null, 2));
  console.log('ERRORS:', errors);

  // Delete round trip
  await page.click('[data-del-si]');
  await page.click('[data-del-j]');
  await page.click('[data-del-c]');
  await page.waitForTimeout(150);
  const afterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim);
  console.log('All lists empty after delete?', afterDelete.securityInstruments.length === 0 && afterDelete.judgments.length === 0 && afterDelete.commencements.length === 0);

  await browser.close();
})();
