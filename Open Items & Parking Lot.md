---
status: living document
part-of: "[[Genesis Build Log]]"
updated: 2026-08-24
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

1. **No version control for Genesis's code.** `genesis-app.html` is a single file in the cloud build workspace with no git history or rollback point. Offered to set up a real git repo; not yet acted on.
2. **No consolidated test suite.** Testing is ad hoc Playwright scripts, one per feature area, re-run manually before each publish rather than through a single runner.
3. **External SSD / vault relocation in progress.** Cam wants this Obsidian vault (and likely the Genesis project itself) rooted on an external SSD instead of this Mac's local disk — see [[Genesis Build Log]] for current status once that move happens.

---

*Add to this list as new open threads come up — the goal is that nothing discussed gets lost just because the conversation moved on to the next topic.*
