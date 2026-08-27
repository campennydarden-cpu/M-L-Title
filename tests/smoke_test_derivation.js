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

  // Trustee(s) show up in the Vested In / vesting-clause preview (dv-vesting-preview),
  // which is entity-qualified-name-only (name + entityType + principals). The other preview
  // box, dv-clause-preview, is the FULL legal derivation sentence and additionally requires
  // Instrument Type, Grantor, Recorded Date, and Property > County -- none of which this test
  // sets up, so it deliberately checks the vesting preview instead.
  const preview1 = await page.textContent('#dv-vesting-preview');
  console.log('Derivation clause picks up Trustee?', preview1.includes('Trudy Trustee') && preview1.includes('Smith Family Trust'));
  console.log('Trustee roster visible on derivation card?', !!(await page.$('[data-del-dvp]')));

  // Manually add another trustee directly on derivation (independent of contact)
  await page.fill('#dvp-name', 'Co-Trustee Carl');
  await page.click('#btn-add-dvp');
  await page.waitForTimeout(150);
  const preview2 = await page.textContent('#dv-vesting-preview');
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

  // Lien with type -- Tax Lien has its own field set (debtor, taxingAuthority, taxType,
  // filedDate, amount, book, page, instrumentNumber), distinct from the generic default
  // (which has datedDate/court/caseNumber/creditor instead). Selecting the type swaps
  // #lien-fields' contents live, so the fields filled below must match Tax Lien's actual set.
  await page.selectOption('#lien-lienType', 'Tax Lien');
  await page.waitForTimeout(100);
  await page.fill('#lien-debtor', 'John Doe');
  await page.fill('#lien-taxingAuthority', 'NC Dept of Revenue');
  await page.fill('#lien-filedDate', '2019-06-15');
  await page.fill('#lien-amount', '4500');
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
