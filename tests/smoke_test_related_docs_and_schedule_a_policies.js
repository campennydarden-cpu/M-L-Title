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
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);

  // ============ Part 1: Related Documents (Assignment / Loan Modification Agreement) ============

  // --- Liens & Encumbrances Type dropdown no longer offers Assignment / Loan Modification Agreement ---
  const lienTypeOptions = await page.$eval('#lien-lienType', el => Array.from(el.options).map(o => o.value));
  console.log('Lien Type dropdown no longer offers Assignment?', lienTypeOptions.indexOf('Assignment') === -1);
  console.log('Lien Type dropdown no longer offers Loan Modification Agreement?', lienTypeOptions.indexOf('Loan Modification Agreement') === -1);
  console.log('Lien Type dropdown still has 9 other types?', lienTypeOptions.length === 9);

  // --- Add a Security Instrument, then a Related Document of type Assignment (new, plain) ---
  await page.selectOption('#si-instrumentType', 'Deed of Trust');
  await page.fill('#si-mortgagor', 'John Doe');
  await page.fill('#si-mortgagee', 'Original Lender NA');
  await page.fill('#si-book', '4021');
  await page.fill('#si-page', '118');
  await page.fill('#si-instrumentNumber', 'INS-2020-0055');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  await page.click('[data-toggle-si]');
  await page.waitForTimeout(150);

  const siId = await page.getAttribute('[data-add-rel]', 'data-add-rel');
  const relTypeOptions = await page.$eval('#rel-type-' + siId, el => Array.from(el.options).map(o => o.value));
  console.log('Related Document Type has plain Assignment as first option?', relTypeOptions[0] === 'Assignment');
  console.log('Related Document Type has renamed Loan Modification Agreement?', relTypeOptions.indexOf('Loan Modification Agreement') !== -1);
  console.log('Related Document Type still has Assignment of Leases and Rents / Beneficial Interest / Substitution of Trustee / Other?',
    relTypeOptions.indexOf('Assignment of Leases and Rents') !== -1 && relTypeOptions.indexOf('Assignment of Beneficial Interest') !== -1 &&
    relTypeOptions.indexOf('Substitution of Trustee') !== -1 && relTypeOptions.indexOf('Other') !== -1);
  console.log('Assignor field present on Related Document add form?', !!(await page.$('#rel-assignor-' + siId)));
  console.log('Assignee field present on Related Document add form?', !!(await page.$('#rel-assignee-' + siId)));

  await page.selectOption('#rel-type-' + siId, 'Assignment');
  await page.fill('#rel-datedDate-' + siId, '2020-05-01');
  await page.fill('#rel-recordedDate-' + siId, '2020-05-10');
  await page.fill('#rel-book-' + siId, '4030');
  await page.fill('#rel-page-' + siId, '200');
  await page.fill('#rel-instrumentNumber-' + siId, 'ASG-2020-01');
  await page.fill('#rel-assignor-' + siId, 'Original Lender NA');
  await page.fill('#rel-assignee-' + siId, 'Loan Servicer LLC');
  await page.click('[data-add-rel="' + siId + '"]');
  await page.waitForTimeout(150);

  let panelText = await page.textContent('#tab-panel');
  console.log('Assignment related doc row shows assignor -> assignee?', panelText.includes('Original Lender NA') && panelText.includes('Loan Servicer LLC'));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  let si = saved.prelim.securityInstruments[0];
  console.log('Related doc saved under the correct SI (not as a top-level lien)?', si.related.length === 1 && si.related[0].type === 'Assignment');
  console.log('Related doc assignor/assignee saved?', si.related[0].assignor === 'Original Lender NA' && si.related[0].assignee === 'Loan Servicer LLC');
  console.log('No lien records created for this Assignment?', saved.prelim.liens.length === 0);

  // --- Edit form also shows Assignor/Assignee ---
  await page.click('[data-edit-rel]');
  await page.waitForTimeout(150);
  const relId = si.related[0].id;
  console.log('Edit form shows Assignor prefilled?', (await page.inputValue('#erel-assignor-' + relId)) === 'Original Lender NA');
  await page.click('[data-cancel-rel]');
  await page.waitForTimeout(150);

  // --- Migration: pre-existing lien-shaped Assignment/Loan Mod Agreement records get moved into Related Documents ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDASG', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: {
        effectiveDate: '2021-01-01',
        securityInstruments: [
          { id: 'si-old-1', instrumentType: 'Deed of Trust', datedDate: '', recordedDate: '2019-01-01', mortgagor: 'Legacy Borrower', mortgagee: 'Legacy Lender', consideration: '', book: '900', page: '10', instrumentNumber: 'OLD-SI-01', trustee: '', related: [] }
        ],
        liens: [
          // Matches the SI above by book/page -- should migrate
          { id: 'oldlien-asg', lienType: 'Assignment', debtor: '', creditor: '', datedDate: '', filedDate: '', court: '', caseNumber: '', taxingAuthority: '', taxType: '', hoaCompany: '', materialman: '', lastServiceDate: '', recordedDate: '2020-02-01', plaintiff: '', defendant: '', effectiveDate: '2020-01-15', assignor: 'Legacy Lender', assignee: 'New Servicer', book: '', page: '', instrumentNumber: '', affectsBook: '900', affectsPage: '10', affectsInstrumentNumber: '', certificateId: '', redemptionExpiration: '', amount: '' },
          // Does NOT match any SI -- should be left in place, not dropped
          { id: 'oldlien-orphan', lienType: 'Loan Modification Agreement', debtor: '', creditor: '', datedDate: '', filedDate: '', court: '', caseNumber: '', taxingAuthority: '', taxType: '', hoaCompany: '', materialman: '', lastServiceDate: '', recordedDate: '2020-03-01', plaintiff: '', defendant: '', effectiveDate: '', assignor: '', assignee: '', book: '', page: '', instrumentNumber: '', affectsBook: '999', affectsPage: '99', affectsInstrumentNumber: '', certificateId: '', redemptionExpiration: '', amount: '' }
        ],
        exceptionMatters: []
      }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDASG');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order Prelim renders w/o crash?', !panelText.includes('Something went wrong'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const migratedSi = saved.prelim.securityInstruments[0];
  console.log('Matched Assignment lien migrated into the SI\'s related documents?', migratedSi.related.length === 1 && migratedSi.related[0].type === 'Assignment');
  console.log('Migrated related doc carries assignor/assignee/dates?', migratedSi.related[0].assignor === 'Legacy Lender' && migratedSi.related[0].assignee === 'New Servicer' && migratedSi.related[0].recordedDate === '2020-02-01');
  console.log('Migrated lien removed from pr.liens?', saved.prelim.liens.filter(l => l.id === 'oldlien-asg').length === 0);
  console.log('Unmatched (orphan) legacy lien left in place, not dropped?', saved.prelim.liens.filter(l => l.id === 'oldlien-orphan').length === 1);

  // ============ Part 2: Schedule A per-policy blocks ============

  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // --- None: neither policy card shows ---
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Policy Type None: no Owner\'s Policy card?', !panelText.includes("Owner's Policy"));
  console.log('Policy Type None: no Loan Policy card?', !panelText.includes('Loan Policy'));
  console.log('Policy Type None: shows hint to set Policy Type on Order Entry?', panelText.includes('Set a Policy Type'));

  // --- Owner's only ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Policy Type Owner\'s: Owner\'s Policy card shows?', panelText.includes("Owner's Policy"));
  console.log('Policy Type Owner\'s: Loan Policy card fields do NOT render?', !(await page.$('#sa-loanProposedInsured')) && !(await page.$('#sa-loanPolicyType')));
  console.log('Policy Type Owner\'s: no Mortgagee Clause field (Loan-only concept)?', !(await page.$('#sa-loanMortgageeClause')));
  console.log('Owner\'s Policy ALTA Form auto-suggested?', !!(await page.$eval('#sa-ownerPolicyType', el => el.value === "ALTA Owner's Policy")));

  // --- Loan only ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Loan');
  await page.waitForTimeout(150);
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Policy Type Loan: Loan Policy card shows?', panelText.includes('Loan Policy'));
  console.log('Policy Type Loan: Owner\'s Policy card fields do NOT render?', !(await page.$('#sa-ownerProposedInsured')) && !(await page.$('#sa-ownerPolicyType')));
  console.log('Policy Type Loan: Mortgagee Clause field present?', !!(await page.$('#sa-loanMortgageeClause')));
  console.log('Loan Policy ALTA Form auto-suggested?', !!(await page.$eval('#sa-loanPolicyType', el => el.value === "ALTA Loan Policy")));

  // --- Simultaneous: both, independently confirmable ---
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(150);
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  await page.fill('#sa-ownerProposedInsured', 'Jane Buyer');
  await page.fill('#sa-ownerCoverageAmount', '400000');
  await page.fill('#sa-loanProposedInsured', 'Big Bank NA');
  await page.fill('#sa-loanCoverageAmount', '320000');
  await page.click('body');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Simultaneous: Owner and Loan proposed insured/coverage independently confirmed?',
    saved.commitment.scheduleA.ownerPolicy.proposedInsured === 'Jane Buyer' && saved.commitment.scheduleA.ownerPolicy.coverageAmount === '400000' &&
    saved.commitment.scheduleA.loanPolicy.proposedInsured === 'Big Bank NA' && saved.commitment.scheduleA.loanPolicy.coverageAmount === '320000');

  // --- Generated doc reflects Simultaneous: both blocks present, distinctly labeled ---
  await page.click('[data-tab="property"]');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 1, Block 2');
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '1 Main St');
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-08-01');
  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  await page.click('#btn-generate');
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Generated doc shows Owner\'s Policy — Proposed Insured line?', panelText.includes("Owner's Policy") && panelText.includes('Jane Buyer'));
  console.log('Generated doc shows Loan Policy — Proposed Insured line?', panelText.includes('Loan Policy') && panelText.includes('Big Bank NA'));
  console.log('Generated doc shows both Coverage Amounts formatted?', panelText.includes('$400,000.00') && panelText.includes('$320,000.00'));

  console.log('ERRORS:', errors);
  await browser.close();
})();
