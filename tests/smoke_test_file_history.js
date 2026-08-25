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

  // --- History tab presence / navigation ---
  console.log('File History toolbar item present?', !!(await page.$('[data-tab="history"]')));
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('History tab renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('File Created milestone logged on new order?', panelText.includes('File Created'));

  // --- Simple bindText field change: no keystroke spam, only final value on blur/change ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.type('#f-propertyAddress', '123 Main St', { delay: 20 });
  // blur to fire "change"
  await page.click('body');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Property Address field-change entry logged?', panelText.includes('Property Address') && panelText.includes('123 Main St'));
  const entryCountAfterOneChange = (await page.$$('#tab-panel > div.card > div')).length;

  // Change it again to a different value - should log old->new correctly, not spam per keystroke
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '456 Oak Ave');
  await page.click('body');
  await page.waitForTimeout(150);
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Second field-change shows old value 123 Main St -> new 456 Oak Ave?', panelText.includes('123 Main St') && panelText.includes('456 Oak Ave'));

  // --- Structured record: add + edit a Security Instrument ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#si-mortgagor', 'John Smith');
  await page.fill('#si-mortgagee', 'ABC Bank');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI add event logged?', panelText.includes('Security Instrument added: John Smith'));

  // Edit the SI's mortgagee via pencil icon
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.click('[data-edit-si]');
  await page.waitForTimeout(150);
  const siId = await page.$eval('[data-save-si]', el => el.getAttribute('data-save-si'));
  await page.fill('#esi-mortgagee-' + siId, 'XYZ Bank');
  await page.click('[data-save-si]');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI edit diff logged (Mortgagee ABC Bank -> XYZ Bank)?', panelText.includes('Mortgagee') && panelText.includes('ABC Bank') && panelText.includes('XYZ Bank'));

  // --- Delete the SI ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.click('[data-del-si]');
  await page.waitForTimeout(150);
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('SI delete event logged?', panelText.includes('Security Instrument deleted: John Smith'));

  // --- Milestones: Requirement + Exception, Generate, Finalize, Issue CTC, Rescind ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  await page.fill('#req-description', 'Requirement A');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.fill('#exc-description', 'Exception A');
  await page.click('#btn-add-exc');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(150);
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(200);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Requirement added event logged?', panelText.includes('Requirement added: Requirement A'));
  console.log('Exception added event logged?', panelText.includes('Exception added: Exception A'));
  console.log('Commitment Generated milestone logged?', panelText.includes('Commitment Generated'));
  console.log('Commitment Finalized milestone logged?', panelText.includes('Commitment Finalized'));
  console.log('Title Status change to Curative logged?', panelText.includes('Title Status'));

  // Disposition the requirement, issue CTC, then rescind
  await page.click('[data-tab="curative"]');
  await page.waitForTimeout(150);
  await page.selectOption('[data-req-disposition]', 'Released');
  await page.waitForTimeout(150);
  await page.click('#btn-issue-ctc');
  await page.waitForTimeout(200);
  await page.click('#btn-rescind-ctc');
  await page.waitForTimeout(200);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Requirement Disposition change logged?', panelText.includes('Requirement Disposition') && panelText.includes('Released'));
  console.log('Clear to Close Issued milestone logged?', panelText.includes('Clear to Close Issued'));
  console.log('Clear to Close Rescinded milestone logged?', panelText.includes('Clear to Close Rescinded'));

  // --- Contacts: single consolidated event, not per-field ---
  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.fill('#cd-name', 'Jane Doe');
  await page.waitForTimeout(100);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Contact added event logged (consolidated, not per-field)?', panelText.includes('Contact added: Jane Doe'));

  // --- Newest-first ordering check ---
  const entryTexts = await page.$$eval('#tab-panel > div.card > div', els => els.filter(el => !el.classList.contains('card-title')).map(el => el.textContent));
  console.log('Newest-first ordering (most recent event is Contact added)?', entryTexts.length > 0 && entryTexts[0].includes('Jane Doe'));

  // --- Migration test: old order missing o.history ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDHIST', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDHIST');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order (missing history) renders History tab w/o crash?', !panelText.includes('Something went wrong'));
  console.log('Old order shows empty-state message?', panelText.includes('No history recorded yet'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('history backfilled to []?', Array.isArray(savedOld.history) && savedOld.history.length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
