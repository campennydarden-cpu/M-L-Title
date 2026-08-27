const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  await page.goto(APP);
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLD', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: {
        effectiveDate: '2021-01-01',
        derivation: 'John Doe, a married person',
        mortgages: [{ id: 'm1', lender: 'Old Bank', amount: '100000', recordedDate: '2015-05-05' }],
        otherLiens: [{ id: 'l1', description: 'Judgment lien, Case No. 22-CV-104' }],
        // simulate a mid-migration state from last turn (already has securityInstruments/judgments but not liens/exceptionMatters)
        securityInstruments: [{ id: 'si1', datedDate: '', recordedDate: '2015-05-05', mortgagor: '', mortgagee: 'Old Bank', consideration: '100000', book: '', page: '', instrumentNumber: '' }],
        judgments: [{ id: 'j1', datedDate: '', filedDate: '', court: '', caseNumber: '', debtor: '', creditor: '', legacyDescription: 'Judgment lien, Case No. 22-CV-104' }],
        commencements: [{ id: 'c1', datedDate: '2018-01-01', recordedDate: '2018-01-05', owner: 'John Doe', contractor: 'Old Builders', book: '', page: '', instrumentNumber: '' }]
      }
    }];
    localStorage.setItem('genesis_orders_v1', JSON.stringify(old));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLD');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  const prelimTab = await page.$('[data-tab="prelim"]');
  await prelimTab.click();
  await page.waitForTimeout(200);

  const panelText = await page.textContent('#tab-panel');
  console.log('No error card?', !panelText.includes('Something went wrong'));
  console.log('Security instrument (from old mortgage) shows Old Bank as mortgagee?', panelText.includes('Old Bank'));
  console.log('Lien (from old judgment) shows legacy description?', panelText.includes('Judgment lien, Case No. 22-CV-104'));
  console.log('Derivation note field carries forward old string?', await page.inputValue('#dv-note').then(v => v.includes('John Doe, a married person')));
  console.log('No Notices of Commencement card (dropped feature)?', !panelText.includes('Notices of Commencement'));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim);
  console.log('derivation is now an object?', typeof saved.derivation === 'object');
  console.log('liens array populated from judgments?', saved.liens.length === 1 && saved.liens[0].legacyDescription.includes('Judgment lien'));
  console.log('securityInstruments items backfilled with instrumentType/trustee/related?', saved.securityInstruments[0].instrumentType === '' && saved.securityInstruments[0].trustee === '' && Array.isArray(saved.securityInstruments[0].related));

  console.log('ERRORS:', errors);

  await browser.close();
})();
