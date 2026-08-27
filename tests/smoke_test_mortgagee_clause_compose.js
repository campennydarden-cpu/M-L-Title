const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

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

  // Deterministic flush hook (test-harness only, not shipped app code): save() now debounces
  // its localStorage write, so a read immediately after typing/clicking can otherwise race a
  // still-pending write. Patching getItem to flush first (via the app's exposed
  // window.__genesisFlushSave) makes every existing localStorage.getItem(...) read in this suite
  // deterministic without having to touch each read site individually. saveNow() itself already
  // no-ops this flush when there's nothing pending and a load error is unresolved, so this is safe
  // even for the corrupted-load-must-not-be-overwritten checks in smoke_test_backup_restore.js.
  // Pre-seed the "demo already seeded" flag via addInitScript (runs before genesis-app's own
  // script, on every navigation of this page) instead of the old clear()-then-reload() dance.
  // save()'s new beforeunload/visibilitychange flush hooks mean that dance is no longer reliable:
  // this is the FIRST-ever load for a fresh browser context (browser.newPage() creates an isolated
  // context each time), so with no flag yet present, load() auto-seeds a demo order and schedules
  // a debounced save; localStorage.clear() then wipes the flag from disk but NOT the demo order
  // still sitting in state.orders, and the very next reload's beforeunload flush faithfully (if
  // unhelpfully, here) writes that in-memory demo order straight back -- leaving a stray
  // "GEN-DEMO-1001" order alongside whatever this test creates instead of a clean slate. Setting
  // the flag before the app ever boots avoids the demo seed entirely, so there's nothing to race.
  await page.addInitScript(() => { localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
  await page.goto(APP);
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
