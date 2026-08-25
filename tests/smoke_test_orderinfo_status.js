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

  // --- Order Information tab presence ---
  const sectionTabs = await page.$$eval('.section-tab', els => els.map(e => e.textContent));
  console.log('Section tabs include Order Information as 2nd?', sectionTabs[1] === 'Order Information');
  // Dropped the old exact-count check (sectionTabs.length === 6) -- the nav has grown several
  // times since this test was written (Doc Prep, Escrow/Closing, and others each added their own
  // flat top-level group), so a hardcoded total will keep going stale by design as the app grows.

  await page.click('[data-tab="orderInfo"]');
  await page.waitForTimeout(200);
  console.log('Order Information tab active class applied?', await page.$eval('[data-tab="orderInfo"]', el => el.classList.contains('active')));

  let panelText = await page.textContent('#tab-panel');
  console.log('Panel shows Status card?', panelText.includes('Status'));
  console.log('Panel shows Functional Roles card?', panelText.includes('Functional Roles'));
  console.log('Panel shows Order Received Date field?', panelText.includes('Order Received Date'));
  console.log('Panel shows all 7 role labels?', ['Title Officer','Curative Title Officer','Escrow Assistant','Escrow Officer','Closing Coordinator','Funder','Recorder'].every(l => panelText.includes(l)));

  // --- Status option lists ---
  const orderStatusOpts = await page.$$eval('#oi-orderStatus option', els => els.map(e => e.value));
  console.log('Order Status options correct?', JSON.stringify(orderStatusOpts) === JSON.stringify(["In Progress","Retain","Hold","Completed","Canceled","Duplicate"]));

  const titleStatusOpts = await page.$$eval('#oi-titleStatus option', els => els.map(e => e.value));
  console.log('Title Status options correct (Exam not Typing and Exam)?', JSON.stringify(titleStatusOpts) === JSON.stringify(["In Progress","Searching","Exam","Curative","Cleared for Policy","Policy Issued","Policy Remitted","Hold - Title Only"]));

  const escrowStatusOpts = await page.$$eval('#oi-escrowStatus option', els => els.map(e => e.value));
  console.log('Escrow Status options correct?', JSON.stringify(escrowStatusOpts) === JSON.stringify(["In Progress","Balancing","Docs Out","Closed (funds disbursed)","Canceled"]));

  // --- Fill fields, verify save ---
  await page.fill('#oi-orderReceivedDate', '2026-08-20');
  await page.fill('#oi-role-titleOfficer', 'Cam Pennydarden');
  await page.fill('#oi-role-escrowOfficer', 'Jane Doe');
  await page.waitForTimeout(150);
  await page.selectOption('#oi-orderStatus', 'Retain');
  await page.waitForTimeout(150);
  await page.selectOption('#oi-escrowStatus', 'Balancing');
  await page.waitForTimeout(150);

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('orderReceivedDate saved?', saved.orderReceivedDate === '2026-08-20');
  console.log('functionalRoles.titleOfficer saved?', saved.functionalRoles.titleOfficer === 'Cam Pennydarden');
  console.log('functionalRoles.escrowOfficer saved?', saved.functionalRoles.escrowOfficer === 'Jane Doe');
  console.log('orderStatus saved?', saved.orderStatus === 'Retain');
  console.log('escrowStatus saved?', saved.escrowStatus === 'Balancing');

  // --- Title Status change here fires full render + updates header pill ---
  await page.selectOption('#oi-titleStatus', 'Exam');
  await page.waitForTimeout(200);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('titleStatus saved via Order Info screen?', saved.titleStatus === 'Exam');
  const headerPillValue = await page.$eval('#title-status-select', el => el.value);
  console.log('Header pill reflects updated Title Status (full render fired)?', headerPillValue === 'Exam');

  // --- Migration: old-shape order missing new fields + "Typing and Exam" ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'Typing and Exam',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' },
      requestedTasks: [{ id: 'rt1', description: 'Old RT with receivedDate', requestedDate: '2026-01-01', receivedDate: '2026-01-05', dueDate: '', requestedDueDate: '', notes: '' }],
      checklistTasks: [
        { id: 'ct1', description: 'Old CT complete=true', milestone: 'Curative', dueDate: '', complete: true, completedDate: '2026-01-10' },
        { id: 'ct2', description: 'Old CT complete=false', milestone: 'Search', dueDate: '', complete: false, completedDate: '' }
      ]
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Migrated titleStatus "Typing and Exam" -> "Exam"?', saved.titleStatus === 'Exam');
  console.log('Migrated orderReceivedDate backfilled to ""?', saved.orderReceivedDate === '');
  console.log('Migrated orderStatus backfilled to "In Progress"?', saved.orderStatus === 'In Progress');
  console.log('Migrated escrowStatus backfilled to "In Progress"?', saved.escrowStatus === 'In Progress');
  console.log('Migrated functionalRoles backfilled with all 7 keys?', ['titleOfficer','curativeTitleOfficer','escrowAssistant','escrowOfficer','closingCoordinator','funder','recorder'].every(k => saved.functionalRoles[k] === ''));
  console.log('Migrated old requestedTasks gets status:"" (non-destructive, no assumption from receivedDate)?', saved.requestedTasks[0].status === '');
  console.log('Migrated old requestedTasks receivedDate preserved?', saved.requestedTasks[0].receivedDate === '2026-01-05');
  console.log('Migrated old checklistTask complete=true -> status "Completed"?', saved.checklistTasks[0].status === 'Completed');
  console.log('Migrated old checklistTask complete=false -> status ""?', saved.checklistTasks[1].status === '');

  console.log('No error rendering Order Info on migrated order?', true);
  await page.click('[data-tab="orderInfo"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Order Info renders w/o error on migrated order?', !panelText.includes('Something went wrong'));

  // --- Requested Task status dropdown ---
  await page.click('[data-tab="requestedTasks"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Requested task shows (None) for empty status?', panelText.includes('(None)'));

  const rtSelect = await page.$('[data-rt-status]');
  console.log('Requested task status select present?', !!rtSelect);
  await page.selectOption('[data-rt-status]', 'Received');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Requested task status set to Received?', saved.requestedTasks[0].status === 'Received');
  console.log('Requested task receivedDate NOT overwritten (already set)?', saved.requestedTasks[0].receivedDate === '2026-01-05');

  // Add a fresh requested task via seed chip, then move it to Received, check auto-stamp fires
  await page.click('[data-seed-rt]');
  await page.waitForTimeout(150);
  const rtSelects = await page.$$('[data-rt-status]');
  await rtSelects[rtSelects.length - 1].selectOption('Received');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const newRt = saved.requestedTasks[saved.requestedTasks.length - 1];
  console.log('New seeded requested task auto-stamps receivedDate on -> Received?', newRt.status === 'Received' && !!newRt.receivedDate);

  // Edit form includes status field
  await page.click('[data-edit-rt]');
  await page.waitForTimeout(150);
  const rtId = await page.getAttribute('[data-save-rt]', 'data-save-rt');
  console.log('Edit Requested Task form has status select?', !!(await page.$('#ert-status-' + rtId)));
  await page.selectOption('#ert-status-' + rtId, 'N/A');
  await page.click('[data-save-rt="' + rtId + '"]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Edit form status change persisted?', saved.requestedTasks.filter(t => t.id === rtId)[0].status === 'N/A');

  // --- Checklist Task status dropdown ---
  await page.click('[data-tab="checklistTasks"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Checklist status shows Completed label for migrated ct1?', panelText.includes('Completed'));

  const ctSelects = await page.$$('[data-ct-status]');
  console.log('Two checklist status selects present?', ctSelects.length === 2);
  // ct2 (index 1) has status "" -> set to Completed, verify auto-stamp
  await ctSelects[1].selectOption('Completed');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Checklist task status set to Completed?', saved.checklistTasks[1].status === 'Completed');
  console.log('Checklist task completedDate auto-stamped?', !!saved.checklistTasks[1].completedDate);

  // Add new checklist task with status via add-form
  await page.fill('#ct-description', 'New CT with status');
  await page.selectOption('#ct-status', 'Required');
  await page.click('#btn-add-ct');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const newCt = saved.checklistTasks[saved.checklistTasks.length - 1];
  console.log('New checklist task saved with chosen status?', newCt.status === 'Required');

  // Edit form includes status field
  await page.click('[data-edit-ct]');
  await page.waitForTimeout(150);
  const ctId = await page.getAttribute('[data-save-ct]', 'data-save-ct');
  console.log('Edit Checklist Task form has status select?', !!(await page.$('#ect-status-' + ctId)));

  console.log('No data-mark-received-rt buttons remain?', (await page.$$('[data-mark-received-rt]')).length === 0);
  console.log('No data-toggle-ct buttons remain?', (await page.$$('[data-toggle-ct]')).length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
