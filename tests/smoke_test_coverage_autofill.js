const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goEntry = () => page.click('[data-tab="entry"]');
  const goScheduleA = () => page.click('[data-tab="scheduleA"]');

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);

  // --- Scenario 1: Simultaneous policy, Purchase Price + Loan Amount both set ---
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '350000');
  await page.fill('#f-loanAmount', '280000');
  await page.waitForTimeout(150);

  await goScheduleA();
  await page.waitForTimeout(200);
  let ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  let loanVal = await page.inputValue('#sa-loanCoverageAmount');
  console.log('Owner Coverage Amount auto-filled from Purchase Price?', ownerVal === '350000');
  console.log('Loan Coverage Amount auto-filled from Loan Amount?', loanVal === '280000');

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.scheduleA);
  console.log('Saved ownerPolicy.coverageAmount = 350000?', saved.ownerPolicy.coverageAmount === '350000');
  console.log('Saved loanPolicy.coverageAmount = 280000?', saved.loanPolicy.coverageAmount === '280000');

  // --- Scenario 2: manual edit is never overwritten by re-visiting the tab ---
  await page.fill('#sa-ownerCoverageAmount', '360000');
  await page.waitForTimeout(150);
  await goEntry();
  await page.waitForTimeout(150);
  await goScheduleA();
  await page.waitForTimeout(200);
  ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  console.log('Manual override on Owner Coverage Amount preserved (not reset to Purchase Price)?', ownerVal === '360000');

  // Changing Purchase Price afterward should NOT retroactively change the already-set Coverage Amount
  await goEntry();
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '400000');
  await page.waitForTimeout(150);
  await goScheduleA();
  await page.waitForTimeout(200);
  ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  console.log('Later Purchase Price change does not retroactively overwrite Coverage Amount?', ownerVal === '360000');

  // --- Scenario 3: fresh order, Owner's Policy only -> only Owner Coverage Amount fills ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '150000');
  await page.waitForTimeout(150);
  await goScheduleA();
  await page.waitForTimeout(200);
  ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  console.log('Owner-only policy: Owner Coverage Amount auto-fills?', ownerVal === '150000');

  console.log('ERRORS:', errors);
  await browser.close();
})();
