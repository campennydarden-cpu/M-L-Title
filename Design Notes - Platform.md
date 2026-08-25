---
status: living document
part-of: "[[Genesis Build Log]]"
updated: 2026-08-24
---

# Design Notes — Platform Capabilities

Platform/system-capability side of the build: workflow builder, Smart Tags, escrow/closing, trust accounting register, integrations, recording tables, Doc Prep, Title Plant module. Companion to [[Design Notes]] (production workflow: Order Entry through Search/Exam/Schedule A) and [[Design Notes - Curative & Tasking]]. Read all three together.

## Doc Tree / Document Packages

- Out-of-the-box document catalog, three groups: (1) State Specific Forms — Deed Templates, Transaction Affidavits (state-specific), Title/Conveyance Affidavits (state-specific), Deed/Tax Forms, Buyer/Seller Docs form, etc. (2) Escrow Document Packages — CDF package (Refinance CD, Seller CD, Buyer CD, Combined CD) and HUD package (its various versions). (3) Title Document Packages — Legals, Title Reports, etc.
- UW-specific/UW-branded doc packages are installed separately via a Doc Bundle mechanism, not baked into the out-of-the-box catalog.
- UW branding lives on the Underwriter record as a Smart Tag source — generic templates are the default for every UW, redirecting/pulling branding via Smart Tags based on whichever Underwriter is on the file, rather than requiring a fully separate branded template per UW. Doc Bundle install works as a local pinned override (same global/local pattern used elsewhere) at the individual-document level — e.g. only the Policy jacket can be overridden while the Commitment stays generic. Doc Bundle is also the general install path for rare/uncommon or fully custom forms, not just UW-specific ones.

## Private Lender Loan Docs (Closing Instructions / Note / Security Instrument)

- For files where the agency represents a private lender who needs the agency to prepare the loan documents itself: Closing Instructions, a Promissory Note, and a Security Instrument. Own screen: Closing Instructions as the data-entry point, with the Note and Security Instrument merged/generated from it. Distinct from the existing inbound Closing Instructions object — normally the agency RECEIVES a lender's Closing Instructions when acting as settlement agent; when representing the private lender itself, the agency may instead need to PREPARE Closing Instructions to send to whatever title company is actually closing the loan, alongside preparing that lender's Note and Security Instrument. Triggered by Product Type, mutually exclusive with the standard (received) Closing Instructions flow on the same file. Not stripping out Escrow/Settlement Statement/Register for this Product Type initially.

## Agency Setup (admin/out-of-the-box)

- Umbrella admin area for: Underwriter appointments by state (local-only, no global list), Licensee Profiles, Agency Agreement terms per Underwriter, Risk Tolerance/UW authority thresholds, and the business/holiday calendar.
- Licensee Profile (separate from day-to-day staff assignment): stores CLE/CE requirements, Signature Card, License Numbers, etc. — feeds a Compliance Calendar.
- Agency Agreement (per Underwriter) captures: default Agent/UW splits, rate preferences by Transaction Type, and approved institutional lenders for centralized/negotiated rates. Compliance Calendar is its own module (present/background, same pattern as the Scheduler and Title Warehouse); a matched approved institutional lender auto-applies that lender's negotiated rate table/split, overriding the standard UW rate table; the Signature Card is functional, not just reference storage — it's the source of the digital signature stamp merged onto documents requiring that Licensee's signature.

## Workflow builder architecture

