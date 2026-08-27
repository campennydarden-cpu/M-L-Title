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
      commitment: { requirements: [{id:'r1', description:'Old req', notes:''}], exceptions: [{id:'e1', description:'Old exc', notes:''}], generated: true, generatedAt: new Date().toISOString(), chainNote: '' }
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
  let panelText = await page.textContent('#tab-panel');
  console.log('Commitment tab renders w/o error on old commitment data?', !panelText.includes('Something went wrong'));
  console.log('Old commitment shows Draft status (final backfilled false)?', panelText.includes('Draft'));
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Curative tab renders w/o error on old commitment data?', !panelText.includes('Something went wrong'));
  console.log('Curative shows still-Draft message (final backfilled false)?', panelText.includes('still Draft'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('commitment.final backfilled to false?', saved.commitment.final === false);
  console.log('requirement.disposition backfilled to empty string?', saved.commitment.requirements[0].disposition === '');
  console.log('requirement.dontShow backfilled to false?', saved.commitment.requirements[0].dontShow === false);
  console.log('ERRORS:', errors);
  await browser.close();
})();
