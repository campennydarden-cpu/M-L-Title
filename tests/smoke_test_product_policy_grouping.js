const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

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
  // Deterministic legacy-migration injection helper (test-harness only): this suite writes a
  // legacy-shaped order straight into localStorage, bypassing the running app's in-memory
  // state.orders entirely, then reload()s to exercise normalizeOrder(). But save()'s new
  // beforeunload flush is registered on THIS (about to be replaced) page and still holds the
  // pre-injection state.orders -- reload() fires beforeunload before navigating, so that stale
  // flush would otherwise land AFTER our raw write and silently clobber the legacy JSON we're
  // deliberately injecting. Blocking further writes to the key right after our own write closes
  // that window; the fresh page loaded by reload() gets an unblocked Storage.prototype again.
  await page.addInitScript(() => {
    window.__genesisWriteOrdersRaw = function(orders){
      localStorage.setItem('genesis_orders_v1', JSON.stringify(orders));
      var origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, val){
        if (key === 'genesis_orders_v1') return;
        return origSetItem.call(this, key, val);
      };
    };
  });
  await page.goto(APP);
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);

  // --- New Order Entry fields ---
  let panelText = await page.textContent('#tab-panel');
  console.log('Product Type field present?', !!(await page.$('#f-productType')));
  console.log('Policy Type field present?', !!(await page.$('#f-policyType')));

  const productOptions = await page.$eval('#f-productType', el => Array.from(el.options).map(o => o.value));
  console.log('Product Type options correct?', JSON.stringify(productOptions) === JSON.stringify(["Purchase", "Refinance", "HELOC/HELOAN", "Reverse Mortgage (Refi)", "Cash Purchase", "Reverse Mortgage (Purchase)", "Tract Search"]));

  const policyOptions = await page.$eval('#f-policyType', el => Array.from(el.options).map(o => o.value));
  console.log('Policy Type options correct?', JSON.stringify(policyOptions) === JSON.stringify(["None", "Owner's", "Loan", "Simultaneous"]));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('productType defaults to Purchase?', saved.productType === 'Purchase');
  console.log('policyType defaults to None?', saved.policyType === 'None');

  await page.selectOption('#f-productType', 'HELOC/HELOAN');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('productType saved after change?', saved.productType === 'HELOC/HELOAN');

  // --- Policy Type auto-suggest onto Schedule A (only when that policy block's ALTA Form is blank) ---
  await page.selectOption('#f-policyType', "Owner's");
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('policyType saved after change?', saved.policyType === "Owner's");
  console.log('Schedule A ownerPolicy.policyType auto-suggested to ALTA Owner\'s Policy?', saved.commitment.scheduleA.ownerPolicy.policyType === "ALTA Owner's Policy");

  // Now manually override the Owner's Policy ALTA Form, then change Order Entry Policy Type to Loan -- should NOT clobber the manual override even though the Owner's Policy card is now hidden, and should separately auto-suggest the Loan Policy ALTA Form
  await page.click('[data-tab="scheduleA"]');
  await page.waitForTimeout(150);
  await page.selectOption('#sa-ownerPolicyType', "ALTA Homeowner's Policy");
  await page.waitForTimeout(150);
  await page.click('[data-tab="entry"]');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Loan');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Order Entry policyType updated to Loan?', saved.policyType === 'Loan');
  console.log('Schedule A ownerPolicy.policyType NOT clobbered (still Homeowner\'s, manual override preserved)?', saved.commitment.scheduleA.ownerPolicy.policyType === "ALTA Homeowner's Policy");
  console.log('Schedule A loanPolicy.policyType auto-suggested to ALTA Loan Policy?', saved.commitment.scheduleA.loanPolicy.policyType === "ALTA Loan Policy");

  // --- Section nav grouping ---
  // Softened from exact-array equality: the nav has since grown its own additional flat top-level
  // groups (Doc Prep, Escrow/Closing) beyond General/Title, and the Title group's own tab list has
  // grown too, so a hardcoded full list goes stale every time the nav grows -- check presence/order
  // of what THIS test actually cares about (General/Title still exist, in that relative order;
  // the General group's own 4 tabs are still exactly right) instead.
  const groupLabels = await page.$$eval('.section-nav-group-label', els => els.map(e => e.textContent));
  console.log('General and Title group labels both present, General before Title?', groupLabels.includes('General') && groupLabels.includes('Title') && groupLabels.indexOf('General') < groupLabels.indexOf('Title'));

  const tabLabels = await page.$$eval('.section-tab', els => els.map(e => e.textContent));
  console.log('General group\'s 4 tabs present in order (Order Entry, Order Information, Contacts, Property)?',
    JSON.stringify(tabLabels.slice(0, 4)) === JSON.stringify(["Order Entry", "Order Information", "Contacts", "Property"]));

  // --- Title Insurance Premiums / Endorsements (built out 2026-08-26; see
  // smoke_test_title_premiums_endorsements.js for full field/seed-chip coverage) ---
  await page.click('[data-tab="titlePremiums"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Title Insurance Premiums renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('Title Insurance Premiums shows the Rate Lookup card (no longer a placeholder)?', panelText.includes('Rate Lookup'));

  await page.click('[data-tab="endorsements"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('Endorsements renders w/o error?', !panelText.includes('Something went wrong'));
  console.log('Endorsements shows the Endorsements card (no longer a placeholder)?', panelText.includes('Total Endorsement Fees'));

  // --- Renamed tabs still route correctly ---
  await page.click('[data-tab="prelim"]');
  await page.waitForTimeout(150);
  console.log('Prelim Title Search tab (data-tab=prelim) still renders Prelim screen?', !!(await page.$('#pr-effectiveDate')));

  await page.click('[data-tab="commitment"]');
  await page.waitForTimeout(150);
  console.log('Commitment Sch B-I, B-II tab (data-tab=commitment) still renders Commitment screen?', !!(await page.$('#btn-add-req')));

  // --- File History integration for new fields ---
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(150);
  panelText = await page.textContent('#tab-panel');
  console.log('History logs Product Type change?', panelText.includes('Product Type'));
  console.log('History logs Order Entry Policy Type change?', panelText.includes('Policy Type') && panelText.includes('Loan'));

  // --- Migration test: old order missing productType/policyType ---
  await page.evaluate(() => {
    var old = [{
      id: 'old1', createdAt: new Date().toISOString(), fileNo: 'GEN-OLDPT', titleStatus: 'In Progress',
      transactionType: 'Purchase', propertyAddress: '123 Old St', contacts: [],
      prelim: { effectiveDate: '2021-01-01' }
    }];
    window.__genesisWriteOrdersRaw(old);
  });
  await page.reload();
  await page.waitForTimeout(300);
  const orderRow = await page.$('text=GEN-OLDPT');
  if (orderRow) await orderRow.click();
  await page.waitForTimeout(200);
  panelText = await page.textContent('#tab-panel');
  console.log('Old order renders Order Entry w/o crash?', !panelText.includes('Something went wrong'));
  const savedOld = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('productType backfilled to Purchase?', savedOld.productType === 'Purchase');
  console.log('policyType backfilled to None?', savedOld.policyType === 'None');

  console.log('ERRORS:', errors);
  await browser.close();
})();
