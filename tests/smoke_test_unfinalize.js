const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
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

  await page.fill('#req-description', 'Requirement One');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(200);

  // --- Finalize ---
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  let panelText = await page.textContent('#tab-panel');
  console.log('Status: Final shown after finalize?', panelText.includes('Final'));
  console.log('Revert to Draft button visible (no CTC issued)?', !!(await page.$('#btn-unfinalize-commitment')));

  // --- Un-finalize: confirm strip ---
  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(150);
  console.log('Confirm strip appears?', !!(await page.$('#btn-confirm-unfinalize')));
  await page.click('#btn-cancel-unfinalize');
  await page.waitForTimeout(150);
  console.log('Cancel dismisses confirm strip (still Final)?', !!(await page.$('#btn-unfinalize-commitment')) && !(await page.$('#btn-confirm-unfinalize')));

  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-unfinalize');
  await page.waitForTimeout(200);

  panelText = await page.textContent('#tab-panel');
  console.log('Status: Draft shown again after revert?', panelText.includes('Draft'));
  console.log('Delete button back on requirement rows (Draft)?', !!(await page.$('[data-del-req]')));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('commitment.final = false?', saved.commitment.final === false);
  console.log('finalizedAt cleared?', saved.commitment.finalizedAt === null);
  console.log('titleStatus reverted to Exam?', saved.titleStatus === 'Exam');

  // Curative tab should show "still Draft" again
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Curative shows "still Draft" again after revert?', panelText.includes('still Draft'));

  // --- Re-finalize, disposition + Don't Show a requirement, issue CTC, verify revert is blocked while CTC issued ---
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.selectOption('[data-req-disposition]', 'Released');
  await page.waitForTimeout(150);
  await page.check('[data-req-dontshow]');
  await page.waitForTimeout(150);
  await page.click('#btn-issue-ctc');
  await page.waitForTimeout(200);

  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Revert to Draft button hidden while CTC issued?', !(await page.$('#btn-unfinalize-commitment')));
  console.log('Message explains to Rescind CTC first?', panelText.includes('Rescind the Clear to Close'));

  // Rescind CTC, then revert should work and dispositions/dontShow should be preserved
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.click('#btn-rescind-ctc');
  await page.waitForTimeout(200);
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  console.log('Revert to Draft button visible again after Rescind?', !!(await page.$('#btn-unfinalize-commitment')));

  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-unfinalize');
  await page.waitForTimeout(200);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Disposition preserved through revert (not cleared)?', saved.commitment.requirements[0].disposition === 'Released');
  console.log('dontShow preserved through revert (not cleared)?', saved.commitment.requirements[0].dontShow === true);
  console.log('commitment.final = false after this second revert?', saved.commitment.final === false);

  console.log('ERRORS:', errors);
  await browser.close();
})();
