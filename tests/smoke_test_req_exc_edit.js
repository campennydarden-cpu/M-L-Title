const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);

  // --- Requirements: add via seed, then edit ---
  await page.click('[data-seed-req]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Seeded requirement appears?', panelText.includes('1.'));

  console.log('Edit button visible on requirement row?', !!(await page.$('[data-edit-req]')));
  console.log('No edit form visible before clicking edit?', !(await page.$('[data-save-req]')));

  await page.click('[data-edit-req]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking edit?', !!(await page.$('[data-save-req]')));

  const reqId = await page.getAttribute('[data-save-req]', 'data-save-req');
  await page.fill('#ereq-description-' + reqId, 'Custom edited requirement text');
  await page.fill('#ereq-notes-' + reqId, 'Edited note for req');
  await page.click('[data-save-req="' + reqId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Row shows updated requirement text?', panelText.includes('Custom edited requirement text'));
  console.log('Row shows updated notes?', panelText.includes('Edited note for req'));
  console.log('Edit form gone after save?', !(await page.$('[data-save-req]')));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.requirements[0]);
  console.log('Saved requirement description correct?', saved.description === 'Custom edited requirement text');
  console.log('Saved requirement notes correct?', saved.notes === 'Edited note for req');

  // Cancel discards changes
  await page.click('[data-edit-req]');
  await page.waitForTimeout(150);
  const reqId2 = await page.getAttribute('[data-save-req]', 'data-save-req');
  await page.fill('#ereq-description-' + reqId2, 'THIS SHOULD BE DISCARDED');
  await page.click('[data-cancel-req="' + reqId2 + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Cancel discards edits (still shows prior text)?', panelText.includes('Custom edited requirement text') && !panelText.includes('THIS SHOULD BE DISCARDED'));

  // --- Exceptions: add via seed, then edit ---
  await page.click('[data-seed-exc]');
  await page.waitForTimeout(150);
  console.log('Edit button visible on exception row?', !!(await page.$('[data-edit-exc]')));

  await page.click('[data-edit-exc]');
  await page.waitForTimeout(150);
  console.log('Edit form visible after clicking exception edit?', !!(await page.$('[data-save-exc]')));
  const excId = await page.getAttribute('[data-save-exc]', 'data-save-exc');
  await page.fill('#eexc-description-' + excId, 'Custom edited exception text');
  await page.fill('#eexc-notes-' + excId, 'Edited note for exc');
  await page.click('[data-save-exc="' + excId + '"]');
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Row shows updated exception text?', panelText.includes('Custom edited exception text'));
  console.log('Row shows updated exception notes?', panelText.includes('Edited note for exc'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.exceptions[0]);
  console.log('Saved exception description correct?', saved.description === 'Custom edited exception text');
  console.log('Saved exception notes correct?', saved.notes === 'Edited note for exc');

  // Delete still works alongside edit button present
  const delReqCountBefore = (await page.$$('[data-del-req]')).length;
  await page.click('[data-del-req]');
  await page.waitForTimeout(150);
  const delReqCountAfter = (await page.$$('[data-del-req]')).length;
  console.log('Delete still works on requirement row?', delReqCountAfter === delReqCountBefore - 1);

  // --- Sourced requirement (from Security Instrument) still editable, doesn't break source dedup ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  // Add an SI first via prelim tab (need one for the file chip to exist) -- verify via existing commitment_source test coverage instead;
  // here just confirm no console errors thrown from the new edit paths interacting with sourceType/sourceId fields.
  console.log('ERRORS:', errors);
  await browser.close();
})();
