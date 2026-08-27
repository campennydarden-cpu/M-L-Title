const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  await page.goto(APP);
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' },
      commitment: {
        requirements: [{ id: 'r1', description: 'Old requirement no sourceType field', notes: '' }],
        exceptions: [{ id: 'x1', description: 'Old exception no sourceType field', notes: '' }],
        generated: false, generatedAt: null, chainNote: ''
      }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);

  const panelText = await page.textContent('#tab-panel');
  console.log('No error card?', !panelText.includes('Something went wrong'));
  console.log('Old requirement still visible?', panelText.includes('Old requirement no sourceType field'));
  console.log('Old exception still visible?', panelText.includes('Old exception no sourceType field'));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment);
  console.log('Old requirement backfilled sourceType null?', saved.requirements[0].sourceType === null);
  console.log('Old exception backfilled sourceType null?', saved.exceptions[0].sourceType === null);

  console.log('ERRORS:', errors);
  await browser.close();
})();
