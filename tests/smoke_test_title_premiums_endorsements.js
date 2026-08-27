// Covers the 2026-08-26 Title Insurance Premiums + Endorsements rebuild: contact-selector
// Payor/Payee (and Underwriter) fields sourced from Order Contacts, the open-ended Misc. Title
// Fees list (replacing the old fixed CPL/Commitment Fee fields), the Section B/C choice for
// Loan Policy items, and the per-item "Assign to CD/HUD" control (Section + specific-line-or-
// next-available) that replaces the old chip picker on the CDF/HUD screens themselves. Also
// covers Endorsements' payor/payee/Underwriter Split and the auto-generated Schedule B-II
// requirement language that tracks each endorsement (added/edited/removed).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrder = () => page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);

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

  // ============ Contacts: an Underwriter + a Buyer/Borrower (for Payor/Payee selectors) ============
  await goTab('contacts');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Underwriter');
  await page.fill('#cd-name', 'First American Title');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'Daniel R. Whitfield');
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  // ============ Title Insurance Premiums ============
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('main');
  console.log('Rate Lookup card renders?', panelText.includes('Rate Lookup'));
  console.log('State auto-filled from Property?', await page.inputValue('#tp-state') === 'NC');
  console.log('Owner\'s Policy Premium card shows (Simultaneous)?', panelText.includes("Owner's Policy Premium"));
  console.log('Loan Policy Premium card shows (Simultaneous)?', panelText.includes('Loan Policy Premium'));
  console.log('Misc. Title Fees card renders (replaces fixed CPL/Commitment fields)?', panelText.includes('Misc. Title Fees'));
  console.log('Old fixed CPL/Commitment Fee fields are gone?', await page.locator('#tp-cpl-amount').count() === 0 && await page.locator('#tp-commitmentFee-amount').count() === 0);

  // Underwriter is a contact selector, filtered from Order Contacts
  await page.selectOption('#tp-underwriter-contact', { label: 'First American Title — Underwriter' });
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Underwriter contact selection resolves to the contact name?', o.titlePremiums.underwriterName === 'First American Title');

  // Rate scenario dropdown offers the requested combos
  await page.selectOption('#tp-rateScenario', "Simultaneous Issue - Std Owner's (Higher)/Std Loan Policy");
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Rate scenario saved?', o.titlePremiums.rateScenario === "Simultaneous Issue - Std Owner's (Higher)/Std Loan Policy");

  await page.fill('#tp-owner-premium', '500.00');
  await page.locator('#tp-owner-premium').blur();
  await page.fill('#tp-loan-premium', '300.00');
  await page.locator('#tp-loan-premium').blur();
  await page.fill('#tp-loan-simultaneousIssueFee', '28.50');
  await page.locator('#tp-loan-simultaneousIssueFee').blur();
  await page.fill('#tp-agentPercent', '70');
  await page.locator('#tp-agentPercent').blur();
  await page.waitForTimeout(150);

  // Owner's Policy Payor via contact selector, Payee via "Other" free text
  await page.selectOption('#tp-owner-payor-contact', { label: 'Daniel R. Whitfield — Buyer/Borrower' });
  await page.waitForTimeout(150);
  await page.selectOption('#tp-owner-payee-contact', '__other__');
  await page.waitForTimeout(150);
  await page.fill('#tp-owner-payee-other', 'M&L Title and Escrow');
  await page.locator('#tp-owner-payee-other').blur();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Owner Payor resolves from selected contact?', o.titlePremiums.ownerPolicy.payor === 'Daniel R. Whitfield');
  console.log('Owner Payee resolves from "Other" free text?', o.titlePremiums.ownerPolicy.payee === 'M&L Title and Escrow');

  // Field values persist across a tab switch and back (bindText persistence)
  await goTab('endorsements');
  await page.waitForTimeout(100);
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Owner premium persists after nav away/back?', await page.inputValue('#tp-owner-premium') === '500.00');

  // Misc. Title Fees -- open-ended list (CPL/Commitment Fee are just two examples now)
  await page.click('#btn-add-tpmf');
  await page.waitForTimeout(150);
  o = await getOrder();
  let mf1 = o.titlePremiums.miscFees[0];
  await page.fill(`#tpmf-desc-${mf1.id}`, 'Title Commitment Fee');
  await page.fill(`#tpmf-amount-${mf1.id}`, '16.50');
  await page.locator(`#tpmf-amount-${mf1.id}`).blur();
  await page.waitForTimeout(150);
  await page.click('#btn-add-tpmf');
  await page.waitForTimeout(150);
  o = await getOrder();
  let mf2 = o.titlePremiums.miscFees[1];
  await page.fill(`#tpmf-desc-${mf2.id}`, 'CPL Fee');
  await page.fill(`#tpmf-amount-${mf2.id}`, '50.00');
  await page.locator(`#tpmf-amount-${mf2.id}`).blur();
  await page.waitForTimeout(150);
  // The fee amount fields use plain bindText (no re-render on every keystroke, so focus isn't
  // lost mid-typing) -- the displayed grand total only recomputes on the next full render, same
  // as the "persists after nav away/back" check above.
  await goTab('endorsements');
  await page.waitForTimeout(100);
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Total Premiums & Fees includes both misc fees ($895.00)?', panelText.includes('$895.00'));

  // ============ Assign to CD/HUD -- from the source screen, not a chip on the CDF/HUD tab ============
  // Owner's Policy Premium is fixed to Section H (no Section dropdown -- single choice)
  console.log('Owner Premium assign control has no Section dropdown (fixed to H)?', await page.locator('#tp-owner-assign-cdsection').count() === 0);
  await page.click('[data-cd-assign="tp-owner-assign"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Owner Premium shows assigned confirmation after clicking Assign?', panelText.includes('Assigned to CD Section H'));

  // Loan Policy Premium: choose Section B explicitly (not the old hardcoded Section C)
  await page.selectOption('#tp-loan-premium-assign-cdsection', 'sectionB');
  await page.waitForTimeout(100);
  await page.click('[data-cd-assign="tp-loan-premium-assign"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Loan Premium assigned onto CD Section B (not C)?', o.escrow.cdf.page2.sectionB.some(it => it.description === "Lender's Title Insurance Premium" && it.borrowerAtClosing === '300.00'));
  console.log('Loan Premium also mirrored onto HUD 1100?', o.escrow.hud.page2.section1100.some(it => it.description === "Lender's Title Insurance Premium"));

  // Simultaneous Issue Fee: choose Section C explicitly (independent choice from the Loan Premium above)
  await page.selectOption('#tp-loan-si-assign-cdsection', 'sectionC');
  await page.waitForTimeout(100);
  await page.click('[data-cd-assign="tp-loan-si-assign"]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Simultaneous Issue Fee assigned onto CD Section C?', o.escrow.cdf.page2.sectionC.some(it => it.description === 'Simultaneous Issue Fee'));

  // Misc fee: assign one to a specific line position
  await page.selectOption(`#tpmf-assign-${mf1.id}-cdpos`, '1');
  await page.waitForTimeout(100);
  await page.click(`[data-cd-assign="tpmf-assign-${mf1.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Misc fee assigned at the specific line position requested?', o.escrow.cdf.page2.sectionC[0].description === 'Title Commitment Fee');

  // ============ Cross-navigation: Premiums -> Endorsements ============
  await page.click('#btn-goto-endorsements-from-premiums');
  await page.waitForTimeout(150);
  console.log('Cross-link navigates to Endorsements tab?', await page.evaluate(() => document.querySelector('[data-tab="endorsements"]').classList.contains('active')));

  panelText = await page.textContent('main');
  console.log('Endorsements panel intro mentions Schedule B-II automation?', panelText.includes('automatically adds its requirement language to Commitment Schedule B-II'));
  console.log('ALTA seed chips render?', await page.locator('[data-seed-end]').count() === 21);

  // Seed one endorsement from a chip -- should auto-add a Schedule B-II requirement
  await page.click('[data-seed-end="ALTA 9 — Restrictions, Encroachments, Minerals"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Seeded endorsement appears in the list?', panelText.includes('ALTA 9 — Restrictions, Encroachments, Minerals'));

  await goTab('commitment');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Schedule B-II auto-requirement added for the endorsement (Both -> Owner\'s and Loan policies)?', panelText.includes('Company will issue an ALTA 9 — Restrictions, Encroachments, Minerals on the final') && panelText.includes('and') && panelText.includes('policies'));
  await goTab('endorsements');
  await page.waitForTimeout(150);

  await page.click('[data-edit-end]');
  await page.waitForTimeout(150);
  const endEditInputs = await page.locator('input[id^="eend-fee-"]').first();
  await endEditInputs.fill('100.00');
  await page.selectOption('select[id^="eend-appliesTo-"]', 'Loan');
  await page.locator('input[id^="eend-underwriterSplitPercent-"]').first().fill('25');
  o = await getOrder();
  const seededEnd = o.endorsements[0];
  await page.selectOption(`#eend-payor-${seededEnd.id}-contact`, { label: 'Daniel R. Whitfield — Buyer/Borrower' });
  await page.waitForTimeout(100);
  await page.click('[data-save-end]');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Endorsement payor resolves from contact selector?', o.endorsements[0].payor === 'Daniel R. Whitfield');
  console.log('Endorsement Underwriter Split override saved?', o.endorsements[0].underwriterSplitPercent === '25');

  await goTab('commitment');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Schedule B-II requirement text updates when Applies To changes to Loan-only?', panelText.includes('Company will issue an ALTA 9 — Restrictions, Encroachments, Minerals on the final ALTA Loan Policy policy'));
  await goTab('endorsements');
  await page.waitForTimeout(150);

  // Loan/Both-applies endorsement offers a Section B/C choice (not fixed like Owner's-only)
  console.log('Loan-applies endorsement assign control offers a Section dropdown?', await page.locator(`#end-assign-${seededEnd.id}-cdsection`).count() === 1);
  await page.click(`[data-cd-assign="end-assign-${seededEnd.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Endorsement fee assigned onto the CD/HUD?', o.escrow.cdf.page2.sectionC.some(it => it.sourceType === 'endorsement' && it.sourceId === seededEnd.id));

  // Add a second endorsement manually, applies to Owner's -- fixed to Section H, no dropdown
  await page.fill('#end-description', 'Custom Owner Endorsement');
  await page.selectOption('#end-appliesTo', "Owner's");
  await page.fill('#end-fee', '50.00');
  await page.click('#btn-add-end');
  await page.waitForTimeout(150);
  o = await getOrder();
  const ownerEnd = o.endorsements[1];
  console.log('Owner\'s-only endorsement Schedule B-II requirement references the Owner\'s policy only?', o.commitment.requirements.some(r => r.sourceType === 'endorsement' && r.sourceId === ownerEnd.id && r.description === 'Company will issue a Custom Owner Endorsement on the final ALTA Owner\'s Policy policy.'));
  panelText = await page.textContent('main');
  console.log('Total Endorsement Fees computed correctly ($150.00)?', panelText.includes('$150.00'));

  // Delete an endorsement -- its Schedule B-II requirement should disappear too
  await page.click(`[data-del-end="${ownerEnd.id}"]`);
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Deleting an endorsement removes its Schedule B-II requirement?', !o.commitment.requirements.some(r => r.sourceType === 'endorsement' && r.sourceId === ownerEnd.id));

  // Cross-navigation: Endorsements -> Premiums
  await page.click('#btn-goto-premiums-from-endorsements');
  await page.waitForTimeout(150);
  console.log('Cross-link navigates back to Premiums tab?', await page.evaluate(() => document.querySelector('[data-tab="titlePremiums"]').classList.contains('active')));

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
