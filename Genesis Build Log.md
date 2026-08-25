---
status: living document
part-of: "[[Design Notes]]"
updated: 2026-08-24
---

# Genesis Build Log

Genesis is the working, vibe-coded prototype of Cam's title/escrow production software — a real, click-through application, not a mockup. This note tracks what's actually built, how it's put together, and a running change log so a new session/thread can pick up context fast. Design *decisions* (the "why") live in [[Design Notes]], [[Design Notes - Platform]], and [[Design Notes - Curative & Tasking]] — this note is the "what's actually built and where" companion.

## Live build

**https://claude.ai/code/artifact/dfa56b55-9198-4247-94e3-813b2a158f78**

Open that link any time to use the current prototype. It's a published Claude Artifact — private to Cam unless shared, persists across sessions, and is updated in place (same URL) every time a change is published.

## What it is, technically

- A single self-contained HTML file (`genesis-app.html`) — a vanilla-JavaScript single-page application. No build step, no framework, no server. Everything (styles, markup, logic) lives in one file.
- All screens render via template-string functions that write to `innerHTML`. No component framework.
- Data persists to the browser's `localStorage` (key `genesis_orders_v1`) — each order/file is a JSON object in an array. This is per-browser storage: it lives in whichever browser tab/profile has the Artifact open, not in a shared database. There is no multi-user sync, no login system, and no server-side data store yet — that's expected at this prototyping stage, not a bug.
- Published and updated via the Artifact tool — republishing the same file path keeps the same URL, so the link above never changes even as the app evolves.

### A few load-bearing implementation patterns (useful context for future sessions)

