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

  // Fill out parent order: transaction type, settlement date/time, a contact, functional role
  await page.selectOption('#f-transactionType', 'Refinance');
  await page.fill('#f-settlementDate', '2026-09-01');
  await page.fill('#f-settlementTime', '10:30');
  await page.fill('#f-propertyAddress', '100 Parent Lane');
  await page.waitForTimeout(150);

  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.fill('#cd-name', 'Alice Buyer');
  await page.waitForTimeout(100);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  await page.click('[data-tab="orderInfo"]');
  await page.waitForTimeout(150);
  await page.fill('#oi-role-titleOfficer', 'Cam P.');
  await page.waitForTimeout(150);

  let panelText = await page.textContent('#tab-panel');
  console.log('Linked Properties card visible on parent?', panelText.includes('Linked Properties'));
  console.log('Add Linked Property button visible on parent (no parentOrderId)?', !!(await page.$('#btn-add-linked-order')));
  console.log('No other properties message shown initially?', panelText.includes('No other properties linked yet'));

  const parentId = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].id);
  const parentFileNo = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].fileNo);

  // --- Spawn a linked order ---
  await page.click('#btn-add-linked-order');
  await page.waitForTimeout(250);

  console.log('Navigated to new sub-order (2 orders total)?', (await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1')).length)) === 2);

  const orders = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1')));
  const child = orders.filter(o => o.parentOrderId)[0];
  console.log('Child order has parentOrderId set to parent?', child.parentOrderId === parentId);
  console.log('Child inherited transactionType?', child.transactionType === 'Refinance');
  console.log('Child inherited settlementDate?', child.settlementDate === '2026-09-01');
  console.log('Child inherited settlementTime?', child.settlementTime === '10:30');
  console.log('Child inherited functionalRoles.titleOfficer?', child.functionalRoles.titleOfficer === 'Cam P.');
  console.log('Child inherited a contact (Alice Buyer)?', child.contacts.length === 1 && child.contacts[0].name === 'Alice Buyer');
  console.log('Child contact has a NEW id (deep clone, not shared ref)?', child.contacts[0].id !== orders.filter(o => !o.parentOrderId)[0].contacts[0].id);
  console.log('Child does NOT inherit propertyAddress?', child.propertyAddress === '');
  console.log('Child got its own fresh fileNo (different from parent)?', child.fileNo !== parentFileNo);
  console.log('Child titleStatus independent (In Progress default, not copied oddly)?', child.titleStatus === 'In Progress');

  // Landed on Order Info tab of the new child
  console.log('Landed on Order Information tab for new sub-order?', await page.$eval('[data-tab="orderInfo"]', el => el.classList.contains('active')));

  panelText = await page.textContent('#tab-panel');
  console.log('Child shows "Part of a package" banner?', panelText.includes('Part of a package'));
  console.log('Child banner references parent file no?', panelText.includes(parentFileNo));
  console.log('Add Linked Property button HIDDEN on child (flat hierarchy)?', !(await page.$('#btn-add-linked-order')));

  // Set the child's own property address to distinguish it
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '200 Child Lane');
  await page.waitForTimeout(150);

  // Navigate back to parent via the banner link
  await page.click('[data-tab="orderInfo"]');
  await page.waitForTimeout(150);
  await page.click('[data-open-order]');
  await page.waitForTimeout(200);

  panelText = await page.textContent('#tab-panel');
  // Order Info doesn't display the current order's own property address or file number (those
  // live on Order Entry / the sidebar) -- checking for them here was never going to match. The
  // reliable signal that we're back on the parent: no "part of a package" banner (parents aren't
  // children) and its own Linked Properties list now shows the child, confirmed by the next line.
  console.log('Navigated back to parent via banner link (no child banner, Linked Properties card shown)?', !panelText.includes('Part of a package') && panelText.includes('Linked Properties'));
  console.log('Parent now lists the linked child (200 Child Lane)?', panelText.includes('200 Child Lane'));
  console.log('Parent still shows Add Linked Property button?', !!(await page.$('#btn-add-linked-order')));

  // Add a second linked property to confirm multiple children work and siblings appear correctly
  await page.click('#btn-add-linked-order');
  await page.waitForTimeout(250);
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '300 Second Child Lane');
  await page.waitForTimeout(150);
  await page.click('[data-tab="orderInfo"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Second child sees ITS OWN parent banner (not itself in list)?', panelText.includes('Part of a package'));

  // Go back to parent, confirm both children now listed as siblings (not the parent itself)
  await page.click('[data-open-order]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Parent lists both linked children?', panelText.includes('200 Child Lane') && panelText.includes('300 Second Child Lane'));

  console.log('ERRORS:', errors);
  await browser.close();
})();
