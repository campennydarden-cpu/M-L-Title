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
  const goPrelim = () => page.click('[data-tab="prelimDerivation"]').catch(() => page.click('[data-tab="derivation"]'));
  const goDeed = () => page.click('[data-tab="docPrepDeed"]');
  const goSI = () => page.click('[data-tab="docPrepSI"]');
  const goNotaryAck = () => page.click('[data-tab="docPrepNotaryAck"]');
  const goPoa = () => page.click('[data-tab="docPrepPoa"]');

  async function addContact(role, name, opts){
    opts = opts || {};
    await page.click('#btn-open-new-contact');
    await page.waitForTimeout(150);
    await page.selectOption('#cd-role', role);
    await page.waitForTimeout(150);
    await page.fill('#cd-name', name);
    if(opts.entityType){
      await page.selectOption('#cd-entityType', opts.entityType);
      await page.waitForTimeout(150);
    }
    if(opts.poaEnabled){
      await page.check('#cd-poaEnabled');
      await page.waitForTimeout(150);
      if(opts.poaName) await page.fill('#cd-poaName', opts.poaName);
    }
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
  await page.fill('#f-propertyAddress', '900 Elm St.');
  await page.fill('#f-city', 'Raleigh');
  await page.fill('#f-stateCode', 'NC');
  await page.fill('#f-zip', '27601');
  await page.selectOption('#f-transactionType', 'Purchase');
  await page.fill('#f-purchasePrice', '400000');
  await page.fill('#f-loanAmount', '320000');
  await page.waitForTimeout(150);

  await goProperty();
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(150);
  await page.fill('#p-legalDescription', 'Lot 5, Block 2, Elm Heights Subdivision');
  await page.fill('#p-parcelNumber', 'PIN-778899');
  await page.waitForTimeout(150);

  await goContacts();
  await page.waitForTimeout(150);
  await addContact('Seller', 'Sam Seller', { poaEnabled: true, poaName: 'Pam Poa' });
  await addContact('Buyer/Borrower', 'Bob Buyer');
  await addContact('Lender', 'Big Bank');

  console.log('No page errors after setup?', errors.length === 0);

  // ============ DEED: Legal / Parcel / Derivation / Situs ============
  await goDeed();
  await page.waitForTimeout(200);

  let legalVal = await page.inputValue('#dp-deed-legalText');
  console.log('Deed Legal Description auto-filled from Property?', legalVal.includes('Lot 5, Block 2, Elm Heights Subdivision'));

  let parcelVal = await page.inputValue('#dp-deed-parcelNumber');
  console.log('Deed Parcel auto-filled from Property?', parcelVal === 'PIN-778899');

  let situsVal = await page.inputValue('#dp-deed-situsAddress');
  console.log('Deed Situs Address auto-filled?', situsVal.includes('900 Elm St.') && situsVal.includes('Raleigh, NC 27601'));

  await page.fill('#dp-deed-legalText', 'Custom hand-typed legal description');
  await page.waitForTimeout(150);
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Deed Legal Description independently editable/saved?', saved.docPrep.deed.legalText === 'Custom hand-typed legal description');

  await page.fill('#dp-deed-parcelNumber', 'PIN-CUSTOM');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Deed Parcel independently editable/saved?', saved.docPrep.deed.parcelNumber === 'PIN-CUSTOM');

  // Revisiting the Deed tab should NOT overwrite the manual edits (fill-if-blank only)
  await goEntry(); await page.waitForTimeout(100);
  await goDeed(); await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Deed Legal Description NOT clobbered by revisiting tab?', saved.docPrep.deed.legalText === 'Custom hand-typed legal description');

  // Refill from source overwrites back to computed default
  await page.click('#btn-refill-deed-parcel');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Refill from Property restores computed Parcel?', saved.docPrep.deed.parcelNumber === 'PIN-778899');

  await page.click('#btn-refill-deed-situs');
  await page.waitForTimeout(150);
  await page.fill('#dp-deed-situsAddress', 'HAND EDITED SITUS');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Situs Address independently editable/saved?', saved.docPrep.deed.situsAddress === 'HAND EDITED SITUS');
  await page.click('#btn-refill-deed-situs');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Refill from Order Entry/Property restores computed Situs?', saved.docPrep.deed.situsAddress.includes('900 Elm St.'));

  // ============ SECURITY INSTRUMENT: Mortgagor / Mortgagee / Note ============
  await goSI();
  await page.waitForTimeout(200);
  console.log('No page errors on Security Instrument screen?', errors.length === 0);

  let mortgagorVal = await page.inputValue('#dp-si-mortgagorName');
  console.log('SI Mortgagor auto-filled from sole Buyer/Borrower?', mortgagorVal === 'Bob Buyer');

  let mortgageeVal = await page.inputValue('#dp-si-mortgageeName');
  console.log('SI Mortgagee auto-filled from sole Lender?', mortgageeVal === 'Big Bank');

  // Change Mortgagee entity type independently on this screen -> Corporation roster appears
  await page.selectOption('#dp-si-mortgageeEntityType', 'Corporation');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('SI Mortgagee entity type independently editable (Corporation roster shown)?', panelText.includes('Board / Officers'));

  await page.fill('#dp-si-mortgagorName', 'Bob Buyer, an unmarried man');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('SI Mortgagor independently editable/saved?', saved.docPrep.securityInstrument.mortgagorName === 'Bob Buyer, an unmarried man');

  // Editing Contacts afterward should not flow back
  await goContacts(); await page.waitForTimeout(150);
  await goSI(); await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('SI Mortgagor unchanged after revisiting Contacts?', saved.docPrep.securityInstrument.mortgagorName === 'Bob Buyer, an unmarried man');

  // Copy-in convenience
  await page.selectOption('#dp-si-mortgagorCopySource', { label: 'Bob Buyer' });
  await page.click('#btn-copy-si-mortgagor');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Copy-in from a file contact overwrites SI Mortgagor?', saved.docPrep.securityInstrument.mortgagorName === 'Bob Buyer');

  // Mortgagee principal roster CRUD (siep)
  await page.fill('#siep-name', 'Big Bank Officer');
  await page.selectOption('#siep-role', { index: 0 });
  await page.click('#btn-add-siep');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('SI Mortgagee principal added?', saved.docPrep.securityInstrument.mortgageePrincipals.length === 1 && saved.docPrep.securityInstrument.mortgageePrincipals[0].name === 'Big Bank Officer');

  // Note card: instrument type + loan amount + dated date drive defaults
  await page.selectOption('#dp-si-instrumentType', 'Mortgage');
  await page.fill('#dp-si-datedDate', '2026-09-01');
  await page.waitForTimeout(150);
  let noteAmountVal = await page.inputValue('#dp-si-noteAmount');
  console.log('Note Amount auto-filled from Loan Amount?', noteAmountVal === '320000');
  let noteDateVal = await page.inputValue('#dp-si-noteDate');
  console.log('Note Date auto-filled from Dated Date?', noteDateVal === '2026-09-01');

  await page.fill('#dp-si-maturityDate', '2056-09-01');
  await page.fill('#dp-si-interestRate', '6.25%');
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Maturity Date saved?', saved.docPrep.securityInstrument.maturityDate === '2056-09-01');
  console.log('Interest Rate saved?', saved.docPrep.securityInstrument.interestRate === '6.25%');

  panelText = await page.textContent('#tab-panel');
  console.log('SI Generated Summary reflects independent Mortgagor/Mortgagee names?', panelText.includes('Bob Buyer grants this Mortgage to Big Bank'));

  // ============ NOTARY ACKNOWLEDGEMENT ============
  await goNotaryAck();
  await page.waitForTimeout(200);
  console.log('No page errors on Notary Ack screen?', errors.length === 0);

  let ackTextarea = await page.$('[data-notaryack-text]');
  console.log('Notary Ack textarea present?', !!ackTextarea);
  let ackVal = ackTextarea ? await ackTextarea.inputValue() : '';
  console.log('Notary Ack auto-filled with generated language?', ackVal.includes('personally appeared'));

  if(ackTextarea){
    await ackTextarea.fill('CUSTOM ACK TEXT for this signer');
    await page.waitForTimeout(200);
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
    console.log('Notary Ack text independently editable/saved?', saved.docPrep.notaryAcks.some(a => a.text === 'CUSTOM ACK TEXT for this signer'));

    // Regenerate restores computed default
    await page.click('[data-notaryack-regenerate]');
    await page.waitForTimeout(150);
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
    console.log('Regenerate restores computed acknowledgment text?', saved.docPrep.notaryAcks.some(a => a.text.includes('personally appeared') && !a.text.includes('CUSTOM ACK TEXT')));
  }

  // Signer list still filters live from Contacts -- Sam Seller (POA) should show Pam Poa's name in the generated text
  panelText = await page.textContent('#tab-panel');
  console.log('Notary Ack list still reflects live Contacts (Sam Seller present)?', panelText.includes('Sam Seller'));

  // ============ POWER OF ATTORNEY ============
  await goPoa();
  await page.waitForTimeout(200);
  console.log('No page errors on POA screen?', errors.length === 0);

  let aifVal = await page.inputValue('[data-poa-aif]');
  console.log('POA Attorney-in-Fact Name shows value set on Contact?', aifVal === 'Pam Poa');

  await page.fill('[data-poa-aif]', 'Pam Poa, Esq.');
  await page.locator('[data-poa-aif]').blur();
  await page.waitForTimeout(150);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  const samSeller = saved.contacts.filter(c => c.name === 'Sam Seller')[0];
  console.log('POA Attorney-in-Fact Name editable from Doc Prep, writes to Contact?', samSeller.poaAttorneyInFactName === 'Pam Poa, Esq.');

  // Confirm it round-trips back to the Contact Detail screen's own field
  await goContacts();
  await page.waitForTimeout(150);
  await page.click('[data-open-contact]');
  await page.waitForTimeout(150);
  let cdPoaVal = await page.inputValue('#cd-poaName').catch(() => '');
  console.log('Contact Detail screen reflects the same edit?', cdPoaVal === 'Pam Poa, Esq.');

  // ============ Legacy order migration for all new Item L fields ============
  await page.evaluate(() => {
    var legacy = {
      id: 'legacyL1', transactionType: 'Purchase', purchasePrice: '100000', loanAmount: '80000',
      contacts: [],
      docPrep: {
        deed: { instrumentType: '', consideration: '', datedDate: '', recordedDate: '', book: '', page: '', instrumentNumber: '',
          preparedById: '', returnToId: '', exemptionCode: '', legalAsExhibit: false, subjectTo: [], final: false, finalizedAt: null,
          grantorName: '', grantorEntityType: 'Individual', grantorPrincipals: [], granteeName: '', granteeEntityType: 'Individual', granteePrincipals: [],
          signatureLines: [], notaryBlock: '' },
        securityInstrument: { instrumentType: '', trusteeName: '', loanAmount: '', datedDate: '', recordedDate: '', book: '', page: '', instrumentNumber: '' },
        affidavits: []
      },
      history: []
    };
    localStorage.setItem('genesis_orders_v1', JSON.stringify([legacy]));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]);
  console.log('Legacy migration: deed.legalText backfilled?', migrated.docPrep.deed.legalText === '');
  console.log('Legacy migration: deed.parcelNumber backfilled?', migrated.docPrep.deed.parcelNumber === '');
  console.log('Legacy migration: deed.derivationText backfilled?', migrated.docPrep.deed.derivationText === '');
  console.log('Legacy migration: deed.situsAddress backfilled?', migrated.docPrep.deed.situsAddress === '');
  console.log('Legacy migration: si.mortgagorName backfilled?', migrated.docPrep.securityInstrument.mortgagorName === '');
  console.log('Legacy migration: si.mortgagorPrincipals backfilled as array?', Array.isArray(migrated.docPrep.securityInstrument.mortgagorPrincipals));
  console.log('Legacy migration: si.mortgageeName backfilled?', migrated.docPrep.securityInstrument.mortgageeName === '');
  console.log('Legacy migration: si.noteAmount backfilled?', migrated.docPrep.securityInstrument.noteAmount === '');
  console.log('Legacy migration: si.maturityDate backfilled?', migrated.docPrep.securityInstrument.maturityDate === '');
  console.log('Legacy migration: si.interestRate backfilled?', migrated.docPrep.securityInstrument.interestRate === '');
  console.log('Legacy migration: notaryAcks backfilled as array?', Array.isArray(migrated.docPrep.notaryAcks));

  console.log('ERRORS:', errors);
  await browser.close();
})();
