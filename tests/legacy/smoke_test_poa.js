const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await page.goto('file:///home/claude/title-escrow-project/genesis-app.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);

  await page.click('#btn-new-order');
  await page.waitForTimeout(300);

  // Go to contacts tab
  const contactsTab = await page.$('text=Contacts');
  if (contactsTab) await contactsTab.click();
  await page.waitForTimeout(300);

  console.log('--- clicking open-new-contact ---');
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(200);

  await page.fill('#cd-name', 'John Doe');
  console.log('after name fill, formDraft=', await page.evaluate(() => window.__genesisState.formDraft));

  console.log('--- checking poa checkbox ---');
  await page.check('#cd-poaEnabled');
  await page.waitForTimeout(200);
  console.log('after poa check, formDraft=', await page.evaluate(() => window.__genesisState.formDraft));

  const poaNameVisible = await page.$('#cd-poaName');
  console.log('cd-poaName element present?', !!poaNameVisible);

  await page.fill('#cd-poaName', 'Attorney Bob');
  console.log('after poaName fill, formDraft=', await page.evaluate(() => window.__genesisState.formDraft));

  console.log('formDraft right before save click:', await page.evaluate(() => window.__genesisState.formDraft));
  console.log('contactDetailId before save:', await page.evaluate(() => window.__genesisState.contactDetailId));

  await page.click('#btn-save-contact');
  await page.waitForTimeout(300);

  console.log('contactDetailId after save:', await page.evaluate(() => window.__genesisState.contactDetailId));
  console.log('raw localStorage:', await page.evaluate(() => localStorage.getItem('genesis_orders_v1')));

  const saved = await page.evaluate(() => {
    var raw = localStorage.getItem('genesis_orders_v1');
    var data = JSON.parse(raw);
    var order = (data.orders || data)[0];
    var contact = order.contacts.filter(function(c){ return c.name === 'John Doe'; })[0];
    return contact;
  });
  console.log('SAVED CONTACT:', JSON.stringify(saved, null, 2));

  await browser.close();
})();
