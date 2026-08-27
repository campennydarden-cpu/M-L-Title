const { chromium } = require('playwright');

// Covers the 2026-08-25 seeded-demo-order fix (Option 3, Outsider finding #3): a truly first-ever
// browser profile (empty localStorage, never seeded before) should get one realistic demo file so a
// cold viewer sees the app's actual depth instead of an empty shell -- and it should never reappear
// once dismissed/deleted, and never touch a profile that already has real orders.

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;
  const STORAGE_KEY = 'genesis_orders_v1';
  const DEMO_KEY = 'genesis_demo_seeded_v1';

  function log(question, val) { console.log(question, val); }

  // ---------- Test A: a truly first-ever load seeds exactly one demo order ----------
  // Deterministic flush hook (test-harness only, not shipped app code): save() now debounces
  // its localStorage write, so a read immediately after typing/clicking can otherwise race a
  // still-pending write. Patching getItem to flush first (via the app's exposed
  // window.__genesisFlushSave) makes every existing localStorage.getItem(...) read in this suite
  // deterministic without having to touch each read site individually. saveNow() itself already
  // no-ops this flush when there's nothing pending and a load error is unresolved, so this is safe
  // even for the corrupted-load-must-not-be-overwritten checks in smoke_test_backup_restore.js.
  await page.addInitScript(() => {
    var origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key){
      if (key === 'genesis_orders_v1' && window.__genesisFlushSave) window.__genesisFlushSave();
      return origGetItem.call(this, key);
    };
  });
  // Deterministic storage-freeze helper (test-harness only): this suite reaches around the app's
  // in-memory state.orders to directly clear/overwrite genesis_orders_v1 and then reload()s to
  // observe how load() reacts to that on-disk state. But save()'s new beforeunload flush is
  // registered on THIS (about to be replaced) page and still holds whatever state.orders was
  // before our direct edit -- reload() fires beforeunload before navigating, so that stale flush
  // would otherwise land AFTER our edit and silently resurrect/overwrite it. Freezing further
  // writes to the key right after our own edit closes that window; the fresh page loaded by
  // reload() gets an unblocked Storage.prototype again.
  await page.addInitScript(() => {
    window.__genesisFreezeStorage = function(){
      var origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, val){
        if (key === 'genesis_orders_v1') return;
        return origSetItem.call(this, key, val);
      };
    };
  });
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); window.__genesisFreezeStorage(); });
  await page.reload();
  await page.waitForTimeout(250);

  const ordersAfterFirstLoad = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), STORAGE_KEY);
  log('First-ever load seeds exactly one order?', ordersAfterFirstLoad.length === 1);
  log('Seeded order has the demo file number?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].fileNo === 'GEN-DEMO-1001');
  log('Seeded order has 5 contacts (2 buyers, seller, lender, settlement agent)?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].contacts.length === 5);
  log('Seeded order has no SSN/DOB on any contact?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].contacts.every(c => !c.ssn && !c.dob));
  log('Seeded order has a generated + finalized Commitment with Clear to Close issued?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].commitment.generated && ordersAfterFirstLoad[0].commitment.final && ordersAfterFirstLoad[0].commitment.ctcIssued);
  const demoFlagSet = await page.evaluate((k) => localStorage.getItem(k), DEMO_KEY);
  log('Demo-seeded flag was set?', demoFlagSet === '1');

  // Title Insurance Premiums, Endorsements, Additional Title/Escrow Charges, and Recording all
  // get realistic seeded data too (2026-08-27 fix) -- previously these four newer screens were
  // left at blankOrder() defaults, so a first click-through hit empty-state cards right after the
  // otherwise fully-populated Commitment/Doc Prep/CDF screens.
  log('Seeded order has an Owner Policy premium?', !!(ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].titlePremiums.ownerPolicy.premium));
  log('Seeded order has at least one misc title fee?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].titlePremiums.miscFees.length >= 1);
  log('Seeded order has at least one endorsement?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].endorsements.length >= 1);
  log('Seeded order has at least one additional title/escrow charge?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].escrow.charges.length >= 1);
  log('Seeded order has at least one recording document?', ordersAfterFirstLoad[0] && ordersAfterFirstLoad[0].escrow.recording.documents.length >= 1);
  log('Seeded order has at least one transfer or stamp tax?', ordersAfterFirstLoad[0] && (ordersAfterFirstLoad[0].escrow.recording.transferTaxes.length + ordersAfterFirstLoad[0].escrow.recording.stampTaxes.length) >= 1);

  // Sidebar should show the seeded order.
  const sidebarShowsDemo = await page.$eval('.order-list', el => el.textContent.indexOf('GEN-DEMO-1001') !== -1).catch(() => false);
  log('Sidebar shows the seeded demo file?', sidebarShowsDemo);

  // UI-level check: opening the seeded demo order and clicking through each of the four newer fee
  // screens should never show an empty-state card ("No ... added yet" / "No ... yet") -- the whole
  // point of seeding realistic data on titlePremiums/endorsements/escrow.charges/escrow.recording.
  await page.click('.order-item');
  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const noEmptyCard = async () => !(await page.$('.empty-card'));
  await goTab('titlePremiums');
  log('Title Insurance Premiums tab shows no empty-state card?', await noEmptyCard());
  await goTab('endorsements');
  log('Endorsements tab shows no empty-state card?', await noEmptyCard());
  await goTab('escrowCharges');
  log('Additional Title/Escrow Charges tab shows no empty-state card?', await noEmptyCard());
  await goTab('escrowRecording');
  log('Recording tab shows no empty-state card?', await noEmptyCard());

  // ---------- Test B: deleting the demo order and reloading does NOT re-seed it ----------
  await page.evaluate((k) => {
    var orders = JSON.parse(localStorage.getItem(k) || '[]');
    localStorage.setItem(k, JSON.stringify(orders.filter(o => o.fileNo !== 'GEN-DEMO-1001')));
    window.__genesisFreezeStorage();
  }, STORAGE_KEY);
  await page.reload();
  await page.waitForTimeout(200);
  const ordersAfterDeleteAndReload = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), STORAGE_KEY);
  log('Demo order does not reappear after being deleted + reloaded?', ordersAfterDeleteAndReload.length === 0);

  // ---------- Test C: a profile that already has real orders (never demo-seeded) is left alone ----------
  // Simulates a user whose data predates this feature: real order data already sitting in
  // localStorage, but the demo-seeded flag was never set (since it didn't exist yet when they
  // started). Written directly rather than via the UI, since going through a real page load on
  // cleared storage would itself trigger the "first-ever load" seed before a real order could be added.
  await page.evaluate((k) => {
    localStorage.clear();
    localStorage.setItem(k, JSON.stringify([{ id: 'pre-existing-1', fileNo: 'GEN-1001', propertyAddress: 'Real User Order, Not A Demo' }]));
    window.__genesisFreezeStorage();
  }, STORAGE_KEY);
  await page.reload();
  await page.waitForTimeout(200);
  const ordersWithRealData = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), STORAGE_KEY);
  log('A profile with pre-existing real orders (no demo flag set) never gets a demo order added alongside it?', ordersWithRealData.length === 1 && ordersWithRealData[0].propertyAddress === 'Real User Order, Not A Demo');

  await browser.close();

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
  }
})();
