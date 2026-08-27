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
  await page.goto(APP);
  await page.waitForTimeout(200);
  await page.click('#btn-new-order');
  await page.waitForTimeout(200);
  const contactsTab = await page.$('text=Contacts');
  await contactsTab.click();
  await page.waitForTimeout(200);

  // Vesting cards should be gone
  const bodyInitial = await page.textContent('#tab-panel');
  console.log('Vesting card text absent?', !bodyInitial.includes('Vesting ·') && !bodyInitial.includes('Vesting &middot;'));

  async function addContact(fill) {
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await fill();
    await page.click('#btn-save-contact');
    await page.waitForTimeout(150);
  }

  // --- Buyer/Borrower: full field set incl SSN/DOB for Individual ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Buyer/Borrower');
    await page.fill('#cd-name', 'Alice Buyer');
    const hasEntityType = !!(await page.$('#cd-entityType'));
    console.log('Buyer has Entity Type field?', hasEntityType);
    await page.fill('#cd-phone', '555-1000');
    await page.fill('#cd-email', 'alice@example.com');
    await page.fill('#cd-currentAddress', '1 Current St');
    await page.fill('#cd-mailingAddress', '1 Mailing St');
    await page.fill('#cd-forwardingAddress', '1 Forwarding St');
    const hasSsn = !!(await page.$('#cd-ssn'));
    console.log('Individual Buyer has SSN field?', hasSsn);
    await page.fill('#cd-ssn', '123-45-6789');
    await page.fill('#cd-dob', '1980-01-01');
  });

  // --- Lender: no entity type/marital, has Mortgagee Clause ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Lender');
    await page.fill('#cd-name', 'Big Bank');
    const hasEntityType = !!(await page.$('#cd-entityType'));
    const hasMarital = !!(await page.$('#cd-maritalStatus'));
    console.log('Lender correctly has NO Entity Type field (not a vesting role)?', !hasEntityType);
    console.log('Lender correctly has NO Marital Status field?', !hasMarital);
    const hasMortgagee = !!(await page.$('#cd-mortgageeClause'));
    console.log('Lender has Mortgagee Clause field?', hasMortgagee);
    await page.fill('#cd-mortgageeClause', 'Big Bank ISAOA/ATIMA, PO Box 1');
    await page.fill('#cd-address', '100 Bank Way');
    await page.fill('#cd-phone', '555-2000');
    await page.fill('#cd-email', 'servicing@bigbank.com');
  });

  // --- Title Company: License Number / ALTA ID ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Title Company');
    await page.fill('#cd-name', 'Acme Title Co');
    const hasLicense = !!(await page.$('#cd-licenseNumber'));
    const hasAlta = !!(await page.$('#cd-altaId'));
    console.log('Title Company has License Number field?', hasLicense);
    console.log('Title Company has ALTA ID field?', hasAlta);
    await page.fill('#cd-licenseNumber', 'LIC-9988');
    await page.fill('#cd-altaId', 'ALTA-1234');
    await page.fill('#cd-address', '200 Title Ave');
  });

  // --- Settlement Agent: same field set as Title Company ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Settlement Agent');
    await page.fill('#cd-name', 'Sam Settler');
    const hasLicense = !!(await page.$('#cd-licenseNumber'));
    console.log('Settlement Agent has License Number field?', hasLicense);
    await page.fill('#cd-licenseNumber', 'LIC-5555');
  });

  // --- Attorney: baseline address/phone/email only ---
  await addContact(async () => {
    await page.selectOption('#cd-role', 'Attorney');
    await page.fill('#cd-name', 'Pat Attorney');
    const hasEntityType = !!(await page.$('#cd-entityType'));
    const hasAddress = !!(await page.$('#cd-address'));
    const hasLicense = !!(await page.$('#cd-licenseNumber'));
    console.log('Attorney correctly has NO Entity Type field (not a vesting role)?', !hasEntityType);
    console.log('Attorney has baseline Address field?', hasAddress);
    console.log('Attorney correctly has NO License Number field?', !hasLicense);
  });

  const allContacts = await page.evaluate(() => {
    var data = JSON.parse(localStorage.getItem('genesis_orders_v1'));
    return data[0].contacts;
  });
  console.log('ALL CONTACTS:', JSON.stringify(allContacts, null, 2));
  console.log('PAGE ERRORS:', errors);
  console.log('btn-open-new-contact visible at end?', !!(await page.$('#btn-open-new-contact')));

  await browser.close();
})();
