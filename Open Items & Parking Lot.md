---
status: living document
part-of: "[[Genesis Build Log]]"
updated: 2026-08-25
---

# Open Items & Parking Lot

A running list of things flagged during design discussion that aren't fully closed out — either deliberately deferred to a later phase, or a recommendation that was made but never got an explicit yes/no. Nothing urgent here; this is a place to make sure nothing quietly falls through the cracks as the design conversation keeps moving.

## Queued major topics (not deferred — just not designed yet)

1. **Client/Agent/Lender-facing portal.** Cam flagged this as a major deep-dive he wants to work through together — described it as needing to "be big." Covers external-party access: status visibility, document delivery, e-sign collection, etc. Not yet scoped at all.

## Deferred by design (not needed yet, don't forget later)

1. **Lender as a first-class entity.** Claude proposed formalizing Lender as its own entity with a standing preference/requirement profile (settlement type CD/HUD preference, Premium/Endorsement policy-type defaults, communication routing), since lender-driven preference keeps surfacing as a recurring, scattered problem. Cam tabled this deliberately — wants to fold it into a future VIP Client Management feature area rather than solve it as part of core Exam design now.
2. **Reusable Contact Directory.** Folded into the same future VIP Client Management feature area as the Lender-entity idea above, rather than solved now.
3. **Recorded Date → Policy Effective Date wiring.** The Deed's Recorded Date is meant to become the Owner's Policy Effective Date, and the Security Instrument's Recorded Date the Loan Policy Effective Date — not yet built, since no Policy screen exists yet in Genesis.
4. **Whether every Related Document type genuinely needs its own release requirement language.** Cam's ask covered all Related Document types (Assignment, Loan Modification Agreement, etc.) uniformly when this was built, unlike the earlier Lien-level precedent that excluded Assignment/Loan Mod as informational-only. Flagged as a judgment call, not explicitly asked about.

## Technical / process gaps (not a design decision, just needs doing)

1. ~~No version control for Genesis's code.~~ **Closed 2026-08-25** — real git repo now exists (branch `master`). ~~Still open underneath this: no proper remote configured.~~ **Also closed 2026-08-25** (same continuation session, Option 3 of the audit sequence) — real GitHub remote now exists at `https://github.com/campennydarden-cpu/M-L-Title.git`, branch `main`. The cloud build workspace's sandbox blocks pushing to GitHub directly, so the git-bundle-to-Mac-folder export (mitigation above) now doubles as the transport: Cam pushes the bundle to GitHub from his own Mac Terminal using a fine-grained personal access token. Caught one real gotcha getting this working — a bundle synced earlier in a session goes stale the moment a new commit lands, so it must be re-exported/re-synced after every commit if a mid-session GitHub push is possible, not just at session end.
2. ~~No consolidated test suite.~~ **Closed 2026-08-25** — `tests/run-all.js` runs all 40 active `smoke_test_*.js` files with one summary; 8 stale ones archived to `tests/legacy/`.
3. **External SSD / vault relocation in progress.** Cam wants this Obsidian vault (and likely the Genesis project itself) rooted on an external SSD instead of this Mac's local disk — see [[Genesis Build Log]] for current status once that move happens.

## Surfaced by the 2026-08-25 five-persona audit (Contrarian/First Principles/Expansionist/Outsider/Executor)

**Full rerun with complete per-finding detail lives in [[Counsel of Five Audit - 2026-08-25]]** (the first pass's detail only existed in chat and was lost when that session ended — this one's written to the vault so that doesn't happen again). Cam picked a 3-option sequence from the Executor's punch list: (1) fix silent data loss [closed, see above], (2) First Principles build-order conversation [closed, see below], (3) small cleanup batch (title tag, demo data, git remote, SSN/DOB decision) — **all closed 2026-08-25.** Title tag fixed to "Genesis — M&L Title & Escrow"; a one-time seeded demo order now populates a truly empty first-ever load (never re-seeds, never touches real data, no SSN/DOB on any seeded contact); git remote closed above. **SSN/DOB decision:** flagged by the audit as Cam's call, not a build decision to make unprompted — his answer was to leave SSN/DOB in plaintext with no access control for now, and revisit it once a user-permissions system exists to actually restrict access. "Not there yet." Summary of the rest below kept for a quick scan.

**First Principles build-order decision (closed 2026-08-25).** Asked directly: turn to Escrow Register/trust accounting now (the roadmap's own highest-risk item, still untouched), or keep polishing what's built (Doc Prep/CDF/Curative)? Cam's call: **keep polishing what's live, deliberately not starting trust accounting yet.** His reasoning: he wants the hierarchy/logic/architecture solid before expanding into a new, higher-stakes domain — a lot of time so far has gone into fixing things broken by downstream consequences that weren't considered upfront, and he wants that pattern reduced before trust accounting raises the stakes further. Not a default-by-inertia outcome — an explicit, reasoned choice.

1. ~~Silent data loss risk.~~ **Closed 2026-08-25** (same day, continuation session). `save()`/`load()` rewritten: a visible save-status banner replaces the old empty `catch(e){}`; a corrupted/unparseable `localStorage` value is now preserved in place (plus a timestamped `_corrupt_backup_*` safety copy) instead of being silently overwritten with `[]`. New Backup & Restore modal (copy-to-clipboard export, paste-to-restore with upsert-by-id — never deletes) covers the "no export mechanism" half of this finding, working around the published Artifact sandbox's blocked file downloads. 14 new Playwright assertions (843/845 total passing). Committed (`29d2929`), bundle re-synced to the Mac, published live.
2. **ALTA copyright/licensing exposure, unresolved.** Already flagged in the 2026-08-25 ALTA Commitment jacket entry in [[Genesis Build Log]] — verbatim copyrighted ALTA form text is in the generated Commitment document, restricted to ALTA licensees/members in good standing. Still needs M&L's status confirmed before this goes out on an actual issued commitment.
3. **No Policy-issuance screen, no trust accounting.** Both named as license-risk-relevant components in the original roadmap; neither exists in Genesis yet. Related to the already-deferred "Recorded Date → Policy Effective Date wiring" item above, which is blocked on this not existing.
4. **Architecture ceiling: single-user, no backend, no login.** `localStorage`-only, one browser/profile, no multi-user support, no server-side data store. Expected at this prototyping stage per [[Genesis Build Log]], but flagged by every persona in some framing as the wall Genesis will hit before it can be M&L's actual production system rather than a working prototype.
5. **Industry-wide post-close automation gap.** Competitive research surfaced that neither Qualia nor ResWare natively automates what happens after closing disbursement — a potential differentiation angle if Genesis ever gets built out that far, not an immediate to-do.
6. **Smaller ideas from the audit worth a look:** an Underwriter Referral Packet feature; connecting File History to ALTA Best Practices compliance evidence; the "internal tool vs. eventual product" framing question was raised but not resolved.
7. **Pre-existing, unrelated test failure:** `smoke_test_derivation.js`'s two Trustee-derivation-clause assertions fail on the current baseline (confirmed via git-stash comparison, not caused by any 2026-08-25 change) — real app bug or stale test, not yet triaged.

---

*Add to this list as new open threads come up — the goal is that nothing discussed gets lost just because the conversation moved on to the next topic.*