- Two separate things: (1) **Task Libraries** — Requested Task Library and Checklist Task Library, each holding task definitions (Task Name, Task Code, Assigned Milestone, Due Date, Notes) — where task TYPES are set up, not where triggers live. Due Date and Assigned To each get a formula editor on the task definition. (2) A separate **Automation/Rule Definition builder** where Trigger+Condition+Action logic is defined to make things in libraries/lookup tables "do stuff."
- Due Date formula anchor points: Order Creation, Task Creation, Settlement Date, another task's Due Date/completion date. Calendar Days vs. Business Days toggle — considering a system-wide setting driven by an agency-configured yearly business calendar rather than per-formula. Assigned To formula: dynamic role-based assignment, resolving against the file's Order Information role assignments.
- Automation builder: Trigger = event (e.g. "order saved") + condition set. Action(s) chainable — e.g. "first time a document named Commitment is saved and marked Final: update Title Status, mark task X, mark task Y." Action types include spawning a task from a library, updating a status, marking other tasks complete, generating a shipping label. Scope is platform-wide: can act on any local library, make external API calls, pull in global data, send emails.
- Builder needs two modes: wizard/no-code for trigger-condition-action rules, and a run-code-snippet mode (Python, scoped to writing a file's own fields and calling pre-defined platform actions) for complex automation.
- Hard separation principle (also in [[Design Notes]]'s Overview): "my workflow" (M&L's specific process) vs. the software's capabilities. Three tiers: (1) fixed core, not agency-configurable — no-delete/disposition pattern, Draft/Final edit-lock, Register auto-population from the Master Settlement Statement, commingling-prevention on batch disbursements; (2) out-of-the-box defaults; (3) agency-configurable via the workflow builder.

## Fields: Field Code / Smart Tag

- Every field needs a corresponding Field Code/Smart Tag so Doc Templates can insert the tag and populate from the file's value — one universal Smart Tag system used everywhere a field is referenced.
- For one-to-many data: Composite Tags — curated aggregate tags not tied to a single field, e.g. "All Borrowers" and "All Borrowers Vesting" (formatted vesting clause combining tenancy/marital status/vesting language). Composite Tags are fixed/system-curated (not agency-editable, same governance as R&E global tier).
- Vesting clause detail, prototyped concretely: Individual contacts carry Marital Status and a Married-To link to another contact; a Tenancy selector applies once per role-group (Buyer/Borrower group, Seller group) when 2+ parties share that role — Sole Ownership, Tenants in Common, Joint Tenants w/ROS, Tenants by the Entirety, Community Property, Community Property w/ROS. POA is a checkbox on Individual contacts revealing Attorney-in-Fact name + instrument reference, changing both the vesting clause and the signature line. LLC/Corporation/Partnership vesting clause pattern: "[Entity Name], a [State of Organization] [Limited Liability Company/Corporation/General or Limited Partnership]." Estate vesting clause pattern: "[Representative Name], as [Representative Title] of the Estate of [Decedent Name], Probate Case No. [Case Number] ([County] County)." Entity contacts also carry a Principals roster added after the entity is created — Members/Managers for LLC, Board/Officers for Corporation, Partners for Partnership, Trustee(s) for Trust. For LLC/Corp/Partnership the roster drives only the signature line ("By: [Name], [Role]"), not the vesting clause. Trust is the exception: the vesting clause itself is built from the Trustee roster.
- Contact fields are role-scoped: entity type / marital status / POA / vesting-driven fields only apply to Buyer/Borrower and Seller roles. Buyer/Borrower & Seller get Phone, Email, Current/Mailing/Forwarding Address, plus SSN and Date of Birth (Individual only). Title Company and Settlement Agent both get License Number, ALTA ID, Address, Phone, Email. Lender gets Mortgagee Clause, Address, Phone, Email. Underwriter/Attorney/Other get a baseline of Address, Phone, Email.
- Legal Description merge (Block/Lot vs. Metes & Bounds vs. Section/Township/Range) is a specialized Composite Tag under this Smart Tag system.
- Commitment/Policy Legal vs. Escrow Legal (Deed/CD): agency can pick which of Legal Description, Parcel/Tax ID, and Derivation appear on the Commitment/Policy legal composite vs. the Escrow legal composite independently. Config is state-level default with local-pin override; a "however, by showing this no additional coverage is provided" disclaimer auto-inserts whenever Derivation is toggled on for the Commitment/Policy composite. "Escrow legal" scope = Deed and Security Instrument.
- Some states require a minimum Derivation depth on the Commitment (e.g. "two owner derivation"). Hard stop blocks Final Commitment generation (not the Curative gate) if the file's chain-of-title data doesn't go back far enough — a dialogue advises additional chain is needed. Check is purely mechanical (instrument count meets required depth) — no chain-continuity/break validation, the examiner still does that judgment.

## Escrow / Closing

- Escrow Options Screen configures settlement statement form/template per file: which HUD/CD version, signature line placement, how the Master Settlement Statement merges into the chosen form.
- Settlement type: pick HUD or CDF at a high level; ALTA Settlement Statement always available regardless. Hard stop prevents generating an unconfigured HUD version; CDF has no hard stop.
- One Tax Proration Screen housing multiple prorations (County, City, HOA/COA). Entered manually: establish tax period, pull Settlement Date, calculate each party's responsible days, key in tax liability, screen calculates the split. Filters to the settlement statement.
- Endorsements added manually/template/automation on the Endorsement screen. Fees via rate table from the current rate manual. Each endorsement assigned to Owner's/Loan/Both Policy.
- CDF: one screen per page (5 total), flowing down from Order Contacts, Tax Proration, and Additional Title/Escrow Charges/Premiums screens; Page 1 filled by the system, Page 4 (lender-owned) omitted.
- Wants scan/OCR of a lender-prepared CD, reconciled into the file via the Universal Data Review Screen.
- HUD: same one-screen-per-page treatment and flow-down as CDF, but ONE shared HUD screen structure — 1986/1991/HUD-1A (2-page, no seller) all render from it at generation time.

## Additional Title/Escrow Charges

- Split rate table on Premium/Endorsement screens tracking Agent vs. UW portion for remittance. Bill Code assigned to ALL revenue line items — universal, for revenue-type reporting.
- State-specific title fees keyed by State (KY also County/City): NC/WV Title Commitment Fees (flat). IL/IN Policy Fees (flat, per policy) — KY-specific installable rate table/module for its Title Premium Sales Tax.
- IL/IN Simultaneous Issue Policy Fee logic differs (one counts SI as one policy, other as two); hidden inside the Rate Table itself, not a user-facing setting.
- General Additional Title/Escrow Charges get their own lookup table, local-only. Field list: Payor, Payee, Buyer/Seller split, Pass-Through flag, POC flag, Bill Code, amount.
- Additional Title Charges auto-apply via Transaction Type + State logic; stay editable/removable by staff.

## Bill Codes / Reimbursements

- Bill Code covers more than Revenue Items — also tracks Reimbursements: the agency pays for something on account (out of its own funds) and only collects it back via the CD. Until reimbursed, that's a realized loss on the books; if the file never closes, it stays a permanent realized loss.
- Mechanics: stays inside the Escrow Register as a Pending Ledger Transfer entry tied to the specific CD fee line item that will collect it (or a split of one) — Bill Code Type = REIMBURSE. Shows as a loss until the file disburses, then reconciles into a true reimbursement (trust-to-operating transfer). Entries are manually added/initiated, never auto-created. Bill Code is gaining a Type field: Pass Through, Revenue, Reimbursement, etc. To initiate, staff physically moves money from Operating to Trust, posts that as a receipt (Bill Code REIMBURSE), THEN cuts the disbursement to the vendor from Trust — so a trust disbursement is never cut without covering trust funds already receipted. The split-from-a-CD-line-item tie locks in when the reimbursement is added. Wants a dedicated Realized Loss exception report (same pattern as the stale-dated-check report). At disbursement, the collected CD fee repaying the advance is swept into Operating along with all other earned/operating funds via the normal ledger transfer process.

## Independent Ledgers

- Independent Ledgers scoped by category/Bill Code and by Accounting Period (monthly/quarterly/annually) — e.g. Revenue Ledger, Realized Losses Ledger, Title Searches Ledger, Premiums Ledger, Recording Ledger. Taxonomy is separate from Bill Code and fully agency-defined — this is office-management/internal-books recon, not true trust accounting. Ledgers close per period and should never go below zero.
- Mechanically a feature of the Escrow Register: Ledger Transfers move money OUT of the trust Register INTO these created Ledgers. At disbursement, Funding posts the ledger transfers and assigns them to a Ledger (active step of the Funding milestone); going below zero is a flag/exception after the fact; closing locks a Ledger but it can be reopened with the right credentials.
- A file-level disbursement ledger isn't Final until it has a zero balance AND all disbursements on it have actually cleared — at that point a new disbursement ledger auto-generates and saves to the file as the definitive Final record, tying into the existing stale-check tracking.

## Escrow Register (trust accounting)

- Register (Receipts and Disbursements ledger) created from Master Settlement Statement line items (not the generated CD/HUD/ALTA document) — uniform regardless of form. Updates in real time as line items are keyed/changed.
- Register receipt AND disbursement entries auto-created as Pending directly from Master Settlement Statement line items — entries get fulfilled as funds are receipted/disbursed. Mismatch between actual and pending flags a variance for review, no silent overwrite.
- Trust Account assignment lives at the Register level (per file), automatic based on property state (not overridable).
- Receipt flow: funds hit bank, artifact added to file as evidence, then receipt recorded in Register. Banking integration is an eventual goal, unscoped — manual for now. Check deposits: receipt NOT posted until the check clears.
- Stale-dated check exception: an outstanding disbursement check (uncashed) reaching day 181 auto-throws onto a "stale dated checks" exception report.
- Three-way trust reconciliation via a third-party service like Rynoh, not built in-house.
- Check cut = copy auto-saved to file; batched check saves a copy to every included file. Void/recut keeps the original marked VOIDED, new check saved alongside (no-delete) — voiding a batch check drops underlying file entries back to "pending disbursement" until a new check/wire is cut.

## Batch disbursements (Register)

- Problem: existing software loses file-level traceability when a check/wire is batched across multiple files to one payee (prime example: underwriter remittance). Some states prohibit commingling.
- ProTrust-style batch ledger tool: select multiple Register entries across multiple file ledgers, batch into one check/wire to a single payee, each entry keeps file-specific traceability.
- Each Register entry carries its state escrow trust account; the batch tool only allows same-account entries — commingling structurally impossible. Batch grouping key is same Payee only (not Payee+Bill Code).
- Wants void-then-recut (same batch composition) WITHOUT unbatching to individual entries — a goal, not fully resolved mechanically.
- Register-generation from a batch is a general capability, usable for any batch/payee/purpose. Finalizing a batch/register auto-drives each included file's Title Status from Policy Issued to Policy Remitted.

## Scheduling component

- Scheduling module/component separate from the file: a file sits on a schedule keyed to Settlement Date. Scheduler pulls the date from the file but maintains its own configuration that doesn't feed back into the file until certain milestones are met.
- Core purpose: holds a tentative/working Settlement Date without disturbing the file's official Settlement Date (and its milestone cascade) until confirmed. Push-back trigger: Notary/Signing Agent Confirmed pushes Closing Date and Notary back into the file. Also tracks Disbursement Date and Transaction Type.

## Out-of-the-box integrations

- Simplifile and CSC are must-have e-recording integrations — agency provides the system their own credentials, stored local/per-agency, protected and private.
- When an agency's appointed Underwriter also has an integration available, it gets pulled into the agency's system automatically when that underwriter's data is added (reuses the underwriter-pinning mechanism).
- PACER (bankruptcy searches) and OFAC checks: at Order Entry, run based on Buyer/Borrower and Seller names, publish results to File Notes or an exported PDF. A positive hit escalates beyond routine logging: a pop-up note dialogue fires every time the file is opened (until resolved), a warning fires when the file is closed without resolution, and a Task is thrown into the file.
- Wire Instruction verification: scan/OCR provided wire instructions, or manually key them in, to run a compliance check via a live verification/callback service — CertifID's API is the likely vendor.
- FedEx, UPS, USPS integrations for shipping labels — standalone on-demand tool, also available as an Automation builder action type.
- eNotary/RON platform integrations: Notarize.com, Notary Loop, Signature Closers, Loan Pro Closers, and similar signing-service marketplaces — create the closing in their system, they secure/assign a Notary, provide a portal for paying the notary, and handle delivery of scanbacks.

## Recording tables

- Recording fee tables (county/state recording fee schedules) need to be built/programmed and updated whenever rates change; globally curated/sourced (same E&O-risk governance as the R&E code library).
- Three separate rate tables: Recording Fee (Doc Type + Page Count), Transfer Tax (typically Sale Price), Recordation Tax (typically Loan Amount) — state-level config decides which apply and how they're labeled on that state's CD. Staff enters Doc Type and Page Count per instrument; the system calculates and rolls up into the correct lines. Buyer/Seller-split logic applies to these too, with agency choice to default to state custom or use a pinned local override.

## Doc Prep screen / Recording milestone

- Doc Prep screen is where documents (Deed, Security Instrument, Affidavits, etc.) are prepared/generated; each document type gets its own section for its details and recording information. Docs are submitted for e-recording through CSC or Simplifile; once recorded, the recording data is pushed back into the system and written to that document's fields on Doc Prep: Dated Date, Recorded Date, Consideration, Book, Page, Instrument Number (same recorded-instrument field structure already used on Requirements).
- Doc Prep acts as both the creation point and the backend data staging area. The Deed's Recorded Date becomes the Owner's Policy Effective Date; the Security Instrument's Recorded Date becomes the Loan Policy Effective Date (not yet wired — no Policy screen exists yet).
- Mail-away recordings (no e-recording integration available) are entered manually rather than auto-pushed back.
- Reframed: Doc Prep's recording fields are the "future tense" counterpart of the Preliminary Title Search & Opinion screen's fields (current-tense title state). Example: if this closing records a new Plat/Survey for a Developer's outsale, any future files within that section/subdivision/phase should reference the new Plat — reaching beyond simple same-parcel file-to-file title-plant copy-forward.
- For Policy screens: wants a Generate button (not fully automatic/silent) that pulls relevant data from elsewhere in the file to populate and/or flag fields on the Policy screen for staff review, rather than auto-writing Policy Effective Date silently.
- Doc Prep is its own top-level nav group, "Document Preparation" — flat, like General is to Order Entry/Order Info/Contacts/Property, NOT nested sub-tabs, and not folded into a "Closing" group: 5 separate File Section tabs — Deed, Security Instrument, Affidavits, Power of Attorney, Notary Acknowledgement. Doc Prep's Security Instrument is a NEW, separate record for the loan originated at this closing — not an extension of Prelim's existing Security Instruments list, which stays strictly the property's prior/existing encumbrances being released. Notary Acknowledgement is a signature-block/jurat generator only, no independent recording data of its own — it attaches to whichever document (Deed/SI/POA) is being signed. "Doc production" scope for the current build = structured data staging + a lightweight generated-summary preview, not full state-specific legal instrument text — that stays with the future Doc Tree/State Forms catalog.
- **Deed screen**, current state (see [[Genesis Build Log]] for the full build history): Draft/Final status (mirrors Commitment's finalize/confirm/revert-to-draft pattern — Recording Data fields only appear once Final; values stay saved even if reverted back to Draft) → Prepared By / Return To (Return To supports role-group selection, e.g. "All Seller," alongside a single Contact) → Instrument Type / Exemption Code / Dated Date → **Grantor** and **Grantee** — independently editable (name + entity type + principals roster), one-time non-destructive auto-fill from Contacts on first load, then fully decoupled from Contacts, with a "Copy from a file contact" convenience (incl. a married-pair "Both" option) → Consideration (auto-fills from Purchase Price, editable) → Legal Description (checkbox toggles inline Property legal text vs. "See Legal Description attached hereto as Exhibit A") → Parcel / Derivation / Situs Address (read-only, pulled live from Property/Prelim) → **Signature Lines** — a free CRUD list (seed-from-Grantor convenience + free-form add/edit/delete) → **Notary Block** — an independently editable textarea (explicit Generate-from-Grantor button, not auto-populated), deliberately not synced to the standalone Notary Acknowledgement screen → Exceptions/Subject To (chips seeded from Prelim's Exception Matters, same dedup-on-use pattern as Requirements, plus free-form manual add/edit/delete).
- Security Instrument's Mortgagor/Mortgagee remain pulled LIVE (read-only) from Contacts — that design wasn't reversed, only Deed's Grantor/Grantee. Deed screen is the home for the Buyer/Borrower group Tenancy selector. Consideration (Deed) and Loan Amount (Security Instrument) auto-fill non-destructively from Order Entry's Purchase Price/Loan Amount. Affidavits is a free multi-entry list (type dropdown, Affiant, optional Recorded checkbox gating recording-data fields). POA uses structured recording fields (Dated/Recorded Date, Book, Page, Instrument #) on a dedicated Doc Prep sub-tab listing every POA-enabled contact, writing back onto that same Contact record. Recorded Date → Policy Effective Date wiring is NOT yet built (no Policy screen exists yet) — see [[Open Items & Parking Lot]].

## Title Plant / Subdivision Management module

- The plat-reference gap (new files in a subdivision need to reference a newly-recorded Plat, not just same-parcel prior files) needs a genuine shared data store, distinct from same-parcel file-to-file copy-forward — a Title Plant/Warehouse/Subdivision Management module.
- Wants to key in Plat details (Dated Date, Surveyor, Project/Subdivision name, Book/Page, etc.) and have that merge into a new Legal Description — at least for Outsale/Developer projects; configurable, opt-in.
- Needs a legal-description hierarchy: Block/Lot vs. Metes and Bounds vs. Section/Township/Range — all available as Property Screen fields, but the merge logic must filter out whichever format(s) aren't present/applicable for a given property.
- The Title Warehouse module is architecturally like the Scheduler: present/connected but independent of active files, accumulating data in the background and feeding into files when relevant.
