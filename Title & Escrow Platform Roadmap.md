---
status: draft v0.1
prepared-for: Cam
prepared: August 2026
---

# Building the Title & Escrow Platform You Wish You Had

*Not a fourth production system that copies the other three — one built by someone who has actually had to balance the trust account, defend the curative, and explain the file to an underwriter.*

**Status:** Pre-code — narrative & sequencing. Grounded in SoftPro Select, Qualia, ResWare, and ~45 states of production experience.

A companion designed version of this document (with a full comparison table, phase timeline, and stat strip) is published here: [Title & Escrow Platform Roadmap](https://claude.ai/code/artifact/de49872a-7952-4c87-bb0b-2e28449d786e)

> **2026-08-24 update:** the project has since moved well past this pre-code stage into active vibe-coded prototyping. See [[Genesis Build Log]] for the live, click-through build and current feature state, and [[Design Notes]] / [[Design Notes - Platform]] / [[Design Notes - Curative & Tasking]] for the detailed design decisions made along the way. This roadmap stays as the original strategic framing — still a fair read on market position, phasing, and risk.

---

## 01 — The Thesis: You Have the One Credential Nobody Can Vibe-Code

Most title production software gets built from the outside in: engineers interview a handful of escrow officers, sketch some screens, and iterate against support tickets. What's missing from that process is the thing you already have — years of sitting on the underwriting side of the desk, saying yes or no to files, watching how SoftPro Select, Qualia, and ResWare each behave under real pressure across residential refinances, complex commercial deals, and the fifty-state patchwork of rate filings and trust accounting rules. You've seen where each of those systems makes an agent's job harder instead of easier, and you've seen it from six different underwriters' worth of risk appetite.

That's the actual asset here. The software itself — forms, ledgers, workflow screens — is buildable, especially now that AI-assisted ("vibe coded") development can turn a clear domain spec into working software far faster than a traditional build. What can't be shortcut is knowing *what the software should actually do* at the moment a file gets complicated. This document is a narrative and a sequence, not a technical spec — the goal is to get the shape of the thing right before a single line of code exists, and to be honest about which parts of this are a weekend prototype and which parts are regulated infrastructure that will have your name and your agents' licenses attached to it.

## 02 — The Competitive Landscape: Where the Three Incumbents Leave Room

None of the three platforms you've used is badly built — each won its position in the market for real reasons, and each has a real ceiling.

| Platform | Where it wins | Where it leaves room |
|---|---|---|
| **Qualia** | Modern, API-first architecture; wide integration marketplace; frequent releases | Pricing scales hard with volume; workflows lean residential/refi over commercial |
| **SoftPro Select** | Deep, established underwriter integrations; documented APIs/ODBC/SQL; multi-state maturity | Slower modernization; pricing opacity; rough migration path off legacy Standard |
| **ResWare** | Configurable workflows; strong audit trail; genuinely good at complex, multi-party commercial files | Overbuilt and heavy for smaller residential-only shops; more integration lift required |

The white space is the agency that doesn't fit neatly into any one of those three lanes: genuinely national, writing on multiple underwriters with different rate filings and remittance requirements, moving between residential volume and commercial complexity in the same week — the exact profile you've operated across for years. Nobody has built specifically for that agent with a modern architecture, transparent pricing, *and* the trust-accounting and compliance rigor that keeps an underwriter comfortable.

## 03 — Who You're Building For

Picture an independent or regional title and escrow agency, five to sixty employees, writing policies for two or more underwriters, doing enough commercial and multi-party work that a residential-only tool feels thin, but not so large that a full ResWare-style enterprise deployment and its integration overhead is worth the cost and the IT lift. That agency is currently choosing between three imperfect fits, and switching costs (retraining staff, remapping underwriter integrations, migrating open files) keep most of them locked into whatever they started on. Your own network of peers across those 45 states is the fastest, lowest-cost way to validate that this agent actually exists in the numbers you think, before any of this becomes a funded, staffed company.

## 04 — The Twelve Components

Breaking "title and escrow software" into components matters because each one has a different build difficulty, a different regulatory weight, and a different order in which it needs to exist.

1. **Order & File Intake** — order entry, file numbering, assignment/routing, initial conflict and OFAC checks, referral source tracking.
2. **Title Search, Exam & Curative** — search ordering, prior-policy pull, exception tracking, AI-assisted document review of abstracts and recorded instruments, curative task management.
3. **Commitment, Endorsement & Policy Generation** — ALTA commitment and policy forms, jacket generation per underwriter, endorsement libraries, schedule B-II exception drafting.
4. **Multi-State Rate & Fee Engine** — promulgated and filed rate calculation by state, underwriter-specific splits and retention, reinsurance/co-insurance handling.
5. **Escrow & Trust Accounting** — positive pay, three-way reconciliation, disbursement controls, 1099-S generation, per-state trust rules.
6. **Closing & Settlement** — ALTA settlement statement / CD generation, signing scheduling, in-person, hybrid, and RON closings.
7. **Wire & Fraud Controls** — out-of-band wire instruction verification, seller net-proceeds and payoff fraud checks, insured verification services.
8. **Underwriter & Agency Management** — CPL issuance and tracking, remittance reporting, agency audit support, per-underwriter API connections.
9. **Compliance & Audit Trail** — ALTA Best Practices tracking, state licensing records, document retention, immutable file history.
10. **Integration Layer** — lender LOS connections, MLS, county e-recording, e-signature, payoff and credit report pulls.
11. **Reporting & Analytics** — pipeline, production, and profitability dashboards by underwriter, office, and file type.
12. **Client & Referral Portal, Mobile** — status transparency for buyers, sellers, realtors, and lenders; mobile access for signings and approvals on the go.

> Components 5 (trust accounting), 4 (rate engine), and 7 (wire controls) are the three that can put an agent's license and your company's existence at risk if they're wrong. Everything else can ship as a rough draft and improve in public. Those three cannot.

## 05 — Architecture, Without Code

You don't need to learn to code to build the first version of this, but it matters a great deal which parts you let an AI coding tool (Claude Code, Cursor, Replit, or similar) generate freely and which parts get a trained engineer's eyes on every line before it touches real money. The dividing line isn't "hard vs. easy" — a beautiful client portal is easy to vibe-code and low-stakes if it has a bug. A three-way reconciliation routine is also not that hard to generate, but a bug there can silently misstate a trust account, and that's a regulatory and licensing event, not a support ticket.

A practical sequence:

1. Start with no-code or low-code tools (Retool, Airtable, or similar) to prototype and validate a single painful workflow — three-way reconciliation is a good first candidate, since you already know exactly what "correct" looks like and can check the tool's output against your own math by hand.
2. Once a workflow is proven, an AI-assisted custom build can turn it into real software — but the money-handling and compliance-facing components (escrow ledger, rate engine, wire verification, anything that writes to an audit trail an underwriter or regulator will eventually read) should be reviewed line-by-line by a technical partner who understands double-entry accounting and basic security practice before any pilot agency runs live files through it.
3. Everything else — search workflow, document generation, the client portal, dashboards — can be built faster and more iteratively, with real users correcting course in near-real time.

On infrastructure: favor managed, boring, well-understood services over anything exotic — a managed Postgres database, a mainstream cloud host with a track record of SOC 2-ready infrastructure, and off-the-shelf e-signature and identity-verification providers rather than building any of that yourself. None of that is where your differentiation lives; your differentiation is the workflow logic and the depth of the underwriter and rate-engine layer, and that's where the vibe-coded speed advantage actually pays off.

## 06 — Compliance & Trust: The Gate Every Agent-Facing Platform Has to Pass Through

This is the section that determines whether the rest of the roadmap is real. Escrow trust accounting is regulated at the state level — reconciliation frequency, positive pay requirements, and bonding all vary by state, and a platform that gets this wrong doesn't just lose a customer, it can cost an agent their license. ALTA's Best Practices framework (currently on version 4.2, organized across seven pillars covering licensing, escrow trust accounting controls, privacy and data security, settlement policy and producer management, insurance and E&O coverage, and consumer complaint handling) is the industry's shared language for this, and it's the reason SoftPro, Qualia, and ResWare all had to build specific controls — not just features — to earn underwriter approval. Any new platform faces the same gate: individual underwriters (the same ones you've written for — AmTrust, First American, Stewart, Fidelity, Advocus, Old Republic, Essent) will want to review and approve a new production system before agents can issue policies on it, and that approval process is a real project timeline, not a checkbox.

Wire fraud is the other half of this, and it's getting worse, not better:

- **60%** of title professionals report increasing fraud attempts
- **$283M** in fraud losses prevented by verified-wire checks in 2025 alone
- **56%** of consumers say they would not return to a title company after a fraud incident
- **~$390K** median loss on a successful mortgage payoff fraud case

The practical implication: wire and fraud controls (component 07) shouldn't be a late add-on — treat it as launch-blocking for any pilot that touches real client funds, in the same tier as the trust ledger itself. Also worth planning around now: RON is legal for real estate closings in 45 states and D.C. as of 2026, with Alabama, Georgia, Mississippi, and South Carolina still holding out and California's law not fully effective until 2030 — a genuinely national platform needs a closing module that can gracefully route between in-person, hybrid, and RON depending on where the property sits.

> **Read before you build component 05.** A wrong assumption in the trust accounting module is the single fastest way this project could hurt a real agent. Whatever else slips in the schedule, do not let anyone — including an AI coding assistant working unsupervised — ship changes to the ledger, reconciliation, or disbursement logic without your own hand-checked math and, once you have one, your technical partner's review.

## 07 — The Phased Build

The biggest risk to a project like this isn't picking the wrong feature — it's trying to build all twelve components before anyone outside your own head has touched the product.

**Phase 0 — Discovery** *(months 0–2, no code required)*
Map your own current workflow end to end, on a residential and a commercial file, flagging every place you improvise around a software limitation. Interview 10–15 peers across different states and different systems about their top frustrations. Sketch screens with an AI design tool or in Figma — nothing built yet.
*Ready for Phase 1 when:* you can describe the single workflow that, fixed, would make an agent switch systems — in one sentence.

**Phase 1 — Thin Slice** *(months 2–5, no live trust funds)*
Build the highest-value single workflow from Phase 0 (likely three-way reconciliation or commitment/policy generation) as a no-code or lightly-coded prototype. Run it in parallel with your existing system on real files, without letting it be the system of record.
*Ready for Phase 2 when:* the prototype's output matches your hand-checked numbers on every test file, consistently.

**Phase 2 — Production Core** *(months 5–9)*
Search/exam workflow, curative tracking, commitment and policy/jacket generation for one underwriter and one or two states. This is where a technical partner needs to be in place.
*Ready for Phase 3 when:* one real pilot agency can process a full residential file start-to-finish inside the platform, still shadowing the old system.

**Phase 3 — Underwriter Integration** *(months 9–14)*
CPL issuance and remittance reporting, formal ALTA Best Practices documentation, and the underwriter approval conversations that let a pilot agency actually go live. Expand the rate engine to additional states.
*Ready for Phase 4 when:* at least one underwriter has signed off on the platform for live policy issuance.

**Phase 4 — Harden for Real Money** *(months 14–18)*
Wire verification integration, positive pay, a third-party security review, and the first pilot agency running live client trust funds through the platform — closely watched, one office at a time.
*Ready for Phase 5 when:* a full quarter closes clean for the pilot agency, with reconciliations matching and zero fraud-control incidents.

**Phase 5 — Expand** *(month 18+)*
Additional underwriters and states, RON/e-closing across the platform, a real integrations marketplace, mobile, and commercial-transaction depth for multi-party closings.
*Ready to keep expanding when:* each new state or underwriter addition takes noticeably less time than the last one did.

## 08 — Who Else You'll Need

You're the product authority — you're not meant to be the whole team. A technical co-founder or a strong fractional CTO is the first and least optional hire — someone who has built regulated financial software before, not just consumer apps, and who can own the trust-accounting and security review described in section 05. Compliance counsel or a consultant with ALTA Best Practices and multi-state trust accounting experience should be involved well before Phase 3, not brought in to clean up after the fact. As the pilot moves toward live funds, a security-minded engineer (even part-time) to own the SOC 2 path and wire-fraud tooling becomes necessary, and some form of QA discipline — even a single dedicated tester working through real file scenarios — before anything touches a live escrow account.

## 09 — Go to Market

The honest path in here is narrower and slower than "launch and sell nationally," and that's an advantage, not a limitation. Your existing relationships — with agents across the states you've written business in, and with the underwriters themselves (AmTrust, First American, Stewart, Fidelity, Advocus, Old Republic, Essent) — are a pilot-approval shortcut that a venture-funded outsider building the same product would have to buy or wait years for. Start there: one or two agencies you already trust, in states where you know the trust accounting rules cold, and one underwriter relationship willing to have an early conversation about what a pilot approval would require. On pricing, the market gives you reference points worth reacting to rather than copying outright — Qualia's per-seat, volume-scaling model draws real criticism from agents as it grows, and SoftPro's undisclosed, quote-only pricing draws a different kind of frustration; transparent, predictable pricing is itself a differentiator if you can afford to offer it early.

## 10 — Risks Worth Naming

Underwriter certification timelines are the risk most likely to quietly stall the project — this is a relationship-and-review process, not a technical milestone, and it deserves a conversation starting in Phase 0, not Phase 3. The incumbents are not standing still either; Qualia in particular has raised substantial outside capital and ships new features on a fast cadence, so the realistic strategy is depth and trust with a specific underserved agent profile, not a feature-count race. Trust liability is the sharpest edge of all of this — a software bug in the ledger or disbursement logic isn't a bad review, it's a potential regulatory event for a real agent, which is the entire reason sections 05 and 06 of this document exist. And the most mundane risk is simply bandwidth: this is a multi-year build that will compete for time and attention with your current underwriting work, and being clear-eyed early about how much of your own time you can actually give it will shape every phase above more than any technology choice will.

## 11 — This Month

1. **Write your own workflow bible.** Map every step of a file from order to policy issuance, for one residential and one commercial file, in the systems you use today — and flag every place you currently work around a software limitation by hand.
2. **Interview 10–15 peers.** Agents in different states, on different systems, about their top three daily frustrations. This is the fastest, cheapest validation available before anything is built.
3. **Prototype one workflow in a no-code tool.** Three-way reconciliation is a strong first candidate — you can check its output against your own hand-calculated numbers with total confidence.
4. **Start the technical co-founder search.** The trust-accounting core is not a project to vibe-code alone — begin this search in parallel with discovery, not after it.
5. **Have one honest conversation with an underwriter contact.** Ask what a pilot-approval path would realistically require. The answer will shape your whole timeline.
6. **Name it and give it a container.** A working name and a real entity turn "an idea I'm exploring" into a project with its own gravity — small, but it matters for momentum.

---

### This is v0.1

Treat this as a living document — the phases, and especially the timelines, are a first-pass sequencing meant to be corrected by what you actually learn in Phase 0. Come back and revise it as the plan meets reality.

### Sources consulted

- [Title Production Software Compared 2026 — WisdomStream](https://wisdomstreamai.com/blog/title-company-automation-software-compared-2026)
- [ALTA Best Practices framework — American Land Title Association](https://www.alta.org/policies-and-standards/best-practices/)
- [2026 State of Wire Fraud Report — CertifID](https://www.certifid.com/article/2026-state-of-wire-fraud-report)
- [Wire Fraud in Title & Escrow Is Intensifying — Qualia Insight, 2026](https://blog.qualia.com/wire-fraud-in-title-escrow-is-intensifying-7-takeaways-from-qualias-2026-report/)
- [What States Allow Remote Notary? A 2026 Guide — NotaryCam](https://www.notarycam.com/what-states-allow-remote-notary/)
