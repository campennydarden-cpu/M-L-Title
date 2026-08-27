#!/usr/bin/env node
// Consolidated Genesis regression runner.
//
// Runs every smoke_test_*.js in this directory (each is a self-contained Playwright script
// that launches its own browser against genesis-app.html and prints one console.log line per
// assertion, formatted as "<question ending in ?> true|false"), tallies pass/fail across all
// of them, and prints one summary instead of requiring each script to be run and eyeballed
// by hand. Exits non-zero if anything failed or crashed, so it can gate a publish.
//
// Usage: node tests/run-all.js [--filter=substring] [--concurrency=N]

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const args = process.argv.slice(2);
const filterArg = args.find(a => a.startsWith('--filter='));
const filter = filterArg ? filterArg.slice('--filter='.length) : null;
const concArg = args.find(a => a.startsWith('--concurrency='));
const concurrency = concArg ? parseInt(concArg.slice('--concurrency='.length), 10) : 4;

let files = fs.readdirSync(testDir)
  .filter(f => f.startsWith('smoke_test_') && f.endsWith('.js'))
  .sort();
if (filter) files = files.filter(f => f.includes(filter));

if (files.length === 0) {
  console.log('No matching test files found in', testDir);
  process.exit(1);
}

// An assertion line is a console.log("<label ending in ?>", boolean) call -- Node prints those
// as "<label>? true" / "<label>? false". Requiring a "?" right before the trailing boolean
// avoids false matches on unrelated lines (e.g. JSON.stringify dumps that happen to end in
// "false") that some scripts also print for debugging.
const ASSERTION_RE = /\?\s*(true|false)\s*$/;

function runOne(file) {
  return new Promise((resolve) => {
    const full = path.join(testDir, file);
    const child = spawn('node', [full], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const killTimer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 90000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      const lines = out.split('\n');
      let pass = 0, fail = 0;
      const fileFailures = [];
      lines.forEach((line, i) => {
        const m = line.match(ASSERTION_RE);
        if (m) {
          if (m[1] === 'true') pass++;
          else { fail++; fileFailures.push(line.trim()); }
        }
      });
      // Most scripts print a single summary line like "PAGE ERRORS: []" or "PAGE ERRORS: none"
      // even when nothing went wrong -- only flag it when that line (or a per-error "PAGE
      // ERROR: <message>" line) actually carries content, not just an empty/none summary.
      //
      // Assertion lines are excluded explicitly: several scripts phrase an assertion as
      // "No page errors on <screen>? true", which matches /page error/i but is a *passing*
      // check, not an error. That false positive made four healthy files (deed_addresses,
      // deed_independent, docprep2, item_l) permanently show "PAGE ERRORS" alongside
      // "0 failed". Assertions are already tallied above, so a genuine "? false" there is
      // reported as a real failure -- skipping them here loses no signal.
      const pageErrors = lines.some(l =>
        /page error/i.test(l) &&
        !ASSERTION_RE.test(l) &&
        !/:\s*(\[\]|none)\s*$/i.test(l.trim()));
      // A non-zero exit always means a crash, even if some assertions printed before the crash --
      // a mid-script uncaught exception (e.g. a stale selector further down) silently truncates
      // the rest of that file's assertions, which the old (pass===0 && fail===0) guard missed
      // whenever earlier assertions had already logged successfully.
      const crashed = timedOut || code !== 0;
      resolve({ file, pass, fail, fileFailures, pageErrors, crashed, timedOut, code, tail: lines.slice(-12).join('\n') });
    });
  });
}

async function main() {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const file = files[idx++];
      const r = await runOne(file);
      results.push(r);
      const tag = r.crashed ? 'CRASH' : (r.fail > 0 ? 'FAIL ' : 'ok   ');
      console.log(`${tag} ${file.padEnd(48)} ${r.pass} passed, ${r.fail} failed${r.pageErrors ? ', PAGE ERRORS' : ''}`);
    }
  }
  console.log('='.repeat(78));
  console.log(`Genesis regression suite — running ${files.length} test file(s), concurrency ${concurrency}`);
  console.log('='.repeat(78));
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));

  results.sort((a, b) => a.file.localeCompare(b.file));
  const totalPass = results.reduce((s, r) => s + r.pass, 0);
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const crashes = results.filter(r => r.crashed);
  const failedFiles = results.filter(r => r.fail > 0);

  console.log('-'.repeat(78));
  console.log(`TOTAL: ${totalPass} assertions passed, ${totalFail} failed, ${crashes.length} file(s) crashed, across ${files.length} files`);

  if (failedFiles.length) {
    console.log('\nFailed assertions:');
    failedFiles.forEach(r => {
      console.log('  ' + r.file + ':');
      r.fileFailures.forEach(l => console.log('    ' + l));
    });
  }
  if (crashes.length) {
    console.log('\nCrashed / non-zero-exit test files (likely stale selectors or a real error — inspect manually):');
    crashes.forEach(r => {
      console.log('  ' + r.file + (r.timedOut ? ' (timed out after 90s)' : ' (exit code ' + r.code + ')'));
      console.log('    ...' + r.tail.replace(/\n/g, '\n    '));
    });
  }
  process.exit(totalFail > 0 || crashes.length > 0 ? 1 : 0);
}

main();
