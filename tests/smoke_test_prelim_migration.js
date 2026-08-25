const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  await page.goto(APP);
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: {
        effectiveDate: '2021-01-01',
        mortgages: [{ id: 'm1', lender: 'Old Bank', amount: '100000', recordedDate: '2015-05-05' }],
        otherLiens: [{ id: 'l1', description: 'Judgment lien, Case No. 22-CV-104' }]
      }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  const prelimTab = await page.$('[data-tab="prelim"]');
  await prelimTab.click();
  await page.waitForTimeout(200);

  const panelText = await page.textContent('#tab-panel');
  console.log('Migrated security instrument shows old lender as mortgagee?', panelText.includes('Old Bank'));
  console.log('Migrated judgment shows legacy description?', panelText.includes('Judgment lien, Case No. 22-CV-104'));
  console.log('No error card?', !panelText.includes('Something went wrong'));
  console.log('ERRORS:', errors);

  await browser.close();
})();
