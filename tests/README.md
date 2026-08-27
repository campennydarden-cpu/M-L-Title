# Genesis Smoke Tests

This directory contains the Genesis regression test suite — 47 Playwright-based smoke tests covering the core functionality of the Genesis title/escrow application.

## Setup

Install dependencies once from the repo root:

```bash
npm install
```

This installs Playwright (v1.62.0) and its bundled browsers locally. The browsers are cached in `~/.cache/ms-playwright/` and will be reused on subsequent runs.

## Running Tests

### Run all tests

From the repo root:

```bash
npm test
```

Or directly:

```bash
node tests/run-all.js
```

### Filter tests by name

Run only tests matching a substring:

```bash
npm test -- --filter=alta
```

This runs only files with "alta" in their name (e.g., `smoke_test_alta_jacket.js`).

### Control concurrency

By default, the runner spawns 4 test processes in parallel. To change this:

```bash
node tests/run-all.js --concurrency=2
```

Use `--concurrency=1` to run tests sequentially (useful for debugging).

## Test Output

Each test file reports one assertion per console line, formatted as a question ending in `?` followed by `true` or `false`. The runner tallies pass/fail across all files and prints a summary showing:

- Total assertions passed
- Total assertions failed
- Number of files that crashed (non-zero exit)
- Detailed listings of failures and crashes (if any)

Example:

```
==============================================================================
Genesis regression suite — running 47 test file(s), concurrency 4
==============================================================================
ok    smoke_test_alta_jacket.js                         128 passed, 0 failed
ok    smoke_test_attachments_v2.js                      45 passed, 0 failed
...
------------------------------------------------------------------------------
TOTAL: 996 assertions passed, 0 failed, 0 file(s) crashed, across 47 files
```

The exit code is 0 if all assertions pass and no files crash; 1 otherwise. This allows the test suite to gate CI/CD pipelines.

## Structure

- `smoke_test_*.js` — 47 individual test files, each launching Playwright's Chromium browser against the locally-served Genesis app, performing actions, and logging assertions.
- `_syntax_check.js` — Validates the JavaScript syntax of `genesis-app.html` by loading it as a string and executing its `<script>` block.
- `run-all.js` — The harness that orchestrates parallel test execution, collects results, and reports a summary.
- `legacy/` — Archived old test files (not run).

## Notes

- Each test file runs independently; they do not share state.
- Tests timeout after 90 seconds per file if they hang.
- Stale selectors (e.g., button IDs that changed in genesis-app.html) are reported as crashes with the last 12 lines of output shown for debugging.
