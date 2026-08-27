# Genesis

Genesis is a working prototype of a title/escrow production application built for M&L Title, a title/escrow firm. It is vibe-coded and early-stage: the goal so far has been to get real production screens working end to end, not to ship a finished product.

## How it works

The entire application lives in one self-contained HTML file, `genesis-app.html` (~9,800 lines). It's a vanilla-JavaScript single-page app with no framework (no React, Vue, etc.), no build step, and no bundler — every screen is rendered by template-string functions that write directly to `innerHTML`. There is no server and no database: all order data is persisted to the browser's own `localStorage` under the key `genesis_orders_v1`. That also means there's no login system and no multi-user sync — each browser holds its own local copy of the data.

A private demo build exists; ask the project owner for access.

## Features

Screens and workflows implemented so far:

- **Order Entry, Order Information, Contacts, Property**
- **Title Search** — Prelim Title Search, Commitment Schedule A / B-I / B-II
- **Curative** — curative workflow with Clear to Close
- **Document Preparation** — Deed, Security Instrument, Affidavits, Power of Attorney, Notary Acknowledgement
- **Escrow / Closing** — Settlement options, CDF pages 1–5, HUD-1 pages 1–3, Title Premiums, Endorsements, Recording, Payoff Calculator, Tax/Other Prorations
- **Toolbar** — Requested/Checklist Tasks, Attachments, File History
- **Firm Analytics** — a cross-file analytics view

Not yet built: policy issuance, escrow register / trust accounting, scheduling, title plant, agency setup/admin, a workflow-automation builder, and third-party integrations.

## Getting started

There's no build step. To open the app itself, just open the HTML file directly in a browser:

```bash
open genesis-app.html
```

(On Linux, use `xdg-open genesis-app.html`; on Windows, `start genesis-app.html`, or just double-click the file.)

To install dev dependencies (needed only for running the test suite):

```bash
npm install
```

## Testing

The `tests/` directory contains 56 Playwright-based smoke-test files (`smoke_test_*.js`) plus a consolidated runner, `tests/run-all.js`.

```bash
npm install
npm test
```

`npm install` also downloads Playwright's bundled Chromium automatically via its own postinstall step. `npm test` runs `node tests/run-all.js` against the full suite.

As of the last run, the baseline was 1116/1116 assertions passing, 0 crashed, across all 56 files. This is a point-in-time result, not a guarantee — see [`tests/README.md`](tests/README.md) for full runner usage, including the `--filter=<substring>` and `--concurrency=N` options.

## License

TBD
