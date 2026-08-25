const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';
  await page.goto(APP);
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [{ id: 'c1', role: 'Buyer/Borrower', name: 'Legacy Contact' }]
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  // click into the existing old-shape order via its list row
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);

  const contactsTab = await page.$('text=Contacts');
  if (contactsTab) await contactsTab.click();
  await page.waitForTimeout(200);

  const errText = await page.textContent('#tab-panel').catch(() => null);
  console.log('tab-panel text:', errText);
  await browser.close();
})();