- **`blankOrder()` vs. `normalizeOrder()`:** `blankOrder()` defines the full shape of a brand-new order; `normalizeOrder()` backfills that same shape onto orders already saved in `localStorage` (run once at app startup). Every new field has to be added to *both* — `newOrder()` calls `blankOrder()` directly, not `normalizeOrder()`. Missing this has caused at least one new-order crash (fixed).
- **Live preview refresh:** most text fields just call `save()` on change without a full re-render. Any field that feeds a computed preview box on the same screen (e.g. the Deed's Generated Summary) has a small dedicated `refreshXSummary()` function that patches just that one DOM node, called from the field's change handler.
- **List CRUD pattern:** every persisted list (Requirements, Exceptions, Security Instruments, Liens, Exception Matters, Related Documents, Affidavits, Deed Subject To, Signature Lines, etc.) uses the same add / pencil-icon inline edit / trash-icon delete pattern, with a `recordRow()` helper and a per-list `state.editXId` toggle. Nothing hard-deletes silently in a Final-stage record — see the Draft/Final and disposition patterns below.
- **Seed-chip pattern:** "From this file" chips generate pre-composed text from underlying structured data elsewhere in the file (e.g. Requirements chips from Security Instruments/Liens, Deed Subject To chips from Exception Matters). A chip dedups via a `sourceType:sourceId` tag on the target record, disappearing once used and reappearing if the target is deleted.
- **Draft/Final lifecycle pattern:** used on the Commitment and the Deed — a boolean `final` + `finalizedAt` timestamp, confirm-before-finalize UI, and confirm-before-revert-to-draft UI. Reverting a Final record back to Draft preserves any data already entered (e.g. Recording Data), just hides it again. Commitment's revert is blocked while a Clear to Close is issued.
- **Independent-copy vs. live-pull parties:** some party fields (Derivation's Grantor/Grantee, Deed's Grantor/Grantee) are independently editable records — auto-filled once from Contacts, then fully decoupled, with a "Copy from a file contact" convenience to re-pull on demand. Others (Security Instrument's Mortgagor/Mortgagee) are pulled live/read-only from Contacts and stay in sync. The dividing line: a historical or as-drafted instrument whose parties can legitimately differ from today's file contacts gets the independent-copy treatment; a document that must always exactly match whoever is signing today stays live-pulled.

## Testing practice

Every code change is tested with Playwright (a headless-browser scripting tool) before it's published — the app is exercised the way a user would, and console/page errors are checked. Test scripts live in `/tmp` on the build machine as individual files, one per feature area (e.g. `smoke_test_docprep2.js`, `smoke_test_coverage_autofill.js`, `smoke_test_deed_independent.js`). Before publishing any change, the relevant test plus the full existing regression set gets re-run so a new feature can't silently break an old one.

**Open gap:** this is not yet a consolidated, checked-in test suite, and the code itself has no version control (git) — `genesis-app.html` is a single file in the cloud build workspace with no commit history or rollback point. Flagged in [[Open Items & Parking Lot]].

## Screens built so far

**General:** Order Entry, Order Information, Contacts, Property (Identification / Legal Description / Plat & Survey Matters sub-tabs).

**Title:** Prelim Title Search (Derivation, Security Instruments + Related Documents, Liens & Encumbrances, Exception Matters), Commitment Sch A (policy/coverage, Chain of Title), Commitment Sch B-I/B-II (Requirements/Exceptions with Draft/Final + reversible Finalize), Curative (disposition workflow, Clear to Close with Issue/Rescind).

**Document Preparation** (its own flat nav group): Deed (full spec build — see below), Security Instrument, Affidavits, Power of Attorney, Notary Acknowledgement.

**Toolbar (available from any screen):** Requested Tasks, Checklist Tasks, Attachments (Commitment version snapshots), File History (full audit trail).

**Not yet built:** Premiums/Endorsements (placeholders only), Policy screens, Escrow/Closing (CD/HUD, Register, trust accounting), Scheduling, Doc Tree/state-specific document text, Title Plant/Subdivision module, Agency Setup/admin, workflow builder (automation rules), any of the out-of-the-box integrations. All of these are designed in [[Design Notes - Platform]] but not coded yet.

## Recent change log (most recent first)

**2026-08-24 — Deed screen independence pass.** Reversed the earlier design that made Deed's Grantor/Grantee read-only and live-pulled from Contacts: they're now independently editable (name, entity type, principals roster), auto-filled once from Contacts, then fully decoupled — with a "Copy from a file contact" convenience including a married-pair "Both" option. Return To now supports role-group selection ("All Seller," "All Buyer/Borrower," generalized to any role on the file), not just a single contact. Signature Lines converted from a read-only computed list to a real CRUD list (seed-from-Grantor + free-form add/edit/delete). Notary Block converted from a read-only display synced to the standalone Notary Acknowledgement screen into an independently editable textarea with an explicit Generate button, no longer synced. 44 new Playwright assertions plus the full regression suite, all passing.

**2026-08-24 — Doc Prep nav restructure + Deed screen full rebuild.** Moved Document Preparation to its own flat top-level nav group (5 tabs: Deed, Security Instrument, Affidavits, Power of Attorney, Notary Acknowledgement), replacing the earlier nested-subtab pattern. Rebuilt the Deed screen field-by-field to Cam's exact spec (see [[Design Notes - Platform]]'s Doc Prep section for the full field order), including a Draft/Final lifecycle with Recording Data fields gated on Final.

**2026-08-24 — Commitment Un-finalize.** Added a reversible "Revert to Draft" to the Commitment, mirroring the existing Finalize flow, blocked while a Clear to Close is issued.

**2026-08-24 — Schedule A Coverage Amount auto-fill.** Purchase Price → Owner's Policy Coverage Amount, Loan Amount → Loan Policy Coverage Amount, same non-destructive fill-if-blank pattern used elsewhere.

**2026-08-24 — Doc Prep initial build.** First version of the 5 Document Preparation screens (Deed, Security Instrument, Affidavits, Power of Attorney, Notary Acknowledgement), initially as nested sub-tabs (later restructured, see above).

*(Earlier sessions built Order Entry, Contacts, Property, Prelim Search, Commitment/Schedule A/B, Curative/CTC, the toolbar sections, and the Related Document sub-item requirements feature — see [[Design Notes]] and [[Design Notes - Curative & Tasking]] for what's in each.)*

## Where things stand / picking this up

If you're starting a new session and want to keep building Genesis: open the live build link above to see current state, skim this note's change log for the most recent work, and check [[Open Items & Parking Lot]] for anything flagged but not yet closed out. The three Design Notes files are the "why" behind what's built — read the one relevant to whatever you're changing next.
