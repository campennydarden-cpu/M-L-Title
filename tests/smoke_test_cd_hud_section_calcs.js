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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // ============ Purchase file: Loan Amount + Interest Rate on CDF Page 1 ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '300000');
  await page.fill('#f-loanAmount', '240000');
  await page.locator('#f-loanAmount').blur();
  await page.waitForTimeout(150);

  await goTab('escrowCdf1');
  await page.waitForTimeout(200);
  await page.fill('#cdf1-interestRate', '6');
  await page.locator('#cdf1-interestRate').blur();
  await page.waitForTimeout(150);

  // ============ Section A: Points (% of Loan Amount) ============
  await goTab('escrowCdf2');
  await page.waitForTimeout(200);
  let panelText = await page.textContent('#tab-panel');
  console.log('Section A shows the Points fixed line?', panelText.includes('% of Loan Amount (Points)'));

  await page.fill('#cdf2-sectionA-pointsPercent', '1');
  await page.locator('#cdf2-sectionA-pointsPercent').blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  // 1% of 240,000 = 2,400.00
  console.log('Points computes 1% of Loan Amount ($2,400.00)?', panelText.includes('$2,400.00'));
  let o = await getOrder();
  console.log('Points % persisted to sectionAFixed.pointsPercent?', o.escrow.cdf.page2.sectionAFixed.pointsPercent === '1');

  // ============ Section F: Prepaid Interest (Per Diem x Days), incl. Refill button ============
  panelText = await page.textContent('#tab-panel');
  console.log('Section F shows the Prepaid Interest fixed line?', panelText.includes('Prepaid Interest'));

  await page.click('#btn-refill-cdf2-perdiem');
  await page.waitForTimeout(150);
  o = await getOrder();
  // 240000 * 0.06 / 360 = 40.00
  console.log('Refill computes per diem from Loan Amount x Rate / 360 ($40)?', parseFloat(o.escrow.cdf.page2.sectionFFixed.perDiemRate) === 40);

  await page.fill('#cdf2-sectionF-perDiemDays', '15');
  await page.locator('#cdf2-sectionF-perDiemDays').blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  // 40 * 15 = 600.00
  console.log('Prepaid Interest computes Per Diem x Days ($600.00)?', panelText.includes('$600.00'));

  // ============ Section G: Per Month x # Months rows + Aggregate Adjustment ============
  panelText = await page.textContent('#tab-panel');
  console.log('Section G table shows Per Month / # Months columns?', panelText.includes('Per Month') && panelText.includes('# Months'));

  await page.fill('#cdf2sectionG-new-desc', 'Hazard Insurance');
  await page.fill('#cdf2sectionG-new-perMonth', '100');
  await page.fill('#cdf2sectionG-new-numMonths', '3');
  await page.click('[data-li-add="cdf2sectionG"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Section G Add creates a new row?', o.escrow.cdf.page2.sectionG.length === 1 && o.escrow.cdf.page2.sectionG[0].description === 'Hazard Insurance');
  const gRowId = o.escrow.cdf.page2.sectionG[0].id;

  o = await getOrder();
  console.log('Section G row computes Per Month x # Months into borrowerAtClosing (300)?', parseFloat(o.escrow.cdf.page2.sectionG[0].borrowerAtClosing) === 300);
  panelText = await page.textContent('#tab-panel');
  console.log('Section G row shows computed $300.00?', panelText.includes('$300.00'));

  await page.fill('#cdf2-sectionG-aggregateAdjustment', '-50');
  await page.locator('#cdf2-sectionG-aggregateAdjustment').blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Aggregate Adjustment line present and accepts a negative value?', panelText.includes('Aggregate Adjustment'));
  o = await getOrder();
  console.log('Aggregate Adjustment persisted as -50?', o.escrow.cdf.page2.sectionGFixed.aggregateAdjustment === '-50');

  // ============ Section J: Lender Credits reduces the final total ============
  panelText = await page.textContent('#tab-panel');
  console.log('Section J shows Closing Costs Subtotal / Lender Credits / final J rows?', panelText.includes('Closing Costs Subtotals (D + I)') && panelText.includes('Lender Credits') && panelText.includes('J. Total Closing Costs (Borrower-Paid)'));

  // D + I so far = Points 2400 (A) + Prepaid 600 (F) + Escrow 300 - 50 agg adj (G) = 3250
  await goTab('escrowCdf1');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Page 1 Closing Costs meta reflects D+I before credit ($3,250.00)?', panelText.includes('$3,250.00'));

  await goTab('escrowCdf2');
  await page.waitForTimeout(200);
  await page.fill('#cdf2-lenderCredits', '500');
  await page.locator('#cdf2-lenderCredits').blur();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  // 3250 - 500 = 2750
  console.log('J nets Lender Credits off the D+I subtotal ($2,750.00)?', panelText.includes('$2,750.00'));

  await goTab('escrowCdf1');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Page 1 Closing Costs meta flows the credited J, not the pre-credit subtotal ($2,750.00)?', panelText.includes('$2,750.00'));

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Page 3 Calculating Cash to Close "Total Closing Costs (J)" reflects the credited figure ($2,750.00)?', panelText.includes('$2,750.00'));

  // ============ Refi-mode trigger: Order Entry Transaction Type alone drives it, even when Page 1's
  // own Purpose already holds a different value (Page 1 was visited earlier in this test, under
  // Purchase, so it already auto-filled to "Purchase" -- proving the trigger doesn't depend on Page 1). ============
  o = await getOrder();
  console.log('Precondition: Page 1 Purpose already auto-filled to "Purchase" from the earlier visit?', o.escrow.cdf.page1.loanPurpose === 'Purchase');

  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Transaction Type saved as Refinance?', o.transactionType === 'Refinance');

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Refi CD layout (Page 3) triggers off Transaction Type alone, even though Page 1 Purpose still says Purchase?', panelText.includes('Payoffs and Payments') && panelText.includes('Refinance mode'));
  console.log('Purchase-only K/L/M/N Summaries of Transactions block is gone?', !panelText.includes('Total Due from Borrower at Closing (K)'));

  await goTab('escrowCdf1');
  await page.waitForTimeout(200);
  o = await getOrder();
  console.log('Fill-if-blank guard does NOT clobber Page 1\'s already-set Purpose ("Purchase" stays, isn\'t overwritten to "Refinance")?', o.escrow.cdf.page1.loanPurpose === 'Purchase');

  await goTab('escrowCdf2');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Refi mode Page 2 drops Seller-Paid columns?', !panelText.includes('Seller At Closing'));

  // ============ Payoff Calculator: refi mode sends into Payoffs and Payments + HUD Amounts Paid By/For Borrower ============
  await goTab('escrowPayoffs');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Payoff Calculations tab renders?', panelText.includes('No payoffs calculated yet.'));

  await page.click('#btn-add-payoff');
  await page.waitForTimeout(150);
  o = await getOrder();
  const payoffId = o.escrow.payoffs[0].id;
  await page.fill(`#payoff-label-${payoffId}`, 'First Mortgage — ABC Bank');
  await page.locator(`#payoff-label-${payoffId}`).blur();
  await page.waitForTimeout(150);
  await page.fill(`#payoff-principalBalance-${payoffId}`, '150000');
  await page.locator(`#payoff-principalBalance-${payoffId}`).blur();
  await page.waitForTimeout(150);
  await page.fill(`#payoff-perDiem-${payoffId}`, '20');
  await page.locator(`#payoff-perDiem-${payoffId}`).blur();
  await page.waitForTimeout(150);
  await page.fill(`#payoff-days-${payoffId}`, '10');
  await page.locator(`#payoff-days-${payoffId}`).blur();
  await page.waitForTimeout(150);
  await page.fill(`#payoff-otherFees-${payoffId}`, '25');
  await page.locator(`#payoff-otherFees-${payoffId}`).blur();
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  // 150000 + 20*10 + 25 = 150225.00
  console.log('Net Payoff computes Principal + PerDiem*Days + Fees ($150,225.00)?', panelText.includes('$150,225.00'));

  await page.click(`[data-send-payoff="${payoffId}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  const refiPayoffItem = o.escrow.cdf.page3.payoffsAndPayments.find(it => it.sourceType === 'payoff' && it.sourceId === payoffId);
  console.log('Refi mode: Send to CD/HUD upserts a tagged line in Payoffs and Payments?', !!refiPayoffItem && parseFloat(refiPayoffItem.amount) === 150225);
  const hudRefiItem = o.escrow.hud.page1.amountsPaidByForBorrower.find(it => it.sourceType === 'payoff' && it.sourceId === payoffId);
  console.log('Refi mode: Send to CD/HUD also upserts HUD Amounts Paid By/For Borrower?', !!hudRefiItem && parseFloat(hudRefiItem.amount) === 150225);
  console.log('sentToCdHud flag set after send?', o.escrow.payoffs[0].sentToCdHud === true);

  panelText = await page.textContent('#tab-panel');
  console.log('UI shows sent confirmation + Refill button after send?', panelText.includes('Sent to CD/HUD') && panelText.includes('Refill CD/HUD'));

  // Re-send (Refill) after editing the balance -- should update the same tagged line, not duplicate it
  await page.fill(`#payoff-principalBalance-${payoffId}`, '160000');
  await page.locator(`#payoff-principalBalance-${payoffId}`).blur();
  await page.waitForTimeout(150);
  await page.click(`[data-refill-payoff="${payoffId}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  const refiPayoffItemsAfter = o.escrow.cdf.page3.payoffsAndPayments.filter(it => it.sourceType === 'payoff' && it.sourceId === payoffId);
  console.log('Refill updates the same tagged line rather than duplicating (still exactly 1)?', refiPayoffItemsAfter.length === 1);
  console.log('Refill picked up the new balance (160,225.00)?', parseFloat(refiPayoffItemsAfter[0].amount) === 160225);

  // ============ Payoff Calculator: switch back to Purchase, First/Second post to CD's fixed fields ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Purchase');
  await page.waitForTimeout(150);

  await goTab('escrowPayoffs');
  await page.waitForTimeout(200);
  await page.click('#btn-add-payoff');
  await page.waitForTimeout(150);
  o = await getOrder();
  const payoff2Id = o.escrow.payoffs[1].id;
  await page.selectOption(`#payoff-position-${payoff2Id}`, 'Second');
  await page.waitForTimeout(150);
  await page.fill(`#payoff-principalBalance-${payoff2Id}`, '30000');
  await page.locator(`#payoff-principalBalance-${payoff2Id}`).blur();
  await page.waitForTimeout(150);
  await page.click(`[data-send-payoff="${payoff2Id}"]`);
  await page.waitForTimeout(150);

  o = await getOrder();
  console.log('Purchase mode Second position posts to CD Page 3 fixed.secondMortgagePayoff?', parseFloat(o.escrow.cdf.page3.fixed.secondMortgagePayoff) === 30000);
  const hudPurchaseItem = o.escrow.hud.page1.reductionsDueToSeller.find(it => it.sourceType === 'payoff' && it.sourceId === payoff2Id);
  console.log('Purchase mode also upserts HUD Reductions Due to Seller?', !!hudPurchaseItem && parseFloat(hudPurchaseItem.amount) === 30000);

  await goTab('escrowCdf3');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('CD Page 3 N shows the Second Mortgage payoff amount ($30,000.00)?', panelText.includes('$30,000.00'));

  // ============ Migration: legacy order missing all the new fields ============
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    const o = orders[0];
    delete o.escrow.cdf.page2.sectionAFixed;
    delete o.escrow.cdf.page2.sectionFFixed;
    delete o.escrow.cdf.page2.sectionGFixed;
    delete o.escrow.cdf.page2.lenderCredits;
    delete o.escrow.payoffs;
    o.escrow.cdf.page2.sectionG.forEach(it => { delete it.perMonth; delete it.numMonths; });
    localStorage.setItem('genesis_orders_v1', JSON.stringify(orders));
  });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('normalizeOrder backfills sectionAFixed/sectionFFixed/sectionGFixed/lenderCredits?',
    !!o.escrow.cdf.page2.sectionAFixed && o.escrow.cdf.page2.sectionAFixed.pointsPercent === '' &&
    !!o.escrow.cdf.page2.sectionFFixed && !!o.escrow.cdf.page2.sectionGFixed &&
    o.escrow.cdf.page2.lenderCredits === '');
  console.log('normalizeOrder backfills escrow.payoffs = []?', Array.isArray(o.escrow.payoffs) && o.escrow.payoffs.length === 0);
  console.log('normalizeOrder backfills perMonth/numMonths on existing Section G rows?', o.escrow.cdf.page2.sectionG.every(it => it.perMonth === '' && it.numMonths === ''));

  await goTab('escrowCdf2');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('App renders CDF Page 2 without error after legacy-order migration?', panelText.includes('Total Closing Costs (J)'));

  // ============ Refi auto-fill on a genuinely fresh order (Page 1 never touched before the switch) ============
  // New orders unshift to index 0, so this must be the last thing in the file -- everything above
  // reads getOrder() as orders[0], which would otherwise start pointing at this fresh file instead.
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Fresh order: Page 1 Purpose still blank right after the Transaction Type switch (Page 1 not visited yet)?', !o.escrow.cdf.page1.loanPurpose);

  await goTab('escrowCdf1');
  await page.waitForTimeout(200);
  o = await getOrder();
  console.log('Fresh order: visiting Page 1 for the first time auto-fills Purpose from Transaction Type?', o.escrow.cdf.page1.loanPurpose === 'Refinance');

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);
  await browser.close();
})();
