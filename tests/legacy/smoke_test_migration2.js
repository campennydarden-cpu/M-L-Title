const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  // Replicate smoke_test_full.js exactly: build up a full order first, then overwrite with old-shape
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  const contactsTab = await page.$('text=Contacts');
  await contactsTab.click();
  await page.waitForTimeout(200);

  // now overwrite with old-shape order (as in original test)
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [{ id: 'c1', role: 'Buyer/Borrower', name: 'Legacy Contact' }]
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);

  const body = await page.textContent('body');
  console.log('FULL BODY TEXT:\n', body);
  console.log('PAGE ERRORS:', errors);
  await browser.close();
})();
