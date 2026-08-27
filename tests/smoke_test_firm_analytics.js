// Covers the 2026-08-26 "Firm Analytics" screen -- a new cross-file rollup reached from a
// sidebar button (independent of any single order), computed purely from data Genesis already
// captures (o.createdAt, each order's own File History status-change entries, and live
// Requirement/Exception dispositions). Three sections: cycle time by Title Status, curative
// disposition patterns + resolution time, and a change-driver breakdown by History section
// (plus a reopened-after-finalized tally). No new persisted schema.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGE ERROR:', err.message); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push('console: ' + msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
  const APP = require('url').pathToFileURL(require('path').join(__dirname, '..', 'genesis-app.html')).href;

  const goTab = (k) => page.click(`[data-tab="${k}"]`);

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('genesis_demo_seeded_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(200);

  // ============ Empty state, before any order exists ============
  await page.click('#btn-firm-analytics');
  await page.waitForTimeout(150);
  let panelText = await page.textContent('main');
  console.log('Empty-firm state shows "No files yet"?', panelText.includes('No files yet'));
  console.log('Section nav hidden while in Firm Analytics?', (await page.locator('.section-nav').count()) === 0);

  // Toggle off, back to normal (still no order, so "No order open" welcome screen)
  await page.click('#btn-firm-analytics');
  await page.waitForTimeout(150);
  panelText = await page.textContent('main');
  console.log('Toggling off Firm Analytics returns to normal view?', panelText.includes('No order open'));

  // ============ Build order A: status transitions + curative + reopen ============
  await page.click('#btn-new-order');
  await page.waitForTimeout(150);
  await goTab('orderInfo');
  await page.waitForTimeout(150);
  await page.selectOption('#title-status-select', 'Exam');
  await page.waitForTimeout(100);
  await page.selectOption('#title-status-select', 'Curative');
  await page.waitForTimeout(100);

  // Generate Commitment needs Property Address, Legal Description, and Effective Date on file.
  await goTab('entry');
  await page.waitForTimeout(150);
  await page.fill('#f-propertyAddress', '100 Test Lane');
  await page.locator('#f-propertyAddress').blur();
  await page.waitForTimeout(100);
  await goTab('property');
  await page.waitForTimeout(150);
  await page.click('[data-subtab="legal"]');
  await page.waitForTimeout(100);
  await page.fill('#p-legalDescription', 'Lot 1, Test Subdivision');
  await page.locator('#p-legalDescription').blur();
  await page.waitForTimeout(100);
  await goTab('prelim');
  await page.waitForTimeout(150);
  await page.fill('#pr-effectiveDate', '2026-01-01');
  await page.locator('#pr-effectiveDate').blur();
  await page.waitForTimeout(100);

  await goTab('commitment');
  await page.waitForTimeout(150);
  await page.fill('#req-description', 'Pay off first mortgage');
  await page.click('#btn-add-req');
  await page.waitForTimeout(150);
  await page.fill('#exc-description', 'Standard exception for taxes');
  await page.click('#btn-add-exc');
  await page.waitForTimeout(150);

  // Curative only unlocks once the Commitment is generated AND finalized.
  await page.click('#btn-generate');
  await page.waitForTimeout(150);
  await page.click('#btn-finalize-commitment');
  await page.waitForTimeout(100);
  await page.click('#btn-confirm-finalize');
  await page.waitForTimeout(150);

  await goTab('curative');
  await page.waitForTimeout(150);
  await page.selectOption('[data-req-disposition]', 'Satisfied');
  await page.waitForTimeout(100);
  await page.selectOption('[data-exc-disposition]', 'Waived');
  await page.waitForTimeout(150);

  // Revert to draft -- exercises the "reopened after finalized" tally
  await goTab('commitment');
  await page.waitForTimeout(150);
  await page.click('#btn-unfinalize-commitment');
  await page.waitForTimeout(100);
  await page.click('#btn-confirm-unfinalize');
  await page.waitForTimeout(150);

  // ============ Order B: left at default status (an "ongoing" period) ============
  await page.click('#btn-new-order');
  await page.waitForTimeout(150);

  // ============ Open Firm Analytics and check all three sections ============
  await page.click('#btn-firm-analytics');
  await page.waitForTimeout(200);
  panelText = await page.textContent('main');

  console.log('Firm Analytics button shows active while open?', await page.evaluate(() => {
    const btn = document.getElementById('btn-firm-analytics');
    return btn && btn.style.background !== '';
  }));
  console.log('Cycle Time card renders?', panelText.includes('Cycle Time by Title Status'));
  console.log('Cycle Time shows 2 files?', panelText.includes('2 files'));
  console.log('Exam status row present (a completed period)?', panelText.includes('Exam'));
  console.log('Curative status row present (currently-in-status, ongoing)?', panelText.includes('Curative'));
  console.log('In Progress shows an ongoing file (order B never left it)?', panelText.includes('currently here'));

  console.log('Curative Patterns card renders?', panelText.includes('Curative Patterns'));
  console.log('Satisfied disposition counted?', panelText.includes('Satisfied'));
  console.log('Waived disposition counted?', panelText.includes('Waived'));
  console.log('Resolution-time sample reported?', panelText.includes('average time from an item being added'));

  console.log('Change-driver card renders?', panelText.includes('What’s Driving Changes'));
  console.log('Order Entry section counted among drivers?', panelText.includes('Order Entry'));
  console.log('Reopened-after-finalized tally shown?', panelText.includes('Reopened-after-finalized events'));
  console.log('Commitment Reverted to Draft counted once?', /Commitment Reverted to Draft:\s*<strong>1<\/strong>|Commitment Reverted to Draft: 1/.test(await page.evaluate(() => document.querySelector('main').innerHTML)));

  // ============ Sidebar order click exits Firm Analytics ============
  await page.click('.order-item');
  await page.waitForTimeout(150);
  console.log('Clicking an order in the sidebar exits Firm Analytics (section nav back)?', (await page.locator('.section-nav').count()) === 1);
  console.log('Firm Analytics sidebar item no longer marked active?', await page.evaluate(() => {
    const btn = document.getElementById('btn-firm-analytics');
    return btn && !btn.style.background;
  }));

  console.log('\nPage errors:', errors.length === 0 ? 'none' : errors);

  await browser.close();
})();
