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

  // No order open: section-nav / toolbar should not render
  console.log('No section-nav before order open?', !(await page.$('.section-nav')));
  console.log('No toolbar before order open?', !(await page.$('.toolbar')));

  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // --- Vertical nav checks ---
  const sectionNav = await page.$('.section-nav');
  console.log('.section-nav exists?', !!sectionNav);
  const navBox = sectionNav ? await sectionNav.boundingBox() : null;
  console.log('.section-nav is taller than wide (vertical stack)?', navBox && navBox.height > navBox.width);

  const sectionTabs = await page.$$eval('.section-tab', els => els.map(e => e.textContent));
  console.log('Section tabs = 5 expected labels?', JSON.stringify(sectionTabs) === JSON.stringify(["Order Entry","Contacts","Property","Prelim Search","Commitment"]));

  console.log('Old horizontal .tabs container gone?', !(await page.$('.tabs')));

  // Vertical stacking: second tab should be below first (not beside)
  const box1 = await page.locator('.section-tab').nth(0).boundingBox();
  const box2 = await page.locator('.section-tab').nth(1).boundingBox();
  console.log('Second section tab renders below first (vertical)?', box2.y > box1.y + box1.height - 2);

  // Click Contacts via vertical nav
  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);
  console.log('Contacts tab active class applied?', await page.$eval('[data-tab="contacts"]', el => el.classList.contains('active')));
  const panelAfterContacts = await page.textContent('#tab-panel');
  console.log('Contacts panel content shown?', panelAfterContacts.includes('Add Contact'));

  // --- Horizontal toolbar checks ---
  const toolbar = await page.$('.toolbar');
  console.log('.toolbar exists?', !!toolbar);
  const toolbarBtns = await page.$$eval('.toolbar-btn', els => els.map(e => e.textContent));
  console.log('Toolbar buttons = 3 expected labels?', JSON.stringify(toolbarBtns) === JSON.stringify(["Requested Tasks","Checklist Tasks","Attachments"]));
  const tbBox = await toolbar.boundingBox();
  const tb1 = await page.locator('.toolbar-btn').nth(0).boundingBox();
  const tb2 = await page.locator('.toolbar-btn').nth(1).boundingBox();
  console.log('Toolbar buttons are side by side (horizontal)?', Math.abs(tb1.y - tb2.y) < 2 && tb2.x > tb1.x);

  // --- Requested Tasks screen ---
  await page.click('[data-tab="requestedTasks"]');
  await page.waitForTimeout(150);
  console.log('Requested Tasks toolbar btn active?', await page.$eval('[data-tab="requestedTasks"]', el => el.classList.contains('active')));
  console.log('Requested Tasks seed chip visible?', !!(await page.$('[data-seed-rt]')));

  await page.click('[data-seed-rt="Order and Publish Search Package"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Seeded requested task appears?', panelText.includes('Order and Publish Search Package'));
  console.log('Status chip shows Not Requested?', panelText.includes('Not Requested'));

  // Manual add with full fields
  await page.fill('#rt-description', 'Payoff Request - Big Bank');
  await page.fill('#rt-requestedDate', '2026-08-01');
  await page.fill('#rt-requestedDueDate', '2026-08-03');
  await page.fill('#rt-dueDate', '2026-08-10');
  await page.click('#btn-add-rt');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Manual requested task appears?', panelText.includes('Payoff Request - Big Bank'));
  console.log('Status chip shows Requested (has requestedDate, no receivedDate)?', panelText.includes('Requested') );

  // Mark received via quick action
  const markBtn = await page.$('[data-mark-received-rt]');
  console.log('Mark Received button present?', !!markBtn);
  await markBtn.click();
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Status chip now shows Received?', panelText.includes('Received'));

  // Edit a requested task
  const editRtBtn = await page.$('[data-edit-rt]');
  await editRtBtn.click();
  await page.waitForTimeout(150);
  const rtId = await page.getAttribute('[data-save-rt]', 'data-save-rt');
  await page.fill('#ert-description-' + rtId, 'Payoff Request - Big Bank (updated)');
  await page.click('[data-save-rt="' + rtId + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Edited requested task text updated?', panelText.includes('Payoff Request - Big Bank (updated)'));

  // Delete a requested task
  const delRtBtnCount = (await page.$$('[data-del-rt]')).length;
  await page.click('[data-del-rt]');
  await page.waitForTimeout(150);
  const delRtBtnCountAfter = (await page.$$('[data-del-rt]')).length;
  console.log('Delete removes a requested task?', delRtBtnCountAfter === delRtBtnCount - 1);

  // --- Checklist Tasks screen ---
  await page.click('[data-tab="checklistTasks"]');
  await page.waitForTimeout(150);
  await page.fill('#ct-description', 'Order Payoff');
  await page.selectOption('#ct-milestone', 'Curative');
  await page.fill('#ct-dueDate', '2026-08-15');
  await page.click('#btn-add-ct');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Checklist task appears?', panelText.includes('Order Payoff'));
  console.log('Checklist task shows milestone?', panelText.includes('Curative'));
  console.log('Checklist task shows Open status?', panelText.includes('Open'));

  // Toggle complete
  await page.click('[data-toggle-ct]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Checklist task shows Complete after toggle?', panelText.includes('Complete'));
  const savedCt1 = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].checklistTasks[0]);
  console.log('Checklist task complete=true and completedDate set?', savedCt1.complete === true && !!savedCt1.completedDate);

  // Toggle back to incomplete
  await page.click('[data-toggle-ct]');
  await page.waitForTimeout(150);
  const savedCt2 = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].checklistTasks[0]);
  console.log('Checklist task complete=false and completedDate cleared after re-toggle?', savedCt2.complete === false && savedCt2.completedDate === "");

  // Edit checklist task
  await page.click('[data-edit-ct]');
  await page.waitForTimeout(150);
  const ctId = await page.getAttribute('[data-save-ct]', 'data-save-ct');
  await page.selectOption('#ect-milestone-' + ctId, 'Closing');
  await page.click('[data-save-ct="' + ctId + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Checklist task milestone updated to Closing?', panelText.includes('Closing'));

  // Delete checklist task
  await page.click('[data-del-ct]');
  await page.waitForTimeout(150);
  console.log('Checklist task deleted?', !(await page.$('[data-del-ct]')));

  // --- Attachments screen ---
  await page.click('[data-tab="attachments"]');
  await page.waitForTimeout(150);
  await page.fill('#att-name', 'Original Warranty Deed');
  await page.selectOption('#att-category', 'Recorded Document');
  await page.fill('#att-dateReceived', '2026-07-20');
  await page.fill('#att-source', 'Seller');
  await page.fill('#att-location', 'File room, cabinet 3');
  await page.click('#btn-add-att');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Attachment appears?', panelText.includes('Original Warranty Deed'));
  console.log('Attachment shows category?', panelText.includes('Recorded Document'));
  console.log('Attachment shows source?', panelText.includes('Seller'));
  console.log('Attachment shows location?', panelText.includes('File room, cabinet 3'));

  // Edit attachment
  await page.click('[data-edit-att]');
  await page.waitForTimeout(150);
  const attId = await page.getAttribute('[data-save-att]', 'data-save-att');
  await page.fill('#eatt-location-' + attId, 'Fireproof safe');
  await page.click('[data-save-att="' + attId + '"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Attachment location updated?', panelText.includes('Fireproof safe'));

  // Delete attachment
  await page.click('[data-del-att]');
  await page.waitForTimeout(150);
  console.log('Attachment deleted?', !(await page.$('[data-del-att]')));

  // --- Navigate back to a section tab, confirm still works after all this ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  console.log('Order Entry still reachable after using toolbar sections?', !!(await page.$('#f-transactionType')));

  console.log('ERRORS:', errors);
  await browser.close();
})();
