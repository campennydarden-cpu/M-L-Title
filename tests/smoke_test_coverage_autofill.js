const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goEntry = () => page.click('[data-tab="entry"]');
  const goScheduleA = () => page.click('[data-tab="scheduleA"]');

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

  // --- Scenario 1: Simultaneous policy, Purchase Price + Loan Amount both set ---
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '350000');
  await page.fill('#f-loanAmount', '280000');
  await page.waitForTimeout(150);

  await goScheduleA();
  await page.waitForTimeout(200);
  let ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  let loanVal = await page.inputValue('#sa-loanCoverageAmount');
  console.log('Owner Coverage Amount auto-filled from Purchase Price?', ownerVal === '350000');
  console.log('Loan Coverage Amount auto-filled from Loan Amount?', loanVal === '280000');

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].commitment.scheduleA);
  console.log('Saved ownerPolicy.coverageAmount = 350000?', saved.ownerPolicy.coverageAmount === '350000');
  console.log('Saved loanPolicy.coverageAmount = 280000?', saved.loanPolicy.coverageAmount === '280000');

  // --- Scenario 2: manual edit is never overwritten by re-visiting the tab ---
  await page.fill('#sa-ownerCoverageAmount', '360000');
  await page.waitForTimeout(150);
  await goEntry();
  await page.waitForTimeout(150);
  await goScheduleA();
  await page.waitForTimeout(200);
  ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  console.log('Manual override on Owner Coverage Amount preserved (not reset to Purchase Price)?', ownerVal === '360000');

  // Changing Purchase Price afterward should NOT retroactively change the already-set Coverage Amount
  await goEntry();
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '400000');
  await page.waitForTimeout(150);
  await goScheduleA();
  await page.waitForTimeout(200);
  ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  console.log('Later Purchase Price change does not retroactively overwrite Coverage Amount?', ownerVal === '360000');

  // --- Scenario 3: fresh order, Owner's Policy only -> only Owner Coverage Amount fills ---
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  await goEntry();
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  await page.fill('#f-purchasePrice', '150000');
  await page.waitForTimeout(150);
  await goScheduleA();
  await page.waitForTimeout(200);
  ownerVal = await page.inputValue('#sa-ownerCoverageAmount');
  console.log('Owner-only policy: Owner Coverage Amount auto-fills?', ownerVal === '150000');

  console.log('ERRORS:', errors);
  await browser.close();
})();
