const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const APP = 'file:///home/claude/title-escrow-project/genesis-app.html';
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await page.click('[data-tab="entry"]');
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  await page.click('[data-tab="contacts"]');
  await page.waitForTimeout(150);

  async function addContact(role, name, marital, marriedToLabel){
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', role);
    await page.fill('#cd-name', name);
    if(marital) await page.selectOption('#cd-maritalStatus', marital);
    if(marriedToLabel){ await page.waitForTimeout(100); await page.selectOption('#cd-marriedTo', { label: marriedToLabel }); }
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }
  await addContact('Buyer/Borrower', 'Pair Jane', 'Married');
  await addContact('Buyer/Borrower', 'Pair John', 'Married', 'Pair Jane');
  await addContact('Buyer/Borrower', 'Solo Bob', 'Single');

  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(200);
  const allChipText = await page.textContent('[data-seed-owner-insured-all]').catch(()=>'');
  console.log('3-person mixed group chip text:', allChipText);
  await browser.close();
})();
