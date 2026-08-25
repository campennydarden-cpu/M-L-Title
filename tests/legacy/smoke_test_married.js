const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
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
  await page.fill('#cd-name', 'Jane Doe');
  await page.selectOption('#cd-maritalStatus', 'Married');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'John Doe');
  await page.selectOption('#cd-maritalStatus', 'Married');
  const opts = await page.$$eval('#cd-marriedTo option', els => els.map(e => ({ value: e.value, text: e.textContent })));
  console.log('marriedTo options:', opts);
  await page.selectOption('#cd-marriedTo', { label: 'Jane Doe' });
  const selectedVal = await page.$eval('#cd-marriedTo', el => el.value);
  console.log('selected marriedTo value:', selectedVal);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  const contacts = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].contacts);
  console.log('contacts:', JSON.stringify(contacts, null, 2));

  const cardHtml = await page.$eval('.card', el => el.parentElement.innerHTML).catch(()=>null);
  const bodyText = await page.textContent('body');
  const idx = bodyText.indexOf('a married person');
  console.log('context around "a married person":', bodyText.substring(Math.max(0, idx-80), idx+80));

  await browser.close();
})();
