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

  // Add a Trust seller contact with a trustee, to use as "copy from contact" source
  const contactsTab = await page.$('text=Contacts');
  await contactsTab.click();
  await page.waitForTimeout(200);
  await page.click('#btn-open-new-contact');
  await page.waitForTimeout(150);
  await page.selectOption('#cd-role', 'Seller');
  await page.fill('#cd-name', 'The Smith Family Trust');
  await page.selectOption('#cd-entityType', 'Trust');
  await page.waitForTimeout(100);
  await page.fill('#dp-name', 'Trudy Trustee');
  await page.click('#btn-add-draft-principal');
  await page.waitForTimeout(100);
  await page.click('#btn-save-contact');
  await page.waitForTimeout(150);

  const prelimTab = await page.$('[data-tab="prelim"]');
  await prelimTab.click();
  await page.waitForTimeout(200);

  console.log('pr-searchFromTime absent?', !(await page.$('#pr-searchFromTime')));
  console.log('Notices of Commencement card gone?', !(await page.$('text=Notices of Commencement')));

  // Derivation: fill instrument fields
  await page.fill('#dv-datedDate', '2010-04-01');
  await page.fill('#dv-recordedDate', '2010-04-10');
  await page.fill('#dv-book', '1200');
  await page.fill('#dv-page', '55');
  await page.fill('#dv-instrumentNumber', 'INS-2010-777');
  await page.fill('#dv-consideration', '10');
  await page.waitForTimeout(100);

  // Copy from the Trust contact
  await page.selectOption('#dv-copySource', { label: 'The Smith Family Trust' });
  await page.click('#btn-copy-derivation');
  await page.waitForTimeout(150);

  const preview1 = await page.textContent('#dv-clause-preview');
  console.log('Derivation clause picks up Trustee?', preview1.includes('Trudy Trustee') && preview1.includes('Smith Family Trust'));
  console.log('Trustee roster visible on derivation card?', !!(await page.$('[data-del-dvp]')));

  // Manually add another trustee directly on derivation (independent of contact)
  await page.fill('#dvp-name', 'Co-Trustee Carl');
  await page.click('#btn-add-dvp');
  await page.waitForTimeout(150);
  const preview2 = await page.textContent('#dv-clause-preview');
  console.log('Second trustee appended?', preview2.includes('Co-Trustee Carl') && preview2.includes('Trudy Trustee'));

  // Security Instrument with type + trustee + related document
  await page.selectOption('#si-instrumentType', 'Deed of Trust');
  await page.fill('#si-datedDate', '2020-01-05');
  await page.fill('#si-recordedDate', '2020-01-10');
  await page.fill('#si-instrumentNumber', 'INS-2020-0055');
  await page.fill('#si-mortgagor', 'John Doe');
  await page.fill('#si-mortgagee', 'Big Bank NA');
  await page.fill('#si-trustee', 'ABC Title Trustee Services');
  await page.fill('#si-consideration', '250000');
  await page.fill('#si-book', '4021');
  await page.fill('#si-page', '118');
  await page.click('#btn-add-si');
  await page.waitForTimeout(150);

  const panelText1 = await page.textContent('#tab-panel');
  console.log('SI shows type + trustee?', panelText1.includes('Deed of Trust:') && panelText1.includes('ABC Title Trustee Services'));

  // Expand and add a related document
  await page.click('[data-toggle-si]');
  await page.waitForTimeout(150);
  const siId = await page.getAttribute('[data-toggle-si]', 'data-toggle-si');
  await page.selectOption('#rel-type-' + siId, 'Assignment of Beneficial Interest');
  await page.fill('#rel-datedDate-' + siId, '2021-06-01');
  await page.fill('#rel-recordedDate-' + siId, '2021-06-05');
  await page.fill('#rel-instrumentNumber-' + siId, 'INS-2021-9999');
  await page.click('[data-add-rel="' + siId + '"]');
  await page.waitForTimeout(150);

  const panelText2 = await page.textContent('#tab-panel');
  console.log('Related doc visible?', panelText2.includes('Assignment of Beneficial Interest'));

  // Lien with type
  await page.selectOption('#lien-lienType', 'Tax Lien');
  await page.fill('#lien-datedDate', '2019-06-01');
  await page.fill('#lien-filedDate', '2019-06-15');
  await page.fill('#lien-court', 'Wake County');
  await page.fill('#lien-caseNumber', '19-CV-0456');
  await page.fill('#lien-debtor', 'John Doe');
  await page.fill('#lien-creditor', 'NC Dept of Revenue');
  await page.click('#btn-add-lien');
  await page.waitForTimeout(150);

  const panelText3 = await page.textContent('#tab-panel');
  console.log('Lien shows type?', panelText3.includes('Tax Lien:'));

  // Exception Matter
  await page.fill('#em-description', 'Utility easement along rear lot line');
  await page.fill('#em-recordedDate', '2005-03-01');
  await page.fill('#em-book', '900');
  await page.fill('#em-page', '12');
  await page.click('#btn-add-em');
  await page.waitForTimeout(150);

  const panelText4 = await page.textContent('#tab-panel');
  console.log('Exception matter visible?', panelText4.includes('Utility easement along rear lot line'));

  const savedPrelim = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].prelim);
  console.log('SAVED PRELIM:', JSON.stringify(savedPrelim, null, 2));
  console.log('ERRORS:', errors);

  await browser.close();
})();
