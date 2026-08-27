// Covers the Bill Code "validated pattern" conversion: Bill Code (repeated at 8 render sites
// across Title Insurance Premiums, Endorsements, Additional Title/Escrow Charges, and Recording)
// is no longer unconstrained free text -- every setter now runs input through sanitizeBillCode()
// (uppercase, strip anything outside [A-Z0-9-], cap at 12 chars) before it's stored, silently
// normalizing on save rather than blocking entry (this app has no field-validation-error UI).
// Exercises two of the eight sites end-to-end: Title Insurance Premiums' Owner's Policy Bill Code
// (bindText-driven) and Additional Title/Escrow Charges' Bill Code (direct input/change-listener
// driven) -- different wiring styles, so covering both is a reasonable proxy for the rest.
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

  // Deterministic flush hook (test-harness only, not shipped app code) -- see other smoke tests
  // in this suite for the full rationale (save() debounces its localStorage write).
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

  // Simultaneous policy type so both Owner's and Loan Policy Premium cards render.
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.selectOption('#f-policyType', 'Simultaneous');
  await page.waitForTimeout(100);

  // Sets an input's value directly via JS and dispatches an `input` event -- bypasses the
  // browser's native maxlength=12 enforcement (which only applies to real keystrokes/paste, not
  // a JS-set .value), so this genuinely exercises sanitizeBillCode()'s own slice(0,12) truncation
  // rather than relying on the HTML attribute to do that job.
  async function setRaw(id, value){
    await page.evaluate(([elId, v]) => {
      var el = document.getElementById(elId);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, value]);
    await page.waitForTimeout(150);
  }

  // ============ Title Insurance Premiums: Owner's Policy Bill Code (bindText-driven) ============
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  console.log('Bill Code input is auto-uppercase styled (bill-code-input class)?', await page.locator('#tp-owner-billCode').evaluate(el => el.classList.contains('bill-code-input')));
  console.log('Bill Code input has maxlength=12?', await page.locator('#tp-owner-billCode').getAttribute('maxlength') === '12');

  await setRaw('tp-owner-billCode', 'tp-owner 1!');
  let o = await getOrder();
  console.log('Owner Bill Code: lowercase/mixed input with invalid chars uppercased+stripped?', o.titlePremiums.ownerPolicy.billCode === 'TP-OWNER1');

  await setRaw('tp-owner-billCode', 'abcdefghijklmnop');
  o = await getOrder();
  console.log('Owner Bill Code: over-12-char input truncated to 12?', o.titlePremiums.ownerPolicy.billCode === 'ABCDEFGHIJKL' && o.titlePremiums.ownerPolicy.billCode.length === 12);

  // Persists correctly through a full page reload (reads back from localStorage, not live state).
  // A reload drops back to the order list, so reopen the order before re-navigating to a tab.
  await page.reload();
  await page.waitForTimeout(300);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  console.log('Owner Bill Code sanitized value survives save+reload?', o.titlePremiums.ownerPolicy.billCode === 'ABCDEFGHIJKL');

  // ============ Additional Title/Escrow Charges: Bill Code (direct input/change listener) ============
  await goTab('escrowCharges');
  await page.waitForTimeout(150);
  await page.click('#btn-add-charge');
  await page.waitForTimeout(150);
  o = await getOrder();
  let chg = o.escrow.charges[0];
  console.log('Charge Bill Code input is auto-uppercase styled?', await page.locator(`#chg-billcode-${chg.id}`).evaluate(el => el.classList.contains('bill-code-input')));

  await setRaw(`chg-billcode-${chg.id}`, 'tp-owner 1!');
  o = await getOrder();
  chg = o.escrow.charges[0];
  console.log('Charge Bill Code: lowercase/mixed input with invalid chars uppercased+stripped?', chg.billCode === 'TP-OWNER1');

  await setRaw(`chg-billcode-${chg.id}`, 'abcdefghijklmnop');
  o = await getOrder();
  chg = o.escrow.charges[0];
  console.log('Charge Bill Code: over-12-char input truncated to 12?', chg.billCode === 'ABCDEFGHIJKL' && chg.billCode.length === 12);

  await page.reload();
  await page.waitForTimeout(300);
  await page.click('.order-item');
  await page.waitForTimeout(150);
  o = await getOrder();
  chg = o.escrow.charges[0];
  console.log('Charge Bill Code sanitized value survives save+reload?', chg.billCode === 'ABCDEFGHIJKL');

  // Empty Bill Code stays valid/empty (optional field, not force-filled).
  await goTab('titlePremiums');
  await page.waitForTimeout(150);
  await setRaw('tp-loan-billCode', '');
  o = await getOrder();
  console.log('Empty Bill Code stays empty (field is optional)?', o.titlePremiums.loanPolicy.billCode === '');

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
