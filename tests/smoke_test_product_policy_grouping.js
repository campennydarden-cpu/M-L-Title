const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // --- New Order Entry fields ---
  let panelText = await page.textContent('#tab-panel');
  console.log('Product Type field present?', !!(await page.$('#f-productType')));
  console.log('Policy Type field present?', !!(await page.$('#f-policyType')));

  const productOptions = await page.$eval('#f-productType', el => Array.from(el.options).map(o => o.value));
  console.log('Product Type options correct?', JSON.stringify(productOptions) === JSON.stringify(["Purchase", "Refinance", "HELOC/HELOAN", "Reverse Mortgage (Refi)", "Cash Purchase", "Reverse Mortgage (Purchase)", "Tract Search"]));

  const policyOptions = await page.$eval('#f-policyType', el => Array.from(el.options).map(o => o.value));
  console.log('Policy Type options correct?', JSON.stringify(policyOptions) === JSON.stringify(["None", "Owner's", "Loan", "Simultaneous"]));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('productType defaults to Purchase?', saved.productType === 'Purchase');
  console.log('policyType defaults to None?', saved.policyType === 'None');

  await page.selectOption('#f-productType', 'HELOC/HELOAN');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('productType saved after change?', saved.productType === 'HELOC/HELOAN');

  // --- Policy Type auto-suggest onto Schedule A (only when that policy block's ALTA Form is blank) ---
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('policyType saved after change?', saved.policyType === "Owner's");
  console.log('Schedule A ownerPolicy.policyType auto-suggested to ALTA Owner\'s Policy?', saved.commitment.scheduleA.ownerPolicy.policyType === "ALTA Owner's Policy");

  // Now manually override the Owner's Policy ALTA Form, then change Order Entry Policy Type to Loan -- should NOT clobber the manual override even though the Owner's Policy card is now hidden, and should separately auto-suggest the Loan Policy ALTA Form
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  await page.selectOption('#sa-ownerPolicyType', "ALTA Homeowner's Policy");
  await page.waitForTimeout(150);
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Loan');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Order Entry policyType updated to Loan?', saved.policyType === 'Loan');
  console.log('Schedule A ownerPolicy.policyType NOT clobbered (still Homeowner\'s, manual override preserved)?', saved.commitment.scheduleA.ownerPolicy.policyType === "ALTA Homeowner's Policy");
  console.log('Schedule A loanPolicy.policyType auto-suggested to ALTA Loan Policy?', saved.commitment.scheduleA.loanPolicy.policyType === "ALTA Loan Policy");

  // --- Section nav grouping ---
  // Softened from exact-array equality: the nav has since grown its own additional flat top-level
  // groups (Doc Prep, Escrow/Closing) beyond General/Title, and the Title group's own tab list has
  // grown too, so a hardcoded full list goes stale every time the nav grows -- check presence/order
  // of what THIS test actually cares about (General/Title still exist, in that relative order;
  // the General group's own 4 tabs are still exactly right) instead.
  const groupLabels = await page.$$eval('.section-nav-group-label', els => els.map(e => e.textContent));
  console.log('General and Title group labels both present, General before Title?', groupLabels.includes('General') && groupLabels.includes('Title') && groupLabels.indexOf('General') < groupLabels.indexOf('Title'));

  const tabLabels = await page.$$eval('.section-tab', els => els.map(e => e.textContent));
  console.log('General group\'s 4 tabs present in order (Order Entry, Order Information, Contacts, Property)?',
    JSON.stringify(tabLabels.slice(0, 4)) === JSON.stringify(["Order Entry", "Order Information", "Contacts", "Property"]));

  // --- Placeholder screens ---
  await page.click('[data-tab="titlePremiums"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Title Insurance Premiums placeholder renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('Title Insurance Premiums shows "Coming soon"?', panelText.includes('Coming soon'));

  await page.click('[data-tab="endorsements"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Endorsements placeholder renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('Endorsements shows "Coming soon"?', panelText.includes('Coming soon'));

  // --- Renamed tabs still route correctly ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  console.log('Prelim Title Search tab (data-tab=prelim) still renders Prelim screen?', !!(await page.$('#pr-effectiveDate')));

  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  console.log('Commitment Sch B-I, B-II tab (data-tab=commitment) still renders Commitment screen?', !!(await page.$('#btn-add-req')));

  // --- File History integration for new fields ---
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('History logs Product Type change?', panelText.includes('Product Type'));
  console.log('History logs Order Entry Policy Type change?', panelText.includes('Policy Type') && panelText.includes('Loan'));

  // --- Migration test: old order missing productType/policyType ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDPT', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDPT');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order renders Order Entry w/o crash?', !panelText.includes('Something went wrong'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('productType backfilled to Purchase?', savedOld.productType === 'Purchase');
  console.log('policyType backfilled to None?', savedOld.policyType === 'None');

  console.log('ERRORS:', errors);
  await browser.close();
})();
