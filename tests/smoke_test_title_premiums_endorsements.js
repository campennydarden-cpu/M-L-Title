// Covers the 2026-08-26 Title Insurance Premiums + Endorsements screens -- fully-fielded manual
// rate-lookup screens (explicitly NOT a rate engine: no computed state/underwriter rates), plus
// their "connection" into the rest of the file via the same seed-chip/source-dedup pattern used
// elsewhere for Requirements/Exceptions: entered premium/endorsement amounts become "+" chips on
// CDF Page 2 (Sections C/H) and HUD Page 2 (Section 1100), deduped by sourceType:sourceId so a
// seeded item's chip disappears once pulled onto the closing disclosure.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goTab = (k) => page.click(`[data-tab="${k}"]`);

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);

  await page.click('#btn-new-order');
  await page.waitForTimeout(150);

  // ============ Order Entry: Policy Type = Simultaneous (shows both Owner's + Loan cards) ============
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(100);

  // ============ Property: State feeds Title Insurance Premiums' auto-fill ============
  await goTab('property');
  await page.waitForTimeout(150);
  await page.fill('#p-stateCode', 'NC');
  await page.locator('#p-stateCode').blur();
  await page.waitForTimeout(100);

  // ============ Contacts: add an Underwriter (feeds auto-fill + the copy seed chip) ============
  await goTab('contacts');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Underwriter');
  await page.fill('#cd-name', 'First American Title');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // ============ Title Insurance Premiums ============
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('main');
  console.log('Panel intro explains manual rate lookup (no engine)?', panelText.includes("doesn't compute title insurance rates itself") || panelText.includes('doesn’t compute title insurance rates itself'));
  console.log('Rate Lookup card renders?', panelText.includes('Rate Lookup'));
  console.log('Westcor rate calculator link present?', await page.locator('a[href="https://ratequote.wltic.com/Quote?k=Westcor-All"]').count() === 1);
  console.log('FNF rate calculator link present?', await page.locator('a[href="https://ratecalculator.fnf.com/"]').count() === 1);
  console.log('State auto-filled from Property?', await page.inputValue('#tp-state') === 'NC');
  console.log('Underwriter auto-filled from Contact?', await page.inputValue('#tp-underwriterName') === 'First American Title');
  console.log('Owner\'s Policy Premium card shows (Simultaneous)?', panelText.includes("Owner's Policy Premium"));
  console.log('Loan Policy Premium card shows (Simultaneous)?', panelText.includes('Loan Policy Premium'));

  // Change underwriter away from the contact, then use the copy chip to resync
  await page.fill('#tp-underwriterName', 'Some Other Underwriter');
  await page.locator('#tp-underwriterName').blur();
  await page.waitForTimeout(100);
  await page.click('[data-seed-tp-underwriter]');
  await page.waitForTimeout(150);
  console.log('Copy-from-Underwriter-contact chip resyncs the field?', await page.inputValue('#tp-underwriterName') === 'First American Title');

  await page.fill('#tp-owner-premium', '500.00');
  await page.locator('#tp-owner-premium').blur();
  await page.fill('#tp-loan-premium', '300.00');
  await page.locator('#tp-loan-premium').blur();
  await page.fill('#tp-loan-simultaneousIssueFee', '28.50');
  await page.locator('#tp-loan-simultaneousIssueFee').blur();
  await page.fill('#tp-cpl-amount', '50.00');
  await page.locator('#tp-cpl-amount').blur();
  await page.fill('#tp-commitmentFee-amount', '16.50');
  await page.locator('#tp-commitmentFee-amount').blur();
  await page.fill('#tp-agentPercent', '70');
  await page.locator('#tp-agentPercent').blur();
  await page.waitForTimeout(150);

  // Field values persist across a tab switch and back (bindText persistence)
  await goTab('endorsements');
  await page.waitForTimeout(100);
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Owner premium persists after nav away/back?', await page.inputValue('#tp-owner-premium') === '500.00');
  console.log('Total Premiums & Fees computed correctly ($895.00)?', panelText.includes('$895.00'));
  console.log('Agent/Underwriter split preview shown (70% of $800.00 policy premium)?', panelText.includes('Agent: $560.00'));

  // ============ Cross-navigation: Premiums -> Endorsements ============
  await page.click('#btn-goto-endorsements-from-premiums');
  await page.waitForTimeout(150);
  console.log('Cross-link navigates to Endorsements tab?', await page.evaluate(() => document.querySelector('[data-tab="endorsements"]').classList.contains('active')));

  panelText = await page.textContent('main');
  console.log('Endorsements panel intro renders?', panelText.includes("Genesis doesn't compute or validate endorsement availability") || panelText.includes('Genesis doesn’t compute or validate endorsement availability'));
  console.log('ALTA seed chips render?', await page.locator('[data-seed-end]').count() === 21);

  // Seed one endorsement from a chip, then edit it in place
  await page.click('[data-seed-end="ALTA 9 — Restrictions, Encroachments, Minerals"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Seeded endorsement appears in the list?', panelText.includes('ALTA 9 — Restrictions, Encroachments, Minerals'));

  await page.click('[data-edit-end]');
  await page.waitForTimeout(150);
  const endEditInputs = await page.locator('input[id^="eend-fee-"]').first();
  await endEditInputs.fill('100.00');
  await page.selectOption('select[id^="eend-appliesTo-"]', 'Loan');
  await page.click('[data-save-end]');
  await page.waitForTimeout(150);

  // Add a second endorsement manually, applies to Owner's
  await page.fill('#end-description', 'Custom Owner Endorsement');
  await page.selectOption('#end-appliesTo', "Owner's");
  await page.fill('#end-fee', '50.00');
  await page.click('#btn-add-end');
  await page.waitForTimeout(150);

  panelText = await page.textContent('main');
  console.log('Total Endorsement Fees computed correctly ($150.00)?', panelText.includes('$150.00'));

  // Cross-navigation: Endorsements -> Premiums
  await page.click('#btn-goto-premiums-from-endorsements');
  await page.waitForTimeout(150);
  console.log('Cross-link navigates back to Premiums tab?', await page.evaluate(() => document.querySelector('[data-tab="titlePremiums"]').classList.contains('active')));
  await goTab('endorsements');
  await page.waitForTimeout(150);

  // ============ CDF Page 2: seed chips in Section C (loan-side) / Section H (owner-side) ============
  await goTab('escrowCdf2');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Section C shows a loan-side premium/endorsement chip?', panelText.includes("Lender's Title Insurance Premium"));
  console.log('Section H shows an owner-side premium/endorsement chip?', panelText.includes("Owner's Title Insurance Premium"));
  console.log('Section C shows the Loan-applies endorsement chip?', panelText.includes('ALTA 9 — Restrictions, Encroachments, Minerals'));
  console.log('Section H shows the Owner\'s-applies endorsement chip?', panelText.includes('Custom Owner Endorsement'));

  await page.click('[data-seed-cdf2sectionC="tpremium:loan"]');
  await page.waitForTimeout(150);
  console.log('Clicking Section C chip seeds the CDF line item?', (await page.locator('input[value="Lender\'s Title Insurance Premium"]').count()) === 1);
  console.log('Seeded Section C chip disappears (dedup by source)?', (await page.locator('[data-seed-cdf2sectionC="tpremium:loan"]').count()) === 0);

  await page.click('[data-seed-cdf2sectionH="tpremium:owner"]');
  await page.waitForTimeout(150);
  console.log('Seeded Section H chip disappears (dedup by source)?', (await page.locator('[data-seed-cdf2sectionH="tpremium:owner"]').count()) === 0);

  // ============ HUD Page 2: everything lumped into Section 1100 ============
  await goTab('escrowHud2');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('1100. Title Charges shows unseeded premium/endorsement chips (CPL)?', panelText.includes('Closing Protection Letter Fee'));

  await page.click('[data-seed-hud2section1100="tpremium:cpl"]');
  await page.waitForTimeout(150);
  console.log('Seeded HUD 1100 chip disappears (dedup by source, independent of CDF)?', (await page.locator('[data-seed-hud2section1100="tpremium:cpl"]').count()) === 0);
  console.log('CDF-side Section C chip for Loan Premium (already used there) does not reappear on HUD independently affecting Loan chip?', (await page.locator('[data-seed-hud2section1100="tpremium:loan"]').count()) === 1);

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
