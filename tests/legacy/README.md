# Legacy tests

These smoke tests were written to check an earlier iteration of a screen that has since been
redesigned in ways that make the test's core premise (not just a selector) obsolete — not a stale
assertion worth patching, but a check of a UI shape that no longer exists:

- `smoke_test_docprep.js` — checked a single `[data-tab="docPrep"]` tab; Doc Prep is now its own
  flat 5-tab nav group. Superseded by `smoke_test_docprep2.js`.
- `smoke_test_layout_tasks.js` — checked the old inferred/derived Requested-Task status +
  one-click "Mark Received" action, and a hardcoded 5-tab/3-toolbar-button nav count. Requested
  Tasks gained an explicit Status dropdown since, and the nav has grown well past 5/3 tabs.
- `smoke_test_lien_types.js` — checked a flat 11-option Lien Type list; Liens & Encumbrances later
  gained per-type structured field sets and Assignment/Loan Modification Agreement moved out to
  Related Documents under the parent Security Instrument.
- `smoke_test_prelim.js` — checked standalone Judgment (`#j-*`) and Notice of Commencement (`#c-*`)
  CRUD forms that no longer exist at all: Judgment was folded into the unified Lien/Encumbrance
  list (`LIEN_TYPES` includes "Judgment", with its own field set), and Notices of Commencement was
  removed from Prelim Search entirely (confirmed via `smoke_test_derivation.js`'s explicit "Notices
  of Commencement card gone?" assertion). Discovered 2026-08-26 while chasing an unrelated Trustee-
  derivation-clause test bug: this file was silently crashing mid-run on the missing `#j-datedDate`
  selector every time, but `run-all.js`'s old crash-detection heuristic
  (`code !== 0 && pass === 0 && fail === 0`) only flagged a file as crashed when *zero* assertions
  had printed — since this file's first 3 assertions passed before the crash, it read as "3 passed,
  0 failed" instead of a crash, silently dropping its Security Instrument/Judgment/Commencement/
  delete-round-trip coverage from every regression run without anyone noticing. `run-all.js` fixed
  to flag any non-zero exit as a crash regardless of how many assertions printed first. This file's
  Security Instrument coverage is superseded by `smoke_test_derivation.js`, its Judgment coverage
  by the Lien-type coverage in the same file, and it had no remaining coverage of anything else.

Kept for history rather than deleted. `tests/run-all.js` does not scan this subdirectory, so
these don't count toward the regression suite's pass/fail total.

Also archived here — pure debug/diagnostic scripts with no `"<question>?" boolean` assertions at
all (just raw `console.log` state dumps), several referencing a `window.__genesisState` debug hook
that isn't part of the app. Superseded by the current suite's dedicated, assertion-based tests
covering the same ground (`smoke_test_full.js`'s POA/married sections, and the `*_migration.js`
family for each screen's own migration coverage):

- `smoke_test_poa.js`, `smoke_test_married.js`, `smoke_test_migration.js`,
  `smoke_test_migration2.js`, `smoke_test_mixed_group_check.js`
