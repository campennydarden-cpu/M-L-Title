---
status: living document
part-of: "[[Genesis Build Log]]"
updated: 2026-08-25
---

# Counsel of Five Audit — 2026-08-25 (full rerun)

A full rerun of the five-persona audit (Contrarian / First Principles / Expansionist / Outsider / Executor), covering the actual code (`genesis-app.html`, 7,417 lines / 476KB, 197 functions, 27 nav screens), all four design-notes files, the original [[Title & Escrow Platform Roadmap]], and a refresh of industry/competitive context. The prior 2026-08-25 run of this audit only survived as chat text and was lost when that session ended — this version is written to the vault specifically so it doesn't happen again. Nothing here has been prioritized or agreed to yet; that's the point of the list — see the Executor section for a proposed order, but it's a proposal, not a decision.

Grounding notes pulled in this pass: ALTA opened public comment on **Best Practices 5.0** in July 2026 (comment period closed July 31); the headline change relevant here is that **Vendor Management is being split out into its own standalone Pillar 7** (previously folded into other pillars), with a formal vendor definition. If Genesis is ever the production system an underwriter is asked to approve, this is the framework that approval will be measured against — not the 4.2 version the original roadmap cited. [ALTA, 2026-07-14](https://www.alta.org/news-and-publications/news/20260714-ALTA-Opens-Public-Comment-Period-for-Proposed-Best-Practices-50-Revisions)

---

## The Contrarian — flaws, risks, reasons this fails

**1. Silent data loss is real and worse than previously documented.** Read the actual code (`load()`/`save()`, line ~1236):

```js
function load(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    state.orders = raw ? JSON.parse(raw) : [];
  }catch(e){ state.orders = []; }
  state.orders.forEach(normalizeOrder);
  save();
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders)); }catch(e){}
}
```

Two compounding problems, not one: (a) `save()`'s catch is empty — any write failure (quota exceeded, private-browsing storage restrictions, browser storage pressure) fails with zero user-visible signal, and every edit after that point is silently gone on next refresh; (b) `load()`'s catch resets `state.orders = []` on *any* parse failure, and then **immediately calls `save()`**, which writes that empty array back over whatever was in `localStorage` — the corrupted data isn't just unreadable, it's actively overwritten and destroyed in the same function call, before a human ever sees a warning. There is no quota-size check anywhere in the file (confirmed by grep — zero matches for "quota" or size estimation), and no export/backup/download mechanism exists anywhere except `window.print()` on the Commitment and CTC documents. This is not a someday risk; it is the default behavior today, and it gets more likely to trigger the longer the app is used, since every order's data (including full HTML snapshots of generated documents saved to Attachments) accumulates in one growing localStorage value.

**2. SSN and DOB are stored in plaintext, in the browser, with no protection.** Contact records carry `ssn` and `dob` fields (Individual Buyer/Borrower and Seller contacts) written straight into the same unencrypted `localStorage` blob as everything else — no field-level encryption, no masking at rest, no access control (there's no login system at all, confirmed — zero password/session/auth code anywhere in the file). Anyone with access to that browser profile, or a stolen/unlocked device, has plaintext SSNs for every buyer and seller in every file. This wasn't named explicitly in the prior audit pass; it should be, especially paired with finding #1 — the same lack of a backend that causes silent data loss also means there is no way to secure this data properly without one.

**3. ALTA copyright exposure is shipping, not hypothetical.** The Commitment jacket already renders verbatim ALTA form text (Notice, Commitment to Issue Policy, Commitment Conditions 1-9, the Short Form's ALTA 8.1-06 statutes) — confirmed live in the current published Artifact. This is real, generated output today, not a design note. Previously flagged and still unresolved: M&L's ALTA licensee/member-in-good-standing status has not been confirmed.

**4. No access control anywhere, despite a fully designed login/security architecture sitting unbuilt.** [[Design Notes - Admin]]-equivalent content (native email/password + mandatory MFA, SSO, step-up re-auth on signature-stamp merge) is thoroughly designed but zero of it is coded. Today, anyone with the Artifact link has full read/write access to every file, every SSN, every generated document. That's expected for a solo prototype — but it means the app is currently *less* secure than the three incumbents it's meant to eventually replace, on the exact axis (client PII, regulated documents) where that matters most.

**5. One person, unsupervised, building regulated-adjacent infrastructure.** The original Roadmap doc (section 08) was explicit that trust accounting, rate engine, and wire-fraud logic should get a technical co-founder's or fractional CTO's line-by-line review before touching real money, and that compliance counsel should be involved before Phase 3. Neither has happened. To be clear, this isn't a problem *yet* — Escrow Register, batch disbursements, and the rate engine are still design-only, nothing in that category is coded — but see the First Principles section below for why the *order* of what's actually been built should give some pause.

**6. Single point of failure in the build process itself.** The whole project — code, git history, design docs — lived only in an ephemeral cloud session until this week, recovered this session only because the prior session happened to think to export a git bundle before ending. That was good practice, but it was one person's habit, not a system. See the Executor section.

## The First Principles Thinker — is this solving the right problem, in the right order?

**The core problem, restated simply:** title/escrow production software should make it faster and safer to take a file from order to policy without an agent's team having to work around the software. Genesis's stated core architecture bet — single-source-of-truth field ownership, documents as generated outputs never the source of truth — is a genuinely good answer to that problem, and it's more disciplined than what the roadmap describes SoftPro/Qualia/ResWare doing. That thesis holds up under questioning.

**But look at what's actually been built vs. what the original roadmap said mattered most.** The Roadmap's own section 04 named three of the twelve components as license-and-existence-risk: Escrow & Trust Accounting, the Multi-State Rate & Fee Engine, and Wire & Fraud Controls — "everything else can ship as a rough draft and improve in public. Those three cannot." Twelve days of build later (per the change log), here's the actual state: Order Entry, Contacts, Property, Prelim Search, Commitment/Schedule A/B, Curative/CTC, Doc Prep (5 screens), and Escrow/Closing's *disclosure* forms (CDF/HUD) are built and deeply polished — right down to visually recreating the real federal CD. The Escrow Register (trust accounting), the rate engine, wire verification, and Agency Setup/admin are still 100% design-only, not one line of code. That's the inverse of the roadmap's own risk ordering: the highest-polish, most-time-invested parts of Genesis today are the parts the roadmap explicitly said were lower-stakes (document generation, disclosure forms), and the parts it called existence-risk are untouched.

This isn't necessarily wrong — Doc Prep and CDF are genuinely hard to get right and useful to have working — but it's worth naming plainly rather than let it happen by default. Ask: is the plan still "build the trust ledger next, carefully, once ready," or has the day-to-day pull of "what's satisfying/visible to build next" quietly become the real prioritization function? The five-persona audit itself is a symptom of the same pattern — it's more compelling to have a beautifully recreated federal CD than an unglamorous, hard-to-test trust register, but the register is what an underwriter and a regulator will actually care about first.

**A second, smaller first-principles question:** the R&E code library, curative decision-tree, and Legal Facts/Risk Tolerance admin layers are all designed with real sophistication (state-keyed legal rules, E&O-risk-governed global tiers) but none are built. Is building 27 screens of production workflow *before* any of the codified legal-judgment layer exists actually the right sequence, or does it risk baking in enough free-text/manual-judgment habits into the UI that retrofitting the decision-tree later becomes a bigger rework than doing it earlier would have been?

## The Expansionist — hidden upside, scale, overlooked opportunity

**1. ALTA Best Practices 5.0's new Vendor Management pillar is a genuine opportunity, not just a compliance cost.** If Vendor Management becomes its own standalone pillar with a formal vendor definition, a production system that ships with built-in compliance evidence (File History's audit trail, the Draft/Final/disposition no-delete pattern, the Signature Card as a functional signing control rather than reference data) has something concrete to hand an underwriter's vendor-management review, ahead of most legacy competitors who'll be retrofitting this. Worth tracking ALTA's final 5.0 text once published and mapping Genesis's existing audit-trail features directly against whatever the new Pillar 7 actually requires.

**2. The design-documentation depth is itself a moat, and it's underused as one.** Four design-notes files, a phased roadmap with named risks, and now this audit total real domain rigor that most solo vibe-coded projects never produce. That's the actual asset the original roadmap named in its thesis (section 01) — "the one credential nobody can vibe-code." Right now it lives in an Obsidian vault only Cam and Claude sessions read. If the goal ever becomes raising money, recruiting a technical co-founder, or getting an underwriter conversation started, this document set — cleaned up — is most of a pitch/spec package already.

**3. Underwriter Referral Packet** (surfaced in the prior audit, still just an idea): a generated packet bundling the file history, compliance evidence, and audit trail specifically formatted for an underwriter review or remittance audit. Directly synergistic with finding #1 above.

**4. Post-close automation remains a real, underbuilt category.** Competitive research (this pass and last) found neither Qualia nor ResWare natively automates what happens after disbursement. Given Genesis's Milestone list already runs through Post Closing, Funding, Recording, Policy and Remittance, this is a plausible differentiator that fits the existing architecture rather than requiring new design.

**5. The "internal tool vs. eventual product" question, unresolved since the last audit, actually changes near-term priorities materially.** If this stays an M&L-internal tool indefinitely, the localStorage/single-user architecture ceiling matters much less, and the ALTA licensing question resolves to "whatever M&L's own status already is." If it's ever meant to be sold to other agencies, both of those become launch-blockers, not someday-items, and the sequencing question raised in First Principles above becomes urgent rather than academic.

## The Outsider — fresh reaction, no internal context

**1. The app's own browser tab still says "Genesis Commitment Builder."** The `<title>` tag (line 1 of the file) was never updated to match the approved Genesis/M&L brand identity work — small, but it's the literal first thing anyone sees, and it undersells what's actually built (this is a whole production platform now, not just a commitment builder).

**2. Zero role-based UI, and it shows immediately.** All 27 screens/tabs render for every session, all the time — Order Entry sits next to Escrow Register-adjacent CDF pages next to Doc Prep next to Curative, with no login and no concept of "what should a Title Officer see vs. an Escrow Assistant." A first-time user (or a demo to a prospective agency) would have no way to tell what they're looking at without Cam narrating it. This is expected at this stage per the Build Log, but from a cold read it's the single most disorienting thing about opening the link fresh.

**3. No sample/demo data.** A fresh Artifact load shows an empty order list and a "+ New Order" button — there's no way to see the Commitment/CDF/Curative screens' real sophistication without manually building out a full file by hand first. Anyone shown this for the first time (an investor, a co-founder candidate, a pilot agency) sees an empty shell, not the actual depth of the build, unless Cam is there driving.

**4. The industry jargon is dense and untranslated.** "CTC," "R&E," "Sch B-I/B-II," "PXT" — completely legible to Cam and any title professional, opaque to literally anyone else who might ever look at this (a technical co-founder candidate, an investor, a new hire). Not a flaw in the software, but worth knowing this document set and the app itself currently assume a title-industry reader throughout.

## The Executor — logistics, practical hurdles, immediate next steps

Proposed sequencing (a proposal — Cam's call), roughly by (impact × how little it depends on other undecided things):

1. **Fix the silent-failure/no-backup problem (Contrarian #1).** Concrete and scoped: surface a visible warning on save failure instead of an empty catch; stop `load()`'s failure path from immediately overwriting good-but-unparseable data (log/preserve the raw string before resetting); add a manual "Export all orders to JSON" download button as a real backup path. A few hours of focused work, no dependency on anything else on this list.
2. **Decide the SSN/DOB handling question (Contrarian #2) before more files carry real client data through Genesis**, even in testing. Options range from "don't store SSN/DOB in Genesis at all yet, keep it in the existing production system until there's a real security story" to "mask at rest with a simple reversible scheme" — this is Cam's call, not a build decision Claude should make unprompted.
3. **Get the ALTA licensing question answered (Contrarian #3)** — this blocks nothing else technically, but every Commitment generated with real ALTA text until it's resolved is a live exposure, not a someday one.
4. **Set up a real git remote** (GitHub, GitLab, or similar) rather than relying on the bundle-to-Mac-folder pattern verified this session — that pattern works but it's a manual habit, not a system; a real remote removes the single point of failure named in Contrarian #6.
5. **Have the First Principles conversation explicitly**, even briefly: confirm whether the Escrow Register/trust accounting build is still the intended next major area, or whether Doc Prep/CDF polish should keep going first — not because either answer is wrong, but because right now the choice is happening by default rather than by decision.
6. **Small Outsider fixes are cheap and worth batching whenever a UI session is already open:** update the `<title>` tag; consider a minimal seeded demo order for anyone other than Cam who opens the link.
7. Everything under Expansionist is genuinely later-stage — worth a future planning conversation, not this week's work.

---

*This document, not just the chat that produced it, is the record going forward — update it in place as items get addressed rather than letting the next audit start from zero again.*
