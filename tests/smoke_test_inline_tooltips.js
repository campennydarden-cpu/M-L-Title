// Covers the inline help-tooltip primitive (.help-tip, a small focusable icon using the native
// `title` attribute) added for POC, Pass-Through, Bill Code, Rate Basis, Reissue Rate, and
// Underwriter Split % on the Title Insurance Premiums, Endorsements, and Additional Title/Escrow
// Charges screens. Also regression-tests the bindText() label-purity gotcha: bindText() locates a
// field's label via el.closest(".field").querySelector("label").textContent for File History
// logging, so a help icon placed INSIDE <label>...</label> would corrupt the logged label text
// (e.g. "Bill Code" becoming "Bill Code?"). The icon must be a sibling of <label>, not a child.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);
  const getOrder = () => page.evaluate(() => { if (window.__genesisFlushSave) window.__genesisFlushSave(); return JSON.parse(localStorage.getItem('genesis_orders_v1'))[0]; });

  // Deterministic flush hook (test-harness only, not shipped app code): save() now debounces
  // its localStorage write, so a read immediately after typing/clicking can otherwise race a
  // still-pending write. Patching getItem to flush first (via the app's exposed
  // window.__genesisFlushSave) makes every existing localStorage.getItem(...) read in this suite
  // deterministic without having to touch each read site individually. saveNow() itself already
  // no-ops this flush when there's nothing pending and a load error is unresolved, so this is safe
  // even for the corrupted-load-must-not-be-overwritten checks in smoke_test_backup_restore.js.
  // Pre-seed the "demo already seeded" flag via addInitScript (runs before genesis-app's own
  // script, on every navigation of this page) instead of the old clear()-then-reload() dance.
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
  await page.waitForTimeout(150);

  // Simultaneous policy type -> both Owner's and Loan Policy Premium cards render (more fields
  // to check tooltips on).
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(100);

  // ============ Title Insurance Premiums: Bill Code, Rate Basis, Underwriter Split %, Prior Policy ============
  await goTab('titlePremiums');
  await page.waitForTimeout(150);

  console.log('Bill Code has a help-tip with non-empty title (Owner\'s Policy)?',
    (await page.locator('#tp-owner-billCode').locator('xpath=ancestor::div[contains(@class,"field")][1]//span[contains(@class,"help-tip")]').getAttribute('title') || '').length > 0);
  console.log('Rate Basis has a help-tip with non-empty title (Owner\'s Policy)?',
    (await page.locator('#tp-owner-rateBasis').locator('xpath=ancestor::div[contains(@class,"field")][1]//span[contains(@class,"help-tip")]').getAttribute('title') || '').length > 0);
  console.log('Underwriter Split % has a help-tip with non-empty title?',
    (await page.locator('#tp-underwriterPercent').locator('xpath=ancestor::div[contains(@class,"field")][1]//span[contains(@class,"help-tip")]').getAttribute('title') || '').length > 0);
  console.log('Prior Policy card-title has a help-tip with non-empty title (Reissue Rate explanation)?',
    (await page.locator('.card-title:has-text("Prior Policy")').locator('span.help-tip').getAttribute('title') || '').length > 0);
  console.log('Reissue Rate <option> carries a best-effort title attribute?',
    (await page.locator('#tp-owner-rateBasis option[value="Reissue Rate"]').getAttribute('title') || '').length > 0);

  // --- bindText label-purity regression: Bill Code ---
  await page.fill('#tp-owner-billCode', 'ABC1');
  await page.locator('#tp-owner-billCode').blur();
  await page.waitForTimeout(150);
  let o = await getOrder();
  let billCodeEntries = o.history.filter(h => h.kind === 'changed' && h.label.indexOf('Bill Code') === 0);
  console.log('Bill Code History entry logs label exactly "Bill Code" (not "Bill Code?")?',
    billCodeEntries.length > 0 && billCodeEntries[billCodeEntries.length - 1].label === 'Bill Code');

  // --- bindText label-purity regression: Rate Basis ---
  await page.selectOption('#tp-owner-rateBasis', 'Reissue Rate');
  await page.waitForTimeout(150);
  o = await getOrder();
  let rateBasisEntries = o.history.filter(h => h.kind === 'changed' && h.label.indexOf('Rate Basis') === 0);
  console.log('Rate Basis History entry logs label exactly "Rate Basis" (not "Rate Basis?")?',
    rateBasisEntries.length > 0 && rateBasisEntries[rateBasisEntries.length - 1].label === 'Rate Basis');

  // Also confirm the File History tab itself renders the clean label (belt-and-suspenders on
  // top of the direct o.history check above).
  await goTab('history');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('#tab-panel');
  console.log('File History shows "Bill Code changed" (not "Bill Code? changed")?',
    panelText.includes('Bill Code changed') && !panelText.includes('Bill Code? changed'));
  console.log('File History shows "Rate Basis changed" (not "Rate Basis? changed")?',
    panelText.includes('Rate Basis changed') && !panelText.includes('Rate Basis? changed'));
  await goTab('titlePremiums');
  await page.waitForTimeout(150);

  // ============ Endorsements: Bill Code + Underwriter Split % (override) on the edit form ============
  await goTab('endorsements');
  await page.waitForTimeout(150);
  await page.fill('#end-description', 'Test Endorsement');
  await page.selectOption('#end-appliesTo', "Owner's");
  await page.fill('#end-fee', '10.00');
  await page.click('#btn-add-end');
  await page.waitForTimeout(150);
  await page.click('[data-edit-end]');
  await page.waitForTimeout(150);

  console.log('Endorsement Bill Code has a help-tip with non-empty title?',
    (await page.locator('input[id^="eend-billCode-"]').first().locator('xpath=ancestor::div[contains(@class,"field")][1]//span[contains(@class,"help-tip")]').getAttribute('title') || '').length > 0);
  console.log('Endorsement Underwriter Split % (override) has a help-tip with non-empty title?',
    (await page.locator('input[id^="eend-underwriterSplitPercent-"]').first().locator('xpath=ancestor::div[contains(@class,"field")][1]//span[contains(@class,"help-tip")]').getAttribute('title') || '').length > 0);

  // ============ Additional Title/Escrow Charges: Bill Code, POC, Pass-Through ============
  await goTab('escrowCharges');
  await page.waitForTimeout(150);
  await page.click('#btn-add-charge');
  await page.waitForTimeout(150);
  o = await getOrder();
  let chg = o.escrow.charges[0];
  await page.fill(`#chg-desc-${chg.id}`, 'Wire Fee');
  await page.waitForTimeout(100);

  console.log('Escrow Charge Bill Code has a help-tip with non-empty title?',
    (await page.locator(`#chg-billcode-${chg.id}`).locator('xpath=ancestor::div[contains(@class,"field")][1]//span[contains(@class,"help-tip")]').getAttribute('title') || '').length > 0);

  const passThroughLabel = page.locator(`label:has(input[data-chg-passthrough="${chg.id}"])`);
  const passThroughTip = passThroughLabel.locator('xpath=following-sibling::span[contains(@class,"help-tip")][1]');
  console.log('Pass-Through has a help-tip with non-empty title?', (await passThroughTip.getAttribute('title') || '').length > 0);

  const pocLabel = page.locator(`label:has(input[data-chg-poc="${chg.id}"])`);
  const pocTip = pocLabel.locator('xpath=following-sibling::span[contains(@class,"help-tip")][1]');
  console.log('POC has a help-tip with non-empty title?', (await pocTip.getAttribute('title') || '').length > 0);

  // --- Clicking the Pass-Through help icon must NOT toggle the Pass-Through checkbox ---
  o = await getOrder();
  const passThroughBefore = o.escrow.charges[0].passThrough;
  await passThroughTip.click();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Clicking the Pass-Through help icon does not toggle the checkbox?', o.escrow.charges[0].passThrough === passThroughBefore);

  // --- Same guard for POC, for good measure ---
  const pocBefore = o.escrow.charges[0].poc;
  await pocTip.click();
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Clicking the POC help icon does not toggle the checkbox?', o.escrow.charges[0].poc === pocBefore);

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
