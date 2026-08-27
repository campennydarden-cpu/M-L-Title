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
      prelim: { effectiveDate: '2021-01-01' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);

  console.log('Section nav renders for old-shape order?', !!(await page.$('.section-nav')));
  console.log('Toolbar renders for old-shape order?', !!(await page.$('.toolbar')));

  await page.click('[data-tab="requestedTasks"]');
  await page.waitForTimeout(200);
  let panelText = await page.textContent('#tab-panel');
  console.log('Requested Tasks tab renders w/o error on old order?', !panelText.includes('Something went wrong'));

  await page.click('[data-tab="checklistTasks"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Checklist Tasks tab renders w/o error on old order?', !panelText.includes('Something went wrong'));

  await page.click('[data-tab="attachments"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Attachments tab renders w/o error on old order?', !panelText.includes('Something went wrong'));

  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Commitment tab still renders w/o error on old order?', !panelText.includes('Something went wrong'));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('requestedTasks backfilled to []?', Array.isArray(saved.requestedTasks));
  console.log('checklistTasks backfilled to []?', Array.isArray(saved.checklistTasks));
  console.log('attachments backfilled to []?', Array.isArray(saved.attachments));

  console.log('ERRORS:', errors);
  await browser.close();
})();
