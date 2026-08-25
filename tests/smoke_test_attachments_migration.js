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
      prelim: { effectiveDate: '2021-01-01' },
      attachments: [{ id: 'a1', name: 'Original Warranty Deed', category: 'Recorded Document', dateReceived: '2026-07-20', source: 'Seller', location: 'File room, cabinet 3', notes: 'kept in fireproof safe' }]
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="attachments"]');
  await page.waitForTimeout(200);

  let panelText = await page.textContent('#tab-panel');
  console.log('No error card on old-shape attachment?', !panelText.includes('Something went wrong'));
  console.log('Old data preserved as Note (name visible)?', panelText.includes('Original Warranty Deed'));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].attachments[0]);
  console.log('Backfilled docType?', saved.docType === 'Note');
  console.log('Backfilled snapshotHtml is a string?', typeof saved.snapshotHtml === 'string' && saved.snapshotHtml.length > 0);
  console.log('dateAdded backfilled from dateReceived?', saved.dateAdded === '2026-07-20');

  // View snapshot still works
  await page.click('[data-toggle-att]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Old attachment notes preserved and viewable?', panelText.includes('kept in fireproof safe'));

  console.log('ERRORS:', errors);
  await browser.close();
})();
