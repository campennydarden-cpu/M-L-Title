const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goEntry = () => page.click('[data-tab="entry"]');
  const goContacts = () => page.click('[data-tab="contacts"]');
  const goProperty = () => page.click('[data-tab="property"]');
  const goDeed = () => page.click('[data-tab="docPrepDeed"]');

  async function addContact(role, name, fillExtra){
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', role);
    await page.waitForTimeout(150);
    await page.fill('#cd-name', name);
    if (fillExtra) await fillExtra();
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
  await page.fill('#f-propertyAddress', '1421 Cypress Bend Ct.');
  await page.fill('#f-city', 'Charlotte');
  await page.fill('#f-stateCode', 'NC');
  await page.fill('#f-zip', '28277');
  await page.selectOption('#f-transactionType', 'Purchase');
  await page.fill('#f-purchasePrice', '300000');
  await page.waitForTimeout(150);

  await goContacts();
  await page.waitForTimeout(150);
  // Attorney with single "address" field
  await addContact('Attorney', 'Andy Attorney', async () => {
    await page.fill('#cd-address', '100 Main St, Suite 200, Charlotte, NC 28202');
  });
  // Seller with only currentAddress set (no explicit "address" field for this role)
  await addContact('Seller', 'Sam Seller', async () => {
    await page.fill('#cd-currentAddress', '55 Oak Ave, Charlotte, NC 28203');
    await page.fill('#cd-forwardingAddress', '77 Pine Rd, Charlotte, NC 28204');
  });
  await addContact('Buyer/Borrower', 'Bob Buyer');

  await goDeed();
  await page.waitForTimeout(200);
  console.log('No page errors on Deed screen?', errors.length === 0);

  // --- Prepared By preview: name + address ---
  await page.selectOption('#dp-deed-preparedById', { label: 'Andy Attorney (Attorney)' });
  await page.waitForTimeout(150);
  let previewText = await page.textContent('#dp-deed-preparedby-preview');
  console.log('Prepared By preview shows name?', previewText.includes('Andy Attorney'));
  console.log('Prepared By preview shows address field?', previewText.includes('100 Main St, Suite 200, Charlotte, NC 28202'));

  // --- Return To preview: single contact, prefers forwarding address ---
  await page.selectOption('#dp-deed-returnToId', { label: 'Sam Seller (Seller)' });
  await page.waitForTimeout(150);
  previewText = await page.textContent('#dp-deed-returnto-preview');
  console.log('Return To preview shows Sam Seller name?', previewText.includes('Sam Seller'));
  console.log('Return To preview prefers Forwarding Address over Current Address?', previewText.includes('77 Pine Rd') && !previewText.includes('55 Oak Ave'));

  // --- Return To preview: role group, no address on file -> graceful message ---
  await page.selectOption('#dp-deed-returnToId', { label: 'All Buyer/Borrower' });
  await page.waitForTimeout(150);
  previewText = await page.textContent('#dp-deed-returnto-preview');
  console.log('Return To role-group preview shows Bob Buyer?', previewText.includes('Bob Buyer'));
  console.log('Return To role-group preview shows "no address on file" (Bob has none)?', previewText.includes('no address on file'));

  // --- Persisted correctly ---
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('preparedById saved as Andy Attorney contact id?', saved.docPrep.deed.preparedById === saved.contacts.filter(c=>c.name==='Andy Attorney')[0].id);
  console.log('returnToId saved as role token?', saved.docPrep.deed.returnToId === 'role:Buyer/Borrower');

  // --- Situs Address includes street + city/state/zip (independently-editable field, auto-filled once) ---
  let situsVal = await page.inputValue('#dp-deed-situsAddress');
  console.log('Situs Address shows street?', situsVal.includes('1421 Cypress Bend Ct.'));
  console.log('Situs Address shows city/state/zip?', situsVal.includes('Charlotte, NC 28277'));

  // --- Situs Address auto-fills once; a later Property screen edit needs an explicit Refill ---
  await goProperty();
  await page.waitForTimeout(150);
  await page.fill('#p-city', 'Matthews');
  await page.fill('#p-zip', '28105');
  await page.waitForTimeout(150);
  await goDeed();
  await page.waitForTimeout(150);
  situsVal = await page.inputValue('#dp-deed-situsAddress');
  console.log('Situs Address NOT auto-clobbered by later Property edit (independently editable)?', situsVal.includes('Charlotte, NC 28277'));
  await page.click('#btn-refill-deed-situs');
  await page.waitForTimeout(150);
  situsVal = await page.inputValue('#dp-deed-situsAddress');
  console.log('Refill from Order Entry / Property picks up Property screen edit (Matthews, 28105)?', situsVal.includes('Matthews, NC 28105'));
  console.log('Order Entry city unaffected by Property screen edit?', await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0].city) === 'Charlotte');

  console.log('ERRORS:', errors);
  await browser.close();
})();
