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

Kept for history rather than deleted. `tests/run-all.js` does not scan this subdirectory, so
these don't count toward the regression suite's pass/fail total.

Also archived here — pure debug/diagnostic scripts with no `"<question>?" boolean` assertions at
all (just raw `console.log` state dumps), several referencing a `window.__genesisState` debug hook
that isn't part of the app. Superseded by the current suite's dedicated, assertion-based tests
covering the same ground (`smoke_test_full.js`'s POA/married sections, and the `*_migration.js`
family for each screen's own migration coverage):

- `smoke_test_poa.js`, `smoke_test_married.js`, `smoke_test_migration.js`,
  `smoke_test_migration2.js`, `smoke_test_mixed_group_check.js`
