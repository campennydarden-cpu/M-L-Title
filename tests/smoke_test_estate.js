const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  const contactsTab = await page.$('text=Contacts');
  await contactsTab.click();
  await page.waitForTimeout(200);

  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'Estate rep entry');
  await page.selectOption('#cd-entityType', 'Estate');
  await page.waitForTimeout(150);
  console.log('cd-decedentName present?', !!(await page.$('#cd-decedentName')));
  await page.fill('#cd-decedentName', 'Robert Roe');
  await page.fill('#cd-probateCaseNumber', 'PC-2026-001');
  await page.fill('#cd-probateCounty', 'Wake');
  console.log('formDraft snapshot via preview:', await page.textContent('#cd-preview-clause').catch(()=>'NO PREVIEW EL'));
  await page.click('#btn-save-contact');
  await page.waitForTimeout(200);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].contacts);
  console.log('SAVED:', JSON.stringify(saved, null, 2));
  console.log('ERRORS:', errors);
  await browser.close();
})();
