---
status: living document
part-of: "[[Genesis Build Log]]"
updated: 2026-08-24
---

# Design Notes — Curative & Tasking

Companion to [[Design Notes]] (production workflow) and [[Design Notes - Platform]] (system capabilities) — covers Genesis's Curative/CTC workflow, post-Curative audit findings, the Tasking system, the full Order Contacts type list, and MCP/connector research.

## Curative

- Curative is prototyped and built (Draft/Final + disposition + CTC). Commitment has Draft/Final: "Finalize Commitment" (inline confirm) — Draft still deletes Requirements/Exceptions outright, Final hides delete (pencil stays), removal only via disposition. Finalize is now reversible ("Revert to Draft," blocked while a CTC is issued — see [[Design Notes]]'s Document lifecycle section). Curative lists Requirements/Exceptions with a Disposition dropdown, Notes, "Don't Show on Commitment" checkbox (never deletes; un-dispositioning = reject/reopen). Issuing CTC generates a live doc (same Sch A/B-I/B-II renderer, retitled "Clear to Close," Don't-Show items excluded) with its own Save-Version-to-Attachments hook and Rescind toggle. Two hardcoded Title Status auto-triggers: Finalize→Curative, Issue CTC→Cleared for Policy, Rescind→Curative. NOT built: decision-tree logic + Legal Facts/Risk Tolerance admin layers; three-phase task auto-generation; permission split (no login system).
- Curative - Policy Instruction Screen: Requirements/Exceptions filter down from the Commitment with language, Disposition field, Notes. Disposition lists are fixed/universal — separate sets for Requirements (Released, Expired, Insured Over, etc.) and Exceptions (e.g. Removed by Affidavit); ~96% of Exceptions never get dispositioned.
- Requirements essentially never removed — they stay until Policy; only truly-non-attaching items get dispositioned. Once dispositioned, nothing is deleted — it's flagged "Don't Show on Commitment" (blocks merge, stays permanently). Removal paths: after Final = disposition + "Don't Show"; before Final (Draft) = delete outright. Lightweight "proceed?" pop-up.
- Tasks are NOT back-linked to Requirements — independent actions. Every matter needs a Disposition to complete Clear to Close. Curative Title Officer submits to the (working) Title Officer for sign-off; Title Officer issues CTC (a distinct checkpoint from the earlier Licensed Title Review task).
- Curative decision-tree logic keyed to requirement type + state-specific curative law (Tenants by Entirety, FL judgments 10yr, Notices of Commencement 1yr, etc.); does NOT auto-resolve, walked step by step. Fed by two Admin layers: (1) Legal Facts — objective, state-keyed, centrally curated (E&O-risk governance like the R&E global tier); (2) Risk Tolerance/UW thresholds — agency/UW-editable, global default + local pin (more conservative only). A non-tree flat path also exists for bespoke ones — an optional R&E code attribute.
- Curative's three-phase task sequence, none gating except the last: (1) Initial Curative Review, runs alongside other tasks — a "What Title Shows" summary, emailed to the client once ready, recipients hand-picked. (2) Each Requirement generates its own task. (3) Issue Clear to Close by the Title Officer after sign-off.
- CTC is a generated document — the escrow/closing-facing version of the Commitment. Rejection mechanism: undo the Disposition + add a Note — no separate reject state, since un-dispositioning re-blocks Issue CTC.
- Order Contacts: broader optional contact types available on any file, not required at Order Entry. Attorney has a Type sub-field (Lender's/Buyer's/Seller's, etc.).
- Schedule B-I Requirements sourced from a Security Instrument's own related documents (Assignment, Loan Modification Agreement, Substitution of Trustee, Assignment of Leases and Rents, Assignment of Beneficial Interest, UCC Addendum - Continuation, Other) can each generate their own numbered sub-item requirement (5a, 5b format) alongside the parent SI's requirement (5). A related-doc sub-item chip only appears once the parent SI's own requirement is already on the Commitment; sub-item requirement text follows the same "Release of ___, to be released of record prior to closing" family as SI/Lien requirements, explicitly stating "...affecting the [SI type] recorded as Book/Page/Instrument No." referencing the PARENT Security Instrument's own recording info (plus the related doc's own assignor/assignee/dates/book/page if on file). Numbering (1, 1a, 1b, 2...) is computed live off a parentReqId link + array order — inserting a sub-item always splices it in right after the parent's existing children so lettering stays correct even if plain top-level requirements are added later. Not scoped: whether every related-doc type genuinely needs its own release language in real practice — see [[Open Items & Parking Lot]].

## Post-Curative audit findings

- Contact Directory idea parked into a future VIP Client Management feature area, along with the tabled Lender-entity idea.
- Notification bell (unread count, per-user channel pref) on the landing page, possibly a banner too; individual-only, POD/team visibility via production dashboards.
- Date Down trigger rules: (1) Effective Date >60 days from Settlement Date (fixed threshold). (2) A Requirement's Dated/Recorded Date after the Effective Date. (3) Manual request always available. Date Down tasks sit in whichever milestone was active when triggered; the request reuses the search-request automation. Receiving one back pushes a review task; the Examiner manually updates Effective Date etc. Follows the Data Review Screen path.
- "Payoff Obtained" satisfies the CTC gate for a payoff Requirement (distinct from "Released"); verifying recording happens at the Policy milestone.
- Underwriter selection at Order Entry: agency-pinned/local list only, state-scoped per underwriter — no global list.
- Requirement fields: Dated/Recorded Date, Consideration, Grantor(Mortgagor)/Grantee(Mortgagee), Book/Page/Instrument # — sourced from Prelim Search & Opinion via the R&E code mechanism.

## Tasking system

- Two-fold task taxonomy: (1) Multi-step Requested Tasks — order/wait (Search request, Date Down request). (2) Milestone and Step Checklist Tasks.
- Requested Task data model: Requested Date, Requested Due Date (deadline to send), Due Date (expected response), Received Date. Example: "Order and Publish Search Package."
- Handoff pattern: a Requested Task covers only the third-party piece; saving the item triggers the next Checklist task (e.g. "Commitment Prep"). Classifier: outside party (Requested) vs. internal work (Checklist).
- Most Requested Tasks are simple binary complete/not-complete — only Search Package and Date Down (API/PXT) need Data Review review.
- Requested Task lateness: dual notification + exception-report.

## Order Contacts (full list)

- Full list: Attorney (w/ sub type), Appraiser, Surveyor, General Contractor (w/ sub type), Tax Collector, Recording Office, Buyer/Borrower, Seller, Listing Agent (Seller's Agent), Selling Agent (Buyer's Agent), Qualified Intermediary, Title Company, Settlement Agent, Underwriter, Lender, Mortgage Broker, Investor, Other, HOA/COA Company, HOA/COA Management Company (kept separate), Property Management Company, Home Warranty, Notary/Signing Agent, Abstractor, Payoff Lender (distinct from Lender), Government (w/ open sub-type field).
- No separate POA/Estate contact type — entered as the Seller/Buyer-Borrower contact; Order Contacts sets up signature lines. Estate is its own entity-type option (peer to Individual/LLC/Trust/Partnership/Corporation). POA is a checkbox on any entity type, adding the Attorney-in-Fact as an additional signer; checking it auto-adds the POA instrument to needed vesting documentation.

## MCP/connector check

- Checked the MCP registry: no title/escrow connector exists. Closest are generic e-signature ones (DocuSeal, SignNow, etc.) — worth revisiting once Genesis needs signature routing. Also checked broader software-engineering skills/connectors: the org has zero MCP connectors installed at all currently; no GitHub/GitLab/Bitbucket connector surfaced either; no coding-related Cowork skill exists (the skill library is document-oriented: docx/xlsx/pptx/pdf).
- Real gap flagged: Genesis had no version control (single file in Claude's ephemeral cloud workspace, no git history/rollback) and tests were ad hoc Playwright scripts in `/tmp`, not a consolidated suite. As of the 2026-08-24 vault reorganization, the project and its vault now live in a real folder on Cam's machine (and, pending the SSD move, will live there) — see [[Genesis Build Log]] for current state. Git/version control for the code itself is still not set up — remains open, see [[Open Items & Parking Lot]].
