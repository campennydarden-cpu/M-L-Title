const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrder = () => page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // ============ Set up a purchase file: purchase price, loan amount, Refinance NOT selected ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '300000');
  await page.fill('#f-loanAmount', '240000');
  await page.locator('#f-loanAmount').blur();
  await page.waitForTimeout(150);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  let panelText = await page.textContent('#tab-panel');

  console.log('K shows Sale Price of Property flowed from Page 1?', panelText.includes('Sale Price of Property') && panelText.includes('$300,000.00'));
  console.log('L shows Loan Amount flowed from Page 1?', panelText.includes('Loan Amount') && panelText.includes('$240,000.00'));
  console.log('M also shows Sale Price of Property (mirrored)?', (panelText.match(/Sale Price of Property/g) || []).length === 2);
  console.log('K/L/M/N total rows present?', panelText.includes('Total Due from Borrower at Closing (K)') && panelText.includes('Total Paid Already by/on Behalf of Borrower (L)') && panelText.includes('Total Due to Seller at Closing (M)') && panelText.includes('Total Due from Seller at Closing (N)'));

  // ============ Fill Deposit, Seller Credit, mortgage payoffs ============
  await page.fill('#cdf3fixed-deposit', '10000');
  await page.locator('#cdf3fixed-deposit').blur();
  await page.waitForTimeout(150);
  await page.fill('#cdf3fixed-sellerCredit', '2000');
  await page.locator('#cdf3fixed-sellerCredit').blur();
  await page.waitForTimeout(150);
  await page.fill('#cdf3fixed-firstMortgagePayoff', '150000');
  await page.locator('#cdf3fixed-firstMortgagePayoff').blur();
  await page.waitForTimeout(150);

  let o = await getOrder();
  console.log('Deposit/Seller Credit/Payoff saved to page3.fixed?', o.escrow.cdf.page3.fixed.deposit === '10000' && o.escrow.cdf.page3.fixed.sellerCredit === '2000' && o.escrow.cdf.page3.fixed.firstMortgagePayoff === '150000');

  panelText = await page.textContent('#tab-panel');
  console.log('Seller Credit mirrored read-only in N column?', (panelText.match(/Seller Credit\b(?!s)/g) || []).length === 2);

  // K = 300000 (sale price) + 0 (closing costs J, none yet) = 300000
  // L = 10000 (deposit) + 240000 (loan amount) + 2000 (seller credit) = 252000
  // Cash to/from Borrower = K - L = 48000
  console.log('Cash to/from Borrower computed correctly (K-L = 48,000.00)?', panelText.includes('$48,000.00'));

  // ============ Tax proration NOT paid in advance (arrears -- flows to L credit / N charge) ============
  await goTab('escrowTaxProrations');
  await page.waitForTimeout(150);
  await page.click('#btn-add-tax-proration');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  const taxRows = await page.$$('.card');
  // Fill the first (only) proration row's fields
  await page.selectOption('select[id^="txp-type-"]', 'County Tax');
  await page.fill('input[id^="txp-amt-"]', '3650');
  await page.fill('input[id^="txp-start-"]', '2026-01-01');
  await page.fill('input[id^="txp-end-"]', '2026-12-31');
  await page.fill('input[id^="txp-prdate-"]', '2026-07-02');
  await page.locator('input[id^="txp-prdate-"]').blur();
  await page.waitForTimeout(150);
  // Leave "Paid in advance" UNCHECKED (arrears -- the default)

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Unpaid/arrears proration flows into "Adjustments for Items Unpaid by Seller"?', panelText.includes('Adjustments for Items Unpaid by Seller') && panelText.includes('County Tax'));
  console.log('Arrears proration does NOT appear under "Paid by Seller in Advance"?', !panelText.includes('Adjustments for Items Paid by Seller in Advance'));

  // ============ Switch that same proration to Paid in Advance -- should move from L/N to K/M ============
  await goTab('escrowTaxProrations');
  await page.waitForTimeout(150);
  await page.check('input[id^="txp-advance-"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('paidInAdvance saved as true?', o.escrow.taxProrations[0].paidInAdvance === true);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Now flows into "Adjustments for Items Paid by Seller in Advance" instead?', panelText.includes('Adjustments for Items Paid by Seller in Advance') && panelText.includes('County Tax'));
  console.log('No longer shows under "Unpaid by Seller"?', !panelText.includes('Adjustments for Items Unpaid by Seller'));

  // ============ Migration: simulate a pre-K/L/M/N-restructure order ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    delete orders[0].escrow.cdf.page3.fixed;
    orders[0].escrow.taxProrations.forEach(p => delete p.paidInAdvance);
    orders[0].escrow.otherProrations.push({ id: 'legacy1', description: 'Legacy HOA', annualAmount: '1200', periodStart: '2026-01-01', periodEnd: '2026-12-31', prorationDate: '2026-06-01' });
    delete orders[0].escrow.otherProrations[orders[0].escrow.otherProrations.length - 1].paidInAdvance;
    localStorage.setItem('genesis_orders_v1', JSON.stringify(orders));
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('normalizeOrder backfills page3.fixed on legacy order?', !!o.escrow.cdf.page3.fixed && o.escrow.cdf.page3.fixed.deposit === '');
  console.log('normalizeOrder backfills paidInAdvance=false on legacy proration items?', o.escrow.taxProrations[0].paidInAdvance === false && o.escrow.otherProrations[o.escrow.otherProrations.length - 1].paidInAdvance === false);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('App renders CDF Page 3 without error after legacy-order migration?', panelText.includes('Summaries of Transactions'));

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
