const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';

  const goEntry = () => page.click('[data-tab="entry"]');
  const goContacts = () => page.click('[data-tab="contacts"]');
  const goScheduleA = () => page.click('[data-tab="scheduleA"]');

  async function addLender(name, address, mortgageeClauseOverride){
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', 'Lender');
    await page.fill('#cd-name', name);
    if(address !== undefined) await page.fill('#cd-address', address);
    if(mortgageeClauseOverride !== undefined) await page.fill('#cd-mortgageeClause', mortgageeClauseOverride);
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Loan');
  await page.waitForTimeout(150);

  // --- Scenario 1: Lender with Name + Address, no override -> chip composes Name\nAddress ---
  await goContacts();
  await page.waitForTimeout(150);
  await addLender('First National Bank', '100 Main St, Springfield, IL 62701');

  await goScheduleA();
  await page.waitForTimeout(200);
  const chip1Title = await page.getAttribute('[data-seed-mortgagee-clause]', 'title');
  console.log('Chip preview composes Name + Address?', chip1Title === 'First National Bank\n100 Main St, Springfield, IL 62701');

  await page.click('[data-seed-mortgagee-clause]');
  await page.waitForTimeout(150);
  const mcVal1 = await page.inputValue('#sa-loanMortgageeClause');
  console.log('Clicking chip sets composed Name+Address into field?', mcVal1 === 'First National Bank\n100 Main St, Springfield, IL 62701');

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.scheduleA.loanPolicy.mortgageeClause);
  console.log('Saved composed clause to loanPolicy.mortgageeClause?', saved === 'First National Bank\n100 Main St, Springfield, IL 62701');

  // --- Scenario 2: Lender with a manual override -> override wins over Name+Address ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Loan');
  await page.waitForTimeout(150);
  await goContacts();
  await page.waitForTimeout(150);
  await addLender('Second National Bank', '200 Oak Ave, Chicago, IL 60601', 'Second National Bank ISAOA/ATIMA\nPO Box 999, Chicago, IL 60601');

  await goScheduleA();
  await page.waitForTimeout(200);
  const chip2Title = await page.getAttribute('[data-seed-mortgagee-clause]', 'title');
  console.log('Chip preview uses manual override, not Name+Address?', chip2Title === 'Second National Bank ISAOA/ATIMA\nPO Box 999, Chicago, IL 60601');

  await page.click('[data-seed-mortgagee-clause]');
  await page.waitForTimeout(150);
  const mcVal2 = await page.inputValue('#sa-loanMortgageeClause');
  console.log('Clicking chip sets override text (not Name+Address)?', mcVal2 === 'Second National Bank ISAOA/ATIMA\nPO Box 999, Chicago, IL 60601');

  // --- Scenario 3: Lender with Name only, no address, no override -> chip composes just Name ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Loan');
  await page.waitForTimeout(150);
  await goContacts();
  await page.waitForTimeout(150);
  await addLender('No Address Bank');

  await goScheduleA();
  await page.waitForTimeout(200);
  const chip3Title = await page.getAttribute('[data-seed-mortgagee-clause]', 'title');
  console.log('Chip present and composes just Name when Address blank?', chip3Title === 'No Address Bank');

  // --- Scenario 4: chip now available for EVERY Lender contact, not gated on override being filled (regression on old gating behavior) ---
  const chipCount = (await page.$$('[data-seed-mortgagee-clause]')).length;
  console.log('Exactly 1 chip shown for the 1 Lender on this file?', chipCount === 1);

  console.log('ERRORS:', errors);
  await browser.close();
})();
