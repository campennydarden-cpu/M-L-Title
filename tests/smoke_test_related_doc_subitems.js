const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goPrelim = () => page.click('[data-tab="prelim"]');
  const goCommitment = () => page.click('[data-tab="commitment"]');

  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goPrelim();
  await page.waitForTimeout(200);

  // --- Required file facts for doc generation ---
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '123 Test St');
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Test Subdivision');
  await goPrelim();
  await page.waitForTimeout(200);

  // --- Add a Security Instrument ---
  await page.fill('#si-mortgagor', 'Jane Borrower');
  await page.fill('#si-mortgagee', 'Big Bank');
  await page.fill('#si-book', '100');
  await page.fill('#si-page', '200');
  await page.fill('#si-instrumentNumber', 'INST-500');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  await page.click('[data-toggle-si]');
  await page.waitForTimeout(150);
  const siId = await page.getAttribute('[data-add-rel]', 'data-add-rel');

  const relTypeOpts = await page.$eval('#rel-type-' + siId, el => Array.from(el.options).map(o => o.value));
  console.log('UCC Addendum - Continuation is a Related Document type option?', relTypeOpts.includes('UCC Addendum - Continuation'));

  // --- Add two related documents under this SI: an Assignment and a UCC Addendum ---
  await page.selectOption('#rel-type-' + siId, 'Assignment');
  await page.fill('#rel-datedDate-' + siId, '2026-01-01');
  await page.fill('#rel-recordedDate-' + siId, '2026-01-05');
  await page.fill('#rel-book-' + siId, '101');
  await page.fill('#rel-page-' + siId, '5');
  await page.fill('#rel-assignor-' + siId, 'Big Bank');
  await page.fill('#rel-assignee-' + siId, 'Second Bank');
  await page.click('[data-add-rel="' + siId + '"]');
  await page.waitForTimeout(150);

  await page.selectOption('#rel-type-' + siId, 'UCC Addendum - Continuation');
  await page.fill('#rel-recordedDate-' + siId, '2026-02-01');
  await page.fill('#rel-instrumentNumber-' + siId, 'INST-600');
  await page.click('[data-add-rel="' + siId + '"]');
  await page.waitForTimeout(150);

  // --- Go to Commitment: sub-item chips should NOT show yet (parent SI requirement not added) ---
  await goCommitment();
  await page.waitForTimeout(200);
  let relChipCount = (await page.$$('[data-seed-req-rel]')).length;
  console.log('No related-doc sub-item chips before parent SI requirement exists?', relChipCount === 0);

  // --- Add the parent SI requirement via its chip ---
  await page.click('[data-seed-req-si]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  // Note: default (blank) Commitment Form Type resolves to Standard, which now bakes in
  // 4 standard ALTA Schedule B-I items ahead of file-specific ones -- so the first
  // file-specific requirement is numbered 5, not 1 (see ALTA jacket boilerplate work).
  console.log('Parent SI requirement added as item 5?', panelText.includes('5. Release of Mortgage'));

  // --- Now sub-item chips should appear (2 of them: Assignment + UCC Addendum) ---
  relChipCount = (await page.$$('[data-seed-req-rel]')).length;
  console.log('2 related-doc sub-item chips now available?', relChipCount === 2);

  const chipTitle = await page.getAttribute('[data-seed-req-rel]', 'title');
  console.log('Sub-item chip text references the parent SI recording info (Book/Page)?', chipTitle.includes('affecting the Mortgage recorded as Book 100, Page 200'));
  console.log('Sub-item chip text includes assignor/assignee?', chipTitle.includes('from Big Bank to Second Bank'));

  // --- Click both sub-item chips ---
  await page.click('[data-seed-req-rel]');
  await page.waitForTimeout(150);
  await page.click('[data-seed-req-rel]'); // the remaining one
  await page.waitForTimeout(150);

  panelText = await page.textContent('#tab-panel');
  console.log('Sub-item labeled 5a appears?', panelText.includes('5a. Release of'));
  console.log('Sub-item labeled 5b appears?', panelText.includes('5b. Release of'));

  // No more chips left (both related docs used)
  relChipCount = (await page.$$('[data-seed-req-rel]')).length;
  console.log('No more sub-item chips left after both added?', relChipCount === 0);

  // --- Add a plain top-level requirement afterward -- should become "2", not disrupt 1/1a/1b ---
  await page.fill('#req-description', 'Pay all taxes current');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('New top-level requirement becomes 6 (not 5c)?', panelText.includes('6. Pay all taxes current'));
  console.log('Still shows 5, 5a, 5b intact after adding a new top-level item?', panelText.includes('5. Release of Mortgage') && panelText.includes('5a. Release of') && panelText.includes('5b. Release of'));

  const saved = await page.evaluate(() => {
    var o = JSON.parse(localStorage.getItem('genesis_orders_v1'))[0];
    return o.commitment.requirements.map(function(r){ return { desc: r.description.slice(0,30), parentReqId: r.parentReqId, sourceType: r.sourceType }; });
  });
  console.log('Saved requirements order/parent linkage:', JSON.stringify(saved));

  // --- Generate the Commitment doc and check numbering there too ---
  await page.click('#btn-generate');
  await page.waitForTimeout(200);
  let docText = await page.textContent('#commitment-doc');
  console.log('Generated doc shows 5. parent requirement?', docText.includes('5.') && docText.includes('Release of Mortgage'));
  console.log('Generated doc shows 5a. sub-item?', /5a\./.test(docText));
  console.log('Generated doc shows 5b. sub-item?', /5b\./.test(docText));
  console.log('Generated doc shows 6. for the plain requirement?', /6\.\s*Pay all taxes current/.test(docText));

  console.log('ERRORS:', errors);
  await browser.close();
})();
