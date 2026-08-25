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

  await page.fill('#f-propertyAddress', '123 Main St');
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);

  // --- Curative tab before Commitment generated ---
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Curative shows "generate first" before Commitment generated?', panelText.includes('Generate a Commitment first'));

  // Go back, add 2 requirements + 1 exception, generate
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  console.log('No Finalize control before Commitment generated?', !(await page.$('#btn-finalize-commitment')));

  await page.fill('#req-description', 'Requirement One');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.fill('#req-description', 'Requirement Two');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.fill('#exc-description', 'Exception One');
  await page.click('#btn-add-exc');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(200);

  console.log('Status: Draft shown after generate?', (await page.textContent('#tab-panel')).includes('Status:'));
  console.log('Finalize button visible (Draft state)?', !!(await page.$('#btn-finalize-commitment')));
  console.log('Delete button still works pre-Final?', !!(await page.$('[data-del-req]')));

  // --- Curative tab while still Draft ---
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Curative shows "still Draft" message?', panelText.includes('still Draft'));
  await page.click('#btn-goto-commitment-from-curative');
  await page.waitForTimeout(150);
  console.log('Go-to-Commitment button navigated correctly?', await page.$eval('[data-tab="commitment"]', el => el.classList.contains('active')));

  // --- Finalize flow ---
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  console.log('Confirm strip appears after clicking Finalize?', !!(await page.$('#btn-confirm-finalize')));
  await page.click('#btn-cancel-finalize');
  await page.waitForTimeout(150);
  console.log('Cancel dismisses confirm strip (still Draft)?', !!(await page.$('#btn-finalize-commitment')) && !(await page.$('#btn-confirm-finalize')));

  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  panelText = await page.textContent('#tab-panel');
  console.log('Status: Final shown after confirm?', panelText.includes('Final'));
  console.log('Delete button now hidden on requirement rows (Final)?', !(await page.$('[data-del-req]')));
  console.log('Edit button still present on requirement rows (Final)?', !!(await page.$('[data-edit-req]')));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('commitment.final = true?', saved.commitment.final === true);
  console.log('titleStatus auto-set to Curative on Finalize?', saved.titleStatus === 'Curative');

  const headerPill = await page.$eval('#title-status-select', el => el.value);
  console.log('Header pill reflects Curative status?', headerPill === 'Curative');

  // --- Curative screen now active ---
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Requirement One listed on Curative?', panelText.includes('Requirement One'));
  console.log('Requirement Two listed on Curative?', panelText.includes('Requirement Two'));
  console.log('Exception One listed on Curative?', panelText.includes('Exception One'));
  console.log('Progress shows 0 of 2 dispositioned?', panelText.includes('0 of 2'));
  console.log('Issue CTC button disabled (nothing dispositioned)?', await page.$eval('#btn-issue-ctc', el => el.disabled));

  const reqDispSelects = await page.$$('[data-req-disposition]');
  console.log('Two requirement disposition selects present?', reqDispSelects.length === 2);
  const reqOptions = await reqDispSelects[0].$$eval('option', els => els.map(e => e.value));
  console.log('Requirement disposition options correct?', JSON.stringify(reqOptions) === JSON.stringify(["", "Released", "Payoff Obtained", "Satisfied", "Expired", "Insured Over", "Subordinated", "Waived", "Bonded Around", "Other"]));

  const excDispSelects = await page.$$('[data-exc-disposition]');
  const excOptions = await excDispSelects[0].$$eval('option', els => els.map(e => e.value));
  console.log('Exception disposition options correct?', JSON.stringify(excOptions) === JSON.stringify(["", "Removed by Affidavit", "Insured Over", "Endorsed Around", "Deleted per Survey", "Waived", "Other"]));

  // Disposition requirement 1 only
  await reqDispSelects[0].selectOption('Released');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Progress updates to 1 of 2?', panelText.includes('1 of 2'));
  console.log('Issue CTC still disabled (req 2 not dispositioned)?', await page.$eval('#btn-issue-ctc', el => el.disabled));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Requirement 1 disposition saved?', saved.commitment.requirements[0].disposition === 'Released');

  // Disposition notes + Don't Show on requirement 1
  await page.fill('[data-req-disp-notes]', 'Payoff letter received, satisfaction recorded 8/15');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Requirement 1 dispositionNotes saved?', saved.commitment.requirements[0].dispositionNotes === 'Payoff letter received, satisfaction recorded 8/15');

  await page.check('[data-req-dontshow]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Requirement 1 shows "Hidden from Commitment" after Dont Show checked?', panelText.includes('Hidden from Commitment'));
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Requirement 1 dontShow = true saved?', saved.commitment.requirements[0].dontShow === true);

  // Now disposition requirement 2 to unlock CTC
  const reqDispSelects2 = await page.$$('[data-req-disposition]');
  await reqDispSelects2[1].selectOption('Expired');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Progress shows 2 of 2 dispositioned?', panelText.includes('2 of 2'));
  console.log('Issue CTC now enabled?', !(await page.$eval('#btn-issue-ctc', el => el.disabled)));

  // Confirm Exceptions did not block progress and are optional (no disposition set)
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Exception disposition still blank (optional, not required)?', saved.commitment.exceptions[0].disposition === '');

  // --- Issue CTC ---
  await page.click('#btn-issue-ctc');
  await page.waitForTimeout(200);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('ctcIssued = true?', saved.commitment.ctcIssued === true);
  console.log('titleStatus auto-set to Cleared for Policy?', saved.titleStatus === 'Cleared for Policy');

  panelText = await page.textContent('#tab-panel');
  console.log('CTC doc title shows "Clear to Close"?', panelText.includes('Clear to Close'));
  // Scoped to #ctc-doc alone -- #tab-panel also includes the Curative screen's own unfiltered
  // requirement rows above the doc (which intentionally still show dontShow items, struck through).
  const ctcDocText = await page.textContent('#ctc-doc');
  console.log('CTC doc body hides the dontShow requirement (Requirement One absent)?', !ctcDocText.includes('Requirement One'));
  console.log('CTC still shows Requirement Two (not hidden)?', panelText.includes('Requirement Two'));
  console.log('CTC shows Exception One (not hidden)?', panelText.includes('Exception One'));

  // Save CTC version to Attachments
  await page.fill('#save-ctc-version-label', 'Issued 1');
  await page.click('#btn-save-ctc-version');
  await page.waitForTimeout(150);
  await page.click('[data-tab="attachments"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Attachments shows Clear to Close - Issued 1?', panelText.includes('Issued 1') && panelText.includes('Clear to Close'));

  // --- Rescind ---
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.click('#btn-rescind-ctc');
  await page.waitForTimeout(200);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('ctcIssued reverted to false after Rescind?', saved.commitment.ctcIssued === false);
  console.log('titleStatus reverted to Curative after Rescind?', saved.titleStatus === 'Curative');
  panelText = await page.textContent('#tab-panel');
  console.log('Issue CTC button available again after Rescind?', !!(await page.$('#btn-issue-ctc')));

  console.log('ERRORS:', errors);
  await browser.close();
})();
