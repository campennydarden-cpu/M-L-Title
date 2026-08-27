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

  // --- Set Order Entry Policy Type to Simultaneous so both the Owner's and Loan Policy blocks render on Schedule A ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(150);

  // --- Tab presence / navigation ---
  console.log('Schedule A section tab present?', !!(await page.$('[data-tab="scheduleA"]')));
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('Schedule A tab renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('Policy & Coverage card present?', panelText.includes('Policy & Coverage') || panelText.includes('Policy &amp; Coverage'));
  console.log('Owner\'s Policy card present (Simultaneous)?', panelText.includes("Owner's Policy"));
  console.log('Loan Policy card present (Simultaneous)?', panelText.includes('Loan Policy'));
  console.log('Chain of Title card present?', panelText.includes('Chain of Title'));
  console.log('Countersignature card present?', panelText.includes('Countersignature'));

  // --- Fill Schedule A fields, both policy blocks ---
  await page.fill('#sa-dateIssued', '2026-08-24');
  await page.fill('#sa-timeIssued', '14:30');
  await page.fill('#sa-titleHeldAs', 'Fee Simple');
  await page.fill('#sa-counterSignature', 'Cam Pennydarden');
  await page.fill('#sa-counterSignatureDate', '2026-08-24');
  await page.selectOption('#sa-ownerPolicyType', "ALTA Owner's Policy");
  await page.fill('#sa-ownerProposedInsured', 'Jane Buyer');
  await page.fill('#sa-ownerCoverageAmount', '350000');
  await page.selectOption('#sa-loanPolicyType', "ALTA Loan Policy");
  await page.fill('#sa-loanProposedInsured', 'Big Bank NA');
  await page.fill('#sa-loanMortgageeClause', 'Big Bank NA, its successors and/or assigns ISAOA/ATIMA');
  await page.fill('#sa-loanCoverageAmount', '300000');
  await page.click('body');
  await page.waitForTimeout(150);

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('dateIssued saved?', saved.commitment.scheduleA.dateIssued === '2026-08-24');
  console.log('timeIssued saved?', saved.commitment.scheduleA.timeIssued === '14:30');
  console.log('titleHeldAs saved?', saved.commitment.scheduleA.titleHeldAs === 'Fee Simple');
  console.log('counterSignature saved?', saved.commitment.scheduleA.counterSignature === 'Cam Pennydarden');
  console.log('counterSignatureDate saved?', saved.commitment.scheduleA.counterSignatureDate === '2026-08-24');
  console.log('ownerPolicy.policyType saved?', saved.commitment.scheduleA.ownerPolicy.policyType === "ALTA Owner's Policy");
  console.log('ownerPolicy.proposedInsured saved?', saved.commitment.scheduleA.ownerPolicy.proposedInsured === 'Jane Buyer');
  console.log('ownerPolicy.coverageAmount saved?', saved.commitment.scheduleA.ownerPolicy.coverageAmount === '350000');
  console.log('loanPolicy.policyType saved?', saved.commitment.scheduleA.loanPolicy.policyType === "ALTA Loan Policy");
  console.log('loanPolicy.proposedInsured saved?', saved.commitment.scheduleA.loanPolicy.proposedInsured === 'Big Bank NA');
  console.log('loanPolicy.mortgageeClause saved?', saved.commitment.scheduleA.loanPolicy.mortgageeClause === 'Big Bank NA, its successors and/or assigns ISAOA/ATIMA');
  console.log('loanPolicy.coverageAmount saved?', saved.commitment.scheduleA.loanPolicy.coverageAmount === '300000');

  // --- Proposed Insured seed chips from Buyer/Borrower (owner) and Lender (loan) contacts ---
  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Buyer/Borrower');
  await page.fill('#cd-name', 'Bob Buyer');
  await page.waitForTimeout(100);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Lender');
  await page.fill('#cd-name', 'Second National Bank');
  await page.fill('#cd-mortgageeClause', 'Second National Bank, its successors and/or assigns, ISAOA/ATIMA');
  await page.waitForTimeout(100);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Owner Proposed Insured seed chip for Bob Buyer present?', panelText.includes('Bob Buyer'));
  console.log('Loan Proposed Insured seed chip for Second National Bank present?', panelText.includes('Second National Bank'));
  await page.click('[data-seed-owner-insured]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Owner Proposed Insured set via seed chip?', saved.commitment.scheduleA.ownerPolicy.proposedInsured === 'Bob Buyer');

  await page.click('[data-seed-loan-insured]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Loan Proposed Insured set via seed chip?', saved.commitment.scheduleA.loanPolicy.proposedInsured === 'Second National Bank');

  // Reset the field before testing the Mortgagee Clause copy chip, so the assertion is meaningful
  await page.fill('#sa-loanMortgageeClause', '');
  await page.click('body');
  await page.waitForTimeout(150);
  console.log('Mortgagee Clause copy chip for Second National Bank present?', !!(await page.$('[data-seed-mortgagee-clause]')));
  await page.click('[data-seed-mortgagee-clause]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Mortgagee Clause copied from Lender contact?', saved.commitment.scheduleA.loanPolicy.mortgageeClause === 'Second National Bank, its successors and/or assigns, ISAOA/ATIMA');

  // --- Chain of Title: manual add ---
  await page.fill('#cot-instrumentType', 'Warranty Deed');
  await page.fill('#cot-grantor', 'Old Owner LLC');
  await page.fill('#cot-grantee', 'Jane Buyer');
  await page.fill('#cot-datedDate', '2020-05-01');
  await page.fill('#cot-recordedDate', '2020-05-10');
  await page.fill('#cot-book', '123');
  await page.fill('#cot-page', '456');
  await page.fill('#cot-instrumentNumber', 'INS-001');
  await page.click('#btn-add-cot');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Chain of Title entry listed after add?', panelText.includes('Old Owner LLC') && panelText.includes('Jane Buyer'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Chain of Title entry saved with all fields?', saved.commitment.chainOfTitle.length === 1 &&
    saved.commitment.chainOfTitle[0].instrumentType === 'Warranty Deed' &&
    saved.commitment.chainOfTitle[0].book === '123');

  // --- Chain of Title: edit ---
  await page.click('[data-edit-cot]');
  await page.waitForTimeout(150);
  const cotId = saved.commitment.chainOfTitle[0].id;
  await page.fill('#ecot-grantee-' + cotId, 'Jane & John Buyer');
  await page.click('[data-save-cot]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Chain of Title entry edited?', saved.commitment.chainOfTitle[0].grantee === 'Jane & John Buyer');

  // --- Chain of Title: seed from Derivation ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#dv-grantorName', 'Prior Grantor Inc');
  await page.fill('#dv-name', 'Current Owner LLC');
  await page.fill('#dv-book', '999');
  await page.waitForTimeout(150);
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Copy from Derivation seed chip present?', panelText.includes('Copy from Derivation'));
  await page.click('[data-seed-cot-derivation]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Chain of Title now has 2 entries after Derivation seed?', saved.commitment.chainOfTitle.length === 2);
  console.log('Seeded entry has Derivation grantor/grantee/book?', saved.commitment.chainOfTitle[1].grantor === 'Prior Grantor Inc' && saved.commitment.chainOfTitle[1].grantee === 'Current Owner LLC' && saved.commitment.chainOfTitle[1].book === '999');

  // --- Chain of Title: delete ---
  await page.click('[data-del-cot]');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Chain of Title entry deleted (back to 1)?', saved.commitment.chainOfTitle.length === 1);

  // --- Link from Commitment tab back to Schedule A ---
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Commitment tab shows Edit full Schedule A link?', panelText.includes('Edit full Schedule A'));
  await page.click('#btn-goto-scheduleA');
  await page.waitForTimeout(150);
  console.log('Link navigated to Schedule A tab?', await page.$eval('[data-tab="scheduleA"]', el => el.classList.contains('active')));

  // --- Generate Commitment and confirm Schedule A detail appears in the doc ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
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
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Generated doc shows Commitment Date?', panelText.includes('Commitment Date'));
  console.log('Generated doc shows Policy Type value?', panelText.includes("ALTA Owner's Policy"));
  console.log('Generated doc shows Coverage Amount formatted as currency?', panelText.includes('$350,000.00'));
  console.log('Generated doc shows Title Held As?', panelText.includes('Fee Simple'));
  console.log('Generated doc shows Chain of Title section?', panelText.includes('Chain of Title'));
  console.log('Generated doc shows Chain of Title entry (Warranty Deed)?', panelText.includes('Warranty Deed'));
  console.log('Generated doc shows Countersigned section?', panelText.includes('Countersigned'));
  console.log('Generated doc shows counter signature name?', panelText.includes('Cam Pennydarden'));

  // --- File History integration check ---
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('History logs Schedule A field change (Policy Type)?', panelText.includes('Policy Type'));
  console.log('History logs per-policy ALTA Form auto-suggest?', panelText.includes('ALTA Form'));
  console.log('History logs Chain of Title add event?', panelText.includes('Chain of Title entry added'));
  console.log('History logs Chain of Title delete event?', panelText.includes('Chain of Title entry deleted'));

  // --- Migration test: old order missing scheduleA/chainOfTitle ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDSA', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' },
      commitment: { requirements: [], exceptions: [], generated: true, generatedAt: new Date().toISOString(), chainNote: '' }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDSA');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order renders Schedule A tab w/o crash?', !panelText.includes('Something went wrong'));
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Commitment doc renders w/o crash (chainOfTitle backfilled)?', !panelText.includes('Something went wrong'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('scheduleA backfilled as object w/ ownerPolicy/loanPolicy sub-objects?', typeof savedOld.commitment.scheduleA === 'object' &&
    typeof savedOld.commitment.scheduleA.ownerPolicy === 'object' && savedOld.commitment.scheduleA.ownerPolicy.policyType === '' &&
    typeof savedOld.commitment.scheduleA.loanPolicy === 'object' && savedOld.commitment.scheduleA.loanPolicy.mortgageeClause === '');
  console.log('chainOfTitle backfilled to []?', Array.isArray(savedOld.commitment.chainOfTitle) && savedOld.commitment.chainOfTitle.length === 0);

  console.log('ERRORS:', errors);
  await browser.close();
})();
