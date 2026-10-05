# PURCHASING — MASTER

**All listing appearance — BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED (approved Jess, 2026-09-17):** follow
[UI MASTER §6.7 Portal-wide listing readability](../ui/MASTER.md#portal-wide-listing-readability--built-2026-09-17-slice-1--authenticated-walk-owed).
This is the shared default, not a PO visual pilot. Preserve this module's filter content,
control types, special schedules and business behavior; no page-local appearance specification.


Status: **APPROVED / LOCKED — OWNER REVIEW COMPLETE 2026-08-29; Supplier Claims stock-claim boundary and Problems UX owner-approved 2026-09-14**
Lane: **BUILD / DELIVERY — owner commissioned continuous Purchasing delivery, 2026-10-02.
Approved truth governs implementation; proposals remain NOT LAW and verification is capability-specific.**

**CURRENT HANDOFF — 2026-10-01.** Retain the existing architecture and working pages. Complete the
module against §§5–14 and the consolidated defect/acceptance map in §2.4. Do not restart the
Blueprint or ask the owner to approve every page in sequence. The four exception rulings,
staff-help boundaries, supplier channels and MP/pillow replenishment facts remain approved.
The whole-page recommendation and supplied code-audit defects are one completion scope; the
research report is supporting evidence, never a second MASTER. Only genuinely unresolved business
changes require owner decisions. This PLAN update does not commission additional application work.
The separately commissioned PO-placement BUILD retains its own delivery and verification boundary.

This file is the only canonical Purchasing Blueprint. It owns Purchasing and the governed
Purchasing → Receiving seam. Receiving owns its physical-receipt workspace and GRN facts under
ERP Architecture §3.4; §9.4 below records only the owner-confirmed seam while that page's separate
owner review replaces its stale presentation. Cross-module files keep only their ownership seams;
Git history keeps superseded designs. A screen or earlier chat cannot create a second truth.

---

## 1 · Mission and boundary

Purchasing answers five questions:

1. What must Carres buy or ask a supplier to place?
2. Why is it required, in what quantity and by which actual date?
3. Which supplier document must be sent, to whom and at which destination?
4. Which supplier outcome follows the physical receipt, repair, replacement or collection fact?
5. Which supplier-owned display goods must be received, moved, swapped or returned?

Purchasing owns supplier commitment from an approved buying need through formal document control
and the handoff to Receiving. Receiving owns the physical receipt and creates the GRN. Purchasing
does not own customer promises, physical stock location after receipt, customer delivery, customer
money or supplier payment.

| Truth | Authority |
|---|---|
| Customer order, customer promise and cancellation | Sales Orders |
| Buy reason, purchase demand remainder, supplier, PO, supplier date and `Supplier Deliver To` | Purchasing |
| Physical count, condition, Supplier DO and Goods Receipt/numbered GRN evidence | Receiving — ERP Architecture §3.4; seam in §9.4 |
| Exact Unit, ownership, custody, location and availability | Stock / Warehouse |
| Actual customer handover and delivery proof | Delivery |
| Customer money | Payment |
| Supplier invoice, settlement, credit and payment | Finance / AP |
| Customer complaint and customer remedy | Service Case |
| Stock/product supplier claim intake, supplier response and authorised stock-claim outcome | Purchasing |
| Formal Supplier Claim, Purchase Return and Repair Order execution | Purchasing after an authorised source/outcome |

The same object may appear in several modules. Only its authority edits it; every other module reads,
summarises and links.

---

## 2 · Resolution Pass and Owner Decision Gate

### 2.1 Evidence searched

The completion pass checked the former emergency-order approval law, Manual Purchase authority,
`purchase_demand` truth, PO issuance ownership, Sales Order purchasing seam, Stock Unit ownership,
Goods Receipt, independent stock-claim intake, the separate customer Service Case boundary and
Finance/AP authority. The 2026-09-14 boundary audit also reconciled the Constitution authority map,
ERP Architecture, Service MASTER and claim wording in the Copy Standard.

**Read-only implementation audit, 2026-09-24 (Operation account).** This is observed
behaviour, not approval or lifecycle completion. No PO was issued, supplier message sent,
receipt posted, or stock mutated for this audit.

| Surface | Observed | Remaining work / verification |
|---|---|---|
| SO Batch | 31 Sales Orders; 4 To buy / 27 No purchase needed. A covered SKU showed both Need PO and Already on a PO; disabled choice now explains its reason (#1589 authenticated readback). Loading and named selection summary corrected by #1573; authenticated Back retained selection. | Reconcile exact source coverage versus generic PO pool without inventing allocation. Stock-write acceptance remains separate. |
| Shared PO review | #1573 deployed; authenticated SO read-only walk verified 3 actual drafts, 1074px split, 150% zoom, 390px stacking and Back selection. Missing supplier addresses are named. | §8.2 records proof and limits. MPR has no eligible Need PO request; no real issuance or sending is claimed. |
| Manual Purchase | Internal draft and three sections exist; #1574 production walk confirmed narrow actions remain visible. The form reuses the shared Block; the Sales Order blue title is a separate opt-in. Actual-person requester verification remains open. | §9.2 responsive composition and actual-requester check. Approval and five-fact PO partition remain authoritative. |
| Purchase Orders | 63 orders; eleven-column register present. PO-20260903-4354 opened with source SO-1319 and Unit U1-000-002. Reply evidence still lacks the governed readable viewer; #1587 authenticated readback verified PO Doc Date and Supplier Confirmed Delivery Date. | §9.3 evidence and revision walkthrough. Multi-receipt and revision writes remain unverified. |
| Receiving | Fifteen-column register and real receipts visible; accepted quantity and damage were separate facts. #1574/#1577/#1578 verified controls/header/loading; #1584/#1587/#1588 verified item-linked Units, narrow item names and partial GRN paper composition. | §9.4 remaining document facts and receipt lifecycle; no posting performed. |
| Claims / Returns | Claims still showed the former twelve-column composition; Returns showed an empty register. | §9.5–9.6 approved columns, source-linked workflows and evidence. Empty Returns data proves no execution lifecycle. |
| Repair / showroom documents | Repair Orders, Display Requests, Consignment Orders, Consignment Returns and Sale Notices remained Coming soon. | §9.7–9.11 are not production-built by virtue of their approved blueprint. |
| Master data | Supplied company CSV read; Carres Klang warehouse address and NETS company address are distinct authorities. | Apply only through an existing authorised update door, preserving IDs and history; no People record creation. No company update claimed yet. |

The governed Supabase tools are available to the 2026-10-02 continuous build. Database changes
still require the reviewed SQL approval and probe/apply path in ENGINEERING §5. No database
change is claimed applied merely from a local test; never substitute a service credential or
an unrelated write door.

### 2.2 Ruling — RESOLVED FROM AUTHORITY

There are not two genuine Carres operating models.

- A Sales Order creates a system purchase demand only for the uncovered quantity.
- A person starts a non-SO buy in `Manual Purchase Request`; approval creates the same governed purchase
  demand truth.
- There is no `Emergency`, `Urgent` or `Unknown` Manual Purchase purpose, question, queue or special
  PO door. Manual Purchase carries `Proceed Date` and `Delivery Date`: Proceed Date is the actual
  successful request hand-off; Delivery Date is when the supplier's goods must reach `Supplier Deliver To`.
  Settings lead days derive `Order By`; none bypass quantity, Catalog, supplier, destination,
  approval, PO issuance or History.
- Every approved demand reaches the same PO issuance authority. Sales, Warehouse and the requester
  cannot mark goods as ordered.
- `purchase_demand` remains the canonical line-level need and coverage remainder, but it is not a
  staff destination and has no separate sidebar page.
- `SO Batch Purchase` and `Manual Purchase Request` are the two operator doors. `Purchase Orders` is the
  formal supplier commitment register.

Therefore the Manual Purchase relationship, demand truth and PO ownership are **RESOLVED FROM
AUTHORITY**. No Owner Decision remains.

### 2.3 Ruling — daily Purchasing → Receiving → GRN → Claim / Return chain

**OWNER-APPROVED / LOCKED 2026-08-29.** Purchasing and Receiving execute in their owning
modules while the shared Work Engine gives staff and managers one daily list. The governing design
is recorded in
[`docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md`](../superpowers/specs/2026-08-29-purchasing-receiving-work-design.md).

The six questions must be answerable for every open action: **who acts · which actual working day ·
where they act · what proves completion · who supervises · what consequence follows**. `My Work`
and `Team Work` project these module actions; they never store a second completion or expose manual
`Done`. These actions appear in owner-resolved `My Work` / `Team Work`; a module Register rail does
not copy them into a second local work panel.

---


### 2.4 Consolidated completion and acceptance boundaries — 2026-10-01

**OWNER-ACCEPTED DIRECTION: retain, repair and complete; no module rewrite.** The operator/page
Blueprint remains §§4–14. The following integrates the supplied defect audit with that Blueprint.
Baseline of the reported code defects: `45f43e96b`. These findings must be rechecked against the
current implementation before changes; runtime reproduction remains owed unless separately cited.
Do not call a workflow READY merely because a route, component or test exists.

| Reported break | Required business outcome / owner boundary |
|---|---|
| Proceeded SO can return to Place despite PO/Unit commitments (0500 unproceed_order) | Block that bypass where PO lineage or reserved/PO-bound Units exist; preserve Orders' governed amendment/cancellation and Purchasing's Rule 4. |
| Manual Purchase issue Work ends on numbering | End the relevant sending obligation only with current-version confirmed-sent evidence; preserve separate approval/creation states and all source quantities. |
| Extra goods only counted in receipt JSON | Record real controlled/unavailable custody and source-linked problem handling. Exact-unit and quantity-mode goods keep their respective identity rules; no invented demand, payable, or Unit IDs for counted goods. Receiving/Stock own physical evidence. |
| Claim close route has no usable UI / insufficient completion guard | Make the governed close action reachable and check §9.5 outcome/evidence; a supplier answer alone does not certify completion. |
| Claim-held goods have no reachable authorised resolution | Expose the owning goods-result action with evidence/permission; physical release and Claim paper closure may occur independently. No unconditional make-available button. |
| Replacement loses PO/source linkage | Carry exact obligation and reservation lineage and resolve the outstanding quantity once; distinguish replacement of accepted goods from fulfilment of unaccepted goods. |
| Supplier return stops at pickup | Link Return to the Stock-owned outbound handover surface; exact goods and actual pickup proof change custody, not document creation. Complete the concrete surface review before delivery. |
| Repair return stops at inspection | Stock owns Record inspection; RO links to it. Returned is not inspected; passing inspection/disposition controls availability. Existing repair implementation is incomplete, not merely awaiting a smoke test. |
| Blocked SO demand has no Work destination | Surface named blocked lines and the exact owning setup door on the PO-window Work; do not create a second task store. |
| Legacy whole-PO cancellation bypass | Trace current callers and close unsafe paths; converge on §5.8.1 evidence, source, reservation, partial-receipt and version guards while retaining history. |

Additional completion requirements: balance-date follow-up; source-required-arrival risk; MPR and
stock-allocation Work completion; shared approval assignment/actual actor; Calendar reading the same
supplier-arrival authority without conflating original, promised and work dates; accurate PO Delivery
Date copy; supplier setup links; existing purchasing_settings_gate for payment terms (no invented
Manager role); central report/export access; verified retirement of obsolete writers and shell;
exact record links; cancellation quantity in the single balance read; and outstanding send actions
remaining reachable after goods completion/cancellation. Preserve current and historical PDFs.

**Dependency order, not Cards or a new BUILD commission:** integrity → problem journeys → the
four exception rules and remaining supplier-channel work → remaining Work/date coverage → remaining
copy/links/reports/settings permissions → remaining Showroom completion. Necessary permissions,
copy and Work ship with their business capability, never postponed so a slice remains unusable.
Already delivered work is reused. Showroom continues §§9.8–9.13; it does not restart approved rules.
Outstanding Showroom Finance contracts/composition stay NOT LAW until their existing closure gate
is met. No supplier-login disablement or external cutover is included.

**Evidence and acceptance:** the complete supporting research is
[Purchasing Houzs review](../research/purchasing-houzs-review.md), including source provenance and
unverified supplied findings. Every completed capability needs an authenticated controlled business
journey, correct downstream quantities/identities, documents, actor history, permission and retry
behaviour. Unit tests and deployment versions do not replace that evidence. Never create unintended
supplier commitments or external messages for testing. The placement BUILD's 2026-10-01 completion
report states deployment/tests/settings checks succeeded but no real PO was created or supplier
message sent; do not promote that report to a full live issue-to-send journey.

---

**Order time — owner correction 2026-10-04.** The left rail lists the configured daily cutoffs once each, without dates or historical occurrence rows. A time choice filters retained SO records across dated occurrences of that time. Counts are unique unfinished SOs, never sums that duplicate an SO across dates or supplier lines. Dated Work deep-links retain their exact occurrence scope; this correction does not change admission arithmetic or saved cutoff settings.

### SO Batch complete delivery boundary — owner-approved 2026-10-04

**Bounded presentation correction — owner confirmed 2026-10-05; BUILD, production proof pending.**
SO Batch adopts the confirmed SO-derived shared listing recipe: 32px desktop baseline rows,
12px body/18px line height, natural growth for complete wrapped facts; 40px desktop toolbar with
responsive wrapping. Table/Cards belongs after Search in the existing right tools cluster; all
labels and supported controls remain reachable. This adoption is scoped to SO Batch; no shared
component behaviour or other module changes are commissioned. Listing/disabled Report stays;
Match Ready Stock remains in its existing toolbar cluster pending the separate owner discussion.

The listing heading is `Customer’s original requested delivery`, in two lines `Customer’s original`
/ `requested delivery`, using the preserved revision-1 SO request for display, date filtering,
sorting and export. Missing/TBD original evidence remains absent; never substitute a later request.
The existing current-request field remains separate and still supplies purchasing planning and
stock-priority arithmetic. This presentation correction does not change cutoffs, carryover, counts,
completion/sending, Safety Days, stock eligibility/reservation or multi-PO interaction. The independent
field-width delivery retains registry ownership. No live issue, supplier send, reservation or settings
write is authorised for acceptance.

This BUILD mission is the complete approved SO Batch operating journey, not only its rail preview.
The approved owner rulings carried by the Purchasing page-content review are persisted here for
execution. Missing implementation does not reopen these decisions.

- **Register and navigation.** Keep one retained, date-first Listing. Unfinished work precedes
  Done; chronological Proceed Date remains the default. Table and Cards are two presentations
  of that same shared Register, using CompactModuleCard and the governed module-card grammar.
  Page tools offers None / Supplier grouping; grouping changes presentation only. Listing / Report
  remain in the left rail; Report content is deferred. Column filters supply detailed facts;
  the rail supplies complementary aggregates and configured cutoff access, without repeated
  Product/Supplier filters. The current Order time correction above replaces dated occurrence rows.
- **Optional whole-round Ready Stock.** Customer demand defaults to purchasing. A manual action
  computes non-overlapping suggestions for the selected buying scope in the same Listing.
  Location is selectable, defaults to Carres Klang, and changes candidate stock scope only.
  Default allocation priority is earliest Customer Requested Delivery Date, then earliest Proceed
  Date, with undated demand after dated demand; priority is configurable in Purchasing Settings.
  FIFO selects otherwise eligible exact Units. Matching preserves goods compatibility, ownership,
  availability and existing reservations. Suggestions show quantity/location and appear first;
  browsing, matching and ticking reserve nothing. Bulk selection and Proceed accept chosen offers
  through the existing Sales Order-owned reservation door, with fresh eligibility/remainder checks.
  Only successfully saved exact reservations reduce purchase quantity; unmatched quantity continues
  to purchase. Keep the individual customer/item Unit chooser, including location choice, available.
- **Inspection and placement.** Listing selection opens the governed right-side Quick View for
  source facts, evidence and authorised source-bound actions. Ordinary SO Batch introduces no
  extra information-review gate or Jess approval round. Issue the prepared eligible scope through
  the existing issue authority, separating compatible supplier/destination documents. Partial
  failures retain actual successful POs; retry only remaining unissued scope, with no duplicate
  commitment. The shared Working Panel/Quick View must be proved integrated; a preliminary HTML
  or a PDF viewer alone does not prove it.
- **Formal PO full page.** View shows the complete original PO information and its actual current
  PDF in a 50/50 composition. Opening it does not enter Edit. Explicit Edit enters editing.
  Keep individual PO/version, supplier, destination and source identity and a return to the buying
  scope. Do not substitute a supplier summary or PDF Modal for the complete PO object.
- **Supplier sending.** The issued result remains available in the right-side task panel by
  supplier, numbered PO and version. Its complete approved document/channel rules are in §8.2.
  Sending is separate from issuing and receiving; preparation never records sending. Real Email
  remains unavailable until actual sender/provider configuration and dispatch capability are
  verified. WhatsApp sends remain an external human action with source/version-bound confirmation.
- **Delivery acceptance.** Verify actual authenticated production rail, retained Register,
  Table/Cards/grouping, whole-round and individual stock choice, Quick View issue/partial retry,
  formal PO information/PDF view and supplier preparation/evidence recovery. Preserve the exact
  source/stock/PO ownership and permission contracts. Deployment SHA convergence is necessary,
  but cannot replace these workflow proofs. No live supplier transmission is authorised merely
  for verification. The original mission remains incomplete while any required capability or proof
  is missing; confirmed deferred Report content is excluded from this delivery boundary.

**MEASURED OPEN TARGETS, 2026-10-04.** Whole-round non-overlapping stock suggestions/location/
priority/bulk acceptance, SO Batch shared Table/Cards/Page tools presentation, complete source
Quick View actions still require implementation or direct proof. Formal PO read-only 50/50
original-information/current-PDF composition is now deployed using existing facts and PDF
components; 54 PO Register/object tests pass, including the actual shared DataGrid opening a PO,
read-only opening, separate explicit issue
work and cancelled-document refusal. Desktop actual-component sample acceptance shows equal facts/PDF panes with the real PDF renderer
(`/tmp/so-batch-po-readonly-split-preview.png`); the local fixture rejects all writes. At 390px the original facts stack above the PDF and the complete paper fits the pane
(`/tmp/so-batch-po-readonly-mobile-preview.png`). The shared canvas hook now retains paper aspect
ratio while fitting the current pane across resize. PR #1880 merged as
`50c548ae985cf6094d14712d278ff1f0703e85b2`; production run `37201311503` succeeded and
independent ERP/POS/Worker SHA convergence passed on all five destinations. Authenticated
production PO `PO-20260902-8370` opens read-only V1 with its actual PDF; at a 1400px viewport
the two panes each measure 530px. Evidence: `/tmp/so-batch-po-live-desktop-split.png`.
Browser return retains the original `time=11:00` Batch scope. The authenticated PO Register
selected-download action produced `/Users/chaichiewlim/Downloads/Purchase-orders.zip` at
2026-10-04 20:35 MYT: one selected PO, exactly one `PO-20260902-8370-V1.pdf` entry (26,847
bytes). The browser download-event observation timed out, but the actual filesystem archive
proves completion. Result-group return, multiple selected live POs and the remaining complete
workflow still require direct acceptance. A real-grid facet callback render loop found during
this walk was corrected by retaining unchanged membership, with a real-grid integration regression. Existing individual stock reservation, guarded issue and current-version evidence
are reusable authorities, not permission to infer whole-round or shared-panel completion.

**Whole-round capability measurement, 2026-10-04 — LOCAL BUILD, NOT OPERATOR DELIVERY.**

| Capability | Existing source / readiness | Delivery boundary |
|---|---|---|
| Compatible available Unit candidates | `readFreeStock` reads the authoritative stock register availability; per-order Ready Stock supplies compatible line IDs | Reuse; candidate location identity, ownership filtering and canonical remainder integration must be verified |
| Non-overlapping whole-record suggestions | Existing To Order P10 allocation and 113 tests; READY for reuse | Extracted `allocateWholeStockRecords` is shared by existing To Order and the new round matcher, not a second allocation implementation |
| Customer-date / Proceed priority, site scope, FIFO | New `matchSoBatchReadyStock` adapts that proven allocation, with 9 tests | Actual Listing now offers manual matching and Stock Location; persisted priority Settings and production acceptance remain open |
| Exact Unit acceptance | Existing Sales Order-owned `/ready-stock/save` / reserve doors | Actual Listing selection/Proceed now reuses this door; local tests prove exact confirmation, visible-scope restriction, partial success retention and lost-response readback; production acceptance remains open |

122 combined old/new allocation tests and shared type checking pass locally. Stable warehouse
identity is carried on candidate reads and used for location matching; two locations sharing a
display name cannot borrow each other's stock. Suggestions do not
change original demand or saved reservations. The matcher excludes supplier-owned, counted,
already-reserved and blocked stock; it refuses conflicting repeated Unit facts and duplicate
source lines. The actual Listing now shows suggested quantities and location, places rows with
suggestions first, and accepts chosen exact Units through the existing reservation door. Matching
and ticking write nothing. Definite refusal retains remaining choices; an unknown outcome reads
back exact held Units and blocks replay when that read cannot confirm the result. Eight hook
tests and 154 existing Register/page tests pass locally. Candidate reads now page the complete
available-stock source and fail closed on unreadable data; 36 route tests include the 1,001st
candidate and source failure. Order-relative `no_line_needs_it` rows do not falsely conflict with
another customer's compatible candidate. Persisted priority Settings and authenticated production
acceptance remain open. The per-order Ready Stock read now obtains remaining demand from the existing
`so_line_remaining_requirement` RPC, shared with issue/reservation. Source-linked Units are not
counted again in independent stock coverage. 34 route tests include linked-PO overlap and
fail-closed canonical-read errors. The individual picker also excludes supplier-owned goods from
available customer-sale quantity and choice while retaining readable ownership facts and existing
saved-choice removal. The individual picker now selects Stock Location, defaults to Carres Klang
when present and keeps chosen/saved Units from other locations visible; location changes write
nothing. 44 picker tests pass, including a saved Unit outside the default location. These stock
changes are local build facts, not production proof.

**Ready Stock priority Settings — LOCAL BUILD, production proof pending.** The approved default
Customer Requested Delivery Date priority and optional Proceed Date priority now share one
persisted `purchasing_settings.ready_stock_priority` value. Migration 0650 adds the default and
the existing manager-gated, row-locked, audited Settings write door. The Settings page preserves
the chosen value on failure; SO Batch receives that source value and refuses Match when it is
unreadable. A match retains the priority read when it started, so changing Settings cannot move
already-ticked Units onto another customer's order. Subsequent manual matches use the new value.
The new Settings UI/route and allocation behavior are local implementation. Migration 0650 was
applied to the existing production project through the governed migration tool at tracker version
`20261004132354`. A rolled-back SQL proof confirmed that an unauthenticated write is refused,
an authorised principal can change the value and produces the exact old/new actor audit, and the
original `customer_delivery` value remains after rollback. Anonymous execution is revoked;
authenticated execution intentionally uses the same internal manager gate as other Purchasing
Settings writes. The advisor's exposed-definer notice is intentional for this guarded RPC, not
an unguarded grant. Nine loader, 30 Settings route, 39 Settings UI, 133 Register and nine hook
tests passed; API/web type checks and design/migration guards passed. Full CI `37205634561` passed on exact head `10ba421a5515a1690698f59437048b49f6cbc5aa`.
PR #1885 merged as `262d88b8966db29ac0c2a78de5adf3167eda49d9`; deploy `37206517472` succeeded and independent smoke verification confirmed the exact SHA
on all five canonical endpoints. Authenticated production Settings shows `Customer Requested
Delivery Date`; the existing shared Operation account can read it but has the control disabled,
with the existing named-manager explanation. No production setting was changed. Evidence:
`/tmp/so-batch-priority-live-settings.png`. The source read, manager refusal and rolled-back SQL
save/audit proof are distinct from a live manager Save journey, which was not performed. This does not close
the full SO Batch boundary above.

Authenticated production acceptance also found that the Batch Purchase Orders toolbar opened
an empty result panel after a fresh mount because it relied only on browser-held issue results.
The local correction loads the exact deduplicated PO lineage of visible Register rows through
the existing permission-bound issue-context reads, including retained completed rows. Shared
DataGrid search and column filters determine membership; no broader supplier pool is substituted.
All reads must succeed with matching PO identities before the panel opens. Starting a new read
closes the old result scope. A failed read says `Supplier details could not be loaded.` and offers
`Try again` on the same exact PO read, rather than presenting an empty or stale PO answer.
23 page journey and 131 actual Register tests passed, including fresh-mount recovery, search scope
and failed-read retry without a write. PR #1882 merged as
`631c115f52b20545f1725069fea6e21500126755`; deploy `37205103865` succeeded and all five
canonical endpoints passed independent SHA convergence. After a fresh production mount, search
`1328` yielded one retained SO; Purchase Orders recovered exactly `PO-20260902-8370` V1 under
Nice Future, with its original source, destination, channel and existing sent evidence. No issue
or supplier transmission occurred. Evidence: `/tmp/so-batch-live-po-recovery.png`. Searching
`7907` matches multiple SOs sharing that PO; result preparation uses each matching SO's complete
PO lineage, so sibling supplier POs remain legitimate and must not be mistaken for stale scope.

Authenticated production matching of `SO-1365` read its real source and showed zero available
Units at the default Klang location. Cancel restored the ordinary Listing; no reservation or
issue was performed. The empty candidate list exposed `site:Carres Klang` as a label; the local
correction retains the readable default location option even with zero candidates. Match and PO
recovery controls now refuse interaction during the initial Register load. PR #1887 merged as
`96e7faf58b3a1591c6eacdf396965f2b0bf7829f`; deploy `37207938377` succeeded and independent
five-entry SHA convergence passed. The corrected empty-stock label still requires direct
production UI acceptance. Evidence of the discovered empty-stock state:
`/tmp/so-batch-live-stock-empty.png`. Positive live stock selection, whole-scope acceptance,
multiple selected live PDFs, Quick View and Table/Cards remain open; this bounded proof does
not complete the mission.

**Shared Quick View / Table / Cards — LOCAL BUILD, production acceptance pending, 2026-10-04.**
The actual Register now opens the kit compact-card Drawer from SO No, row double-click or View.
Its CompactModuleCard header reads exact Sales-owned SO facts; neighbouring search results,
failed reads and placeholder data cannot supply another customer's phone, address or sales facts.
Missing reads remain explicit with retry. Goods and stock selection use the existing item
expansion; PO lineage remains separate in Order details. The panel issues only its own prepared
SO scope, retaining other selected SOs, and recovers only its exact deduplicated existing POs.
The explicit full-page door retains the source SO destination. Table and Cards share one DataGrid
filter/sort scope, selection and footer; URL presentation/group parameters preserve cutoff/deep-link
scope, and the kit remembers volatile Register context across object return. Supplier grouping
uses the exact supplier set for each SO; multi-supplier SOs are never duplicated across groups.
138 Register tests, four exact-header/failure/PDF-close tests and 23 whole-page issue/evidence/retry tests
pass locally. Page journeys use distinct real-grid session keys between tests while retaining
the same session across a journey's remounts; this prevents one test's search from hiding another
test's SO without disabling production context retention. Type checking and design guard pass.
Actual sample component acceptance confirms selected SO retention across Table/Cards and
filtered `1 of 6 Sales Orders` parity on desktop and 390px. Evidence:
`/tmp/so-batch-quick-view-ready.png`, `/tmp/so-batch-cards-filtered-desktop.png`,
`/tmp/so-batch-cards-filtered-mobile.png`. The sample refuses every API write; it is not live
issuance or reservation proof. Release and authenticated production walkthrough remain required.
At 390px the module toolbar wraps its labelled controls; Purchase Orders is fully visible
(x=20 to 142 within the 390px viewport), the page width remains 390px and keyboard Enter opens
the result panel. This corrects a locally observed clipped toolbar control without changing the kit.
After mainline integration the saved-source document preview uses the kit's current close callback;
PDF close restores focus to the same source entry and reopening retains the SO panel. Its four
adapter tests and four actual saved-document tests pass; the earlier CI type rejection is not
accepted as delivery proof.
The full CI then passed 4,030 API and 6,311 web tests but rejected one internal stock callback
parameter as a visible banned word. The flag is now named `isPending`; approved PO Status copy
and the guard remain unchanged. All 126 copy-guard tests and four compact-view tests pass locally;
the fresh full CI is still required before release.

**Additional authenticated stock acceptance, 2026-10-04.** In the actual `time=11:00` scope,
manual whole-round matching offered SO-1368 exact Unit `U1-000-180` at Carres Klang (New,
received 14 Aug, original reference `PO/2608-068`). The eligible suggestion appeared first;
other unmatched SOs showed zero available. Ticking that Unit enabled Proceed and showed one
selected SO. Clear then Cancel restored normal purchasing, with the individual item chooser still
showing `1 available 0 reserved`. Its own location was Carres Klang; ticking enabled Choose Ready
Unit and clearing returned to no Unit chosen. No Proceed/save/issue was performed. Evidence:
`/tmp/so-batch-live-positive-stock-choice.png`, `/tmp/so-batch-live-individual-stock-choice.png`.
The initial live Register load also showed Match and Purchase Orders disabled. These prove
positive candidate/selection and read/loading behavior, not live reservation acceptance.

**Supplier PDF source/recovery measurement, 2026-10-04.** Actual production search `7907`
matched 12 retained SOs. Nice Future preparation deduplicated their lineage to three selected
V1 documents: `PO-20260903-7907`, `PO-20260903-4585`, `PO-20260903-6426`. Download produced
`/Users/chaichiewlim/Downloads/Purchase-orders-00000000-0000-0000-0000-0000000000e2.zip`
with exactly those three independent PDFs (31,165 / 26,926 / 26,696 bytes). Archive CRC, unique
entry names, PDF headers and EOF markers passed; no PO or sending evidence was written.
Original source/version/destination and earlier sent evidence remained separate per PO.
The supplier UUID exposed in the archive name is locally corrected to the readable supplier name;
individual official PDF filenames and stored identities remain unchanged.

Ohana's retained `PO-20260903-4316` and `PO-20260903-9389` could not prepare PDFs. Read-only
production data confirmed both are open and their original Ohana destination has no address.
The local panel now names the affected PO with the governed address/Settings refusal rather than
generic preview trouble. Failed or mismatched/draft/invalid-version source documents cannot supply
a sendable message. Readable sibling documents remain visible; selecting a failed document blocks
copy/download/send, while deliberately deselecting it permits the exact readable selection. Try
again rereads the same supplier document identities without issuing, reserving or sending.
35 supplier preparation/archive tests pass. Actual write-rejecting sample UI shows SAMPLE-PO-001
unavailable beside readable SAMPLE-PO-002 V2, disabled preparation, then recovery of the same
selected V1/V2 set via Try again. Evidence: `/tmp/so-batch-supplier-source-failure.png`.
PR1895's exact head `a08d9e88a3b569a08eaf4ea58d8b2a0445e9e01d` passed full CI
37212749130. Main merge `88c6386ecbc73a71ea5c174935d1fb2571277f5c` passed deployment
37213740791 and an independent five-entry convergence probe. Authenticated search `7907` retained
12 SOs; Ohana's two failed sources now show their exact PO and the governed address/Settings
reason with Try again. Retrying does not invent an address or enable preparation of unreadable
documents. Nice Future retains its three actual V1 documents and the earlier sending evidence
separately; selecting only `PO-20260903-7907` produced
`/Users/chaichiewlim/Downloads/Purchase-orders-Nice_Future.zip` with exactly
`PO-20260903-7907-V1.pdf` (31,165 bytes). Its timestamp, archive CRC, PDF header and EOF passed.
Evidence: `/tmp/so-batch-live-supplier-address-refusal.png`. No destination address, issuance,
reservation or supplier transmission was changed for this verification. Missing source addresses
and actual sender/provider verification remain operational gaps, not successful transmissions.

**Supplier preparation return and Batch document display — PRODUCTION-VERIFIED bounded scope,
2026-10-05.** PR1900 exact head `81ea80c66766bf415dfbf697637ff5a290f5c48e` passed complete
CI 37215990410. Main merge `719653ea01df0b03901c2b9e890e53be8cb68b00` passed production
deployment 37216102072 and the independent five-entry convergence check recorded in
`/tmp/so-batch-return-live-smoke.log`. All 274 integrated Batch Register/details, supplier bundle,
Batch page and formal PO page tests passed; the upstream test-only date-clock correction retains
all business assertions and passed the complete 95 Manual Purchase API tests.

Authenticated production acceptance selected Nice Future and only `PO-20260903-7907`, leaving
4585 and 6426 unticked. Its exact full PO opened read-only with original supplier/destination,
goods/source facts and the actual Document preview. Back restored Nice Future, the one-PO subset,
WhatsApp channel and editable introduction. A second pass restored Email, the edited subject and
introduction. Preparation remained disabled during fresh source reads and became available only
after current PO/version/context evidence completed. Closing the panel retained search `7907`,
Table, Supplier grouping, `time=11:00`, and the same 12-of-32 population. Evidence:
`/tmp/so-batch-live-return-retained-draft.png`, `/tmp/so-batch-live-return-email-draft.png` and
`/tmp/so-batch-live-return-formal-po.png`. No live issue, reservation or supplier transmission was
performed. Send Email remained disabled because actual provider/sender availability is unverified.

Returned presentation state supplies no issue/send authority. Today refreshes current membership
and drops removed selections without replacement. A restored undated Round refreshes each exact
PO's owning issue context and supplier contact. A failed or mismatched source blocks preparation;
Try again retains the supplier, subset and editable draft. Round and Today loading gates remain
independent. Fresh-version/contact, removed-membership and repeated failed-source retry behavior
is verified by controlled component tests, not by deliberately corrupting production records.

Batch Register/context, Quick View lineage, expanded PO detail, supplier preparation/evidence/PDF
headings and the formal PO heading/current action reuse `documentDisplayNumber` with actual known
versions. Production showed `PO-260903-7907-V1` while navigation used exact stored identity
`PO-20260903-7907`; supplier message references and official PDF content/filenames retained their
original issued references. Search accepts original and shortened forms. Missing versions remain
unclaimed; Unit IDs and supplier references are unchanged. This verifies the Batch adoption only,
not every Purchasing display surface or the complete SO Batch delivery boundary above.

**PO issuance/retry — current production transaction proof, 2026-10-05.** The existing
`purchasing_issue_pos_batch` was exercised as an eligible active Operation actor against SO-1368's
exact line, current Catalog cost and its governed Nice Future → NETS → Carres Klang arrangement.
Inside mandatory-rollback blocks it produced one exact source and one line-bound incoming Unit,
reduced remaining demand to zero and refused duplicate issue with `unknown_demand`. Deferred
constraints were checked explicitly. A second document's `unresolved_supplier` refusal rolled
back the first document, its Unit and numbering; retry added exactly one source commitment.
The final deliberate exception rolled back the complete probe. Separate fresh reads proved zero
probe POs, formal-code claims, Units, sources and audit rows; the Unit series remained 1/328 and
the buying remainder remained one. Evidence: `/tmp/so-batch-issue-rollback-proof.json`.
No committed purchase, supplier transmission or lasting number allocation was made. This proves
the current database issue/retry door; exact-head CI 37215990410's 100 API and 41 actual-component
issue cases cover the route and guided interaction, with their transport boundaries explicit.

**Deployed display acceptance, 2026-10-05.** At a controlled 1200px viewport, the actual formal
PO document contained two equal 516px panes and one rendered PDF canvas. The 390px Cards check
retained search `7907`, Supplier grouping and 12-of-32 records; Match Ready Stock ended at
333px and the header Purchase Orders action at 142px, both inside the viewport. Normal browser
sizing was restored. Screenshots: `/tmp/so-batch-live-formal-po-desktop.png` and
`/tmp/so-batch-live-cards-390.png`. This is the deployed composition, not a preview fixture.

**Ready Stock save — current production transaction proof, 2026-10-05.** The exact existing
`so_batch_reserve_ready_units` door was exercised with eligible `U1-000-180` and SO-1368's exact
item line inside a deliberately failing atomic SQL statement. It reserved one Unit, bound that
exact line, wrote one usage record and reduced the line's remaining buying requirement from one
to zero. Repeating the pick returned `unit_no_longer_free`. The mandatory final exception rolled
back the entire statement; a separate fresh read proved the Unit free, its line binding null,
remaining buying quantity one and no verification usage row. Evidence is
`/tmp/so-batch-stock-save-rollback-proof.json`. This is database-door proof, not a claim that an
operator saved a production reservation. No PO number or permanent Unit identity was minted.
Current production draw/batch definition MD5s remain
`72864ee598da7659dbd01281875edb8b` / `fde9ffbfcdd4472e29a6cac8aaebf395`.
Exact-head CI 37215990410 also passed 45 isolated reservation SQL cases, 36 Ready Stock route
cases and nine whole-round component cases; their boundaries remain distinct from this probe.

**Quick View and Cards production acceptance, 2026-10-04.** PR1891's exact head
`49f838c700a57bc9d996c287d378676757ffdc0e` passed full CI 37211199979. Its main merge
`6ce2f07f24c46bbb543bf77f0f21e4890a801b08` passed deployment 37212252302 and an independent
five-entry production convergence probe. Authenticated SO-1368 Quick View read its own phone,
address, Sales Location and salesperson. Its actual saved SO PDF rendered; Close PDF restored focus
to the same document entry, and reopening retained the SO panel. Items showed exact B1201S King,
Nice Future, Carres Klang and `1 available 0 reserved`. Selecting it opened a one-unit/one-PO
preparation containing only SO-1368; final issuance was not pressed. With SO-1365 and SO-1368 both
selected, Table and Cards retained the same `3 of 32` search/cutoff scope and two selected SOs.
The SO-1368 card opened only its own one-unit preparation; Back retained Cards, search, cutoff and
both selections. Narrow-screen filters are an overlay and must be closed to reach controls beneath.
Supplier grouping retained three unique SOs in both Table and Cards: one SO in the exact
Hookka Industries / Ohana set and two in Nice Future, with `3 of 32` unchanged. The multi-supplier
SO was not repeated in separate supplier groups. Evidence: `/tmp/so-batch-live-cards-supplier-group.png`.
Evidence: `/tmp/so-batch-live-quick-view-source-pdf.png`,
`/tmp/so-batch-live-quick-view-goods.png`, `/tmp/so-batch-live-quick-view-own-issue-preview.png`,
`/tmp/so-batch-live-cards-filtered-selection.png`. This proves the real preparation/source/read
journey, not completed live issuing, saving stock or transmitting to a supplier.

### SO Batch PO Status — owner-approved 2026-10-04

Column/filter title: `PO Status`. In that named context use `Pending`, `Partial`, `Done`.
Standalone cards, other pages and notifications use `PO Pending`, `PO Partial`, `PO Done`.
Always spell `PO`, not `P.O.`. `Issue PO` remains the action verb.
Calculate across every SO item and its exact supplier/PO lineage, not the presence of one PO.
Exclude successfully confirmed eligible Ready Stock reservations from quantity requiring purchase.
`Pending`: purchasing quantity remains and none of that required purchase quantity has been issued.
`Partial`: some required purchase quantity has valid PO lineage and some remains unissued.
`Done`: no required purchase quantity remains unissued, including an SO fully fulfilled by confirmed
Ready Stock. Done expresses purchase-task quantity completion, not a claim that a PO exists, was
sent or was received. Unconfirmed matches never qualify; failed/unknown coverage reads cannot
produce Done. Pending/Partial remain above Done in the retained listing, ordered by Proceed Date.
This overwrites the earlier SO Batch parent/item `Need PO` / `No PO needed` presentation;
Manual Purchase's independent approval/request grouping is unchanged. Target approval is not build
or production verification. Supplier communication evidence and Receiving remain separate facts.


### Receiving delivery state — 2026-10-04

**BUILD IN PROGRESS; partial production acceptance.** Shared two-digit-year GRN display and
original/short register search shipped in #1890 (`0b2b37ba4`). Exact-head full CI
`37208414732` and deployment `37209394804` passed; all five production surfaces converged.
Authenticated browser acceptance on 2026-10-04 found the same receipt using both
`GRN-20260904-1064` and `GRN-260904-1064`, with the short number in the register and full
record heading. Supplier DO `DO-SMOKE-B` and Unit `U1-000-064` remained unchanged.
The saved PDF preview canvas also showed the short number. Download completion was not verified.
Issued historical PDFs were not changed.
Stored identities, supplier references and Unit IDs are unchanged; other modules still need
explicit adoption, so this does not establish system-wide completion.

The Receiving Working Panel merged in #1894 (`c335716a1`), with full exact-head CI
`37211169952` passed. Its receipt-panel journey is **PRODUCTION VERIFIED** on covering deployment
`37212252302`, commit `6ce2f07f24c46bbb543bf77f0f21e4890a801b08`, with independent five-surface
convergence. Authenticated browser acceptance opened `GRN-260904-1064` from a filtered list,
verified 0 received / 1 damaged, exact Unit `U1-000-064`, original supplier DO, physical arrival
facts, source PO link and actor-stamped timeline with the short GRN. Unavailable saved evidence
remained explicitly unavailable. Closing returned the same one-record search; Open full page
opened the same GRN and its history also used the short number. Row selection
uses the existing `Drawer` + `CompactModuleCard`, receipt-only quantities, actual arrival facts,
source-owned evidence and history, and `Open full page` to the existing GRN/PDF/edit object.
Local shared-kit preview verified the receipt header, cancellation indicator and details
disclosure at 366px. This verifies the read-only panel journey, not Warehouse posting or claims.
The list remains mounted. Refreshed quantities and goods use the same receipt payload; old Unit
results without a source-line identity remain unavailable rather than being joined by SKU.
The live `GRN-260904-0210` panel retained its Cancelled indicator; ordinary GRNs gain no
Completed/Valid badge. No receipt, stock or supplier action was submitted during these checks.
Related-record PO and recorded source references are production verified. Claim/Return links
are deployed in #1907: the existing authenticated receipt detail reader loads
all claims by exact `warehouse_receipt_id`, direct receipt-linked returns and returns linked
through those claims, deduplicated by return identity. Reads use the actor's existing RLS scope;
no new permission or write door. The shared Working Panel links each returned identity to its
existing owning object. Failed reads show Unavailable/retry, never a false empty list.
Local relationship validation covered full-page reads, exact receipt/claim scopes, deduplication
and failure preservation. Production verified the exact SC-1019 link from its receipt; no current
Return fixture was available, so Return navigation retains automated evidence only.

**Two-view rail / Differences — DEPLOYED, BOUNDED LIVE ACCEPTANCE, 2026-10-05.**
The existing Receiving rail selects GRN Records or Receiving Differences. Category, Received with
and Cancelled GRNs use the shared list Popover; supplier, Site and dates use existing column
filters. Old URL filters and clear actions remain supported. Differences uses recorded receipt
damage/wrong/extra quantities, exact Not received Unit outcomes, and unposted draft/submitted/returned
reports before pagination. Cancelled GRNs remain in Records. A failed physical-outcome read fails
the Differences view; it never pretends there were no missing goods. No historical counted-goods
shortage is inferred from current PO balance. Discrepancy facts retain their linked handling
records; this view does not decide Claim/Return completion or provide manual Done.
Explicit unposted reports have no generated GRN identity; the Working Panel says Receiving /
Not issued, retains the record ID for navigation, and shows recorded Unit outcomes/recount reason.
Existing posted/cancelled historical GRN identities remain unchanged. View changes do not borrow
the other view's cached population. PR #1907 passed full CI 37225888964 and deployed as
`629ece995237d8a48c28c725d0d7e339507038bd` through successful run 37226814237; all five production
proof endpoints converged. Authenticated live acceptance verified seven GRN Records, two Receiving
Differences, shared Received with/Category filters, exact receipt GRN-260904-1064 → SC-1019 and
browser Back retaining Differences; the same two receipts also rendered in Cards. The live
Differences Excel export was inspected and contains exactly those two receipt records with
their accepted/damaged quantities and governed short GRN numbers. List PDF remains unverified:
the live action produced no observed preview tab or saved file, without a console error;
the shared UI chat has this bounded finding. No test
transaction was created. A raw eight-digit GRN date on the linked Claim page was found and its
shared display-format adoption is corrected on the Calendar continuation branch, not yet deployed. Live unposted/Return fixtures
were unavailable; those cases retain automated evidence only. Whole Receiving is not complete.

Complete server-side column filtering and sorting are
**PRODUCTION VERIFIED, 2026-10-05** through the shared `DataGrid serverColumns` contract and
existing authorised GRN reader. Supplier, document, source, item, location, date and quantity
facts resolve before pagination. Unit details and signed files remain page-scoped. Changed
filters/sort return to page 1; choices cover the complete searched/rail-filtered population.
Filtered totals/facets share one arithmetic. Source/PO numbers use the shared two-digit-year
display; stored identities and supplier DO references remain unchanged.

#1899 passed exact-head CI `37214055018`; the shared narrow-menu correction in #1901 passed
CI `37217770861` on `c4f8b10ec`. Deployment `37218697773` succeeded and all five canonical
surfaces independently converged to `5c04b6625a0bd2f6bfc19f03400e7bfae0308195`.
At the actual authenticated 545px Receiving viewport, the supplier menu measured 337–537px;
Ohana filtered seven records to three, Received Qty descending put the two-unit receipt first,
and Clear restored all seven. The beyond-page boundary is separately proved by API/tests and
an actual 61-record shared preview with only five rows loaded; production currently has seven.

**Table/Cards and shared Page tools — PRODUCTION VERIFIED, 2026-10-05.**
Receiving uses the shared segmented control, DataGrid Page tools and `ReceivingCompactView`
for Cards and the right Working Panel. Search/column filters/sort persist across presentations;
changing view starts at page 1. Table pages contain 50 receipts, Cards 12; footer totals cover
the complete authorised result. Detail loading/failure never pretends a party/receiver is absent.
The live three-record Ohana filter remained identical in Cards and Table. Opening full GRN
`GRN-050826-2973` and returning preserved Cards and the supplier filter. Shared Page tools
opened its 15-column control; no column setting was changed. All temporary filters/sort were
cleared and Table restored. The local register/Receiving/card run passed 171 tests.

Bundle proof against the preceding release's own deployment
`https://6be3a617.carres-portal.pages.dev`: `index-BkDrOL2X.js` → `index-D7wV4aOD.js`;
`receiving-cards` 0→1, viewport-clamp string 0→1, retired fixed filter style 1→0,
`GRN Doc Date` control 6→6. This acceptance covers these list/card controls only; it does not
close Receiving Differences, linked Claim/Return handling or Warehouse automatic posting.
Formal GRN preview and Download PDF are verified. An authenticated fresh production tab downloaded
`GRN-260904-1064.pdf` (26,972 bytes); extracted text confirms the short number, original
`DO-SMOKE-B` and Unit `U1-000-064`. The older tab failed to save downloads; no PDF code change
was needed. The shared-kit wrapped-label correction is production verified through #1906: full CI
`37221701382` and deployment `37222437753` passed; all five canonical surfaces match
`d4cca587587b64117a41625e3ca9631e1a873530`. Every Wrong Item Qty label clears its quantity
by 4px at desktop 1280px and the actual 545px viewport. Shared UI MASTER holds the stylesheet
negative-control and live screenshot evidence. This does not close the remaining Receiving scopes.

**Complete filtered-result export — PRODUCTION VERIFIED, 2026-10-05.**
Receiving supplies the shared DataGrid export loader with the current search, rail/column filters
and sort. The existing authorised GRN reader resolves the complete result in one request,
ignoring display offset/page size; it does not sign receipt files or load Unit expansion for this
list export. Excel/PDF keep the same shared visible-column order, values and renderer. Selection
export remains selected-only. Failed or incomplete reads create no partial file and permit retry;
a second click cannot start a duplicate export. The register page/presentation stays in place.
Local browser-generated workbooks contained 61 records with five loaded, then exactly the one
record for Supplier B. API tests prove full-population filtering/sort; client tests refuse an
incomplete response. The combined register/Receiving suite passed 176 tests and the receipt API
suite passed 61. Exact-head full CI `37219247916` passed on `c09ecf1d7`; #1905 merged as `a087fec9a`. Deployment `37219944735` passed and all five canonical surfaces converged to `a087fec9a`.
Actual production Excel files contained all seven receipts and exactly the three Ohana receipts
when exported from filtered Cards. Short Carres numbers and original supplier DO references
were preserved. The PDF list renderer is covered by tests; its live download is not claimed here.

**Shared Calendar — DEPLOYED / BOUNDED LIVE ACCEPTANCE, 2026-10-05.** PR #1908 passed exact-head
CI 37229951282 and production run 37230876813. An independent check found both Pages projects,
both custom domains and the API at `eeedfe361083717c97c701fa33075c1398b5aa88`. Stock MASTER §7
owns the full-population arrival read and quantity/date rules. Authenticated desktop acceptance
showed three actual GRNs on 4 September (physical quantities 1, 2 and 1), with the cancelled GRN
absent; its exact GRN link opened the existing receipt/PDF page. On 17 August, expected PO-2053
showed Pending Delivery Qty 1 and opened its exact Inbound source/Site/date. The selected day,
Warehouse module and Carres Klang filter survived navigation. Phone 390×844 displayed the same
Calendar and kept it open while selecting a date. One phone edge remains open: tapping a source
already current leaves the Calendar covering it. The continuation adds an explicit record-open
callback; the regression failed before the fix and 82 Calendar/shell tests pass afterward.
That correction still requires its own production verification. No second Calendar page was
introduced and no receipt/stock write was made. Current module choices cover Warehouse and
Delivery; broader module-event admission and automatic Warehouse posting are not claimed complete.
The same phone preview exposed a full-GRN header/Linked PO display bypassing the shared short-year
formatter. The continuation corrects both display sites; stored source IDs and historical PDFs
remain unchanged. The existing full-page regression checks the short PO at both positions.
Downloaded predecessor/current bundles prove `Filter by module` 0→1, the old
`title:"Receiving",tone:"text-success"` block 1→0, and `Receiving Differences` control 1→1.

**Read-only production evidence, 2026-10-04:** `warehouse_submit_receipt` still files a report;
`warehouse_receipt_check_in` calls Operation's post-authority gate. The only current active
Warehouse account has `is_person=false`; it is not proof of individually authorised Warehouse
confirmation. Receipt JSON on current test rows has no `expected_qty` snapshot. Do not infer a
shipment's shortage from today's cumulative PO balance. Warehouse automatic posting, invalid
report preservation and individual actor/Site controls remain approved targets, not built.
NETS account activation/cutover still requires its separate explicit authorisation.

**Missed-arrival Work ownership — DEPLOYED, LIVE WORK SCENARIO NOT VERIFIED, 2026-10-05.**
A supplier date without a physical report no longer creates Receiving Check in work. The existing
Purchasing supplier-date-passed action owns that follow-up under PO Duty and opens the exact PO.
It now reads the same per-line/split arrival authority as the register and day-before check,
including the source PO date when no evidenced supplier answer supersedes it. The earliest passed
outstanding arrival anchors its Office work date; a later answer on another line cannot hide it.
Today's/future arrivals, fully received goods and unsent revisions do not create a passed-date task.
Existing submitted physical reports retain their exact-session action and GRN Duty cover. This
correction does not implement individual Warehouse automatic confirmation or remove its database
approval boundary. Local validation: 61 API Work/probe tests and 84 shared receipt/PO/Work tests;
API typecheck and full CI passed. The correction deployed with #1907 and all five production
proof endpoints converged; an authenticated missed-arrival Work scenario remains unverified.

### 2.5 Receiving end-to-end assurance review — 2026-10-04

**PLAN evidence and recommendation; not production acceptance.** Scope is the entire Receiving
journey from a committed source and expected arrival through physical receipt, GRN, differences,
replacement/return and Finance handoff. It does not reopen the whole Purchasing business model.
The 2026-10-04 owner rulings in §§7.3/9.4 bind this review. This section adds no approval of new
business rules, UI words or external cutover. Existing authority answers ordinary workflow choices.

**Resolution and evidence.** Purchasing §§7.1–7.4/9.4–9.7, Stock §7 and receipt blueprint,
Workspace §6.1 action catalogue, UI §0/§5, COPY Receiving dictionary and Finance §§1–3.2 were
cross-checked with the following implementation. `OperationReceiving.tsx` still has date,
condition, category, Site and supplier rail groups, not the approved two-view rail.
`apps/api/src/routes/warehouse/receiving.ts` submits a count; the Operation receipt route still
provides the separate guarded check-in. Migration 0619's `receiving_actor_context()` admits an
active individual Operation/Principal poster, not the newly approved Warehouse confirmation.
This is source evidence, not proof of production migration state. `SupplierBills.tsx` already
selects GRN lines and keeps supplier invoice preparation/confirmation in Finance. Migration 0477
contains receipt-line billable quantity checks and rejects consignment GRNs; do not invent a second
Purchase Invoice engine. No receipt, amendment, void, invoice or return was executed for this audit.

| Capability / lifecycle | Resolution and recommended Carres treatment | Acceptance or remaining uncertainty |
|---|---|---|
| Source and expected arrival | RESOLVED: PO/CO and other admitted sources own expected goods; supplier dates stay Purchasing-owned. A supplier dispatch/DO is evidence of supplier statement, not GRN. | Prove source-line and split-batch dates remain separate from actual arrival. No duplicate PO/Receiving ETA writer. |
| Daily ownership and missed arrival | RESOLVED: Operation checks missing arrivals and contacts suppliers; Warehouse performs physical work. | CONTRADICTION FOUND: Workspace's older action table instructed check-in merely because a date passed. Its target is corrected. The Work feed correction is deployed in #1907 (2026-10-05), with live scenario acceptance still owed: actual submitted reports alone create Receiving work; missed arrivals use Purchasing/PO Duty and the existing per-line arrival authority. |
| Warehouse identities and permissions | APPROVED TARGET / NOT BUILT: individually authenticated, source/Site-authorised confirmation, company receiver and individual actor distinct. | Existing role gates do not deliver the new rule. No broad Warehouse finance, adjustment, amend or void rights. |
| Receipt entry and evidence | KEEP the source-prefilled one engine; confirm actual Unit outcomes or counted quantities, actual date/Site, DO and evidence. | No blank unrelated receipt, identity minting or supplier-reported automatic receipt. Missing evidence preserves an unposted report. |
| Partial receipt and remaining quantity | RESOLVED: valid received scope completes; remaining acceptable supply stays outstanding. | Example: ordered 10, physically arrived 8 including 1 damaged means Received Qty 7, Damaged Qty 1, physically missing 2, Pending Delivery Qty 3. Never add damage to the 3 again. |
| Automatic GRN and retries | APPROVED TARGET / NOT BUILT: valid Warehouse confirmation posts through Receiving and creates the formal GRN once. | Existing submit/review split is a real implementation gap. Prove no duplicate receipt/stock after retries or concurrent confirmation, and no false success on failure. |
| Condition, custody and eligibility | RESOLVED: physical custody, accepted quantity and saleability differ. Damage/wrong goods retain hold; rejected goods remain with supplier. | Existing reservations survive valid arrival; extra goods cannot silently satisfy expected lines or create available stock. |
| Register, cards and working detail | DEPLOYED with bounded acceptance in §2.4: GRN Records / Receiving Differences, shared list and Working Panel; one expansion job. | Retain existing GRN full-page/PDF and history; no new top-level page or local kit. A normal GRN has no new Completed badge. |
| Completion | RESOLVED: receipt posting, complete source fulfilment, resolved discrepancy and supplier bill settlement are separate facts. | PO 10, receipt 6 creates one GRN for 6; balance 4 remains. GRN creation must not close shortage or Claim actions. |
| Corrections, cancellation and history | KEEP governed Amend/ Void, reason, evidence, revision checks, downstream blockers and immutable document identity. | Later physical arrivals create new GRNs; later defects use Claim, not rewriting the old receipt. No generic Copy action that duplicates a physical event. |
| Source version / historical document | KEEP source identity and historical evidence. | Current live walkthrough did not establish an explicit receipt-bound PO revision on the GRN. Verify version lineage and historical PDF consistency before claiming complete; do not infer from a PO number alone. |
| Difference, Claim, replacement and repair | RESOLVED: receipt evidence routes stock problems to Purchasing; customer Service Case is not prerequisite. | Operation owns supplier outcome; warehouse only observes physical work. Replacement/repair-return receipt must close the right source leg, not create a second purchase need. |
| Purchase Return | RESOLVED: authorised Claim outcome creates return; actual collector, Unit/count and handover evidence change custody. | Return paper is not collection, refund or permission to rewrite original receipt. Partial collection keeps balance open. |
| Supplier invoice and payment | RESOLVED: Finance records supplier invoice against eligible GRN lines/PO price; Finance owns bill, credit and voucher. | A GRN is not the supplier invoice and never auto-pays. Consignment arrival does not become AP. Runtime duplicate/overbilling and cancellation consequences remain unverified. |
| Calendar, Work, alerts and mobile checks | KEEP one Calendar with authorised module/location filters; one arrival event under Warehouse. Operation can inspect remotely; My Work owns dated follow-up. | A date-only calendar cannot guarantee missed work is seen. Preserve unresolved source-owned Work and explicit due reasons; loading failure is not zero. Do not claim push alerts or new escalation thresholds without actual capability evidence. |
| Search, filters, export and reports | KEEP shared search/column filters/pagination/export and source links. Filters do not become new work ledgers. | Totals/counts must cover the authorised filtered result, not one loaded page; no invented receiver, time or historical snapshot for legacy data. |
| Settings and external transition | KEEP governed Sites, partner scopes, individual identities, working calendars and Staff & Duties; no second local roster. | Account activation and external cutover remain separate from this PLAN. Do not hard-code NETS or alter current operations. |

**Reference-to-Carres capability matrix.** Houzs source inspected in
`/tmp/houzs-erp-review-20261001`: `GrnFromPo.tsx`, `GrnNew.tsx`,
`GoodsReceivedDetailV2.tsx`, `PurchaseInvoiceFromGrn.tsx`, backend `scm/routes/grns.ts`.
Earlier browser review exercised PO-line selection and unsaved GRN/invoice/return forms only;
it did not post a document. Houzs-derived functionality is not proof of original 2990 behavior.

| Reference capability | Current Carres equivalent / owner | Decision | Why / dependency |
|---|---|---|---|
| Houzs outstanding PO-line selection and partial quantity | Source-linked Receiving / Purchasing | KEEP + ADAPT | Reuse source identity and remaining scope; do not rebuild an independent purchase document. |
| Houzs standalone GRN detail, source link and downstream document links | GRN object/PDF, Related records / Receiving | ADAPT | Reuse proven document navigation inside Carres's approved Working Panel/full-page grammar. |
| Houzs `qtyAccepted = qtyReceived`, rejected zero in new-form construction | Per-Unit condition and accepted quantity / Receiving + Stock | REJECT | Carres explicitly distinguishes damaged/wrong physical arrival from accepted supply. |
| Houzs transfer to invoice and return | Supplier Bills / Finance; authorised Claim-to-Return / Purchasing | RELOCATE + KEEP | A convenient link is useful; it cannot transfer Finance permissions or bypass Claim authorisation. |
| Houzs posting response can carry movement/recount errors | One validated Carres receipt engine | REJECT blind copy | GRN and stock failure/retry consistency must be proven, not inferred from a success-looking document. |
| Odoo partial receipt retains remaining demand; received-quantity billing | Existing partial receipt and GRN-billable lines | KEEP | Confirms useful separation of receipt, remaining supply and bill; foreign policies are not Carres authority. |

Primary benchmark: [Odoo partial receipt](https://www.odoo.com/documentation/13.0/applications/inventory_and_mrp/purchase/purchases/rfq/reception.html)
and [Odoo vendor bills](https://www.odoo.com/documentation/saas-16.3/applications/inventory_and_mrp/purchase/manage_deals/manage.html).
These versioned references support workflow principles only, not current Carres behavior.

**Recommended full operator journey (approved business truth, delivery still owed).** Operation
starts with its due Work and Calendar, checks the expected date/batch and follows up with suppliers
through PO; Warehouse opens its authorised Inbound scope, records the actual physical facts and
confirms. Valid receipt creates GRN and Stock consequences once. Operation reads GRN Records for
what arrived and Receiving Differences for source-linked unresolved issues, continuing through
PO/Claim/Return as applicable. Finance uses its existing bill door for the supplier's actual
invoice. End-of-day review keeps unresolved missing arrivals, unposted reports and Claims visible
under their proper Operation/Warehouse/Finance owner rather than declaring a whole PO complete
because one GRN exists. Shared Calendar, list, Working Panel and full-page GRN serve different
jobs; no new page, second work ledger or Receiving-specific calendar is required.

**Review conclusion.** No new owner business decision is required to resolve the findings above.
The target is sufficiently explicit to explain the complete journey, but this is not a declaration
of PLAN MISSION COMPLETE or production completion. Main-branch documentation integration alone
does not deliver the warehouse posting/identity model, Work projections, two-view presentation or
runtime lifecycle proofs; these remain open. Do not turn these known gaps into new questions for Jess.

---

## 3 · Whole-domain research audit

### 3.1 What was mined from 2990

The 2990 purchasing domain was inspected top-to-toe, including MRP, SO-to-PO selection, blank PO
entry, PO listing/detail, goods received, purchase returns, purchase consignment orders, consignment
orders, consignment notes and consignment returns.

Useful proven capability:

- server-recomputed demand rather than a staff-maintained checklist;
- line-level SO source, warehouse and delivery-date context;
- supplier grouping before PO creation;
- dense searchable registers with filter, sort, display and export;
- ordered, received and remaining quantity on the same commercial line;
- source-document links, versions, History and printable documents;
- Purchase Return born from a receiving/problem source.

Capability deliberately rejected or improved:

- blank PO/return/consignment creation without a governed source;
- delete and right-click commands that hide authority;
- many cloned consignment engines whose document type, ownership and accounting meaning diverge;
- a separate consignment-receipt workflow when one Goods Receipt can preserve ownership;
- model/quantity-only consignment control without exact Unit identity;
- finance fields and settlement decisions inside Operations;
- `RelationshipMap` terminology and a UI system separate from Carres Shell/Register/Object Detail.

### 3.2 Mature ERP / WMS / logistics lessons

- Purchase requisition is internal authorisation; the PO is the external supplier commitment.
  Carres adapts this into two simple operator doors feeding one `purchase_demand` truth.
- A PO must retain line source, delivery destination, promised date, received quantity, remaining
  quantity and version history.
- Supplier collaboration may record promised dates, split quantities and changed versions, but
  supplier silence is not a Carres `Acknowledged` status.
- Consignment receipt preserves supplier ownership and creates no payable. Mature ERP consumption
  advice is a reference capability, not Carres business truth: supplier-owned display is not sold (§7.7).
- Physical receipt, ownership change and financial posting are separate authoritative events.

Primary references: [Dynamics purchase requisitions](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/purchase-requisitions-overview),
[Dynamics purchase orders](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/purchase-order-overview),
[Dynamics consignment](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/consignment),
[Dynamics supplier collaboration](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/vendor-collaboration-work-external-vendors),
[Oracle consigned inventory lifecycle](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/famml/consigned-inventory-lifecycle.html),
[Oracle consumption advice](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/faspc/create-consumption-advice.html).

### 3.3 Capability decision matrix

| Major capability | CURRENT CARRES | 2990 / MATURE ERP LESSON | Decision | RECOMMENDED CARRES BUSINESS FLOW | OPERATOR JOURNEY | UI / PAGE / OBJECT PLACEMENT | CROSS-MODULE CONNECTION |
|---|---|---|---|---|---|---|---|
| SO buying | Staff rely on Sales messages and personal memory | 2990 computes SO/MRP need and groups supplier lines | **ADAPT + IMPROVE** | SO uncovered quantity becomes demand; stock/PO coverage reduces it; ready lines batch by supplier | Open dated work, fix named blockers, set/split `Supplier Deliver To`, issue | `SO Batch Purchase` Register + row inspector + issue surface | Sales Order source; Stock coverage; Delivery required-arrival date |
| Non-SO buying | Requests are informal and may omit the business reason | Mature requisition separates internal approval from external PO | **ADAPT** | Staff create a Manual Purchase Request; approval produces demand; rejection ends it | Select purpose, goods, quantity, date and destination; system routes approval | `Manual Purchase Request` Register and object; no separate request page | Catalog, Stock planning, approved Display Request, Finance approval boundary |
| Purchase demand | Staff may confuse “need” with a document to send | 2990 recomputes need; mature ERP keeps requisition/demand separate from PO | **KEEP + RELOCATE** | One hidden canonical line record stores required, covered, ordered and remaining quantity | Staff see demand facts through the correct work door; never create/send a demand document | No sidebar page; read in SO Batch, Manual Purchase, PO and Order Route | Source object creates/reduces/cancels demand; PO allocation covers it |
| Purchase Order | PDF/WhatsApp means the real order; changes can be lost | 2990 retains line balance, version and documents | **KEEP + IMPROVE** | Current PO Duty checks, sends the actual PDF, records channel/time; later changes create a version | Use 50/50 check/preview; send; record supplier promise or exception | `Purchase Orders` Register; PO info/Communication quick panel; full PO information/edit + PDF at 50/50 | Demand, supplier, Goods Receipt, Stock, Finance read-only |
| Physical receipt / GRN | Supplier DO and Carres GRN can be confused; counts may hide damaged/wrong/extra goods | Mature ERP separates supplier delivery evidence, physical receipt and payable invoice | **ADAPT + IMPROVE** | Receiving starts from the PO/CO, records the supplier DO and physical counts, then Carres creates the numbered GRN once | Open the exact source, record Order/Received/Damaged/Wrong/Pending facts and evidence, finish once | Receiving-owned workspace and GRN record; no second receipt door | PO/CO source; Stock receives only valid goods; Supplier Claim consequence; no AP for consignment |
| Supplier problem | Receipt differences and later defects can be mixed | Source-linked claim/return flows preserve evidence | **IMPROVE** | Receiving records damaged/wrong/extra separately without reducing pending delivery or making stock available and reports a source-linked Purchasing claim; later discovery on a Stock Unit/receipt opens a Purchasing stock claim directly | Check source, evidence, supplier response and authorised outcome | `Supplier Claims` Register; claim object and optional supplier claim pack | Purchasing claim authority; GRN/Unit evidence; related customer Service Case read-only; Finance credit read-only |
| Purchase return | Staff may create a return because goods look wrong | 2990 can derive a return from GRN but also permits blank return | **ADAPT / REJECT blank create** | Only an approved claim/outcome creates a return; issue document; collection proof moves custody | Send return, obtain collection date, scan exact Units, record handover | `Purchase Returns` Register; formal object; 50/50 while issuing/revising | Claim source; Stock custody; Finance credit consequence |
| Repair order | Repair can be confused with replacement | Mature service logistics preserves exact serial/Unit custody | **IMPROVE** | Authorised inventory repair or Claim outcome creates RO (§9.7); same Unit leaves and must return; replacement gets a new Unit ID | Issue repair order, hand over, chase dated return, inspect same Unit | `Repair Orders` Register; formal object; 50/50 while issuing/revising | Authorised inventory repair or stock-claim outcome; Stock custody; Goods Receipt/inspection on return |
| Display request | Sales negotiates with supplier while Purchasing places/controls order | Requisition should state purpose before external commitment | **IMPROVE** | Sales hands over the negotiated display arrangement; Operation documents the governed purchase, consignment or movement path | Select existing Stock Units where applicable; Sales supplies new goods and agreed terms; resolve missing Catalog facts before formal issue | `Display Requests` Register and internal object; no PDF preview | Showroom/Sales request; Catalog; Manual Purchase or CO; Stock location |
| Consignment order | Supplier-owned sofas are hard to count; purchased Hooka/Ohana displays are mixed in | Mature ERP keeps supplier ownership on receipt; 2990 has documents but fragmented truth | **ADAPT + IMPROVE** | Approved display/claim swap creates CO; exact Units and supplier ownership are fixed before delivery | Issue CO, send Unit IDs, record promise, receive through the one Receiving engine | `Consignment Orders` Register; source-linked supplier instruction (§9.9) | Display Request; Stock Unit; Goods Receipt; Consignment Return |
| Consignment return | Removal/swap may be arranged informally | Physical handover, not document issue, changes custody | **IMPROVE** | Approved remove/swap/claim/overdelivery creates return; combined swap shares one Consignment Order PDF (§9.9) | Send standalone return if needed; obtain collection date; scan and prove handover | `Consignment Returns` Register; source-linked return and handover (§9.10) | CO swap, Stock custody, supplier proof; no refund/credit on unsold consignment |

---

## 4 · Final navigation and information architecture

```text
Purchasing ▾
├─ BUY ▾
│  ├─ SO Batch Purchase
│  ├─ Manual Purchase
│  └─ Purchase Orders
├─ RECEIVE ▾
│  └─ Receiving
├─ PROBLEMS ▾
│  ├─ Supplier Claims
│  ├─ Purchase Returns
│  └─ Repair Orders
└─ SHOWROOM ▾
   ├─ Display Requests
   ├─ Consignment Orders
   ├─ Consignment Returns
```

Rules:

- The Purchasing row and each group header expand/collapse; more than one group may stay open.
- An active page remains visible. Open tree: only the active child is blue. Closed tree: the
  Purchasing parent is blue. At 60px: the Purchasing icon is blue.
- The 60px Purchasing icon permanently lands on `SO Batch Purchase`.
- The destination header follows Sales Orders: 50px high, 24px page title, no leading page icon and
  no `Purchasing ·` prefix.
- There is no Purchasing Home. Module summaries come from registers and reports.
- There is no My Purchasing Work. `My Work` and `Team Work` are the shared Work Engine.
- There is no Purchase Demands page. Demand is a record, not a staff destination.
- There are no New Supplier or New SKU request pages. A blocked buy opens an in-context governed
  supplier/SKU request to Catalog/Master Data and returns to the same buy.
- There is no Consignment Overview or Consignment Receipts page. Receiving handles purchased
  and consignment goods; Stock Register reports supplier-owned Units.
- Settings stays behind the global header gear. Reports use the central Reports area and Register
  export, not permanent Purchasing sidebar rows.

Every Register destination uses the approved Register Template. Receiving's separate owner review
governs its physical-receipt workspace and any listing around it. A Listing never becomes 50/50.
Every Listing retains the shared 240px page-owned `FilterRail` containing concrete
record/work facets; it never says `Today`, `Tomorrow`, `Follow Up`, `Needs Attention`, `Priority` or
`Next Action`.

---

## 5 · Core objects and arithmetic

### 5.1 `purchase_demand` — one hidden canonical need

Each demand line stores:

```text
Source object and line
Purpose
Carres SKU and required configuration
Required quantity
Required at Carres location by actual date
Deliver To
Stock-covered quantity
Open-PO-covered quantity
Purchase quantity remaining
Approval and hold facts
```

The one arithmetic is:

```text
purchase quantity remaining
= required quantity
− usable stock allocated
− valid open PO quantity allocated
```

The remainder cannot be copied into another editable field. Cancellation or quantity change at the
source recalculates the demand and creates a concrete PO impact if a supplier commitment already
exists.

### 5.2 Two input doors

`SO Batch Purchase` is system demand from customer Sales Orders. `Manual Purchase Request` is conscious
internal intent under the owner-approved purpose vocabulary (rulings 2026-08-28 Card 03 /
2026-08-29 Card 04) — exactly `Ready Stock` · `Showroom Display` · `Service Case` ·
`Internal Staff Purchase` · `Subsidiary Purchase` · `Other Purchase`, with Management included
under `Internal Staff Purchase` (there is no `Management Purchase`). Only `Other Purchase`
asks — and must answer — `What is this for?`; routine purposes do not ask a duplicate `Why`.
Each exceptional purpose names its STRUCTURED object at creation (0401): a `Service Case`
purchase links the actual Case, an `Internal Staff Purchase` names the real staff member, a
`Subsidiary Purchase` names the actual subsidiary company; `Ready Stock` and
`Showroom Display` are served by the governed destination on the request. There is no urgent or
emergency purpose, extra question, queue or approval/issue bypass. The four pre-ruling purposes
(`Display` · `Warranty` · `Office` · `Spare Parts`) are retired: no
door accepts them for a new request and no historical row is relabelled into the new
vocabulary. **Each Manual Purchase request has an MPR number — owner ruling (Jess, 2026-09-18);
overwrites the 2026-09-04 no-number correction (Card 08).** The number is `MPRYYMMDD-NNNN`
(`MPR` = Manual Purchase Request), allocated when the request is created, permanent and never
reused. It names the request, not a supplier document: the supplier still receives only the PO
(`PO-YYYYMMDD-RRRR`), and one request may become several POs. Consignment Orders, Repair Orders and
other documents keep their own numbers; MPR covers only Manual Purchase requests. Historical
`MPR-…` values keep their numbers; historical `REQ-####` values stay searchable. The build restores
the allocator that migration 0424 turned off (a new migration; 0424 is never edited). `MP` is not
used — it is the Mattress Protector SKU code.
**Approval — APPROVED / LOCKED (Jess, 2026-09-16); BUILT in Manual Purchase Round 2, migration
0522.** Every Manual Purchase requires approval, whatever its purpose or amount; no purpose or
amount bypass exists. `purchasing_create_request` always stores `approval_required = true` and no
longer reads `purchasing_purpose_approval`; `purchasing_set_purpose_approval` refuses with
`approval_setting_retired` (the table's rows stay stored, unused). The issue path enforces it in SQL:
`purchasing_demand_record_issue` refuses any Manual Purchase demand whose request is not approved,
or is refused, withdrawn or sent back (`not_ready_to_order`), taking the request row FOR SHARE first.
`No approval needed` is gone from every surface; a historical row stored with
`approval_required = false` and no decision reads `Need approval`. No row was backfilled.

An approved Display Request may route to Manual Purchase or Consignment Order; staff do not
retype it.

### 5.3 One PO issue authority

**OPERATIONAL PERMISSION — OWNER RULING 2026-09-29 · MERGED / PRODUCTION-VERIFIED 2026-10-01 (PRs #1827 / #1832, migration 0627 APPLIED).** Every active
Operation staff person, including a joining-month newcomer, may perform ordinary PO work and issue
and confirm-send a PO without holding PO Duty or cover. The first-month restriction affects
allocation to PO Duty, not permission to place/issue PO. Existing approved-demand, document,
quantity and commercial approval gates remain; no approval capability or self-approval exception is
granted. Commercial approval never follows from issue authority.

Current PO Duty, or the dated cover while one is in force, is the normal work owner and remains
accountable for PO issuance; it is no longer the permission. A governed Operations Superuser may
also complete any operational PO action without becoming — or being displayed/audited as — the duty
holder. Jess is an Operations Superuser through Principal authority as a principal **person**
(`is_operations_superuser`, 0533); `operation@carres.com` is the explicitly governed shared
Operations Superuser (its flag). Other shared logins (`is_person = false`) are not people and may not
issue (0592). The shared owner login `principal@carres.com` executes no duty (owner ruling
2026-09-18).

**PRODUCTION IMPLEMENTATION (0627, verified 2026-10-01).** `purchasing_actor_may_issue(user)` = Operations Superuser **or** an
active, person `operation` account. It is asked by SO Batch Purchase, Manual Purchase, the API issue
routes, the creation authority `purchasing_issue_pos_batch` and the evidence door
`purchasing_confirm_po_sent`. `purchasing_po_actor()` no longer reads `ops_po_duty` /
`ops_po_duty_cover`: it returns the Shared Duty Resolver's answer (`workspace_resolve_duty('po_duty')`,
ERP Architecture Law F.1) as normal holder, acting cover and actor, for ownership display only. PO
History records actual actor, normal duty, dated cover and the authority used as distinct fields —
`po_duty` · `po_duty_cover` · `operations_superuser` · `operation_staff`; a superuser or other staff
issuer is never rewritten as the duty holder or the cover. Cover has no browser write policy. A
refused caller reads `Only Operation staff may issue a purchase order.` and the unavailable button
`Only Operation staff can issue this PO`.

**Current roster, effective 2026-09-07:** Yu Jun and Shasha are the two Operation staff in the
monthly PO/GRN rotation. The two duties remain opposite in every month so the person who issues a PO
does not receive it. September 2026 is PO Duty = Yu Jun and GRN Duty = Shasha; October reverses.
Khor Yee retains only historical actor/assignment evidence and receives no current or future Work.

**OWNER CORRECTION 2026-09-28 / APPROVED TARGET / NOT BUILT:** routine allocation follows the
governed rotation automatically as People eligibility changes; the owner does not maintain monthly
PO/GRN assignment rows. Workspace §4 owns the one authoritative assignment model. Existing monthly
rows are not proof of a general joiner/leaver automation. Approval capability, source-owned
completion and historical actual-actor evidence remain separate.

**JOINER / LEAVER TIMING — OWNER-APPROVED 2026-09-28 / NOT BUILT:** new eligible staff join
monthly PO/GRN rotation from the first day of the following month; eligibility does not reshuffle
the current month. Departure excludes the person on its effective date and immediately re-resolves
affected current/future allocation. Workspace §4 owns this shared rule; it does not grant approval
capability or rewrite completed Purchasing/Receiving evidence.

**NEWCOMER PO TIMING — OWNER-APPROVED 2026-09-28 / NOT BUILT:** newcomers do not take PO Duty
in their calendar month of joining; this limits responsibility allocation only, not their right
to actually place/issue PO (owner clarification 2026-09-29). From the first day of the following month, active staff with
the existing role/access eligibility automatically join PO rotation without a separate manager
competency confirmation or training sign-off. Admission is not a guarantee of holding the next PO
slot. Workspace §4 owns the timing.

**MONTHLY ORDER — OWNER-APPROVED 2026-09-29 / NOT BUILT:** use a stable cyclic order of eligible
staff. The month's PO holder is followed by the GRN holder in that order; advance one position each
month. At admission, append newcomers to the existing order without rearranging existing people.
Remove effective departures and continue the remaining order. Workspace §4 owns the one shared
rule. This responsibility allocation does not restrict the approved right of other active Operation
staff to post Receiving or change historical actual-actor evidence.

**AUTOMATIC COVER — OWNER-APPROVED 2026-09-29 / NOT BUILT:** recorded leave triggers PO/GRN
cover by the next available eligible person in the shared cyclic order (Workspace §4.4). Newcomers
cannot cover PO in their joining month. Monthly normal ownership and future order remain intact;
leave ending restores the normal holder applicable that day. No eligible cover stays visible for
management; approvals retain their own capability rules and Receiving posting rights remain intact.

**TEMPORARY MANUAL PO/GRN ADJUSTMENT — OWNER-APPROVED 2026-09-29 / NOT BUILT:** require the
selected person, start/end dates and reason; preview affected arrangements before confirmation.
Apply only within those dates, then resume the system arrangement due on that date. Do not change
the monthly cyclic order or historical actual-actor evidence. Workspace §4.3 owns this exception;
ordinary operational execution and approval capabilities remain distinct.

### 5.4 Deliver To

The destination comes from the source PO/CO `Supplier Deliver To`. When a new buy needs a default, use the
configured Carres warehouse (currently Carres Klang); a showroom is an explicit exception, never a
Receiving guess.

Permitted destinations are Purchasing Settings master data, not a fixed browser list. The current
set is `Carres Klang` · `AL Sungai Buloh` · `HOUZS` · `Ohana`; an authorised Settings manager may
add a future destination, record its address, make it the default or stop offering it for new POs.
Historical POs keep the destination name and address saved on their issued version.

Every active destination also resolves the receiving station/party, applicable arrival calendar,
whether it links to a Carres warehouse or is external/no-Stock, and whether Unit scan and signed-DO
evidence are required. A warehouse-linked destination derives its address and Stock consequence
from Warehouse authority. An external destination does not create Carres Stock merely because it
can receive a supplier PO. These receiving fields are **APPROVED TARGET / NOT BUILT**; until they
exist, a new destination may not silently invent who receives or what Stock consequence follows.

**The destination decides the customer delivery's stock route — owner ruling 2026-09-24
(Workspace §5.9).** A destination resolving to an own Site is `Pickup from Carres Klang Warehouse`;
one resolving to a partner Site (AL Sungai Buloh, HOUZS) is `Supplier sends directly to logistics`;
one with no Site (Ohana) is the separate supplier-to-customer flow. `Pickup from supplier` (the
logistics company collects at the factory; no GRN) needs a Purchasing fact that does not exist yet
and a Stock `Collected from supplier` custody event — **APPROVED TARGET / NOT BUILT**. Work and
Delivery only READ the route; changing it stays a Purchasing edit (a new PO version once sent).

**Work Supplier card and Route (owner approval 2026-09-25, `../workspace/MASTER.md` §5.10)** read, per
PO serving one Sales Order: issued or not, the immutable `PO Delivery Date`, the latest supplier
reply (word, reason, evidence) and `effectiveArrivalOf`, the PO's Supplier DO (`do_number`,
`do_uploaded_at`), Deliver To and the Warehouse's GRN date — through
`GET /api/operation/pos/for-order/:orderId`. Nothing is written from Work; recording a supplier
answer stays `Open {PO No}` until the reply rule is admitted as an embedded action.

**ONE PO MAY CARRY SEVERAL DELIVER TO — owner ruling (Jess, 2026-09-22).** A sofa PO is always one
Deliver To. A mattress or bedframe PO may send its goods to one or several governed Deliver To
destinations; each goods line names its own (a null line follows the PO default). Moving goods to
another destination after the supplier received the PDF keeps the **SAME PO number and mints a new
revision** of that PO — never a second PO, never a new PO number, never a duplicate demand and never
a new Unit ID. A closed destination remains visible on old records but cannot be selected for new
work. Each goods line's Deliver To is Purchasing-owned truth read by Sales Order and
receiving/logistics.

- Before issue: change or split quantity and Deliver To freely in SO Batch Purchase / Manual Purchase.
- Numbered PDF prepared but not sent: update the same issue surface; History records it.
- Supplier already received a PDF: use `Change Deliver To` (below). It mints a new revision and send
  work; it never silently changes the paper already sent.

#### `Change Deliver To` — send part of a sent PO to another destination

**APPROVED (Jess, 2026-09-22) · BUILT 2026-09-29 (migration 0610 `purchasing_change_po_deliver_to`).**
The staff member picks, inside the PO, the goods to send elsewhere; the system writes the next
revision of the SAME PO. Nothing is typed twice and no second PO exists.

Place: PO detail → `Edit ▾` → `Change Deliver To` (opens the 50/50 edit split beside the official PDF).

```text
Change Deliver To

Item                Forte Mattress · King
Current Deliver To  Carres Klang Warehouse
Qty on this PO      6
Qty you can move    6

Qty to move         [ 2 ]
New Deliver To      [ AL Sungai Buloh ▾ ]
Reason              [ ... ]

                           [Review changes]
```

`Review changes` shows the result before anything is saved — example `PO-0042`, V1 → V2:

| PO-0042 V2 | Deliver To | Qty |
|---|---|---:|
| Forte Mattress · King | Carres Klang Warehouse | 4 |
| Forte Mattress · King | AL Sungai Buloh | 2 |
| **Total unchanged** | | **6** |

On confirm, one transaction saves the new revision and the change record (who, when, reason). The
moved quantity becomes its own goods line on the SAME PO; its SO allocation moves with it, so the
demand is covered once, never twice.

- **Historical documents stay exactly as issued.** V1's PDF remains reprintable as sent; V1's actual
  sending record and any supplier acknowledgement/confirmation stay attached to V1 and are never
  rewritten, moved to V2 or deleted. Revisions and History show both versions.
- **Nothing is marked as sent.** V2 goes through the normal send-and-confirm work (§5.6): send V2,
  record the actual sending, follow up the supplier's confirmation of V2. The supplier message says
  it is **still 6 pieces on the same PO — 2 now go to AL; this is not an extra order.**
- **Only undelivered quantity can move.** Quantity already received or in delivery cannot be
  selected; the screen says why and leads to redelivery / transfer instead.
- **Exact-unit goods move by Unit.** The staff member picks the exact Units, never just "2". The
  moved Units keep their Unit IDs and bind to the new line of the same PO — a destination change
  never voids or mints a Unit (§6.2). This is a MOVE, not the §6.2 reduction that retires surplus
  Units.
- The PDF of a PO with several Deliver To prints each destination from a new page
  (`docs/pdf/PO-PDF-STANDARD.md` §2).

**How it is built (2026-09-29, 0610).** One SQL door, `purchasing_change_po_deliver_to(po, line,
qty, deliver_to, reason, unit_codes)`, one transaction on the SAME PO:
- **Checks first:** reason given · PO open · line on this PO · new Deliver To open and different from
  where the goods go now · `1 ≤ Qty to move ≤ Qty you can move` (ordered − received). A fully
  received line cannot be chosen and reads `All received · use a transfer instead`.
- **Where the moved goods land:** the whole line just changes its Deliver To; part of a line lowers
  it and joins the line of the same item already going to the new Deliver To, or becomes a new line
  copied from it (same SKU, configuration, cost, demand). One line per item per Deliver To: the
  0076 duplicate guard became `(PO, SKU, attrs, Deliver To)`. Moving a WHOLE line onto a sibling
  line is refused (`{Item} already has a line going to {Deliver To}`) because a line is never
  emptied or deleted.
- **Units:** `Units moving` is pre-selected by the system (the line's last n IDs) and the operator
  may change it; the screen never asks why one Unit over another. The chosen Units keep their Unit
  IDs, status, site and reservation and rebind to the landing line — the only exception the Unit
  permanence trigger allows (still `incoming`, same PO, flag set by this door only). Each Unit gets
  a `line_moved` (or `deliver_to_changed`) history row.
- **Sales Order lineage:** a Unit already reserved for a Sales Order line (0600) carries that
  reservation; the line's customer lineage (`po_line_sources`) for the rest of the moved qty moves
  newest first, never more than the moved qty. Coverage across the PO is unchanged: the demand is
  covered once.
- **The record:** the prior version is snapshotted into `po_revisions` (the same shape Revise
  writes, so the send check keeps one spelling), the version goes up by one, History reads
  `Version {n}: {qty} {Item} moved from {A} to {B}. Total unchanged. Reason: {reason}`. The new
  version enters the §5.6 send journey (`Version ({n}) must be sent to {Supplier} again`); the prior
  version's PDF and send record are untouched. Total PO quantity never changes.
- **Screen:** `Item` · grey automatic `Current Deliver To` · `Qty on this PO` · `Qty you can move` ·
  `Qty to move` · `New Deliver To` (open destinations except the current one) · `Units moving` ·
  `Reason` → `Review changes` shows `{PO number (n)} · {Supplier}`, every line of that item after the
  change and `Total unchanged`, then `Save version ({n})`. Any edit after Review throws the review
  away. Refusals print in two lines from `purchasing-refusals.ts`.
- **Retired:** 0311's `purchasing_split_line_destination` and its `/lines/:id/split` route (no screen
  called it; it split a line without its Units, lineage or a version). Revoked, not dropped.
- Cross-module: the destination change changes the customer's stock route (Workspace §5.9); Delivery
  reads it and owns any re-planning prompt on an already-booked delivery. Receiving records the
  moved quantity at the new destination's station; the Unit's site is set by Receiving on arrival.
- **Not built, by design:** the operator does not pick which Sales Order moves with unreserved goods
  (the newest lineage moves). **PROPOSAL / NOT LAW:** show the Sales Orders that move in `Review
  changes`. Falsifier: an owner walk where the moved customer is not the one intended.

### 5.5 Supplier and SKU resolution

Staff never guess a SKU, supplier or document.

- If an approved catalog relationship exists, the system resolves it.
- If the SKU is missing, the buy stays blocked and opens an in-context Catalog request.
- If the SKU exists but has no approved supplier relationship, the buy stays blocked and opens an
  in-context supplier relationship request.
- A new supplier is added and approved in Supplier Master/Catalog governance, not inside a separate
  Purchasing sidebar page.
- When resolved, the original row continues; it is not re-entered.

**APPROVED / LOCKED — owner ruling 2026-09-04.** The in-context `Add Supplier` door records one
complete governed supplier setup, top to bottom:

```text
Supplier Name
Delivery Method
  Supplier delivers
  We collect
Product Categories
Production Days       one required value for every selected category
Supplier work week
Add Supplier
```

`Product Categories` is a multi-select of the governed Purchasing production categories:
`Mattress` · `Bedframe` · `Sofa`. MP/protectors and pillows follow the warehouse-stock
ruling in §11; no accessory production-day default is authorised by that ruling. It is never a free-text category creator. Every selected category
requires its own `Production Days`; one generic supplier lead time is forbidden. For this setup
door, the selected categories are the authority for which Supplier × Category Production Days rows
must exist; the form does not wait for a SKU to be linked before those values can be stored.

**APPROVED TARGET / NOT BUILT.** One new server/database transaction must write the Supplier
identity, delivery method, selected categories, `Supplier work week` and each selected category's
Production Days. It either saves the complete supplier setup or saves nothing; a sequence of
separate browser writes may not leave a partial supplier. This supersedes SKU-derived setup for
this door, while SKU relationships remain the authority for which specific goods that supplier may
supply. The form never asks for a PO Delivery Date: that date belongs to each Purchase Order, not
Supplier Master.

**BUILD 2026-09-06 / DATABASE APPLIED, APPLICATION DEPLOYMENT PENDING:** the form and API submit
one complete setup to `catalog_create_supplier_setup`. Owner-approved migration `0428` was applied
at 07:35:20 UTC after production rollback assertions and a negative control passed. All six
function hashes and the tracker SQL SHA-256 match the committed approved file; no fixture rows
remain. PR #1105 carries the dependent application and deployment proof.

### 5.6 Issue means the PDF was actually sent

**Sending evidence is built; revised visible copy BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED (approved Jess, 2026-09-17).**
The shared communication area records version, channel, recipient, actor and time. The new button
is `PO sent to supplier`; the new missing-confirmation line is `Sending not confirmed`.
Recipient prefills from Supplier Master channel data (group link/chat number or email), never
from the supplier name. Shared completion wording remains `Current PO version marked as sent`.

Without a WhatsApp API the Portal cannot observe whether a PO was sent. Staff actually send the
PDF externally, then press `PO sent to supplier` in the one shared communication area (`PoIssueEvidence`)
used by SO Batch, Manual Purchase and Purchase Orders. The mark records the exact rendered PO
version, channel, recipient, real actor and server time. Opening WhatsApp/email, downloading or
previewing a PDF does not mark it as sent. The mark is the person's statement of sending, never
proof that the supplier received, read or accepted it. Missing evidence does not prove no send.

A current version without a sent mark has group `Confirm PO sent to supplier` and cell
`Sending not confirmed`. A sent mark does not prove supplier receipt, reading or acceptance.
The current-version mark satisfies the recorded-send completion condition; pending goods then
read `Waiting for goods from supplier`, even while the supplier is silent. There is no `Acknowledged` status. Before
resending, staff check the external conversation to avoid duplicating an unrecorded send.
The build's shared completion sentence is `Current PO version marked as sent`.

Supplier out-of-stock, delayed model/fabric, changed quantity or changed price is a later exception.
**PRICE ISSUES DO NOT STOP OPERATION — OWNER RULING 2026-10-01, APPROVED TARGET / NOT BUILT.**
Operation proceeds with issuing, sending, supplier follow-up, receiving and delivering; a supplier
price issue never stops those operations. There is no Commercial Hold state or button; the earlier
2026-08-17 hold proposal is withdrawn. Ordinary operational continuation does not approve a price
or payment, and source authorisation, quantity, identity, document and other non-price gates remain.

Any authorised active Operation person records only `Price changed` with evidence through the
existing `Record supplier answer` entrance and continues work. There is no price-number field or
cost display for Operation. Evidence access must preserve that same confidentiality, including
attachments containing quotation amounts; uploading evidence cannot create a cost-viewing loophole.
Recording the fact alone never updates the PO price, Catalog or a supplier invoice.

Purchasing Approver, currently Jess, decides whether to accept the proposed price, retain the PO
price or cancel through §5.8.1. Accepting a changed price produces the next version of the same PO
and the normal resend journey, preserving historical versions. Prompt the authorised person to
consider a Catalog update; never update Catalog automatically from one PO decision. This is distinct
from first recording a previously absent price under §9.2. Retaining the old price records the
Carres decision, not invented supplier agreement. Cancellation retains all §5.8.1 conditions.
Finance owns invoice price differences, deposits, refunds and payment; it may hold payment but
never reverse the physical receipt merely because of a price dispute. No automatic payment or
settlement follows from operational continuation or price approval.

The price-change exception workflow remains an approved target. Its recording, decision and
revision capability is not added to the separately commissioned PO-placement unblock.

#### 5.6.1 Daily PO windows — owner-approved 2026-09-24; MERGED (#1621) and DEPLOYED, 0584/0585 APPLIED; owner walk owed

SO demand is accumulated for batch review; PO Duty does not issue one PO action per Sales Order.
Purchasing Settings owns an editable first standard window, initially `11:30 AM` Malaysia time,
and one optional editable second standard window, initially `4:00 PM`. The second window may be
switched off. Demand admitted before a window belongs to that next valid window; demand after the
last enabled window belongs to the next Purchasing working day's first window. A supplier's
governed earlier cut-off always wins and may never be placed in a later invalid window.

Workspace projects one actionable window occurrence over the exact eligible demand, never one card
per SO. Opening it preserves that demand scope in SO Batch Purchase. Review groups lines by
supplier and one confirmation may issue separate supplier POs. The scope is source-line demand;
matching one SO never silently includes its unrelated lines. How an exceptional earlier supplier
window is visually composed remains a UI decision, not a reason to falsify its due time.

**WINDOW DAYS — OWNER CORRECTION (Jess, 2026-09-25) · APPROVED / NOT BUILT.** The `PO Days`
setting in Purchasing Settings **decides which days a PO window opens**. "Purchasing working day"
above means a day ticked in `PO Days` that is also an Office working day (Office calendar and
holidays). Work follows it: a PO window occurrence exists only on a PO Day. Jess sets `PO Days` to
every Office working day (Mon–Fri) herself in Settings; the ruling does not hard-code that value,
so a later change of the setting changes the window days without a new rule. `PO Days` still does
not move `Order By` (§9.1). A supplier's governed earlier cut-off still wins inside a window day.

**PO WINDOW JOURNEY — OWNER-APPROVED (Jess, 2026-09-25) · NOT BUILT.** Purchasing's side of the
daily PO Duty journey. Work card composition and whether the send area is embedded in the Work right
panel belong to Workspace (handed off to the Workspace lane the same day); Purchasing supplies the
facts, the one send area and the completion fact below.

- **Settings.** `Settings → Purchasing → PO windows` carries `PO Days` (day ticks), `First PO
  window` (default `11:30 AM`), `Second PO window` with an on/off switch (default `4:00 PM`).
  Every change records actor, time, old value, new value and effective date; it never rewrites an
  issued PO. **BUILT 2026-09-28:** one `PO windows` card at the top of Purchasing Settings holds
  `PO Days`, `First PO window` and `Second PO window` with its switch. It reads through the same
  window reader Work and SO Batch use (`loadPoWindows`) and writes through 0585's audited door
  `purchasing_set_po_windows`; the history line reads the change in clock words. **BUILT
  2026-09-29 (owner: "original setting? why you cant??"):** under the windows, `Last PO time for one
  supplier` lists every supplier with its own earlier time or `Uses the PO windows`, saved through
  0585's `purchasing_set_supplier_po_cutoff` (earlier than the last PO window only).
  **Who may save:** the page offers Save only where the SQL gate (`purchasing_settings_gate`:
  principal, or a position carrying `ops_manager`) accepts it. The shared `operation@` login passed the
  page's legacy email fallback, was offered Save and had every save refused; since 2026-09-29 it reads
  Settings with `Only a manager signed in with their own account can change these.`
- **One occurrence per window.** Eligible demand admitted before a window belongs to it; a supplier
  with an earlier governed cut-off gets its own occurrence at its real time. Blocked lines (for
  example `Production days not set`) are named with their owning setup door and never counted as
  ready.
- **Opening lands in SO Batch Purchase scoped to that window's exact demand, with every eligible
  line pre-ticked.** The operator may untick or tick lines by hand before `Issue PO`; review and
  issue authority are unchanged. SO Batch also works without Work: an authorised issuer may select
  and issue at any time, and the window occurrence then closes from the same facts.
- **Completion.** The occurrence completes only when every PO issued from its scope has its current
  version marked sent (`PO sent to supplier`, `po_sends confirmed_sent`). Issuing alone does not
  complete it. Opening WhatsApp or email never completes it.
- **Missed window.** An unfinished occurrence keeps its own time — it still reads `Issue the POs by
  {time}` and Work marks it Missed — and it never silently rolls into the next window. Later demand belongs to the next occurrence, so two
  occurrences never share a line.
- **One send area.** `PoIssueEvidence` (`Copy message` · `Open WhatsApp group` / `Open WhatsApp` ·
  `Open email` · `Download PDF` · `PO sent to supplier`) is the only send control set, shown on the
  SO Batch and Manual Purchase issue review and on the PO object (§8.2). Workspace may embed the same
  component; it may never draw a second set.
- **Action line for an issued PO whose current version is not marked sent**, by the supplier's
  recorded channel: `Click WhatsApp, send {PO No} to {Supplier}` · `Click Email, send {PO No} to
  {Supplier}` · no channel recorded: `Send {PO No} to {Supplier}`. Several unconfirmed POs name the
  earliest-due one.
- **Card words — OWNER CHOICE (Jess, 2026-09-25).** The Work card says what to do: before issue
  `Buy {n} items for {m} Sales Orders` / `Issue the POs by {time}`; after issue
  `{k} POs issued · {x} not sent yet` / the earliest unsent PO's send line; reference
  `{time} PO window`. The count-style lines (`{time} PO window · {n} suppliers · {n} Sales Orders`,
  `Issue POs to {suppliers}`, `{n} of {m} POs · Sending not confirmed`) are not used.
- **Retired with this journey:** the per-Sales-Order `issue_po` card and `confirm_ready_date`
  (`Supplier date missing`); the day-before check (§5.7) replaces the latter.

**BUILD FACTS — merged (#1621); migrations 0584 / 0585 APPLIED 2026-09-25 (tracker
`20260925114116` / `20260925114246`).**

- **Admission time is the Sales Order's `Proceed`** (`orders.proceeded_at`) — the moment the order
  enters SO Batch (§9.1). An order with no recorded Proceed time gets no window; none is guessed.
- **One arithmetic, one stamp.** The SO Batch read stamps every demand line and every lineage PO with
  `poWindow` (`2026-09-25T11:30`) through `poWindowFor` over the windows, the `PO Days` calendar
  (`poWindowCalendarOf`: ticked PO Days ∩ Office working days and holidays) and the supplier's
  cut-off. `?window=` scopes SO Batch to exactly those lines; Work's window card (Workspace §6.2)
  reads the same stamp. Unreadable window settings stamp nothing and say `poWindowsUnavailable` —
  buying still works.
- **Which demand.** Only lines SO Batch may buy (`isSelectableForBuying`) — including `can order
  early`, because the window, not Order By, now sets when PO Duty buys. `PO Days` still does not
  move `Order By`.
- **Opening pre-ticks.** SO Batch opened with `?window=` ticks every eligible line once (default
  destination); an unticked line stays unticked. The window name and `Clear filters` sit above the
  grid so they stay visible while the selection bar replaces the toolbar.
- **Several unsent POs** name the earliest (lowest PO No) in the card's send line.
- **Completion.** `POST /pos/:id/confirm-sent` completes the window occurrence once no eligible
  demand is left and every PO it issued has its current version sent; `issue-batch` completes
  nothing. A received PO needs no sending; a PO serving two windows belongs to the earliest.
- **Gap.** 0585 stores the window times (`purchasing_set_po_windows`) and supplier cut-offs
  (`purchasing_set_supplier_po_cutoff`), but Purchasing Settings has no editing screen for them yet;
  until it ships the windows are the 11:30 AM / 4:00 PM defaults and no supplier has a cut-off.

**HOW IT IS ENFORCED — BUILT, migrations 0378 / 0379 / 0380, PR #894.**

- **THE VERSION IS DECLARED, NOT READ BACK.** The confirmation states the version it RENDERED;
  SQL locks the purchase order, compares, and refuses `stale_po_version` writing nothing. Reading
  the current version at confirmation time recorded a revision as sent that the supplier never
  received.
- **CATALOG IS THE NORMAL PRICE AUTHORITY.** Issue review is not a second cost-maintenance screen.
  The server reads the governed Catalog cost and sends that value as both the line cost and
  `expected_catalog_cost`; `purchasing_check_line_commercials` re-reads it inside the creation
  transaction. A missing or changed Catalog cost must not block ordinary issue under the 2026-10-01 ruling above. Commercial
  exceptions are approved and maintained in their governed Catalog/approval flow, never typed into
  SO Batch or Manual Purchase Issue review.
- **SUPPLIER COLLECTION IS MASTER DATA.** A factory-pickup supplier's collector and optional fixed
  destination come from `purchasing_supplier_settings`. SO Batch Purchase, Manual Purchase, the API
  and the `purchase_orders` database guard all use that same rule. Review neither repeats the
  collection arrangement nor asks the operator to choose a collector for one PO. Managers maintain
  both fields in `Settings → Purchasing → Supplier collection`; future factory-pickup suppliers appear from master
  data and future destinations continue to come from the adjacent `Supplier Deliver To` setting.
- **COMMERCIAL APPROVAL — EXISTING IMPLEMENTATION, NOT AN OPERATIONAL PRICE GATE.** A hand-entered cost and a Free of Charge each
  require an open, unexpired `po_cost_approvals` record. `purchasing_approve_po_cost` admits only
  `principal` or `finance`, and refuses a manager who is also today's PO actor: one person cannot be
  both sides of an exception. An approval is SPENT when used.
- **EVIDENCE CARRIES WHO.** `po_sends` stores the actor, the month's duty holder and the authorised
  cover, with channel, recipient, Malaysia time and the exact version. An `external_open` is
  communication history and completes nothing; a `confirmed_sent` for an EARLIER version stays
  history and never completes the current one.

### 5.7 The original date, the truthful reply, one arrival arithmetic, the kept document

**PO DELIVERY DATE — OWNER CORRECTION (Jess, 2026-09-22). BUILT on BOTH issue doors
(`poDeliveryDateOf`): Manual Purchase in CARD 13, SO Batch Purchase in CARD 13-B
(2026-09-23). Neither door adds transit days any more. What the convergence did
NOT touch, deliberately: the customer arrival projection
(`purchasing_project_line_etas`, which reads supplier replies, not this date) and
every PO already issued — `official_delivery_date` is stamped once at birth and no
UPDATE may move it (0428). A missing production number withholds the date rather
than guessing one; in the SO Batch lane that absence cannot even reach the door,
because a demand without it never becomes ready to order.**
The single-PO label is `PO {n}-Day Delivery Date`; the register column remains
`PO Delivery Date`. `n` is exactly the applicable working-day value from Settings
recorded for that PO: Settings 14 means 14 working days, Settings 10 means 10.
**Do not add transit days.** Calculate this target from PO Date using those n
working days, skipping applicable weekends and public holidays. Label and date
must use the same recorded setting. Later Settings changes never rewrite an
existing PO date or an issued PDF. The current birth ETA arithmetic described
below is implementation evidence, not proof this corrected target is built.
This ruling changes the PO Delivery Date target; it does not remove separately
governed transport planning facts or silently rewrite SO safety calculations.

**HOW IT IS ENFORCED — BUILT, migrations 0428 / 0430 (correction card, Jess 2026-09-06).**

- **THE ORIGINAL DATE IS CAPTURED AT BIRTH AND NEVER CHANGES.**
  `purchase_orders.official_delivery_date` is stamped from the birth `eta_date` by trigger at
  INSERT; once it holds a value no UPDATE may change it. `eta_date` stays the LIVE planning
  arrival (the ready-date door may recompute it); the register's `PO Delivery Date`, the PDF's
  `PO {n}-Day Delivery Date` and every reply comparison read the immutable original. Pre-0428 records were
  recovered from evidence, not invented: a PO whose eta no door ever moved kept it as the
  original; a PO the legacy delayed door rewrote took the date the earliest delayed reply moved
  FROM; a PO the ready-date door recomputed stays NULL — **an unknown original is recorded as
  unknown, never replaced by today's planning date.**
- **THE SERVER CLASSIFIES THE SUPPLIER ANSWER.** The reply wire carries ONE date. Compared with
  the recorded original it is written as `confirmed`, `earlier`, `delayed` (later — and only then
  is a governed reason required; none is ever pre-selected) or `reported` (original unknown). A
  browser's own classification is ignored. An earlier date is not a delay. Every reply still
  carries channel, recipient, supplier reporter, actual recorder, evidence file, reported time,
  the exact PO version and duty/cover, enforced by trigger on the table itself.
- **REPLIES STAY READABLE BY VERSION, AND ONLY EVIDENCE QUALIFIES.** A previous-version reply
  never confirms the current version. A pre-evidence reply on a never-revised PO is linked to
  version 1 (the only link its evidence supports) and is shown as *recorded without evidence* —
  a recorded answer is not a proven absence, and an unevidenced answer is not the governed
  Supplier Confirmed Delivery Date.
- **ONE ARRIVAL-PLANNING ARITHMETIC (Architecture Law D).** `purchasing_project_line_etas`
  recomputes each affected customer (order, SKU) arrival as the LATEST effective supplier date
  across ALL open POs still owing units for that order line, from the exact `po_line_sources`
  lineage — never from SO numbers or SKU similarity, and never from whichever reply was recorded
  last. The reply door and the balance-date door both call it; the SO-ref-inferring
  `purchasing_push_supplier_date` projection is retired. It writes goods-arrival planning only;
  the customer promise is a separate Sales fact it never touches.

**SUPPLIER DELAY EVIDENCE — owner-approved 2026-09-24; BUILT (0585 storage, 0587 per-line door; Blueprint segments 1–2 build, 2026-09-26).** Confirmed sending of
the first/current PO version opens `Waiting for goods from supplier`; it does not require an
immediate reply merely repeating the calculated PO Delivery Date, and that default/planned date is
never labelled `Confirmed`. If the supplier reports that it cannot meet the effective arrival,
PO Duty records the answer against the exact PO/version with a required new date, at least one
WhatsApp screenshot (more may be retained) and one required governed reason:
`Production delay` · `Material unavailable` · `Capacity / scheduling delay` ·
`Quality issue / remake` · `Transport delay` · `Supplier closed / holiday` ·
`Partial quantity ready` · `Other`. `Other` alone requires a short note. Missing date, reason or
screenshot refuses the record. Evidence is append-only with supplier, recorder and server time;
the immutable original PO Delivery Date and earlier answers are never overwritten. The existing
arrival arithmetic recomputes only the affected open source-line scope and reports customer impact.

**SUPPLIER ANSWER PER ITEM — OWNER-APPROVED (Jess, 2026-09-25) · DEPLOYED 2026-09-26 (PR #1660 `b96f16ba1` + #1666 `51e9eb2a5`; migration 0587 `purchasing_record_supplier_answers` APPLIED 2026-09-26 — see the production record after this block; `POST /pos/:id/tomorrow-delivery` takes the per-line body; the authenticated owner walk is still owed).** One
`Record supplier answer` form on the PO records the supplier's answer **per PO goods line**. Each
line chooses `No change` (default) · `Confirmed` · `New date` (the server classifies `Earlier` —
no reason — or `Delayed` — one governed reason required) · `Split delivery` (any number of
quantity + date batches via `+ Add another date`; batches must total the line's still-to-deliver
quantity, shown as `Total {n} of {m}`; a later batch needs a reason). `Supplier DO received` sits at
the top of the form because one Supplier DO normally covers the delivery; each line then states the
quantity it covers. Exact-unit lines split by quantity only; Receiving verifies which Units arrive.
The PO's `PO {n}-Day Delivery Date` (register column `PO Delivery Date`; `n` = the Settings value
recorded on that PO at issue, never later Settings) never changes; every answer is append-only
History with evidence; the newest explicit delivery-date answer per line governs its
`Supplier Confirmed Delivery Date`. A supply-recovery estimate or inability-to-supply fact never
replaces that delivery promise. A supplier date answer creates no PO revision and no resend; changing quantity, goods or
Deliver To is a PO change (new version), not an answer. Goods that arrive early without notice need
no answer — Receiving records them. Record inability to supply through the same answer entrance
under §5.8.2; its consequence is a supply exception, not a delivery-date answer.
Each batch derives its own day-before occurrence.

**PRODUCTION RECORD 2026-09-26 (Blueprint segments 1–2).** Migration
`0587_a_supplier_answer_is_recorded_per_goods_line` was APPLIED through the governed
`apply_migration` path after a rolled-back production probe (`probe_0587_rolled_back_do_not_track`:
the whole file executed, the negative control refused an unsigned caller with `42501`, then
`PROBE_ROLLBACK` undid everything — no tracker row, nothing persisted, re-read to prove it). The
apply wrote tracker row `20260926084721`; `md5(statements[1])` = the committed file's md5
`1f7ef2f3e8050b819a0482f358b517ad`, one statement. Reconciled live afterwards: all seven function
bodies (`purchasing_supplier_reply_actor` · `purchasing_require_reply_evidence` ·
`purchasing_po_expected_arrivals` · `purchasing_po_effective_arrival` ·
`purchasing_project_line_etas` · `purchasing_record_supplier_answers` ·
`purchasing_record_arrival_confirmation`) carry the same CR-normalised `md5(prosrc)` the replayed
full-chain database produced from the same file; `po_supplier_promises.answer_group` and its partial
index exist; `po_promise_scope` admits a line-level `tomorrow_delivery` row; `authenticated` holds
EXECUTE on the answer door and on `purchasing_po_expected_arrivals`, and NOT on
`purchasing_project_line_etas`; the six pre-existing PO-level `tomorrow_delivery` rows are untouched
(0587 rewrites no row). The five canonical web/Worker surfaces reported `b96f16ba1` before the
apply (bundle `index-CjmMoe4Q.js`, 7,131,619 bytes, read from the apex: `Record supplier answer` 2 ·
`Split delivery` 1 · `Add another date` 1 · `Apply to selected` 2 · `Answered by supplier on` 2 ·
`Confirm tomorrow's supplier delivery` 1); the Worker-side Work sentences (`Supplier date passed ·
nothing received yet`, `Click WhatsApp, ask …`) are proven by the API suite, not by a bundle grep.
That bundle read also found the ONE leftover — the PO object page's WorkCard still printed the
retired `Supplier has not confirmed the PO date` for a sent-but-unanswered PO — fixed by #1666
(`purchaseOrderWork` returns no card for `supplier_date_missing`; the shared reply-work builder emits
only `purchasing.supplier_date_passed`). After #1666 all five surfaces reported `51e9eb2a5`
(bundle `index-CKMdXM5f.js`, 7,131,503 bytes): `Supplier has not confirmed the PO date` 0 ·
`Supplier delivery date passed` 3 · `Record supplier answer` 2; the one surviving `…to confirm the
PO delivery date` is the `purchasing.supplier_reply` rule DEFINITION in `work-engine.ts` — kept so
stored occurrence rows still resolve — and no projection emits it. **Owed:** the authenticated owner walk — PO page at
1440/1180/820/743/390, one real per-line answer saved, the Register summary/expansion, the D-1 and
receiving Work cards.

**Answer evidence — OWNER-APPROVED (Jess, 2026-09-25) · BUILT 2026-09-26** (`SupplierAnswerEvidenceUploadField` over the ONE shared `EvidenceUploadField`, signing kind `answer` = JPG/PNG/MP4/MOV/WEBM/PDF, bucket `delivery-orders`, the PO's own prefix)**.** The answer form accepts
photos, videos and PDF, several files per answer, through the shared Receiving uploader
(`ArrivalEvidenceUploadField`) — never a second PO-only uploader; today's PO reply upload is
JPEG/PNG only. Required minimum is unchanged: at least one WhatsApp screenshot for a confirmation,
date change or split, and the Supplier DO file for `Supplier DO received`. Video is always optional.
Files are append-only and viewed through the shared `Photos {n}` / `Video {n}` controls (UI MASTER).

**RECORD SUPPLIER ANSWER — UI COMPOSITION APPROVED (Jess, 2026-09-25, Purchasing Blueprint
segment 1; compact table revision the same day — "we got width, not tall") · BUILT 2026-09-26 (`purchase-orders/SupplierReplySection.tsx`, one component; the legacy one-date `SupplierDateBlock` is deleted).** The
per-item answer model above is drawn ONCE, on the PO object page's `SUPPLIER REPLY` section (left
facts column; the PDF pane stays), never as a second Workspace form. Measured before this ruling:
production `SupplierDateBlock` records one date and one reason for the whole PO, accepts JPEG/PNG
only, and heads itself `Supplier has not confirmed the PO date` — all three retire with this build.

**The section is a TABLE, one 40px row per goods line, in both its read and its edit state** —
the Linear/Shopify-admin grammar (edit in the row, one action bar, sub-rows for a split), never a
stacked label/value form. Two lines cost ~200px; the retired stacked draft cost ~420px.

Read state:

```text
SUPPLIER REPLY                    PO 14-Day Delivery Date · Fri, 9 Oct      [Record supplier answer]
Item            Qty  To deliver  Supplier Confirmed Delivery Date                     Last answer
Cody · King      4   4           3 pcs · Fri, 9 Oct · 1 pcs · Fri, 16 Oct · Delayed    Fri, 25 Sep · Shasha
Cody · Queen     2   2           Mon, 12 Oct · Delayed · Production delay              Fri, 25 Sep · Shasha
                                 Supplier changed from Fri, 9 Oct
Supplier DO     DO-2251 · Photos 1 · PDF 1
```

Edit state (`Record supplier answer` turns the same table editable in place; no dialog, no 50/50 —
an answer is not an outside-readable document, §8.2):

```text
RECORD SUPPLIER ANSWER   [ ] Supplier DO received  Supplier DO No [      ] [Upload]     Cancel  [Save]
☐  Item          To deliver  Answer                                    Date           Reason
☐  Cody · King   4           [Split delivery ▾]
☐  Cody · Queen  2           [New date ▾]     [Mon, 12 Oct]  [Production delay ▾]
   └ split       [3] pcs [Fri, 9 Oct]   [1] pcs [Fri, 16 Oct] [Partial quantity ready ▾]   + Add another date   Total 4 of 4
Evidence [Upload]  ≥1 WhatsApp screenshot · photo · video · PDF        Answered by supplier on [Fri, 25 Sep]
2 selected · Apply to selected  [Choose answer ▾]                   ← bulk answer, one bar, never per row
```

- **Every Unit ID prints in full under its item** (owner 2026-09-26, the same rule as the Register
  expansion, Warehouse Inbound and Repair Orders): never `{n} Units`, never a `…` range; the row
  grows. The answer itself stays per line and quantity — Receiving verifies which Units arrive.
- `Answer` is ONE kit Select in the row (owner choice 2026-09-26: a dropdown, not a four-segment
  control — 140px instead of 330px, and the same control the rails and `Reason` already use). `Date` and
  `Reason` appear in the row only when the answer needs them (`New date`; `Reason` only when the
  date is later than PO Delivery Date; `Note` only for `Other`). A `Split delivery` row grows one
  36px sub-row per batch beneath its line, with `+ Add another date` and the live `Total {n} of {m}`.
- Ticking rows and `Apply to selected` answer several lines at once (the shared bulk grammar:
  checkbox column + one action bar, no repeated per-row buttons). Validation is on blur, in the
  cell; the Save button names the first blocker.
- The table scrolls sideways inside its own box below 1180; the page never does.

- **Facts and doors.** `Supplier Confirmed Delivery Date` per line/batch = the newest append-only
  answer row (line, quantity, date, server-classified Earlier/Delayed, reason, evidence, recorder,
  server time, PO version). Write door: the existing `POST /pos/:id/tomorrow-delivery` and its SQL
  door extended to line + batch scope in a NEW migration (0432/0585 untouched); no parallel
  endpoint. `Supplier DO received` writes the PO's existing `do_number` / `do_uploaded_at`;
  Receiving reads that same DO, never a second copy. `PO Delivery Date` never changes; an answer
  mints no PO version and needs no resend.
- **Work.** The D-1 occurrence derives per batch date; a recorded answer or a Supplier DO for that
  date closes it; a moved date retires the old occurrence and derives the new one.
- **States, all distinct.** Default `Not confirmed` · `None recorded yet` · Active (Save reads
  `Save — {what is missing}` until complete) · Waiting (date shown; D-1 card the working day
  before) · Completed (`Received · {GRN No}`, the line greyed `All received`, no further answer)
  · Attention (`· Delayed · {reason}` + `Supplier changed from {date}`) · Missed
  (`Supplier delivery date passed`) · Loading (three-line skeleton, no button) · Empty (PO not
  sent → the section is absent; `Confirm PO sent to supplier` shows instead) · Error
  (`Supplier answers could not be loaded` + `Try again`, other sections unaffected) · Permission
  (non-Operation sees no button, never a grey one) · Missing original (`PO Delivery Date ·
  Not recorded`; the answer is stored as `Reported`). A timeout re-reads the PO and never prints
  a refusal it did not receive.
- **Responsive.** 1440/1180: the table in the left column, every column in one row. 820: PDF
  stacks below (existing rule); the table keeps its columns and scrolls inside its box. 743: same,
  `Reason` wraps under `Date` in the cell. 390: one 54px two-line row per goods line (item on line
  one, segmented control on line two), Date/Reason as a third line only when needed, upload full
  width, `Cancel` `Save` fixed at the bottom at 40px.
- **Words** are in [COPY-STANDARD: Record supplier answer words](../COPY-STANDARD.md#record-supplier-answer-words).

**Who may record a supplier answer — OWNER RULING (Jess, 2026-09-25) · BUILT 2026-09-26 (0587 redefines the ONE recording gate `purchasing_supplier_reply_actor()`: any active Operation or Principal person; the answer, balance-date, ready-date and day-before doors all ask it; issue/revise/cancel still ask `purchasing_actor_may_issue()`).** Any active
Operation person may record what the supplier answered — on a PO (`Record supplier answer`) and on
a Supplier Claim (`Record supplier reply`, §9.5) — because the holder may be on medical leave or the
job not yet handed to the buddy. The record stores the actual recorder and server time as its own
fact; normal PO Duty and any dated cover are shown and stored separately and are never rewritten
by who recorded. Recording permission does not itself grant commitment-change or approval rights.
Ordinary PO issue follows §5.3; outstanding-goods cancellation follows §5.8.1, including staff help
and the commercial-exception boundary. Other revisions, destination changes and claim outcomes
retain their separately governed permissions. Work assignment remains separate from actual execution;
a recorded answer closes only the occurrence whose governed completion condition it satisfies.

**Delay reasons converge — OWNER-APPROVED (Jess, 2026-09-25) · BUILT (0585 `purchasing_supplier_delay_reasons()` and the shared `PO_DELAY_REASONS` are the same eight; the per-line form reads the shared list).** The eight reasons
above replace the built `PO_DELAY_REASONS` (`packages/shared/src/po-workspace.ts`: Production Delay ·
Material Shortage · Transport Delay · Waiting Customer Confirmation · Factory Closed · Other).
`Waiting Customer Confirmation` is removed: it is not a supplier reason; customer waiting belongs to
Sales `delay_planning`. Historical answers keep the reason they were recorded with; new answers
cannot choose it.

**Day-before occurrence wording (for Workspace, 2026-09-25) · BUILT 2026-09-26:** fact `Confirm tomorrow's supplier
delivery` (the card's own date badge and party line carry `{Supplier} · {date}` — the API composes no second date spelling); action `Click WhatsApp, ask {Supplier} for the Supplier DO for {PO
No}` (email channel: `Click Email, …`). Completion: a matching Supplier DO, or an evidenced
confirmation for that exact date and Warehouse, recorded through `Record supplier answer`.

One Office working day before the effective expected arrival,
`purchasing.confirm_tomorrows_delivery` asks for either the **Supplier DO** or evidenced supplier
confirmation that the named goods will be sent/delivered to the named Warehouse on that exact next
day. `Supplier DO` is distinct from Carres's customer Delivery Order. A later delay records another
reason/date/evidence occurrence, retires the old date-specific obligation and derives the check for
the new effective date. Neither a promise nor a Supplier DO proves physical receipt; only Receiving
and its GRN establish Goods Received Date, quantity, condition and location.
- **THE SENT DOCUMENT IS KEPT, PER VERSION.** The first confirmed send of a version freezes the
  full `purchasing_po_document` payload in `po_version_documents`; a resend of the same version
  reuses the same recorded facts, and Revisions can reprint exactly what the supplier received
  (`print-data?version=N`). A version sent before keeping began answers with a named absence —
  history is never reconstructed or back-invented.
- **A RECEIPT IS NOT A BUY.** A demand an open PO already fully covers stays visible as a
  receipt but is refused at the issue door BY NAME (`already_on_po`). Production carried the
  proof this rule was missing: six open POs each sourcing the same 1-unit line of SO-1340.

### 5.8 PO states and balances

**APPROVED / LOCKED — owner correction 2026-09-04.**

The operator sees facts, not a vague workflow:

```text
Confirm PO sent to supplier
Waiting for goods from supplier
Confirm tomorrow's supplier delivery
Supplier Confirmed Delivery Date changed
Supplier delivery date passed
Partly received
Completed
Cancelled
```

**Group classification is built; revised labels BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED (approved Jess, 2026-09-17)** (`purchaseOrderRegisterFacts().group`;
a line read that returned no quantity is `quantitiesKnown: false`, never zero, never Completed
unless the stored status is `received`). Evaluate in this order so each PO belongs
to exactly one group: `Cancelled` → `Completed` → `Waiting for goods from supplier` (current version marked as sent
and goods still pending) → `Confirm PO sent to supplier`. Reuse the authoritative cancellation,
completion and quantity facts; an unknown read is never silently zero. A completed PO without
a sent mark stays in `Completed`; its cell may still say `Sending not confirmed`.

Each line retains Order Qty, Received Qty, Cancelled Qty and Pending Delivery Qty. Effective
cancellation reduces only the outstanding commitment under §5.8.1; original ordered and received
quantities remain historical facts. Receiving records Damaged Qty,
Wrong Item Qty and Extra Qty separately; damaged, wrong and extra goods do not reduce Pending
Delivery Qty and never create available stock. A supplier date may split by quantity. An
passed or changed supplier promise creates supplier-contact work; it never rewrites the original
PO Delivery Date or the customer promise. An absent immediate answer after confirmed sending does
not create work. Date-specific confirmation opens only one Office working day before the effective
arrival while Pending Delivery Qty remains above zero; an earlier evidenced exception may revise
that effective date and therefore the future occurrence.
It opens only for a PO whose CURRENT version carries the `PO sent to supplier` mark: a supplier
cannot confirm delivery of a PO it never received, and until the mark the PO acts through the PO
window's send line alone. **Fixed 2026-09-28** — the Work projection had derived the check for
unsent POs (PO-20260903-4316 / -7907, found by the Workspace Work BUILD chat); the PO Register
facet and the Order Route already required the send mark.


### 5.8.1 Cancel goods not received

**OWNER RULING 2026-10-01 — APPROVED / LOCKED TARGET; implementation and production verification
are not claimed.** This governs cancellation of outstanding PO goods, not customer cancellation,
physical returns, supplier settlement or a new price-approval process.

**One source-owned cancellation flow.** On the PO, the last `Edit` action is `Cancel goods not
received`. Select the affected lines and outstanding quantities, retaining original ordered and
received quantities. Whole unreceived cancellation and partial outstanding cancellation use this
same flow. Record why cancellation is sought and the supplier facts. `Customer cancelled` is not
a manually selectable substitute for cancelling the SO: show that source reason only from an
effective Orders cancellation. Purchasing never changes the customer's demand by choosing a reason.

**Who may help.** Any active authorised Operation person, and Jess as an authorised Principal
person, may request cancellation and complete the ordinary evidenced cancellation below without
holding PO Duty or changing assignment first. Preserve `Assigned to`; record each actual updater
and completer, time, quantity, reason and evidence. Medical leave does not create a duty-only gate.
This grants no commercial exception approval, Finance powers or self-approval exception. Workspace
§3 remains the owner of assignment and actual-actor presentation.

| Supplier facts | Purchasing result |
|---|---|
| Supplier explicitly cannot supply the identified outstanding quantity, with evidence | Operation may cancel that quantity. Deposits, refunds or other financial matters remain Finance follow-up; cancellation never settles them. A supplier fee demand or contradictory shipping evidence requires exception handling. |
| Carres requests cancellation; supplier agreement is not yet evidenced | Retain the outstanding commitment and procurement coverage; show `Waiting for supplier to agree`. Do not treat a request as cancellation or trigger duplicate buying. |
| Supplier agrees and explicitly confirms no cancellation fee | Operation may complete the cancellation without additional owner approval. Existing deposits/refunds remain Finance's responsibility and do not require Operation to inspect money. |
| Supplier disagrees, goods have shipped, or a cancellation fee is requested | Do not complete an ordinary cancellation. Purchasing Approver handles the commercial exception under existing authority; Finance handles money. A cancellation fee is not a PO unit-price change and must not be put through a price-change flow merely for convenience. |
| Cancellation fee is not confirmed | Keep the request pending and retain procurement coverage while the supplier facts are confirmed. Do not silently interpret an unknown answer as no fee. |

The supplier-fact question is `Supplier charges for this cancellation?`, with `Yes`, `No` and
`Not confirmed`. It has no monetary amount field for Operation and no assumed `No`. Evidence may
be a screenshot, email or PDF through the existing evidence upload. Preserve what quantity and
supplier statement it supports. Supplier inability is itself evidenced refusal to supply; it is
not a Carres request waiting for the supplier to agree a second time. Where fee facts are unknown,
retain the unresolved request rather than inventing a no-fee answer.

**Completion and consequences.**
- Recheck current receipt, outstanding quantity and affected Unit facts at submission. Concurrent
  receiving or cancellation cannot cancel a received Unit or consume the same outstanding quantity
  twice. A refused or failed save changes neither coverage nor Work completion.
- Keep Order Qty unchanged; retain Received Qty and explicit Cancelled Qty. If no goods were
  received and the whole PO is effectively cancelled, show `Cancelled`. If some goods were received
  and all remaining commitments are cancelled, show `Completed`, with the ordered/received/cancelled
  breakdown. Outstanding uncancelled goods keep their existing receipt and follow-up journey.
- Preserve the PO number and historical sent documents; effective cancellation creates the next
  version with the affected quantities. Use the existing supplier-send flow to communicate that
  version. A pending request is not an effective cancelled document or a confirmed send.
- Retire only affected not-yet-received exact Units; never delete or reuse their IDs. Quantity-mode
  goods have no Unit IDs. Preserve lineage and resolve affected incoming allocations through their
  existing owners; never erase receipt, stock or delivery facts. Goods arriving after effective
  cancellation follow Receiving's governed extra/discrepancy path, not automatic available stock.
- Recompute SO and Manual Purchase coverage through the ONE demand calculation (§5.1): still-valid
  requirement less allocated usable stock and other valid PO coverage. Never add a fixed cancelled
  quantity back to buying. Applied source cancellations and existing alternative supply count;
  Purchasing does not cancel the source or change SKU. Close only follow-up for the cancelled
  balance; retain supplier-send and other genuinely unfinished actions.
- Finance receives a traceable cancellation notification with the original PO link, affected lines,
  quantities and evidence, through the shared Work/handoff grammar. It must be actionable and
  traceable, not dependent on Finance discovering a changed row. Finance owns deposit/refund/fee
  follow-up and settlement. Purchasing supplies read-only cancellation facts; Operation sees no
  costs or financial amounts. Cancellation notification is never proof of refund or settlement.

**Business acceptance boundary.** Both supplier-initiated and Carres-requested cancellation must
preserve the original PO/receipt history, handle partial and whole unreceived cancellation, keep
pending requests covered, recompute actual remaining need without duplicate buying, retain actual
actors when colleagues help, and expose the Finance continuation without leaking money to
Operation. Evidence and the current receipt check are required; approver absence does not block
an evidenced ordinary no-fee cancellation. This approved rule does not commission application
implementation or expand the separate PO-placement unblock BUILD scope.


### 5.8.2 Supplier cannot supply — source-owned decisions

**OWNER RULING 2026-10-01 — APPROVED / LOCKED TARGET / NOT BUILT.** Reuse the existing
`Record supplier answer` form and shared evidence uploader; add `Cannot supply`, not a second
supplier-response form or a SKU-substitution engine. The shipped date-answer implementation in
§5.7 is evidence of the existing entrance, not proof this exception capability is built.

**Record facts first.** An authorised supplier-answer recorder identifies the affected PO goods,
quantity and source allocations, records a reason and traceable screenshot/email/PDF evidence,
and may record an estimated supply-recovery date and a supplier-suggested Catalog alternative.
Reasons are `Model out of stock`, `Fabric out of stock`, `Discontinued` and `Other` (explain Other).
An alternative is a suggestion only: recording it changes no SKU, demand, PO, Unit or approval.
Recording `Cannot supply` does not automatically cancel anything. A recovery estimate never
updates `Supplier Confirmed Delivery Date`; only an explicit delivery commitment goes through the
existing date-answer flow. Unknown recovery dates remain unknown and do not remove follow-up.

**Retain coverage, expose risk.** While the source decision or cancellation is pending, retain the
existing PO coverage so ordinary buying cannot duplicate it. Show the supply risk and the exact
unresolved source action in the PO, affected SO Order Route and shared Work. A retained quantity
must not be presented as assurance of normal delivery. Use the shared Work Engine and existing
source writers, not a parallel status engine or duplicate source-edit form.

| Affected source | Waiting fact | Follow-up and decision boundary |
|---|---|---|
| Customer SO | `Waiting for customer decision` | SO PIC obtains the customer's wait/change/cancel decision. Orders owns amendment submission, approval and application. A submitted or rejected amendment changes no live requirement. |
| Manual Purchase | `Waiting for requester decision` | Requester proposes the response; authorised colleagues may assist under existing permissions. Changing already-approved goods requires a linked new request through the existing approval flow. No requester gains approval or self-approval rights. |
| Showroom display | `Waiting for showroom decision` | Follow the Display Request's existing negotiating Sales, agreement and approval boundaries (§9.13). Operation may record supplied facts on behalf of Sales; this does not grant commercial approval. A purchased display retains its Manual Purchase approval path. |
| Legitimately purchased PO quantity not yet allocated to an order/source requirement | `Waiting for Purchasing decision` | Purchasing Approver (currently Jess) may choose only to wait or cancel that quantity under §5.8.1. There is no recipient authorising replacement goods; buying different goods requires a normal Manual Purchase request and approval. This is unallocated quantity on a sourced PO, never authority to create a blank or unsourced PO. |

Purchasing Approver is resolved through Staff & Duties; Jess is the current approver. No Manager
position is required or invented. Hiring a manager grants no approval rights automatically; any
future authority change requires explicit owner authorisation. Source-owned approvals such as
Orders approvals retain their own existing rules. Work assignment is accountability, not a
requirement that only the assigned employee may record authorised work; preserve actual actors.

**One decision per affected source quantity.** Use the authoritative source allocations and exact
Unit reservations, not SKU matching or one chosen customer representing a combined PO line. A
customer's decision affects only that source's quantity; other customers and Manual Purchase
allocations remain intact. Confirmed unallocated quantity is distinct from missing source history. If source history cannot
be established, show `Source unknown`; never guess that the quantity is unallocated or authorise
whole-line cancellation from that absence. Preserve the original procurement provenance; a blank
independent PO remains forbidden. The wait/cancel-only rule for confirmed unallocated quantity
never permits swapping its SKU or treating it as a new approved requirement.

**After a decision.**
- **Wait:** preserve the exception and its follow-up. Record a recovery estimate as an estimate;
  update delivery-date facts only after the supplier actually commits to delivery.
- **Change:** apply the owning source's approved change first. Handle the old supplier commitment
  under §5.8.1; buy the newly authorised requirement through SO Batch or Manual Purchase's existing
  issue flow on a new PO. Never replace SKU on the original PO or rewrite old documents/Units.
- **Manual replacement:** link the new request to the old request. The approved replacement must
  explicitly stop procurement of the superseded old demand scope while retaining its history;
  approval of new goods cannot leave both old and new requirements purchasable. Cancelling the old
  PO alone is insufficient because §5.1 would restore any still-valid old need. A pending/rejected
  replacement grants no new purchasing authority. The old supplier commitment remains separately
  governed until its cancellation is effective.
- **Cancel:** source cancellation must actually take effect through its owner. Purchasing then
  settles only the affected supplier commitment through §5.8.1; source approval never silently
  reduces a PO, voids received goods or settles money.
- **Choose the cancellation path from evidence:** an explicit supplier inability to supply the
  exact affected quantity can use §5.8.1's supplier-initiated path, subject to its exception gates.
  Otherwise use the Carres-requested path and obtain supplier agreement. An Orders amendment does
  not force every cancellation into one path, and a bare `Cannot supply` selection is not itself
  completed cancellation evidence.

**Intentional boundary and acceptance.** Retain original PO/SKU/Unit lineage, source decisions,
actual actors and evidence. Different customers on one PO line may wait/change/cancel independently.
Neither a pending supplier answer nor a pending amendment creates duplicate buying. An approved
Manual replacement cannot resurrect the superseded old requirement. The supplier's preference for
the same PO number is recorded for research, not permission for Purchasing to edit SKU. Operation
has no cost/price controls; existing commercial and Finance boundaries remain. This ruling is not
part of the PO-placement unblock BUILD and is not a whole-module PLAN completion declaration.

### 5.8.3 Customer cancellation — reuse, retain or seek supplier cancellation

**OWNER RULING 2026-10-01 — APPROVED / LOCKED TARGET / NOT BUILT.** Apply only after the
customer cancellation takes effect through Orders. A request or pending amendment is not effective
cancellation. Orders hands the affected supplier commitment to Purchasing; it never silently
cancels the PO. Staff carry out the following ordinary work without a new owner-approval gate.

1. First look for another effective SO requirement for exactly the same model, size, configuration,
   fabric and colour. Use the existing `Use this PO` reservation capability for suitable incoming
   goods, preserving the original source and allocation history. Do not take another customer's
   reserved goods or create a duplicate purchase. Stock retains reservation ownership; actual
   received goods use its existing Ready Stock path.
2. If there is no immediate matching customer, retain mattresses and accessories such as pillows
   and protectors. Continue normal receipt; eligible received goods become unreserved stock for
   later customers. Do not cancel these merely because the original SO was cancelled.
3. For bedframes and sofas, consider the actual fabric/colour and resale suitability. Staff may
   retain common, readily resalable colours (for example white) without asking Jess to approve.
   For special fabrics/colours that are difficult to resell, ask the supplier whether production
   has started. If it has not, request cancellation through §5.8.1 and wait for supplier agreement;
   no request alone releases the outstanding supplier commitment.
4. If production has begun or finished and cancellation is unavailable, continue the supplier
   commitment and normal receipt, then retain eligible goods as stock. Goods not yet physically
   received remain incoming; they never become available stock merely because cancellation failed.

Record the actual staff decision to retain or seek cancellation, its reason, supplier reply,
affected quantity, person and time. Retain original SO/PO/Unit and allocation history. Ordinary
staff may help without a reassignment or Jess's approval; choosing to retain existing committed
goods is not a new purchase and must not create an MPR, additional demand or another PO. This
specific customer-cancellation retention rule does not authorise unrelated new stock purchases or
price/payment decisions. It is distinct from §5.8.2's response to supplier inability to supply.
§5.8.1 still governs effective cancellation, evidence and commercial exceptions.

The 2026-10-01 owner correction replaces the proposal to require Jess's approval before retaining
common-colour bedframes/sofas. There is no per-case boss approval for these ordinary decisions.
Source cancellation and subsequent allocation must affect only the relevant source quantity; other
customers' quantities, actual receipt facts and Stock/Delivery commitments remain governed by their
owners. UI and implementation must preserve that boundary rather than changing a whole PO line.

---

## 6 · Document and Unit identity

### 6.1 Formal document numbers

**System-wide display clarification — Jess 2026-10-04.** The `YY` date segment applies to every
Carres document family, including GRN, CO, RO, claims, returns and Finance documents, not only PO.
Follow COPY-STANDARD's global display contract. Existing allocator shapes described below are
implementation evidence, never exemptions from the approved display target. Preserve each
family's other numbering rules and stored identity; do not append PO versions to other documents.


**PO stored identity — migration 0574 BUILT; current display — owner ruling 2026-10-01,
APPROVED TARGET / NOT BUILT (§9.3).** Allocation and display are separate facts.

```text
Stored base identity example: PO260924-4827
Current approved version display: PO-260924-4827-V1
After revision: PO-260924-4827-V2
```

- The date is the day the PO was **first issued**; a revision changes neither that date nor
  the stored base identity. Display uses the two-digit year and the actual document version,
  with no spaces or parentheses, under §9.3 and COPY's `PO Version` entry.
- Four random digits, leading zeros allowed: **10,000 PO numbers a day, for PO alone** — the PO
  draws from its OWN daily pool, never sharing codes with GRN, SB, PV or any other prefix. One PO
  of any number of lines uses one number.
- Outright and Subscription share one PO series; every PO line keeps its source link. Whether lines
  share a PO still follows the purchasing grouping rules.
- Unique, never reused, fixed width, capacity watched internally; any change of width is an owner
  decision. Existing PO numbers and issued PDFs are kept (test data; clean start).
- **Build consequence (not a UI change):** Outright and Subscription have separate PO series
  (`PO…` / `SPO…`) — an **APPROVED TARGET that may be implemented in phases**; once built, one PO
  belongs to one business. Business becomes a SIXTH document-partition
  fact beside Supplier × Category × Deliver To × Purpose × MPR Delivery Date — in the SQL partition
  (`purchasing_issue_pos_batch`'s caller) and `manualPurchaseIssueDocuments` at once — and the
  request/demand rows need a business fact to partition by, which does not exist yet. A supplier
  serving both businesses receives separate POs.
- **Permanence:** stored legacy identities (for example `PO-20260904-4665` and `PO-2054`)
  and historical issued PDFs remain unchanged. The approved display may render the dated PO as
  `PO-260904-4665-V{actual version}`; this is a presentation of that same record, not a new PO.
  Resolve/search the original identity and approved display. Non-date legacy numbers retain
  their identity and never acquire an invented date. Migration 0574's allocation evidence below
  does not prove the 2026-10-01 display change has shipped. Jess clarified on 2026-10-04 that
  two-digit-year display applies to ALL document families under COPY-STANDARD; this does not
  migrate stored GRN or other prefix identities.

**HOW IT IS BUILT — migration 0574 + `poDocumentNumberOf`, 2026-09-23. DELIVERED:** PR #1551
squash-merged as `e9bc40a0a`, that SHA reported by both Pages projects, both canonical hosts and
the API Worker, and **migration 0574 APPLIED** through the governed path — tracker
`20260923160803`, `md5(statements[1]) = ba9eb4b9…` equal to the committed file. Measured live
afterwards: the pool key is `PRIMARY KEY (code_date, prefix, code)`, `formal_document_code_text`
answers `PO260924-4827` for PO and `GRN-20260924-4827` / `MPR-20260924-4827` unchanged for the
others, there is exactly ONE allocator and ONE creation helper, and the helper claims its pool row
by the number's tail with no `split_part` left in it.

- **One place decides the shape.** `formal_document_code_text(prefix, date, code)` is the only
  place a drawn code becomes a printed number. `PO` wears `PO260924-4827`; MPR, GRN, PRTN, RO,
  SB, PV, ARI, RV, TR and MM still mint exactly what they minted before, and a PGlite test
  executes the committed migration to prove both halves. The family rule is approved for every
  prefix, but moving one is that document's own scope: a number shape that changes unannounced is
  how a supplier ends up holding two numbers for one job.
- **Each prefix owns its daily pool.** `formal_document_codes` is re-keyed from
  `(code_date, code)` to `(code_date, prefix, code)`. No row is read, written or deleted — every
  existing row already satisfied the wider key. What stops is the REFUSAL of a second prefix the
  same digits, which is 0381's rule that the owner retired.
- **The pool claim reads the number's TAIL.** `_operation_create_po_inner` wrote its number back
  onto the pool row by `split_part(id, '-', 3)`. `PO260924-4827` has no third dash-piece, so that
  update would have matched nothing and the row would have kept no `document_id`. It now claims by
  `(date, prefix 'PO', right(id, 4))` — the code in BOTH shapes.
- **`(n)` is the PAPER's, printed from the PO's own `version`.** No code, pool or row carries it.
  `poDocumentNumberOf` decides the spelling FROM THE NUMBER'S OWN FORM: a new-form number wears
  `(1)`/`(2)`, and every pre-cutover number keeps the ` V{n}` its supplier already holds. That is
  the permanence carve-out enforced by construction — a kept version reprints from
  `po_version_documents`, whose payload carries the old number, so the old paper comes back spelt
  exactly as it was sent. No stored flag, no print-date rule.
- **The hero was MEASURED before it shipped** (PO-PDF-STANDARD asked for exactly this): fontkit
  over the Noto Sans SC 700 file the renderer fetches, at 18pt —
  `PO-20260922-8987 V2` 67.9mm (reproducing the standard's figure),
  `PO260924-4827(1)` **57.5mm**, `PO260924-4827(10)` 61.2mm. The new form is 10.4mm NARROWER, so
  the left column grows from 97.1mm to 107.5mm and the company name row (87.6mm) keeps 19.9mm
  instead of 9.5mm.
- 🟡 **THE FOUR-DIGIT WIDTH IS HARD IN THREE PLACES, NOT ONE** (found by the Sales Orders lane
  reviewing 0574, 2026-09-23). 0574 made the SHAPE one decision; the WIDTH is still spread:
  the table's `check (code ~ '^\d{4}$')` (0381), `formal_document_code_text` knowing only `PO`
  (0574), and — the one that bites — `allocate_formal_document_code` itself still drawing
  `lpad((floor(random() * 10000))::int::text, 4, '0')`. That draw is ONE function serving every
  prefix, so widening it for a five-digit prefix silently re-shapes `PO` too and the table's own
  CHECK then rejects what it drew. **A wider prefix needs the width to become PER-PREFIX, exactly
  as the key did in 0574 — never a bigger constant.** This matters the moment the approved
  pool-shaped `DO2609-48271` lands; `docs/carry-forwards.md`'s `do-number-collision` entry carries
  the same warning with the symptom-to-place map.
- 🔴 **OWED: the authenticated walk** — a real PO issued after 0574, wearing the new number, with
  its pool row claimed and the printed paper read end to end. A green test suite and a converged
  SHA prove the code shipped, not that a supplier can read the paper.

**Family rule for every other formal document — owner ruling 2026-09-23:**

```text
PREFIXYYMMDD-NNNN        e.g. MPR260924-4827 · Subscription twin SMPR260924-4827
```

- `YYMMDD` = original document date; four random digits, leading zeros allowed; **each prefix has
  its own independent daily pool of 10,000** (no shared pool across prefixes). **The per-prefix
  POOL is BUILT (0574) for every prefix; the short FORM is built for `PO` only** — MPR, GRN, PRTN,
  RO and the finance prefixes still mint `PREFIX-YYYYMMDD-RRRR`, and moving one is that document's
  own scope (`formal_document_code_text` is the single line to change). Existing numbers in
  the old `PREFIX-YYYYMMDD-RRRR` form are permanent and never renumbered. Finance prefixes (SB, PV,
  ARI, RV, SMB, MM, JE, MJ) go live only after the accountant's check. Complete table: Orders MASTER
  *order numbers by business*.

**Old family rule, kept only to read pre-cutover numbers:**

```text
PREFIX-YYYYMMDD-RRRR
```

- `YYYYMMDD` is the Malaysia server issue date for an external document and creation date for an
  internal Display Request, always with a four-digit year.
- `RRRR` is chosen from the unused four-digit codes for that date. It is not a sequence, timestamp,
  customer, supplier or parent-document number.
- (Old pool, measured 0381) all formal documents shared one daily visible-code pool — the new rule gives
  each prefix its own pool. A database uniqueness rule prevents
  duplicates. Cancelled/void numbers are never reused.
- Every new object gets its own number. Relationships live in Source and `Order Route`, never in
  matching tail digits.
- A revision keeps the original number (PO display: see the PO ruling above).

**HOW IT IS ENFORCED — BUILT, migration 0381, PR #894.** `allocate_formal_document_code(prefix)`
DRAWS `RRRR` at random from the day's unused codes and is unique on `(date, code)` ACROSS prefixes,
so one day has one `4827` whatever document holds it. A losing race gets a unique violation and draws
again; no lock is held and no number is skipped. Rows are never deleted, so a cancelled number stays
taken. Production minted `PO-2054` from `max(seq) + 1` until then — a number that told any supplier
holding two of our purchase orders how much Carres bought in between. **Existing identities are
permanent and are NOT renumbered.**

| Prefix | Document |
|---|---|
| `PO` | Purchase Order |
| `MPR` / `SMPR` | Manual Purchase Request — Outright / Subscription (screen name `Manual Purchase Request`, owner 2026-09-23) |
| `GRN` | Goods Receipt |
| `CLM` | Supplier Claim (was `SC`; owner 2026-09-23). Every prefix has an `S…` Subscription twin — table: Orders MASTER *order numbers by business* |
| `PRTN` | Purchase Return |
| `RO` | Repair Order |
| `DR` | Display Request |
| `CO` | Consignment Order |
| `CRTN` | Consignment Return |
| `CSN` | Retired target; do not allocate new records or reuse historical numbers (§9.11) |

Internal records still use invisible permanent technical IDs. `MPR` is the Manual Purchase Request
number (owner ruling 2026-09-18, reinstated after the 2026-09-04 retirement): each Manual Purchase
request has one; CO, RO and other documents keep their own numbers. Historical `MPR-…` values keep their numbers; `REQ-####` stays searchable.

### 6.2 Unit ID

**Labels are printed at the warehouse — owner ruling 2026-09-25 (Stock §3, APPROVED TARGET / NOT
BUILT).** The PO object gains `Print Unit ID labels` (one 50 × 30 mm QR label per minted Unit ID);
suppliers are not required to label. Purchasing mints the IDs; the label is only their carrier.

The locked human-readable format is:

```text
U1-000-001
```

- Six system-controlled digits per Series, displayed 3 + 3.
- After `U1-999-999`, continue at `U2-000-001`.
- One company-wide allocation authority; never reset, reuse or manually type a new identity.
- Search/scan may normalise `U1-000-001`, `U1-000001` and `U1000001` to the same Unit.
- A repair keeps the same Unit ID. A physical replacement gets a new Unit ID.
- Non-separable set pieces may use `U1-000-001-A/B`; independently saleable pieces get separate
  Unit IDs as defined by Catalog.

**WHICH GOODS GET A UNIT ID — OWNER RULING 2026-09-07 (Purchasing CARD 10).** Catalog stores one
stock identity mode per SKU (`product_skus.stock_identity_mode`, 0442): **exact unit** for
traceable furniture and independently saleable or replaceable modules; **quantity** for governed
interchangeable accessories and bulk goods (pillows, protectors), which are counted and never
given a Unit ID; pure packaging is never an independent Unit. The stored mode is the only
authority — nothing derives it at runtime from supplier, destination, SKU text, `pos_active` or
category (category decided ONCE, in the audited 0442 classification). A purchasable SKU with no
stored mode **blocks official PO issue by name** — `Set the stock identity (Unit ID or Quantity)
for {sku} in Catalog before issuing a PO` — and nothing chooses for it.

**UNIT ID BIRTH — PRODUCTION-VERIFIED 2026-09-08, migrations 0442 / 0443 / 0444.** When an official PO is issued, the PO
number, its lines (each snapshotting the Catalog mode as `purchase_order_lines.identity_mode`) and
every exact-unit line's Unit IDs are born **in the same transaction**: exactly one permanent
`U1-000-001` per ordered piece, bound to the line's immutable id (`ops_stock_items.po_line_id`),
for EVERY governed destination — a showroom or external delivery gets its IDs too. The receiver
applies/verifies labels under Stock §3; supplier labelling is not a prerequisite. A quantity line
is born with zero Unit IDs.
Two lines of one SKU are two lines with disjoint IDs. If classification, allocation, line binding
or the ledger check fails, the whole issue rolls back: no PO, no consumed number, no partial line,
no demand movement, no orphan Unit. Both governed entrances — SO Batch Purchase and Manual
Purchase — reach the one authority (`purchasing_issue_pos_batch` → `_operation_create_po_inner`).
`unit_id_series` is ONE row, locked `FOR UPDATE` while allocating, so two issues cannot mint one
Unit ID; it is a table rather than a sequence because a sequence cannot roll `U1-999-999` into
`U2-000-001`. **`allocate_unit_id()` is revoked from every client role** and only the SECURITY
DEFINER PO authority allocates. **`gen_unit_code()`, which minted the legacy `id-abc123456` shape,
is DROPPED (0453)** — that shape has no producer left anywhere in the database, and a BEFORE INSERT
trigger holds every new row to the shape its scope earns: an exact unit wears `U1-000-001`, counted
goods wear the `QTY-000000001` technical key `gen_quantity_key()` mints. Search and scan normalise
case and every separator, so `U1-000-001`, `U1-000001` and `u1000001` are the same Unit; **display
and printing never normalise and never rewrite — the stored identity is what reaches paper.** The
destination never voids or mints a Unit (0443 replaced the 0366 trigger that did). **Existing Unit
IDs are never recoded, deleted, reused or renumbered** — including the 140 grandfathered `id-`
codes, which remain valid, readable and fully movable because they are on real labels. A revision that grows an exact-unit line allocates only the
additional Units; a reduction retires the surplus not-yet-received Units (`voided`, newest first)
and a cancellation retires them all — retired IDs stay in the ledger forever.

The opened PO's `Document → Items` shows a `Unit ID` column: an exact-unit line lists its
real line-bound IDs immediately after issue; a quantity line prints `—` (intentional — it has
none by law); an exact-unit line with no IDs after issue is an integrity failure and says `Unit
IDs missing on this line — do not send this PO`, never an ordinary empty state. The official PO
PDF heads the same column `UNIT ID` and prints the same line-bound IDs
(`docs/pdf/PO-PDF-STANDARD.md`). The main Purchase Orders register stays one row per PO and
carries no Unit ID column. The receiver applies and verifies labels under Stock §3's
2026-09-25 warehouse-label ruling; suppliers are not required to label. Printing or replacing a
label carries the same issued identity and never allocates another Unit. Supplier printing may
later carry that same ID, with receiving verification. The approved warehouse label/scan target
is not proof that every older unpacked piece already bears a physical label. Existing unlabelled
goods must be matched to their recorded identity before applying a label; unresolved source or
piece identity enters the governed evidence/problem process rather than being guessed.

**MEASURED IN PRODUCTION, 2026-09-08.** `PO-20260908-2503` was issued through the real Manual
Purchase screens and its Unit `U1-000-082` was written in the same transaction — both rows carry
`2026-09-08 06:45:31.737518+00` — bound to the line, `identity_scope unit`, `source_ref po_mint`.
The PO object printed the ID under a `UNIT ID` heading, the register stayed one row per PO, and
the PO's receiving page listed the same ID under `EXPECTED UNITS` with an outcome to record
rather than an identity to invent. The 0442 apply classified 225 SKUs `exact_unit` and 4
`quantity`; the seven left NULL are service and guarantee SKUs, which are not physical goods.
0443's preflight restored exactly the 39 `po_mint` Units the retired 0366 destination trigger had
voided — identities already printed on supplier paper — and invented none.

**MP / PILLOW STOCK PATH — OWNER CORRECTION 2026-10-01, APPROVED TARGET.** MP (mattress
protectors) and pillows are warehouse ready stock. Fulfil their customer requirements through the
existing governed quantity-stock allocation and delivery path, using measured usable stock; do
not impose a 7-working-day production wait or generate a supplier purchase for stock-covered
quantity. Historical quantity-mode procurement configuration findings do not establish a customer
fulfilment lead time. **China replenishment takes 2 months of order lead time (owner confirmed
2026-10-01).** Plan replenishment of these two goods ahead using that lead time; this is not a
customer-order production wait, a 7-working-day accessory default, or an automatic promise of
supplier delivery. Keep the approved duration in months; do not silently convert it to 60 days or
treat it as supplier working days. Actual shortages/replenishment retain the existing source and
approval path. Ready-stock business practice does not authorise fabricating stock availability,
changing Catalog identity mode, or creating an automatic reorder threshold.

Legacy showroom stock receives a Unit ID during opening count with supplier, ownership, model,
location, existing serial/label and photo evidence. Until the physical label is attached, the Unit
remains usable but carries concrete label work.

---

## 7 · End-to-end business flows

### 7.1 SO purchase

**OPERATION NEVER CREATES A SALES ORDER — cross-module notice, owner ruling 2026-09-27 (Jess).** A
customer Sales Order is the dealer's / showroom's act in the Sales Portal; Operation never opens the
Sales Portal and never mints one. The Operation create door (`/operation/orders/so/new`, `POST
/api/operation/orders`) and the Register's `New Sales Order` button are **retired — APPROVED
TARGET, still mounted today until Sales Orders scope C/D removes them**. **The only order Operation
places is `Manual Purchase`.** A Purchasing chat that needs customer orders to test SO Batch
Purchase or a preview uses the Sales Orders dealers already handed over (test data) or the committed
fixture harnesses (`apps/web/src/dev/so-batch-listing-preview.tsx`, `so-batch-preview.tsx`,
`so-workspace-shell-preview.tsx`) — it never creates a Sales Order by any door.

```text
Sales Order line
→ Stock reads available/reserved/incoming quantity
→ uncovered quantity becomes purchase_demand
→ Delivery-derived latest arrival date becomes Purchasing required date
→ Settings resolve production days; Order By walks them backwards
→ SO Batch Purchase groups ready lines by supplier
→ operator checks/splits Deliver To
→ an authorised issuer uses the one PO door; normal PO Duty remains the work owner
→ exact version, recipient, channel, actual actor and normal duty/cover are recorded
→ supplier promise/exception, answer and response evidence are recorded on the exact PO
→ Receiving starts from that exact PO and the supplier DO
→ Carres records physical receipt and creates the numbered GRN
→ Stock owns only valid received Units and location
```

Partial availability creates separate Warehouse work for available quantity and Purchasing work for
missing quantity. Sales Orders only displays the risk.

### 7.2 Manual Purchase

```text
Staff selects purpose
→ enters goods, quantity and Deliver To
→ Catalog resolves supplier/category and Settings resolves production days
→ server previews Proceed Date and defaults Delivery Date from the slowest selected line
→ Delivery Date minus those same lead days derives each line's Order By
→ Catalog/supplier/price authority checks
→ governed approver approves or rejects
→ approved record creates purchase_demand
→ an authorised issuer uses the same PO path; Manual grouping keeps Delivery Date distinct
→ the same Receiving engine handles physical arrival
```

### 7.3 Receiving and later defect

**Register list PDF — BUILT ON RELEASE BRANCH / NOT YET DEPLOYED, 2026-10-05.**
The authenticated Receiving list PDF action opened no preview or error. The shared grid previously
called `window.open` after asynchronous population loading/rendering and ignored a blocked return.
It now composes existing Modal + lazy PdfPreview with Download; blob lifetime follows the preview.
The PDF template wraps oversized tokens using actual font metrics without changing document
identity characters. Generated-PDF readback verifies 15 column boundaries and all 65 sample records
exactly once across page breaks; the original template fails the same boundary check. All 93 grid
tests, two PDF render tests and Web typecheck pass on the originating branch. Local actual preview:
`/tmp/carres-receiving-list-pdf-fitted-local.png`. Exact release-head CI, production preview and
browser download acceptance remain required. This release changes no receipt writes, SQL or RLS;
Warehouse automatic confirmation and extra-goods resolution remain in separate draft PR1910.

```text
PO/CO carries the official Deliver To and original PO Delivery Date
→ supplier provides its Supplier DO and may provide a changed Supplier Confirmed Delivery Date
→ Receiving starts from that exact PO/CO; it never authors another purchase or receipt source
→ record Goods Received Date as the physical arrival date, and Goods arrived at as the physical arrival location
→ record Order Qty, Received Qty, Damaged Qty, Wrong Item Qty and Pending Delivery Qty
→ attach Supplier DO/evidence; on a traced line record one outcome per expected Unit ID,
  on a quantity line count the pieces — Receiving verifies, it never creates an ID
→ finish physical receiving; Carres creates the numbered GRN
├─ valid received goods → Stock receives custody/location
├─ damaged/wrong/extra → no available stock and no reduction of Pending Delivery Qty
│    → record affected lines/Units, quantity, condition and proof
│    → report source-linked Supplier Claim to Purchasing; no Service Case required
└─ problem found later → Stock/receipt source → Purchasing Supplier Claim
```

**Receiving claim boundary — OWNER-CONFIRMED 2026-09-14.** Receiving records what actually
arrived and reports supplier-goods problems to Purchasing from that receipt. Reporting the Claim
does not accept the goods, mark them available, or decide supplier liability. Goods rejected on
the spot remain with the supplier; accepted goods retain their actual condition and Stock controls.
The Claim preserves the receipt/source, affected quantity and evidence without re-entry. A customer
order waiting for these goods does not by itself require a customer Service Case.

**WAREHOUSE-CONFIRMED RECEIPT — OWNER-APPROVED TARGET / NOT BUILT, Jess 2026-10-04.**
**Supplier follow-up ownership — owner clarification, same date.** Operation checks missing
arrivals, chases supplier ETA and handles all supplier communication, including shortages, damage,
wrong goods and claim/return arrangements. Warehouse performs physical receiving, checks and
records actual goods/evidence and reports differences; it never chases or negotiates with suppliers.
Warehouse / Inbound / Calendar placement identifies the arrival data surface, not the person
responsible for supplier follow-up. Operation can inspect those same arrival facts and follows up
through the owning PO/Claim record and its Operation action.

Office direct receiving and authorised Warehouse confirmation are entry doors to one Receiving
Session and one posting engine. An individually authenticated Warehouse operator (NETS today),
authorised for the source and actual receiving Site, confirms the physical quantities, Unit
identities, condition and required evidence. When those checks pass, the system posts the receipt,
creates its formal GRN and projects the accepted stock consequences automatically. Operation does
not approve a normal receipt a second time. Supplier declarations, delivery notes, drafts and
unconfirmed counts alone never create a GRN or Stock.

Valid accepted goods post without waiting for a supplier claim to be settled. Physically arrived
issue goods retain their observed condition and hold controls; they are never silently accepted
or made available. Missing goods remain outstanding. Unknown source, identity or Site mismatch,
duplicate receipt and missing required evidence preserve the report without posting the invalid
scope. Independently valid receipt scope may complete only when it can be separated safely;
otherwise preserve the session unposted and show the exact blocker. Retry never duplicates a GRN
or stock movement. Operation handles the source-linked differences and their authorised outcomes,
not a mandatory second confirmation of normal goods. Receiving owns GRN creation; Warehouse never
writes Inventory directly. Corrections follow the existing amendment/void and downstream guards.

Every active Operation staff member and the authorised Principal retain the existing direct
receipt door. Normal GRN Duty, dated cover, actual confirming individual and receiving company
remain separate evidence. GRN Duty owns unresolved receipt handling, not an approval required for
every Warehouse receipt. At partner-run Sites the receiver company remains NETS (or the actual
operator); the individually signed-in confirmer is separately recorded. A draft or unposted report
has no formal GRN number. This target requires delivery and production proof; it does not claim
NETS permissions, external accounts or automatic posting are live and does not authorise cutover.

The user-facing gate uses two lines:

> **Delivery note is missing**
> Upload it before you finish receiving.

### 7.4 Partial, reject, claim and return consequences

- **Partial receipt:** accepted Units post immediately; the exact open balance remains Incoming.
  `Confirm balance delivery date` opens for PO Duty and closes only from a new evidenced supplier
  promise. Partial by itself is not damage and does not create a claim.
- **Reject on the spot:** rejected/not-delivered Units never become available Stock. The receipt
  records exact quantity/Units, observable reason, photos and supplier/carrier hand-back proof. A
  Claim opens only when Carres still needs a replacement, repair, collection or other supplier
  result.
- **Accept with issue:** Carres accepts physical custody but the exact Unit is controlled and
  unavailable. The same posted receipt creates the source-linked Supplier Claim and retains GRN
  evidence.
- **Purchase Return:** only an approved Claim/outcome creates it. Issuing the document does not
  move custody. Exact-Unit scan/count, actual collector, time and handover proof create the Stock
  consequence. Partial collection leaves the remaining Units open.

### 7.4a Who owns what is on display — owner facts, Jess 2026-09-28

- **Showrooms are Carres's own.** PJ showroom today; a 2nd and 3rd Carres-run showroom are coming.
  Each must be a governed Stock Site (Stock §12.9) before display Units can be placed or repaired
  there.
- **Hookka and Ohana display goods are BOUGHT by Carres** (Manual Purchase / PO) — §7.5.
- **Every other supplier places its display goods in Carres showrooms on consignment** — the
  goods stay the supplier's until sold — §7.6. Consignment is live business today (production holds one PO flagged `is_consignment`, measured
  by the Warehouse chat 2026-09-28): the Showroom placement, return and sale-notification capabilities are needed, not deferred;
  placement and return retain distinct purposes under §§9.9–9.10.
- **A dealer (e.g. Big Mattress) BUYS from Carres.** Its price is fixed by Sales Development, not
  Operation. A dealer's display is the dealer's own purchase — a Sales matter, never a Purchasing
  consignment or a Carres display.

### 7.5 Purchased showroom display

Hooka/Ohana display goods are Carres purchases, not consignment. A Display Request resolves to Manual
Purchase/PO. When the model changes, the Unit returns to Carres custody, may go to Hooka/Ohana for
repair and may later be resold. Stock ownership remains Carres unless an authorised consequence
changes it.

### 7.6 Supplier-consignment showroom display

Other sofa suppliers such as Dorsettloft may own display stock.

```text
Display Request records the agreed consignment arrangement under §9.8
→ Consignment Order lists exact incoming Units and supplier ownership
→ receiver applies/verifies each Carres Unit ID label under Stock §3
→ Goods Receipt accepts without payable
→ Stock places supplier-owned Unit at selected showroom
→ display swap/removal creates Consignment Return path
→ display continues or exact goods are handed back to supplier
→ no customer sale or supplier sale-notification obligation
```

A model swap uses one Consignment Order external instruction with `COMING IN` and `GOING BACK`,
backed by the internal incoming Consignment Order and linked return record (§§9.9–9.10). The outgoing return
record is auto-linked; no duplicate supplier message. Document issue alone does not move either Unit.

### 7.7 Display ownership and sales boundary

**RULING — APPROVED / LOCKED; Jess, 2026-10-02.** Supplier-owned showroom goods are
for display, not customer sale. They may be received, moved, swapped and returned through
source-linked Purchasing, Receiving, Stock and Delivery actions. They are not eligible for
customer-sale reservation or customer-sale delivery. Location at a showroom does not determine
ownership. No customer-sale notification or supplier payable is generated from displaying,
receiving or returning these goods.

Goods Carres has bought, including the purchased Hookka goods described by Jess, follow the
ordinary PO → Receiving → Carres-owned Stock → Sales Order → customer Delivery flow. Finance
owns the purchase invoice/payable and customer money in their respective flows. Selling Carres
stock creates no supplier sale-notification obligation. This ruling is business truth, not a
verified ownership classification or permission to rewrite existing Units automatically. Existing
inconsistent reservations/ownership need source verification and the owning controlled correction.

---

## 8 · Shared UI and writing grammar

### 8.1 Shell and Register

```text
┌─ destination header · 50px · title 24px · no icon ──────────────────────────┐
├─ toolbar · search / filter / sort / display / export ───────────────────────┤
├──── 240px local rail ────┬──────── full-width register table ───────────────┤
│ record facets            │ 36px header · 38px rows · 32px footer           │
│ concrete work facets     │ row inspector; safe bulk actions only           │
└───────────────────────────┴──────────────────────────────────────────────────┘
```

The local rail helps find records and work; it does not become a second Work Engine or show PIC
summary. Action ownership uses structured avatar metadata.

### 8.2 Object Detail

**SO Batch supplier documents/communication — OWNER-APPROVED 2026-10-04; TARGET / NOT DEPLOYED.**

After successful SO Batch Issue PO, the same right-side result/Quick View panel shows the issued
bundle: separate numbered POs, current versions and suppliers. A bundle is a result scope, not a
new formal document, merged supplier PDF or second issue authority. Default scope is This round;
Today explicitly selects POs issued today across rounds. Filter by Supplier, select individual POs
or Select all within that supplier/scope. Selection drives the exact same PO/version set for the
message listing and PDF files. Refreshing or changing selection updates both; never include another
supplier's document, a draft, superseded version or unselected PO silently.

Each PO remains one independent PDF. Download PDFs packages selected files into a ZIP for one
bulk download; it never merges the PDFs. A per-PO PDF action remains. Purchase Orders Register
supports finding/re-downloading selected POs through supplier/date filters using the same capability.
SO Batch gives immediate access without requiring a second trip to that register.

Every supplier supports both Email and WhatsApp in the approved communication target. The panel
provides a channel selector, initially using the supplier's saved preferred channel, and permits
switching without restricting either channel by supplier identity. Ohana currently preferring Email
is an operating example, not an Email-only rule; other suppliers may also use Email. Contact details
for each channel come from supplier authority. This ruling does not silently overwrite production
supplier settings. Email panel shows saved recipient, editable prepared subject/message listing
selected PO numbers/versions, and each independent selected PDF as an attachment. Send Email is
an approved target; expose it as executable only when the actual email/attachment capability is
verified. Its result records actual dispatch evidence/failure, never supplier receipt by inference.
WhatsApp panel shows the corresponding prepared message with Download PDFs, Copy message and
Open WhatsApp. Staff attach the independent PDFs and send externally; copying/downloading/opening
proves preparation only, never sending. No automatic WhatsApp attachment/transmission is promised.

Scope labels: This round / Today. Shared action labels: Download PDFs / Copy message /
Open WhatsApp / Send Email. PO Status Pending/Partial/Done still measures issue quantity only;
communication and receipt are independent facts. Batch failures remain per PO/version and retain
successful results, so retry cannot silently resend every document. Use governed communication
ownership, permissions and actual supplier contact authority; this approval commissions target
truth, not a live external email, supplier-settings write or production transmission.

**OWNER RULING — copy and adapt Houzs supplier Email capability, 2026-10-04.**
Use the inspected real-email/PDF pattern as the proven reference for Carres, adapted to its existing
PO/version, communication, permissions and supplier contact authorities. Any supplier with a valid
saved Email may use Email sending; no supplier-name restriction. Without an Email, keep WhatsApp
preparation/download available and direct contact maintenance to the supplier record; never fabricate
a recipient. Default to the saved preferred channel and retain channel switching. For the approved
supplier bundle panel, selected PO numbers/versions, message listing and independent PDF attachments
must be the same set. One supplier Email may carry the selected separate PO PDFs; never merge them
into one PDF or silently omit an attachment. Confirm recipient and selected documents before actual
send, record actual actor/channel/recipient/PO-version set and outcome, and expose failure/retry
without duplicate issue. Reuse short duplicate-send protection adapted to explicit resend and version
semantics; email success means dispatch, not supplier receipt. PDF preparation failure prevents this
send, with no summary-only fallback. This is approved copy/adapt target, not proof of Carres build,
production deployment or authorization to send a real supplier order during research.

**PRESENTATION PROPOSAL / NOT LAW.** The isolated local result-panel preview at
`http://127.0.0.1:5178/so-batch-rail-preview.html?supplier-panel=1` is awaiting owner visual review.
It does not approve legacy PR #1859 or completion of the Workspace Working Panel.


- Internal request View is full width and usually one scroll: WORK, authoritative facts, lines/Units, source,
  connections, evidence, corrections and History.
- Tabs exist only for parallel/reference surfaces: Document, Revisions where applicable, History and
  `Order Route`.
- Use `Order Route`, never `RelationMap`, `RelationshipMap` or `Relation Map`.
- A formal PO uses 50% original information/check + 50% actual current PDF in View as well as
  issue/edit/revision (owner ruling 2026-10-04). View is read-only; explicit Edit enters editing.
- **Review Purchase Orders opens with a rendered draft (owner request, 2026-09-07).**
  The selected document is visible before Issue PO, using the PO template and its
  explicit draft treatment in `docs/pdf/PO-PDF-STANDARD.md`. Navigating documents
  changes the draft. Previewing creates nothing; Issue PO remains the creation action.
- **Review Purchase Orders work pane and every Purchasing object surface wear the Sales Order card — owner instruction 2026-09-26 ("pls follow sales order ui kit … every page of purchasing"), BUILT 2026-09-26.** The work pane is two Sales Order cards: `Purchase order` (Supplier · Supplier Deliver To · Delivery Method · PO Doc Date with its `Provisional…` hint · `PO {n}-Day Delivery Date`, label over plain value, two to a row in the half-width pane) then `Items` (the Item · Source · Qty · Goods must arrive table). The same one chrome — black bold sentence-case title over a rule (ONE KIT LAW, owner 2026-09-27: never blue), the shared `Block` + `Fact` of `SalesOrderWorkspace.tsx` — now draws the PO object page (its facts three to a row; `Supplier reply` / `Record supplier answer` become in-card labels), the Manual Purchase saved-request detail, the Supplier Claim panel and Purchasing Settings; the retired mono-uppercase tone and the cream band no longer appear on any Purchasing page. Every fact prints in the Sales Order's bordered box (owner, 2026-09-26: "got box … I want follow"), whether or not that surface can change it. **No dash, the cell says why (owner, 2026-09-27):** every `—` on a Purchasing goods table is replaced by its reason from `GOODS_ABSENCE_WORDS` (COPY "A goods cell with nothing in it says why"); furniture always carries its Unit IDs from the official PO (measured 2026-09-27: 103 of 103 live PO lines), so `Counted by quantity` appears only on accessory lines. A table wider than its card scrolls inside it and says so (`TableScroller` — the Sales Order Items fade and step button) on the PO object's `Items` and `Supplier reply`. **Owner corrections the same day:** the PO object's `Purchase order` card drops `Source` (retired word; the sales-order lineage stays on the `Order Route` tab) and the page-level `Terms (days)` door (payment terms are read from the supplier's Settings; a PO-level override is no longer set on the object page). The Manual Purchase request detail keeps ONE TITLE, ONE BOX: `Delivery Date` · `Order By` · `Order timing` (`Can order early` / `Order date reached` / `Order date passed`) are three facts, never stacked; `Approval Status` is a fact on the `Request` card (the international pattern — Odoo, NetSuite, SAP release — keeps approval state as a field and the decision as an action), `Withdraw request` rides the Request card's header, and the `Approval` card appears only for the approver's decision or a decision record.
- **Review Purchase Orders desktop composition — owner approved 2026-09-24; BUILT + DEPLOYED (#1573); SO read-only production walk verified, MPR issue walk still owed.** SO Batch and Manual Purchase share one review. At the owner's 1074–1087px desktop viewport, retain side-by-side work and actual PDF preview, following the approved Sales Order composition. The former 1130px available-surface cutoff is not acceptance for this review. Use the governed document viewer with enlargement and explicit loading/error/retry states; do not force a whole A4 page into unreadably small text or depend on the browser's dark PDF viewer. Truly narrow/mobile layouts may stack; this does not change other document surfaces' responsive rules.
- **Approved review sequence and scope.** Header: total PO count, goods quantity and an explicit whole-batch issue action. Work pane: current document selection → Supplier → Supplier Deliver To/address and Delivery Method → provisional PO Date and Settings-derived PO Delivery Date → source/items/quantity → actionable missing facts. Preview uses the same selected document and approved PO template. Switching documents updates its paper. Returning preserves selection; issuance is not sending.
- **A complete draft before commitment.** Both lanes must carry server-resolved supplier/destination addresses, provisional dates and delivery method. The draft reserves no official number or Unit ID; successful issuance records the actual PO Date and revalidates the dates. Goods must arrive is an internal deadline, not a substitute for PO Delivery Date. Missing required document facts identify their owning Settings destination instead of silently disappearing. Unrendered/failed preview is not completed review. Do not invent addresses, prices, dates or identifiers.
- **Entry and action clarity.** Loading must not flash a missing-Deliver-To warning. Status and selectable remaining demand must agree; a disabled choice explains the actual reason. Selection summary names Sales Orders, items, units and POs rather than an ambiguous selected count. The final action explicitly states how many POs the atomic batch creates, even while viewing document 1 of several. These are approved presentation corrections, not changes to grouping, MPR approval or issue/send authority.
- **Implementation and readback, 2026-09-24 — DEPLOYED #1573 (`913ef00897e5da27bd4aa7be819a7e1f871dad3a`).** Shared review paints actual PDF pages with the Sales Order renderer, zoom/fit and decode retry; issuance waits for painting, and the final action names the whole batch. Both lanes carry server-projected provisional dates and supplier/destination facts. SO split draft quantities reuse the allocated-part quantity helper used by `composeDocumentLines`: an 11-item 10/1 allocation previews 10/1 rather than 11/11. Loading no longer asserts missing destinations; selection names Sales Orders, items, units and POs. Full CI `35961742802` passed on `d97ab18f3` (12,596 tests passed, 100 existing skips), as did deployment `35962708358`; all five canonical SHA endpoints converged. Negative controls caught a dropped PDF page and the old split quantities. Bundle fingerprints prove the old draft iframe disappeared, provisional-date copy appeared and preview/Back controls survived.
- **Authenticated SO read-only proof.** Operation selected SO-1365 + SO-1363: 2 Sales Orders, 3 items, 3 units, 3 POs. All three draft selections changed their document facts and actual paper. At 1074px the two panes were 481px each; 150% paper measured 674px inside a 449px independently scrolling pane. At 390px the page stayed 390px wide and stacked 278px panes; Back retained both selections and the summary plus all actions remained visible. Server destination addresses and supplier-specific delivery dates were shown; missing supplier addresses linked to Suppliers, never invented. The temporary selection was cleared afterward. No final Issue, sending, upload, receiving or stock write occurred.
- **DELIVERY FACT — 2026-10-05; VERIFIED BOUNDED PRODUCTION FLOWS, COMPLETE TARGET STILL OPEN.** The current deployment and authenticated acceptance proofs in §2 replace earlier local-only status: two configured cutoff aggregates; retained Listing/Table/Cards/Supplier grouping; own-source Quick View/PDF/issue preparation; supplier-selected current-version PDF ZIP; exact full-PO return preserving supplier, subset, channel and editable draft; and the mandatory-rollback Ready Stock save probe. The complete acceptance boundary remains §2. No live PO issue or supplier transmission was performed merely for testing. Issue retry/concurrency and permissions have controlled API/component/SQL evidence in §9.1; this is distinct from an authenticated production final-issue act.
  Supplier composition preserves individual PO/version selection, same-set message and independent PDFs, current-round Work projection and Malaysia-date Today scope. Real Email is unavailable until actual sender/provider configuration and dispatch capability are verified. The implemented route validates authority, saved recipient, supplier/current-version membership and previous sending. Migration 0649 is applied (tracker `20261004110741`); its server-only attempt RPC reserves the exact document/version set and payload digest before dispatch, retains unknown outcomes and recovers known provider success without resending. Both tables have RLS; browser INSERT/RPC execution is denied and service-role execution allowed. Applied bodies match committed MD5s `da24f4aeda80e18fc6bb9061f7005352` / `77747b78bd6c05605b00d885796e1dee`, with seven isolated PostgreSQL cases. Per-PO evidence failure retries the evidence write only. Unknown transport outcome blocks silent resend; explicit Send again is deliberate for known dispatch. No PDF bytes or credentials enter browser attempt storage. Actual configured sender and external production email dispatch remain unverified, and are not represented as completed by the delivered preparation flow.
- **Verification boundary.** The authenticated MPR register has `Need PO 0`, so its issue walk was not manufactured; 189 full-page SO/MPR journey tests cover selection, refusals and preview readiness. No test or read-only view proves real issuance/receiving/sending. The exact-source versus generic PO-pool coverage discrepancy, remaining MPR composition/requester check, database-dependent work and the rest of the module remain open.

- **ONE COMMUNICATION AREA PER DOCUMENT.** The doors out of the Portal (`Copy message`,
  `Open WhatsApp group` / `Open WhatsApp`, `Open email`, `Download PDF`) and the act
  (`PO sent to supplier`) are drawn by ONE component on every surface that chases a document. Two
  sets of send controls on one object is two accounts of what happened to it.
- **`Download PDF` HANDS OVER A PDF.** Never a link to the JSON payload behind it: a page that
  shows an API response as if it were a document teaches the operator that the document is
  unreliable.
- Saved internal Manual Purchase and Display Request objects have no empty PDF preview.
  Manual Purchase create/returned-request edit uses the explicitly approved internal MPR
  preview in §9.2; the downstream Issue PO review uses the supplier-facing PO template.

### 8.3 Two-line fact/action copy

Official UI language is English at primary-school reading level.

```text
Confirm tomorrow's supplier delivery
[YJ] Ask Dorsettloft for the Supplier DO or confirmation for Fri, 28 Aug
```

Line 1 is the authoritative blocking fact. Line 2 is a smaller 11px action. The avatar is structured
owner metadata, not part of the sentence. Object number, supplier/customer and owner name are not
repeated when their column/header already supplies them. A sentence names recipient + action +
object/result where needed; vague `Send`, `Handle`, `Follow up` or `Check it` is not allowed.

### 8.4 Action contract

```text
Trigger
Owner rule
Resolved owner
Action
Completion fact
Governed due date
Source object
Cover rule
```

My Work omits the current user's repeated avatar. Team Work groups by resolved owner. Leave/buddy
cover changes who sees today's work while preserving normal owner and cover evidence.

The owning module supplies stable action identity, source, trigger, due date/calendar, recipient,
required result, completion fact and exact deep link. Work composes these actions and writes no
business outcome. Managers, including the governed Operations Manager accounts, supervise through
`Team Work`; the normal owner group survives even when a dated cover or Operations Superuser acts.
Module Register rails remain factual filters and do not copy central Work actions.

---

## 9 · Page blueprints

### 9.1 SO Batch Purchase

**PO PLACEMENT UNBLOCK — CORE PRODUCTION-VERIFIED, 2026-10-01.** PRs #1827 / #1832
merged at `45f43e96b92305583fa176a17d5222152dc5eb9a`. CI `36816676966` passed 13,745
tests; deployment `36817768266` succeeded and all five canonical ERP/POS/Pages/API probes
converged to that commit. Migrations 0627 and 0628 were applied from their exact committed
source through the governed migration door (trackers `20261001050011` / `20261001050021`),
with source and function-body hash readback. Production permission readback permits both active
Operation people (2/2); legacy unversioned destination mutation is no longer executable.

Local transactional integration proved both SO Batch and approved Manual Purchase issue → actual
PDF payload/render → recorded sending, with ordinary staff as actual actor, normal Duty/cover
separate, and self-approval refused. Fixtures rolled back. These are local lifecycle proofs,
not a claim that real production POs were issued or sent: no real purchase or supplier message was
created for verification. Production Settings writes and audit readback are recorded in §11.

PR #1833 closes the final API confidentiality check: Operation receives no Catalog unit cost in
purchase-demand parts and cannot submit hand-entered/free-of-charge commercial instructions.
Its focused regression suite passed 190 tests. Supplier-channel saves also refresh cached supplier
and Work data so the next send action uses the saved choice immediately. Its delivery status is
tracked by that PR and the canonical deployment probes; this does not certify the whole module.

- **Price is not an operational gate** (owner ruling 2026-10-01). Missing or non-positive Catalog
  costs do not block row selection or ordinary issue. A non-positive value is never silently treated
  as an authorised free-of-charge decision: ordinary issue uses the existing price-absent line shape,
  leaving Catalog unchanged. Positive prices retain their governed source. Formal commercial
  decisions remain separate. This behavior is included in the verified core deployment.
- **Blockers named before Issue, never after the PO exists.** A SKU whose Catalog `Stock identity` is
  `Not set` reads `Stock identity not set` with `Fix in Catalog` (row state `no_stock_identity`); a
  SKU not in Catalog reads `SKU not found`; missing production days read `Production days not set`.
  A Deliver To with no address is refused when it is chosen for the row and again by the issue door
  (`destination_address_missing`), because the PO document cannot print it and the PO number would
  otherwise be spent on an unprintable PO. The door codes `sku_not_in_catalog` and
  `catalog_identity_mode_missing` answer in the approved two lines.
- **The unversioned 0311 line-destination door is revoked by applied migration 0627** (`purchasing_set_line_destination`, its
  API route removed). A line's Deliver To moves only through `Change Deliver To` (0610), which keeps
  Units and Sales Order lineage and mints a version.

**PLACEMENT RETRY ACCEPTANCE — BUILD, 2026-10-01.** Controlled ordinary-person SQL
acceptance exposed a duplicate SO issue: two calls carrying the same exact source each minted a
PO. The authenticated API normally rechecks before calling SQL, but concurrent callers can share
that earlier read. Migration 0631 (APPLIED 2026-10-01, tracker `20261001062406`) checks the complete batch against the existing
`so_line_remaining_requirement` after the issue lock and exact Order/line locks, before numbering.
Repeated references share one source cap; distinct same-SKU source lines and legitimate partial
quantities retain separate lineage. That same remainder counts a reserved Unit and its linked PO
line once. Unsent/non-cancelled commitment still covers; anonymous incoming stock is not reserved
by inference. The existing changed-buying-line refusal returns staff to selection. Test and
production evidence must remain separate; this is not a claim that a real PO was sent.
Twelve local SQL cases passed, including two concurrent ordinary issuers (one success, one refusal),
three-unit SO/MPR document and actor checks, legitimate 1+2 buys, duplicate source aggregation,
separate same-SKU lines and linked-Unit deduplication. The authenticated API maps the atomic refusal
to the existing changed-buying-line instruction (209 API/SQL tests); 258 real-component journey
checks passed with simulated transport/PDF readiness. A production rolled-back negative control
refused excessive source quantity before numbering and left the PO count unchanged. Applied source
MD5 `8efc838e3f7fdc78d23059fff0354cba`; issue/remainder bodies matched the locally tested functions.
No live supplier message or purchase was created. The Register read also nets a linked Unit
and its own PO source once (six projection cases: incoming/reserved/sold, excess Units,
separate PO-line binding and cancelled commitment); the buying calculation retains its existing
Unit netting, and a legitimate one-of-three partial source still offers two to buy. Issue-versus-new-Stock-reservation concurrency was then reproduced: Stock checked the remainder
before waiting on the Order, and could retain that stale answer. Migration 0633 (APPLIED 2026-10-01, tracker `20261001064254`) gives the existing draw/reserve/use-PO/save/release doors one internal source-lock helper,
Order then exact line before PO-line/Unit locks; eligibility and ownership do not change.
Twelve controlled SQL cases now pass, including that independent-connection race, legitimate
reserve → partial buy → release → final buy and explicit incoming-PO reservation with preserved
Unit IDs. The 0633 production probe rolled back all five body patches and the internal helper;
its negative control refused direct authenticated helper access. Exact committed file MD5
`b71e5e603b66adc6ab2bd0276abdfd6b` matches the tracker, and all six production function
bodies match the tested local functions. This is bounded placement integrity work; Receiving lifecycle is not certified by it.

**Reusable presentation evidence (placement scope).** Both issue lanes use
`so-batch/SoBatchIssueWorkspace.tsx` (Review), kit `Block` / `SalesOrderWorkspace.Fact`,
kit `PdfPreview` + the same PO renderer, and `components/PoIssueEvidence.tsx` for the
current-version send record and History. Both registers use the shared `DataGrid`; their
source/selection/approval composition differs by business purpose. MPR create/detail keeps its
existing approval and source/history facts, not a copied supplier page. Real-component review and
result screenshots use controlled local payloads at 1280×720; they are composition evidence,
not a production-authenticated issue journey. No Houzs code or new kit component was introduced.

**RESERVE GOODS ALREADY ON A PO — OWNER RULING, APPROVED / LOCKED 2026-09-28 (Jess, "yes"). MERGED (#1723); migration 0600 APPLIED 2026-09-28 (tracker `20260928102149`).**
Measured on production `b5e959d6`: SO-1358 (Ohana Fenrir King, qty 1) printed five
contradicting facts on one row — `Need PO` · `Already on a PO` · `Not ordered yet` · `No purchase
needed` · tick refused with `Nothing to buy` — because an open PO carried an unreserved quantity of
the same goods that was not linked to this order. The operator could neither buy nor reserve.

The ruling: **goods on an open PO that no order holds may be reserved for a Sales Order line
exactly like Ready Stock.** SO Batch therefore has three answers per line — reserve Ready Stock ·
reserve goods already on a PO · issue a new PO.

```text
not reserved                                     reserved
{PO No} has {n} {Item} available.  [Use this PO]    {n} {Item} on {PO No} is reserved for this order.
PO Status remains governed by the actual remaining quantity, not this optional offer.
```

- `Use this PO` reserves; the reservation is cancellable exactly like a Ready Stock choice and
  returns the quantity to the PO's free balance. The operator may ignore it and tick the row to
  issue a new PO instead; the second line never blocks buying.
- When that PO's goods are received, the reserved quantity belongs to this order without a
  second choice.
- Every `{PO No}` and quantity is read from the real PO; nothing is guessed. A PO whose free
  quantity cannot be read prints the existing `Coverage not checked` instead of a number.
- Law A: the reservation is the SAME exact-Unit reservation Ready Stock uses, owned by Stock.
  Every furniture Unit is born with its official PO (§6.2), so `Use this PO` binds that PO's
  `incoming` Unit ID(s) to the Sales Order line through the Ready Stock door family
  (`so_batch_save_ready_units` → `ops_stock_pool_draw` / `ops_stock_release`), never a
  quantity-only promise (Stock MASTER rejects those). Receiving turns a bound incoming Unit into
  `reserved` for that line instead of `free`. Purchasing's coverage engine reads the binding as
  exact lineage; the anonymous per-SKU pool netting that produced `Already on a PO` (and could
  move the cover to another customer on refresh, `packages/shared/src/to-order.ts` T6) no longer
  decides a bound line.
- **Measured build boundary (2026-09-28):** `ops_stock_pool_draw` (0546) refuses any Unit whose
  status is not `free`; the reserve/release doors, the receipt posting and the coverage engine
  each need the incoming case. 🟡 COPY REQUIRED — the pattern exists, no new invention; needs one
  governed migration. Accessory lines counted by quantity (no Unit ID) keep today's behaviour
  until a separate ruling.
- Reference: NetSuite and SAP allow incoming PO supply to be committed/pegged to a sales order.

**ONE-WORD STATUS, ONE ROW HEIGHT — current owner rulings, 2026-09-29 / 2026-10-04.**
SO Batch parent and item `PO Status` prints `Pending` · `Partial` · `Done`, using the approved
actual-quantity rule above. Manual Purchase retains `Status` `Need PO` · `No PO needed`.
Each is plain text on one line, without a coloured pill or a reason stacked in the cell.
SO Batch retains the shared grid's left-edge stripe: red means an actionable blocker; blue
means an optional stock/PO offer or a reservation fact. The full reason and its existing door
remain on the item line inside expansion. Manual Purchase uses its own Approval Status for
waiting approval. The legacy `/operation/purchasing` address redirects to SO Batch Purchase.

**Disabled selection explanation — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1589).**
The shared grid's optional refusal description names the same existing facts used by
SO Batch eligibility/planning and Manual Purchase approval/remainder. It is attached
to the disabled checkbox and reachable by keyboard through the existing kit tooltip;
the same facts remain visible on the row or in its expansion. The checked state,
select-all, stock allocation and PO issue authority are unchanged. Open PR #1490's
overlap was reviewed; only this still-missing behavior was ported against current main,
with unique description IDs across grids and a keyboard-focusable trigger.

CI `35986102965` and deployment `35987154529` passed; all five canonical endpoints
reported `96528e114129fb11d051a59fe81413dcb1c6a4d0`. The own Pages deployment
`29a1db37.carres-portal.pages.dev` added the refusal callback/trigger wiring compared
with `124bde31.carres-portal.pages.dev`, with existing copy unchanged. Before deployment,
the actual disabled SO checkboxes had no description. After deployment, SO-1358
exposed `Already on a PO`, SO-1206 exposed `SKU not found`, and the pending Manual
Purchase row exposed `Need approval`. Keyboard Tab/Shift+Tab returned focus to the
SO-1358 reason and displayed its tooltip with zero checked rows. No stock was selected,
request approved or PO issued. This closes refusal explanation only; exact SO lineage
versus generic SKU PO coverage and the write lifecycle remain separate open boundaries.


**Shared dictionary — APPROVED / NOT BUILT (Jess, 2026-09-18).** All four reviewed listings
(§9.1–§9.4), their detail facts and exports use [COPY-STANDARD: Purchasing UI dictionary](../COPY-STANDARD.md#purchasing-ui-dictionary).
The exact lists below are the owner's order; never rearrange them using a generic ordering heuristic.
This document approves presentation, not unverified new storage fields, identifiers or customer links.


**Purpose / source:** system-generated uncovered SO lines only; no `+ New`.

**OWNER RULINGS R1–R8 — SO BATCH ROUND 1, APPROVED / LOCKED 2026-09-16.** Built in PR #1395.
Fixture-walked in the real portal shell; the authenticated production walk is recorded in Card 11.

- **R1 · One retained register — current owner ruling 2026-10-04.** Unfinished purchase work
  appears first; completed work remains below. Default ordering uses Proceed Date within unfinished
  work, with optional Supplier grouping. Free warehouse stock is an optional offer, never automatic
  purchase exclusion. Deduct only actual SO-bound eligible Units and exact non-cancelled PO lineage.
  Search and filters cover retained records. The earlier automatic non-purchase group is retired.
- **R2 · Planning fact.** Order By remains the engine/detail date, not a parent column; the parent
  displays `PO Safety Days` under the shared dictionary. The planning date is the earliest over exactly the
  leaves the parent checkbox would tick; blank when nothing is left to buy. An undated `To buy`
  order says WHICH of three facts holds (S1, built 2026-09-17, `soBatchOrderPlanning().absence`):
  `Not planned` only when a leaf is blocked by missing setup (or an eligible leaf has no derivable
  date); `Coverage not checked` when whether an open PO covers a leaf could not be verified;
  `Already on a PO` when another open PO covers the remaining leaf. Setup is named first; an
  unverified leaf is named before a covered one, because unknown must never read as covered. Default ordering follows the current approved Blueprint: unfinished first, Proceed Date first;
  optional stock-match results put proposed matches first within the selected round. Header sorting
  and selectable grouping use the shared register grammar. No client calendar arithmetic is admitted.
- **R3 · Columns** — see the column paragraph below; the saved layout key is
  `carres.soBatchPurchase.register.v5`, and only this register's key moved.
- **R4 · Search** follows UI MASTER §6.7 (the responsive Register Search rule), adopted here first.
- **R5 · Palette.** DataGrid `palette="slate"`: white toolbar, rows and footer · header slate-3 fill,
  slate-11 text and icons, 11px/600, normal casing, no letter-spacing · group band white, slate-12,
  13px/600, 38px minimum, vertically centred · hover slate-3 · a ticked (or partly ticked) row
  blue-3 including pinned cells, outranking hover · an expanded row that is not ticked stays white ·
  expansion slate-2 with the 1px slate-6 connector · rules slate-5 · toolbar icons stroke 2 ·
  `Issue PO` = kit primary Button md (32px), also in the Issue workspace. SO Batch no longer composes
  the shared purchasing hex palette (`PurchasingRegister.module.css`, which Manual Purchase and
  Purchase Orders still use). Page canvas stays `kit.canvas`; control borders are unchanged. Inside
  a ticked row a link takes slate-12 ink with its underline, because blue-11 on blue-3 measured
  4.25:1.
- **R6 · Footer** — one total: `27 Sales Orders` · `5 of 27 Sales Orders` · `1 Sales Order`.
- **R7 · Widths — the number lives in ONE registry (owner instruction 2026-09-18).** A column's
  default width is its content; its minimum is the complete two-line header plus its controls. **The
  width itself is [UI MASTER §6.8's shared field registry](../ui/MASTER.md), not this section's:**
  a page MASTER that carries its own number for a registry field becomes a second authority, and
  one fact then has four widths. This page's measurements are EVIDENCE the registry reads — measured
  in the rendered portal (Inter): header chrome is 46px beyond the header text; a cross-year date is
  99px; `No delivery date yet` is 124px; `PO-20260930-4827` is 127px. No quantity column exists on
  this parent table, so no 88px value was adopted. Where this page's built width is narrower than the
  registry, the registry names the convergence it owes; closing it is this page's own round.
  Customer, Supplier, Delivery Location and Deliver To never ellipsise: a long value takes an inline
  second line, so the full value is readable by keyboard and touch with no hover title.
  **Width convergence — owner-approved 2026-10-05; implemented on release branch,
  production verification pending.** SO Batch parent definitions now reference the existing
  `REGISTER_FIELD_WIDTH` entries for Proceed Date, SO No, PO Safety Days, Customer Requested
  Delivery Date, Customer Delivery Location, Customer, Items, Supplier, Supplier Deliver To,
  PO No and PO Delivery Date. Existing header minimums, wrapping, facts, export readers and
  `carres.soBatchPurchase.register.v7` remain unchanged; valid saved personal widths still win,
  and Reset columns restores registry defaults. Registry values and shared behavior are unchanged.
  This closes only width-reference drift; destination and Safety Days drafts remain unreleased.
- **R8 · Issue workspace.** `Back to buying` returns to the SAME Register — it stays mounted and
  hidden behind the workspace, keeping search, rail filters, open groups, ticks and scroll offset,
  and the list is re-read so a line bought meanwhile drops its tick. `Esc` closes only transient
  inspection (Search, menus); it never leaves the Issue workspace.

Approved review A1–A15 also requires canvas-based rail overlay below 896px, 40px touch rows
below 768px canvas, issue layout governed by §8.2, truthful no-match and true-empty
states, clearable SO deep-link Search over the full Register, singular footer, unified
`Production days not set`, kit panel-toggle icons and 32px Buttons, explicit issue-permission
copy, two-line headers, token-based blocker panel and the retired Purchase Demands redirect.
Existing sidebar, rail sections, summaries, read-only PO details, Ready Stock, stale-selection
removal, coverage refusal, sticky identity and replacement selection toolbar remain intact.
Unreserve/Reassign restores item-line demand through current reservation truth; append-only
usage remains History, never a released-before purchasing badge or a second coverage table.

**Table listing frame — APPROVED / LOCKED, Owner correction 2026-08-29.** SO Batch inherits the
shared Register Kit's complete light four-sided frame around its Work Toolbar, table and fixed status
footer. It does not add a page-local second frame. This is not a card around the page and not a box
around every row. Selecting a row replaces the Register's top Work Toolbar in the same fixed-height
band with the summary, `Clear`, PO Duty chip and `Issue PO` on the left, and valid outputs such as
`Export Excel` at the far right. The primary action is never placed in a second bar below the table
or at the bottom of the viewport.

**Left rail — APPROVED / LOCKED, owner ruling 2026-10-04; bounded rail PRODUCTION-VERIFIED.**

The bounded rail delivery uses the shared Sales Orders rail composition with local `Listing` /
`Report` navigation. `Report` is a deferred destination: its contents are undecided, it remains
unavailable, and no monthly report is built. Other modules retain Monthly demand.

`Order time` prints the configured daily cutoffs; the approved default target is `10:15 AM` /
`4:00 PM`, never a hardcoded override of Settings. Authenticated read-only Settings inspection on
2026-10-04 measured production `11:00 AM` / `4:00 PM`, all Monday–Friday PO Days and 14 Safety days;
this delivery does not change configuration or live business records. The separate
planning group is `PO Safety Days`, with `Order early`, `{N} days left`, `1–{N−1} days left`,
`0 days left`, and `Production late`; N comes from configured Safety days. There is no inner
Safety days paragraph. This changes wording, not timing keys, quantities, eligibility or calendars.

**Measured baseline:** `apps/api/src/routes/operation/purchase-demands.ts` derives each demand's
`poWindow` from actual Proceed time through shared `poWindowFor`, governed PO Days and the Office
calendar/holidays. Work and the existing `?window=` destination use the same stamps. Authority resolution: §§5.6.1 and 9.1 explicitly approve actual Proceed admission; Order By is
planning arithmetic, never an unlock/admission gate.
This delivery preserves the existing server stamps and Work linkage.

**Current implementation:** the server returns dated rounds using its existing window stamps
plus the next two configured standard occurrences. Unique unfinished-SO counts reuse the
Register's existing `soBatchOrderPlanning().group` judgement: completed PO/Stock coverage
contributes zero; blocked/unverified demand remains counted. The full round projection survives
an existing `?window=` read. Date support text distinguishes repeated clock times.
Product/Supplier/Region duplicate rail controls are removed from this adopter; shared column
filters and the governed setup exception remain. Planning arithmetic, PO/Stock writers and Work
completion are unchanged.

**Production proof — 2026-10-04:** rail PR #1872 and canonical-count correction PR #1874 are merged.
Current application release `4807a1f6eb7fc90e19be944032ed6d3dff922812` passed full current-head CI
`37193113248` before #1874 merged, then exact merged-SHA production checks in `37193628202`.
Independent verification confirmed both Pages projects, both canonical domains and the API Worker
all report that same SHA. The 99-test purchase-demands suite includes completed history remaining
navigable with zero unfinished orders.

Authenticated read-only acceptance at `/operation?tab=purchase` verified Listing/disabled Report,
configured 11:00 AM/4:00 PM with dated rounds, 23 September → SO-1365 exact scope and toggle-back,
1–13 days left → three SOs, and hide/show with the original 32-SO Register preserved. Final count
acceptance measured 1 September → one blocked SO-1206 under To buy and 19 under No purchase needed,
with rail count one; 27 July displays zero. The full rail's five unfinished orders match To buy five.
Clear filters restored the unscoped Register. Authenticated narrow-window inspection (763px window)
verified the open rail leaves table flow and hide/show preserves the Register; its shared explicitly
opened preference is remembered. Window size and page state were restored. No Issue PO, supplier
communication, Settings change or live business write was executed.

**Bounded rail delivery COMPLETE.** Report content, whole-round Ready Stock matching, Quick View
issuance, supplier communication and full SO Batch completion retain their separate boundaries.

**Composition and interaction.** Reuse admitted `FilterRail` / `FilterRailGroup` / `FilterRailRow`,
shared Sales Orders `.so-template-rail`, and vertical `Tabs`; do not draw another rail kit.
Order time and PO Safety Days open by default. `Production days not set` remains the governed
Purchasing-owned setup exception only while an affected SO exists. Required source blockers stay
named in the register/expansion; no local Sales/Catalog action or second Work list is added.

Clock rows use exact dated `poWindow` identity, configured clock label and date supporting text;
counts are unique unfinished Sales Orders, never quantities, documents or suppliers. A selected
clock reuses the existing server `?window=` scope and selection behaviour. Selecting it again or
using the existing scope Clear filters returns to the original permanent register. Each planning
selection preserves its existing key, single-slot toggle and counts. All timing bands remain
orderable when otherwise eligible; late/early timing is risk, never an unlock gate. Source coverage
and purchase quantity continue to use the one canonical engine.

The rail stays 240px, scrolls vertically and uses the shared hide/show controls. Below an 896px
canvas it defaults hidden unless the shared explicit-open preference applies, and leaves the
register flow when shown; above that width it remains in
flow. It never squeezes the register or retires columns. PO Duty remains in the selected Issue
action rather than a permanent rail block. The bounded rail delivery preserves the original
register; approved whole-round matching, Quick View/issuance, status/grouping and other module
completion work keep their separate delivery boundaries.

**Safety days — APPROVED 2026-08-26.** The visible term is `Safety days`; `buffer` never reaches
a screen. `Safety days = 14 working days` on the governed Office working calendar and holidays;
`Production working days` is the existing Supplier × Category setting on the supplier's configured
work week and holidays. The one server planning engine owns the arithmetic — browser code performs
no working-day arithmetic, and Safety days are subtracted exactly once:

```text
Requested Delivery Date − 14 Safety days                         = Goods Must Arrive
Goods Must Arrive − Supplier × Category production working days  = Order By
```

**NO TRANSIT LEG — owner ruling 2026-09-29 (Jess: "remove transit days in setting").** Goods
arrival is the factory's production working days only, on the factory's own work week: the forward
arithmetic (`expectedArrivalOf`, identical to the PO Delivery Date's `poDeliveryDateOf`) and the
backward walk (`Order By`) are exact inverses with no second leg. A supplier's ready date is its
arrival. **Safety days are subtracted exactly once**, at `Goods Must Arrive`; `Order By` remains a
planned date, never an unlock date. Settings shows no Transit days; the stored
`purchasing_supplier_settings.transit_days` column and its setter stay in the database unread.
Consequences, accepted with the ruling: a supplier's recorded ready date becomes the expected
arrival itself (`POST /pos/:id/ready-date` sends it unchanged), and a supplier whose own work week
includes Saturday (Ohana) can have an arrival on a Saturday, exactly as its PO Delivery Date
already could since 2026-09-22.

**PO DAYS DO NOT MOVE `Order By`.** `po_days` (live: `Mon · Wed · Fri`) is a scheduling fact, not
an input to this arithmetic — the SO Batch surface passes no review days to the planner at all, so
`Order By` is calendar arithmetic alone and may legitimately land on a day POs are not sent (in the
worked example above, a Saturday). It never becomes an unlock date and never delays a late line.
`PO Days` does decide which days a PO window opens (owner correction 2026-09-25, §5.6.1); that
is Work scheduling, not planning arithmetic.

Timing classification, derived by the same engine:

```text
today < Order By                                                   → Can order early
today = Order By                                                   → 14 safety days left
today > Order By · completion lands 1–13 working days early        → 1–13 safety days left
expected production completion = Requested Delivery Date            → No safety days left
expected production completion > Requested Delivery Date            → Not enough production days
```

`Order By` stays fixed for a demand unless an authoritative source fact changes; `Safety days
left` changes as working days pass. The Settings row reads
`Safety days · 14 working days` with the line `Extra time allowed for delays.` — the one existing
governed setting and engine field, never a second Safety-days field or arithmetic.

**THE PERMANENT ORDER REGISTER — APPROVED / LOCKED, owner ruling 2026-08-27 (Card 02-B).**
The right Register shows **one row per proceeded physical-goods Sales Order**
(`orders.status = 'proceed_order'`; `place` is not proceeded; Service-only orders stay outside
Purchasing), and the row never leaves when a purchase order is issued — the page is both the
buying surface and the permanent purchasing audit register.

**THE PROCEEDED-ORDER BOUNDARY — APPROVED / LOCKED, owner correction 2026-08-27.** A complete
Sales Portal final submit completes the canonical `Proceed` transition automatically in the same
database transaction; the salesperson does not press a second button. A submitted order that is
still missing a governed Proceed fact remains `place` and stays outside Purchasing. When payment,
address, date or a governed correction supplies the last missing fact, the same transition is
retried automatically. `Move to Proceed` remains only as a recovery door for legacy/raw records.
`orders.status = 'proceed_order'` is the authoritative Purchasing boundary.
`orders.sales_final_submitted_at` is the final-submit/retry fact that lets the system re-test that
boundary after a later correction. Raw, office, rental and imported orders do not receive it.
Historical Portal and raw records cannot be separated truthfully from
creator role or completeness, so legacy recovery accepts only exact IDs confirmed by Principal,
requires a written reason, rejects office/rental/imported records and records
History + Audit before using the canonical transition. The retry runs at the final transaction
state, so a multi-part Sales revision cannot enter Purchasing on an intermediate total.

**PRODUCTION-VERIFIED 2026-08-28 (Card 02-D cutover).** Merge `97b7acd2` live on all five
governed surfaces; migrations `0396_sales_final_submit_is_the_handoff` and
`0397_retire_the_unguarded_sales_order_birth_door` applied in the governed order (0397 only
after the Worker SHA was verified), so `create_order` no longer carries a direct authenticated
grant. The five handoff behaviours were proven against production with rolled-back probes, and
the Owner-confirmed legacy recovery ran as one Principal batch: 32 exact IDs recovered with a
written reason (History + Audit per order), 20 entered the Register immediately (4 → 24 rows),
12 stayed `place` with their named blockers, and 7 candidates without POS submit evidence were
deliberately not recovered. Walked on the real Operation account: 24 rows, real buying lines on
expand, rail counts matching the register facts, and the live PO-duty holder named.

The read boundary is still drawn ONCE, at `loadToOrder`, before the engine ever sees a line — so a
genuine `place` order is invisible to the WHOLE surface: no planning, no netting (it cannot consume
Open PO coverage ahead of a proceeded order), no rail count, no Register row, no selection, no
Ready Stock take and no PO. Both write doors (`take-stock`, `issue-batch`) recompute through the
same read at POST time; a demand naming a `place` order resolves to nothing and is refused by name,
creating and reserving nothing. Every rail count — timing, Product, Supplier — draws from this same
proceeded-SO population. Rail filters combine with AND: a timing facet plus a product facet shows
only rows satisfying both, never a widening OR.

**Columns — OWNER RULING (Jess, 2026-09-18) · BUILT 2026-09-18, exactly in this order:**

```text
PO Status · Proceed Date · SO No · PO Safety Days · Customer’s original requested delivery ·
Customer Delivery Location · Customer · Items · Supplier · Supplier Deliver To · PO No ·
PO Delivery Date
```

`Items` shows `{first item} + {n} more`, with all items available in expansion.
The default order is unfinished purchase work first, then Done, with Proceed Date ascending within each. All retained records remain visible; the former automatic purchase/no-purchase groups are retired. `PO Safety Days` reads the remaining working-day margin defined in the shared COPY dictionary; the Order By date is not a goods-table column; underlying timing calculations remain unchanged. `Proceed Date` and `SO No` pin at canvas ≥768px; below 768px only `SO No`
pins. `Proceed Date` reads `orders.proceeded_at` (the actual hand-off), never
`orders.proceed_date`. The build bumps the saved layout key so no stored arrangement keeps the old
order; `leadingColumns` still refuses to hide or move the pair. Widths are measured at 1440 in the
shell with the rail open during the build.

- **PO Status** follows the owner-approved Pending / Partial / Done quantity contract above. The word does not authorize selection or assert supplier communication or Receiving. Unknown coverage cannot prove Done.
- **Visible PO attribution comes ONLY from `po_line_sources`** — never `purchase_orders.so`,
  `so_refs`, or a global SKU/supplier/customer match. `PO Delivery Date` is
  `purchase_orders.official_delivery_date`, the ORIGINAL supplier-facing date stamped at birth and
  never changed (§5.7) — never `eta_date`, which is the LIVE planning arrival the ready-date door
  recomputes; never `expected_ready_date`; never the internal `Goods Must Arrive`; never an
  "if ordered today" estimate. **Corrected 2026-09-09:** this section named `eta_date` and the
  Register read it, so the same column disagreed with Purchase Orders and with the paper the
  supplier holds. A PO whose original the 0428 recovery could not evidence stays NULL and prints
  `Not recorded` — the same word the Purchase Orders register already uses for the same fact, so
  one PO can never be described differently by two columns. An unknown original is never
  back-filled from today's planning date. **A BLANK cell keeps its own separate meaning: nothing
  has been ordered.**

  **Measured on the production walk, 2026-09-09:** 62 non-cancelled POs — 41 carry an original,
  21 do not. **None of those 21 has `po_line_sources` lineage to a Sales Order**, so none of them
  can reach this Register at all: the SO Batch column showed 26 rows of real dates and no
  `Not recorded`. The word is live and correct on **Purchase Orders**, which does list them. The
  guard is kept because it is the only thing standing between a future unevidenced original and a
  cell that would silently read as *nothing ordered* — but it is currently unreachable here, and
  this MASTER does not claim otherwise.
- **⭐ A PARENT SUMMARY SAYS ONE THING, AND NEVER EDITS — owner correction 2026-09-11.** One
  value prints itself; several print `2 POs` · `2 suppliers` · `Multiple`, with the exact
  item-to-PO/supplier/destination/date mapping in the expansion. **The measured
  first-value-plus-`+N more` presentation is retired**: it measured its own text against its own
  width, so the visible text, the exported text and the accessible name were three different
  answers and a narrower window silently changed what the screen said. `2 POs` opens the row's
  own expansion, where every number is a door beside the item line it covers; a single PO still
  links straight to Purchase Orders.
- **`Supplier Deliver To` on the parent is READ-ONLY for every row, and it states the ISSUED document's
  destination.** It used to BE the arrangement control — one eligible demand drew the full
  editor, several drew a `<select>` whose own text was made transparent so a summary could be
  painted over it. That was a summary that writes (Architecture Law B), a control whose visible,
  keyboard and accessible values disagreed, and a PLAN presented in the same cell as a FACT. The
  one place an unissued demand is arranged is its own row in the expansion, beside `Split`.
- **A row with no purchase order says so ONCE, under `PO No` (`Not ordered yet`).** `Supplier Deliver To`
  and `PO Delivery Date` describe a document; on a row that has none they stay blank rather than
  printing the same sentence three times across one row. `Not recorded` under `PO Delivery Date`
  keeps its own separate meaning: the document exists and its original date is not on file.
- **Selection:** the parent checkbox is ALL of the order's eligible uncovered child demand;
  a Partial order selects only its uncovered remainder; Ordered and fully Ready-Stock rows refuse
  the tick; part-selected children render the checkbox indeterminate; the header checkbox covers
  visible eligible demand only. The issue contract remains the leaf `SoBatchSelection[]`.

**Journey:** choose ready orders/lines → group by supplier → change/split destination if
exceptional → 50/50 check grouped POs → send PDFs.
**Object/placement:** the row expand is **`GoodsMiniTable`**, the ONE child table Sales Orders,
Delivery and Manual Purchase draw (owner ruling 2026-08-15; corrected onto this page 2026-08-24;
widened with the optional mapping columns 2026-08-27, and with an optional `PO No` plus an optional
`Unit ID` 2026-09-11 for the settled Manual Purchase design — a page asks for the columns it can
actually answer, and siblings that do not ask render byte-identically).

**SO Batch approved listing and stock-selection UI — Jess, 2026-09-18 · BUILT 2026-09-18 · authenticated production walk OWED.**

**BUILD RECORD.** The approved composition below is implemented on the real
Register, the shared `GoodsMiniTable` and the shared `ReadyStockTable`; no mock
HTML or CSS was transplanted. The saved layout key moved to
`carres.soBatchPurchase.register.v7` (the only key that moved). Migration
`0545_a_ready_stock_choice_is_saved_whole_or_not_at_all` adds
`so_batch_save_ready_units`, the replacement door `Save changes` presses: it
gives back what the chosen set drops through `ops_stock_release`, then takes
what it gains through the existing atomic `so_batch_reserve_ready_units`, inside
ONE transaction. It decides nothing of its own (Architecture Law C), releases
BEFORE it draws so a swap on a one-piece line is not refused as already covered,
refuses to take back a `sold` Unit by name, and never rewinds the append-only
pool ledger (0292). Proved as SQL against a real Postgres, plus the route,
component and engine suites; the whole listing and picker were walked at
1440 / 1180 / 820 / 390 and at 200% zoom on the real components. **OWED: the
authenticated production walk, and the Worker/Pages SHA verification.**

**THE 390px 🔴 FOUND ON THAT WALK IS FIXED, IN THE SHARED HEADER — 2026-09-18.**
At a 390px canvas every destination page scrolled sideways by 30px. The Register
never caused it — its grid scrolls inside its own box (client 374px, content
1709px) — and every overflowing element sat in the shared `ModuleHeader`
destination row. The fix is there, not here, and not behind a purchasing flag:
UI MASTER §6.7 carries it. Re-measured on all 29 real destination words at 1440
and 390: 0px page overflow, nothing clipped, the governed 24px kept, and 1440
unchanged at exactly 51px.


The goods table is `☐ · Status · Category · Qty · Item · Ready Stock · Supplier · Supplier Deliver To`.
No SKU, Ordered Qty, To buy, Order By or PO Safety Days column in this actionable expansion.
Qty remains the original SO quantity. Remaining purchasing quantity is shown in the selection
bar and the issue review, using authoritative coverage; removing columns removes no duplicate-order
protection. A matched set remains one purchasing demand, not one tick per physical display row.
Status uses `Need PO` / `No PO needed` for the need for a new PO, not permission to buy:
unknown coverage and other blockers still prevent selection and state their actual reason.

The row-leading disclosure expands goods; it is separate from the SO No detail link.
Ready Stock is a cell on the item row: available count on line one, reserved-for-this-line count
on line two, and a separate disclosure button. Zero available with no saved reservation shows `0`
and no disclosure; saved reservations remain accessible even when free availability is zero.
Loading/failed/unknown stock never renders as zero. Its Unit table opens directly beneath this item:
`☐ · Goods Received Date · Stock Location · Supplier · PO No / Ref No (Unit ID on line two) · Condition`.
Use actual provenance and actual current location, not the SO supplier or expected delivery site.
Receipt date is the physical receipt DATE only on this stock picker. Missing dates are `Not recorded`;
do not invent time or change stored timestamps. Missing PO provenance is not a reason to invent a PO.
Supplier-owned stock must remain distinguishable; this presentation grants no new eligibility.

Checkboxes edit a draft freely. `Choose Ready Unit` saves the first reservation independently of
Issue PO. After saving, `Change selection` reopens the saved set; `Save changes` saves the replacement
set, including removing all choices; `Cancel` restores the saved set. Pending edits cannot silently
change procurement quantities: save or cancel before Issue PO. No per-Unit Undo/release buttons.
Saving must atomically validate additions AND releases against current stock/line state and downstream
locks; all or none, no second stock writer. A failure retains the draft and explains the refusal.
These editing controls are approved targets, not a claim that current production supports replacement.
An all-stock SO must be savable without creating a PO. Read-only Purchase order details remain separate.

Shared appearance and connector geometry are governed only by UI MASTER §6.8–6.9; words by COPY.
The HTML quantity dialog is NOT approved as the Issue PO workspace. §8.2 still governs formal draft
review (approved desktop split in §8.2); that preview remains unfinished in this design review.

**THE READ-ONLY RECORD — `Purchase order details`, its own heading, its own table.**

```text
PO No              Unit ID              SKU       Item              Qty  Deliver To    Supplier  PO Delivery Date
PO-20260820-4827   U1-000-078           L1201S-K  Laveo · King       1   Carres Klang  Nice F…   Thu, 17 Sep
PO-20260820-4827   U1-000-079           L1201S-K  Laveo · King       1   Carres Klang  Nice F…   Thu, 17 Sep
                   Item line not recorded
PO-20260904-4665   Not allocated        JAGER-SS  Jager · SS         1   Carres Klang  Ohana     Not recorded
```

- **ONE ROW PER DOCUMENT *LINE*, NOT PER DOCUMENT.** A purchase order may carry one SKU to two
  destinations through two lines and source both to the same customer item line (the governed
  `Supplier Deliver To` split). Keyed by `po_id` alone the two collapsed and only the PARENT document's
  destination was left to print — **a parent summary standing in for a line's own recorded fact**,
  which is exactly what this correction removed from the row above. `po_line_sources.po_line_id`
  now rides through, and each entry carries **the LINE's `destination_id`, falling back to the
  document's ONLY where the line records none** — the same rule the Sales Order expansion door uses,
  and the only case in which a parent summary may speak for a line.
- **`PO No`, not `Covered by` and not `ON PO`**, and `PO No` and `Unit ID` are NEIGHBOURS: they are
  the two identifiers a person copies, and a reader who must look across four columns to pair a
  document with its goods pairs them wrongly. Both print in FULL and stay selectable.
  Stored PO identity remains unchanged. Where the current official version is presented,
  apply §9.3's approved two-digit-year `PO Version` display and resolve it to the same source PO;
  do not restore the retired blanket prohibition on removing `20`. Never invent a version for
  a source link whose version is unknown.
- **Ordinary readable rows, no control, no grey block.** A record cannot be bought again, so it
  carries no checkbox and no destination editor; what makes it read-only is the ABSENCE of controls,
  not a disabled-looking wash over the module's own audit evidence.
- **Columns that would only ever print a dash here are absent** — `Ready Stock`, `To buy`,
  `Category` and the tick column.
- **Every `po_line_sources` unit gets a row.** Units the read can evidence for that document are
  named one per row; the quantity the document carries beyond them is stated as a remainder. A Unit
  naming a document this line's lineage does not carry is **still printed** — a disagreement between
  two authoritative reads is what an audit register exists to show. A Unit with no document behind it
  is Ready Stock's answer and stays out of this table.
- The section renders only when the order has lineage; an order with no purchase order says
  `Not ordered yet` once, on the item table, and has no details section at all.

**⭐ A UNIT'S ITEM LINE IS READ FROM THE RECORD, NOT INFERRED FROM ITS SKU — owner correction
2026-09-11.** The Sales Order expansion door grouped every reserved/sold Unit of an order by
NORMALIZED SKU, so a Sales Order with two item lines of one SKU — SO-1251, SO-1207 and SO-1246 carry
exactly that — printed the SAME Unit IDs under BOTH lines. `ops_stock_items.reserved_order_line_id`
has answered that question since 0471 and the read simply did not ask it. It asks now:

- a Unit bound to a line appears under THAT line and nowhere else;
- a Unit incoming on a purchase-order line sourced EXCLUSIVELY to one SO item line is exact by the
  document, exactly as before;
- a Unit that carries NO binding (a pre-0471 reservation), or one bound to another line, keeps the
  SKU reading — evidence is never dropped to tidy a screen — and the row says
  **`Item line matched by SKU`**, so an INFERENCE stays inspectable and can never be read as
  evidence.
- a read that carries no binding for that Unit at all says **`Item line unknown`**. A gap in
  the READ is not a gap in the RECORD, and it may not borrow the other sentence: that one would be a
  claim about this browser wearing the clothes of a fact about the goods.
- **⭐ ABSENCE PROVES NOTHING — owner correction 2026-09-11.** A Unit MISSING from the binding map
  was read as EXACT, on the true-but-fragile ground that only incoming goods are absent and those
  are evidenced by a purchase-order line sourced exclusively to the item line. That let a gap in the
  DATA prove a fact about the GOODS: any later read that stopped populating the map, or populated it
  partially, would silently begin certifying inferences. **The server now WRITES the
  incoming-exclusive binding into the map**, so the fact is declared rather than inferred from its
  own absence, and absence means `unresolved` — never exact. A purchase-order line SHARED with
  another Sales Order evidences nothing and names no line, exactly as before.
- **⭐ AN INFERENCE IS NEVER COUNTED AS COVERAGE.** The same physical Unit is offered by the SKU
  reading to EVERY item line of that SKU on the order, so an inferred Unit row carries **no
  quantity** and does **not** draw the document line's remainder down. Only an exact Unit does.
  Without that rule one Unit accounted for two item lines' quantities at once and the section's own
  numbers stopped adding up; with it, `Σ(exact rows) + remainder = the document line's quantity`.
  **The section renders no total row at all**, so no footer can silently sum a `—`, and the table
  feeds no export: the Register above exports the ORDER's own columns, none of which is a per-Unit
  quantity.
- **⭐ A COUNTED ROW IS NOT A UNIT (0453).** `identity_scope` rides the wire as `unitScopes`, and
  every Unit ID on this table is resolved through the ONE shared rule (`unitIdOf`), which answers
  `null` for counted goods and keeps its `QTY-` shape backstop. Such a row prints
  **`Counted stock`** — there is no Unit ID and there never will be — and its quantity is still
  stated. The technical key never reaches a `Unit ID` heading.
- The response carries the stored value verbatim as `unitLines`; it is optional, so a browser on
  this build against an older Worker reads it as absent and says the association is unknown rather
  than inventing one. The field is ADDITIVE — Sales Orders and Delivery are unaffected.

**⭐ FIVE ANSWERS FOR AN EMPTY UNIT CELL, AND NONE OF THEM IS A SPARE.** `Loading…` while the Unit
read is in flight · `Could not be loaded` when it failed (with the existing retry) ·
**`Not checked`** when the read answered for the ORDER and carried no entry for THIS item line —
Carres did not look here, which is not the same as looking and finding nothing · **`Counted stock`**
when the goods are counted rather than individually tracked · and `Not allocated` ONLY when the read
answered for this line and no Unit is tied to the quantity. Printing any of the first four as the last is how a reader
concludes goods do not exist because a request was slow.

**Coverage safeguards remain independent of the new display.** Exact `po_line_sources` records
are historical lineage; the open-PO pool is effective remaining supply. Do not equate them, count
received quantities twice, invent a third arithmetic, or change grouping/coverage allocation in this
UI change. `fullyOnPo` must explicitly be false to authorize the pool gate; true or unknown is not
buyable. The issue API independently recomputes and rejects already-covered quantities before any
PO is created. Preserve existing lineage guards as well. Read-only PO details retain document
states (`Completed`, `Waiting for goods from supplier`, `Sending not confirmed`); raw `Open` is not
operator copy. Remaining purchasing quantities belong in selection/review, not removed goods columns.

**Footer — owner correction 2026-09-11, ruling R6 2026-09-16.** The footer answers SCOPE with ONE
total: `{n} of {total} Sales Orders`, the bare total when nothing is filtered, and `1 Sales Order`
in the singular. It counts matching records in collapsed groups too. The retired `{n} Partial · {n} Ordered` tally came
from the retired Status presentation and, inside a filtered view, read as a claim about the whole
business. Selection is summarised once, in the toolbar, and never repeated at the bottom.
**Exceptions:** cancelled/changed SO, stock becomes available, supplier missing, supplier date too
late, price changed, split destination.
**Connections:** Sales Orders, Stock, Delivery calendar, Catalog, PO.

**READY STOCK — reservation engine built; the approved replacement UI above BUILT 2026-09-18.**
The item-cell disclosure and draft/edit/save journey above govern presentation. The following
stock eligibility and transaction safeguards remain in force, unchanged by it.

- **THE READ CARRIES WHAT THE PICKER PRINTS.** `stock_unit_register_v.po_no` rides the wire as
  the document reference, the receipt `date_in` as a DATE, and a Unit already committed to one of
  this order's item lines rides back marked with the line it answers — so `Change selection` can
  show and remove exactly what was saved even when free availability is zero. A Unit is named
  once. `lineIds` answers *what is on the shelf for this item line* and `matchingLineIds` answers
  *what may be committed now*: a covered line whose shelf is full must not read as an empty shelf.
- **THE ITEM LINE IS STRUCTURAL, NOT TYPED.** The picker opens beneath ONE item row, so the
  retired `For item line` dropdown is gone and the exact line id still reaches the door, which
  still refuses to guess (0471).

- **Reading it reserves nothing.** The read is lazy (opened rows only) and writes no row. Selecting
  a Unit still writes nothing. Only `Choose Ready Unit` writes, and its selection is entirely
  separate from the Register's purchasing tick.
- **The offer is the authoritative register**, `stock_unit_register_v` filtered on
  `availability = 'available'` — the ONE availability arithmetic (0371), which already excludes a
  released-but-damaged Unit, anything needing repair and anything on hold. **No warehouse filter:**
  goods at a second site are still goods Carres owns. `Condition` is a GRADE and a separate fact —
  a `Display` Unit is fully available. `Where`, `Owner` (Carres · Supplier) and `Qty` are read, not
  assumed.
- **A counted row is shown and is not choosable.** `identity_scope = 'quantity'` stock (0453) wears
  a `QTY-` key, never a Unit ID, and 0368's ruling — bulk is not bindable — is enforced at the
  reservation door, not by a screen. Hiding it would make a full shelf read as an empty one.
- **A reserved Unit names the SO ITEM LINE it answers**, not just the order.
  `ops_stock_items.reserved_order_line_id` is that binding; `reserved_ref` still names the order.
  A Sales Order with two item lines of one SKU — SO-1251, SO-1207 and SO-1246 carry exactly that
  today — is the case this exists for. When a caller names no line the door RESOLVES one and has
  exactly two outcomes: a single candidate, or a named refusal. It never picks out of several.
- **The door validates in SQL on the locked row**: the line belongs to that Sales Order, the goods
  match by `stock_match_key` (its SQL twin is pinned to the TypeScript rule by a contract test over
  the live 327-SKU corpus; zero collisions across the 236 Catalog SKUs, measured 2026-09-10), the
  Unit is an exact Unit, it is `available`, and the line still has a remaining requirement of
  `qty − Ready Stock bound − non-cancelled PO lineage` — the same expression
  `soBatchOrderLineOutstandingQty` prints. **There is no override**: not a reason box, not a note.
- **One act is one transaction.** `so_batch_reserve_ready_units` loops the one governed draw door
  inside a single transaction: every chosen Unit or none, and a race refuses the whole act by name.
  It is not a second writer.
- **Release and substitution give the requirement back.** `ops_stock_release` and
  `ops_stock_reassign` clear the binding, so the customer's requirement returns to this Register by
  itself. `ops_stock_pool_usage` is NOT rewound — it counts the DECISION and stays append-only
  (0292); coverage is a different question and now has its own answer. Coverage reads the binding
  for every new reservation and the historical ledger only for units that carry none, and the two
  sets are disjoint by Unit so nothing is counted twice.
- **The original demand survives.** After reserving, the section states
  the original Qty, saved stock quantity and remaining purchasing quantity; the exact saved Unit IDs stay visible in the picker. The ordered
  quantity is never quietly rewritten, and choosing stock never cancels, replaces or edits an
  existing purchase order.
- **Supplier-owned display stock is not eligible for customer sale.** Apply §7.7 ownership
  eligibility at the owning Stock/Sales door; a label alone is insufficient. Earlier chooser support
  is implementation evidence, not permission to sell supplier-owned display goods.
- **The act states what it did, in Units — and a refusal names the Unit it is about (0473).** There
  are exactly two outcomes and the section prints which. A success names every Unit the DOOR
  committed, never what the browser asked for. A refusal prints the door's own governed sentence,
  the Unit that stopped the act, and `No Unit was reserved.` — the atomic guarantee stated once, for
  every refusal alike. The chosen set is LEFT ALONE after a refusal, so the operator unticks that one
  Unit and presses again instead of rebuilding a selection nothing touched. Before this, an operator
  who chose five Units and read *"someone else took that Unit"* had to untick them one at a time to
  find out which — four more races.
- **⭐ A TIMEOUT IS NOT A REFUSAL — LOCKED 2026-09-11.** A CONFIRMED refusal is the door saying
  no: the transaction rolled back and nothing was reserved, and the section says so by name. A
  request that never came back — a timeout, a dropped connection, a gateway error in front of the
  Worker — says nothing at all about the transaction, which may well have COMMITTED. The section
  must not print `No Unit was reserved.` there: it states that the result could not be confirmed,
  RE-READS the authoritative record at once, drops the chosen set so the same button cannot be
  pressed blind, and points the operator at the refreshed Unit IDs. Pressing again on an unknown
  outcome is exactly how one Unit gets reserved twice.
- **⭐ A PURCHASING TICK DIES WITH THE NUMBER IT WAS TAKEN AGAINST — LOCKED 2026-09-11.** A tick in
  the Register above is an arrangement of `To buy` units across destinations, so it is only
  meaningful against the `To buy` the operator saw. That number MOVES under an open page: this
  section commits a Unit, a colleague issues a purchase order, a reservation is released. Measured
  before the fix: tick `To buy 3`, reserve 2 Units here, press `Issue PO` — the browser sent 3
  against a server remainder of 1, the door refused it by name (`allocation_mismatch`, the law held)
  and the operator was handed an error instead of the recalculated quantity. So each tick now
  remembers its own `To buy` and is DROPPED when the server's recomputation disagrees — and the
  ticks standing on the item lines a reservation just answered are dropped at once, before the
  recomputed numbers arrive, because that read is a round trip away and `Issue PO` is one click.
  **The tick is never silently re-pointed at the new number**: a tick is a decision about a
  quantity, and a decision the system rewrites is not the operator's. Over-allocation was already
  impossible — the door recomputes and refuses — but the operator's next move is now the
  recalculated quantity rather than an error.

**THE PRODUCTION PROOF (2026-09-11, re-measured on `64a16a9e` after the Manual Purchase refactor merged over it).** Migration `0473` applied through the governed path, and its
live `md5(prosrc)` reconciles with the committed file body — production runs the SQL this repository
carries, not a hand-retyped copy. A **rolled-back probe** as the operation actor refused a
deliberately mismatched pick with `sqlstate=22023 · unit_does_not_match_line ·
"that Unit is not the goods this item line ordered · unit_id=426067bf-…"`, and the same act through
the DEPLOYED Worker, called AUTHENTICATED, answered `422 {code, itemId}`. Both wrote nothing: the
Unit is still `free` and the append-only ledger gained no row. The read answered 200 on real data —
SO-1322 states `JAGER-SS qty 1 · Ready Stock 1` (Unit `id-vyf051985`) `· To purchase 0`, and its
three other available JAGER-SS Units say `No item line needs it`. **What could NOT be walked live:
the reserve journey on a Register row.** Of the 26 proceeded Sales Orders the Register carries today,
25 are offered no Unit at all and one (SO-1209) is offered three, every one already answered — so
there is no live row where `Choose Ready Unit` is pressable, and inventing an order to make one is
not evidence. The write path stands on the production SQL probe, the deployed Worker's refusal and
the committed tests, which include the same-SKU, concurrent, whole-batch-refusal and
already-covered cases against a real Postgres.

**THE DOCUMENT PARTITION — ONE CONTRACT, BOTH SIDES.** A purchase order is one
`Supplier × Deliver To × Category × (one-PO-per-order category ? Source Order : —)`. The browser and
the server compute that key from the same facts (`documentPartitionKey`), so `Issue N POs`, `1 of N`,
the commercial decisions, the server's grouping and the number of purchase orders created cannot
drift apart; the server still recomputes it from its own recomputation, which is agreement rather
than trust. A commercial decision names the exact document it belongs to, and a duplicate, foreign,
stale or partial-coverage decision is refused BY NAME. A `Supplier Deliver To` split therefore buys the
demand ONCE: lines are composed from the ALLOCATION, not from the whole build.

**EVERY PO LINE CARRIES ITS SOURCE.** `po_line_sources` records which customer order, SO number and
order line each unit is for, validated in SQL rather than trusted, and the parts must add up to the
line. The supplier-facing document prints that breakdown, so a bulk purchase order no longer shows a
blank `SO NO`.

### 9.2 Manual Purchase

**CREATE / RETURNED-REQUEST EDIT BLUEPRINT — owner confirmed 2026-09-22; BUILT in
PURCHASING CARD 13.**

**MIGRATION STATE, exactly (2026-09-23).** All THREE migrations this surface owns are
**APPLIED to production** through the governed `apply_migration` path, each with
`md5(statements[1])` equal to the committed file's md5:

- `0562_a_manual_purchase_says_what_it_needs` — tracker `20260922211119`, md5
  `7fb88f3b…`. It added the nullable `purchase_requirement` column and the three
  requirement-carrying doors, and deliberately LEFT the superseded overloads standing: a
  migration lands before its bundle, and dropping the nine-name door would have refused
  every Manual Purchase raised in that window.
- `0563_one_create_door_per_name_again` — tracker `20260923015736`, md5 `8287aeb6…`,
  applied AFTER all five production surfaces reported the merge SHA. It dropped those
  overloads (functions only; no table, column or row touched), and `pg_proc` now carries
  exactly ONE `purchasing_create_request`, ONE `purchasing_create_request_with_lines` and
  ONE `purchasing_resubmit_request`, each ending in `p_purchase_requirement` — measured,
  not assumed. It also rewrote 0562's own stale comment where it stands, because a
  committed migration is never edited.

- `0573_a_purchase_order_may_be_issued_without_a_recorded_price` — tracker
  `20260923134012`, md5 `305caeef…`, applied 2026-09-23 AFTER the CARD 13-B merge SHA had
  converged on all five surfaces. It relaxes the two price gates only (functions only; no
  table, column, constraint or row touched), and it was applied ONLY after `md5(prosrc)` of
  both live doors was measured equal to their committed 0443 bodies (`aa16259a…`,
  `5f1e4415…`) — a replace over a body somebody else had changed would have silently
  reverted them. Measured after: ONE overload each, the creation helper carrying the
  both-null rule with its committed 16 raises, and the issue authority guarding both price
  passes with its committed 21 raises. Born as 0565 and renumbered before it ever ran,
  because the Sales Order lane shipped its own 0565 while this card was paused (red line 7:
  measure the MAX at push time).

**DELIVERED.** PR #1529 squash-merged as `3f99f41c9`; the production verifier reports that
SHA on both Pages projects, both canonical hosts and the API Worker.
**🔴 THE AUTHENTICATED PRODUCTION WALK IS STILL OWED** — a signed-in walk of the create
workspace (three sections, the live preview, a `Purchase requirement` that survives the
round trip) and of `Review Purchase Orders` (documents drawn, `Cancel` creating nothing).
A converged SHA proves the bundle shipped; it proves nothing about what the register draws.

**CARD 13-B DELIVERED.** PR #1547 squash-merged as `6390c3531`; the production verifier
reports that SHA on both Pages projects, both canonical hosts and the API Worker, and
migration 0573 is applied above it. It carries the four defects the owner's review of CARD 13
found on main — the mixed-selection over-issue, the half-empty draft, the price blocker and
the duplicated review surface — plus the PO date convergence. **🔴 THE AUTHENTICATED WALK
COVERS BOTH CARDS AND IS STILL OWED:** a mixed selection (one request whole beside another
narrowed) issuing exactly the ticked goods, a draft carrying both addresses and the PO
Delivery Date, a SKU with no Catalog price reaching a real PO, and the printed PO PDF.

Reuse the selected Sales Order form composition, with a 50/50 form and live MPR
preview at the governed readable desktop width; use the shared stacked layout
below it. This overrides the former blanket ban on a Manual Purchase split
preview for creation and returned-request editing only. Ordinary saved-object
view and the Register retain their separately governed layouts.

**Narrow action bar correction, 2026-09-24 — DEPLOYED + AUTHENTICATED READBACK #1574 (`68c71c544`).**
At a 390px portal viewport the long existing stock-intent refusal pushed Cancel
outside the content canvas. The footer now wraps its action pair and long button
text. Browser measurements at 320px and 390px keep both actions within the main
pane. Authenticated production at 390px measured the long stock-intent button
inside x=76–322 (246px wide, 38px high), with Cancel fully visible; at 1074px
the original header actions remain visible and the footer stays hidden. The
unsent draft was cancelled. CI `35963457606` passed (12,596 tests, 100 existing
skips); deploy `35964281215` succeeded and all five canonical SHA endpoints
converged. No submission, approval, requester identity or stock-intent rule changes.

**Read-only requester check, 2026-09-24.** The live register had four requests:
one in Need approval and none in Need PO. The missing historical requester displayed
`Staff identity not recorded`. The current principal account's unsent create form and
preview both displayed `principal`, resolved from the existing Staff list in
`OperationManualPurchase.tsx`; this is not proof of a named operational employee's
saved-request lifecycle. The empty draft was cancelled. The form already uses the
shared `Block`; its default shared title treatment is not evidence of an unimplemented
composition merely because Sales Order uses its separate blue-title opt-in.

The three sections, in the SAME reading order on the form and preview, are:

1. **Request Details** — drawn in the Sales Order fact grammar, one title one box,
   three to a row, in this reading order (owner ruling 2026-09-26 — "yes" to the
   sketch): **row 1** automatic `Requested By` · automatic `Proceed Date` (both in the grey automatic box, owner 2026-09-28; UI MASTER one card grammar) · `Purpose`;
   **row 2** the purpose's own second box, whose title changes with the purpose —
   `Service Case` (Service Case) · `Staff member` (Internal Staff Purchase) ·
   `Subsidiary` (Subsidiary Purchase) · `What is this for?` (Other Purchase, required
   before Send) — and NO second box for Ready Stock / Showroom Display, so `Can stock
   answer this?` (explicit choice, no inferred/default answer) moves left; **row 3** the
   optional `Purchase requirement` as one full-width box. The requirement stays here,
   never a separate section or a bottom-of-form question.
   Proceed Date previews server time and records the actual successful hand-off;
   it is not a manually backdated document date. Requester is the real individual.
2. **Delivery** — `Deliver To` from governed destinations, then `Delivery Date`.
   Complete item/Settings facts provide the request's default arrival date;
   staff can adjust it and the system never silently overwrites that choice.
3. **Items** — Catalog search/selection, automatically resolved name, specification
   and Supplier, editable positive whole `Qty`, optional `Note`, `+ Add line` and
   `Remove` for unsubmitted lines. Supplier is not an independent first-section
   choice: a request can contain several Catalog-derived suppliers. Stock reference
   opens with its governed loading/error/unknown/available meanings and does not
   silently reserve or subtract stock. Existing concrete-need versus extra-stock
   rules continue to apply.

The right pane is the **DRAFT Purchase Order paper** (owner 2026-09-28: "it should pdf
preview … it same with so batch"; BUILT 2026-09-28): one paper per Catalog supplier of the
picked lines, rendered from the same draft the form holds by the PO template SO Batch's
review uses, under that review's own sentence. It prints the supplier and Warehouse
addresses, each line's item with the request's purpose word, its quantity and its
`Configure` choice. It is a draft: no MPR or PO number, no PO Doc Date, no PO Delivery
Date (Settings set it at issue; the request's `Supplier Delivery Date` is never copied into
it), no Unit IDs, and no claim of approval. Before any item is chosen it is still one
empty paper. The create card is `Supplier Delivery` with `Supplier Deliver To` and
`Supplier Delivery Date` (owner 2026-09-28). Supplier-facing documents appear at Issue PO, one preview
per actual grouped PO, using PO-PDF-STANDARD. Never combine several suppliers on
one PO. No Payment / Paid to date / Balance due / financial-progress section.
Use the existing top action placement and governed submission action; typing,
previewing, printing or downloading never submits a request or sends a PO.

**MPR → PO completion scope — owner approved 2026-09-22; implementation delivered in Cards 13/13-B and #1573; authenticated issue lifecycle still owed.**
The scope is Manual Purchase create/returned-request edit, its internal live MPR
preview, the concrete Register corrections below, and the MPR-to-PO review/issue
journey. Subscription is outside this scope. Approval of scope is not production
verification or approval of unreviewed visual details.

- Preserve the Register's approved column order, group-local headers and shared
  width registry. Correct confirmed no-PO wording across parent rows, goods,
  object lineage, filters and exports to `No PO yet`; a failed lineage read is
  never a no-PO fact. Keep permanent history and truthful partial quantities.
- Only approved goods with a confirmed live remaining requirement are selectable.
  Show selected request count, goods quantity and the exact resulting PO count;
  the preview and actual issue must agree. Unresolved/unsaved stock selections
  keep their existing named guard. Staff do not calculate the document count.
- Register `Issue PO` opens `Review Purchase Orders` before creation. The work
  pane and actual PO draft use the governed 50/50 / stacked composition. Review
  each resulting document with its Supplier, destination, source MPRs, goods,
  quantity and dates; changing the selected document changes its PDF preview.
  Draft review creates no PO number, Unit ID, supplier commitment or sent record.
- Preserve all FIVE initial grouping facts: Supplier × Category × Deliver To ×
  Purpose × MPR Delivery Date. Only matching groups combine across requests.
  Different destinations at initial issue produce different POs. This does not
  revoke §5.4's permitted later multi-destination revision of the SAME PO.
- Reuse the existing SO Batch review capability, not a parallel issue workspace.
  **BUILT (Card 13-B):** `so-batch/SoBatchIssueWorkspace.tsx` receives the MPR
  lane's own issue callback and retains its source, approval, remaining-quantity
  and allocation validation. §8.2 records #1573's shared actual-PDF improvement
  and its production verification boundary. No new financial placement gate is
  inferred from sharing the review.
- Official issue allocates the real PO identity and, for tracked goods only,
  exact Unit IDs through the existing authority. Counted-only goods receive no
  Unit IDs. Preserve exact MPR-to-PO source lineage in both directions. Re-read
  issued/remaining quantities after issue; a partial request remains in `Need PO`.
  Errors or retries must never create duplicate demand or a second order.
- Issued is not sent. Keep the one communication/evidence area, recording the
  actual version, recipient, channel, actor and time. Leaving an issued document
  does not delete it or reopen its covered demand. Download/print are not sending.
- **OWNER CORRECTION 2026-09-26 — NO FREE TEXT; THE LINE IS CONFIGURED LIKE THE SALES PORTAL.**
  `Purchase requirement` (0562, Card 13) was NOT the owner's blueprint: Jess — "I order what, got
  colour to choose, what I want more to write, no free text". Measured: a Sales portal line is
  configured through `Configure` (Size · Mattress gap · Fabric · Colour · Options · Leg height ·
  Special add-ons, all Catalog choices) and the choice lives in the line's `attrs`; a PO born from a
  Sales Order prints that configuration under the item on the PO PDF (`Sand · Fabric CG-012`); a
  Manual Purchase line carried only SKU · Qty · free-text `Note`, so its PO printed nothing.
  **Ruling (Jess, 2026-09-26, "yes"):** every Manual Purchase goods line gets the SAME `Configure`
  as the Sales portal — the same configurator components over the same Catalog option pools — and
  its configuration travels MPR → PO line `attrs` → PO PDF exactly as a Sales-Order line does.
  `Purchase requirement` (request level) and the per-line free-text `Note` are RETIRED from the
  form, the internal MPR preview, PO review and the saved detail; the configurator's own small
  remark slot (✎, the one Sales already has) is the only free note. The database columns stay
  (never dropped); the doors stop writing them. `What is this for?` (Other Purchase) is unchanged.
  **BUILT 2026-09-26 (PR #1672); migration `0591` APPLIED 2026-09-28** through the governed path:
  a full-file rolled-back production probe, then the exact file. Tracker row `20260928041419`,
  `md5(statements[1])` = file md5 `7e161e96e157fe09463408342e382272`; both door bodies match the
  replayed full-chain database (`purchasing_create_request_with_lines` `40a8b4e1…`,
  `purchasing_resubmit_request` `7f198296…`). The authenticated owner walk (configure a line →
  issue → PO PDF prints it) is still owed.

**Approval boundary — owner selected A, 2026-09-22; APPROVED.**
Every MPR keeps request-authorisation approval: the decision is WHETHER TO BUY,
not price approval or permission to pay. The existing Purchasing Approver duty,
actual-person/cover and no-self-approval rules continue to govern; its recorded
holder is Jess. Approval is required before PO issue. Recording a price or waiting
for financial approval must not add a placement/issue blocker; any required
financial approval is Jess-only. Do not automatically accept an expense or make
payment by issuing the PO. A late approval triggers governed Work follow-up; it
never automatically removes the gate or appoints another approver. Changing
that operating rule requires a new owner ruling. Price entry on a PO does not
add an MPR price editor by inference.

**Date boundary — owner approved 2026-09-22; BUILT (Cards 13/13-B), actual MPR issuance walk still owed.**
MPR `Delivery Date` remains the requested arrival date and remains an initial
PO grouping fact. PO `PO Delivery Date` is calculated from PO Date using the
recorded applicable Settings working days under §5.7, skipping applicable
weekends/public holidays, with NO added transit days. Do not copy the MPR date
into the PO's original date. Preserve both facts and make any mismatch visible
in review; never silently alter the request or claim a supplier has confirmed it.
The register projection and issue path now call the shared `poDeliveryDateOf`;
#1573 carries the provisional PO Date and Settings days into the selected draft.
Do not rewrite historical POs.

**Empty PO fact — BUILT (CARD 13).** Where a request has no linked PO, print
`No PO yet`, never a blank, a dash, or `Not ordered yet`. Failed/unknown lineage
still uses its own loading/error state and never asserts that no PO exists.
`manualPurchasePoSummary([])` is the one place the word lives.

**PRICE IS NOT A PLACEMENT GATE — owner instruction 2026-09-23, BUILT (CARD 13-B,
migration 0573).** A purchase order may be issued for a line whose Catalog price is NOT
RECORDED. The line goes on the document stating the absence — no cost, no cost source, no
commercial treatment — which is the one state `purchase_order_lines`' own CHECK keeps for
it; `normal` would claim a number nobody recorded and `free_of_charge` a decision nobody
made. Recording the price later is Finance's own act, not a re-issue: the number and the
document do not change.

- What is deliberately UNCHANGED: the MPR's own necessity approval (every request still
  needs it, 0522 + owner selection A), the `free_of_charge` reason rule, the
  commercial-approval path for a price that IS recorded, and every table constraint.
- Half a commercial fact still refuses by name: a cost with no treatment, or a treatment
  with no cost, raises `cost_required` / `commercial_treatment_required` exactly as before.
- **THE SO BATCH LANE CONVERGED — BUILT (CARD 15), 2026-09-24.** That door refused
  `cost_required` for a SKU Catalog had never priced; it now issues the line carrying the
  same absence Manual Purchase sends (no cost, no cost source, no treatment), and 0573's
  `v_price_not_recorded` verdict skips the cost-source gate and the approval engine for
  exactly that line. Ordinary issue also treats non-positive Catalog values as no commercial
  claim under the 2026-10-01 ruling: no invented RM0/free-of-charge decision and no Catalog
  overwrite. Legacy explicit commercial declarations retain their own approval/consistency
  checks; Operation has no cost-entry control in either issue review.


**ONE REVIEW SURFACE FOR BOTH BUYING LANES — owner instruction 2026-09-23, BUILT
(CARD 13-B).** `Review Purchase Orders` is `so-batch/SoBatchIssueWorkspace`, used by SO
Batch Purchase AND Manual Purchase (Law C: a door, never a duplicate). CARD 13's own
`ManualPurchaseIssueWorkspace` is DELETED — it was a second implementation of one surface.

- The lanes do not share an AUTHORITY, and the surface does not pretend they do: it takes
  the lane's own `onIssue`, so Manual Purchase's door keeps the MPR approval, the
  remaining-quantity check and the source validation.
- `manual-purchase-review.ts` turns the selection into that surface's documents through the
  shared five-fact partition. A line's Source column prints its `MPR No`, and the
  requester's `Purchase requirement` shows under the item.
- The draft paper carries the facts the SERVER resolved: the supplier's address, the
  destination's address and the PO Delivery Date the door will stamp (`po_delivery_date` on
  the register's own line read). A preview missing those three is a preview of a different
  document. The browser computes no date and invents no address.
- After issuing, the shared evidence step follows for both lanes: the Manual Purchase door
  now answers with the same `pos` array (number, parties, the supplier's own doors). Issue
  is still not send.

🔴 **A MIXED SELECTION USED TO OVER-ISSUE — FIXED (CARD 13-B).** The wire carried the
chosen lines only when EVERY selected request had been narrowed; otherwise it sent nothing
and the door bought everything still open. One request ticked whole beside another narrowed
to one of its goods therefore BOUGHT the unticked goods, and `Issue {n} PO(s)` counted them.
`manualPurchaseSelectedWalls` resolves the exact lines once, and the sentence, the documents
and the wire are all derived from that one list. The wire now NAMES its demand ids every
time; an explicitly emptied choice is never widened back into "all of them".

**REVIEW PURCHASE ORDERS BEFORE ISSUE — BUILT (CARD 13), owner ruling 2026-09-22.**
`Issue PO` on the Register opens the same 50/50 review surface SO Batch Purchase
has carried since CARD 02; the issue door is called from THERE and never from a
row. The measured defect it closes: one click created numbered purchase orders —
with Unit IDs born under them — and no document was ever shown.

- The review draws ONE draft per ACTUAL purchase order, grouped by the five
  facts the issue door partitions on (`Supplier × Category × Deliver To ×
  Purpose × MPR Delivery Date`) through the shared
  `manualPurchaseIssueDocuments`, which is also what the toolbar's
  `Issue {n} PO(s)` counts — one arithmetic, two readers (Law D).
- The draft uses the PO template and creates no official PO number, revision,
  persisted issue date or Unit IDs. It SHOWS the server-resolved provisional PO
  Date and Settings-derived PO Delivery Date; issuance records and revalidates
  the actual facts. It carries the governed `This is a preview. Issue PO creates
  the number.` See §8.2 for the approved complete review target.
- `Cancel` leaves with nothing created and the selection intact. A refusal is
  printed on the review surface in the server's own two lines, because the door
  is atomic and the operator is standing there.
- Issue is still not send: sending evidence remains the Purchase Order object's.

**THE PO's DELIVERY DATE COMES FROM SETTINGS — BUILT (CARD 13), owner correction
2026-09-22.** The issue door stamps `PO Date + n Settings working days` through
the shared `poDeliveryDateOf`, with NO transit day added and `n` the recorded
Supplier × Category production number. This REPLACES Card 06 §7's "the approved
Manual Delivery Date becomes the official PO delivery date": a request raised for
a showroom two months out used to print that far date on the factory's paper. The
MPR's own `Delivery Date` keeps every other job — `Order By`, the timing rail and
the document partition above. Missing furniture Supplier × Category production settings now
refuse issue by name in both lanes before a PO exists; other categories do not inherit an
unapproved furniture production default.

**BOTH DOORS NOW STAMP THE SAME DATE — BUILT (CARD 13-B), 2026-09-23.** The SO Batch
issue path used to stamp production + transit through `expectedArrivalOf`; it calls
`poDeliveryDateOf` too, so the PO's delivery date is one arithmetic whatever door creates
it (Law D). `expectedArrivalOf` still answers the DIFFERENT question — when the goods reach
the customer — and customer arrival projections and every already-issued PO are untouched.
Falsifier: a stamped `eta_date` that differs from `poDeliveryDateOf` for the same supplier
and category.


**APPROVED / LOCKED — Jess, 2026-09-16. BUILT in Manual Purchase Round 2 (migration 0522).**
Every request requires approval, regardless of purpose or amount; the decision and issue doors
enforce it. Per-purpose approval configuration is retired. The Register, rail, object rounds and
the create-form implementation above describe the built page. Cards 13/13-B
implemented the 2026-09-22 blueprint; §2.1 and the dated evidence above retain
its measured presentation/requester gaps and the authenticated lifecycle still owed.

**Purpose / source:** non-SO internal buys under the approved §5.2 purpose vocabulary:
`Ready Stock` · `Showroom Display` · `Service Case` · `Internal Staff Purchase` ·
`Subsidiary Purchase` · `Other Purchase` (Card 04, 2026-08-29 — only `Other Purchase`
asks `What is this for?`).

**Left rail.** Reuse the shared `FilterRail` and SO Batch responsive shell. Five sections,
in this exact order; fact sections use compact dropdowns:

```text
ORDER TIMING
  Can order early
  Order date reached
  Order date passed
PURPOSE
  All purposes
  Ready Stock · Showroom Display · Service Case · Internal Staff Purchase ·
  Subsidiary Purchase · Other Purchase
PRODUCT
  All products
  Mattress · Bedframe · Sofa
SUPPLIER
  All suppliers
  [actual supplier names, alphabetical]
SETUP TO FIX
  Supplier not set
  Production days not set
```

`SETUP TO FIX` appears only when an affected request exists. It filters affected requests;
Catalog and Purchasing Settings remain the owning repair doors. `WORK TO DO` and
`TO ORDER / All not ordered` are retired from this page. Central Work continues to own
approval, issue and configuration-repair actions; a filter never grants action authority.
Counts are unique requests, cross-computed against the other selected sections. One filter
per section; sections combine with AND; `All …` clears its own section and clicking an active
row again clears it. No rail checkboxes; labels wrap, counts remain visible. Product comes
from Catalog, never SKU text; Supplier is Catalog-derived, never selected by Operation.
The selected supplier remains visible with zero matches.

`ORDER TIMING` counts requests with confirmed remaining procurement quantity and compares
the earliest engine-derived Order By with the server date:
`Can order early`, `Order date reached`, or `Order date passed`. These facts do not prohibit
an otherwise authorised early purchase. Missing settings never invent a date.
Banned rail rows remain `Supplier not selected`, `No supplier`, `Not in catalog`,
`Need price`, `Ordered`, `Part received`, `Received`, `Arrived`, `Cancelled`, `My drafts`,
`Need correction`, `Queues` and safety-days rows. `Supplier not set` is the governed setup
exception, not a substitute supplier option.

The object's Approval section names the resolved Purchasing Approver through `{name} approves`,
or `Nobody holds Purchasing Approver.` when the Duty is unheld.
Purchasing Settings stores the required Duty key; Staff & Duties resolves the person.
Operation prepares and submits without price control; the principal role does not raise a Manual
Purchase. Approved requests continue through normal PO Duty; approval authority does not grant
configuration or issuance authority. **Nobody decides a Manual Purchase they raised** (owner ruling
2026-09-18, `own_request`); the requester withdraws instead.

- **THE PURCHASING APPROVER IS ONE PERSON, RESOLVED — owner rulings (Jess) 2026-09-18, 0533.**
  `purchasing_decide_request` gates on `purchasing_approver_gate`, which admits exactly one
  caller: whoever `workspace_resolve_duty('purchasing_approver')` names as today's actor (the
  holder, or their dated cover), and only while that actor is an active principal **person**.
  There is no principal-role rung (the shared owner login executes no duty), no `ops_manager`
  position rung and no email list. The holder and cover must be active Principal people —
  Operation accounts, Shasha and Yu Jun included, are refused (`invalid_holder` /
  `invalid_cover`). Unheld refuses `no_purchase_approver` → `Nobody holds Purchasing Approver.` ·
  `Set the holder in Settings → Staff & Duties.` The holder away with no eligible cover means
  the approval **waits**; it is never downgraded to Operation. The requester is refused
  (`own_request`). `canApprove` (the Approve/Refuse controls and the approver-only money) asks the
  same resolver and is false on the caller's own request; the approver name is read through
  `actor_display_names`, because `app_users` row security hides Principal rows from Operation
  readers. **Bootstrap:** 0533 assigned Jess once from 2026-09-18 (`assigned_by` NULL, note
  `Bootstrap — owner ruling 2026-09-18 (no second Principal person)`, audit row naming the
  migration), because no door could name the first holder. The deliberate separation from
  `purchasing_settings_gate` stands: approving a purchase grants no Settings numbers.
**Permanent Register.** One request per parent row on the shared DataGrid. The complete
permanent history remains available in one table, with these mutually exclusive groups:

| Group | Membership | Default display |
|---|---|---|
| `Need approval` | Waiting for approval, or sent back for changes | Expanded |
| `Need PO` | Approved with remaining quantity > 0, including `Not planned` | Expanded |
| `No PO needed` | Fully ordered, refused, withdrawn, or confirmed remaining = 0 after the preceding approval checks | Collapsed |

Refused/withdrawn requests are terminal and remain in `No PO needed`. Pending and
sent-back requests remain in `Need approval` even when remainder is unknown. Only an approved
request with unknown/failed remainder stays visibly in `Need PO`, with an explanatory fact and
Issue PO disabled until verified; unknown never means zero or complete.
Pending and sent-back requests remain in `Need approval`; a stock-reference count of zero
needed does not bypass approval. Partial purchasing stays in `Need PO` while approved demand
remains. Search and filters cover all groups and expand a group containing a match. Footer
shows one total, including collapsed rows: `{n} Manual Purchase Requests`,
`1 Manual Purchase Request`, or `{n} of {m} Manual Purchase Requests` after filtering
(screen renamed by the owner 2026-09-23; BUILT in CARD 14). Group counts use the same request population.
Use earliest Order By first for pending/buying work, undated `Not planned` after dated rows,
then newest Proceed Date; the lower history group uses newest Proceed Date. Header sorting
acts within groups. Search, column filters and export retain accurate source values.

**Columns — OWNER RULING (Jess, 2026-09-18) · APPROVED / NOT BUILT, exactly in this order:**

```text
Status · Proceed Date · MPR No · Approval Status · Purpose · Requested By · PO Safety Days ·
Customer Requested Delivery Date · Customer Delivery Location · Customer · Items · Supplier ·
Supplier Deliver To · PO No · PO Delivery Date
```

**Identity — MPR, owner ruling (Jess, 2026-09-18); overwrites the same-day "PO No as identity" and
the 2026-09-04 MPR retirement. BUILT in 0546.** Each Manual Purchase request has its own number
`MPRYYMMDD-NNNN` (§6.1), allocated when the request is created, permanent and never reused.
0546 restores the `allocate_formal_document_code('MPR')` default that 0424 dropped. **Rows raised
between 0424 and 0546 stored NULL and are NOT backfilled** (CLAUDE.md §6): they print the governed
absence `Not recorded`, open from the row and its menu, and no number is invented to fill a column.
A stored `REQ-####` does not print under `MPR No` either — the ruling promises those "stay
searchable", a weaker promise than the one it makes for MPR, and Card 08 retired the series from
every operator-facing surface; the search still finds it. `MPR` = Manual Purchase Request: it is requested and
approved before it becomes one or more POs. `MP` is not used — it is already the Mattress Protector
SKU code. Historical `MPR-…` values stay as they are; historical `REQ-####` values stay searchable.
`MPR No` and `Proceed Date` pin at canvas ≥768px, `MPR No` alone below; `MPR No` opens the request.
`PO No` lists every resulting PO (`No PO yet` before any PO), each opening its own PO; one row remains one
request. Customer and supplier facts use the shared dictionary. Existing groups and sorting stay.

**Customer columns on a Manual Purchase Request — build note.** Manual Purchase Requests serve the governed purposes
(`Ready Stock`, `Showroom Display`, `Service Case`, …); most have no customer. Those rows show the
customer columns blank, never an invented customer; a customer appears only where the purpose's
structured record names one.
`MPR No` is the document identity and opens the object; Items is the product summary. Use the same
responsive search, palette and measured column-width rules as SO Batch Purchase. Content
sets default width; a complete two-line header and its controls set the minimum. Reuse the
shared implementation; do not introduce a separate Manual Purchase palette or guessed widths.

- **`Qty` is off the parent row and does not return.** A request's total ask is not a
  buying decision at row level; the exact quantities live in the goods table at the grain
  they were allocated, and the original ask keeps its authoritative home on the object.
- `Purpose` prints the six governed purposes as an ordinary column. Historical purpose words
  remain truthful. Structured `For` remains on the object and searchable; `MPR No` opens it.
- **`Approval Status` shows the approval FACT ONLY** — `Need approval` · `Approved` ·
  `Refused` · `Withdrawn` · `Sent back for changes`. No stacked approver name, no `Ordered.` second line
  and no Approve/Refuse button on the row: who decides is the object's `Approval` section
  and the Work row. The one other line that may appear is this row's own
  selectability explanation, computed from the same two facts the tick reads.
- **Banned parent columns, never to return:** `Qty` · `For` · `Partial` ·
  `PO Sent` · `PO Created` · `Purchase Purpose` (the heading is `Purpose`) · `Reason` ·
  `Order late` · `Need price` · `Part received` ·
  `Received` · `Arrived` · `Work` · `Next action` · `Remark` · `Price` · a permanent PO
  Duty · row action buttons.

- `Proceed Date` is the Malaysia date of the successful `Send for approval` header transaction,
  projected from the actual `created_at`. It is immutable and never approval date, PO issue date,
  Delivery Date or calculated Order By.
- `Delivery Date` is `purchase_requests.required_by`: when supplier goods must reach `Supplier Deliver To`,
  not a customer promise or physical receipt time. With complete Catalog/Settings, the create form
  defaults it to the latest `expectedArrivalOf(Settings, Proceed Date)` across selected lines.
  Staff may move it; the engine never silently overwrites a chosen value.
- `Order By` is derived for every line by walking Delivery Date backwards through Supplier ×
  Category production days on that supplier's calendar (no transit leg, owner ruling 2026-09-29).
  One request uses the earliest line result. It drives timing/work and the optional quiet
  `Order by {date}` second line but not a parent or goods `Order By` column. It is not a stored date;
  missing setup prints the governed missing-planning fact.
- Manual Purchase does not subtract SO Safety days; Delivery Date is already goods arrival at
  Carres. Missing production Settings produce no default or Order By.
- `Approval Status` shows the approval badge (`Need approval`, `Approved`, `Refused`,
  `Withdrawn`, `Sent back for changes`). The register omits the redundant `{name} approves` and `Ordered.`
  second lines (owner correction, 2026-09-09); approval ownership, selection eligibility and
  object-page approval details remain unchanged. Other disabled-row explanations remain.
- Manual Purchase follows SO Batch's shared search, palette, column-width and responsive
  filter behavior. The toolbar retains Show filters when the rail is hidden. This approval
  does not change the Purchase Orders page's independent layout or business rules.
- MPR No is the permanent request number; UUID remains an internal key, never the displayed identity.
- `PO No` reads ONLY the lines' real lineage (`purchase_order_lines.demand_id`, the
  demand's own `po_id` as pre-0361 fallback) resolved to actual `purchase_orders.po_no`:
  `No PO yet` (a fact, not a button) · the one clickable number · `{n} POs` opening the object's
  exact linked PO list. Never a UUID, never a SKU/supplier/date inference, and never the
  Manual Purchase identity — a purchase may have no PO or several.
- `Items` speaks Catalog human words through the ONE item-label arithmetic
  (`railItemLabel`): one item's name, or `{first item} + {n} more`; the SKU stays
  searchable and shows in the goods table. `Supplier` is Card 03's Catalog-derived
  projection — one actual name or `{n} suppliers`, never `Supplier not selected`.
  `Supplier Deliver To` prints the governed destination, `Multiple` when several. `Requested By`
  is the real staff name — never a shared account, role, email or `(you)`. **D2 (Round 2):** the
  name is ONE server-resolved identity (`identityResolver` over the shared actor door, 0390) that
  the Register, the object, search and export all read; a shared or robot login and an unnamed
  account resolve to `Staff identity not recorded` on every surface.
- **Built widths — evidence for the ONE registry, not a second one (owner instruction 2026-09-18).**
  [UI MASTER §6.8](../ui/MASTER.md) holds the width; these are what this page MEASURED
  (2026-09-17, rendered shell, Inter) and what the registry reads: `Items` 180 (the longest live
  model name is 18 characters; the sticky identity also fits beside the gutters at 390px) ·
  `Order By` 112 · `Purpose` 150 · `Supplier` 140 (longest live supplier 17 characters) ·
  `Approval Status` 188 (`Sent back for changes` pill 134px + requester avatar) · `Requested By`
  124 · dates 112 · `Supplier Deliver To` 132 · `PO No` 144. `Purpose` 150, `Approval Status` 188
  and `Supplier` 140 were the WIDEST measurement of their field and are now the registry's number;
  `Items`, `Supplier Deliver To`, `Requested By`, dates and `PO No` are narrower than the registry
  and the convergence is named there, to be closed in this page's own round. Saved layout key
  `carres.manualPurchase.register.v5`; rail key `carres.manualPurchase.filterRail.v2`.
- **Measured create implementation (D1, Round 2; target superseded by the create blueprint above).** Below a 640px form the item search takes a whole row, `Qty` ·
  `Note` sit under it with their own captions, `Remove` takes its own row, and `Cancel` ·
  `Send for approval` move from the shell header into a bar pinned to the bottom — exactly one pair
  is displayed at any width. The Delivery Date picker's floor is the Purchasing Settings number
  (0422), never a hard-coded 14 days. `Edit and send again` opens the same form on the returned
  request, prefilled once, purpose locked, sending `Send again for approval`.

**Manual Purchase aligned UI — Jess, 2026-09-18.** State, in the three parts §9.3 keeps them in,
because each proves something different and only the last one is production truth:

| | |
|---|---|
| **APPROVED / LOCKED** | The listing, its fifteen columns, its three groups, the goods expansion, the Ready Stock cell and picker, the draft/save/cancel selection flow and the allocation rules below. Owner ruling 2026-09-18. |
| **BUILT 2026-09-18** | All of the above is implemented and covered by tests — including a PGlite suite that runs migrations 0546/0547's committed SQL rather than a mock of it — and measured in Chromium at 1440 and 1024 on the rendered register. |
| **DEPLOYED 2026-09-18 · MIGRATIONS APPLIED 2026-09-20** | Code merged to `main` as **`55ee52e7d07ef57fd4b6d2e5681ec1dffc832ef7`** (#1464), deployed by `deploy-production.yml` run 35359618573 (`ci:smoke`: `Production converged to 55ee52e7…` on all five canonical surfaces — the runner's fetch, which the build session could not repeat because its egress proxy 403s those hosts). **Migrations 0545, 0546 and 0547 were applied to production on 2026-09-20** through the governed `apply_migration` path, in number order, after the owner confirmed 0546's four `drop constraint` / `drop function` statements in conversation (red line 1). **Reconciled, not assumed:** every function body's CR-normalised `md5(prosrc)` equals the committed file's — `so_batch_save_ready_units`, `ops_stock_pool_draw` (now 9-arg), `ops_stock_release`, `purchasing_allocate_ready_units` (0547's body), `purchasing_mpr_line_remaining_requirement`, `purchasing_demand_record_issue`, `purchasing_create_request` — and the binding column, its partial index, both CHECK constraints, the register view's column and `req_no`'s `allocate_formal_document_code('MPR')` default are all present, with three tracker rows written. |
| **PRODUCTION-VERIFIED** | **NOT YET**, and a converged SHA would not be it: that proves the bundle shipped, not what the register draws. **The walk owes, specifically:** the fifteen columns in order against real rows · `Status` standing beside an independent `Approval Status` · a real concrete-need request choosing, changing and releasing real Units, with the counters and the remaining quantity coming back from the server · an additional-replenishment request showing the shelf and taking none of it · the `Issue PO` draft gate · and the widths re-measured signed in, where JetBrains Mono renders document numbers wider than the fixture font. |

The parent has checkbox and a separate goods-disclosure button before Status. Approval Status
and Status are independent. For a known outstanding request, Status is `Need PO` even while
Approval Status is `Need approval`; neither the PO tick nor stock Save is allowed before approval.
`No PO needed` describes no further authorized purchase (fully covered, approved zero, or terminal
refusal/withdrawal); Approval Status retains its actual decision. Unknown coverage is not zero:
show the existing missing-coverage fact, not a guessed Need/No PO answer. Pending/sent-back rows
stay in Need approval regardless of unknown remainder. Empty historical groups are hidden; nonempty
No PO needed remains collapsed and counted. This changes Manual Purchase labels only, not SO Batch
register groups.

**Goods order — BUILT:** `☐ · Status · Category · Qty · Item · Ready Stock · Supplier · Supplier Deliver To · PO No · PO Delivery Date`.
Use the SO Batch shared presentation: 8px horizontal padding, two-line headers, two-line item identity,
blue selection, consistent field widths and the connected stock frame (UI MASTER §6.8–6.9).
No SKU column; SKU remains searchable. Parent tick selects eligible remaining goods, not an
independent duplicate purchase. Child ticks choose individual goods; parent/header show mixed state
for a partial selection. Unapproved, already-covered, unknown or otherwise blocked lines cannot tick.
Each tick submits the authoritative remaining amount for its exact MPR line/allocation. Retain existing
PO lineage and split-destination/date quantities; never repeat the original ask for each linked PO.
Qty and original/approved quantities keep their actual scopes; do not overwrite original requests.
Unit IDs are not invented on unreceived purchase lines. Selection bar and issue review show actual
selected remaining quantities and document partition; keep existing PO grouping and authority gates.

**Ready Stock is retained for every purpose, not assumed to mean additional replenishment.**
For an approved concrete need (e.g. internal use), exact available Units can fulfill that need;
saved allocation reduces the remaining procurement quantity. Additional replenishment means buying
EXTRA stock: existing stock is visible but not automatically deducted or allocatable against that ask.
This distinction follows the recorded request intent; do not guess solely from SKU, stock count or
an ambiguous Other Purchase purpose. If intent is absent, show stock read-only and explain the gap;
no silent netting. This approval does not define a new replenishment forecast or history threshold.

**Diglant Subscription advance-supply boundary — OWNER-APPROVED TARGET / NOT BUILT,
Jess 2026-09-22.** `../rental/MASTER.md` §4/§5.6 owns the new programme's ruling: an approved
advance PO may exist before any customer SO. Later customer demand first checks eligible stock
and evidenced existing PO supply; only verified uncovered demand goes to additional procurement.
Do not purchase the same covered quantity again when the SO arrives. Expected or unverified supply
is not Ready Stock. This approves the business boundary, not automatic purchasing, a new forecast
formula or a second allocation authority. Existing approval/eligibility rules remain; this does
not change the current page, request form, PO template or confirmed-demand report population. The
subsequently approved handling matrix in Rental §5.6 distinguishes eligible stock, completed goods
held at Diglant, production under an existing PO, verified shortage and unknown evidence. Resolve
unknowns before buying; a timing shortfall is not an automatic quantity purchase; evaluate each SO
line separately. The operating target is approved, not built; expected supply remains non-Ready Stock.

Stock picker: `☐ · Goods Received Date · Stock Location · Supplier · PO No / Ref No (Unit ID on line two) · Condition`.
Physical receipt DATE only here; do not discard stored timestamps. Supplier, original PO/reference,
current location, condition and ownership come from actual stock records. Missing facts stay missing.
Count-managed goods remain identifiable as counted and not falsely offered as exact Units.
Show available and this-MPR-line reserved counts on separate lines, with a separate cell disclosure.
Saved choices remain reachable even at zero available. Unknown/error/loading never become zero.
Stock selection is disabled for unapproved and additional-replenishment requests, with a reason.
The cell answers FOUR ways and never merges them: `Loading…` · `Could not be loaded` (the read
failed) · `Not checked` (the read answered for the request and carried no entry for this line) ·
`{n} available`, which is the only place `0` may print.

**Stock selection:** tick/untick edits a draft; `Choose Ready Unit` saves the initial allocation;
`Change selection` reopens it; `Save changes` commits additions/removals, including all removed;
`Cancel` restores saved choices. No per-Unit Undo. Pending edits must be saved/cancelled before Issue PO.
All-stock fulfillment must save without creating a PO. Bind allocation to the exact MPR item line,
NEVER fabricate an SO binding or call an SO-only reservation endpoint with an MPR ID.

**BUILT — migration 0546, the allocation backend the approval called for.**
`ops_stock_items.reserved_purchase_demand_id` names the exact `purchase_demands` line a Unit
answers; it is mutually exclusive with `reserved_order_line_id` by table CHECK, so one Unit can
never answer a customer line and an internal purchase line at once. The ONE writer is still
`ops_stock_pool_draw`, extended with `p_purchase_demand_id` and the Manual Purchase branch (exact
Unit, not counted stock, goods match by `stock_match_key`, available by the one availability
arithmetic, remaining requirement above zero, the request APPROVED, and the request's recorded
intent `concrete_need`); `ops_stock_release` clears the new binding beside the old one.
`purchasing_allocate_ready_units(demand, item_ids, expected_item_ids)` is the one save: it takes
the COMPLETE desired set, releases what left, draws what joined, all or none — an empty set
releases everything — under the request → demand → unit lock order the issue door already uses,
and refuses `stock_selection_changed` when the saved set moved since the browser read it. Every
save appends a `purchase_request_events` row (`stock_allocated`, actor, added/removed/reserved).
`purchasing_mpr_line_remaining_requirement` is the one arithmetic, and
`purchasing_demand_record_issue` now subtracts the saved allocation from its ceiling, so a Unit
taken off the shelf is never bought again. Any invalid Unit refuses the entire save; no partial
releases or reservations. No second stock totals or duplicate writer. Persisted server results
drive counters, Status and buying quantities after refresh (`stock_reserved_qty` on the register
read). Refusal preserves the unsaved choices with the governed explanation.

**⛔ 0547 FIXES 0546's OWN DOOR: an empty set is a save, not a duplicate.** 0546's duplicate-Unit
guard compared `array_length(v_want, 1)` — which is **NULL, not 0, on an empty array** — against a
distinct count of 0, and `NULL is distinct from 0` is TRUE. So `Save changes` with nothing ticked
refused itself as `duplicate_unit_chosen`, which is the one act the ruling names in as many words
("removing every selected Unit") and is not even true of a set with nothing in it. 0547 replaces
the body with the count coalesced to 0; a genuinely repeated Unit is still refused, and nothing
else in the body moves. **A committed migration is never edited (red line 6), so it is a new file.**

**HOW IT WAS FOUND, AND WHY THE SUITE EXISTS.** `apps/api/src/test/manual-purchase-stock-allocation.test.ts`
runs the committed SQL in PGlite — the guards, the CHECK constraints, the lock order and the doors
themselves — instead of mocking the database and asserting that the API passes a code through. The
route tests could not have found this: they answer for the database rather than asking it. Verified
on PostgreSQL 16.13 as well: `select array_length('{}'::uuid[], 1)` is NULL. The suite covers the
exact-line binding, the refusal of a Unit asked to answer both a Sales Order line and an MPR line,
the CHECK underneath that door, approval/refused/withdrawn/sent-back, additional replenishment, an
unrecorded intent, a missing MPR No, a cancelled line, the approved-quantity ceiling, already-issued
quantity, a non-matching SKU, add-and-remove in one save, release-everything, a duplicate, a Unit
taken mid-act (all-or-none, and the refusal names it), the optimistic check in both directions, the
role gate, and the event row.

**THE RECORDED INTENT — `purchase_requests.fulfilment_intent` (0546).**
`concrete_need` = existing Units may answer this request and a saved allocation reduces the
remaining procurement quantity. `additional_stock` = buying EXTRA; existing stock is reference and
is never netted. **NULL = not recorded**, which is its own state: the stock section shows read-only
and says so. It is never inferred from the SKU, the shelf count or the purpose.
**PROPOSAL / NOT LAW — the create form asks the question.** The ruling requires a RECORDED intent
but does not say where it is recorded; `purchasing_create_request` therefore takes an optional
`p_fulfilment_intent`, and every request raised before 0546 keeps NULL and states the gap.
Falsifier: the owner rules that intent is derived from the purpose vocabulary instead — then the
column is dropped and the derivation replaces it.

✅ **CLOSED BY 0549 — APPLIED TO PRODUCTION 2026-09-20 (owner ruling 2026-09-20): the create form asks the question.**
The question (worded `Use stock we already have?` since the owner correction of 2026-09-28) sits
beside `Need for`, two answers, and `Send` refuses an unanswered form with `Send: say whether to use
our stock`. **Owner ruling 2026-09-28:** a `Ready Stock` purpose answers `No, buy new stock` by itself
(buying for the shelf); the requester may change it, and every other purpose still starts empty. The route sends
`p_fulfilment_intent` BY NAME — that is the whole fix, because PostgREST resolves an RPC by the
argument names it carries — and `purchasing_create_request_with_lines` gained the parameter and
names it in turn when it calls the header door. NULL stays legal and stays its own state: a request
raised before the question existed recorded no answer, is never guessed into one, and must answer
before it is sent again. The words are composed under ui MASTER §1.1 and reviewed asynchronously.

**APPLIED AND RECONCILED 2026-09-20**, through the governed `apply_migration` path, on merge `98203b4b` (#1484) after `deploy-production.yml` run 35503591683. The new door's CR-normalised `md5(prosrc)` equals the committed file's, the tracker row is written, and the thing that was actually broken is verified rather than assumed: `to_regprocedure` on the nine argument names the API now sends resolves to the nine-argument door, and that door's body names `p_fulfilment_intent` when it calls the header. The column is present and still nullable. **Numbered 0549, not 0548** — the Purchase Returns lane took 0548 first and is already applied; red line 7 wants the MAX of the tracker tail, the repository tail and every branch, and CI's migration gate caught that this lane had not re-taken it.

🔴 **THE DEFECT IT CLOSED, MEASURED 2026-09-20 MINUTES AFTER 0546 AND 0547 WERE APPLIED — AND THE
LESSON IS BIGGER THAN THE BUG.** `fulfilment_intent` is read in two places and written in none. The route that
actually raises a Manual Purchase is `purchasing_create_request_with_lines` (0410), which 0546 never
touched; the header the API sends it carries seven facts and no intent, and no create form asks the
question. `purchasing_create_request` did gain `p_fulfilment_intent`, but adding a parameter created a
SECOND overload beside 0522's seven-argument one, and PostgREST resolves by the argument names a
request sends — so the seven-name caller still binds to the old door. **Consequence: every request
raised today stores NULL, every line reads `This purchase did not record whether stock can answer it,
so stock cannot be chosen.`, and not one Unit can ever be allocated.** The door, the guards, the
constraint and the arithmetic are all live and correct; the question that feeds them is never asked.

⚠️ **THE LESSON, WRITTEN DOWN BECAUSE IT WILL HAPPEN AGAIN.** Every gate this build has — 12,000
unit tests, a 542-migration replay, a green CI, a SHA-converged deploy, and a 30-case PGlite suite
that runs the committed SQL rather than a mock of it — passed while the feature could not be used
even once. None of them asks *is this reachable from the screen a person actually touches?* The
PGlite suite wrote its own `fulfilment_intent` in a fixture, so it proved the door and never noticed
that nothing in the app turns the handle. **A read with no writer is invisible to every test that
supplies the value itself.** The check that would have caught it is the one the authenticated
production walk still owes: raise a real request, then look at what the row stored.

The formal Issue PO workspace follows §8.2; the HTML quantity dialog is not its replacement.
Replenishment advice based on history is deferred. No new automatic ordering or Finance scope.

**Selection and PO Duty.** Selection replaces the top toolbar in place (UI MASTER §6.7),
with Clear, the resolved PO Duty and Issue PO; no action bar below the table. An issue refusal
uses the warning band between toolbar and table.
Only APPROVED goods with a CONFIRMED live remaining quantity take the tick; an approved request whose remainder could not be read stays in `Need PO`
beside `Remaining quantity not checked` and refuses it (Round 2). A tick dies the moment a refetch
makes its row unbuyable. With no selection there is NO PO Duty block,
initials or reminder anywhere on the page; with a selection, PO Duty appears once beside
the one issue action — `{n} selected · {u} unit(s) · Issue {p} PO(s)`, the resolved
person, `Issue PO` — where the PO count is the same document partition the issue door
groups by (supplier × category × destination × purpose × Manual Delivery Date, merged across
requests only when every fact matches). One PO has one official supplier-facing Delivery Date;
different MPR dates therefore report and create different POs. The PO original date follows
the owner-approved §5.7 Settings calculation, independently of this request grouping date.
The current code that copies the approved MPR date is NOT the approved target. Work ownership and reminders
stay in central `Work`; issuance authority remains the one `purchasing_issue_pos_batch` door.

**Saved object view (not the create/edit workspace above).** Clicking `MPR No` opens the full-width, one-scroll object on the shared
Object Header + Summary + Sections + History template. No tabs, no drawer, no split preview, no PDF and no narrow
720/900px islands. Sections, exactly and in this order:
`Request → Items Requested → What We Already Have → Approval → Purchase Orders → History`.

- **Object Header** — the shared object identity header (the Sales Order / Delivery Order
  implementation, Law C): one back destination `Manual Purchase Request` that restores the complete
  Register state the operator left (the grid stays mounted underneath — rail filters, search,
  column filters, sort, scroll and expansion survive); the business heading
  `{Need for} · {For}` with the quieter `{Proceed Date} · {supplier summary}` context
  (MPR No is visible; no UUID, and a browser title of `Manual Purchase Request — Carres`);
  one derived
  state pill (`manualPurchaseStatusOf`); the filtered Register position `{n} of {m}` with
  keyboard-operable previous/next when the object is in the filtered list. No duplicate Back,
  page title, pseudo-tab, breadcrumb or PDF action; no delete or approval/PO undo door. Withdraw request and returned-request editing live
  only in the governed Approval flow below.
- **Request** — `Proceed Date · Delivery Date · Need for · For · Supplier Deliver To · Requested By`, in
  that reading order. Proceed Date is the actual successful request hand-off; Delivery Date is
  supplier-goods arrival at Deliver To. With a complete plan, a quiet second line reads
  `Order by {date}`; if passed, the fact first states `Order date passed`. `Requested By` is the
  real individual resolved server-side; a
  shared-account record reads `Staff identity not recorded` — a person is never invented. A
  pre-Card-04 stored reason stays visible under the historical `Why`.
- **Items Requested** — read-only `SKU · Item · Supplier · Requested Qty · Supplier Deliver To · Note`;
  Catalog human words beside the explicit SKU; a missing Catalog supplier is a named fact on
  the line (`No supplier yet` + the Catalog act) and may be filtered through `Supplier not set` under `SETUP TO FIX`.
- **What We Already Have** — `SKU · Free Stock · Already On PO · Still Needed` per live SKU,
  and since 2026-09-18 it is explicitly the SKU-wide REFERENCE beside the Register's own per-line
  allocation: this section still writes nothing and still nets nothing,
  through the one shared arithmetic (`stillNeededOf`) and the same stock/open-PO reads the
  create workspace uses. Decision facts, not buttons and not Work rows. **D3 (Round 2):** a
  sentence above the table labels these figures a SKU REFERENCE across Carres, separate from this
  request's own POs (the `Purchase Orders` section), and says reference stock never reduces the
  request — so `Still Needed 0` beside `Not ordered yet` no longer reads as a contradiction.
- **Approval** — always required and always present. `Need approval` + `{name} approves`
  for a viewer without the gate; or, for the actual approver only, one line per live SKU
  (`SKU · Requested Qty · Still Needed · Approved Qty · Transaction Cost · Line Total`) with
  `Approved Qty` prefilled once from Still Needed (whole 0..Requested; a human edit is never
  overwritten by a refetch), `Approve` as the one primary action, `Send back` and `Refuse` neutral behind a
  required `Decision reason`. Cost is read-only approval evidence, never an Operation price
  control. Approval/refusal is atomic; success STAYS on the object, refetches the facts,
  removes the controls and appends History. A decided object shows the fact, the real actor,
  date/time and (approved) the per-line quantity / (refused) the reason.
- **Withdraw request** — the requester may withdraw before an approval/refusal decision.
  Only while waiting for a decision, never after approval or when a PO exists.
  Store the real actor and server time. Show `Withdrawn` in `No purchase needed`; this is
  not an undo of an approval or an issued PO. **Built (0522 `purchasing_withdraw_request`):**
  `created_by` must be the caller (`not_requester`), no decision (`already_decided`,
  `request_withdrawn`), no PO line or issued quantity (`request_ordered`); the object asks once
  more before it acts. **PROPOSAL / NOT LAW — built interpretation, owner may narrow:** a
  sent-back request is still undecided, so its requester may withdraw it too instead of leaving it
  in `Need approval` for ever. Falsifier: the owner rules that a returned request must be edited or
  refused, never withdrawn — then the door adds `sent_back_at is null` to its gate.
- **Send back** — the approver may return a request with a required reason. Show
  `Sent back for changes` in `Need approval`. The requester uses `Edit and send again`
  to edit and resubmit the SAME request for approval. History retains every round, its
  changes, reason, actor and time; prior approval cannot authorise a changed submission.
  All transitions enforce current state and actor on the server, including concurrent actions.
  **Built (0522):** `purchasing_decide_request` accepts `send_back` (reason required, no cuts);
  `purchasing_resubmit_request` edits the SAME request — Deliver To, Delivery Date, the purpose's
  For fact and its lines (kept by id, replaced when the SKU changes, removed lines marked not going
  ahead with their actor) — keeps the purpose, clears approved quantities, increments `round` and
  stamps `submitted_at`; the 0422 earliest-Delivery-Date floor applies again. Every send back,
  resubmission and withdrawal is an append-only `purchase_request_events` row (actor, time,
  reason, changes). Every decision door takes the request row FOR UPDATE and the issue door takes
  it FOR SHARE, so a race has exactly one winner and the loser leaves in its own words
  (`request_withdrawn` · `request_sent_back` · `already_decided` · `not_sent_back`). A refused
  object re-reads itself so the winning fact replaces stale controls. A sent-back Register row
  carries the REAL requester's avatar beside the fact, or `Staff identity not recorded`.
- **Purchase Orders** — read-only exact lineage: `PO No` (a door to the exact PO) ·
  `Ordered Qty` · `Still To Order` · `PO Issued` (D5, Round 2: the CURRENT PO version's
  marked-sent time — the current-version sending evidence retained on Purchase Orders — or `Sending not confirmed`;
  never `placed_at`, which is the creation time) · `PO Delivery Date` (the
  ORIGINAL supplier-facing date — the promise ledger's first held date when the supplier moved
  it, else the issue-stamped date) · `Supplier Confirmed Delivery Date` as `Not confirmed` until supplier
  evidence exists, `Same as PO` when the supplier confirms the PO date, or the supplier's changed
  date. No lineage reads `Not ordered yet`. **The PO number
  IS `purchase_orders.id`** — no `po_no` column exists; Card 05 fixed the latent register read
  that selected one (it would have 400'd the whole Register on first lineage).
- **History** — the final section: `Today · Yesterday · Earlier`, the locked three-rank record
  grammar, stored facts only (`Purchase requested` · `Purchase approved` · `Purchase refused`
  · `Marked not going ahead` · `Purchase order issued` · `Sent back for changes` ·
  `Sent again for approval` (rank 3 `Round {n}` and what changed, e.g. `{sku} · Qty 1 → 4`) ·
  `Withdrawn`). Every withdrawal, send-back and resubmission round is preserved. Line
  `not going ahead` writes store the actor (`purchase_demands.cancelled_by`, 0522; D4); a line
  cancelled before 0522 reads `Staff identity not recorded`. Real individual actor and actual
  server time; an event whose individual was never stored (line cancel, PO issue,
  shared-account creation) reads `Staff identity not recorded`; nothing infers that a supplier
  received a PO or that goods arrived.
- **What the object does NOT hold** — no second `Issue PO`, consolidation prompt (`Issue as
  one PO?` is retired with the old detail), PO Duty block, transaction-cost editor, Receive
  button, receipt quantity or PDF preview. Card 04's selected Register action is the only
  Manual Purchase issuance placement; issued demand belongs to `Purchase Orders` and the one
  shared Receiving engine. There is no Manual Purchase receipt lane.
- **One decision refusal dictionary** (Card 05; shared `purchasingRefusal`): the 0360 door's
  refusals leave as the governed two lines — `not_purchase_approver` (naming the resolved
  approver) · `no_purchase_approver` · `own_request` · `already_decided` · `reason_required` ·
  `invalid_cut_qty` · `decision_not_recorded` — never raw PostgreSQL text, `forbidden`, a
  role or an email.
- **Work Engine boundary — owner-corrected by Card 06, Duty ruling 2026-09-03 and Card 08
  §3.4:** undecided
  approval supplies `Approve purchase` to the resolved `Purchasing Approver`, due no later than Order By and completed only by
  the stored decision. Approved remaining demand supplies `Issue PO` to
  normal PO Duty/cover (Operations Superusers may act), due on Order By and completed only when the
  current PO version has confirmed-sent evidence. The action sentence carries no MPR, no
  person's name and no UUID; the row's context line distinguishes the purchase through its
  business facts — `Manual Purchase Request · {Need for} · {For} · {supplier}` — while the Work
  record stays distinct through its structured request UUID. Both deep-link the exact
  source (`?tab=manual-purchase&mp={uuid}`). Central Work retains these identities;
  the Register groups do not create a second task queue or manual Done action.
- **THE ADVANCE ARRIVAL CHECK IS SHARED WORK (owner ruling 2026-09-10) — BUILT.**
  `purchasing.confirm_tomorrows_delivery` opens ONE office working day before
  `purchase_orders.eta_date`, is owned by the resolved **current PO Duty** through the shared
  resolver, and closes only on a recorded answer ABOUT that exact date — a factory that moves
  the day again makes the old answer an answer about nothing and the obligation reopens. The
  trigger, the due and the reopen rule have exactly one home, `tomorrowDeliveryCallOf`; the
  shared projection (`projectPurchaseOrderArrivalCheckWork`) adds the resolved owner and the
  PO door and restates no arithmetic (Law D). Until this ruling the rule was defined and its
  engine was read only by the Purchase Orders page, so the obligation reached nobody's Work
  list. **It is derived at READ time like every sibling projection — no cron is involved, and
  a missing cron was never what was wrong.** `eta_date` is OUR production-days
  prediction (`expectedArrivalOf`), never a supplier-confirmed date and never a shipping date.

**Journey:** `+ Manual Purchase Request` → choose plain-language purpose → name the purpose's
structured For object → enter goods/quantity/destination → system previews Proceed Date and
defaults Delivery Date from Settings → Send records actual Proceed Date → approval → approved
demand goes to PO Duty by Order By.
**Exceptions:** duplicate stock, missing quantity/date/destination, unapproved price,
missing governed Catalog/supplier relationship, refused/withdrawn request.
**Connections:** Catalog, Stock planning, Display Request, Purchase Demand, PO, Service Case.

### 9.3 Purchase Orders

**STATUS — three different things, never one word (2026-09-18).**

| | What it covers |
|---|---|
| **APPROVED / LOCKED** | The listing, its eleven columns, its four groups, the group-local header, the ordered-goods expansion, the rail and the sending-evidence reading below. Owner rulings 2026-09-17 and 2026-09-18. |
| **BUILT 2026-09-18** | All of the above is implemented and covered by tests, and measured on the rendered register at 1440 / 1180 / 820 / 390. Personal saved layouts (2026-09-17) and the Slice 1 readability pass remain built as recorded. |
| **DEPLOYED 2026-09-18** | Merged to `main` as **`6de125c18c217c33d9bf88464c15620482ecc4b8`** (#1462) and deployed by `deploy-production.yml` run 35348245128. `pnpm ci:smoke` on that run printed `Production converged to 6de125c1…` for all five canonical surfaces: `carres-portal.pages.dev` · `carres-pos.pages.dev` · `erp.carresofficial.com` · `pos.carresofficial.com` · `api.carresofficial.com/health`. That is a SHA convergence proof, and nothing more. |
| **PRODUCTION-VERIFIED** | **NOT YET.** A converged SHA proves the bundle shipped; it proves nothing about what the register draws. No authenticated production walk of this build exists — the 2026-09-17 walk was of the previous nine-column register and does not carry forward. Until that walk is done, no line here may be quoted as production truth. **The walk owes, specifically:** the eleven columns in order against real rows · the group-local header, sticky and stopping at each group boundary · a real multi-receipt PO opening its receipts list · an exact-unit line's real Unit IDs and a counted line's `—` · and the widths re-measured signed in, where JetBrains Mono renders document numbers wider than the fixture font. |

**Owner acceptance — 2026-09-18.** Jess confirmed the reviewed PO Register and goods expansion.
Acceptance covers this listing composition, the full supplier-date facet labels, removal of the
rail Clear filters control, the group-local header and the shared UI MASTER geometry. It does not
approve a new PO detail/issue workflow, and it is not production implementation evidence.

**Personal saved layouts — APPROVED (Jess, 2026-09-17) · BUILT 2026-09-17.** Purchase Orders pilots
them; the shared DataGrid capability is enabled here only. Follow UI MASTER §4.1/§6.7:
owner-private, per-account, up to 10 layouts per listing, saving order/widths/visibility/sort but
not search/filters/group state. Other pages retain current layout persistence until owner
acceptance and rollout approval. Storage: migration `0528`, table `register_personal_layouts` —
RLS SELECT own rows only (`user_id = auth.uid()`), INSERT/UPDATE/DELETE revoked from
`authenticated`, writes only through `register_layout_save` / `register_layout_set_default` acting
on `auth.uid()`; a shape check refuses any key but order/hidden/widths/sort; 10 per person per
listing; one default. Routes `/api/operation/register-layouts` run as the caller. **Owed:** saving
a layout and pressing `PO sent to supplier` on production.

**Purpose / source:** every numbered supplier purchase commitment and version. No blank independent
PO; source is approved demand. The listing answers to whom, what, and when goods should arrive.
Quantity progress belongs to Warehouse Inbound / Receiving and PO detail.

**Columns — APPROVED / LOCKED (Jess, 2026-09-18) · BUILT 2026-09-18, exactly in order:**

```text
PO Date · PO No · SO No / MPR No · Supplier · Items · Supplier Deliver To ·
PO Delivery Date · Supplier Confirmed Delivery Date · Goods Received Date · GRN No · PO Version
```

Pin `PO Date` and `PO No` at canvas ≥768px; below that pin PO No only. The goods expansion arrow
stays the grid's own control in the gutter, separate from the number: **the number opens the actual
PO**, and a decorative arrow concatenated into a document number makes one target out of two acts.

- `PO Date`: authoritative PO document date, never sending confirmation time.
- `SO No / MPR No`: the SO or Manual Purchase request behind the PO, individually reachable. One
  reference is its own door; several print the approved count and open the PO's **Order Route**,
  where each reference is its own row and its own link. The listing never picks one source to stand
  for the rest. No `CO No`: a PO marked consignment does not prove a separate CO created it (owner
  ruling 2026-09-18). The header is fixed as agreed; any later change needs a deliberate Blueprint
  update, never an automatic one. A multi-source PO preserves all line allocations.
  **MPR is the Manual Purchase's visible identity again (owner ruling 2026-09-18, which overwrites
  Card 08 §3.5's 2026-09-04 retirement):** the request's own stored `purchase_requests.req_no`
  (`MPRYYMMDD-NNNN`, §6.1 / migration 0359) is READ and printed. A request with no stored number
  keeps the governed label `Manual Purchase Request` and opens nothing — never a UUID, never a minted
  number. Manual sources still dedupe by request identity, never by label.
- `Items`: one name or `{first item} + {n} more`; expansion shows every item.
- **The three delivery-date columns are three columns, and one is NEVER filled in from another**
  ([shared UI dictionary](../COPY-STANDARD.md#purchasing-ui-dictionary)). `PO Delivery Date`
  is what Carres planned, preserved when the supplier replies and when Settings later change (0428).
  `Supplier Confirmed Delivery Date` is the supplier's evidenced answer for the current version;
  with no answer it reads `Not confirmed`, and a supplier who moved the date carries
  `Supplier changed from {date}` on its second line. The retired combined `Expected Delivery Date`
  printed whichever of the two it had with a sentence underneath saying which — so the two could
  never be compared, sorted or filtered against each other. It does not return.
- `Goods Received Date`: the actual physical arrival (`warehouse_receipts.goods_received_at`, 0314),
  never the day the GRN record was filed. Multiple receipts show `{n} receipt dates`; never pick a
  single date to represent all receipts.
- `GRN No`: one link or `{n} GRNs`, preserving every receipt; blank when none.
  **Both count links open the same list**, because they are two facts about one set of receipts:
  every `Goods Received Date`, `GRN No` and `Received Qty` on its own row, each with the door to the
  actual receipt in Receiving. `Received Qty` is the shared `warehouseReceiptTotals` reader, so the
  count beside a GRN here and the count on the GRN itself cannot drift (Law D); damaged and
  wrong-item units are not received, which is that same arithmetic, not a second one.
- **PO Version display — owner ruling 2026-10-01 / APPROVED TARGET, NOT BUILT:**
  display dated PO numbers as `PO-YYMMDD-RRRR-V{n}`, for example
  `PO-260903-4389-V1` (owner correction: remove the leading `20` from the displayed year).
  Apply the same displayed identity to the register, preview, full detail, revision labels and
  newly rendered document previews. No space or parentheses separates any part.
  Preserve stored base identities and resolve/search both the original and shortened display;
  non-date legacy numbers must not acquire an invented date.
  This replaces the register’s former `{PO No}({n})` / `PO V1` presentation; it does not
  renumber existing POs, change the new-number allocation scheme, or regenerate historical
  issued PDFs. The version comes from the actual document version, never a guessed default.
  Show `PO sent to supplier · {channel} · {date}` separately as supporting text for the current version,
  or `Sending not confirmed` when the CURRENT version's confirmation is missing. Earlier evidence
  stays in Revisions. Missing evidence never proves the PO was never sent.

🔴 **GOODS RECEIVED DATE HAS NO TIME, AND THE SCREEN SAYS SO.** The dictionary asks for the arrival
date AND time; `warehouse_receipts.goods_received_at` is a `date` column (0314) and the database
holds no arrival clock anywhere. Every row therefore prints the date plus the dictionary's own
words for a date-only record, `Time not recorded` — a guess from `submitted_at` would be the time
somebody filed paperwork, not the time a lorry arrived. **Fix, and it is Receiving's:** carry the
arrival time on the receipt (a new column and the Receiving form field that fills it), then this
column prints it with no change here. Until then the gap is stated on screen, not hidden.

**PO date vocabulary convergence — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1587).**
The register/export uses `PO Doc Date`; the object and its reply form use
`Supplier Confirmed Delivery Date`, and the destination fact uses `Supplier Deliver To`.
A confirmed supplier date is printed as the actual date even when it matches the PO date;
`Same as PO` remains only the form's comparison feedback. No supplier answer, date
calculation, evidence or version guard changes through these display corrections.

CI `35983290332` passed. Merge `f3a5b84498065820b102bcf8980f6f5f49665d05`
was deployed by `35984352691`; all five canonical endpoints reported that SHA.
Authenticated production showed `PO Doc Date` on the 63-order register and the corrected
supplier/date labels on PO-20260903-4354's object and reply form. Its old reply without
evidence still read `Not confirmed`; no answer or sending was recorded. A fixture
separately proved that an evidenced date matching the PO prints the actual date.

**Groups — APPROVED / LOCKED, wording correction Jess 2026-09-17:** `Confirm PO sent to supplier`
and `Waiting for goods from supplier` are open headings; `Completed` and `Cancelled` are collapsed
buttons. Classify in priority order Cancelled → Completed → Waiting for goods from supplier
(current version marked as sent with goods pending) → Confirm PO sent to supplier. Each PO occurs
once. A failed/unknown quantity read is never zero or Completed; completed legacy POs without a
mark stay Completed. Search/filters cover all groups and reveal matching collapsed groups.
Default order: unmarked by PO Delivery Date ascending; Waiting for goods from supplier by
confirmed supplier date, falling back to original PO date, ascending; Completed/Cancelled newest
first. Unknown dates remain explicit, not invented.

**Group-local header — owner ruling 2026-09-18, BUILT 2026-09-18.** A collapsed group is its
heading and its count; an open group reads heading → column header → records. There is no header
above all groups. Every group shares one width, visibility, sorting and resizing set, and the
current group's header is sticky inside its own group and stops at its boundary. Pinned date +
number on desktop, number only on narrow screens. **UI MASTER §6.10 owns this**, once, for every
grouped listing page; this section neither restates its mechanics nor varies them.

**Rail — owner-approved 2026-10-01 / APPROVED TARGET, NOT BUILT.** Preserve the
supplier-follow-up purpose and adopt the confirmed shared template. **Owner correction 2026-10-02:**
remove the visible `Filters` heading and follow the annotated deployed Sales Order vertical
navigation with both **`Listing`** and **`Monthly demand`**, including its shared icons,
spacing and selected-tab presentation. Listing retains the approved PO monitor content.
The local Monthly demand preview reuses the existing Sales Order monthly-demand reader and
presentation with explicitly fictional source demand; this is not production integration proof.
Preserve source-owned demand and SO Batch to-buy facts rather than deriving customer demand
from issued PO quantities. Full production adoption and source connections remain unbuilt. The complete monitor rail is:

| Group | Filters |
|---|---|
| Sending | Confirm PO sent to supplier |
| Supplier reply | Confirm tomorrow's supplier delivery; Supplier Confirmed Delivery Date changed; Supplier delivery date passed; Balance delivery date not confirmed |
| Receiving | Partly received |
| Exceptions | Supplier cannot supply; Waiting for supplier to agree; Open supplier claims |

These are factual PO filters, not a second Work queue, assignment engine or manually maintained
status. Each filter opens the matching PO list; the existing object remains the action door.
Use existing source-owned sending, per-batch answer/arrival, receipt, cancellation and Claim
facts. Balance-date follow-up applies to outstanding goods after partial receipt; inability and
pending cancellation follow §§5.8.1–2 and keep coverage until a lawful effective result.
Open claims link to the Claim owner; closing the PO does not close a Claim or extinguish an
unsent current-version obligation. Counts are distinct POs within each predicate, not Units or
claim records; a PO may legitimately appear in several filters. Unknown/failed reads are not zero.
Existing facet counts retain their register-wide scope unless the complete reviewed design
explicitly changes it; final count scope and empty/error behaviour must be visibly explained.
Supplier and Supplier Deliver To remain table-header filters, not duplicate rail groups.
PO Doc Date uses the shared table-header month/date-range filter; it is distinct from arrival
follow-up. Selected conditions and shared Clear all are above the table, not an additional rail
reset control. **Owner placement correction 2026-10-02:** Search, Table/Cards and page tools
stay together above the listing; messages and selected-condition chips appear above this toolbar.
**Owner clarification 2026-10-02:** reserve a fixed message/condition row even when empty, above
the fixed listing-tools row. Adding/clearing conditions must not shift the toolbar or table.
Local preview uses the existing 36px condition-row token with horizontal overflow for multiple
chips. Browser measurement confirmed the Search top remained 114px with no filter and with one
active filter in the inspected 1146px viewport. This is local proof, not shared-kit deployment.
**Owner-approved 2026-10-02:** omit the duplicate toolbar PO count. The footer states filtered
PO count and actual ordered quantity by goods category, or the selected visible PO scope when
rows are selected. Unknown category quantity is named `Not in catalog`.
**FACT — revised local preview, 2026-10-02:** selection scope/Clear now share the Search and
Table/Cards toolbar instead of adding a separate row. The PO info quick panel shows Item with
source/destination context and four quantity columns; complete labels wrap and all quantities
were visibly readable at the inspected 1146px viewport. Exact Unit detail remains on the full PO.
Full PO facts use two columns within the left half beside the rendered PDF. Communication has
one Record supplier answer action; the earlier duplicate was removed. These are local design
adaptations, not admitted shared-kit changes or complete independent-preview clearance. Do not add the earlier proposed generic overview/date/supplier rail alongside this
approved monitor rail. Exact new labels are registered in COPY-STANDARD; template primitives
and numerical values remain shared UI authority.

**Design-to-delivery boundary — owner-confirmed 2026-10-01.** Complete the coherent Purchasing
page design (rail/register/date filters/expansion; PO preview/detail/version/send; supplier
answers and approved exceptions; Receiving/Claim/document/history connections; role, missing-data,
failed-save and completion states) and obtain owner review before commissioning that UI build.
Record approved scope immediately; unresolved composition remains PROPOSAL / NOT LAW. This ruling
does not approve the entire unfinished design, new PO Status/Receiving Status columns, application
changes, Cards or deployment. Reuse the existing Purchasing BUILD lane for a later explicit
takeover and coordinate shared-template work with its existing controller. Independently
commissioned business fixes keep their existing scope; no duplicate implementation chat.

**Amendment discoverability — APPROVED TARGET / NOT BUILT; Jess, 2026-10-02.** Keep one operational Listing
row per PO, displaying its current V-number and current sending evidence. Within Purchase Orders, place Listing, Amendments and Monthly demand in the local navigation.
Amendments is a record view with one change/request per row: its existing identity, parent PO, before/after
version, date, reason, actual actor and applicable approval/result. Search must resolve current
and historical PO version numbers and any existing amendment/source-document numbers, returning
the owning PO and exact revision/change, including rejected requests that produced no new version.
Do not invent an A-number scheme or copy Houzs permissions into Carres. Historical PDFs/send facts
remain immutable; approval alone does not prove the revised PDF was sent. Existing amendment,
cancellation and cross-module guards continue to govern the write. Trade-off: a separate record
view costs a view switch but avoids duplicating commitments as multiple operational PO rows.
Acceptance fails if operators cannot find a supplied historical/change number directly, or the record view
creates a second revision writer or misleading duplicate quantity totals. Evidence: the current
Houzs live revision inbox inspection is recorded in the existing purchasing-houzs research file;
original 2990 PO amendment listing remains unverified.

**Complete-preview review gate — owner ruling 2026-10-02.** Before showing Jess any revised
Purchasing preview as final, the Purchasing design chat checks the complete affected page from
top to bottom against the current accepted Sales Order template: shell/header, rail, register
tools/filters/selection, Table/Cards, expansion, quick view, object card interiors, edit/review,
versions/history/documents and narrow-screen behaviour. The existing Sales Order chat must
independently review the same complete surface; differences are corrected and rechecked until
both reviews agree the scoped preview is complete. A single-card or screenshot clearance is
not whole-page clearance. Record exactly what was inspected and any prototype-only or unverified
behaviour; never present sample integrations as working production capabilities. Do not ask Jess
to catch remaining template errors one at a time or show intermediate partial fixes as final.
This review gate does not authorise application implementation or deployment.

**FACT — local design audit, 2026-10-02; NOT whole-preview approval or production proof.**
The 5438 sample was corrected to the approved four-group, nine-filter monitoring rail and shared width/header,
quick-view and object compositions. Local walks checked exact-Unit destination movement, pending
unknown-fee cancellation, ordinary evidenced no-fee cancellation, chargeable exception retention,
version/send guards and a price answer retaining active inability. UI-controller inspection was
bounded; its earlier rail-summary measurement predates removal of the unapproved overview/date
rail. Sales Order supplied bounded source feedback, not a completed independent whole-page walk.
The final-preview gate therefore remains **OPEN**. Local supplier-reply, selection-toolbar and
owner-export adapters demonstrate a target only; consolidate/admit them through their owning
shared components before a separately authorised BUILD. New shared-kit completeness wording is
still a draft with publication held; it supplies no additional approval and does not block adoption
of the approved deployed Sales Order template. Application code and
production operations were not changed by this design audit.
Additional local browser checks verified the global-navigation dirty guard and Keep editing,
V1 historical PDF rendering after a V2 destination revision, and a second exact-Unit partial move
merging into the existing matching destination line. The merged sample conserved ordered 5,
received 2 and pending 3, retained all five Unit IDs across two lines, and created V3 unsent.
These checks are fictional preview evidence, not production writer or historical-byte proof.


**Expansion — APPROVED / LOCKED, owner confirmation 2026-09-18 · BUILT 2026-09-18; seventh column
owner-approved 2026-09-25 · BUILT 2026-09-26 (`GoodsMiniTable` PO layout, page-drawn cell from the ONE
reader `poLineSupplierAnswersOf`; the parent prints one date or `{n} dates` from `poSupplierAnswerSummaryOf`).** Read-only ordered goods, exactly in order:

```text
Category · Supplier · Supplier Deliver To · PO No / Unit ID · Qty · Items · Supplier Confirmed Delivery Date
```

`Supplier Confirmed Delivery Date` (Jess, 2026-09-25) prints the line's newest supplier answer
(§5.7 per-item answer): one date, or one row per batch as `{n} pcs · {date}` with `· Delayed` on a
later batch; no answer reads `Not confirmed`. Read-only — the only write door is `Record supplier
answer` on the PO. Its width comes from UI MASTER §6.8's registry.

`PO No` is the first line of its cell and the associated Unit IDs sit underneath it in the same
cell; item configuration sits beneath the item name. **The parent remains one row per PO** — a
line's Units never multiply the record they belong to. **It is a truth table: no purchasing
checkbox, no Ready Stock allocation control**, nothing that can commit a unit — buying happens on
SO Batch Purchase and Manual Purchase, which own those acts and their guards. Shared dimensions
are UI MASTER §6.8's; the connected expansion is §6.9's.

**Unit IDs in the expansion are the real ones**, read from the PO's own units — one permanent
`U1-000-001` per ordered piece, bound to the line at official PO issue (§6.2, migrations
0442/0443/0444). Three states, three different sentences, because they are three different facts:

| State | What the cell says |
|---|---|
| Quantity-managed line | `—` — it has none by law |
| Exact-unit line, units read, none found | `Unit IDs missing on this line — do not send this PO` — an integrity failure, never an ordinary empty state, and **never deferred to receipt**: the Units are born at PO issue, not when the goods land |
| The units read has not answered, or failed | `Reading Unit IDs…` / `Unit IDs could not be read` — "we have not looked" is not "they are missing" |

**Never generate presentation-only IDs and never copy a sample ID into production.** A Unit ID is
written on a package in a factory; an invented one sends somebody to look for furniture that does
not exist.

**Footer — owner-approved 2026-10-02:** `{n} purchase orders` / `{n} of {m} purchase orders` /
`1 purchase order`, followed by `Qty:` and actual ordered quantities by goods category. Selection
uses the selected visible PO scope. Unknown goods are named `Not in catalog`; receipt quantities
and money remain separate. No duplicate count or page title appears inside the toolbar.
**Quantity facts elsewhere:** Order Qty, correct/accepted Received Qty and Pending Delivery Qty
retain their canonical engine meanings in PO detail and Receiving. Damaged/wrong/extra never reduce
pending. Removing their listing columns does not remove evidence, validation or workflow guards.

**Sending, all shared surfaces:** `PO sent to supplier` records current version, channel, recipient,
actor and time through the ONE existing shared sending authority — **no second task store and no
second confirmation store is introduced, here or anywhere.** Workspace controls duty routing.
After Open WhatsApp / Open email show `Send the PDF, then press PO sent to supplier.` in the same
communication area. Recipient prefills the supplier's recorded WhatsApp group/email; if absent, the
person supplies it. Never substitute supplier name for a group. Opening a channel or PDF never
automatically marks sending. Never claim supplier receipt, reading or acceptance, and **missing
evidence does not prove the PO was never sent** — a completed legacy document must not become
resend work solely because a send record is absent.

**BUILD 2026-09-06 / DATABASE APPLIED:** migration `0428` preserves an immutable original PO date
and requires an append-only current-version reply with channel/evidence/reporter/recorder/time and
shared duty/cover. Production rollback verification proved atomic supplier setup, role/send/version/
evidence guards, preserved known and unknown original dates, exact persisted source planning without
changing an unrelated order, and a negative control that fails when the send guard is removed. All
six committed function bodies were reconciled before and after apply; tracker version
`20260906073520` stores the exact approved SQL SHA-256
`c4fe5a29f4d4672cf13535577c28f60d8222b37d6399d657245150d385c7cb85`. Earlier records receive no
invented dates or reply evidence.

**API — BUILT 2026-09-18.** `GET /api/operation/pos` carries each PO's numbered GRNs with
`goods_received_at` and the shared `received_qty`, each SO source's `order_id`, and each Manual
Purchase source's stored `req_no`. Drafts are excluded: a receipt with no number is not a GRN.

**Measured on the rendered register, 2026-09-18 (fixture shell, Inter).** Every width comes from
the shared field registry in UI MASTER §6.8, never from a per-page guess — including `PO Date` 120
and `Supplier` 140, which are SO Batch's and Manual Purchase's wider measurements of those same
fields rather than this page's own. This page contributed three corrections back to the registry:
`PO Version` **265** rather than the prototype 238 (the longest evidence line needs 247px of
content), and the measured `SO No / MPR No` 176 · `Supplier Confirmed Delivery Date` 180 ·
`Goods Received Date` 140 for the three columns it introduced. Nothing truncates at 1440: no cell,
no two-line header, no document number. The eleven columns total 1869px (1901 with the goods-disclosure gutter, measured), so the sheet scrolls
sideways under the pinned `PO Date · PO No` (`PO No` alone below 768px) rather than squeezing any
column. **Owed:** the same measurement signed in on production, where JetBrains Mono renders
document numbers wider than the fixture font.

**PO OPENING AND OBJECT COMPOSITION — OWNER RULING 2026-10-02 · APPROVED TARGET / NOT BUILT.**
Jess's annotated deployed Sales Order quick panel is the presentation reference. Clicking a PO
number opens the shared right-side quick panel, retaining the register behind it. Its header
shows `{PO-YYMMDD-RRRR-Vn} · {Supplier}`, the current state, and the shared Print, Open full page
and Close icon controls. The goods expansion remains a separate register control.

The quick panel has two tabs: **`PO info`** and **`Communication`**.

- **PO info:** read-only supplier, Supplier Deliver To, PO Doc Date, original PO Delivery Date,
  current-version sending fact, Items with source/Unit and quantity progress, and connected
  Receiving and Claims/returns doors. Use the deployed SO quick-panel card/fact grammar, with PO
  content and ownership. Missing values remain explicit.
- **Communication:** the current owner/cover and next action, prepared supplier message and
  recorded-channel controls, current-version sending confirmation, and the existing inline
  supplier-answer table with evidence and dated history. Staff can finish the relevant sending
  or reply job here. Dates, split promises, inability and price answers follow §§5.7–5.8; ordinary
  cancellation and commercial exceptions retain §5.8.1 permissions and guards. Opening/copying a
  message is not sending, and recording an answer does not automatically revise the PO.

Purchasing and Workspace use the **same PO-owned communication form, readers and write doors**.
Workspace opens it with the relevant PO/action context; completion updates the same source facts
and the derived Work obligation. It does not create a second message log, supplier-answer form,
status, assignment engine or PO writer. Preserve actor separately from duty holder/cover, exact
line/batch/current-version scope, dirty guards, evidence and failed-save recovery.

**Open full page** leads to the formal **50/50 PO information/edit and document-preview page**:
left is PO information and its authorised editing controls; right is the current PDF, or the
clearly marked proposed PDF while editing. Opening the page does not save a change or mint a
version. Revisions, History and Order Route remain reachable; historical PDFs/send/reply evidence
stay on their original versions. Quantity/Deliver To/cancellation edits use the existing approved
flows and permissions, with explicit review and confirmation. Supplier communication stays in its
communication surface rather than becoming document editing. On narrow screens the same content
stacks, preserving both information and document access and the shared touch/focus rules.

This replaces the former PO-number-to-single-column-full-page journey and its PDF-last viewing
composition. It changes presentation and action access, not PO business ownership, quantities,
versioning, commercial approval or external sending authority. The complete-preview review gate
above still applies; the current local preview has not yet been rebuilt or verified against this
new composition.

**Journey:** Register → PO quick panel → inspect PO info or complete Communication; Open full page
→ check/edit against the PDF → review/confirm a lawful revision → send the current version through
Communication. Workspace enters the same Communication action directly.
**Exceptions:** supplier fabric/model unavailable, delayed/split promise, quantity change,
overdelivery, price change, cancellation and post-send destination change retain their owning law.
**Connections:** demand, supplier, GRN, Stock, claims and Finance retain their existing ownership.


### 9.4 Receiving / GRN — owner instruction 2026-09-04 + owner correction 2026-09-06, PRODUCTION-VERIFIED

**Receiving Session narrow layout, 2026-09-24 — #1574 + #1577 DEPLOYED; controls, actions and header production-verified.**
The existing Receiving Details rows now stack by the form's available width,
including the file inputs; the existing pending quantity and action area wraps.
A browser fixture measured a 246px form canvas with equal client/scroll widths,
all six controls and both actions contained; a 1042px canvas keeps horizontal
fields. Authenticated production on PO-20260903-4354 confirmed the same 246px
form width at a 390px portal viewport, all six controls and both actions within
x=76–322, and horizontal fields at 1074px (930px form). Cancel returned to
Received Qty 0 / Pending Delivery Qty 1 with no receiving activity. The screenshot
exposed supplier-name/PO-number overlap, corrected by #1577 (`55e67a59b`). Its
CI `35966206963` passed 12,600 tests with 100 existing skips; deploy `35967312977`
succeeded and all five canonical SHA endpoints converged. Authenticated production
at 390px now places supplier/destination at y=97–115 and the PO number at y=123–155,
both within x=76–322; at 1074px they remain a row on a 930px form. Cancel preserved
Received Qty 0 / Pending Delivery Qty 1 and no activity. Downloaded #1574 assets
proved the old root disappeared and the form container appeared against #1573’s
own deployment URL; #1577 likewise replaced the old header class against the
preceding `1d452e0c9` deployment. The unchanged prefilled-results sentence was the
control in both comparisons.
The 62 existing Receiving page/save tests pass. No receipt was posted,
no file uploaded, and no accepted/damaged/wrong/extra arithmetic, evidence guard,
Unit result or write authority changed. This does not implement the GRN PDF below.

**GRN detail narrow layout — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1587).**
The continuation walk found that the record and Amend Receiving still cut off item
identity. They now use the existing receiving form container rules; item names wrap,
inputs/files stay within the pane and amendment actions wrap. In the real-component
fixture at a 278px viewport (246px content), all seven amendment controls stayed within
x=16–262 and page/scroll widths both equalled 278px. After Cancel the full item name
remained visible in a 246px row with no row overflow. These changes neither save an
amendment nor alter quantities or permissions.

The same #1587 deployment above was checked at a 390px production viewport on
GRN-20260904-1064. Before: the 148px item name was clipped into 38px. After: its
row/client/scroll width was 246px and the full name remained readable; the page
client/scroll width stayed 390px. This principal account exposed no Amend action,
so the seven-control amendment walk remains fixture evidence, not a production save.
Asset comparison used the own URLs `20cb17a6.carres-portal.pages.dev` (before) and
`282a960f.carres-portal.pages.dev` (after), with `Time not recorded` as an unchanged control.

**Receiving PO loading state, 2026-09-24 — DEPLOYED + AUTHENTICATED READBACK #1578 (`5ce58beeb`).**
The authenticated walk exposed a false `This purchase order could not be opened`
while the initial PO list was still loading. Receiving now uses the same pending
read guard already used by Warehouse Inbound: `Loading…` until the query settles,
then the actual PO or the existing unavailable-object state. Three page tests
separate pending, settled-missing and available data; the pending test failed on
the old implementation, and all 65 Receiving page/save tests pass after the fix.
Full CI `35967863861` passed 12,603 tests with 100 existing skips; deploy
`35968971121` succeeded and all five canonical SHA endpoints converged. A fresh
authenticated load of PO-20260903-4354 visibly showed `Loading…`, then its real
PO facts and Start Receiving, with Received Qty 0 / Pending Delivery Qty 1 and
no activity. Downloaded assets against #1577’s own deployment proved the direct
unavailable branch disappeared, the pending state appeared and the Back control
survived. No receiving result or write path changed and no receipt was posted.

**GRN document composition — owner approved 2026-09-23; PARTIALLY DELIVERED, COMPLETE TARGET NOT VERIFIED.**
Keep the reviewed GRN layout, aligned with the PO document family's company letterhead;
do not redesign the receipt as a PO or use it as Manual Purchase's PO preview. The right
header identifies `GRN No` and `GOODS RECEIVED NOTE`. Preserve the two information blocks:
Supplier and `Supplier DO No`; the linked source PO/version where applicable; instructed
`Supplier Deliver To` and actual `Goods arrived at` as separate facts. `GRN Doc Date`
is creation time; `Goods Received Date` is physical receipt time. Follow the shared date
and time-zone dictionary, not the pasted sample's older labels.

The receiver is the party ruled in `WHO RECEIVED THE GOODS` below, never today's
`GRN Duty` holder substituted into historical paper; missing evidence prints `Not recorded`.

Keep item and its exact Unit IDs together. Separate accepted `Received Qty`,
`Damaged Qty`, `Wrong Item Qty` and `Pending Delivery Qty`. `Physical arrived Qty`
is the physical arrival fact, not another name for accepted quantity. Per-Unit
`Received with issue` remains a subset of physically received Units and is never
added to that physical count a second time. Damaged/wrong/extra do not reduce the
accepted-goods pending requirement or create available stock. Specify whether a
quantity is this receipt or cumulative when previous receipts exist; one session's
accepted count must not be substituted for the PO's cumulative accepted count.

Extra goods appear separately with `Extra Qty`; they do not enlarge `Order Qty`,
accepted PO quantities, or those totals. Use existing `Arrival evidence` and
`Signed DO photo`. This approval does not introduce `Supplier Code`, `Arrival photos`
or `Signed Supplier DO`, waive receiving evidence requirements, or approve the pasted
claim that Carres is more precise than other ERPs. No 10/10 or production claim is made.

**Review fixture only, not business data:** for `PO-2609-0042 V2`, Klang is instructed
4 King Units (001–004), AL 2 (005–006). A Klang sample GRN shows physical arrival 4,
accepted 3, damaged 1, and remaining accepted requirement 1 for Klang (no earlier
Klang receipts in this fixture). AL's 2 are not received by that GRN; if none have
arrived there, the whole PO still has 3 pending. Name which actual Unit is damaged
rather than inventing a replacement ID. Remove the unrelated four-pillow order from
the pasted sample. Any extra-goods demonstration is explicitly extra, not a fabricated
PO line. Actual off-plan arrivals remain recordable at the evidenced actual site;
the sample correction does not forbid a real destination exception.

**Item/Unit document linkage — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1584).**
The detail reader now resolves each recorded stock-item identity through its existing
`ops_stock_items.po_line_id`, matching the register's source relationship. Only a line
actually in this receipt may bind a Unit; matching SKU text never establishes lineage.
Quantity-managed technical identities are suppressed. The shared GRN data builder puts
bound outcomes below their item, once; unresolved historical outcomes remain in the
separate Unit-results section rather than being invented or lost. Failed Unit, source
PO, event or stock-identity reads refuse the document instead of pretending the evidence
is empty. API and builder tests cover failures, unknown lineage and repeated SKUs; an
actual rendered PDF checks item/Unit order and preserves the unmatched result. The PDF
uses `Supplier Deliver To`, `Goods Received Date` and the date-only `Time not recorded`.
The register, filters and exports now name `GRN Doc Date`; the record and amendment
form use the same corrected supplier/date labels. Normal posted GRNs carry no `Valid`
badge, while cancelled records retain their explicit status.

CI `35982087566` passed; merged SHA `acdcde97f0d63124ca9b3f2515486265f7c01e96`
was deployed by `35983102329` and all five canonical surfaces reported that exact SHA.
Authenticated readback of GRN-20260904-1064 showed U1-000-064 below its SMOKE King
Mattress on the rendered official PDF, with the amended marking/history preserved.
The record showed accepted 0, damaged 1 and pending 1; the corrected labels and
`Time not recorded` were visible, with no ordinary Valid badge. No receipt or
amendment was saved. The preceding own deployment was `27b143d5.carres-portal.pages.dev`
(42c8bc9a); the new own deployment was `20cb17a6.carres-portal.pages.dev` (acdcde97).
Their downloaded assets were compared alongside the authenticated rendered readback.

**GRN paper composition — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1588).**
The existing renderer now prints the PO-family logo, legal identity and three address
lines on every page, with the full GRN identity. Two information blocks separate
supplier/source/instruction from document date and actual arrival facts. Unknown
values print `Not recorded`. Order/Received columns always remain; zero-only
Damaged/Wrong/Pending columns become one explicit zero-value line, while mixed
columns retain quiet zeroes. Render tests cover real continuation pages, separate
instruction/arrival positions and zero-only exception columns. Quantity arithmetic,
posting evidence and the outstanding receiver/time/scope gaps are unchanged.

CI `35984035995` and deployment `35985438938` passed; all five canonical surfaces
reported `8d74724dd53dae3abb1509bce8762e8129c15c10`. The own Pages deployment was
`124bde31.carres-portal.pages.dev`, compared with `282a960f.carres-portal.pages.dev`:
GRN logo wiring appeared in the built assets while `Supplier DO No` remained unchanged.
The authenticated `GRN-20260904-1064` preview showed the logo/legal header, separate
Supplier and Receiving Details blocks, and Order 1 / Received 0 / Damaged 1 / Pending 1.
The zero-only Wrong Item column became `Wrong Item Qty 0` beneath the table.
Unit `U1-000-064` remained under SMOKE King Mattress; the AMENDED band and history
remained visible. Local rendered tests cover continuation pages; this one-page live
record does not independently prove pagination. No receipt or amendment was saved.

**GRN table and Unit typography — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1591).**
Item rows now use the Document Kit's boxed hairline grid. Full-height column rules
follow the visible quantity columns, including when zero-only exception columns disappear.
GRN reuses the existing PO `UnitCode` renderer for full identifiers with the final three
digits bold, both under items and for unresolved Unit evidence. Actual PDF text tests
verify the suffix uses the bold font without losing IDs or their outcomes; rendered
mixed-outcome and zero-only examples were visually checked. No quantities or Unit
association rules changed. Consecutive Units reuse the PO range helper only within the
same item and outcome; gaps and different outcomes start separate lines. The remaining
facts below are not claimed complete by this typography change.

CI `35989640338` passed and #1591 merged as `809c3d0d7353ee4254dc7da1c4e22088a083583c`.
Its pending deploy was superseded by descendant `893b7f33d54ecd3c0ab51755d6d98d09f47407d2`;
deployment `35991437389` passed and all five canonical surfaces reported that descendant.
The own Pages deployment `89b4a69b.carres-portal.pages.dev` was compared with
`ccff9ebc.carres-portal.pages.dev`: the new boxed-row rule appeared once versus zero,
while `Supplier DO No` and `Wrong Item Qty` counts stayed unchanged. The authenticated
`GRN-20260904-1064` preview and downloaded PDF showed full-height item rules and
`U1-000-064` beneath SMOKE King Mattress; PDF font inspection confirmed `064` is bold
and `U1-000-` regular. Order 1 / Received 0 / Damaged 1 / Pending 1 and the separate
`Wrong Item Qty 0` line stayed correct. The AMENDED band and saved amendment history
remained. This one-Unit live record does not prove consecutive-range grouping;
that boundary is covered by local actual-PDF mixed-outcome tests. No receipt was changed.

**WHO RECEIVED THE GOODS — owner ruling 2026-09-28 (Jess). MERGED (#1738); migration 0601 APPLIED 2026-09-28
(tracker `20260928131254`).**
The GRN names the party that physically received the goods, not a person's name. At a
partner-run warehouse the receiver is the operating company (NETS today; its PIC changes, so a
name is not recorded and never asked) and the signed Supplier DO photo is the proof. At a
Carres-run site (Office direct receiving, a Carres showroom) the receiver is the Carres staff
member who saved the receipt, shown as a system-filled grey `Fact automatic` box. The paper prints
`Received by {company or staff name}`. Posting evidence (normal holder · dated cover · actual
actor) stays separate and is never relabelled as the receiver.
Built: one SQL rule (`receiving_receiver_of`) reads the Site's `Operated by` party
(`warehouse_site_profiles.operating_party_id`). An outside operator (not the Carres party, not a
showroom) is the receiver; otherwise the saver is, by name only when the account is a person. A
trigger stamps it when any door posts. The form shows it before saving as a grey automatic fact.
Older GRNs print `Received by Not recorded`.

**Remaining document boundary.** Arrival time and category are MERGED (#1738), 0601
APPLIED 2026-09-28. `Goods Received Date` is stored as a time point (`goods_received_time`), captured on
Office receiving and on the Warehouse count (default now in Kuala Lumpur, never in the future), and
printed in KL time on the register, record and GRN. Older records keep their date and `Time not
recorded`. The receipt reader prints the Catalog category (`catalogCategoryWordOf`), or `Not
recorded`; never `Other goods` or a SKU-text guess. Still open: physical/cumulative quantity
presentation and historical source-version evidence.

This is a GRN-specific blueprint approval. Manual Purchase and SO Batch continue to
share the supplier-facing PO template under PO-PDF-STANDARD; their source and approval
rules stay distinct. No application build, deployment, or historical receipt rewrite
is authorised by this documentation approval.


**Listing UI acceptance — Jess, 2026-09-18 · APPROVED · BUILT 2026-09-18, PRODUCTION VERIFICATION
OWED.** The Receiving Register proposal is accepted and implemented in
[PURCHASING — CARD 12](../cards/CARD-2026-09-18-purchasing-12-receiving-register-ui.md).
This approval concerns the Register and its read-only goods expansion, not replacement of the
formal GRN object/receiving engine. Default entry shows all permitted GRNs with server pagination;
date filtering is optional. Date and exception counts count GRNs, not units or unfinished work.
No normal Status column is added; PO Partial/Completed progress is not a GRN document state.
The approved goods expansion is `Category · Supplier · Supplier Deliver To · PO No / Ref No + Unit ID · Items · Received Qty · Damaged Qty · Wrong Item Qty · Extra Qty`.
Use actual line-linked identity with source number above Unit IDs; preserve quantity-managed and
extra-goods distinctions. Receiving remains ungrouped with a sticky header. Use shared heading
icons and dimensions; no permanent bottom-rail Clear filters control. Full date and pagination
behaviour below remains authoritative; abbreviated sample data is not a new rule.

**BUILT 2026-09-18 — what is implemented.** The register draws the approved sixteen-column,
date-first listing with `GRN Date` and `GRN No` pinned at a canvas ≥768px (`leadingColumns`), the
six rail groups, and the read-only goods expansion through the shared `GoodsMiniTable`. The five
retired words measured on this page — `Supplier Delivery Date`, `Goods received on`, `Deliver To`,
`Product` and the `Status` column — are gone, `Supplier DO No` lost its full stop, and the merged
`PO/CO No` column is replaced by the four-way source reference plus `PO No`. Shared widths come
from ONE registry in code (`apps/web/src/components/register/register-field-widths.ts`), which
carries UI MASTER §6.8's parent-scope numbers plus the four Receiving fields it could not answer.

| Status | Evidence |
|---|---|
| **APPROVED** | Jess, 2026-09-18 — the Register composition and its read-only goods expansion. Not a replacement of the formal GRN object or the receiving engine. |
| **BUILT 2026-09-18** | [PURCHASING — CARD 12](../cards/CARD-2026-09-18-purchasing-12-receiving-register-ui.md), merged as [#1467](https://github.com/wenwei4046/Carres-Portal-v2/pull/1467). CI `verify` green on the merged head; the same gate locally on the merged tree — 12,047 tests, typecheck, lint with no new design-standard violations, 541 migration filenames, build. |
| **DEPLOYED 2026-09-19** | Merged to `main` as **`896a7b128b77dbb3dc0074005aaf81f9aa52cf1f`** and deployed by `deploy-production.yml` run 35415796625, which re-ran the whole gate on that exact SHA before shipping it. `pnpm ci:smoke` printed `Production converged to 896a7b12…` for all five canonical surfaces: `carres-portal.pages.dev` · `carres-pos.pages.dev` · `erp.carresofficial.com` · `pos.carresofficial.com` · `api.carresofficial.com/health`. **That is a SHA convergence proof, and nothing more.** No migration was involved; this listing added none. |
| **RENDERED WALK — 2026-09-19, and it FOUND A DEFECT** | The register was driven in real Chromium at 1440 · 1180 · 820 · 767 · 390 and at 200% zoom, inside an emulated copy of `OperationApp`'s own container chain. **It caught a 🔴 that every unit test passed straight through:** `GRN Date` and `GRN No` did not pin at all. Scrolling right drove `GRN Date` to `left: −1022` — clean off the screen — while Purchase Orders held `PO Date` at 280 under the identical harness. The cause was not the engine: the register column beside the rail is a flex child, a flex item defaults to `min-width:auto`, and without `min-w-0` it refused to shrink below the sixteen columns' 2234px, so the grid's own scroller never engaged and sticky offsets were computed against a viewport that never moved. The same miss disabled the ≥768px canvas rule, because the grid measured 2234px even on a 390px phone. Every sibling rail+grid register already carried `min-w-0`; Receiving alone did not. **Fixed and re-measured:** `GRN Date` now holds at 288 under full scroll, and the pair pins on a canvas ≥768px while the number pins alone below it (measured 1176 · 916 → pair; 556 · 503 · 126 → identity). Also confirmed on the render: the sixteen columns in the approved order at their registry widths, no cell clipped, the six rail groups with no permanent `Clear filters`, a week's arrow toggling `aria-expanded` with the row count unchanged at 2, `Cancelled` under its GRN number, the expansion reading `Category · Supplier · Supplier Deliver To · PO No / Ref No · Items · Received Qty · Damaged Qty · Wrong Item Qty · Extra Qty` with the source number above its Unit ID and no checkbox, no `Ready Stock` and no reservation control, and a roving tabindex on the row. |
| **PRODUCTION-VERIFIED** | **NOT YET**, and a converged SHA is not it: that proves the bundle shipped, not what the register draws. **The earlier claim that no walk could be run here was wrong and is withdrawn** — Chromium does start in the build environment (the full binary hangs; `headless_shell` does not), and the rendered walk above is what found the pinning defect. What genuinely cannot be reached from here is PRODUCTION: the network policy refuses `erp.carresofficial.com` and `api.carresofficial.com` at the proxy (403 on CONNECT), so no authenticated session against real data is possible. **What therefore still owes, and only this:** the sixteen columns against REAL GRN rows rather than a fixture · the rail's six counts matching the footer total on a real dataset · a real cancelled GRN · the expansion on a real receipt carrying both an exact-unit line and a counted line, the second reading `Counted stock` · a real receipt with genuine SO and MPR references beside one with none · and the widths re-measured signed in, where JetBrains Mono renders document numbers wider than the fixture font. Layout, pinning, expansion order, rail behaviour and keyboard reach are now MEASURED, not owed. |
**🟡 `CO No` HAS NO DOCUMENT TO NAME TODAY — measured 2026-09-18.** A consignment order is a FLAG
on the purchase order (`purchase_orders.is_consignment`), not a separately numbered document, and
§9.9 Consignment Orders is not built. The source column therefore prints the SO and MPR references
a receipt genuinely carries, an arrival source's own number (`RO-…` for a repair return) where
there is one, and stays blank where a CO number does not exist. **No word and no other document
stands in for it.** When §9.9 mints CO numbers they join the same server-side reference list and
this listing needs no change. **Falsifier:** a consignment receipt in production that already
carries a distinct CO number this reader does not print.

The 2026-08-29 seam record is superseded by the approved Receiving & GRN build
(CARD-2026-09-04-receiving-01, continued by the 2026-09-06 owner production-UI correction).
**State: PRODUCTION-VERIFIED 2026-09-06 — migrations 0425/0426/0427 APPLIED (tracker
20260904125205 / 20260904125800 / 0427_an_amendment_may_correct_the_papers_evidence; 0427 was
functionally proven in a rolled-back production transaction before apply). Correction PR #1106
merged `f755dea8`, deployed, both canonical surfaces reporting that exact SHA; the served bundle
carries every corrected word and zero retired words; committed production smoke on
GRN-20260904-1064 proved the 0427 evidence amend (DO paper replaced with before/after preserved,
evidence appended append-only, idempotent retry `already_saved`, and an out-of-authority caller
refused `no_grn_duty_holder`). GRN Duty is honestly unassigned until the manager records its holder
in the one Staff & Duties surface. The SECOND 2026-09-06 owner correction — one Receiving
destination with the rail month Calendar, governed Supplier-Delivery-Date filtering and
server-side pagination — is PRODUCTION-VERIFIED 2026-09-07: PR #1117 merged `00bf3ced`,
both canonical surfaces on that exact SHA, served bundle carrying every new governed word and
zero retired/view-switch words, and a read-only authenticated walk proving the fixed calendar,
the date-pick filter round-trip, only-present categories, `Showing 1–7 of 7` server paging and
the intact 50/50 GRN object (evidence in CARD-2026-09-04-receiving-01).**
The following operating rule is the 2026-10-04 APPROVED TARGET / NOT BUILT; the earlier
production evidence does not verify Warehouse automatic posting:

```text
Authorised Warehouse confirms physical receipt (or authorised Operation receives directly)
→ Validate source, Site, identities, quantities, condition and required evidence
→ Valid receipt scope posts once; formal GRN is created automatically
→ Accepted Inventory updates at Goods arrived at; issue goods retain hold controls
→ Operation handles differences; missing goods remain outstanding
Invalid scope → preserve report and show blocker; no false GRN or Inventory posting
```

- **RECEIVING PRESENTATION — OWNER-APPROVED TARGET / NOT BUILT, 2026-10-04.**
  One existing Receiving page; its left rail has `GRN Records` (default) and
  `Receiving Differences`. These are views, not new sidebar destinations or top tabs.
  `GRN Records` contains formal GRNs, one row per receipt. `Receiving Differences`
  presents source-linked receipt discrepancies and their existing related handling records;
  it is not another task ledger, supplier ETA chase list or manual Done mechanism.
  Preserve the identity of an unposted report: no GRN number or posted result is invented.
  My Work / Team Work retain assignment, deadlines and completion ownership.
  A Warehouse count becomes a formal GRN only through the governed posting door.
  The separately approved warehouse-confirmed posting rule in §7.3 governs automatic
  GRN creation after valid final Warehouse confirmation. Both the presentation and this
  operating-model change remain APPROVED TARGET / NOT BUILT until separately verified.
- **SHARED LIST AND WORKING PANEL — same approval scope.** Use the accepted shared
  `Search · Table / Cards · Page tools · Columns` grammar, column filters and source-owned
  facts; never copy reference HTML/CSS into this module. Expansion has one read-only job:
  this receipt's goods, Unit identities and quantities. The right Working Panel presents
  `Receipt details · Items & quantities · Evidence · Related records · History`, using
  existing shared components with the PO/GRN identity and permitted owning actions.
  Keep current full-page GRN/PDF composition. Separate this receipt's physical/accepted
  results from cumulative PO fulfilment; a completed receipt does not mean a completed PO.
  Missing shared capability returns to shared UI maintenance; no local substitute component.
- **Document status — APPROVED / NOT BUILT (Jess, 2026-09-17).** A normal GRN shows no status label.
  A cancelled GRN shows `Cancelled` beneath its GRN No — `Valid` and the Status column are retired.
  `Posted`/`Voided` remain internal database statuses and never reach a normal user's screen;
  `Void Receiving` stays the act's name.
- **RECEIVING FILTER PLACEMENT — OWNER-APPROVED TARGET / NOT BUILT, 2026-10-04.**
  The rail contains only the two views above. Supplier, Category, location, date and receipt
  result filtering belong to the shared list controls, not duplicate rail groups. Preserve
  cancelled records and their governed indicator/filter. Counts describe their own record
  unit and the complete authorised filtered result, never just a loaded page or an invented
  overdue bucket. The existing implementation still needs migration and runtime verification.
  Calendar belongs to the existing shared right Quick Rail, not a new Receiving calendar.
  Use UI MASTER's all-module calendar: authorised built dated events, module/location filters,
  and a deep-link to the owning page with explicit date/scope. Supplier arrival is counted
  once under Warehouse from its schedule projection; a GRN is evidence of that arrival,
  not a second arrival event. Expected and actual dates remain distinct.
- **SERVER-SIDE PAGINATION (owner correction 2026-09-06, second ruling).** The Register never
  renders the whole GRN history: the server pages it (default `Showing 1–50 of {total}`,
  Previous/Next), and the footer total plus every rail count speak for the COMPLETE filtered
  result set — computed by the ONE shared arithmetic (`buildGrnRegisterView`, behind
  `GET /api/operation/warehouse-receipts?scope=grn`), never by the loaded page. Search, column
  filters, Columns and Export stay; a changed filter or search term returns to page 1.
- **Register columns — OWNER RULING (Jess, 2026-09-18) · APPROVED / NOT BUILT, exactly in this order:**

  ```text
  GRN Date · GRN No · SO No / MPR No / CO No / RO No · PO No · Supplier ·
  Supplier Deliver To · Goods arrived at · Supplier Confirmed Delivery Date · Goods Received Date ·
  Supplier DO No · Items · Received Qty · Damaged Qty · Wrong Item Qty · Extra Qty
  ```

  Date meanings and location labels follow the [shared UI dictionary](../COPY-STANDARD.md#purchasing-ui-dictionary).
  `GRN Date` is creation; `Goods Received Date` is physical receipt date/time. They are never
  inferred from one another. `Goods arrived at` is the actual site; `Supplier Deliver To` is the
  instructed destination. `Items` keeps the GRN paper's own recorded item words.
  The source column shows the receipt's actual linked document numbers — the SO No, the MPR No, the
  CO No or the RO No — preserve every actual linked reference, blank when none. `PO No` stays its own column (blank for a CO
  or RO receipt with no PO, never invented). Repair returns are in this
  register: they come back through the one Receiving engine with a GRN (§9.5 matrix, §9.7, Stock
  §12.8 `Return from repair`), so `RO No` applies. The header wording is the owner's; the build
  checks it against COPY before it reaches the screen. No word stands in for a missing number. Pin `GRN Date` and `GRN No` at canvas ≥768px, `GRN No` alone
  below 768px; no column hidden by width.
- **The corrected location/date words (owner correction §3):** `Supplier Deliver To` = where the PO
  instructed the supplier to deliver · `Goods arrived at` = where the goods physically arrived ·
  `Goods Received Date` = the physical arrival date and time, stored as a time point with time
  zone and shown in `Asia/Kuala_Lumpur` on screen and PDF (Jess 2026-09-17; MERGED #1738, 0601
  APPLIED: `goods_received_time`, the old date column kept in step). An older record keeps its
  date and shows `Time not recorded`; it is never back-filled to midnight or to the save time. `Actual Site`, `Delivery Location`
  and `Goods Received At` are retired from every Receiving surface, filter, table, export, GRN
  and report; `Delivery Location` stays reserved for the customer's delivery address.
- **The formal GRN document (owner correction §4).** Every GRN renders as a real official A4
  `GOODS RECEIVED NOTE` (SO-PDF-STANDARD chrome, money-free, browser-rendered like the SO/DO/PO)
  with Print and Download PDF: Carres identity, GRN number, linked PO/CO, Supplier, Supplier DO
  No., the three location/date facts, description + SKU + governed Category per line, the five
  quantity words, exact-Unit outcomes, extra goods, evidence references, the duty-evidence trio
  with dated cover and actual actor, and amendment/cancellation marking printed ON the paper. A
  GRN number without this document is not sufficient.
- **The GRN object is 50/50 (owner correction §5)** — the shared Sales Order formal-object
  grammar adapted for GRN facts: left = Receiving Record (facts · Unit results · Receiving
  Summary · Evidence · History · `[Amend Receiving]` `[More ▾]`); right = the OFFICIAL GRN
  PREVIEW through the real renderer, with `[Print]` `[Download PDF]`. One Object Header (GRN
  number · supplier/source · status), no duplicated title. Mobile stacks Record above Preview.
  `Void Receiving` lives in `More ▾` — not a normal primary action.
- **Amend Receiving is 50/50 with a LIVE preview (owner correction §6).** The left half becomes
  the governed correction form (`Original → Corrected` · reason · evidence) while the right half
  previews the proposed document — same GRN number, amendment clearly marked, `UNSAVED`
  watermark as screen chrome only. Amendable, subject to downstream safety checks:
  `Goods Received Date`, `Goods arrived at`, Supplier DO number and evidence (0427: a corrected
  signed DO replaces the paper on record with before/after preserved; arrival evidence is
  APPEND-ONLY), and Unit outcomes/quantities where stock/claim/downstream rules permit. NOT
  amendable: the GRN number, the source PO/CO, the Supplier — wrong identities go through
  `Void Receiving` and a fresh Receiving from the correct source. Every amendment preserves
  original facts, before/after, reason, evidence, the duty trio, time, and the append-only
  history; every amendment prints on the document.
- **One receipt engine; scoped confirmation authority (owner ruling 2026-10-04).**
  Authorised Warehouse final confirmation and authorised Operation direct receiving use the
  same validated receipt authority under §7.3. No routine GRN Duty review stands between valid
  Warehouse confirmation and posting. **Measured implementation, not the approved target:** the
  existing `warehouse_submit_receipt` → `warehouse_receipt_check_in` / `_return` review path and
  `office_receive_post` share `warehouse_receipt_validate_lines` and
  `operation_receive_po_with_do`; migration 0601 (#1738, applied 2026-09-28) admits active
  Operation staff and the Principal. This does not prove scoped Warehouse automatic posting is
  implemented. **Amend Receiving and Void Receiving authority is unchanged:** GRN Duty,
  its dated cover or an Operations Superuser through the existing guarded doors. Warehouse
  confirmation grants no amendment, void, Stock Adjustment or Finance authority. The posting
  stores the duty-evidence trio (normal holder · dated cover ·
  actual actor), never one overwritten name. GRN Duty resolves through the ONE Shared Duty
  Resolver `workspace_resolve_duty()` (Law F.1): an effective-dated `workspace_duty_assignments`
  record, or an honest `not_assigned` answer — **a rota recommendation is never silently turned
  into an assignment (owner correction 2026-09-04)**. While nobody holds the duty, the pages say
  so plainly and the Work card is unassigned; posting is not refused. The manager assigns the
  holder in `Settings → Staff & Duties` only through a governed exception. Owner correction
  2026-09-28 / APPROVED TARGET / NOT BUILT: routine PO/GRN assignments are maintained automatically
  from the governed rotation and eligible active People pool (Workspace §4), not manually entered
  month by month. Automation must establish the authoritative assignment; a page must still never
  display a recommendation as a recorded holder.
- **The GRN number is STORED at posting** — `warehouse_receipts.grn_no`, drawn from the daily
  formal-document pool (0381), stored `GRN-YYYYMMDD-RRRR`; approved display is
  `GRN-YYMMDD-RRRR` under the global 2026-10-04 rule. Sessions posted before 0426 keep their
  derived display through `receivingDisplayNo`. `Jump to…` matches the stored number first.
- **Save Receiving is idempotent** (`save_key`): a retried uncertain response returns the first
  posting — never a second GRN, Unit receipt or stock movement. A retried check-in of a posted
  session returns the first result.
- **Per-Unit outcomes and quantity counts — RECEIVING VERIFIES, NEVER ISSUES (owner ruling
  2026-09-07, 0444).** Every line is answered by its snapshotted stock identity mode. An
  **exact-unit line** records exactly `Received · Received with issue · Not received` for each
  expected Unit (`receiving_unit_results`); posting flips the EXACT named Units (received → free at
  Goods arrived at; with-issue → the claim hold); quantities are DERIVED from the outcomes, and a
  quantity-only submission is refused (`exact_unit_line_needs_units`). A **quantity line** takes
  typed counts, refuses any Unit ID named against it (`quantity_line_takes_no_units`), and posts
  its received pieces as bulk register rows (`identity_scope = quantity`, 0218's model) that carry
  a technical register key and are never shown as Unit IDs. Missing, foreign, duplicated,
  wrong-line (a Unit of another line of the same SKU) and already-received Units refuse by name;
  a Unit is looked up by its line binding, never by `(PO, SKU)`. Receiving never allocates: the
  0426/0427 shortfall mint (`gen_unit_code()` at receipt or amendment) is gone, and the allocators
  are unreachable from every client role. The external Warehouse count uses the same outcomes:
  `warehouse_incoming_pos()` lists each line's mode and the expected Units with their line, the
  count modal records one physical result per Unit, and the submission carries the per-Unit
  outcomes plus arrival photo/video evidence. `expected = cumulatively received + not yet
  received` holds per line in both modes; damaged, wrong and not-received outcomes never change an
  identity.
- **Stock posts by the register only (0366 unit authority).** The receive engine flips the
  named Units of an exact-unit line and posts a quantity line's count as bulk register rows — it
  mints no identity; `stock_balances` is DERIVED by the rollup triggers and is never written
  directly, and the pre-0366 aggregate-reserve write is gone — reservation is the Sales Order's
  exact-Unit binding, owned by the Stock reserve door.
- **CO / consignment receiving runs through the SAME engine.** `purchase_orders.is_consignment`
  marks the source; received Units enter Inventory as `supplier_consignment` with the supplier
  named, and the posting creates no AP consequence — supplier ownership is preserved, never
  silently converted to Carres-owned.
- **`Goods arrived at` never overwrites `Supplier Deliver To`.** Both facts are stored and displayed;
  valid received Units enter Inventory at Goods arrived at. `Arrival evidence` supports photo
  AND video beside the `Signed DO photo`. `Extra Qty` is recorded separately and never enters
  Inventory or the pending arithmetic.
- Quantity words stay `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` ·
  `Pending Delivery Qty`; damaged/wrong/extra never reduce Pending Delivery Qty and never create
  available stock. `Goods Received Date` is the physical arrival date and time (see above).
- **A posted GRN has no ordinary Edit.** `Amend Receiving` (`receiving_amend`) corrects a recording
  mistake only; damage or returns found later go to Supplier Claims / returns, never rewritten as
  "not received". **Jess 2026-09-17 — MERGED (#1738), 0601 APPLIED 2026-09-28:**
  - The person names each exact Unit in both directions (`Received` ↔ `Not received`); the system
    never picks another Unit (today the function picks the newest free or oldest incoming Unit —
    that behaviour is retired). Received Qty is counted from the named Unit outcomes — the `Received` ones only; a `Received with issue` Unit is a physical arrival that counts in `Damaged Qty`, never in `Received Qty` (COPY-STANDARD, correction 2026-09-23). Quantity lines
    keep quantity edits.
  - Checks follow what changes. A change to a Unit outcome or to `Goods arrived at` is refused per
    affected Unit that is reserved, on a DO, delivered or on a Supplier Claim (the Claim check is
    added), naming the reason on that Unit. A Unit bound by `Use this PO` while still incoming is a
    normal arrival, not a lock: marking it Received makes it reserved for its line (0600 trigger). Corrections to Supplier DO No and evidence are not
    blocked by other locked Units, but still pass permission and audit. A changed `Goods arrived
    at` moves this GRN's arrived Units and counted stock to the new Site.
  - Concurrency: the first save wins; a later save based on an older version is refused as a whole
    with `Someone changed this GRN. Check it again.` Nothing is partly saved. Built with
    `warehouse_receipts.revision`; every save states the revision it read.
  - Every amendment keeps reason, before/after, actor and time in the append-only history and prints
    on the GRN.
  `Void Receiving` (`receiving_void`) is only for a GRN that should never have existed: full exact
  reversal when safe, a named blocker otherwise (`claims_block_void` · `threads_block_void` ·
  `units_block_void`), the record and number preserved forever. Every physical arrival creates a
  NEW session and a NEW GRN — a later arrival is never edited into an earlier one.
- **Work:** valid final Warehouse confirmation completes the receipt action through the
  posted session; never create a redundant Operation approval action. Unconfirmed reports or
  validation failures remain visible with their exact blocker and the responsible action owner.
  Source-linked differences route to the existing GRN/PO Duty or Claim action as applicable.
  The existing supplier-date check remains a dated monitoring fact, never evidence of arrival:
  only a current sent PO with goods still owed qualifies; outstanding quantity alone does not
  create an action. `Supplier date passed · nothing received yet` must not become `Goods arrived`.
  Operation owns checking missing arrivals and all supplier follow-up; PO owns supplier promises
  and Claim owns supplier issue handling. Inbound supplies arrival/calendar facts, never an
  assignment for Warehouse to chase the supplier. My Work / Team Work project the Operation-owned
  follow-up and Warehouse-owned physical receipt separately and close from their real outcomes,
  not manual Done or a second receipt.
- **`Settings → Staff & Duties`** is the ONE assignment surface: the resolution today
  (holder / `{cover} covering for {holder}` / `Nobody holds GRN Duty.`), effective-dated
  assignment, dated cover, immutable history; the manager gate mirrors the SQL door and the page
  never offers a control the server would refuse. **`Reports → Receiving & Inbound`** is the
  central report: every non-draft session with its GRN, source, site facts, totals from the
  shared arithmetics, submitter/poster, and the `Still owed by suppliers` pending section.
- **Warehouse and Operation boundary — approved target 2026-10-04 (§7.3).** Warehouse
  scans/checks the actual goods, records quantities, condition, Site and evidence, then confirms
  its authorised physical receipt. Valid confirmation automatically creates the GRN through
  Receiving. Operation reviews differences and follows the owning correction/claim process;
  it does not repeat every normal receipt. Existing Operation-only posting guards are an
  implementation gap against this target, not the target authority. Warehouse cannot directly
  update Inventory or amend/void a GRN. `Supplier Deliver To` is never overwritten by actual
  receipt Site. Any correction preserves the original report, reason, actor and history.

### 9.5 Supplier Claims — approved complete Blueprint

**Build state — slice C1 MERGED (#1789) with migration 0607 APPLIED; slice C2 MERGED
(#1795) with migration 0609 APPLIED 2026-09-29 (tracker `20260929102247`).**
C1 delivers the confirmed 12-column Register (engine `pinnedPrefix`, 51px two-line rows, four
closed rail groups), the full-width record in the approved order, `Record what we asked` · `Record
supplier reply` (answer · Applies to · Supplier's date · Evidence · Note) · `Claim sent to supplier`
(`document_sends` kind `supplier_claim`), and the three Claim Work rules (Workspace §6.1). C2 adds,
on the record's Result section, the ONE supplier-side decision and Authorised Outcome (owner ruling
2026-09-29 below) through the existing `POST /:id/carres-execution`, and the server-confirmed `Plan
Repair` / `Plan Supplier replacement` / `Issue Purchase Return` doors; the missing fact names itself
(`Authorised Outcome` · `Units` · `PO Duty`). **Slice C3 — the per-Unit read-only row expansion —
MERGED (#1802) with migration 0614 APPLIED 2026-09-29 (tracker `20260929151311`)** (see "Row expansion" below for what it does and its one limit).
**Still APPROVED TARGET / NOT BUILT:** Stock-Unit intake, Split/Cancel/Reopen and the claim pack PDF. The two supplier-reply Settings rows are already built through 0606
in the Settings lane (see the current timing ruling below). **0607 snapshots `claim_reply_waiting_days` /
`claim_escalation_extra_days` onto the claim when the ask is recorded** (read by name, 2 and 2 when
the columns are absent); `Reply expected` and escalation read that snapshot, so a later Settings
change never moves an asked claim's dates. An ask recorded before 0607 reads 2 and 2.

**OWNER RULING (Jess, 2026-09-29, "yes") — ONE SUPPLIER-SIDE DECISION, WHICH IS THE AUTHORISED
OUTCOME.** `Record what Carres does next` on the Supplier Claim offers ONLY the three supplier-side
decisions: `Return to supplier` · `Repair` · `Replacement`. The four customer movement choices
(`Collect defective item` · `Replace first` · `Collect first` · `Exchange on collection`) belong to
the related Service Case and are not offered on the claim — the customer-arrangement boundary below
stands. This ONE decision is the claim's Authorised Outcome; there is no second picker and no second
arithmetic. It is stored as the fact each downstream door already reads (0609,
`supplier_claim_decision`): `Return to supplier` → `carres_execution = 'return_to_supplier'`
(Purchase Return door) · `Repair` → `customer_resolution = 'repair'` (Repair Order create door 0602,
repair-return arrival) · `Replacement` → `customer_resolution = 'replace'` (supplier-replacement
arrival source). Only PO Duty, its dated cover or an Operations Superuser records it, resolved through
the ONE Shared Duty Resolver (`workspace_resolve_duty('po_duty')`, the resolver Work owners read;
the ops_po_duty month path is retired for this door). It cannot change once its execution document
exists: a Purchase Return (Return), an active Repair Order (Repair) — and, by the same rule, an
active supplier-replacement arrival source (Replacement; build reading, overturned by one owner
sentence). Existing legacy values (the four customer movements, Accept As-Is, No Replacement
Required) stay readable on the record as `Earlier record · {word}` and are never deleted or
translated; the legacy 0324 customer-resolution door is closed to callers. The record then shows:
`Issue Purchase Return` for Return to supplier; `Plan Repair` (server-confirmed: decision Repair ·
exact Units held on the claim · the actor may act) opening the Repair Order create page prefilled
with the Claim; `Plan Supplier replacement` for Replacement, opening its existing owning door (the
supplier-replacement arrival source). **MERGED (#1795), 0609 APPLIED
2026-09-29.**

**OWNER-APPROVED / LOCKED — 2026-09-06; claim boundary owner-approved 2026-09-14.** This is the
single complete Supplier Claims operating model. Existing built facts and unbuilt target rules are
distinguished below. This PLAN creates no Card or application change.

**PURCHASING OWNS THE STOCK CLAIM — OWNER-APPROVED / LOCKED, 2026-09-14.** Purchasing owns the
stock/product claim against the supplier. Start from the affected Stock Unit, PO line or Goods
Receipt/receiving exception; carry the supplier, item, quantity, source and evidence into the
claim. It does not originate from Service Case and needs no Service Case parent or customer
complaint. A related customer case may be linked for read-only context, but cannot create, approve
or close this claim. No source-free claim form is introduced. Pure SOP, staff and system failures
stay in Issue Tracker, with links when relevant. **APPROVED TARGET / NOT BUILT.**

**Entry and ownership checks — owner boundary confirmed 2026-09-14:**

| Observed situation | Record / next door | Boundary |
|---|---|---|
| Goods damaged, wrong or short at supplier receipt | Record receipt facts and report Supplier Claim from the affected source | No customer Case; preserve accepted/rejected/not-delivered quantities |
| Supplier-goods problem found after acceptance in Stock | Report source-linked Supplier Claim with item/Unit and evidence | Stock keeps condition, location and availability truth |
| Customer reports a complaint/service request | Service Case, including staff recording it on the customer's behalf | Customer remedy is not a Purchasing Claim decision |
| The same goods also have an independent customer complaint | Link the existing related records for context | Neither record is the mandatory parent or closes the other |
| Supplier agrees to repair | Approved repair execution through Repair Order | Reply is not completion; original Unit return and inspection are required |
| Goods returned, required supplier credit evidence outstanding | Return may show Collected; Claim retains recovery responsibility | Finance records financial evidence; no duplicate Purchasing ledger |

The claim records a request for supplier remedy, not an automatic finding of supplier fault.
Receiving rejection is a physical observation; supplier agreement and authorised outcome are
separate decisions. This entry table governs business routing, not application delivery status.

#### Customer arrangement and supplier execution boundary

**APPROVED / NOT BUILT — Blueprint completion requested by Jess, 2026-09-18.**
The four customer movement choices — `Collect Defective Item`, `Replace First`, `Collect First`,
`Exchange on Collection` — belong to the related Service Case, under its existing decision and
entitlement gates. Purchasing must not offer a second customer arrangement picker on the Claim.
`Return to Supplier` remains supplier-side execution. Repair/replacement/return legs on a Claim
name their supplier, exact goods, destination and owning execution document; a supplier replacement
receipt is not a delivery to the customer.

Delivery owns customer collection/replacement DOs, arrangement and actual visit results; Warehouse
owns receipt, inspection, custody and availability. The Claim's `Carres Execution` summary is
read-only supplier-side scope and links to PRTN/CRTN, Repair Order, replacement PO/CO and physical
execution records. Any customer arrangement is read from its Service Case through a related link.
Legacy customer-execution values remain historical evidence, never silently deleted, translated
into supplier movements or copied into newly created Cases. A future change goes through its
owning record and authority; missing related context is stated, not invented.

Customer complaint → Service Case → customer investigation/remedy. If supplier recovery is needed,
Purchasing verifies the affected Stock/PO/receipt source and opens or matches an independent Claim
from that source. Where the current journey requires goods returned to Stock, keep that condition;
a Case complaint alone never creates a Claim. Carry permitted existing evidence by reference and
link the records for context; no forced one-to-one relationship, duplicate photo upload or Case
parent. Customer help need not wait for supplier recovery. Case completion cannot close the Claim,
and Claim completion cannot close the Case.

#### No calendar-created product claims

**Application retirement — DEPLOYED 2026-09-24 (#1588); database closure owed.**
A passed ETA or routine partial delivery alone never opens a product Claim.
The Worker daily schedule no longer calls `runSupplierClaimSweepCron`; the retained
compatibility export performs no database access and returns zero. Contact-by and
follow-up maintenance still run. Source caller inventory found no HTTP caller or
other application scheduler; the dashboard test only checks that reads do not call it.
Deployment `35985438938` verified the Worker at
`8d74724dd53dae3abb1509bce8762e8129c15c10`; the cron compatibility and retained-duty
checks passed locally and in full CI. No live cron was manually executed, so this
proves delivered application removal, not retirement of every database caller.
The committed database definitions remain in 0288, 0291 and 0519, with service-role
execute permission. No production scheduler inventory or SQL change has been performed.

The remaining database closure must inventory live callers/schedules and disable the
obsolete `supplier_claim_sweep_overdue()` safely through a new governed migration.
No controlled database tool is exposed in this session, so neither migration numbering
nor application has been fabricated; applied migration files are unchanged.
Preserve PO balance and date follow-up in
Purchase Orders and shared My Work: `Date passed` uses the governed evidenced supplier date,
never a calculated ETA described as a supplier promise. Missing confirmation remains its own fact.
Historical `Late delivery` claims remain searchable and keep their history; no new selectable
late-only product claim. Do not clear test or production records as part of this change.

**CONFIGURABLE SUPPLIER REPLY TIMING — OWNER-APPROVED / LOCKED, 2026-09-06.** Central
`Settings → Purchasing → Supplier Claims` holds `Reply waiting days` and
`Extra days before escalation`. Both count Office working days. Authorised Purchasing Settings
staff maintain them through the one central Settings door; a claim has no duplicate settings form.
The first interval runs from the recorded supplier request; the second runs from the missed reply
date. Changing settings follows §11's effective-date/history law and never silently rewrites an
existing dated obligation or supplier promise. **Approved starting values: Reply waiting days = 2;
Extra days before escalation = 2.** Chase when the reply date passes. Two further Office working
days without a reply raises Purchasing Approver decision work while PO Duty keeps the supplier
chase. An earlier evidenced claim limit or customer deadline takes precedence. These are internal
follow-through dates, never a claimed supplier promise. **Settings BUILT 2026-09-29** (migration
0606: `purchasing_settings.claim_reply_waiting_days` / `claim_escalation_extra_days`, default 2, 1 to
30, written through `purchasing_set_number`; Settings → Purchasing → `Supplier Claims`). How a claim
reads them and snapshots them stays the Supplier Claims lane's and is **NOT BUILT** until that lane
ships.

#### Evidence boundary and resolution pass

**Decision being studied:** how one product problem reaches a proved supplier outcome without
duplicating a related Case, physical stock, customer promise or money record.

**FACT — research baseline:** fetched `origin/main` on 2026-09-06; checkout and main both were
`5bd44042b1b46a1cfed0f33f688c565870a13cad`. Read the Constitution, ERP Architecture, this MASTER,
the relevant Service, Stock, Orders, Delivery, Payment, Issue Tracker and Workspace authorities,
UI MASTER, Copy Standard, Action Flow, navigation, tokens and page/component rules. No separate
current human ERP Blueprint was found in the scoped non-archive document search. ERP Architecture
is the current blueprint used here. Final authority recheck included `642345ba0f20eecf7db1e672c7ac456d36039959` (main supplier setup/PO reply changes); those changes were integrated before this approval was persisted.

**FACT — production observation:** authenticated read-only visit to
`https://erp.carresofficial.com/operation?tab=claims` on 2026-09-06 showed Open 1 / Closed 1 / All 2.
Open `SC-1019`, source `PO-SMOKE-B`, was one damaged test item. The page had a `Next move` column,
`Carres` identity, `Call Nice Future — agree the fix`, and editing inside row expansion. Customer
Resolution, Carres Execution and Item Outcome were separate controls. Its photo link reported
unavailable. Purchase Returns and Repair Orders were non-clickable `Coming soon` entries.
These are test-data/UI observations, not business-volume or workflow-completion proof. No records
were changed. No SQL fill-rate measurement was obtained; optional column admission and width
validation remain measurement gates, not invented percentages based on two test records.

| Classification | Finding and primary evidence | Consequence |
|---|---|---|
| RESOLVED FROM AUTHORITY | Stock claim starts from its Stock Unit/PO line/receipt source; no Service Case parent; no source-free create. Owner ruling 2026-09-14; ERP Architecture §3.8–3.9 and §6④; Service §1 | One source-linked claim; a related customer Case links read-only |
| RESOLVED FROM AUTHORITY | Purchasing owns supplier ask/answer, the authorised stock-claim outcome and execution documents; Service governs customer remedy. This MASTER §1, §7.4, §9.5–9.7; Service §1 | Separate decision and execution writers |
| RESOLVED FROM AUTHORITY | Four layers stay independent, including apparently inconsistent recorded answers. §9.5, owner ruling 2026-09-01 | Do not restrict what staff may truthfully record to fit a pair of dropdown values |
| RESOLVED FROM AUTHORITY | Repair keeps Unit ID; replacement gets a new one; receipt/handover proves physical change. §6.2; Stock §3, §5 and §12.8 | Claim closure and document issue cannot move goods |
| RESOLVED FROM AUTHORITY | Customer Payment is Money In; exceptional customer refunds require the Case/Management/Finance route. Payment §1, §13 | Supplier credit and supplier cash must never enter customer Payments |
| RESOLVED FROM AUTHORITY | Each action uses the current shared Duty resolver. ERP Architecture Law F.1; Workspace §3–5; this MASTER §10 | Earlier opening-month claim-duty rules are stale; keep historical holder evidence, route current work to current PO Duty/cover |
| RESOLVED FROM AUTHORITY | Register has facts only; no Work column or owner avatar. UI MASTER §5, 2026-09-04 | Remove stale local work presentation; preserve shared actions |
| BUILT / VERIFIED — bounded | Production read above confirms separate layers and legacy register. `packages/shared/src/supplier-claim.ts` defines their vocabulary | Keep useful facts; live layout is evidence only |
| BUILT — source measured, not end-to-end verified | `supabase/migrations/0426_a_posted_receiving_wears_its_grn_number.sql:580,606,1028` creates damage/wrong-item claims and links the receipt; `0299_problem_stock_is_quarantined.sql:121` links controlled Units through the claim | Receiving-to-claim and Unit protection exist; not a new engine invented from nothing |
| BUILT — source measured | `0288_supplier_claims.sql:70` has required PO, nullable PO line, supplier/SKU snapshot, quantity, photo array and open/closed status; `0302_warehouse_files_its_own_receiving.sql:228` adds receipt link | Source integrity and exact affected-Unit scope need convergence |
| BUILT — source measured | `apps/api/src/routes/operation/supplier-claims.ts:133,411,431,451,485,532,576` exposes list/photos, request, response, close, stock outcome, customer resolution and execution | No Stock-Unit intake, split, reopen, formal claim-version/send or Finance completion door was found in this router |
| APPROVED TARGET / NOT BUILT | Claim intake from a Stock Unit found after acceptance; read-only related-Case link. `supplier_claim_close` in `0291_supplier_claim_lifecycle.sql:389` checks ask + answer, not completion of promised goods/money | Add the Stock-source door; strengthen closure to the approved full outcome boundary |
| APPROVED TARGET / NOT BUILT | Source-linked PRTN/RO and shared Claim Work projection: §9.6–9.7 and Workspace §6, §10 | Reuse owning documents and shared Work contract |
| RESOLVED — owner approved 2026-09-06 | The former consequence gap is settled by the scoped outcome contract below | Preserve independent facts; only approved future legs create owning-module work |
| RESOLVED — owner approved 2026-09-06 | Formal Claim requires verified purchase provenance | Keep the problem/evidence and Purchasing source-search work; do not fabricate a PO or formal supplier claim |
| RESOLVED — owner approved 2026-09-06 | Claim commercial remedy and Finance acceptance are separate authorities | Claim owns requested/agreed remedy; Finance owns accepted amounts, credit, cash, application and ledger evidence under the closure contract below |
| RESOLVED — owner approved 2026-09-06 | Dates, no-response decisions, conserved splits, cancellation/reopening and partial settlement are settled below | Approved target, with implementation and evidence checks still required |

**Excluded from this decision:** unrelated Catalog design, supplier AP/GL/tax redesign, external
portal cutover, historical transaction clean-up, unrelated old queues and Card execution. Catalog
and Finance remain dependencies. No accessible 2990 session/URL was found in the enabled browser
or scoped current documentation. This pass did not inspect 2990 live. §3.1's earlier 2990 study is
reported prior evidence only. No unseen screen or code is claimed copied.

#### Reference-to-Carres capability matrix

Primary references checked on 2026-09-06:

- **M1 — [Dynamics purchase return](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/tasks/create-purchase-return-order):** source invoice/line selection, partial quantity, matching original inventory and a separate return shipment event. ADAPT the source and physical proof; REJECT a blank return PO and negative-quantity wording in the operator journey.
- **M2 — [Dynamics sales returns](https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/sales-returns):** separates return permission, inspection, replacement and credit-only handling; replacement can precede physical return. ADAPT the independent tracks, never its customer refund policy.
- **M3 — [Business Central purchase returns](https://learn.microsoft.com/en-us/dynamics365/business-central/purchasing-how-process-purchase-returns-cancellations):** original-cost lineage, partial returns, applied credit and linked replacement purchasing. ADAPT traceability and quantity coverage; Finance alone applies credit. REJECT automatic credit merely because Purchasing issued a return.
- **M4 — [Odoo credit-note documentation, official source](https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/finance/accounting/customer_invoices/credit_notes.rst):** a credit document, physical return and refunded payment are separate events. ADAPT that distinction; do not import Odoo accounting menus, numbering or legal-policy claims.

| Capability / lesson | Current Carres and owner | Disposition and why | Approved journey / placement / connection |
|---|---|---|---|
| Source-based return and original cost (M1/M3) | Claim has PO/line; Receiving has GRN; Finance owns value | KEEP source; IMPROVE exact scope | Open source evidence on Claim; derived PRTN retains Units and Finance source links |
| Source problem with execution documents (M2) | Claim writer starts from PO/receipt; no Stock-Unit door yet | KEEP source; BUILD Stock-Unit door | Report at Stock/PO/receipt → source-linked Claim → execution documents; one evidence set; related customer Case links read-only |
| Partial replacement/return (M1/M3) | Current Claim has one quantity/answer | ADAPT line/Unit allocations | Supplier may agree different results for different Units; details show each remainder |
| Replacement before/after collection (M2) | Four-layer model is built | KEEP independence; IMPROVE executable scope | Stock claim authorises the supplier leg; a related customer Case owns the customer remedy; separate old/new Unit legs in Delivery/Stock |
| Repair and reinspection (M2 + Stock §12.8) | RO target; no live destination | BUILD owning path | Claim → RO → Outbound → same Unit back through Receiving → inspection |
| Credit separate from receipt/cash (M4) | Finance boundary exists; Claim has no money completion | ADAPT without AP clone | Supplier evidence on Claim, Finance match/acceptance linked read-only |
| Document versions and source links (prior 2990 study §3.1; existing PO) | PO has version and sent evidence; Claim request does not | ADAPT existing Carres document contract | Claim pack review/preview; exact version/recipient/channel/time proof |
| Search/filter/export (prior 2990 study; UI §6.7) | Legacy Claim table/row editor exists | KEEP search/filter power; RELOCATE editors | Fact register → read-only inspector → full object; shared toolbar and export |
| Quality/reason facts (M2) | Shared Service issue words; Stock controls suitability | KEEP one dictionary; REJECT second quality module | Reason-specific evidence, inspection at physical location, approved control release |
| External return reference (M2) | Supplier answer note only | ADAPT optional fact | Supplier's claim/return reference on answer and pack; never required before reporting |
| Maintenance and supplier performance (M3; this MASTER §11–12) | Central Settings/Reports already governed | KEEP homes; IMPROVE evidence coverage | Rules/calendars/contacts in central Settings; outcome and age reports with drill-down |

**INFERENCE — capability fit:** existing receipt, Unit, formal-document and Work primitives cover
parts of the need. This is not a finding that the complete Claim journey is ready today. Proven
local primitives can be reused; external patterns require adaptation. No uninspected 2990 code
is labelled COPY REQUIRED. Remaining Stock-source intake and outcome coordination are Carres
integration gaps, not evidence that another generic workflow engine is needed.

#### Purpose, parent and intake

**APPROVED:** Supplier Claims answers: “What must this supplier do about these goods, and what
proves it is finished?” It is Purchasing's register of stock claims. Service Cases keeps customer
complaints, customer evidence and customer remedy. Issue Tracker keeps fault, cost reason and
learning. None owns another module's transaction.

One source problem can have several supplier claims when different suppliers or source lines must
act. One workstream has one supplier, one original PO/CO line and
one SKU identity. Separate source lines get linked workstreams; a shared supplier pack may group
them without merging their quantities, outcomes or money. Case count and Claim count are reported
separately. A supplier being investigated is not automatically a confirmed Fault Owner.

| Origin | System carries forward | Next step |
|---|---|---|
| Damaged/wrong goods accepted during Receiving | PO/CO line, GRN, Supplier DO, exact Unit results, photos, recorder and real arrival | Protect affected Units; open the source-linked Supplier Claim once; no Service Case |
| Rejected at arrival | Actual rejected Units/quantity, reason, photo and hand-back proof | No available stock; claim only if a supplier remedy remains owed |
| Normal partial delivery or supplier date passed | Exact pending line and evidenced date | PO balance/date work; no automatic second product claim merely because time passed |
| Later warehouse/showroom fault | Unit, original source, current Where/Who has it, inspection evidence | Report the source-linked Supplier Claim from the Unit; no Service Case |
| Customer/Delivery fault | Existing Case/SO/DO/Unit and customer evidence | Customer remedy stays in the Service Case; when goods return to Stock and supplier recovery is required, Purchasing opens the claim from the Stock/receipt evidence and links the Case read-only; Logistics fault routes to Delivery |
| Extra/unordered goods | Receiving's separate extra record and actual physical holder | Preserve observation; obtain Purchasing return/acceptance decision; do not invent a matching PO line, credit or available Unit |
| Source or Unit cannot be found | Real item/label facts and evidence | No formal Claim; Purchasing source-search work; no guessed source, supplier or new Unit ID |

Duplicate matching checks source occurrence, Unit and problem, and keeps a later fault distinct
even while an earlier claim on the same Unit remains open. An identical retry opens
the same record. A second reporter appends evidence to that problem. A similar fault on another
Unit is related, not silently merged. Separate later failures have their own occurrence and history.
An authorised correction links the true source without erasing the original wrong reference.
Once issued, a claim's supplier/source identity cannot be repointed; wrong-source cancellation
and linked replacement preserve both histories.

**Source-gap rule:** supplier enquiries may proceed as Purchasing source-search work using real
product/label evidence. The formal Claim waits for verified purchase provenance. Customer help in
a related Case does not wait for that match. A CO line counts as governed purchase provenance for
consignment; its return is CRTN and creates no credit on unsold goods. Without verified provenance, the approved route remains Purchasing source search and enquiry;
no formal Claim or supplier recovery completion is permitted. This is a settled boundary, not a
pending decision for this PLAN.

#### Claim facts and identity

**RESOLVED:** keep permanent internal identity. **Prefix `CLM` (Outright) / `SCLM` (Subscription) — owner
ruling 2026-09-23, prospective only:** existing `SC-…` numbers are permanent and never renumbered
(they are test data; clean start). Format `CLMYYMMDD-NNNN` / `SCLMYYMMDD-NNNN`; non-reuse law in
§6.1 holds. Revisions keep the number; links, not matching digits, show family relationships.

**APPROVED:** intake creates the permanent workstream ID. The formal SC number is allocated when
the first supplier claim instruction is issued; before that the object shows its source/problem
and `Not issued`. An issued claim retains a saved external instruction even when shared as a
message rather than a PDF. A later printable pack uses the same number/version history. Opening
WhatsApp does not issue the claim. If the external attempt fails, preserve the prepared number and
retry the same record; never allocate another claim because a response was lost.

| Authoritative facts | Writer / use |
|---|---|
| Observed problem, discovery time, reporter, source, photos/video | Reporting source (Receiving/Stock) through the Claim intake; one evidence set |
| Claim supplier, original PO/CO line, SKU snapshot, affected scope, request and answer events | Purchasing; permanent source references and historical snapshots |
| Supplier's claim/return reference, contact, stated answer date, reply channel/proof, quantity and promise | Purchasing records what the supplier actually said; no inferred acknowledgement |
| Authorised stock-claim outcome, reason, decision scope/version | Authorised Purchasing decision; owning documents execute |
| Customer remedy of a related customer complaint | Service Case; Claim shows a read-only link |
| Supplier execution scope, exact old/new Units, required legs and prerequisites | Authorised Purchasing decision; owning documents execute; customer arrangement is Service-owned |
| Where, Who has it, condition, inspection and actual Item Outcome | Stock/Receiving/Outbound; read-only on Claim |
| Requested/agreed commercial remedy | Purchasing decision evidence; it does not post money |
| Credit accepted, cash received, invoice application, shortfall, amount waived, currency and references | Finance; Claim reads linked acceptance/results |
| Open actions, normal holder, active cover, actual actor, dates and completion | Source facts plus shared Work/Duty resolver; no second assignment or task list |
| Revision, sent version, recipient, channel, sent time, actor and proof | One document communication authority; append-only |

No editable duplicate customer/contact/SKU/site master. Snapshot external documents; show current
master changes separately. Missing facts say `Not recorded` or the specific missing fact. A report
must distinguish unknown from zero and provisional responsibility from an accepted agreement.

#### Evidence and supplier conversation

**APPROVED:** keep one shared evidence set with per-item/per-event links. Intake asks only evidence
the reporter can produce. Damage needs overall item, fault and product/Unit label views; wrong
item needs ordered specification and actual label/item comparison; missing parts needs the part
list and present parts. Existing category/policy checklists govern specialised proof, including
measurement video where needed. Missing goods/parts need the source, count and promise, not a
photo of absent goods. Routine pending delivery stays on the PO; an old late-only Claim retains
its recorded evidence without permitting a new calendar-created Claim. Warehouse is never asked for a customer WhatsApp screenshot.

Use video when movement, sound, intermittent failure or a governed measurement cannot be proved
well in a photo. Do not require video for every claim. Each file retains uploader, observed/captured
time where known, upload time, source and permitted audience. An unavailable file is missing
evidence, not proof. Keep original files; annotations are linked copies. Wrong evidence is marked
superseded with reason; it is not silently replaced across historical documents.

Purchasing opens the claim, sees the product facts and a prepared plain-English supplier message,
then records the actual request. Supplier answers remain the existing governed goods vocabulary:
Replacement, Deliver remaining, Repair, Return & replace, Reject, Other agreement. An unsolicited
answer is recorded as received evidence even before a request; the system must not force a false
earlier call. Rejection needs its reason; Other agreement needs exact terms. Money offers have a
separate Finance-linked commercial record, not a new ambiguous customer `Refund` option.

Each request/reply names its exact affected Units/quantity and claim/instruction version. “Supplier
did not answer” is a contact result, never an accepted remedy. Contact history records channel,
recipient, actual attempt, time, evidence and actor. Attempts do not complete “obtain supplier
answer”; the next dated attempt remains visible. A new answer appends and supersedes the old
promise. A phone answer records who spoke, what was said and when; a commercial concession needs
the required written supplier evidence before Finance accepts it.

Supplier site inspection, if needed, is carried out by the supplier and coordinated by Purchasing.
Carres never gains a customer-site inspection stage. Logistics installation faults remain with
Delivery. Customer communication and policy promises stay with the Case owner/action authority.

#### Decisions and the consequence contract

**RESOLVED:** preserve Stock / Receiving Problem → Supplier Response → Authorised Stock-Claim
Decision → Execution as separate facts. Customer remedy (Replace / Repair / Accept As-Is /
No Replacement Required) belongs to a related Service Case and is not a Claim picker.
Customer collection/replacement order is decided in Service Case; supplier return/repair/replacement
execution follows the boundary above. A supplier offer never
approves the customer remedy, and an item outcome never cancels a customer commitment.

**APPROVED:** recording those facts remains flexible. Issuing a new instruction requires a
separate approved scope: exact Units/quantity, related customer result if applicable, goods result,
supplier agreement or authorised Carres-funded exception, movement order, party, destination,
required dates, cost authority and completion evidence. Incomplete or conflicting facts create
a named decision action. They never silently create Stock, Finance or demand writes.

Customer and supplier decisions remain independent in their owning records. No matched-pair
guard is reintroduced. The system instead checks each proposed future leg against its own approval
and actual facts. A collection already performed must always be recordable, including an
unauthorised one with an Issue. Recording it grants no permission for a future replacement.
An obsolete instruction is explicitly cancelled/replaced with its consequence reviewed.

| Approved result | Approved Carres flow and evidence | Owning door / cross-module consequence |
|---|---|---|
| Missing goods / parts or correct item | Keep the original unfulfilled supplier quantity covered once; record exact new promise; receive actual goods/parts and inspect completeness | PO/Claim instruction → Receiving → Stock. Parts attach to the original Unit unless independently identified under Catalog; no second full-item buy |
| Supplier replaces goods rejected at receipt | New physical Unit ID; linked replacement instruction fulfils the existing original pending quantity once | Purchasing owns coverage; Receiving posts a new GRN. Original damaged Unit stays controlled until its own outcome |
| Supplier replaces goods accepted earlier | Preserve original GRN/PO receipt; the authorised stock-claim outcome creates a distinct linked replacement need/instruction with new Unit ID | Existing stock coverage or authorised supplier replacement covers need once; a new paid buy uses Manual Purchase under its governed purpose and normal PO authority |
| Supplier repairs the same item | RO identifies the same Unit, fault, repairer, cost agreement, out/back dates; actual handover → return receipt → inspection | Purchasing RO; Warehouse Outbound/Inbound; Receiving; failed repair reopens supplier work, never becomes Available by default |
| Supplier inspects before answering | Approved inspection scope with exact Unit and expected return date; outcome remains undecided | RO/inspection instruction as applicable; continuous holder history; no “Returned to supplier” final outcome merely for temporary inspection |
| Carres replaces first | Authorised new Unit delivery may complete while old-item collection remains open | Customer remedy of a related Service Case. Delivery records new acceptance and old collection independently; the Case stays open for required collection; no double sale or hidden old Unit |
| Carres collects first | Collect old Unit with required condition gate; accepted return fact unlocks the approved next dispatch | Customer remedy of a related Service Case: Case decision → Delivery collection → Receiving/Stock → Delivery replacement; no fake receipt to unlock dispatch |
| Exchange on collection | One arranged visit carries separate incoming/outgoing Units and separate results | Delivery may report a partial result; failed old-item collection cannot be concealed by successful replacement |
| Accept As-Is | Customer acceptance in a related Service Case, plus authorised conditions; Stock separately confirms suitability for any retained stock | Case records customer result; Finance records any agreed allowance. No stock release from a Claim picker |
| No Replacement Required | Preserve explicit customer decision; review any outstanding goods or money commitment through its owner | Sales/Case may cancel the remaining obligation through its governed path; never delete PO demand, refund or loan debt by selecting this value |
| Return purchased goods | Approved PRTN → actual collector/date/Unit handover → supplier-return result | Purchasing document, Warehouse physical proof, Finance credit/cash evidence separate |
| Return unsold consignment | CRTN, or combined CO swap with linked outgoing return | Supplier ownership preserved; no purchase refund/credit/payable is created |
| Put back in stock / refurbish | Goods are present, repaired/checked, complete and eligible; reservation and ownership checked | Stock inspection/eligibility authority; refurbish retains Unit identity and repair history, never a new “good” Unit to erase the fault |
| Write-off / disposal | Stock Adjustment Approver decision and Finance value consequence; separate disposal authorisation/proof | Stock owns outcome; disposal remains open if required. Claim cannot erase the item or write off value |
| Supplier credit / allowance | Record exact offer and original invoice/claim scope; Finance verifies external note, direction, currency, value and application | Claim records remedy; Finance alone accepts/posts/applies. Credit is not customer money or proof of cash received |
| Supplier cash refund | Approved supplier money remedy; Finance records actual incoming transfer and matches scope | No customer Payment entry. Partial cash leaves the supplier balance open; no routine customer refund permission follows |
| Supplier refuses / never answers | Keep evidence; request authorised alternative remedy or recovery decision | Customer help can proceed under approved Carres cost authority. Stopping supplier recovery needs explicit approval and a recorded loss, never a fabricated reply |

**Quantity conservation:** for each approved remedy scope, required quantity equals completed
quantity plus still required quantity plus explicitly cancelled quantity. Each Unit appears once
within that scope. Physical-return, replacement and credit tracks are not added together as if they
were distinct damaged Units. A Unit may need all three. The original PO pending quantity is read
from its owner, never recalculated by Claim. A rejected receipt's replacement must not create both
an open original demand and another unallocated buy for the same need.

**Partial outcomes / splits:** allow 2 Units repaired and 1 replaced under separate scoped results.
Partial receipt, collection or credit completes only that scope. Split a claim only when
different supplier discussions/outcomes cannot be managed clearly together. Child claims
retain source, split history and any related Case links; allocate disjoint Units/quantity and remaining money.
Parent is a read-only grouping, not another open debt. Existing sent documents remain attached to
their original scope. Changing supplier requires a new linked claim/commitment, never editing the
old supplier identity. Count reports exclude grouping parents and never double-count the split.

**Replacement receipt:** the authorised replacement instruction supplies a governed source to the
one Receiving engine, not a second receipt form. It lists original SC/PO/GRN, new Unit IDs, SKU,
quantity, supplier, Deliver To, promise and commercial basis. New arrival → new GRN, Supplier DO,
Goods Received Date, Goods arrived at, exact outcomes and inspection. A different model needs authorised
stock-claim/Catalog/commercial approval. A different Unit returning from repair is a replacement exception,
not the old Unit relabelled. External-site arrival does not invent Carres warehouse stock.

#### Money and closure

**APPROVED:** the Claim shows supplier requested remedy, supplier agreed remedy, and Finance's
accepted result separately. Supplier credit, cash and invoice offset are named separately. A
debit-note number alone does not prove that the supplier owes Carres: Finance checks who issued
it, debit/credit direction, what it settles and the agreed amount. Finance controls valuation,
tax, invoice matching and ledger entries; this Blueprint does not design AP.

One Finance recovery reference may allocate across claims, but each allocation is counted once
and their total cannot exceed the accepted document/payment. Incurred cost, recoverable amount
and recovered amount stay separate in Issue Tracker and use Finance facts. A supplier's RM80
payment does not remove Carres' separate RM80 cost to Logistics. Unknown supplier value is not RM0.
Carres-funded early replacement is a separate approved cost, not assumed supplier liability.

| Claim outcome | Evidence required for this claim to finish |
|---|---|
| Goods remedy | All scoped supplier goods/repair/return obligations complete, accepted source events linked, and required failed/remaining quantities dealt with |
| Credit accepted as final settlement | Finance accepts the exact external note and its full agreed value for this scope; Claim can finish while later use of that credit remains explicit Finance work |
| Cash refund agreed | Finance confirms actual matched cash received in full; a credit note alone cannot finish a cash promise |
| Partial/changed money offer | Agreed remainder stays open until received or an authorised revised settlement/non-pursuit explicitly accounts for it |
| Supplier recovery stopped | Required approval, reason, contact/refusal evidence and Finance-recognised unrecovered amount; required physical/customer actions still have owners |
| No supplier responsibility | Authorised finding closes that supplier scope; any related Case/Issue continues with its own owner; no false supplier reply or “recovered” amount |

The approved lifecycle has three states, stored as `open · closed · cancelled` and DISPLAYED as
**`In progress` · `Closed` · `Cancelled`** (owner ruling 2026-09-18 — a display-label change only;
`In progress` means not yet closed and never that the supplier has started). Missing reply, late collection,
repair not returned and credit evidence missing are derived facts, not new editable statuses.
Closed requires source/scope, request/contact evidence, actual reply or approved no-response
decision, required outcome evidence and no unresolved supplier obligation. No generic Done or
status dropdown closes work. The close control, if retained, confirms the computed evidence
summary and creates a sealed closing event; it cannot override a missing fact.

A related customer Case may be complete while the Supplier Claim remains open, and the Case may
read claim progress. Supplier Claim, Case, Issue and Finance close independently; closing one never
closes another. A stock claim needs no customer confirmation, and none is fabricated.

**Cancel:** wrong source, duplicate or claim raised in error; retain reason, actor, counterpart
notice if already issued, surviving claim link and review of all outstanding commitments. A
supplier rejection is not cancellation. No cancellation can reverse a performed movement, erase
cost or stop an approved customer remedy silently. A dropped commercial recovery uses the
approved non-pursuit outcome, not Cancel.

**Reopen:** new evidence, failed agreed repair/replacement or missed supplier consequence; preserve
closing evidence, actor, reason and new occurrence dates. Keep the original claim number and
original age; do not reset supplier-performance history. An unrelated later fault is a new linked
incident. An unfulfilled old commitment stays late until a properly authorised new commitment
replaces it. No silent edit of a closed record.

#### Staff journey, Work, dates and escalation

**APPROVED:** the first-day staff member opens My Work, follows the exact object link, reads the
problem, sees the required evidence/message and records the actual result. The page derives the
next step. At day end Team Work shows unanswered supplier requests, late promises, incomplete
handovers, missing money evidence and unassigned duties. Nobody keeps a separate reminder list.

The action contract is stable source + rule + occurrence, trigger, owner duty, current cover,
required result/recipient, exact weekday/date/calendar, completion evidence and owning deep link.
PO Duty owns supplier conversation; authorised Purchasing approval owns the stock-claim outcome
and governed supplier commercial exceptions; Service Case Approver owns customer remedy on a
related Case; GRN Duty owns formal receipt;
Warehouse/Delivery/Finance own their acts. Capability to act never makes an actor the owner.
An unassigned duty remains visible with the Staff & Duties correction door.

**APPROVED — intake timing:** first source/evidence check and initial supplier request by the next
Office working day after intake/evidence readiness; request missing evidence by the next Office
working day rather than leaving intake stalled.

**RESOLVED — supplier reply timing:** use §9.5's approved configurable 2 + 2 Office-working-day
rule. Repeat contact uses a new dated attempt under the same open answer obligation; it does not
create daily duplicate claims. The two approved starting values are settings, never code constants.

Supplier-agreed delivery, collection, repair return and credit/cash dates are kept exactly as
stated. Confirm a physical supplier appointment one Office working day before it. Physical work
uses its Warehouse/Delivery calendar; Finance/Purchasing actions use Office. When a promised
physical date passes, first check for an unposted physical result with its owner; do not accuse
the supplier of non-delivery because office paperwork is late. A proved missed promise opens
Purchasing chase and a named decision by the next Office working day. Safety, lost goods and
material money risk route immediately to the owning duty and supervision.

For a related customer Case, the Service deadline remains its existing 14 Office working days, warning four working days
before, with its governed one bounded extension. Claim/supplier dates do not move that deadline.
The shared Service rule supplies the extension limit; no second value is introduced here.
Supplier contractual claim windows, when evidenced, are stored with source terms/version and
raise earlier submission work. No undocumented supplier window or extension is assumed. Missed
windows remain visible and require a decision; they never auto-reject the customer's Case.

| Trigger / line 1 | Smaller line 2 | Duty and completion |
|---|---|---|
| The purchase source is not recorded | Check the Unit label and link its purchase record | PO Duty; verified original source linked |
| The damage photo is missing | Ask NETS Warehouse for a clear photo of the damage | PO Duty; required source evidence exists |
| The supplier claim is not issued | Share the claim with Hooka and record the actual message sent | PO Duty; exact request version/recipient/channel/time/proof |
| Hooka has not replied | Ask Hooka to confirm the claim result | PO Duty; actual evidenced answer for this request/scope |
| The supplier refused the claim | Decide how Carres will resolve the item problem | Relevant approver; scoped authorised remedy/cost decision |
| The repair return date has passed | Ask Hooka when the same Unit will return | PO Duty; the Unit received back (GRN) or an authorised changed outcome — a new supplier date is recorded but never closes the action (§9.7, 2026-09-28) |
| One Unit is still waiting for collection | Ask Hooka to confirm collection of the remaining Unit | PO Duty; exact quantity/date agreement; handover itself stays Warehouse work |
| The returned Unit has not been checked | Check the Unit and record its condition | Stock/inspection duty; accepted inspection result |
| Supplier credit evidence is missing | Ask Hooka for the credit note for this claim | PO Duty; external document received; Finance acceptance is a separate action |
| The supplier credit does not match | Check the credit note against the agreed claim amount | Finance duty; accepted match or recorded difference and owned continuation |
| The replacement count is waiting for review | Check the replacement count and save Receiving | GRN Duty; exact replacement session posted with its GRN |

These are approved dictionary templates. Actual parties/Units/results replace example names.
Owner is structured avatar metadata with full accessible name; never text in the action sentence.
Dates have specific meanings such as Reply expected, Collection date, Expected back or Credit
expected. There is no generic Due/Next Action/Priority column. One lead action plus accessible
parallel actions; required party/date/evidence is never hidden by truncation.

#### Register, factual rail and full object

**RESOLVED:** Purchasing → PROBLEMS → Supplier Claims, shared Shell + Register + Object Detail.
No New Claim, module Work page, dashboard, second sidebar or duplicate editors. Use UI MASTER
§6.7 shared listing style, toolbar, rail, responsive layout, typography and measured column-width
contract; reuse existing kit components rather than freezing page-local dimensions.

**APPROVED — register defaults; owner-confirmed column order, two-line identity and status words,
2026-09-18 · MERGED (#1789, slice C1).** Opening Supplier Claims shows every permitted claim — new, historical,
closed and cancelled — newest report first, in ONE ungrouped list. There are no group bands, no
View selector and no setup step before records appear. Purchase Orders' four groups are that
page's ruling and are not copied here. Search and factual filters are optional, start clear on
normal entry, and clearing them restores the whole permitted set.

**THE CONFIRMED COLUMN ORDER (Jess, 2026-09-18).** This exact sequence. It replaces the earlier
`Reported · Supplier Claim No · Supplier · Product · Variant · Qty · Problem · Supplier Response ·
Claim status · PO No · GRN No` order completely; that order is deleted, not kept beside this one.
Never rearrange it with a general date-first or linked-documents-last heuristic.

```text
☐ · ▸ · Claim status · Supplier Claim No · Claim Reported · Supplier ·
PO No (Unit ID on line two) · GRN No · Items · Qty · Problem · Supplier Response
```

- **`☐` and `▸` are two separate leading controls**, exactly as SO Batch (§9.1): a selection
  checkbox and a goods/evidence disclosure. Never concatenate a decorative arrow into the claim
  number. Selection is for Export only — this register has no batch write action.
- **`Claim status`** reads **`In progress` · `Closed` · `Cancelled`** (owner ruling 2026-09-18,
  replacing `Open`, which staff found confusing). **`In progress` means NOT YET CLOSED** — awaiting
  a Carres action or awaiting the supplier's reply are both inside it. **It never asserts that the
  supplier has started work.** This is a DISPLAY LABEL change only: the stored values remain
  `open · closed · cancelled` (`0288_supplier_claims.sql:70`, `0291_supplier_claim_lifecycle.sql`),
  no lifecycle state is added, and no migration is authorised by this ruling. Its governed tooltip
  is `Not closed yet. It does not mean the supplier has started.`
- **`Supplier Claim No`** is the identity and the only door into the object. An unissued claim
  keeps its place and reads `Not issued`; its permanent internal identity still opens the record.
  Preserve existing SC document numbers; never rename a historical document.
- **`Claim Reported`** (renamed from `Reported`, owner ruling 2026-09-18) is the stored
  `reported_at` fact in Malaysia time — never discovery, issue, send or closure time. Those dates
  keep their own fields in detail. An unknown report date stays unknown.
- **`PO No` carries the Unit ID on line two, in one cell.** Line one is the PO number in full
  (`PO-20260904-4665`, never shortened). Line two is the exact goods identity that PO names:
  one recorded Unit ID · `{n} Units` when the claim covers more than one individually tracked Unit ·
  `Counted stock` for quantity-managed goods that have no Unit ID and never will (§9.1's word) ·
  `Unit not recorded` when nothing is stored · `Units could not be loaded` when the read failed.
  **Never fabricate a Unit ID, and never let `{n} Units` read as one.**
- **`{n} Units` is a disclosure link into THIS ROW's expansion, not a second panel.** One expanded
  state per row: the leading `▸` and the `{n} Units` link open and close the same thing, and the
  link moves focus to the Unit rows. This is §9.1's Ready Stock precedent (a borderless in-cell
  disclosure beside the row-leading one), not a new control type.
- **`GRN No` stays its own column.** **One cell may carry a document number and the exact goods
  identity that document names, on two lines. It may NEVER carry two different documents.** This
  replaces the older blanket sentence "PO and GRN never share a Source cell" while keeping the
  protection it existed for: a reader must never have to guess which document a number belongs to.
- **`Items` replaces the separate `Product` and `Variant` columns** (owner ruling 2026-09-18, and
  the same word as §9.2–§9.4). Line one is the model in Catalog's own words; line two is the
  configuration/specification, 11px slate-11. A claim covering more than one model reads
  `{first item} + {n} more` on line one, with every item in the expansion. When Catalog cannot name
  the goods, line one prints the RECORDED SKU and says so — a source SKU is never relabelled as a
  product name and never used to invent a Catalog record. `SKU` and `Supplier DO` remain their own
  optional columns; `SKU` shows by default while any loaded record has no Catalog product name.
- **`Qty` is the reported claim quantity**, not a Unit count: held Units can be fewer or zero. No
  quantity total in the footer.
- **`Problem`** is the recorded problem type. `Late delivery` stays readable on historical records
  only; passing time never creates a new claim.
- **`Supplier Response`** is what the supplier actually answered, from its own closed list
  (`Replacement · Deliver remaining · Repair · Return & replace · Reject · Other agreement`);
  absent reads `Not recorded`. It is never Carres's ask and never a completion.

**ONE PARENT ROW IS ONE SUPPLIER CLAIM WORKSTREAM.** `Qty 2` does not create two Claims or two
Cases, and never one row per Unit, per photo or per Work action. The existing supplier/source-line
and incident boundaries are unchanged by this presentation: a claim still starts from one verified
Stock/PO-line/receipt source, and a related customer complaint is still its own linked Case.

**PINNING — owner-ordered exception to the shared date-first pair, recorded so no later chat
"corrects" it back.** UI MASTER §6.7 rule 2 pins `date · identity`; this page's owner-approved
order puts `Claim status` first and the date third, and §6.7 already rules that exact
owner-approved page orders outrank the general heuristic. Therefore: **canvas ≥768px pins the two
leading controls plus `Claim status` and `Supplier Claim No`; below 768px only `Supplier Claim
No.` pins**, and `Claim status` scrolls with the rest. `Claim Reported` is never pinned here.
Consequence for build: the shipped `DataGrid leadingColumns` capability forces `date · identity`
to lead and cannot express this order — Supplier Claims does NOT adopt it; the engine
takes the page's own leading columns through `pinnedPrefix` (MERGED #1789, slice C1). No column is hidden by width; the
approved defaults or the person's saved layout always show and overflow scrolls inside the grid.
Horizontal scrolling uses the shared pinned offsets, so a pinned cell never covers adjacent
content.

**HEADER GEOMETRY — fix the overlap and the blank blocks with the SHARED contract, never a
page-local one.** Every header cell — including the two leading control cells — is part of the one
slate-3 header band, painted opaque, and reserves the shared two-line header height (§6.8) so a
one-word header centres instead of leaving a blank block above it. A sticky header paints above
body cells; a pinned cell paints above unpinned ones; a pinned header cell paints above both. No
transparent sticky cell, no page-specific z-index ladder, no page-specific row or header height.

**ROW HEIGHT.** This register carries two-line identity (`PO No` + Unit ID) and two-line goods
(`Items`), so every row uses the **shared 51px two-line listing row (UI §6.8, owner ruling 2026-09-26, which overwrote 54px)** with vertically centred
checkbox, disclosure and quantity (§6.8). The engine's 38px single-line default stays correct for
single-line registers; 51px is the goods-row geometry, not a portal-wide replacement. Short
content fits inside 51px; long content and accessibility needs may grow the row — a required
party, number, document or date is never ellipsised to protect the height.

Wider detail/reference fields remain optional Columns: Requested Result, Authorised Outcome, Item
Outcome, Reply expected, Collection date, Expected back, Credit expected, Claim Version and Sent to
Supplier. Only relevant date facts appear; no generic workflow field. Unknown optional facts are
not promoted to permanent empty columns; measure before final layout.

```text
Supplier Claims                                      Jump to · Alerts · Help · Settings
                                                     Search · Export · Columns
SUPPLIER               ☐ ▸ Claim status | Supplier Claim No | Claim Reported | Supplier |
  actual suppliers         PO No (Unit ID line two) | GRN No | Items | Qty | Problem |
PROBLEM                    Supplier Response
  observed types       one ungrouped list, newest report first; facts and evidence only
CLAIM STATUS           footer: matching claims, claim count only
  In progress / Closed / Cancelled
SUPPLIER RESPONSE
  Not recorded / actual recorded answer
Clear filters
```

The four rail groups are Supplier, Problem, Claim status and Supplier Response; presentation follows
UI MASTER §6.7, with no page-local typography or widths. Customer Resolution and Carres Execution
are not listing columns. Historical problem types remain findable when present.

Rail entries are factual predicates with truthful counts, not action queues. No empty invented
supplier/category rows. Typed date filtering stays with the date column. Search covers claim,
source PO/GRN, Unit, supplier, supplier reference and item; no privileged customer data leaks
into supplier views. Clearing filters returns the full permitted set. Empty result, no access and
load failure are different states. A failed source is never shown as zero claims. Supplier presence or a PO ID alone does not prove
valid PO-line/GRN-line/Unit scope. Remove the ordinary Evidence rail group; preserve required
missing-source/reply/credit facts and source-search doors in detail and their owning Work. Legacy
incomplete records remain visible. No formal issue passes without verified provenance. Facet
counts cover the complete permitted searched/filtered set under shared facet semantics, not the
loaded page; collapsed groups do not filter.

#### Row expansion — the per-Unit evidence inspector

**Build (2026-09-29, MERGED #1802, 0614 APPLIED).** `SupplierClaimUnitsTable` draws the
five columns below from `GET /api/operation/supplier-claims/:id/inspection` (read when the row is
expanded) through the ONE shared arithmetic `supplierClaimInspectionRows`: one row per held tracked
Unit (`Qty 1`) with its own receiving problem note (`receiving_unit_results`), counted stock on one
row (`Counted stock`), and the SavedEvidenceViewer per kind. **Linkage:** before 0614 no stored claim
photo named a Unit, so none is attributed; every such file sits on one `Whole claim` row, never spread
across Units. 0614 lets the ONE photo writer (`supplier_claim_photo_entries`, called by every
receiving door) keep `{path, unit_code}`, and both receiving APIs accept `{path, unitCode}`; a file
is attributed only when its `unit_code` is one of that claim's Units. **Limit, named:** the
Receiving form still uploads line-level photos, so until Receiving sends per-Unit photos (a §9.4 UI
change needing its own approval) new evidence also lands on `Whole claim`.

**OWNER-CONFIRMED 2026-09-18 · APPROVED; MERGED (#1789, above).** The expansion has exactly one job: read the
problem and its evidence for each affected Unit. **It is read-only. It contains no editor, no
uploader, no delete control and no status change.** It replaces the earlier "photo thumbnails"
inspector completely.

**Expansion columns, in this order:**

```text
PO No (Unit ID on line two) · Items · Qty · Problem & Evidence · Supplier Response
```

- **For individually tracked goods, each Unit gets its own row, `Qty 1`**, carrying that Unit's
  own recorded problem, its own linked evidence and the supplier response that actually applies to
  it. A reply recorded against the whole claim shows on each Unit as the claim-level answer it is;
  **an aggregate reply is never distributed across Units as if each had been answered separately**,
  and a Unit with no applicable answer reads `Not recorded`.
- **Quantity-managed goods keep their genuine quantity on one row.** No Unit ID is invented, no
  row is split to manufacture a per-Unit appearance. Line two reads `Counted stock`.
- The parent row's facts are not repeated as a summary row inside its own expansion.

**Evidence controls — compact, inside the row, never a button bar.** Beneath the problem
description sit small icon + text controls reading exactly **`Photos {n}`** and **`Video {n}`**
(singular `Photo 1` · `Video 1`). Icon plus text only: **no large buttons, no pills, no borders,
no permanent filled background.** They take the shared control ink and the 12px helper size, show
a hover/focus tint only while hovered or focused, and carry a visible focus ring. Short content
fits the shared 51px row; long problem text and accessibility needs may grow it.

- **Clicking expands that Unit's evidence directly beneath that Unit. Clicking again collapses
  it.** `aria-expanded` states it. Each Unit owns its own evidence disclosure; opening one never
  closes another and never moves the rows above it.
- A count is never printed when it is unknown: an unread evidence list reads
  `Evidence could not be loaded` + `Try again`, never `Photos 0`. `Photos 0` means the record
  genuinely has none — and a kind with zero files prints no control at all rather than a dead one.

**The saved-evidence viewer — ONE shared component; DEPLOYED + AUTHENTICATED RECEIVING READBACK, 2026-09-24 (#1593).**

| Check | Measured answer |
|---|---|
| Does a shared saved-evidence viewer exist? | **Deployed kit:** `components/kit/SavedEvidenceViewer.tsx`, registered in `02-components.md` and `/ui`. Receiving is the first consumer. Claim-record photo adoption is deployed with authenticated readback (2026-09-24, #1594); Stock/Service and the approved per-Unit Claim expansion remain unbuilt |
| Validation boundary | Component/Receiving/kit-source tests passed; browser photos support zoom, bounded drag, reset and preserved source/Unit context. At 390px the dialog and retry actions fit; opening/closing at the same position returned focus to View and preserved scrollY 1244. A generated eight-second video was played/paused, sought to second 4 and entered/exited fullscreen in a fresh browser tab; no saved production video playback is claimed. Receiving production readback is recorded below; Claim adoption has its own boundary |

CI `35992160117` and deployment `35993421790` passed for #1593; all five canonical
surfaces reported `59c2137810d842a6a9ec1e22bc93e9d96f4cc18c`. Its own Pages deployment
was `af9b0ddb.carres-portal.pages.dev`, compared with `89b4a69b.carres-portal.pages.dev`:
`saved-evidence-viewer` appeared once versus zero while `Supplier DO No` stayed at eight.
Authenticated `GRN-20260904-1064` retained its recorded `Photo 1` despite no readable
file. Opening showed the GRN and Arrival evidence context, explicit failure and Try again.
Retry showed Loading then the same failure without closing the GRN; Escape returned
focus to Photo 1. No successful recovery of that unavailable stored file is claimed.

The production `/ui#saved-evidence` example proved photo enlargement, drag (80px/40px
at 1.5×), Reset, file navigation and separate unreadable-photo state. The generated
8-second video initially failed to load, then Try again recovered it; native controls
played/paused, sought to second 4 and entered/exited fullscreen. Close returned focus
to View. This is synthetic video playback proof, not saved business-video proof.
No permissions, evidence, receipt, claim or stock facts were changed.

**Fullscreen keyboard correction — DEPLOYED + PRODUCTION READBACK, 2026-09-24 (#1595).**
A further production check found native video controls retained focus after leaving
fullscreen, so a subsequent Escape did not close the viewer. The shared viewer now
returns focus to its media region on the next animation frame after fullscreen exit;
this avoids the exiting Escape also dismissing the dialog. Local browser verification
kept the viewer open after exit, then the next Escape closed it and returned focus to
View. A regression test covers fullscreen exit, viewer focus, Escape and opener return.
22 Claim/viewer tests passed. CI `35996235479` and deployment `35997526538` passed;
all five canonical surfaces reported `637459451c94f8cb5d3fa4df552460f3001c161b`.
The own Pages deployment `798c38b9.carres-portal.pages.dev`, compared with
`647fe5fa.carres-portal.pages.dev`, added the two fullscreen-change listener references
(one to three occurrences); the viewer and Supplier DO control strings stayed unchanged.
On the production example, entering video fullscreen then using the native exit control
kept the dialog open and focused its saved-evidence media region. The following Escape
closed it and returned focus to View. This proves focus restoration after fullscreen exit;
it does not assert that automated Escape can control the browser's native fullscreen layer.

**Claim-record photo adoption — DEPLOYED + AUTHENTICATED READBACK, 2026-09-24 (#1594).**
The existing full-width record opens its saved photos in `SavedEvidenceViewer`, including
known files whose signed URL is missing. Retry reuses the existing authenticated Claim
photo reader and selects the same recorded path; an error keeps the record and viewer
open. Claim number and recorded photo date remain visible. Held Units are not assigned
to every photo: this legacy photo list carries no evidenced photo-to-Unit relationship.
21 component/Claim tests cover unreadable-file recovery, same-path selection, reader
failure, focus return and the absence of invented Unit attribution. This adopts the
read-only kit only; it does not deliver supplier reply recording or the approved
per-Unit expansion. Stock and Service consumers still require their own adoption.

CI `35994110721` and deployment `35995368126` passed; all five canonical surfaces
reported `669a6001e2de810e0b0e1b1a066f2507a008878f`. The own Pages deployment
`647fe5fa.carres-portal.pages.dev` was compared with `af9b0ddb.carres-portal.pages.dev`:
the old `: unavailable` fragment changed from one to zero, Claim ` · Evidence` context
from zero to one, and `Supplier DO No` stayed at eight. Authenticated `SC-1019`
opened Photo 1 with `SC-1019 · Evidence · Fri, 4 Sep`, explicit failure and Try again.
Retry returned the same truthful failure without closing the record. Escape closed the
viewer and focused Photo 1; original PO-SMOKE-B, GRN-20260904-1064 and held Unit
U1-000-064 remained on the Claim, with no invented Unit attribution in the photo dialog.
The saved file was unavailable, so successful stored-file recovery is not claimed.
The existing `ClaimPhotoUploadField` admits JPG/PNG only; this adoption is explicitly
for that photo reader, not proof of a Claim video-upload or video-association journey.
No reply, evidence, claim, receipt or stock record was written.

The one shared viewer, reused by Supplier Claims, Receiving, Stock and Service Case alike:

- **Photos:** zoom in · zoom out · drag to pan while enlarged · `Reset` · `Previous` · `Next` ·
  `Close` · `Esc`. Closing returns focus to the control that opened it and restores the register's
  scroll position and the open expansion — the operator never loses their place.
- **Video:** play/pause, seek and fullscreen. **Local video zoom is outside this approval** and is
  not built silently.
- **It is a READ-ONLY viewer.** No uploader, no delete, no re-order, no rotate-and-save. Adding
  evidence stays with its owning record and its own permission.
- **File-to-Unit and file-to-event relationships are preserved and visible** — a photo opened from
  a Unit says which Unit and which recorded event it belongs to. Permissions are enforced per file
  on the server; the viewer never widens them.
- **Loading, failure and retry are distinct, and MISSING is not UNREADABLE.** A file the record
  never had reads as absent; a file that exists but could not be read reads
  `Photo {n} could not be loaded` + `Try again`. The two never render alike, because one means
  nobody uploaded it and the other means the operator is being shown less than the record holds.

**SUPPLIER CLAIMS PAGE DESIGN — APPROVED / NOT BUILT (owner review 2026-09-18, column order and
evidence design confirmed 2026-09-18).** The Blueprint is closed; implementation and the signed-in
walk at 1440/1180/820/390 are still owed. Widths below are candidates until measured in the real
DOM.

*Shared listing alignment (UI MASTER §6.7–6.9; same grammar as SO Batch, Manual Purchase, Purchase
Orders):*

| Region | Approved rule |
|---|---|
| Pinned columns | The two leading controls plus `Claim status` and `Supplier Claim No` pin at canvas ≥768px; below 768px only `Supplier Claim No` pins. `Claim Reported` is never pinned. The shipped `leadingColumns` capability cannot express this order and is not adopted here; the engine `pinnedPrefix` is. No column is hidden by width; the approved defaults or the person's saved layout always show, and overflow scrolls inside the grid |
| Widths | Content-measured `width` + `minWidth` like SO Batch/Manual Purchase, with the minimum set by the complete two-line header plus its controls. Candidates from production Inter 13px text: `SC-20260916-0007` 122.8px text (column ≈147px); widest date `Wed, 08 May` 81.1px text (column ≈97px); `In progress` needs ≈96px; `PO-20260904-4665` and `U1-000-075` share one cell, so its width is the wider of the two lines. Final values come from the build's DOM measurement |
| Row height | Shared 51px two-line listing row (§6.8), vertically centred controls. Growth for long content and accessibility is allowed; ellipsising a required fact to protect 51px is not |
| Type and colour | Main text 13px · second line 11px slate-11 · form/button helper 12px · error 13px with icon. Shared slate palette (`palette="slate"`); no Claim-specific styles |
| Buttons | Kit Button, `md` = 32px. Evidence controls are NOT Buttons — icon + text only. Touch targets expand only by the shared rule; no page-level 40px buttons |
| Search and footer | Shared responsive search, condition bar and one `Clear filters` (grid `activeConditions`). Footer `{N} Supplier Claims` · `1 Supplier Claim` · filtered `{n} of {N} Supplier Claims`. No quantity total: `qty` is the reported quantity and held Units can be fewer or zero (`supplier-claims.ts` read), so it is not an independent Unit count |
| Rail | `useFilterRailOpen` (starts hidden and overlays below 896px canvas); group state `carres.filterRail.<rail>.<group>`. Groups: Supplier · Problem · Claim status (`In progress` · `Closed` · `Cancelled`) · Supplier Response |
| States | Loading · `No Supplier Claims yet.` · `No Supplier Claims match these filters` · `Supplier Claims could not be loaded` + `Try again` inside the grid (toolbar stays) · no access · evidence read failure `Evidence could not be loaded` / `Photo {n} could not be loaded` + `Try again` — each distinct |
| Row expansion | One job: the read-only per-Unit problem/evidence inspector above. No editor, no uploader, no delete. Selection is for Export only |
| Open and return | `Supplier Claim No` opens the full-width object (`?claim=`, kept in the URL) — never a summary popup, which is rejected. The object has a visible back link to Supplier Claims and `‹ i of n ›`; the claim pack has a visible Close back to the object. Returning restores filters, scroll, row, open expansion and focus on its Supplier Claim No Esc is an extra shortcut, never the only way out. Object header follows Manual Purchase's pattern until the kit gains one shared object header |
| Cross-links | PO No opens the Purchase Orders object (`?po=`); GRN No opens the Receiving record; a Unit ID opens Stock |

**THE RECORD IS WHERE WORK HAPPENS — owner-confirmed 2026-09-18.** The listing and the Unit
expansion are read-only. `Open Claim` and the claim number both lead to the ONE governed full-width
working record. **My Work links to that same record** (`/operation?tab=claims&claim=…`, built by
`packages/shared/src/sales-order-route.ts:402`). Authorised staff record the supplier's actual
reply THERE — the answer, the affected scope, the date and its evidence. **No separate Workspace
editor, no second reply form, no inline reply in the register.** Case, Stock, Receiving and Finance
ownership boundaries are unchanged: the record reads their facts and links to them, and never
writes them.

**Implementation state of reply recording — MERGED (#1789, slice C1), 0607 APPLIED
2026-09-29.** `POST /:id/response` now calls `supplier_claim_record_reply` (0607: append-only
`supplier_claim_replies` with scope, Units, supplier's date, evidence and recorder; a reply before
the ask is contact evidence that the ask promotes). The scope-less 0291 door is revoked from
signed-in callers. The record page calls it through the reply form. Production proof (record,
History, register column) is owed after 0607 is applied and the PR deployed.

**TWO APPROVED TARGETS; NEITHER MAY BE DELIVERED HALF-WAY.**

| Target | State | The build's obligation |
|---|---|---|
| The ONE shared read-only saved-evidence viewer (UI MASTER §6.8) | **DEPLOYED KIT + CLAIM-RECORD PHOTOS; authenticated readback recorded** | Registered in the kit with Receiving as the first consumer. Supplier Claims, Stock and Service Case reuse the same implementation — never a page-local copy |
| The Supplier Response recording surface on the full-width claim record | **MERGED (#1789, C1); 0607 APPLIED 2026-09-29; production proof owed** | The build **must** ship a working reply-recording journey, not a read-only page plus a promise |

**SUPPLIER REPLY RECORDING — OWNER-APPROVED (Jess, 2026-09-25) · MERGED (#1789)
(slice C1, 0607 APPLIED 2026-09-29).** The measurement below is the pre-build baseline. Measured on
production 2026-09-25: 71 claims (70 `open`, 1 `closed`), 70 with `requested_action`, **1** with
`supplier_response`; the three SQL doors exist (`supplier_claim_record_request` ·
`supplier_claim_record_response` · `supplier_claim_close`, 0291) and **no web caller** exists for
any of them — the record prints `Supplier instruction and reply recording are not available here
yet.`; no claim send ledger table exists; `work.ts` projects no claim action. The approved
journey, both ways to the same completion fact:

```text
From Work:    `Ask {Supplier} to reply to the supplier claim` → Open → claim record → Record supplier reply
From module:  Supplier Claims → Supplier Claim No → the same claim record → the same button
Completion:   supplier_response stored with scope, date and evidence; the Work occurrence closes itself
```

- **Two buttons on the record's Supplier section, in order.** `Record what we asked` (one of the
  governed asks; freezes once answered) then `Record supplier reply`. The database already refuses an
  answer without an ask; a reply that arrives first is stored as contact evidence and becomes the
  formal reply once the ask is recorded — never a forced earlier ask.
- **The reply form:** `Supplier's answer` (`Replacement` · `Deliver remaining` · `Repair` ·
  `Return & replace` · `Reject` · `Other agreement`) · `Applies to` (`Whole claim` or `These Units`
  — a claim-level answer is stored claim-level and never distributed per Unit; an unanswered Unit
  stays `Not recorded`) · `Supplier's date` (the supplier's promised delivery/collection/return date,
  the seed for the day-before check and any RO/PRTN) · `Evidence` (the shared uploader: photo, video,
  PDF; a phone answer records who spoke, what and when) · `Note` (required for `Reject` and `Other
  agreement`). `POST /:id/response` is extended with scope, date and evidence; no parallel endpoint.
- **Timing:** the owner-approved / LOCKED 2026-09-06 rule below (`Reply waiting days` = 2 ·
  `Extra days before escalation` = 2, Office working days, `Settings → Purchasing → Supplier
  Claims`). `Reply expected` = ask + `Reply waiting days`; the extra days raise Purchasing Approver
  decision work while PO Duty keeps the chase. The two settings are APPROVED TARGET / NOT BUILT —
  no code or table holds them today. (Corrected 2026-09-25: an earlier line here invented other
  setting names.)
- **Who:** any active Operation person records; the recorder is stored (§5.7 ruling). Authorised
  Outcome stays PO Duty/cover/superuser.
- **Sending evidence (`Claim sent · {channel} · {recipient} · {time} · {actor}`)** needs the
  document-agnostic send ledger §9.7 already requires (lift `po_sends` into a shared component and
  table); the claim pack PDF stays optional (§3.3) — a WhatsApp message plus evidence is a valid
  request.
- **States on the record:** `Not recorded` → `Reply expected {date}` → `Reply overdue · {date}` →
  `Escalated to {name}` → the recorded answer line `{answer} · {scope} · by {date} · recorded {date}
  · {recorder}` with `Evidence {n}` and History. Missing evidence or a missing note names itself
  beside the button; a timeout re-reads the record and never prints a refusal it did not receive.
- **Responsive:** ≥1180 the form is a 560px right panel on the record; 820/743 full width under
  the Supplier section; 390 full width, one Unit tick per row, 40px bottom actions.
- **Register consequence:** the `Supplier Response` column prints the recorded answer word; the rail's
  `Supplier Response` facet reads the same stored value.

**The reply-recording build reuses what exists; it does not grow a second system.**

- **Reuse the existing server door.** `POST /api/ops/operation/supplier-claims/:id/response`
  (`apps/api/src/routes/operation/supplier-claims.ts:413`) is the write path. Extend it where the
  approved facts need it — affected scope, date, evidence, the permission gate — rather than minting
  a parallel endpoint beside it.
- **Reuse the existing work entry.** My Work links to the claim record through the built deep link
  `/operation?tab=claims&claim=…` (`packages/shared/src/sales-order-route.ts:402`). The reply is
  recorded there. **No separate Workspace editor, no second reply form, no inline reply in the
  register, and no new claim-only work page.**
- **One writer per fact.** The reply records what the supplier actually answered, its affected
  scope, its date and its evidence — and nothing else. Authorised Outcome, Item Outcome, Stock,
  Receiving, Case and Finance keep their own writers; the record reads and links to them.
- **Scope honesty travels with the answer.** A reply recorded for the whole claim is stored and
  shown as a claim-level answer; recording it never distributes it across Units as if each had been
  answered separately, and a Unit with no applicable answer stays `Not recorded`.
- **A page that can show a reply but not record one is not this scope delivered.** Closing this
  scope requires the recorded reply to appear on the record, in History with its actor and time,
  and in the register's `Supplier Response` column — proved on production, not in a fixture.

*Full object — one full-width working scroll, in this order:*

```text
← Supplier Claims   SC-… · Hooka · In progress                            ‹ 3 of 12 ›
[Current action] owner avatar · fact line · instruction line · working date · ONE primary button
The Item      Items (model · configuration) · SKU · reported Qty · affected Units (own
              count, separate) · PO No / Unit ID · GRN No
Problem       type · note · per-Unit evidence through the ONE shared saved-evidence viewer ·
              reported date and reporter
Supplier      what we asked · sending evidence · the supplier's recorded reply, its affected
              scope, its date and its evidence · Reply expected
Result        Authorised Outcome · Item Outcome (Stock, read-only) · RO / PRTN / replacement
              doors · supplier money (Finance, read-only)
Related       Service Case, read-only (hidden only when there is no linked Case)
Documents     pack versions · Claim sent to supplier · channel · recipient · actor · time
History       three-rank records
```

*Business protections carried into the page (owner rulings 2026-09-18):*

- **What was asked and whether it was sent are separate facts.** The request content lives in
  Supplier; the send is proved only by `Claim sent to supplier` with pack version, channel,
  recipient, actor and time. `Prepare supplier claim`, copying or opening WhatsApp is history,
  never sending.
- **Result does not depend on a reply.** The Result section shows whenever any authorised outcome,
  receipt/inspection, RO/PRTN/replacement or Finance record exists, with or without a supplier
  reply.
- **Repair execution is server-checked.** A supplier's `Repair` answer is an offer. `Plan Repair`
  is offered only when the server confirms Authorised Outcome = Repair, the exact Units, and the
  actor's permission (current PO Duty, its dated cover, or Operations Superuser); otherwise the
  missing fact and its owning door show. The server refuses the act on the same checks.
- **Missing facts are never silently hidden.** Not applicable → hidden. Required but missing →
  `Not recorded` or the specific missing fact. Read failure → `{X} could not be loaded` +
  `Try again`. Capability not yet connected → one short line saying so.
- **System-written facts never read as staff acts.** A `requested_at` written by the retired
  late-delivery sweep (no requester, no send evidence) shows `What we asked: Not recorded`; its
  History line uses `Recorded automatically` only when confirmed system-written. An unknown
  individual stays `Staff identity not recorded`. Retiring the cron does not rewrite old rows.

Section actions live in their governed section header; rare Split/Cancel/Reopen are in More with
reasons and exact consequence review. A related customer remedy opens its Service Case; physical
outcome opens Stock/Receiving/Outbound; Finance opens its own acceptance record. A shortcut never
creates a second editor.

External claim pack (`Prepare supplier claim`) uses 50/50 only while preparing/revising, like PO:
facts/checks left, exact PDF right, stacking below 1130px (§8.2). Normal claim detail is full
width; Receiving's 50/50 GRN detail is an approved exception and is not copied here. Includes SC/version, supplier, source PO/GRN/Supplier DO,
supplier reference, item/Units, problem, approved request, relevant evidence and required reply.
Exclude internal fault review, margin, selling price and unrelated customer information. A
supplier home visit releases only the authorised visit/contact details through the related Case's governed
instruction. It does not turn the supplier pack into a complete customer record.

Every pack has a frozen version, output file, recipient/audience, channel, actual sent time and
actor/proof. Reprint uses the saved version. Revised facts create a new version and a concrete
“new version not sent” fact; old sends never complete the new one. Download/open/copy is history,
not send proof. Stale review refuses the send/approval and shows what changed without discarding
staff input. A repeated save returns the same result. Printed/signed return and repair papers are
listed from their owning documents; a related Case Documents panel reads the same checklist.

Order Route is a graph of real linked records, not an invented single sequence:

```text
PO / CO → Receiving / GRN → original Unit → Supplier Claim
                                            ├→ PRTN / CRTN → actual handover
                                            ├→ RO → same Unit out / back / check
                                            ├→ replacement instruction / PO → new Unit / GRN
                                            │                                  → replacement DO / proof
                                            └→ Finance credit / cash / application
related Service Case ↔ original SO / DO / customer collection (read-only link to the Claim);
Issue ↔ incident and cost/recovery references
```

Each node shows its authoritative facts, actual completion evidence and the shared action when
admitted. Missing links stay visibly missing. Selecting a node opens the owning object, never a
second form. Customer/supplier promises, actual receipt and actual delivery stay separate dates.

#### Permissions, settings and reports

**APPROVED within the ownership boundaries:** authorised reporters add observed facts;
PO Duty/cover records supplier request/reply and issues approved supplier documents; governed
Operations Superuser may perform the same operational act with its actual identity. Remedy and
commercial concessions use their named approver duties, not “Manager” text. Finance accepts money;
Stock Adjustment Approver approves write-off; physical operators record their own observations.
No issue privilege grants commercial approval or stock/ledger write privilege.

Split, Cancel and Reopen need the relevant claim decision capability plus reason; abandoning
recovery additionally needs Purchasing Approver and the owning Finance approval. Preserve normal
holder, dated cover and actual actor. Partner access is scoped to the assigned document/event and
safe evidence subset. Existing external access is not expanded by this Blueprint. Denied actions
show the specific missing authority and owning door; audit records cannot be edited by reporters.

Central Settings → Purchasing holds supplier contacts/channels, claim terms/windows with evidence,
approved response/chase intervals, escalation thresholds, allowed supplier outcomes, claim-pack
templates and privacy rules. Shared Staff & Duties alone holds people/cover. Service Settings
holds Case policy, evidence playbooks and customer deadlines. Warehouse/Delivery own physical
calendars and proof requirements; Finance owns money acceptance/approval rules. Settings retain
actor, old/new value, effective date and rule version. Do not silently change historic deadlines,
issued packs or approved remedy terms. Supplier-specific exceptions require evidenced terms.

Central Reports and register exports cover open claim age, first request/reply time, broken
supplier promises, outcome mix, partial/failed repairs, replacements, goods waiting for supplier
collection, missing evidence, issued versions not sent, accepted credit, cash received and
unrecovered amount. Show original and reopened age separately. Supplier performance distinguishes
supplier wait from Carres evidence/approval delay; late office recording is not supplier fault.
Rates state denominator and data coverage and are withheld where insufficient. Every total
drills to its source records, Unit scope and Finance allocations. Supplier monthly fault/recovery
reports belong to Issue Tracker; no competing Claim report overwrites reviewed fault findings.

Safe bulk actions: filtered/selected export and print saved permitted documents. No bulk remedy,
close, cancellation, stock release, blame, money acceptance or recorded-send tick. Print output
states document/version count; list export is clearly different from claim-pack output. No Copy
Claim or transaction import creates a new obligation from an existing one. Scan finds an existing
Unit/source; evidence upload attaches to that identity rather than creating stock.

#### Dependencies and business acceptance boundaries

These are dependency relationships, not build scopes or implementation sequencing.

| Capability | Required authority / fact | Business acceptance example |
|---|---|---|
| One source problem and supplier claim | Stock/PO/receipt source intake, duplicate matching and verified source under the 2026-09-14 §9.5 ruling | Receiving and Stock report the same Unit fault; one claim/evidence set and one supplier obligation remain; a customer complaint about the same goods is a separate linked Case |
| Claim identity and communication | Shared number/version authority, Supplier Master contact, exact sent evidence | Retrying an uncertain send keeps the same claim/version; opening WhatsApp alone completes nothing |
| Scoped outcomes | Purchasing stock-claim approval, original source coverage and exact Unit identity | Three damaged Units: two repaired, one replaced; every Unit and remainder stays visible without a second buy |
| Replacement fulfilment | Authorised instruction, one purchase-demand coverage, Receiving and Stock | New physical replacement gets a new Unit and new receipt; the original damaged Unit remains traceable |
| Repair/return | Owning RO/PRTN/CRTN plus physical Outbound/Inbound evidence | One of two Units collected leaves the other open; a repaired Unit is not usable until inspection passes |
| Supplier money completion | Finance-owned acceptance, external evidence and unique scoped allocation | RM80 agreed and RM50 received leaves RM30 open; credit is never displayed as received cash |
| Dated Work | Shared Duty resolver, admitted source projection and approved date policy | Buddy cover sees the same obligation; the actual actor and normal owner remain separate in History |
| Closure/correction | All required owner completion facts and append-only history | Customer served first; supplier collection still open keeps that work visible; reopen preserves the first close and original age |

**Completion acceptance — documentation complete, implementation checks still OWED:**

| Scenario | Required result |
|---|---|
| Receipt damage with no customer complaint | Exact source-linked Claim; no fabricated Case; retry reuses the occurrence |
| Customer complaint followed by supplier recovery | Service owns customer arrangement; Purchasing verifies source and links an independent Claim; no Case-created Claim |
| Customer replaced first while supplier repair/credit is outstanding | Customer and supplier outcomes progress independently; no duplicate delivery or premature Claim closure |
| Old customer execution or Late delivery value | History stays readable; no new customer picker on Claim and no calendar-created Claim |
| ETA passes, supplier-confirmed date passes, or supplier date is unknown | No automatic Claim in any case; governed PO/My Work follow-up still works with the correct date meaning |
| PO exists but line/Unit provenance is missing or its read fails | Never count that as verified source; issue refuses appropriately; evidence and existing records remain accessible |
| List, detail and document | Date/identity pinned, all historical states searchable, four factual rail groups; full-width detail; 50/50 only preparing/revising the external pack |
| Partial goods/money outcome, concurrent edit or uncertain retry | Existing scoped closure, version, idempotency and owning-module evidence rules pass; no half-applied result |
| Rendered acceptance | 1440/390, long names, keyboard, 200% zoom, contrast, empty/error/no-access and whole-set counts verified; screenshots attached outside repository |

No application or database change is part of this documentation completion. A later build must
prove the matrix and existing §9.5 lifecycle/permission/Finance gates before claiming delivery.

A missing Finance continuation cannot be replaced with a Purchasing “paid” tick or sent to BUILD
as an unresolved business choice. The acceptance contract may use an authorised Finance record
and external evidence without inventing a full AP module. Source/duty unavailability must be shown
as a named dependency, never fabricated completion. No external-account, cutover or live data
change is included in these acceptance boundaries.

#### Current local build evidence — 2026-09-07

The independently released slice is the governed factual Register, full-width read-only
SC object and paginated source/Catalog/held-Unit reads. The shared FilterRail replaces
the retired queue/card chrome; Search, Export and Columns use one Register toolbar, without
a redundant View selector.
Hide/Show filters preserves the active predicates, filtered totals name the complete set,
and opening/returning from a Claim preserves the Register state. The object reads the
independent supplier/customer/execution/stock layers and explicitly identifies unavailable
claim writes, versioned communication, physical completion and Finance settlement.

**Delivery evidence:** [PR #1138](https://github.com/wenwei4046/Carres-Portal-v2/pull/1138)
records the release, scoped validation and authenticated production verification;
[the release workflow](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/34081474775)
records deployment of main `90a8f3ef`. The PR's complete CI passed, including 9,685 tests,
type checks, production build and bundle-secret checks. The Catalog-field negative control
fails as required; desktop and 768px fixture checks cover search, rail collapse,
full-width object and return. Workflow success and the authenticated checks in the PR are
the production evidence; a local fixture is never production proof.

A local, unnumbered SQL proposal reviewed 2026-09-07 linked Receiving and Stock problems into a
Service Case. It is not the approved model (2026-09-14 ruling) and is not released. Its review
lesson stands: duplicate matching must compare the source occurrence, not only Unit + problem.

#### Decision rationale and future review triggers

| Current → problem | Approved decision / trade-off | Evidence requiring a fresh owner ruling |
|---|---|---|
| Ask/answer can close the current claim → goods or money can remain unfinished | Close on supplier outcome evidence; more honest open claims and more visible follow-through | An owner-approved process explicitly defines the Claim as negotiation only and provides another proved end-to-end obligation owner |
| Single quantity/answer → partial results are ambiguous | Scoped Unit/quantity outcomes and conserved split lineage; adds detail when outcomes differ | Real claim examples prove every result always applies to the whole scope and no partial outcome is required |
| Flexible layers with no consequence rule → staff must remember documents | Keep recording flexible; require approved executable scope; one extra review only when authority is needed | An observed necessary legitimate act cannot be recorded, or an approved future act is blocked despite complete authority/evidence |
| Current row edits customer/stock answers → several modules can appear to decide one fact | Read facts and open the one owning editor; an extra navigation step buys one truth | Current-main authority explicitly gives Purchasing that record rather than summary responsibility |
| Supplier note can mean cash/credit/offset → “money recovered” may be false | Separate Finance acceptance and settlement evidence; adds explicit financial scope | Finance authority defines another single record that proves all the named outcomes without losing partial balances |
| No fixed supplier follow-through timing → reminders rely on memory | Approved configurable 2+2 reply/escalation rule; next-day intake is approved | Recorded supplier terms or measured response/claim-loss data show these intervals harm the operation |

**Owner approval — 2026-09-06 and 2026-09-14:** the owner approved the complete Blueprint and the
two configurable 2-day reply settings on 2026-09-06, and on 2026-09-14 approved the independent
stock-claim boundary, repair closure rule and Problems interaction contract. This approves source/identity, scoped remedies and consequences, evidence,
documents, partial quantities, Finance settlement, closure, cancellation/reopening, Work/dates,
UI, permissions, Settings, reports and the cross-module acceptance boundaries above. No business
choice remains pending in this scope. Measured implementation gaps and future UI/data checks
remain explicit; approval is not implementation or production verification.

**Intentional rejects:** Service Case as stock-claim intake, parent or approver, duplicate claim
intake, stock-only fake customer, automatic refund,
credit treated as cash, automatic blame, stock release by claim status, automatic supplier claim
for routine partial delivery, independent assignments, generic Work/Due/Priority/Next Action,
notification-driven workflow, duplicate editors, blank return/repair creation, re-entry of photos,
new Unit on repair, historical renumbering, invisible partial quantity, forced matched-pair answers,
Carres customer-site inspection, external supplier cutover, Cards and application implementation.

**Repair claim closure — OWNER-APPROVED 2026-09-14; target, not implementation proof.**
For an approved repair outcome, the Supplier Claim stays open until the item has been repaired,
the same Unit has been received back and the return inspection confirms the repair is complete.
A supplier's agreement to repair is not completion. Read the linked Repair Order and authoritative
receipt/inspection evidence; recording a reply alone cannot close the repair claim. This ruling
does not close any related customer Service Case.

**Problems interaction contract — OWNER-APPROVED 2026-09-14; target, not production proof.**

- The three Registers find records. Row expansion is a read-only summary; the record number opens
  full-width work detail. Returning preserves the list filter and position. Search, typed filters,
  sorting, optional columns and export retain source and Unit findability.
- Claim detail reads: item/source/problem and original evidence; current permitted action with
  resolved owner and actual date; supplier request and observed sending evidence; supplier reply;
  authorised stock-claim decision; linked execution results; documents and History. Customer remedy
  is not a Claim picker. Related customer context, when present, links to its owner.
- Requests, replies, approved decisions and physical execution are distinct facts. Preparing or
  opening WhatsApp is not sending. Each action records its result; missing permission/evidence
  explains the missing fact and provides the owning door. Failed saves preserve entered content.
- Return and Repair detail are one continuous workflow. External document preparation/revision
  alone uses 50/50 composition and preview; ordinary viewing stays full-width. Sent versions and
  corrections preserve History and state which version the supplier actually received.
- Return shows exact goods, collect-from location, collection date, handed-over and remaining
  quantities and proof. Partial collection changes only those Units. Document issue never moves
  Stock. Consignment goods use Consignment Returns rather than Purchase Returns.
- Repair shows exact original Unit, repair requirement, outbound proof, expected-back date,
  actual return and inspection result. A different returned Unit, failed repair or new damage
  records an exception and requires an authorised outcome; it cannot silently complete the repair.
- Physical return completion and supplier recovery remain separate. Where credit evidence is
  required, goods may show Collected while the Claim retains the outstanding recovery obligation.
  Finance owns the credit evidence/financial processing; Purchasing displays it read-only.
- Supplier refusal, missing reply, partial collection and late return retain the outstanding fact,
  owner and governed date. No generic status dropdown substitutes for completion evidence.
- Acceptance: a cover employee can identify the goods/problem, supplier response, authorised
  decision, current holder/location, outstanding action/owner/date and required completion proof
  without reconstructing the story from WhatsApp. Stock remains the physical-truth owner.

### 9.6 Purchase Returns

**Owner-confirmed UI — 2026-09-18. BUILT + DEPLOYED 2026-09-19; MIGRATION 0548 APPLIED
2026-09-20; AUTHENTICATED EMPTY-REGISTER READBACK 2026-09-24, RECORD LIFECYCLE STILL OWED.**
The approval covered layout, labels and inspection interactions; sample parties, dates,
quantities and document references are illustrative, not verified business data. It approved
no new custody engine and no claim production verification, and the build added neither.

**Build record (2026-09-19).** Storage: migration `0548` — `purchase_returns` +
`purchase_return_units`, RLS read-only to internal roles, no write policy on either table.
Read: `GET /api/operation/purchase-returns` (`?claim=` narrows to one Supplier Claim). Screen:
`OperationPurchaseReturns` on the shared DataGrid + 240px FilterRail; the door is live in the
Purchasing rail under PROBLEMS at `/operation?tab=purchase-returns`. Words, confirmed column
order and rail predicates live once in `packages/shared/src/purchase-return.ts`, so the screen
and the dictionary cannot drift. Verified: the whole migration chain replayed on a local
PostgreSQL 16 (the five known baseline failures only) and the guards proven in rolled-back
transactions — a claim without an agreed `Return to Supplier` outcome refused, `problem`
evidence refused, supplier receipt without a pickup refused, a collector without a pickup
refused, the same Unit twice refused, and **zero `ops_stock_items` rows touched by issuing a
return**. Walked in Chromium at 1440 / 1180 / 820 / 390 and at 200% zoom: the confirmed column
order at every width, no page-level horizontal scroll, no clipped cell.

**DEPLOYED 2026-09-19.** Merged to `main` as **`7e9e7c37ebb50e034044b9a3d2aa80ceb436609c`**
(#1478) and deployed by `deploy-production.yml` run 35445362214. That run's `pnpm ci:smoke`
printed `Production converged to 7e9e7c37…` for all five canonical surfaces:
`carres-portal.pages.dev` · `carres-pos.pages.dev` · `erp.carresofficial.com` ·
`pos.carresofficial.com` · `api.carresofficial.com/health`. **The runner's fetch is the
evidence; the build session could not repeat it** — its egress proxy answers
`connect_rejected` to those hosts, so no independent re-fetch backs this row. It is a SHA
convergence proof and nothing more, exactly as §9.2's row states for the same reason.

**MIGRATION 0548 APPLIED 2026-09-20**, through the governed `apply_migration` path, tracker
row `20260920084605`. Verified on production after the apply: both tables exist, RLS is ON with
**one SELECT policy each and no write policy**, `purchase_return_units` has no quantity column,
the evidence guard trigger is armed, `anon` cannot execute the issue door and `authenticated`
can, and **zero rows were created** (red line 8: the file asserts no row count and wrote none).

**The negative controls were run on production as a real active `operation` user inside a
rolled-back transaction**, exactly as §5 of ENGINEERING requires. All three fired: a claim with
no agreed `Return to Supplier` outcome was refused (`outcome_not_return_to_supplier`), `problem`
evidence was refused (`problem_evidence_belongs_to_the_supplier_claim`), and a supplier receipt
with no pickup was refused. The happy path issued exactly one Unit row, pickup proof was
accepted, and **`ops_stock_items` was not touched** — §7.4's rule proven on production, not
assumed. A fourth control fell out for free: the MCP's own roleless connection was refused
`not_purchasing`, which is 0500's law holding. Afterwards: 0 return rows, 0 Unit rows, 0 probe
purchase orders, 0 probe claims, 0 probe tracker rows, sequence still at 1001.

**⚠️ THE APPLIED TEXT IS NOT BYTE-IDENTICAL TO THE COMMITTED FILE, AND THAT IS A KNOWN DEBT.**
`apply_migration` takes inline text, not the file's bytes, so the applied statement is a
transcription with the non-ASCII comment art (`⭐ § ─ ⛔`) normalised and the long explanatory
comment blocks condensed. **Every statement, identifier, constraint, guard, grant and assertion
is unchanged** — the file's own sanity block ran as part of the apply and would have aborted it
otherwise, and the catalog was then read directly. The numbers, so a later chat reconciling can
tell this apart from a rogue apply rather than opening a P0:

```
committed file   22,730 bytes   md5 4f9432d77f728e236cd7c901becea219
applied text     11,684 bytes   md5 6407e93f78687c2439d47856e8d77203
```

`md5(prosrc)` of `purchasing_issue_purchase_return` and
`purchase_return_evidence_purposes_allowed` will likewise differ from the file, for the same
reason and only inside comments. Re-applying the exact file is safe whenever a path that can
stream bytes exists — every statement in 0548 is idempotent (`create … if not exists`,
`create or replace`, `drop policy/trigger if exists` then create).

**CREATION DOOR — OWNER-APPROVED (Jess, 2026-09-25; decision list overwritten by the owner ruling
of 2026-09-29) · MERGED (slice C2, #1795);
migration 0609 APPLIED 2026-09-29.** Built: `Record what Carres does next` on the
claim record's Result section (the three supplier-side decisions of §9.5's 2026-09-29 ruling); `Issue Purchase Return` once `Return to
supplier` is recorded — the approved form beside its DRAFT paper, calling the ONE 0548 door
(`purchasing_issue_purchase_return`, re-issued by 0609 with the same signature: claim must be open,
every Unit re-checked by `purchase_return_unit_refusal` and against the `seen` token the form read,
`Return To` read by the door from `suppliers.return_address`, never from the caller; still moves no
stock) through `POST /api/operation/purchase-returns`; `Return document sent to supplier`
(`document_sends` kind `purchase_return`, 0609; the sent state is derived from the ledger and the 0548
column `document_sent_at` is kept and no longer written); `Confirmed Pickup` (append-only
`purchase_return_pickup_confirmations`, evidenced with who confirmed); the full-width PR record at
`/operation?tab=purchase-returns&pr={id}` with `Open PDF`; the money-free PR paper
(`purchase-return-template.tsx`); and four Work rules through their own loader (Workspace §6.1).
**Dependencies still NOT BUILT, named so nobody assumes them:** (1) ~~`suppliers.return_address`
editor~~ BUILT 2026-09-29 (0611): Settings → Purchasing → `Supplier addresses` records each
supplier's `Address` (PO / Repair Order PDF) and `Return address` (this `Return To`) one field at a
time through `purchasing_set_supplier_address`; blank saves nothing recorded (Settings shows a blank
`Return address` as `Same as Address`), and one address is never copied into the other. **OWNER RULING (Jess, 2026-09-29, relayed by the Settings lane) —
MERGED (#1802), migration 0614 APPLIED 2026-09-29:** `Return To`
= the supplier's `Return address` when filled, otherwise its `Address`; Issue refuses only when BOTH
are blank, `Add the address of {Supplier}` (detail `address_missing`). 0614 re-issues
`purchasing_issue_purchase_return` from the 0609 body applied in production with only that change;
the resolved value is still snapshotted onto `purchase_return_units.return_to`, and the Issue form
shows it with `From Return address` / `From Address` under it (words owner-approved 2026-09-30); (2) Stock's Outbound `Return to supplier` handover (Stock §12.8): Stock writer LIVE (0612,
`stock_record_supplier_return_pickup`); Outbound screen pending owner design approval. Pickup proof
files live in the private `issue-evidence` bucket under `purchase_return/<id>/…`; (3) `Supplier
Received Date` — `Record supplier receipt` MERGED (#1802),
migration 0614 APPLIED 2026-09-29: on the PR record's Pickup block, date (not future, not before
that Unit's Actual Pickup Date), exact Units (partial allowed, each once), supplier evidence (photo /
video / PDF under `purchase_return_receipt/<id>/…`, or `Who confirmed` + `When they confirmed` +
`Time`), recorder. Append-only `purchase_return_supplier_receipts` + `…_receipt_units` through
`purchase_return_record_supplier_receipt`; it writes no pickup, no custody and not the 0548 column
`supplier_received_date`, which is no longer read — the register and record read the ledger. A Unit
Stock has not picked up is refused `{Unit ID}: Not picked up`. No Work item: §9.6 names none; (4) the
evidence viewer for Pickup proof and Supplier receipt proof — MERGED (#1802): the Units
table's `Photo 1` / `Photos {n}` / `Video {n}` open the shared SavedEvidenceViewer through `GET
/:id/evidence`; a PDF receipt is counted in History (`Evidence {n}`), never as a photo.
**Build decisions that read like business rules — PROPOSAL / NOT LAW (2026-09-29):** (h) a Unit is
received once; a wrong receipt has no correction door (none is approved), falsified by one owner
sentence; (i) `Record supplier receipt` is open to any active Operation person (the 0548/0609 gate),
like send and pickup confirmation. The approved
chain lives on the ONE claim record, both ways to the same facts:

```text
From Work:    `Issue the purchase return to {Supplier}` → claim record
From module:  Supplier Claims → Supplier Claim No → the same record
Chain:        Supplier reply (§9.5) → `Record what Carres does next` → `Issue Purchase Return`
              → send (shared send area) → Confirm tomorrow's pickup → Outbound handover (Stock)
              → Supplier Received Date
```

- **`Record what Carres does next`** on the record's Result section — **OWNER RULING (Jess,
  2026-09-29)**: the three supplier-side decisions `Return to supplier` · `Repair` · `Replacement`,
  which are the claim's Authorised Outcome (§9.5, same ruling; storage and door there). The four
  customer movements belong to the related Service Case. PO Duty, dated cover or Operations
  Superuser only, through the Shared Duty Resolver; locked once its execution document exists.
- **`Issue Purchase Return`** appears once `Return to supplier` is recorded and calls the 0548 door
  through a new API route (no second SQL writer). The form: `Units to return` (only this claim's
  held tracked Units; counted goods are claimed, never returned by document) · `Pickup Location`
  (defaults from each Unit's current Stock Location; editing moves nothing) · `Return To` (the
  supplier's recorded `Return address`, otherwise its recorded `Address` — owner ruling 2026-09-29;
  both blank → `Add the address of {Supplier}`; never typed by the caller) · `Confirmed Pickup` (optional at
  issue). Issue writes the PRTN row and its Units and moves no stock. A Unit changed under the
  form is refused by name; `No return was issued.`
- **Sending** uses the shared document send area (`Return document sent to supplier`; the
  document-agnostic send ledger §9.7 requires); 50/50 during issue/revision, full width after.
- **Pickup:** one Office working day before `Confirmed Pickup Date`, Work
  `Confirm tomorrow's pickup · {Supplier}` (same rule as the PO day-before check); a passed date
  with nothing collected reads `Pickup missed · Follow up supplier`. The physical handover is
  Stock's Outbound `Return to supplier` (Stock §12.8) — collector, time, exact Units, proof —
  read here as `Not picked up` · `Partly picked up` · `Fully picked up`. `Supplier Received Date`
  is recorded from supplier evidence; fully picked up never implies it.
- **Record states:** `What Carres does · Not recorded` → `What Carres does · Return to supplier` (Issue available) →
  `Sending not confirmed` → `Return document sent · {channel} · {date}` → `Pickup date not
  confirmed` / confirmed → picked-up facts → `Supplier Received Date`. **`Sending not confirmed`
  replaces the ruling's `Return document not sent` (build decision 2026-09-29, resolving the §9.7
  conflict note):** absent ledger evidence means the Portal has no record of a send, not that nobody
  sent the paper — the PO/RO family word, reused unchanged. Same change on the register rail.
- **Responsive:** ≥1180 form + PDF side by side; 820/743 stacked, PDF below; 390 full width, one
  Unit tick per row, 40px bottom actions.
- **Build decisions that read like business rules — PROPOSAL / NOT LAW until the owner reviews
  them (2026-09-29).** Each is the narrowest reading the build needed; each is overturned by one
  owner sentence. (a) Once a Purchase Return is issued, the claim cannot be moved off `Return to
  supplier` (`purchase_return_issued`) — no approved cancel/void exists for a PR. (b) `Issue
  Purchase Return` and the send / pickup-confirmation doors are open to any active Operation person
  (0548's gate, unchanged); only `Record what Carres does next` is PO Duty only (Shared Duty
  Resolver). (c) A Unit whose
  claim hold was released reads `Hold released` and is not offered ("this claim's HELD tracked
  Units"). (d) A Confirmed Pickup date in the past is refused, and a confirmation must say who
  confirmed (`Who confirmed`). (e) The day-before check closes only on a confirmation for that date
  recorded on or after the day before; a date confirmed at issue is re-checked. (f) `Pickup missed`
  reads only when NOTHING was collected (the ruling's words); a partial pickup after the date raises
  no Work. (g) The PR paper prints Supplier, Return To, PR details and the Units table; it prints no
  `Reason` box (the claim note may hold internal fault review, §9.5 claim pack exclusions).

**Authenticated readback — 2026-09-24, existing register only.** On production
`893b7f33d54ecd3c0ab51755d6d98d09f47407d2`, principal opened Purchase Returns from its
existing route. Loading resolved to `No purchase returns.` and `0 returns · 0 Units`,
not an error or fabricated records. The four governed rail groups and confirmed column
order were present; Hide/Show filters and Search opened normally. At 390×844, document
scroll width was 390px. The open 240px rail left too little table space; using the existing
Hide filters control made the empty message and footer readable, and the desktop rail
state was restored afterwards. This is not populated-row, pinning, evidence, permission,
issue, pickup or supplier-receipt proof. No return, Unit or custody event was written.

**Purpose / source:** return Carres-owned purchased goods only after an approved claim/outcome.
No blank `+ New`. Keep the existing Claim → Purchasing authorisation → Stock physical pickup
ownership chain (§7.4 and Stock MASTER §12.8). Issuing the document does not move stock.

**Main columns, in order:** expand arrow → PR Doc Date → PR No → Supplier → Supplier Claim No
→ Category → PO No / Unit ID → GRN No → Items → Qty → Pickup Location → Return To
→ Confirmed Pickup Date → Collected By → Collected Qty → Actual Pickup Date
→ Supplier Received Date. Category immediately precedes the combined PO No / Unit ID cell.
Visible purchase-return references use `PR-`, not `PRTN-`; this is display vocabulary, not
permission to migrate stored identifiers. PR Doc Date is the document date, not goods movement.

**Identity / expansion:** PO No on line one, Unit ID on line two in the same cell. Multiple
Units expose the count as the expansion entry. Items shows the model and its specification on
line two. Expanded columns: Category → PO No / Unit ID → Items → Qty → Pickup Location
→ Return To → Collected By → Actual Pickup Date → Supplier Received Date → Evidence.
One tracked Unit per expanded row, Qty 1; never combine two physical Units into one evidence row.

**Dates and places:** Pickup Location is where goods are collected; Return To is the recorded
supplier-designated destination, not an assumed registered address. Collected By identifies the
actual collector. Confirmed Pickup Date, Actual Pickup Date and Supplier Received Date are
separate facts. Fully picked up does not mean received by the supplier. Unknown facts remain
explicitly unrecorded; never fabricate dates, collectors or receipt evidence.

**Left rail — owner-confirmed latest preview:** Supplier → Return document → Pickup → Evidence.
Reuse Supplier Claims' rail composition, section icons, spacing, width and active state.
Supplier is a visible list of supplier names with right-aligned matching PR counts, not a dropdown
(e.g. illustrative `Hookka 2`, `Ohana 1`). Click to filter; click again to deselect. Supplier
combines with the operational condition and search; counts respect the other active dimensions.
Return document: `Sending not confirmed` (was `Return document not sent`; changed 2026-09-29 with
the creation door, see Record states). Pickup: `Pickup date not confirmed`, `Not picked up`,
`Partly picked up`, `Fully picked up`. Evidence: `Pickup proof missing`.
Counts count matching PR documents, not Units; conditions may overlap. These are factual filters,
not new stored states. Date-range and Pickup Location rail sections discussed as possibilities
were not in the confirmed preview; do not silently treat them as approved additions.

**Evidence:** per-Unit inspection separates Problem evidence (linked claim), Pickup proof and
Supplier receipt proof. Compact icon + text photo/video actions; no large pills or unnecessary
row-height increase. Expand evidence on request. Use the shared read-only viewer target for
photo zoom/pan/reset/navigation and video playback/fullscreen. Never label damage photos as
pickup or receipt proof. Viewer and real evidence wiring require build verification.

**Shared UI / scope:** flat register, sticky opaque column header; do not invent status groups.
Use the shared field-width registry and kit geometry, not page-specific width standards.
No Finance, Credit Consequence or Work column. Do not use Handover/Handover proof as this
register's labels. The underlying custody rules remain governed by Stock. Full-width record
view; 50/50 remains reserved for issuing/revising. No application build is claimed by this ruling.

### 9.7 Repair Orders

**Owner-confirmed business blueprint — 2026-09-18; price/approval and owner-consent rulings 2026-09-19. SLICE A DEPLOYED (#1757, 0602 APPLIED); SLICE B (PDF + Work) MERGED (#1773); the rest APPROVED TARGET / NOT BUILT.**

#### Build state — slice A merged #1757 (0602 APPLIED); slice B on branch `build/repair-orders-pdf-work`, 2026-09-29 (no migration)

| Built on the branch | Where |
|---|---|
| `repair_orders` (RO No minted at CREATE through `allocate_formal_document_code('RO', id)`; RO Doc Date = KL business date, immutable; supplier, optional Claim, Cost Responsibility word, optional price where NULL is unknown, pickup and return Site, evidenced Supplier receipt with the snapshotted target, period and calendar, cancel facts) · `repair_order_units` (one exact Unit per row, problem from `unitProblemChoices`, sentence ≤300, Repair Requirement, evidence by path; a partial unique index is the "no duplicate active repair" rule) · append-only `repair_order_supplier_replies` and `repair_order_owner_consents` · `purchasing_settings.repair_return_working_days` (default 14). Internal read RLS, no write policy | `supabase/migrations/0602_…sql` |
| Doors (operation/principal): `repair_order_create` (refuses BY NAME: `Reserved for {SO No}` · `On {DO}` · `Delivered` · `On {Claim No}` · `Not received` · `This Unit is on the road` · `Waiting inspection` · `Already on {RO No}`; Carres Sites only, PJ Showroom included; idempotent on request id) · `repair_order_issue` · `repair_order_record_supplier_receipt` · `repair_order_record_supplier_reply` · `repair_order_record_owner_consent` · `repair_order_cancel` (before pickup only; a planned pickup is cancelled in Stock first) · `repair_order_eligible_units` (the Add Units list with the same refusal words) | 0602 |
| 🟢 Conflict 1 resolved: a `repair-return` arrival source may name `repair_order_id`; it then WEARS the RO's `ro_no` and mints no second number. 0490's physical checks are unchanged; the legacy Claim/Case path keeps minting (existing identities are permanent) | 0602 `arrival_source_create` (rebuilt from the 0560 body, verified identical to production) |
| 🟢 Conflict 2 resolved for RO: `document_sends` (kind · id · version · recipient · channel · actor · time · confirmed). **PO keeps `po_sends`; PO, PRTN and CO move onto `document_sends` in their own scopes** | 0602 |
| Carres return target = 14 OFFICE working days (Mon–Fri + the shared Malaysian holiday set) from the KL date of evidenced Supplier receipt, computed once by `repairOrderReturnTarget` (shared working-day engine); the door refuses a target outside the governed period and snapshots period + calendar name | `packages/shared/src/repair-order.ts`, 0602 |
| API `/api/operation/repair-orders`: register, `/:id` (id or RO No), `/options`, `/eligible-units`, `/:id/evidence` (signed on open), create, issue, supplier-receipt, supplier-reply, owner-consent, cancel | `apps/api/src/routes/operation/repair-orders.ts` |
| Web: live sidebar row; the 17-column register, ▸ per-Unit inspector, five-group rail, footer and states; the RO object page (route, CURRENT ACTION with one door per stop in the approved words, Repair order, Goods, Supplier reply, Owner consent, History); Create Repair Order (Carres Sites + disabled `Dealer`, Add Units drawer with refusal words on the row, per-Unit problem/photo/sentence/requirement, Supplier, Cost Responsibility, optional Price, grey automatic RO Doc Date and pickup location). Evidence opens the kit `SavedEvidenceViewer` | `OperationRepairOrders.tsx`, `RepairOrderObject.tsx`, `RepairOrderCreate.tsx` |
| **Goods sent for repair cannot be promised (owner, 2026-09-28).** `repair_order_create` puts each Unit `In repair` through Stock's governed flag door `ops_stock_flag_repair` (`needs_repair`), which every sell path already honours (`unit_availability` → not available; pool draw, bind and Use this PO refuse it). No custody is written. The same door lifts it when the repair ends for that Unit: the RO is cancelled, the Unit is removed before Issue (`repair_order_remove_unit`; the last Unit cannot be removed, cancel instead), or its return inspection is recorded (Stock's `ops_stock_resolve_unit_hold`, observed by a trigger). A Unit already `In repair` outside an RO is refused by name | 0602 |
| `Repair Quotation`: photo or PDF, recorded at create or once later on the object (`repair_order_record_quotation`); the upload slot admits PDF for the `repair_quotation` purpose only and the `issue-evidence` bucket admits `application/pdf` | 0602, `routes/ops/issues.ts` |
| Pickup: the `Hand {n} Units` door opens Stock's arrival-source form with `?ro=`; the pickup itself is Stock's existing `arrival_source_handover` (the ONE custody writer) and the return is Receiving's `receiving_arrival_post` with a GRN — proven end to end on a replayed chain | `ArrivalSourceWorkspace.tsx`, integration test |
| **Slice B · the A4 `REPAIR ORDER` — MERGED (#1773).** PO chrome (full header every page, `RO…(n)` hero); Supplier · Supplier Pickup/Return Location · RO Details (`Supplier Claim No` only when present); `Reason` box = each Unit's recorded sentence verbatim; goods `Category · PO No / Unit ID · Items · Qty · Problem · Repair Requirement` + `TOTAL`; `DAMAGE PHOTOS · {Unit ID}` pages (4 per sheet) from the Unit/Claim evidence read through; no photo = one sentence. Payload `GET /:id/print-data` carries no figure; Cost Responsibility is omitted from the supplier paper (DOCUMENT-KIT §4 names goods, never value). Object header `Open PDF`; Issue is the 50/50 with the paper | `repair-order-template.tsx`, `repair-order-pdf.ts`, `RepairOrderObject.tsx`, `repair-orders.ts` |
| **Slice B · Work — MERGED (#1773).** `repairOrderWorkItems` projects four rules into the ONE feed (PO Duty, Office calendar, deep link = RO object): `repair_order.issue` (due next Office working day after RO Doc Date; closes on confirmed send) · `repair_order.confirm_receipt` (due next Office working day after the send; closes on evidenced receipt) · `repair_order.return_date_passed` (opens the day after the Carres target; closes only when every Unit is back on a posted GRN or the RO is cancelled; a Supplier reply never closes it) · `repair_order.owner_consent` (no date; closes on `given` for every non-Carres Unit, refusal keeps it open). The 0584 Completed writer wraps issue, supplier-receipt, owner-consent, cancel and Receiving's arrival post. Route: the `Returned` stop is grey while the Supplier holds the goods, `Missed` after the target | `repair-order-work.ts` (shared + api), `work.ts`, `warehouse-receipts.ts` |

**Owner rulings on the slice A report (2026-09-28):** pickup only from Carres Sites (accepted); a
Unit on an active RO is NOT sellable (decision 1 rejected, built as above); the held-for-inspection,
reply-reason, optional-photo, receipt-version, Claim-origin and consent-outcome decisions accepted.

**STOCK DEPENDENCY — the Supplier as the pickup party.** `arrival_sources.party_id` must be an
active Stock operating party (`stock_operating_parties`), and a repair Supplier is not one, so today
staff record the carrier who actually collects. When the Supplier collects in person, Stock must
admit the Supplier (or a supplier-party kind) as a party; Purchasing does not write that list.

**Remaining, in dependency order:** a
Claim-held Unit's release when its Claim hold ends without `hold_released_at` · Dealer as a Site
(Stock §12.9) · the Settings row for the 14-day period · PO/PRTN/CO onto `document_sends`.
This replaces the restriction that every RO must originate in a Supplier Claim and the blanket
ban on creating an RO. It approves a stock-linked repair commission, not a source-free document.
The draft HTML is illustrative; unreviewed rail wording and layout additions are not approved
merely because they appeared there. No application implementation or deployment is claimed.

**Purpose:** commission a selected Supplier to repair identified existing goods, record the agreed
scope and cost responsibility, and follow the same Units out, back and through inspection.
Supplier Claim addresses alleged supplier responsibility and its agreed outcome; RO executes a
repair commission. A Claim does not prove fault has been admitted. An RO does not imply either
free warranty service or a charge to Carres. Supplier may differ from the original PO supplier.

#### Creation sources and eligible goods

1. **Direct inventory repair:** `Create Repair Order` on this register, or the linked action on an
   inventory Unit, opens selection of existing Units. Supplier Claim is not required.
2. **Claim-linked repair:** an authorised repair decision opens the same RO flow with the Claim,
   exact Units, requirements and evidence prefilled. Retain the source links; do not ask staff to
   report the same problem again. Creating or issuing RO does not itself close the Claim.

Eligible selection locations include **Warehouse, Showroom and Dealer**, including **Display**
goods. Display is a use of the goods, not a separate ownership class. Showroom/Dealer are actual
recorded locations, not proof of ownership. This is not permission to commission repair for any
untracked product owned by a dealer or customer.

Select existing, accessible Unit records; do not type a product into an RO and thereby invent
stock. Bring in Category, Items/configuration, original PO/source, Unit ID and current recorded
Stock Location. If an original PO is absent, retain the genuine source and missing-reference fact;
never fabricate a PO. The selected repair Supplier does not rewrite the original purchase source.

Carres-owned stock follows normal stock and operational authority; the price/approval boundary below
does not add a financial gate to placing an RO. For consignment or other non-Carres-owned goods,
record the actual owner, consent evidence when obtained, and cost responsibility without presuming
agreement. **Owner ruling B — 2026-09-19: missing owner consent does not block RO Issue.** Staff
may issue first; retain an outstanding owner-consent follow-up on the RO, projected into the one
Workspace Work engine. Issuing does not mark consent obtained, transfer ownership, accept charges
or complete that follow-up. Do not silently treat supplier-owned Display goods as Carres assets.
Sold/reserved,
held, already-out, or already-in-repair Units require the owning workflow's eligibility checks;
selection must not bypass commitments, controls, permissions or create duplicate active repair.
A photo or free-text item is not a substitute for a real Unit. Untracked/count-managed repair is
not admitted by this exact-Unit blueprint; resolve identity in the owning inventory process.

#### Required record and location meanings

| Field / fact | Meaning and source |
|---|---|
| RO Doc Date / RO No | RO Doc Date is system-set to the current Malaysia business date on document creation, read-only to staff; backdating is forbidden (owner correction 2026-09-20). Preserve the actual date of an existing record; viewing it later never restamps it. Governed RO identity; not the pickup date. Follow the existing number-allocation policy; do not invent a sequence in the UI |
| Supplier | Supplier accepting this repair commission; selected independently of the original seller |
| Supplier Claim No | Optional related Claim; prefilled for Claim-origin repairs, empty for direct inventory repairs |
| Category / PO No + Unit ID / Items / Qty | Existing goods facts; PO on line one and Unit ID beneath in one cell; model then configuration; one tracked Unit per detail row, Qty 1 |
| Repair Requirement / Problem | Observed fault, required repair and expected result, attributable to each Unit |
| Evidence | Per-Unit photos/videos with their source and purpose; retain existing Claim evidence links |
| Supplier Pickup Location | Recorded place from which these goods are to be collected for repair; default from the Unit's actual Stock Location |
| Supplier Return Location | Intended place to receive the goods after repair; can differ from pickup location; not evidence of receipt |
| Expected Return Date | Supplier-reported return date with provider/evidence, distinct from the Carres return target below; never guessed and never an automatic extension |
| Price / Repair Quotation | Optional price or supplier quotation recorded during creation or in RO detail; unknown is not RM0. Recording a price is neither expense approval nor payment |
| Cost Responsibility | Recorded responsibility and supporting agreement; a Claim link never proves the supplier will pay |
| Approval | If a decision requires approval, Jess alone approves; retain the actual decision, scope and time. No substitute approver or Buddy may approve for her. Financial approval is not a placement/Issue gate |

Supplier Pickup Location and Supplier Return Location apply equally to Warehouse, Showroom and
Dealer sites. Record actual collector/carrier separately; these labels do not require the supplier
to transport personally. Changing a planned location never moves a Unit or overwrites Stock's
current-location fact. A pickup-location mismatch must be resolved against actual custody.
Do not add `Repair Location`: this register does not track where the supplier performs the repair.

#### Return target and Supplier replies — owner correction 2026-09-20

**APPROVED TARGET / NOT BUILT.** Carres sets a default of **14 working days from the
Supplier receiving the Repair Order document**. This is not receipt of the goods, RO creation,
Issue/send time, pickup time or a Service Case deadline. The governed setting supplies the period
(`Settings → Purchasing → The other numbers → Repair return target`, `{n} working days`, 1 to 90; BUILT
2026-09-29, migration 0603 opens its write door; each RO keeps the value that applied at its receipt);
staff do not type the target on every order. Record evidenced Supplier receipt of the specific RO
version, the received date/time, source and actual recording actor. Sending/downloading alone
cannot prove receipt. Until receipt is recorded, show `Awaiting Supplier receipt of RO`; do not
invent an anchor or a due date. Calculate the target automatically using the admitted working-day
calendar and preserve the source, setting/calendar version and computed target. No calendar
configuration has been verified for this standalone RO flow: choosing the governing calendar and
counting convention remains explicit build-admission work, not a claim that a live setting exists.

Keep the original Carres target separately from `Supplier Expected Return Date`. The Supplier
may report one month or longer, including fabric/material shortages. Staff record its date, reason,
reply evidence and actor/time; retain previous replies and affected Units. A Supplier reply does not
silently extend the Carres target, erase overdue work or change a related Case deadline. If no
concrete date is provided, retain `Supplier date not reported` and the follow-up; do not invent one.
Guide staff through `Record Supplier reply`, selecting a reason and entering the reply reference,
rather than exposing an unexplained date box. The exact form layout remains a review proposal.
An authorised extension process is not established by this ruling; do not invent its approver.
Workspace consumes the same RO-owned receipt/target/reply facts through its existing Duty and
calendar admission, without creating a second repair task system or financial gate.

#### Price recording, approval and issue

**Owner ruling — 2026-09-19, APPROVED TARGET / NOT BUILT.** Staff may write down the price
when placing a Repair Order. `Price` is optional in RO creation/detail; an absent price remains
unknown, never RM0. Retain its supplier quotation/source when available and preserve changes.
The register gains no price, quotation-amount or financial column.

Purchasing places and follows the repair commission; Finance owns financial processing and
payment. Missing price, an incomplete quotation, unpaid charges or pending financial approval
must not stop placing or issuing the RO. Recording a price, placing the RO or sending its document
is not automatic acceptance of supplier charges, expense approval or payment. If an approval is
needed, **Jess alone approves**, through her governed personal identity; no other Purchasing
Approver or Buddy may substitute. This is the RO-specific ruling, not a change to Manual Purchase
or PO approval policy. Do not invent amount thresholds or a compulsory approval for every RO.
Record any required financial decision separately without making it a Purchasing placement gate.

A changed price or supplier request for payment remains a recorded proposal until the required
Jess decision exists; preserve the old price, new proposal and decision. If Supplier pays, retain
its evidenced agreement. If the supplier rejects liability and proposes paid repair, retain its
reply and original Claim history; neither the Claim nor the RO automatically accepts the charge.
Outstanding Claim matters remain governed by §9.5.

This financial separation does not waive exact-Unit identity, ownership recording,
reservation/hold/duplicate-repair checks, authorised Claim repair scope or operational permissions.
Missing owner consent is handled by the non-blocking Issue follow-up above, not an Issue refusal.
This ruling changes document Issue; it does not itself authorise physical handover, waive the
existing Outbound/Stock controls or establish a new transport policy.

Issue uses the shared formal-document flow: staff actually send the document and record version,
recipient, channel, actor and time. Generating/downloading PDF proves neither sending nor supplier
acceptance. Preserve sent revisions and corrections. Price recording is not a second financial
ledger; payment, balance and credit processing remain in Finance, outside the register.

**THE DOCUMENT CARRIES THE REASON AND THE PHOTOGRAPHS — owner, Jess 2026-09-23.**
The issued Repair Order prints a `Reason` box saying what is being repaired, and the
damage photographs on a page of their own after the goods table, laid out as the PO lays
out a sofa set. Warehouse, driver, supplier and operation read one paper and see the same
thing. The pictures are the source Claim's and the Unit's own evidence, read through —
never a second upload against the document — so paper and screen cannot disagree. The
paper stays money-free (`../pdf/DOCUMENT-KIT.md` §4); rules and layout live in
`../pdf/DOCUMENT-KIT.md` §3 rules 11–12.

#### Physical execution and completion

Outbound records exact Units actually handed out, actual recipient/collector, time and evidence.
Document issue never moves inventory. Track the expected return and evidenced changes. Receiving
records actual returned Units, receipt date, receiving location and evidence through the one receipt
engine; the expected destination is not substituted for the actual one. Inspect the returned goods,
record actual inspector, date, result and supporting media before restoring availability.

Repair retains the original Unit ID. A different replacement is a linked replacement with a new
identity, not a repaired original. Partial return/inspection completes only the actual Units; keep
remaining quantities and dates visible. Failed repair, new damage, refusal, cancellation or inability
to repair needs its owning authorised outcome. Closure does not erase stock obligations or restore
availability. A supplier saying the work is finished is not receipt or inspection evidence.

#### RO object page — owner approved 2026-09-28 (Jess "yes"). APPROVED TARGET / NOT BUILT.

References mined: Odoo Repairs (progress header Draft → Confirmed → Under Repair → Repaired; a
per-line warranty/cost flag), SAP S/4 repair order (return, repair and inspection as separate
steps) and Carres's own PO object page (§9.3, owner-approved 2026-09-25). Kept: the route header
and per-Unit inspection. Rejected: Odoo's parts/quotation table (price is never a column or gate,
2026-09-19 ruling).

```text
Repair Orders / {RO No}                                   [Open PDF]
{document state} · {Supplier}
ROUTE  Issue ── Supplier received RO ── Picked up ── Returned ── Inspected
       Carres return target: {date} | Awaiting Supplier receipt of RO
CURRENT ACTION   line one · line two · ONE primary button
Repair order     Supplier · Supplier Claim No · Cost Responsibility ·
                 Supplier Pickup Location · Supplier Return Location · Price
Goods            PO No / Unit ID · Items · Problem · Evidence   (one row per Unit)
Supplier reply   [Record Supplier reply] · Supplier date not reported | Supplier Expected Return Date
Owner consent    only for non-Carres-owned Units · [Record owner consent]
History          Today · Yesterday · Earlier
```

Shared `Block` + `Fact` card grammar (§8.2, ONE KIT LAW); full-width; only Issue/revision uses the
governed 50/50 preview. The CURRENT ACTION block walks the route, one primary button at a time:

| Stop | Line one | Line two | Door |
|---|---|---|---|
| Not issued | `Send {RO No} to {Supplier}` | `The 14 working days start when {Supplier} receives it.` | `Issue repair order` |
| Issued, receipt not recorded | `Ask {Supplier} to confirm they received {RO No}` | `Target starts when they confirm.` | `Record Supplier receipt` |
| Waiting for pickup | `Hand {n} Units to {Supplier}` | `Warehouse records who collected them.` | opens Outbound |
| Out for repair | `Waiting for {Supplier} to return {n} Units` | `Carres return target {date}` | `Record Supplier reply` |
| Returned, not inspected | `Inspect {n} returned Units` | `Available again only after inspection.` | opens Receiving |

Workspace path: each stop is the same fact projected as a Work card for the RO follow-up Duty;
the card opens this page; completion is the owning fact (evidenced Supplier receipt, Outbound
handover, Receiving GRN, recorded inspection) — never a manual tick and never a Supplier reply.
Photos and video open the kit `SavedEvidenceViewer` (the same one Supplier Claims and Receiving use).

#### Create Repair Order — owner approved 2026-09-28 (Jess "yes"). APPROVED TARGET / NOT BUILT.

References mined: Shopify Returns (select items → reason per item → confirm), Odoo Repairs (pick the
serial-tracked product, then supplier and who pays) and Carres's own Warehouse `Report a problem`
(shipped: `What did you see?` choice grid, photo, one sentence). Kept: per-Unit reason after
selection, and the SAME problem choices as `unitProblemChoices` (`Damaged` · `Missing component` ·
`Something else`) — no second vocabulary. Rejected: Odoo's parts/quotation table.

```text
Create Repair Order                                   [Cancel] [Save repair order]
1 Goods      Choose where the goods are now: Carres Klang | Showroom | Dealer
             [Add Units] → Tick the Unit ID on each item to send for repair
             per Unit: What did you see? · Photo · What happened, in one sentence ·
                       Repair Requirement
2 Repair     Supplier · Cost Responsibility (Not decided | Carres pays | Supplier pays) ·
             Price (optional) · Repair Quotation (optional file)
3 Locations  Supplier Pickup Location (from the Unit) · Supplier Return Location
```

- Only real Units are selectable. A reserved, sold, held, out or already-in-repair Unit cannot be
  ticked and says why on the row (`Reserved for {SO No}` · `Already on {RO No}` · the Stock word).
- A Claim-origin RO arrives with Units, problem and evidence prefilled by reference; nothing is
  re-entered or re-uploaded.
- `RO Doc Date` is set by the system. `Save repair order` mints `RO No` (the commission owns the
  number; the return leg references it — §9.7 conflict 1) and opens the RO object page, where
  `Issue repair order` sends it.
- Missing price saves and issues; it prints `Not recorded`, never RM0.
- PJ Showroom is already a governed Site (`warehouses` kind own, measured 2026-09-28), so Showroom
  selection opens now. A Dealer is not a Carres Site (§7.4a: dealers buy their display), so
  `Dealer` is drawn disabled with `Not available yet`; moving a display Unit out still waits for
  Stock's `Transfer` form (Stock §12.9).

#### Register, detail and shared UI

**OWNER-CONFIRMED REGISTER UI — Jess, 2026-09-20. APPROVED TARGET / NOT BUILT.** This closes the
"remaining exact filter copy and layout require a fresh preview" gap left on 2026-09-18 and
supersedes the old §9.7 field/rail list completely. Approval covers the column order, the per-Unit
expansion, the rail and the evidence presentation reviewed in the 2026-09-20 preview. Sample
suppliers, dates, numbers and quantities in that preview are illustrative, not business data. It
approves no application build, no migration and no production claim. The page is `Coming soon` in
the shipped sidebar (`apps/web/src/pages/portal/portal-nav.ts`, measured 2026-09-20).

Keep Repair Orders as a separate register for both creation sources. Supplier Claim opens its
related RO directly. Register expansion is read-only per-Unit inspection; RO No opens the one formal
record. Ordinary detail is full-width; only document issue/revision uses governed 50/50 preview.

**ONE LEADING CONTROL, AND IT IS THE DISCLOSURE.** `▸` only — this register has no batch write
action, so it takes no selection checkbox. Export covers the filtered set. This follows §9.6
Purchase Returns, not §9.5 Supplier Claims, whose `☐` exists for its own Export selection.

**Columns — exactly in this order:**

```text
▸ · RO Doc Date · RO No · Supplier · Supplier Claim No · Category · PO No / Unit ID ·
Items · Qty · Repair Requirement · Cost Responsibility · Supplier Pickup Location ·
Actual Pickup Date · Supplier Return Location · Expected Return Date · Returned Qty ·
Goods Received Date · GRN No
```

The order reads the record then the physical story: document identity → counterparty and source
record → goods → what was commissioned and who bears it → OUT → BACK. Do not rearrange it with a
general heuristic. `RO Doc Date · RO No` lead and pin per UI MASTER §6.7 rule 2; this page is not
the Supplier Claims exception.

- `RO Doc Date` is the document date, never the pickup date. `RO No` is the only door into the
  object; an unissued RO keeps its place, reads `Not issued` with `Sending not confirmed` beneath,
  and still opens on its permanent internal identity.
- `Supplier Claim No` is empty for a direct inventory repair. An absent link prints the governed
  absence, never a word implying a relationship that does not exist.
- `PO No / Unit ID` shows the full PO first and **every actual Unit ID beneath it**.
  Owner correction 2026-09-20 supersedes the earlier `{n} Units` summary: two Units show both
  identifiers directly, without requiring expansion. Keep each ID associated with its genuine PO;
  a missing original purchase source reads `Not recorded`. Never fabricate identities. Allow
  enough row height to show the IDs; the two-line default is not a clipping rule.
- `Items` is model then configuration, with a discoverable item-detail action showing the actual
  affected Unit facts. It does not replace `RO No` as the entry to the full repair record. Exact
  item-detail presentation remains a preview proposal; do not invent specifications.
- `Qty` is the commissioned repair quantity, not a Unit count. No footer quantity total.
- `Repair Requirement` is what the supplier must do; several requirements read `{first} + {n} more`.
- **`Cost Responsibility` is a RESPONSIBILITY WORD, NOT MONEY** — `Carres pays` · `Supplier pays` ·
  `Not decided`. It is admitted because it decides whether goods may leave, and it is the one
  commercial fact on the row. **It is not the price, quotation amount or financial column the
  2026-09-19 ruling excludes**, and it creates no approval or payment gate. `Price` and
  `Repair Quotation` stay in create/detail and never become columns.
- `Supplier Pickup Location` defaults from the Unit's actual Stock Location; a Display Unit prints
  its site with `Display` on the second line. Editing it moves nothing.
- `Actual Pickup Date`, `Expected Return Date`, `Returned Qty` and `Goods Received Date` are four
  separate facts. Fully picked up is not returned; returned is not inspected. `Goods Received Date`
  carries the arrival date and time under the shared dictionary; every record today prints
  `Time not recorded`, because the database holds no arrival clock (§9.3's stated Receiving gap).
- `GRN No` links the return receipt; several read `{n} GRNs`; none reads blank, never zero.

**Optional Columns, default off:** `Collected By` (the actual collector/carrier, also on every
expanded Unit row) and `SKU`. No `Approval`, `Price`, `Repair Quotation`, `Work`, `Finance`,
`Credit` or `Payment` column, and no owner avatar. An approval actor is object history, not a
register column (UI MASTER §6.7).

**Shape and geometry.** Flat register, newest `RO Doc Date` first, one ungrouped list with one
sticky opaque header; invent no status groups, so §6.10's group-local header does not apply here.
Shared 54px two-line listing row, 36px two-line header, 8px cell padding, 1px dividers, 45px
toolbar, 32px footer (UI MASTER §6.8 shared Purchasing geometry). Pin `RO Doc Date` and `RO No` at
canvas ≥768px, `RO No` alone below. **No column is hidden by width**; the approved defaults always
show and the grid scrolls horizontally inside its own container — 17 columns is the deliberate
answer to a document with an out leg and a back leg, and hiding half of it behind Columns would
cost more clicks than the scroll (planner decision, 2026-09-20; owner-reviewed and accepted).
Widths come from the ONE registry (`register-field-widths.ts`), never from this section.
**Footer:** `{n} Repair Orders` · `1 Repair Order` · `{n} of {m} Repair Orders`; documents, never Units.

**Row expansion — the read-only per-Unit inspector, exactly in this order:**

```text
Category · PO No / Unit ID · Items · Qty · Problem · Evidence ·
Supplier Pickup Location · Collected By · Actual Pickup Date ·
Supplier Return Location · Goods Received Date
```

`Problem` and `Evidence` are SEPARATE columns here; this page does not adopt §9.5's merged
`Problem & Evidence` cell. Each individually tracked Unit is one row at `Qty 1` with its own
problem, its own evidence and its own physical dates; quantity-managed goods keep their genuine
quantity on one row reading `Counted stock`. A Unit not yet back leaves `Goods Received Date`
unrecorded — partial return stays visible and is never rounded up to complete. The parent's facts
are not repeated inside its own expansion. The expansion is read-only: no editor, no uploader, no
delete, no status change. It uses §6.9's connected expansion and its 1px connector.

**Left rail — five groups, in this order:**

| Group | Rows |
|---|---|
| `Supplier` | Supplier names with right-aligned matching RO counts, reusing the §9.5/§9.6 list pattern; never a dropdown |
| `Repair order` | `Sending not confirmed` |
| `Pickup` | `Not picked up` · `Partly picked up` · `Fully picked up` |
| `Return` | `Not returned` · `Partly returned` · `Fully returned` |
| `Evidence` | `Pickup proof missing` · `Return proof missing` |

**There is deliberately NO quotation or approval rail group.** A facet reading
`Quotation not recorded` or `Approval not recorded` would present an OPTIONAL fact as a deficiency
and rebuild the financial gate the 2026-09-19 owner ruling removed; missing price is explicitly not
Work. A proposal for one was drafted on 2026-09-20 and withdrawn against that ruling.

**`Sending not confirmed` is the PO family's own word** (COPY, 2026-09-16/17), reused unchanged.
This register never says a document was not sent: absent evidence means the Portal has no record,
not that nobody sent it on WhatsApp. `Repair order not sent` and `PDF not sent` are refused here.
§9.6's former `Return document not sent` contradicted that same principle; it was corrected to
`Sending not confirmed` in Purchase Returns' own round (creation door build, 2026-09-29).

Rail rows are factual predicates with truthful counts, not queues and not stored states. Click to
filter, click again to clear; there is no Clear filters control in the rail (§9.3 owner correction)
— the toolbar's active-condition strip owns that, and it appears only while something narrows the
list. Counts count RO documents, not Units; one RO may match several rows in a group.
🟡 **Facet-count semantics are stated three different ways across §9.3, §9.5 and §9.6.** This page
uses standard facet semantics: a count reflects every OTHER active filter and the search, but not
the selections inside its own group. Converging the three pages on one algorithm belongs to the
shared listing contract in UI MASTER §6.7, not to this section.

Search covers RO No, Supplier, Supplier Claim No, PO No, Unit ID, Items and GRN No.

**Evidence — three kinds, never interchanged:** `Problem evidence` (the original fault; a
Claim-origin RO links the Claim's existing files by reference and never re-uploads them),
`Pickup proof` (what actually left, and to whom) and `Return proof` (what actually came back).
Controls are compact icon + text `Photos {n}` / `Video {n}` — no button, pill, border or permanent
fill, 12px helper size, hover/focus tint only, visible focus ring, `aria-expanded`. Clicking opens
that Unit's evidence directly beneath it; opening one never closes a sibling and never reflows the
rows above. A count is never printed when it is unknown: an unread list reads
`Evidence could not be loaded` + `Try again`, never `Photos 0`, and a kind with genuinely zero
files prints no control. Photos and video open the ONE shared read-only viewer
(UI MASTER §6.8 kit request — it still does not exist and must join the kit before this page is built).

**States, all distinct:** loading · `No Repair Orders yet.` · `No Repair Orders match these filters`
· `Repair Orders could not be loaded` + `Try again` inside the grid with the toolbar intact · no
access · the two evidence failure states above. A failed read is never drawn as zero, and an
unrecorded fact is never drawn as `0`.

**Open and return:** `RO No` opens the full-width object, kept in the URL; returning restores
search, filters, scroll, the open expansion and focus on that `RO No`. Cross-links: `PO No` opens
Purchase Orders, `Supplier Claim No` opens the Claim, `GRN No` opens the Receiving record, a Unit
ID opens Stock.

#### Whole-Portal ownership and Workspace integration

This is one connected workflow, not a standalone repair tracker. Workspace My Work / Team Work
coordinates admitted obligations from the owning records; it does not keep a second RO, quote,
status or stock ledger. Each work occurrence must satisfy Workspace MASTER §6 before build admission:
stable source/rule/occurrence, authoritative trigger/completion, resolved Duty/person and cover,
governed date/calendar, permission, actual-actor history and a direct link to the owning action.
Do not invent a new approval holder or deadline; unresolved ownership remains explicit.

| Portal owner | Repair connection |
|---|---|
| Purchasing / RO | Requirements, chosen Supplier, optional recorded price/quotation and cost-responsibility evidence, authorised operational scope, Issue and supplier follow-up; no financial placement gate |
| Workspace / Staff & Duties | Resolve operational Issue/follow-up owners; any required RO approval belongs to Jess alone, with no substitute approver. My Work/Team Work reads the same source-owned act and its proved completion |
| Inventory / Stock | Select existing Units and actual locations, verify ownership/holds/reservations, retain identity and custody history |
| Outbound / transport | Actual Unit dispatch, collector/recipient and proof; existing delivery/transport records when applicable, no second logistics engine |
| Receiving / inspection | Authorised RO-linked receipt, original identity, partial quantities, actual receiving site and inspection result |
| Supplier Claim | Optional source and supplier-responsibility follow-through; no fabricated Claim for direct inventory repair |
| Finance | Consume authorised cost/source facts for its existing payable/payment process; RO never posts payment or duplicates approval/financial ledgers |
| Linked customer order / Service Case | Preserve any actual reservation/customer relationship and outstanding service obligations; RO completion cannot silently complete a different record |
| Portal history / documents | Trace source, Unit, quote, approval, sent revision, physical movements and actual actors across the linked records |

Potential Work obligations include issuing the RO, following up a recorded return date, and
completing receiving/inspection in the owning module. An optional missing price is not Work.
Any required financial decision belongs to its owning flow and Jess alone; it does not block RO
placement or Issue.
**Owner-consent follow-up — owner ruling B, 2026-09-19; APPROVED TARGET / NOT BUILT.**
For non-Carres-owned Units issued without recorded consent, keep one source-owned outstanding
follow-up, with the affected Units/owner and a direct RO link. Resolve the actual operational
assignee through the existing RO follow-up Duty/cover admission; do not invent a new approver or
deadline. Reissuing the same unresolved scope must not duplicate the task. Recording attributable
owner-consent evidence completes only the covered scope; a partial reply or refusal leaves its
unresolved scope visible for follow-up. Issue, download, return or an ordinary task tick cannot
stand in for consent evidence. Do not create a second repair task store.
A register filter is not itself a Work obligation. Reuse existing stock/receiving tasks rather than
create duplicate RO tasks for the same physical act. Tests must prove permission/cover behaviour,
partial completion, stale-state handling and disappearance of exactly the completed occurrence.
These integrations are approved targets, not claims that Work projections are already admitted.

#### Build implications and validation boundary

Existing migration 0490 repair-return sources require a Claim or Case and are not proof of a formal
RO implementation. Stock/Receiving must accept an authorised direct-stock RO as a governed source
without fake Claims/Cases, while preserving permissions, ownership, exact-Unit identity and receipt
checks. Do not weaken constraints globally or implement independent custody writers.

Build must verify both sources, warehouse/showroom/dealer Display selection, non-Carres owner-consent
pending at Issue without a block, durable/deduplicated consent follow-up and partial/refused consent, Supplier different from original PO supplier, optional/missing price without an Issue
block, price recorded without automatic expense approval, Jess-only approval with no substitute,
pending financial decision without a placement gate, duplicate active repair, partial return,
failed inspection, replacement identity and receipt-source compatibility.
This document authorises the target, not a migration, build-card creation or production rollout.

**The two structural conflicts named on 2026-09-20 (RO No minted by the return leg in 0490; no
document-agnostic send ledger) are resolved by 0602 on the branch — see "Build state" above.**

**Measured, not defects:** `OperationOpsRepair.tsx` is the legacy Stock `needs_repair` queue and
is NOT this register; `ops_stock_items.ownership` admits only `carres_owned` and
`supplier_consignment` (`0366_…sql:117`), so `Dealer` is a LOCATION, not an owner. PJ Showroom is a
governed Site (`warehouses` kind `own`) and is selectable; a Dealer is not a Carres Site (§7.4a,
Stock §12.9).


### 9.8 Display Requests

**COMPANY / SHOWROOM LOCATION AND CONSIGNMENT SCOPE — OWNER-APPROVED / LOCKED;
Jess, 2026-10-02.** A company may have multiple showroom locations. The showroom using the
Portal enters work for its identified, authorised location; company, location and actual
recorder stay distinct. Known company/location facts come from the authorised source and are
carried into the same request Operation continues. Staff do not re-enter those facts for a
second Operation request. Location access does not imply access to every company location;
this ruling does not prescribe shared accounts or replace individual actor/proxy audit.

Consignment display applies to Carres' own showrooms only. They may hold supplier-owned display
goods or purchased Carres-owned goods, with the §7.7 display-only sales boundary unchanged.
Dealers buy goods from Carres; their showroom locations do not receive consignment under this
operating model. A Dealer purchase belongs to the Sales/commercial source, never an internal
Manual Purchase, Stock Transfer or supplier consignment display placement solely because its
destination is a showroom. A company having several locations changes destination and access
scope, not the commercial nature of the transaction. No Dealer credit or new payment/ownership
transition rule is inferred from this clarification.

The same-request handoff and these channel/location boundaries are approved. The independent
module, proposed broader request name, final menu, six-reference-document naming/placement and
external Dealer permissions remain pending whole-Blueprint review. This is PLAN truth, not
application delivery or authority to change existing Unit ownership, provision accounts or
switch external channels. ERP Architecture §2.1 holds the cross-module seam.

**SHOWROOM HANDOFF — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.** Sales negotiates
with the supplier about the display goods, price and conditions; Operation does not negotiate or
set the price. This internal record hands that arrangement to Operation for documentation and
execution. Recording negotiated terms does not bypass existing commercial or Manual Purchase
approval. Detailed action assignment and new screen wording remain under
review; this ruling does not approve the complete Showroom Blueprint or application build.

**SHARED SHOWROOM REQUEST RESPONSE AND PROGRESS — OWNER-APPROVED / LOCKED;
Jess, 2026-10-02.** Carres-owned showroom display requests use the same request communication
standard agreed for Dealer display assistance. The authorised showroom supplies the product,
location, requested action and explanation, with photos/video where needed; existing goods and
known location/source facts are selected or carried forward, not retyped. Operation continues
the same source-linked request, replies, requests missing evidence and publishes progress there.
There is no second Operation request or parallel status ledger.

Operation starts handling and gives a substantive first response within two working days of
submission, calculated using the governed Carres working calendar. Opening the request or an
automatic acknowledgement is insufficient. Missing facts are requested explicitly; overdue
first-response work remains with the responsible owner/cover. This is a response deadline,
not a repair, production or delivery completion promise.

**DISPLAY ORDER TIMING AND MANUAL SETTINGS — OWNER-APPROVED / LOCKED;
Jess, 2026-10-02; APPROVED TARGET / NOT BUILT.** Dealer new-display purchases follow the same applicable Sales Order rules, including
order timing, commercial approvals and fulfilment/release conditions; they do not acquire a
separate service-progress workflow merely because the goods are for display. Normal order
communication remains with its owning order workflow. Separate service-progress follow-up
applies to repair or other non-new-purchase assistance (owner clarification 2026-10-02). The authorised staff must be able to
maintain display-order timing defaults through the governed Settings workspace and manually
adjust the individual request's required date/priority when needed, including earlier showroom
placement to support sales. Reuse existing Sales Order/Purchasing product and supplier timing
facts; do not create conflicting copies of supplier production days. The exact Settings fields,
permission mapping and screen wording remain Blueprint design work, not approved new labels.

Operation executes against the agreed deadline and may arrange earlier fulfilment when goods,
existing approvals/release gates and the receiving location permit. A manually earlier required
date is a planning request, not proof that the supplier or delivery party has committed to it.
Keep requested, estimated, confirmed and actual dates distinct; retain timing changes, reason,
actor/time and prior values. Adjusting one request must not silently change all future orders.

Dealer/showroom sees the relevant order goods, agreed lead time/confirmed delivery arrangement,
required customer actions and material date changes. Every internal execution step need not be
exposed. Meaningful progress may be published from the real owning Stock/Delivery facts;
publishing must not manufacture readiness or prove physical dispatch. Internal execution and
deadline follow-up remain with their existing owners. The two-working-day substantive response
rule remains separate from production/delivery completion and from repair assessment.

This shared communication and service-level rule does not merge business ownership: Carres
buying still follows Manual Purchase/PO approvals, supplier consignment follows its existing
display-only order/return rules, internal controlled-site moves follow Stock Transfer, and
service problems follow their proper Service/Stock/Claim owner. Dealer goods remain purchased,
not consignment. The existing Dealer-account customer Sales Order is a terminal-customer
transaction, not proof of a Dealer-company display purchasing capability. Whole-Blueprint
approval, account provisioning, cutover and application delivery remain outside this ruling.


**Current-goods delivery evidence — PRODUCTION-VERIFIED bounded slice, 2026-10-02.** The Showroom current-goods
reader and exact-goods transfer handoff are live through PR1853; Stock §3 records their measured
boundary and remaining targets. This is not completion of the approved three-view journey,
new purchase/service intake, account cutover or timing Settings. Existing Purchasing display
documents and commercial approval rules remain unchanged.

### Showroom page and request journey — OWNER-APPROVED / LOCKED 2026-10-02

Owner naming correction: the module/page is **Showroom**, with **Carres** and **Dealer**
destinations. Split by who operates the showroom, retaining separate per-goods ownership facts.
PJ's existing internal reader belongs to Carres. Dealer capability remains undelivered; naming
approval does not open Dealer access or make dealer-owned goods Carres Stock.

Approved presentation/operating target, not application delivery proof. One authorised Showroom
entry provides current goods, orders/requests and actual inbound/outbound history using the
shared Register/Object Detail grammar. Screen labels remain subject to governed COPY admission.
The current-goods view reads the owning location-scoped records: PJ uses existing Warehouse
Stock, not a second opening ledger. Group identical products by quantity and expose exact Unit
IDs for selecting a particular piece; Catalog-counted goods remain quantity-based. Dealer-owned
goods remain outside Carres inventory and require their company/location-scoped asset facts.

Buying new goods starts without selecting old goods and follows the applicable normal order
rules. The requester may additionally select exact outgoing goods and record movement intent,
destination needs and whether removal must precede arrival. Adding goods never requires a
one-in/one-out exchange. Buying pillows/protectors or other Catalog goods is available without
an existing-display selection; the intended buyer, use and receiving location decide the source
workflow and whether actual receipt belongs in the Showroom view.

Repair, cleaning, removal and replacement start from the existing goods, carrying product,
location, identity and evidence forward. Operation continues the same source-linked record;
related purchase/service/movement documents remain with their owning modules rather than
requiring a second blank submission. Replacement can link outgoing goods to a new purchase;
new purchase execution still uses normal order rules. Unknown destination, acceptance or fees
must be resolved, never presumed to approve return, refund or buyback.

The orders/requests view provides submission identity/date, location, purchase/service nature,
goods summary, relevant state, requested/confirmed arrangement and required requester action.
Purchase detail shows normal commercial/fulfilment facts and outgoing-goods arrangements only
when relevant; service detail shows evidence, progress, proposal, fees/acceptance, arrangements
and outcome. Operation sees responsible owner, next action and deadline through governed Work.
External readers need meaningful arrangements/actions/changes, not every internal step.

Only actual, evidenced receipt/removal/return updates current goods and movement history.
Submission, approval or published progress does not move inventory. Partial handovers update
only completed quantities/identities; unfinished related movement remains visible. Repair retains
identity, custody and service history; a physical replacement has its own governed identity.
Existing IDs are verified and reused for labels, never reminted; printing/scanning follows Stock §3.

This approval covers the page/journey above. It does not approve the proposed 5/7/3-day service
checkpoints, blanket Dealer 14-day entitlement, external cutover or application implementation.
Existing commercial, payment, ownership, entitlement, permission and physical-evidence gates
remain applicable. Sales negotiation, Purchasing commitments, Stock truth, Service remedies,
Delivery execution and Finance facts retain their current write owners.

**Purpose / source:** record a Carres-owned showroom's new display placement, replacement, removal or change and connect
it to the existing goods and the agreed supplier arrangement. For a replacement/removal, choose the
showroom (PJ Showroom exists today), then select the exact existing display Units from Stock.
Bring forward Unit ID, model, supplier, current location, ownership and stock state; do not ask
Sales to recreate those facts or keep a second showroom inventory. A new display placement need
not select an outgoing Unit.

**Journey:** select the existing display goods where applicable → Sales supplies the new goods,
negotiated price/conditions/date and supporting supplier conversation or quotation → Operation
checks completeness and prepares the source-linked execution documents. New goods without a SKU
may be recorded with model details/photos; resolve them to governed Catalog SKU facts before
formal supplier-document issuance. Catalog owns product facts; Operation cannot invent the SKU
or price. Read known facts and require only missing information. Missing price/conditions go back
to the negotiating Sales person rather than being decided by Operation.

**ENTRY AND COMMERCIAL FOLLOW-UP — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.**
Sales may create the handoff directly; Operation may record it on Sales's behalf from the supplied
conversation/material. Both entry paths identify and retain the actual negotiating Sales person.
The person who records the handoff and the negotiating Sales person are distinct facts; proxy
entry never impersonates Sales or transfers commercial responsibility to Operation. Record the
actual creator and time in History. Missing model details, price or agreed conditions are assigned
back to that negotiating Sales person to complete. Operation may identify and record the gap but
may not invent the answer or negotiate/set the price. Both paths create the same source-linked
Display Request, not separate queues or duplicate supplier orders. This ruling permits proxy
entry, not supplier-document issuance, commercial approval or changing Stock through that entry.

**ALREADY-AGREED DISPLAY HANDOFF — APPROVED TARGET / NOT BUILT; Jess, 2026-09-29.**
A Display Request records and hands off Sales's supplier-agreed display arrangement; its name does
not introduce another boss-approval round. Operation may proxy-create the one request with the
actual negotiating Sales person and supplied evidence, without requiring Sales to re-enter it.
For the Dorsettloft case, it connects new sofas from 2990 to PJ, the exact old PJ sets back to
Carres warehouse, and later supplier collection whose date remains unconfirmed. Source facts
prefill the Consignment Order, Stock Transfer and Consignment Return; staff do not create three
blank documents or manufacture completed movements. Creating the handoff alone does not issue
all downstream documents. Existing purchase, Claim, financial and physical permission/approval
rules still apply; this is no general approval bypass or authority for Operation to negotiate.

**MANUAL ARRANGEMENT AND ACTUAL MOVEMENT ROUTE — APPROVED TARGET / NOT BUILT;
Jess, 2026-09-28.** Staff may manually initiate the display arrangement from Sales instructions,
enter supplied facts and select the actual pickup and destination locations. Reuse Catalog for
new goods; select exact existing Stock Units for goods already held. The arrangement supplies
the source for governed documents; this does not permit arbitrary standalone receipt, sale or
completed-handover records. Keep actual pickup location, supplier ownership and final destination
as separate facts. An external pickup location is not automatically a Carres-controlled Site.

**MULTIPLE MOVEMENT LEGS — APPROVED TARGET / NOT BUILT; Jess, 2026-09-29.**
One Display Request can add further movement legs as the actual arrangement requires; the three
Dorsettloft legs are an example, not a fixed limit or three mandatory slots. Adding a leg adds a
planned arrangement only, not an issued document, stock movement or completed handover.
Each leg identifies its goods, pickup and destination, contacts/transport party, planned dates and
separate actual pickup/receipt or supplier-handover evidence. Select existing exact Units for held
goods; new goods retain the governed Catalog-to-issue identity process.

**EXPLICIT DETAILS ON EVERY MOVEMENT CARD — OWNER CORRECTION, APPROVED TARGET / NOT BUILT;
Jess, 2026-09-29.** Every card asks the same operational questions: which goods and quantities,
where to collect, where to deliver, the relevant pickup/destination contacts, who transports them,
and the planned dates. Unknown facts may remain visibly unresolved under the existing draft rules;
never guess them from the preceding card. In particular, the second pickup may collect entirely
different goods, a subset, or a combination; adjacency or a shared location proves none of these.

Provide an optional, initially unchecked same-as-previous checkbox for a clearly named field/group
where reuse is meaningful. It is not one ambiguous checkbox that copies the entire card. Only the
operator's explicit selection brings forward that group's known planning values; show the source
card and the resulting values so they remain reviewable. Goods can then be removed, added or their
planned quantities adjusted, subject to exact-Unit and quantity rules. Manual changes clear that
group's same-as-previous selection. A partial match must not be labelled wholly the same. Each new
card starts without assumed goods, location, person or date; matching goods alone copies no other
group. Source edits do not silently overwrite later cards. Never copy actual pickup/receipt,
signatures, completion, document issue/send or commercial acceptance as a planning shortcut.

Only when the selected goods actually match across successive legs, link those movements and
preserve their physical identities; a planned destination is not evidence of the next leg's actual
pickup holder. Different goods may follow independent routes and dates. Prevent contradictory simultaneous
commitments for the same Unit; do not create duplicate Units to represent another leg. Partial
results leave the specific remaining goods outstanding. Adding or changing a future leg preserves
completed movement evidence and follows existing amendment/cancellation rules.

The system derives the source-linked Stock Transfer, Receiving, consignment or logistics action
from the verified locations, ownership and purpose; staff do not choose an unfamiliar document
family for each card. An external address remains an external address unless it is a governed
Carres Site. Existing permissions, supplier-specific documents and one combined same-supplier swap
instruction remain unchanged. Multiple cards do not create a new transport or stock ledger.

**OWNER-REPORTED OPERATING CASE:** Dorsettloft sent two new display sofas to the wrong location,
2990. Sales asked Operation to collect them from 2990 for PJ Showroom and move two old display
sets from PJ back to Carres warehouse. Dorsettloft may collect the old sets from that warehouse
on a later stock-delivery visit; that visit is not yet a confirmed collection appointment.
One display arrangement must retain all three movement scopes:

- New goods: actual pickup at 2990 → receipt at PJ Showroom. Verify existing custody/receipt
  evidence before choosing the source-owned movement; neither assume 2990 is a Carres Site nor
  fabricate an earlier Carres receipt. Resolve new Catalog identity under the existing rule.
- Old goods: exact PJ Units → Carres warehouse through Stock Transfer. Preserve supplier
  ownership; arriving at warehouse does not complete return to Dorsettloft.
- Supplier collection: those same old Units, now at the warehouse → Dorsettloft through the
  linked Consignment Return and actual handover evidence. Keep uncollected Units outstanding.
  A later supplier delivery can coordinate collection on the same visit; incoming receipt and
  outgoing return remain distinct physical facts. Never create another set of outgoing Units.

**GUIDED ARRANGEMENT JOURNEY — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.**
Operation opens one display arrangement and follows its current next action: record Sales's
instruction and negotiator/evidence → choose new Catalog goods and exact existing outgoing Units
→ record each actual pickup/destination leg → confirm contacts, transport party, dates and
receiving-showroom space → record each actual receipt/handover through its owning form → retain
outstanding supplier collection until actual return. Missing goods facts may stay in draft under
the existing identity rules. Commercial follow-up remains with Sales and does not block the
approved consignment arrangement. Known facts prefill the linked governed documents; employees
need not guess a document type or re-enter the same goods and addresses. Partial execution leaves
the exact remaining scope visible. A supplier's possible future delivery is not a confirmed
collection booking. Later customer sale uses Sales Order and Sales Invoice; supplier notification
and invoice follow-up reference the same goods separately. This approves the operational main
journey, not detailed financial reversals, unresolved exception policies, screen copy/composition,
the complete Showroom Blueprint or implementation.

**ARRANGEMENT CHANGE AND PARTIAL EXECUTION — APPROVED TARGET / NOT BUILT;
Jess, 2026-09-28.** Changing a movement leg updates only its remaining instructions and work.
If new display goods have arrived but old goods have not left, preserve the new receipt and
explicitly continue, revise or stop the old-goods arrangement through its owning authority. If old
goods are already in the warehouse, preserve their actual location and outstanding supplier
collection even if the new placement changes. Stopping an unexecuted scope records reason and
preserves the prior supplier instruction and sending history. A changed supplier commitment
requires attributable revised communication; changing a local status alone is insufficient.
Stock MASTER §5 governs rescheduling, pre-collection cancellation and real return/redirect
handovers after collection. Cancellation never erases executed facts or restores stock to an
old location. Partial execution retains the exact remaining goods and obligations. Commercial
and Finance consequences remain with their owners and specific source permissions still apply.
This ruling does not decide disputed supplier charges or post-sale ownership/liability.

**DISPLAY SPACE COORDINATION — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.**
For each arrangement, show the actual displayed goods and quantities, planned incoming goods and
planned outgoing goods. Operation coordinates movement timing and confirms with the receiving
showroom that placement space is arranged. Preserve the approved either-movement-first rule;
planned movements do not change actual stock or occupancy before evidenced physical events.
Use verified set composition where quantities are expressed as sets; do not assume two sofas
equal two sets or that Unit-record count equals occupied display space. Incomplete facts remain
explicit rather than a fabricated occupancy figure.

Stock MASTER §7 governs showroom Sites and the space-planning boundary. Do not introduce fixed
Sofa/Mattress/Bedframe capacity settings, computed remaining-capacity figures, automatic full-site
alerts or a numeric receipt block at this stage. PJ's roughly 11 sofa sets is a current layout
reference only; product mix and layout may change. This does not change imported PJ Unit records
or establish their ownership. Space coordination is part of the arrangement, not a new approval
role or separate capacity ledger. Exact UI composition and wording remain subject to the shared
kit and COPY authority; this ruling authorises no application build or production backfill.

**SUPPLIER QUOTATION RECORDING — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.**
Operation may upload a supplier quotation and transcribe its model/specification, prices and terms
into the same showroom arrangement. Recording a quotation is not negotiation, Sales confirmation,
purchase approval or a payable. Keep the supplier evidence, quotation version, actual recorder and
time, and the original negotiating Sales person. A quote consistent with an already evidenced
Sales agreement may be recorded against that agreement; do not fabricate a new confirmation by
Operation. A newly received quote without acceptance remains awaiting Sales confirmation. A
mismatch against Sales's agreement identifies the difference and goes to that Sales person to
resolve with the supplier; Operation cannot guess which price wins. Missing price is unknown,
never RM0. Retain previous quotations and the history of revisions; neither a replacement quote
nor a later Catalog price overwrites the historical arrangement. Reuse the recorded product facts
for governed Catalog entry rather than asking staff to retype them, without bypassing Catalog's
write authority. Existing commercial and Manual Purchase approval remains in force.
The supplier-facing Consignment Order PDF follows §9.9: no prices; commercial evidence and confirmation remain
in the linked arrangement. CO operational progression follows the price-nonblocking ruling below.
No screen labels, new approval role, automatic quotation extraction or application build is
approved by this ruling.

**PRICE DOES NOT BLOCK CONSIGNMENT ARRANGEMENTS — APPROVED TARGET / NOT BUILT;
Jess, 2026-09-28 ("price wont stop operation arrange first").** For a confirmed consignment
placement or swap, a missing supplier quotation, unrecorded price or price awaiting Sales
confirmation does not block Operation from issuing the CO and arranging the agreed incoming or
outgoing goods. The supplier, goods/identity, supplier ownership, location and agreed movement
scope must still be sufficiently established for the governed action; this is not permission to
invent missing goods facts or bypass physical/permission controls. An absent price remains
unknown, never RM0. Issuing/sending the CO, receiving the goods or handing back the old goods
neither accepts an unconfirmed quotation nor creates a payable or price approval. The original
negotiating Sales person retains the outstanding commercial follow-up until attributable
confirmation resolves it; operational progress cannot silently mark that follow-up complete.
The Consignment Order PDF contains no price, confirmed or unconfirmed (§9.9); commercial evidence stays in the
linked quotation and Sales confirmation. Existing Carres-purchase MPR/PO approvals
are unchanged; this ruling is scoped to the consignment arrangement, not a portal-wide bypass.

**CO FACTS AND ROLE-SCOPED WORK — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.**
The CO surface separates goods arrangements (incoming destination, delivery party/date, exact
outgoing Units, collection party/date and actual quantity/evidence) from commercial conditions
(supplier quotation/version, recorded price and Sales confirmation or unresolved questions).
Operation sees the admitted document/arrangement actions without a price-confirmation gate;
the original negotiating Sales person sees outstanding quotation/confirmation work; Warehouse
sees the exact goods and the receiving/handover work it owns. These are projections of owning
module records through Workspace, not a second task or status ledger. No new generic owner,
manual Done control or fabricated deadline is introduced. Actual receipt/handover evidence closes
only the covered physical obligation; outstanding Sales commercial follow-up remains visible
until its own attributable confirmation exists. Partial results retain the remaining scope.
Use the same owning forms inside Workspace and the module surface, preserving existing Duty,
cover, permission and actual-actor rules. Detailed Work admission follows Workspace authority;
this approved target is not a claim that any of these projections are implemented.

**Commercial and physical connections:** Carres purchases follow Manual Purchase approval → PO;
supplier-owned placement follows CO; consignment swap connects incoming goods and an outgoing
CRTN; removal of Carres-owned goods uses the governed Stock movement, not an invented purchase.
The route follows verified ownership and agreed terms. Issuing a document is neither sending it
nor moving a Unit. Incoming receipt and outgoing handover remain separate owner-module facts.
An existing supplier conversation is evidence, not proof of formal issuance, sending or receipt.

**Stock readiness:** Stock MASTER §12.9 records PJ Site, its 36 imported display Unit records,
showroom filtering and ownership support. That import is test data and all 36 were marked Carres
Owned; it is not verified ownership evidence. Apply the owner ruling: Hookka/Ohana display goods
are Carres Owned; other suppliers' showroom displays are Supplier Consignment. Preserve Stock's
recorded opening-import correction boundary; this plan authorizes no production backfill.
Transfer and showroom scan/Count delivery gaps stay with Stock. Do not call PJ Site absent or
recreate its Unit list.

**Object/placement:** internal full-width object; no PDF preview. Reuse the shared kit and owning
forms. Workspace may open those same forms in place; it creates no second request, inventory or
business writer. The current register content boundary is §9.13.3: arrangement identity/date,
showroom, supplier scope, negotiating Sales, incoming/outgoing goods and concrete unresolved facts.
Do not add a Purchasing Decision approval step or generic Work column. The already-agreed handoff
needs no extra boss approval; existing purchase and other owning-module approvals remain intact.
Exact column order and literal copy still require design closure against the shared kit and COPY;
this semantic boundary is not a final rendered register or permission to invent new screen words.

**Exceptions:** missing Catalog SKU, unclear ownership, unidentified old Unit, unavailable model,
duplicate arrangement, incomplete negotiated terms, and partial incoming/outgoing fulfilment.
**Connections:** Sales/Showroom, Catalog, Manual Purchase, CO/CRTN, Stock Unit/transfer, Receiving,
Workspace. Existing approvals, custody evidence, permissions and supplier-document controls remain.

### 9.9 Consignment Orders

**DOCUMENT PURPOSE — APPROVED TARGET / NOT BUILT; Jess, 2026-09-29.** Consignment Order
confirms the supplier-owned goods Carres requests and where they are to be delivered/collected.
It is an instruction to obtain goods on consignment, not an outright purchase, payable or proof
of receipt. Keep Consignment Orders and Consignment Returns as distinct, plainly named objects
and register destinations. Do not rename them collectively Consignment Note or introduce that as
a third manually created document. Staff still enter the Display Request once; intent and verified
ownership derive the correct source-linked order and/or return, with existing facts prefilled.

**Source / identity:** source-linked Display Request under §9.8 or authorised Supplier Claim replacement outcome;
no blank order that bypasses its source. Manual arrangement entry follows §9.8. Official issue
allocates new incoming exact Unit IDs under §6.2; existing outgoing Units keep their identities.
Preserve numbering families, old titles/versions and source links. No historical document rewrite,
new CN allocator or application changes follow from this planning ruling.

**Commercial boundary:** apply §9.8 quotation recording and Sales-confirmation rules. Missing or
unconfirmed price does not block the agreed consignment movement. The supplier PDF is price-free:
no supplier cost, customer selling price, price total or settlement amount. Keep commercial
versions/evidence internally; issue, send and receipt never accept unconfirmed terms or create a
payable. Future Catalog costs do not overwrite historical terms.

**Supplier instruction and swap:** the Consignment Order PDF carries its number/date, supplier,
source arrangement/showroom, incoming goods/specification/quantity/issued Unit IDs, actual pickup
and destination, confirmed date and instructions. Pure placement uses COMING IN only. A
same-supplier swap uses one combined Consignment Order PDF with COMING IN and GOING BACK; the
latter names exact outgoing Units, actual collection location and its own confirmed date. Link the
Consignment Return and show its progress without sending a second supplier instruction for that
same swap. Different suppliers never share one supplier-facing instruction. A price-only change
does not require a revised goods instruction; changed operational instructions follow §9.8.

**Actual receipt / signatures:** Receiving records actual goods, condition, quantity, date and
receipt evidence through its existing form. The receiver applies/verifies labels under Stock §3.
An order, printed PDF, planned date or send record is not a physical receipt. Showroom acceptance
belongs to the actual receipt evidence, not a separately created Consignment Note. Keep supplier
paperwork/signatures as evidence where applicable; never assume one signature covers another leg.
Record supplier sending with exact version, recipient, channel, actor and time, without inferring
supplier acceptance. Partial receipt leaves the remaining scope visible.

**Journey / placement:** Display Request → sourced Consignment Order → review/issue/send → owning
Receiving and, for swaps, linked return handover. The same owning actions open from Workspace or
the module. Full-width read view; governed supplier-document preview for issue/revision. The
register retains incoming/swap lookup. Exact column order/filter/copy and responsive composition
remain design-closure work; do not restore a generic Work column or separate stock ledger.

**Dorsettloft example:** the order arranges pickup of new sofas from 2990 for PJ. The old Units'
PJ-to-Carres-warehouse leg is Stock Transfer; later supplier collection is the linked Consignment
Return from the warehouse. Internal relocation does not complete the supplier return. A possible
future supplier visit is not a confirmed collection date. Space is coordinated for the arrangement.

**Exceptions / connections:** missing Catalog identity, unclear provenance/ownership, label
mismatch, wrong/damaged/short goods, changed date/model, reserved outgoing Unit and partial movement
use owning controls. Receiving, Stock, supplier instructions and Finance
remain separate authoritative records; neither paper creation nor cancellation changes custody.

### 9.10 Consignment Returns

**DOCUMENT PURPOSE — APPROVED TARGET / NOT BUILT; Jess, 2026-09-29.** Consignment Return
records the supplier-owned goods to hand back and the actual collection result. It has its own
register/object and existing number family. Source it from authorised removal, swap, supplier
collection, overdelivery or Claim outcome; staff do not re-enter the goods already chosen on the
Display Request. No independent blank create bypasses source/ownership controls.

A standalone return issues its own price-free Consignment Return PDF with GOING BACK goods,
actual collection location, party and confirmed date. A same-supplier swap uses the combined
Consignment Order supplier instruction (§9.9); do not send a second notice for the paired return.
The arrangement opens the linked return's same handover form, including through Workspace, while
the Consignment Returns register helps find goods still awaiting supplier collection.

Read exact goods/current location from Stock. Keep planned collection separate from actual
handover Units, recipient, time and proof. Supplier/collector acknowledgement belongs to this
handover evidence, not another manually created Consignment Note. Partial collection leaves
uncollected Units at their evidenced location and keeps remaining work. Issuing/sending the return
is not proof of collection. Preserve versions and each actual event; cancel cannot teleport goods.

Stock owns custody and Purchasing owns supplier instruction. This is not a Site-to-Site Transfer:
old goods at Carres warehouse still await supplier return. Unsold consignment return creates no
refund, credit or value posting. Customer returns of purchased Carres-owned goods follow §9.11 and their separately
confirmed supplier/Finance outcome; supplier-owned display goods are not sold. Wrong/partial Unit, condition dispute, date change and missing provenance
remain explicit exceptions. Read view is full width; standalone issue/revision follows the shared
supplier-document preview. Detailed register composition remains to be reviewed.

### 9.11 Supplier-owned display boundary

**RULING — APPROVED / LOCKED; Jess, 2026-10-02.** Apply §7.7. The Showroom target has
Display Requests, Consignment Orders and Consignment Returns, connected to existing Receiving,
Stock and Delivery movement actions. Remove Consignment Sale Notices from the target navigation,
registers, documents, generation triggers and Work obligations; do not rename it Consignment Sales.
Supplier-owned display goods are not sold. Carres-owned purchased goods use ordinary sales.

Retain immutable historical records, identifiers, documents and evidence if any exist; removal of
the target capability is not authority to delete history or reuse a number. No live cutover,
application change, automatic ownership conversion or Finance posting is authorised by this plan
update. Stock/Sales eligibility, Delivery, Finance, Work and shared navigation/copy must converge
on this boundary before the affected implementation is described as complete.

For purchased goods, a customer return follows Service remedy, actual Stock/Delivery receipt and
inspection, and any separately evidenced supplier recovery. Customer refund/return does not itself
cancel a purchase invoice, restore supplier ownership or prove supplier acceptance. Purchasing
records the supplier outcome; Finance owns actual invoice, credit and payment consequences.

---

**Incoming consignment navigation recommendation — PROPOSAL / NOT LAW, 2026-10-02.**
Keep Display Requests within Showroom as the common arrangement entry for purchased display,
supplier-owned display, swaps, removal and misplaced goods recovery. Recommend an explicit
Purchase Consignment group with Purchase Consignment Orders, Receiving (scoped to these orders
through the existing Receiving engine), and Purchase Consignment Returns. Proposed fuller names
replace Consignment Orders/Returns only after owner approval and COPY convergence; existing
numbers and history do not change. Delivery stays the linked transport action, Stock the owning
identity/custody door. Do not add outgoing Consignment Order/Note/Return pages: Carres external
partner placement is not established. Carres Site-to-Site movement uses Stock Transfer. The
Houzs-to-PJ misplaced-goods case preserves existing source and actual custody, then pickup and
PJ receipt/handover; never assume the external warehouse is a Carres Site. Trade-off: a scoped
Receiving entry adds a navigation shortcut but prevents staff missing the incoming receipt step
without duplicating its engine. Acceptance fails if direction remains unclear, source facts are
re-entered, a document issue changes custody, or receipt/transport is implemented twice. Reference
function evidence is in purchasing-houzs-review.md; this is not application/build authorisation.

### 9.12 Showroom completeness audit and recommended completion — 2026-09-28

**FACT / RESEARCH + PROPOSAL / NOT LAW.** This is the current whole-domain completeness audit,
not an approved replacement for §§9.8–9.11, a build Card or PLAN MISSION COMPLETE. User requested
proactive omissions research before further local approvals. Measured Carres source snapshot:
`6182980aa82c1a825045558add40c6c7f5897f1e`. Local 2990 checkout HEAD:
`a600b8d7417120d25bbd021820fc6b3ec4f92081`; inspected working-tree source, not a certified 2990
production deployment. Authenticated Carres read-only browser inspection on 2026-09-28 confirmed
the four Purchasing SHOWROOM destinations still say Coming soon. No production transaction or
configuration was changed. The live page SHA was not independently verified against the source
snapshot, so these are separate observations. This audit is not responsive/visual acceptance.

#### Authority resolution and measured boundaries

- **RESOLVED FROM AUTHORITY:** §§9.8–9.11 handoff, proxy entry, Sales price responsibility,
  Operation quotation transcription, nonblocking consignment price, price-free supplier note, exact
  outgoing Units, one combined swap instruction, independent physical/commercial completion,
  display-only supplier ownership and ordinary sales of purchased Carres-owned goods (§7.7). Do not re-ask these.
- **APPROVED TARGET / NOT BUILT:** source-linked Display Request and formal consignment objects;
  embedded owner-module actions; full physical handover/receiving integration and display-only
  sales eligibility guards. `portal-nav.ts:402–405` still marks the measured navigation entries soon; that snapshot does not preserve the retired sale-notice target. A legal ownership
  enum and a PO consignment flag are not these complete objects.
- **BUILT / VERIFIED (bounded):** source supports `supplier_consignment` and supplier identity;
  `warehouse-receipts.ts:1095–1100` still resolves `purchase_orders` through the receipt's PO id
  and reads `is_consignment`; migration 0570 refuses payable billing of a consignment receipt.
  Live Inventory can select Showroom Display and shows actual PJ rows (including U1-000-321 and
  U1-000-297) plus older Carres Klang display rows. Its Showroom Display count was 102, not PJ's
  36 imported records: the broad display filter is not an exact PJ selector. Stock §12.9 owns
  the 36-row test-import/incorrect ownership caveat. No new count or ownership backfill approved.
- **REAL GAP / CONTRADICTION:** detailed document amendment controls and post-sale commercial reversal;
  admission of approved Sales-successor and no-Sales-Order Delivery Duty action rules (§9.13); opening-stock provenance and display-set/individual-Unit reconciliation;
  exact Showroom UI/copy and Work rules. Existing generic controls resolve many mechanics but not
  all domain consequences below.

#### Finance capability mapping — scoped source evidence, 2026-09-29

**FACT / RESEARCH, not new accounting law.** Inspected repository snapshot
`c7dbc8909d8f715df19265e6d7fcd8523eeb1f42`; no supplier bill was created or posted and no
production behaviour was verified in this pass.

| Required connection | Measured current capability | Readiness boundary |
|---|---|---|
| Record the supplier's actual invoice | `apps/web/src/pages/finance/payables/SupplierBills.tsx` provides typed or receipt-derived drafts, confirmation, cancellation, files and history | Reuse the existing Finance surface; no second Purchasing bill register |
| Avoid entering the same supplier invoice twice | Migration 0554 checks supplier plus trimmed, case-insensitive invoice number across non-cancelled bills, excluding the edited bill | Existing invoice-number guard; does not prove one sold Unit cannot be allocated to two different invoice numbers |
| Prevent ordinary receipt overbilling | Migration 0570 checks receipt/PO-line billable quantity against other non-cancelled bill allocations, including drafts | Existing receipt-specific protection; not proof of every purchase matching path |
| Keep initial consignment receipt free of payable | Migration 0570 rejects a linked consignment receipt with `grn_is_consignment` | Preserve this boundary; do not bypass it to bill supplier-owned display goods |
| Supplier-owned display sales/settlement | No customer sale is permitted under §7.7 | REJECT sale-notice generation and sales-based supplier settlement; retain ordinary Finance purchase matching for Carres-owned stock |

**Consequence for the existing §9.13.6 proposal:** reuse Finance Bills and its controls; preserve
its receipt guard. Matching sold Units, partial invoice coverage, duplicate sale allocations and
linked corrections still need the owning Finance contract. A supplier invoice number check alone
cannot close that gap. No new payable trigger, automatic ownership transfer, posting rule or build
scope is approved by this research.

#### Reference-to-Carres capability matrix

| Reference capability and inspected evidence | Carres owner/current equivalent | Disposition and dependency |
|---|---|---|
| 2990 supplier-side Purchase Consignment Order, linked receives/returns; `apps/api/src/routes/purchase-consignment-orders.ts` | Purchasing and Receiving; formal Carres Consignment Order not built | ADAPT source/child links and ordered/received/remaining facts; no blank Carres order creation |
| 2990 shared PO PDF renderer with `docTitle: PURCHASE CONSIGNMENT ORDER`; `PurchaseConsignmentOrderDetail.tsx:307–311` | Shared document kit | COPY PRINCIPLE, NOT READY for direct migration: Carres's combined incoming/outgoing layout and price exclusion differ |
| 2990 separate supplier-side route/tables; create/edit line/cancel/delete operations | Shared Carres source-owned document/receipt capabilities | REJECT cloned business writers; sharing a PDF does not prove one common transaction engine |
| 2990 receive/return remaining-quantity guards and downstream edit lock; `purchase-consignment-receives.ts:270–380` | Receiving/Stock exact Units | ADAPT prevent over-receipt/over-return and inspect downstream effects; Carres amendments preserve actual receipt history |
| 2990 return creation books inventory OUT and cancellation reconciles it back; `purchase-consignment-returns.ts:1–65` | Stock physical handover | REJECT document-status-driven custody changes: Carres needs actual handover, not cancel-to-teleport |
| 2990 Consignment Note sends goods to customer/showroom, `consignment-notes.ts:1–80`; outward Consignment Order uses sales tables | Delivery/Stock goods movement; supplier-owned display is not sold in Carres | RELOCATE reference meaning; no evidence here that the named note auto-notifies supplier after customer success |
| Odoo owner dimension and ownership-based stock moves (official consignment documentation) | Stock Unit ownership | KEEP owner separate from Site; documentation search corroborated concept, full page fetch timed out |
| Oracle returns before/after consumption advice and invoice (official return examples) | Service, Purchasing and Finance | ADAPT need to distinguish unsold return from post-sale customer return; REJECT importing Oracle ownership/accounting policy as Carres law |
| Dynamics supplier-owned receipt without accounting posting (official consignment process) | Receiving consignment flag and Finance bill guard | KEEP proven separation of receipt and payable; Carres successful-customer-delivery trigger remains its own law |

Primary references: [Oracle return scenarios](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25c/famml/examples-of-consigned-inventory-returns.html),
[Dynamics consignment](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/consignment),
[Odoo consignment](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/owned_stock.html).
The Oracle distinction is a research lesson, not financial advice or adopted posting policy.

#### Complete relevant lifecycle coverage and recommendation

| Surface / case | Resolution | Recommended Carres treatment / dependency |
|---|---|---|
| Create, source, duplicate, proxy entry | Approved target + safeguard gap | Reuse existing Units and negotiating Sales; warn on overlapping active arrangements, revalidate exact scope before commitment; repeat save/issue cannot duplicate documents |
| New model without SKU | Resolved; Catalog dependency | Capture evidence first, continue original request when SKU/supplier/identity mode is governed; never invent SKU or make price confirmation a consignment gate |
| Display set vs individual physical Units | Real measurement gap | Keep set/model readability but select and prove each governed physical Unit/module. Reconcile PJ set-level import against Catalog identity mode before physical rollout; do not silently split or mint IDs |
| Missing historical supplier order | Partial authority: §6.2 opening stock | Preserve verified opening-count provenance/supplier/ownership. Recommend support without a fabricated backdated Consignment Order; supplier-owned goods are display-only; unresolved return provenance remains visible |
| Multiple suppliers / Sites | Real composition gap | One arrangement may link supplier-specific instructions; no supplier sees another supplier's goods/conditions. A cross-supplier replacement is separate incoming/outgoing obligations, not one combined supplier document |
| Edit before issuance | Ordinary mechanics | Preserve actual actor/history; do not mint official Units for drafts; warn against concurrent stale changes |
| Amendment after sending | Approved arrangement boundary §9.8; detailed document controls remain | Preserve number, old PDF and sent evidence; revise only unfulfilled scope; send changed instruction once. Changes to received/handed-over facts use owning corrections, not silent edits |
| Cancellation before/after partial movement | Resolved Stock §5 and approved arrangement boundary §9.8 | Stop only unexecuted scope with reason; completed movements remain true. If one leg happened, resolve the other explicitly; never erase a receipt or move stock back via Cancel |
| Copy/duplicate arrangement | Not required for first completion | Do not offer blank copy of live Units, price acceptance or sent evidence. Search/reuse source avoids accidental second commitment; optional prefilled draft only if later justified |
| Reserved / damaged / missing outgoing Unit | Stock rules resolved | Revalidate eligibility at action, respect Sales Order reservation/protective control; Sales/Purchasing cannot silently release it. Report stock issue with evidence; retain unresolved movement |
| Direct showroom receipt / label / wrong or short goods | Stock/Receiving target; delivery proof incomplete | One Receiving engine, exact issued identities, receiver label rule, observable outcomes/claim evidence. Source page must not require supplier-applied labels; physical rollout needs receiving-side identity proof |
| Goods already arrive without formal instruction | Real exception gap | Record physical observation and source-resolution work, not invented prior sending/arrival dates or freely available stock. Formal acceptance must use existing controlled Receiving authority |
| Old/new goods either direction first | Approved independent facts | Separate collection and arrival dates/parties; one side never implicitly completes the other; partial quantity keeps remaining work |
| No Sales Order transport coordinator | Owner rule approved §9.13; Work admission not built | Delivery Duty coordinates transport; PO Duty retains supplier work. Exact logistics party/contact and physical evidence remain distinct; no fabricated Sales Order or unrelated PIC |
| Quotation, cost change, transport charge | Price/recording resolved; liability unresolved | Preserve evidence and accepted version; no automatic Catalog overwrite. Missing price does not stop agreed consignments. Who pays exceptional transport/damage and approval for any resulting expense must follow Finance/commercial authority, not guessed defaults |
| Sales absence / departure | Successor rule approved §9.13; assignment action admission remains | Preserve original negotiator; authorised management designates active Sales successor on permanent departure. Temporary absence uses cover. No inactive recipient, automatic Operation takeover or self-appointed replacement |
| Sending, revision, missing contact | Shared communication authority | Record exact version/channel/recipient/actor; mark is sending declaration, not supplier acceptance. Check external conversation before resending a missing mark; no duplicate send block |
| Customer sale / partial failure / retry | Resolved §§7.7,9.11; Delivery MASTER §6 | Auto-notice only successful exact supplier-owned Units per supplier/delivery visit; retry deduplicates; pending/failed Units excluded |
| Customer returns purchased goods | §9.11 and owning Service/Stock/Finance rules | Customer remedy, physical return and separately agreed supplier recovery remain independent; no automatic ownership or invoice reversal |
| Damage/loss in display and supplier dispute | Stock/Claim owners resolved; liability decision may remain | Evidence and protective Stock state first; Purchasing Supplier Claim for supplier issue, Service only for customer remedy. No automatic write-off, charge or supplier ownership conversion |
| Completion, archives, reopening | Partly resolved | Physical, sending, commercial and Finance obligations finish separately; no single manual Done. Later correction/reply reopens only affected work. Completed records remain searchable with historical documents |
| Reports, export, reconciliation | Existing §12 target | Supplier × Site × exact Unit movement/remaining stock, outstanding sends and unresolved commercial confirmation; snapshots/read-only totals from owners, not a settlement spreadsheet |
| Search/filter/columns/bulk/context | Shared UI authority; detailed showroom review owed | Full names, exact identity doors, scoped export; no bulk physical completion or second personal-layout engine. Old §9.9–9.11 columns/rail are not a fresh measured visual acceptance |
| Permissions, retry, concurrent action, read/save error | Shared controls; not end-to-end built | One authoritative writer and current-version check; no double issue/handover; keep last good read with error, preserve unsaved draft, explain refusals, never turn failed reads into zero |
| Settings and external partners | Existing authority | Contacts in Supplier Master, Site in Stock Settings, duties/covers in Workspace, product facts in Catalog. No new supplier portal, account provisioning or external cutover authorised |
| Responsive, keyboard, loading/empty/error | UI verification outstanding | Use admitted kit; verify 1440/1180/820/743/390 and 200% zoom, focus/return context and long goods/multi-receipt cases. No numerical visual-quality score without rendered evidence |

#### Direct 2990 interaction research and guided Carres journey

**FACT — local code inspected 2026-09-28, not a live 2990 walkthrough.**
`PurchaseConsignmentOrderDetail.tsx:554–565` offers `Receive Goods` on submitted/part-received
orders and `Raise Return` once received/part-received, passing the source id to the next form.
`PurchaseConsignmentReceiveDetail.tsx:338–344` offers a return directly from the posted receipt.
The from-order and from-receive pickers (`PurchaseConsignmentReceiveFromOrder.tsx:200–236`,
`PurchaseConsignmentReturnFromReceive.tsx:200–236`) carry supplier, source line, goods, variants,
selected quantity and price to the next form, with remaining-quantity limits. Carres should reuse
the principle of contextual next actions and source prefill, not the extra manual price entry.
2990 also permits manual receiving without an order; that is not Carres authorisation to invent
source/custody evidence. Its supplier order and receipt edit locks and cancelled-record deletion
must not replace Carres's preserved document and actual-movement history.

**FACT — billing boundary, scoped negative evidence.** The inspected 2990 Purchase Invoice route
uses ordinary `grn_id`/`grn_item_id` and `/outstanding-grn-items`; its inspected consignment receipt
child-lock explicitly says a purchase-consignment invoice is outside its scope. The mounted
purchase-consignment routes and their frontend detail actions do not establish automatic
successful-customer-delivery → supplier advice → supplier invoice matching. Do not assert such a
complete flow exists or copy a Consignment Note name as proof of it. Further UI/manual processes
could exist outside this inspected path; they are unverified, not disproven.

**RESOLVED FROM AUTHORITY — guided journey and document purpose.** §§9.8–9.11 and §9.13
carry the approved one-arrangement operating model, full document names, expandable movement
cards and explicit per-card selection. Do not reopen the naming question, restore a two-movement
limit, impose side-by-side cards or treat the original internal note as a customer invoice.
Historical use of the user's old note remains unverified; it does not block the approved future
purpose of Consignment Order and Consignment Return. The canonical journey is §9.13, not a second
proposal table here.

#### AutoCount reference and Carres adaptation — checked 2026-09-28

**FACT / RESEARCH, version-limited.** AutoCount's official classic help describes one Consignment
function for consigning and returning goods, separate invoicing and an outstanding balance report.
Its supplier-side menu reverses the parties' roles. The sales example also uses Return Qty for
an invoice-generated reduction: it does not always mean physical goods came back. Stock Transfer
handles location changes separately. This is documentation evidence, not a walkthrough of the
user's installed version or proof of one combined bidirectional supplier PDF.

**ADAPT:** one arrangement with prefilled purpose-specific documents; preserve physical incoming/outgoing,
internal transfer and actual sale/settlement facts. Carres's combined swap PDF is its own approved
presentation, not an asserted AutoCount feature. Never label sold/billed goods as physically returned.
Sources: [AutoCount Consignment](https://www.autocountsoft.com/products/ac_accounting/helpfile/consignment2.htm)
and [Stock Transfer](https://www.autocountsoft.com/products/ac_accounting/helpfile/stock_transfer.htm).

#### Opening-stock and current-note evidence check — 2026-09-28

**FACT / RESOLVED FROM AUTHORITY, bounded.** §6.2 already permits legacy showroom Unit identity
at opening count, with supplier, ownership, model, location, existing serial/label and photographs.
It says an unlabelled physical Unit remains usable with concrete label work. This resolves the
need to invent a historical Consignment Order merely to give existing goods an identity; it does
not prove every sale/return/claim source contract accepts opening stock. §9.5 separately requires
verified purchase provenance for formal Supplier Claim; until verified, source-search/enquiry
retains evidence and customer remedy does not wait. Do not infer a blanket Claim exception.

Stock §12.9 and the checked Claude Warehouse conversation (`fe1a3f38-d950-4607-9beb-999ee2dff2ca`)
corroborate that the 36 PJ imported Units were test rows marked Carres Owned, including goods
subsequently ruled supplier-consigned. The conversation also contains an earlier 31-row import
preview; it is not the current 36-row authority or proof of sofa-set occupancy. No new stock read,
production correction or completed physical set reconciliation is claimed by this check.

**FACT — document meaning, local 2990 source.** `docs/SUPPLY-CHAIN-DOCUMENTS.md` distinguishes
outbound Consignment Order/Note/Return addressed to the consignee from inbound Purchase
Consignment Order/Receive/Return. `apps/api/src/routes/consignment-notes.ts:1–23` confirms its note
is an outbound delivery-like record, not the supplier sale-advice event. Its document-state-driven
inventory behaviour remains rejected for Carres. This source explains 2990's name only. No Carres
current Consignment Note form/template was found in the scoped records/available attachments
checked; the user's note cannot be conclusively mapped by the shared title. The owner subsequently could not identify a fixed issuance stage and suggested recording both
incoming and outgoing goods. Historical usage remains unverified. The owner-approved future document purposes in §§9.9–9.11
resolve the naming question; that question is not pending further owner classification.

#### Exception resolution from existing authority

**RESOLVED FROM AUTHORITY — Stock MASTER §5 and Purchasing §9.9, checked 2026-09-28.**
A planned Transfer date change records reason/history and updates future Work only. Before
collection, cancellation leaves goods at origin. After collection, Stock requires the next real
return/redirect handover; Cancel cannot restore the original location. Each Unit retains its last
confirmed holder, including partial collection/arrival. Consignment instructions retain distinct
incoming/outgoing dates and follow governed document revision/sending rules. These existing
constraints need no fresh owner approval.

### 9.13 Showroom Blueprint — approved operating model and remaining design closure

**OPERATING MODEL APPROVED / TARGET NOT BUILT; Jess, 2026-09-28.** Owner approved the
integrated operating journey presented for review and the two assignment rulings below: Delivery
Duty coordinates display transport without a Sales Order, and authorised management designates a
Sales successor for a departed negotiator. §§9.8–9.11 remain the detailed business authority.
Register/object copy and exact composition, verified
opening/set identity and Finance matching/ownership details remain closure items, not implicitly
approved by this operating-model acceptance. Section 3's Display Request semantic structure is
separately approved on 2026-09-29; remaining detailed UI and section 6's detailed Finance
recommendations remain PROPOSAL / NOT LAW where not already governed. The preceding
research matrix is evidence. No Card, application build, cutover or PLAN MISSION COMPLETE is authorised.

**Current → problem → recommendation → trade-off.** Current Stock has Site/Unit/ownership facts,
and source inspection still finds the four Showroom destinations marked `soon: true`. Staff's
supplier messages do not provide one traceable arrangement for all movement legs. Present one
Display Request as the staff's arrangement and connect the existing owning documents/actions.
Keep document registers for lookup and control. This removes repeated input and document-type
selection, at the cost of requiring each connected module to provide trustworthy source facts and
next actions. Falsifier: if a connected action needs staff to re-enter goods, dates or addresses
already recorded, or completing it leaves a second inconsistent status, the composition fails.

**1. Entry, responsibilities and normal operating day**

- At the start of the day, My Work shows the signed-in person's admitted due/overdue actions;
  Team Work exposes owner/cover gaps. Open the same owning form in place under Workspace §5.10.
  The arrangement's own identity supplies context when there is no customer Sales Order; never
  invent a customer Order Route. Planned dates use the existing calendars, and unknown collection
  dates remain unknown. Day-end review identifies remaining goods, missing appointments/evidence
  and commercial confirmations, rather than asking someone to mark an entire arrangement done.
- For new work, Sales or Operation creates the same Display Request, recording new placement,
  swap, removal or relocation intent, Sales's agreement/evidence and actual negotiating person.
  Existing exact Units come from Inventory; new goods come from Catalog. Retain incomplete model
  evidence as a draft and return to that draft after Catalog resolution. Price is not a physical
  consignment gate. Check active overlapping arrangements before creating a second commitment.
- Operation checks the actual pickup, destination, contact, transport party, dates and space for
  each leg. The system derives the governed execution path from intent, ownership and source;
  staff review it rather than choosing an unfamiliar document family. Third-party pickup addresses
  are not automatically Carres Sites. Real custody/provenance determines the appropriate source.
- On arrival or collection, authorised receiving/handover people use Receiving/Stock/Delivery's
  own action and record exact goods, condition and evidence. Sender and receiver evidence stay
  distinguishable. A price follow-up never disappears because the lorry trip finished.

**2. Goods and documents, with no duplicate entry**

| Operating case | Connected records and staff journey |
|---|---|
| Supplier-owned new display | Display Request → Consignment Order with new goods/destination → one Receiving flow at actual receipt → supplier-owned stock at that Site; no payable from receipt |
| Carres purchases a display | Display Request → existing Manual Purchase Request approval → Purchase Order → Receiving; keep those existing approval and ownership rules |
| Same-supplier swap | One Display Request connects incoming and outgoing scopes; one combined price-free Consignment Order PDF instructs the supplier; linked Consignment Return retains exact old Units and collection progress without a duplicate supplier notification |
| Move between Carres Sites | Source-linked Stock Transfer, separate pickup/arrival evidence, same ownership and permanent Units; no supplier return merely because goods leave the showroom |
| Return via warehouse later | First the Site-to-Site Transfer, then supplier return from the actual warehouse. Keep supplier collection outstanding after warehouse arrival; coordinate a future supplier delivery only once the collection appointment is confirmed |
| Return without new goods | Source-linked Consignment Return, exact supplier-owned Units, supplier instruction and real handover; no fictitious incoming order or payable |
| Sell Carres-owned purchased display goods | Ordinary Sales Order/Invoice → eligible exact-Unit reservation → customer Delivery; no supplier sales notification. Supplier-owned display goods are excluded (§7.7) |
| Customer later returns it | Service-approved remedy → actual return/inspection → confirmed supplier terms/outcome → owning goods/Finance actions under §9.11; preserve original sales, delivery and invoice history; no automatic ownership or payable reversal |

The Dorsettloft example is the acceptance story: pickup new sofas from the recorded 2990 location
for PJ, move exact old PJ sets to Carres warehouse, then later hand those same old Units to
Dorsettloft. All three legs remain visible in one arrangement; no leg implies another is complete.
A set's component identities follow Catalog, not a transport quantity or a count of imported rows.
PJ's roughly 11 sofa sets remains a layout reference only; no fixed category-capacity settings.

**3. Pages, object composition and lookup**

The approved SHOWROOM target has three destinations: Display Requests, Consignment Orders
and Consignment Returns. They are record views, not compulsory repeated creation steps:

| Surface | Staff's reason to open it | Recommended content / primary action boundary |
|---|---|---|
| Display Requests | Start or find the complete arrangement | Date/number, showroom, supplier scope, negotiating Sales, incoming/outgoing goods and concrete unresolved facts; create here or from selected Stock Units |
| Consignment Orders | Find instructions to obtain supplier-owned goods | Source-prefilled incoming/swap instruction, actual pickup/destination, independent dates and linked receipt/return progress |
| Consignment Returns | Find goods awaiting supplier collection | Source-prefilled exact goods/current location, collection arrangement and actual handover evidence; no duplicate re-entry for a swap |
| Inventory filtered to a showroom | See goods actually held and their condition/ownership | Existing Stock register, exact Units and source/history; select eligible outgoing Units here; no second showroom inventory |

These content descriptions are review intent, not newly approved literal column headings. Final
register wording/order must replace stale §9.8–§9.11 lists and enter COPY in the same approval;
no generic Work column or duplicated action queue. Use shared Register search, sortable/filterable
headers, permitted Columns and scoped export. Search should reach record number, source, supplier,
model/SKU and Unit ID. Row expansion has only the goods-disclosure job. Identity opens the full
object; other document links open their owning record. Preserve filters and return context.

The Display Request object follows the shared Object Detail grammar: identity/source → current
owning action → incoming/outgoing goods and each movement's arrangement/actual evidence → supplier
communication and linked commercial evidence → connected records and History. Concurrent legs
must remain visible; the route is not a rigid wizard that forces old-out before new-in. Use existing
Block and admitted Work components, with one primary action for the active owning form. An
internal request has no PDF split. Supplier document issue/revision uses the governed preview
composition; read-only document detail returns to full width. No local component or second form.

Quick Rail reads source/contact/document/Unit facts and links to the owning object. Calendar reads
confirmed/arranged dates from the owning schedules; an unknown date is not invented to place a row
on a calendar. Customer information and selling prices stay out of supplier consignment PDFs.
**DOCUMENT PURPOSE AND ACKNOWLEDGEMENT — APPROVED TARGET / NOT BUILT; Jess, 2026-09-29.**
§9.9 owns Consignment Order (obtain supplier-owned goods); §9.10 owns Consignment Return (hand
goods back). Do not merge their names into Consignment Note or add a third manually created
acknowledgement. Actual showroom receipt and supplier collection evidence attach to their owning
actions. One arrangement pre-fills the correct documents; one combined swap PDF can cover the two
instructions while receipt and handover remain independently evidenced. Detailed shared-kit
composition still needs design closure; naming approval is not rendered-screen acceptance.

**DISPLAY REQUEST OBJECT STRUCTURE — APPROVED TARGET / NOT BUILT; Jess, 2026-09-29.**
Owner approved the one-page reading order below: arrangement identity, current applicable action,
goods, each movement leg, connected documents/evidence, commercial follow-up and History. Keep
concurrent legs and remaining scope visible; all completed-looking states require owning evidence.
This is semantic structure approval, not a rendered mockup, final new English copy, responsive
acceptance or application-build instruction. Reuse the shared Object Detail and Block grammar;
Workspace embeds the same owning forms.

| Reading order | What the operator sees / does | Guard against repeated or misleading work |
|---|---|---|
| Arrangement identity | Request number, showroom, purpose, supplier scope, negotiating Sales and actual recorder, source message/quotation | Known facts come from source; no fabricated customer Sales Order or universal arrangement owner |
| Current applicable action | The permitted owning action for the signed-in actor, opened directly when arriving from My Work; other concurrent obligations stay visible | Missing model, contact or appointment opens its exact resolution; missing price stays Sales follow-up and does not block physical arrangement |
| Goods | Requested new Catalog goods with configuration/quantity; outgoing existing Stock Units with model/current location/ownership | Distinguish sofas, sets and physical Units. Unknown models/identities remain unresolved rather than sample data being saved as fact |
| Each movement leg | Actual pickup/destination, party/contact, planned date, actual result and remaining goods together; open the owning arrange/receive/handover form | Independent dates and partial outcomes; no automatic receiving from PDF issuance, no supplier return inferred from warehouse arrival |
| Connected documents and supplier evidence | Source-linked Consignment Order, Stock Transfer, Consignment Return, issued version/send evidence and actual proof | Review derived documents without retyping; swap links its return but sends one supplier instruction. Creating the request alone does not issue every downstream document |
| Commercial evidence and History | Quotation versions, attributable Sales confirmation or outstanding confirmation, actual actors and changes; permission-scoped Finance links | Operation records evidence without accepting terms; completed transport does not erase commercial/Finance work |

**Walkthrough data is illustrative:** the owner supplied two new sofas at 2990 and two old PJ sets
returning via Carres warehouse, but no exact models/Unit IDs, transport company or dates. Therefore
show those known quantities and route facts and leave the missing facts explicit. Do not display
fictional document numbers, a named Sales person, a completion tick or a scheduled supplier visit
as a real record. First completion is to establish exact goods and actionable transport facts;
subsequent action depends on the actor's permission and the actual saved source state.

The example's three legs read: 2990 → PJ new goods; PJ → Carres warehouse old goods; Carres
warehouse → Dorsettloft those same old goods. If evidence later confirms the first two legs,
only the supplier collection remains physically open. Commercial work, if any, stays separately
visible. Pure placement omits outgoing goods; standalone removal omits incoming goods. Never force
staff to fill empty sections simply because the swap example has both.

Source-linked document review retains the request context and returns to it after the owning
result. Read view does not show a meaningless blank PDF pane. Errors preserve draft input;
loading/failure/unknown are not zero quantities. Keyboard and mobile reflow must preserve the
same meaning and next action, with no claimed visual validation until the governed render review.

**Display Request composition — APPROVED TARGET / NOT BUILT, Jess, 2026-09-29.**
Applies the installed `design:design-critique` skill to the approved semantic journey, not to a
rendered screen. Owner selected the expanded movement-card direction with the clarification that
more locations require additional cards, not a fixed three-card layout. Document purposes and the
approved semantic section order remain unchanged. Research source snapshot
`f1b2ed63c641dd05d3fa8c8c4ef24c43026855e9`; `portal-nav.ts:402–405` still marks the four Showroom
pages `soon: true`. No screenshot, accessibility pass or numeric visual score is claimed.

Whole-page review, including entry and downstream consequences:

| Severity / evidence | Operator impact | Required resolution |
|---|---|---|
| Red design risk: §9.8 allows parallel legs, while no rendered Display Request exists | A sequential-looking page could hide old goods still awaiting collection | Show all leg identities and remaining scope; never gate new-in on old-out or mark the whole request done from one receipt |
| Red integration gap: §9.8 and Stock §12.9 identify unverified opening ownership/identity | A model or count can select the wrong physical goods | Catalog for new goods, exact Stock Units for old goods; show identity/ownership gaps without fabricated IDs or receipts |
| Amber composition gap: §9.13.3 specifies meaning but no exact presentation | New staff may open several documents to understand one arrangement | Keep identity, applicable action, goods, legs, documents, commercial evidence and History on the one page; prefill owning actions |
| Red evidence risk: Stock §5 separates origin handover from arrival | A pickup tick could wrongly put goods at the destination | Keep both actual events and current holder; partial/mismatched goods retain their own outstanding facts |
| Amber assignment integration gap: §9.13.5 and Workspace §2 | A named Duty alone does not supply an executable personal action | Resolve actual active holder/cover and permission; no fake Sales Order or universal arrangement owner; Work admission remains unbuilt |
| Amber commercial risk: §9.8 permits missing price | Price questions could obstruct transport or disappear after it | Commercial follow-up remains separate and visible; unknown price is not zero or accepted terms |
| Red downstream gap: §9.12 Finance capability mapping | Invoice-number deduplication could be mistaken for exact sold-Unit matching | Link to Finance without a local payable writer or unsupported matched/paid claim |
| Amber unmeasured behaviour: no rendered object | Phone, keyboard, long descriptions and failed saves could hide the next action | Preserve identity, visible missing facts and input; dirty/error section stays open; validate governed viewport/zoom/keyboard cases after approved composition is rendered |

**Reference evidence and limits.** Official documentation was inspected on 2026-09-29:

- [Shopify receiving transfers](https://help.shopify.com/en/manual/products/inventory/inventory-transfers/receiving-and-managing-transfers): individual receiving quantities and remaining progress inform the selected expanded movement sections. Carres keeps its own custody/inspection rules; Shopify availability and cancellation semantics are not imported.
- [Linear parent and sub-issues](https://linear.app/docs/parent-and-sub-issues): related work remains under one parent and may be shared across teammates. KEEP linked child records as a reference principle, without adopting a collapsed default. Reject inherited ownership and automatic parent closure for Carres physical facts.
- [Trello boards and lists](https://support.atlassian.com/trello/docs/creating-a-new-board/): parallel lists/cards were considered for comparison. The selected Carres presentation uses vertically ordered movement sections; reject drag-to-complete and a new board engine.
- Local 2990 `docs/SUPPLY-CHAIN-DOCUMENTS.md` retains distinct supplier order/receive/return records and shared PDF generators. KEEP source/document linkage under all options, not document-first input or extra manually created records. This local code evidence is not a live 2990 UI inspection.
- Odoo batch-transfer full-page retrieval failed in this pass; its search extract is not evidence for any proposed layout.

The page retains the approved section order and full-width, one-scroll internal object with no
PDF split or new tabs. One existing shared `Block` represents each movement leg, expanded by
default. The operator can add another leg within the same Display Request under §9.8. Do not
hard-code the example's three routes, introduce a new component, or require three empty cards for
a simple one-leg arrangement. New literal action/field wording still follows COPY governance.

Within a wide block, related facts use the kit's multi-column arrangement rather than six stacked
fields. Source-owned action opens its existing form, with one primary writer at a time. Mobile
stacks each block's facts in logical order. Every leg retains its own goods, contacts, dates,
actual results and remaining scope. Every new card repeats the same operational questions under
§9.8. No automatic carry-forward from the previous card: optional, initially unchecked reuse is
explicit and field/group-scoped, with the source and copied values visible. Selecting existing
goods still reads their authoritative Stock/Catalog facts; that is not an assumption that another
movement uses the same goods. Use the existing kit Checkbox, not a new control. Final literal
labels must identify what is being reused; a bare same-as-above caption cannot stand alone.

Explanatory structure only, not final screen copy or a real completion record:

```text
Request identity / applicable action / incoming and outgoing goods
[Pickup → destination]  goods / party / planned dates
                       actual pickup / arrival / remainder
[Pickup → destination]  goods / party / planned dates
                       actual pickup / arrival / remainder
[Add another movement leg to this same arrangement]
Connected documents / commercial evidence / History
```

Trade-off: more vertical scrolling, but route facts can be read without opening each section.
Falsifier: operators repeatedly lose the pending supplier collection or must open other records
merely to discover pickup/destination/remaining goods already known here. The whole arrangement
never becomes complete merely because its last visible card was added, a document was issued or
one leg finished. No fixed wizard order applies to independent routes; linked movements of the
same Unit still respect actual custody and evidence.

This approval selects the expanded movement-card composition and add-leg capability only. It
does not approve application build, unresolved literal copy, Finance rules or unverified
responsive behaviour. Rendered review and the other §9.13.7 closure items remain outstanding.

**4. Exceptions and record lifecycle**

- Draft editing preserves creator/history and consumes no official new Unit IDs. Repeated saves
  or issue attempts cannot duplicate commitments. Another person's intervening change is shown
  before an action is accepted; keep unsaved input on a failed save.
- Issued documents retain their number and historical versions. Changes affect only outstanding
  scope and require revised supplier communication where instructions changed. A send record
  names version, actual recipient/channel/actor/time and never proves supplier acceptance. Check
  an existing external send before resending; missing evidence is not proof it was never sent.
- Amend, cancel, partial pickup/receipt and redirection follow §9.8 and Stock §5. Never delete a
  physical event, restore a location by cancellation, retire a received Unit or conceal a leftover
  Unit with whole-document completion. Reopen only the obligation affected by an evidenced change.
- Wrong/short/damaged goods remain observable receipt facts and controlled Stock states. Supplier
  recovery uses Supplier Claim; customer remedy uses Service. Reservations cannot be silently
  released to satisfy a display move. A substitute physical item keeps its own identity.
- Existing display stock without a historical order uses verified opening-stock provenance where
  permitted by §6.2; never fabricate an old Consignment Order or receipt. Verification must establish
  physical identity, supplier, ownership and current location. If evidence is missing, expose the
  source gap and owning resolution before a source-dependent return/claim/settlement. This proposal
  does not bypass a formal Claim's purchase-source requirement or authorise a production backfill.
- Do not add copy-live-document or bulk physical completion. Later copying, if justified, can only
  seed an uncommitted draft without received/sent/accepted-price facts or blindly reused Units.
  Safe scoped read/export remains available. Archived/completed records retain linked History.
- Loading, failure, empty and filtered-empty are distinct. A failed read is never zero stock or
  completion. Disallowed actions explain the specific missing source, permission or affected Unit.

**5. Ownership, Settings and approved assignments**

Approved assignments remain: Sales negotiates commercial terms, Operation records/executes permitted
arrangements, PO Duty owns supplier-document/follow-up actions, GRN Duty/eligible receiving people
own receipt actions, physical handlers own their evidence, and Finance owns invoice/credit/payment.
Workspace resolves active people and dated covers. No arrangement gains one universal owner.

**NO-SALES-ORDER DISPLAY TRANSPORT — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.**
Existing Delivery Duty coordinates carrier/date/contact arrangements for display transport that
has no Sales Order, through the Shared Duty Resolver and governed cover. PO Duty retains supplier
commitments and documents. Routine customer transport remains with its Sales Order PIC. Do not
create a fake Sales Order, new roster or automatic assignment to the request recorder. This
coordination role does not grant Stock/Receiving/physical-handover write permissions. Warehouse,
Delivery and Workspace retain their owning action and admission contracts; unknown dates and
missing eligible holders stay visible. Delivery MASTER §13.1 and Workspace MASTER §4 carry the
same assignment boundary. This is an approved role rule, not proof of implemented Work admission.

**DEPARTED SALES NEGOTIATOR — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.** Authorised
management designates an active Sales successor for unresolved commercial follow-up when the
original negotiating Sales person leaves permanently, recording reason/effective date and actual
assigner. Retain the original negotiator and historical actors as separate facts. Temporary
absence follows governed cover, and a missing successor remains an explicit assignment gap;
Operation never inherits negotiation or acceptance authority. Workspace owns the person-assignment
contract; no Showroom-local rota, invented manager role or self-assignment bypass. This ruling
does not grant additional price, Catalog or approval permissions.

Settings remains distributed by ownership: Warehouse Sites/addresses, Catalog products/suppliers
and identity mode, supplier contacts/terms in their existing authority, Workspace Staff & Duties,
and existing purchasing numbering/permissions. There is no new showroom Settings page, fixed
capacity setup, supplier portal or duplicate contact list.

**6. Finance connection, reporting and external boundary**

Supplier-owned display receipt and movement create no payable or sales-based supplier settlement.
Purchased goods use ordinary purchase-invoice matching in Finance; customer sales create no supplier
notification. Unknown or conflicting ownership/cost remains a source-resolution gap, not RM0 or an
automatic conversion. Finance posting and corrections remain in their owning authority.

Central Reports/scoped exports read Site × supplier × exact Unit movement, current display goods,
outstanding supplier collection, unsent-current-version supplier instructions and unresolved commercial facts.
Finance settlement data is linked according to permission, not duplicated in an Operation ledger.
Dates, scope and authoritative source remain clear; unavailable data is not a zero total.

Supplier/carrier conversations can stay on existing channels, with relevant evidence recorded on
the arrangement. No external invitations, account creation, live cutover or old-channel shutdown
is approved. Opening data needs verified identity/provenance; the PJ36 test import is not a
production migration plan. The 2990 pickup location must be verified as an operating address and
holder, not assumed to be the reference software repository or a Carres-controlled warehouse.

**7. Whole-solution review — consolidated 2026-09-29**

**Fresh measured reality:** authenticated production navigation on 2026-09-29 showed Display
Requests, Consignment Orders, Consignment Returns and Consignment Sale Notices as `Coming soon`.
Inspection was read-only after ordinary sign-in using existing filled credentials; no business
record/settings were changed. The displayed production SHA was not established. This confirms
unavailable destinations, not implementation parity with a particular commit or rendered design
acceptance. Existing Stock, Receiving, Delivery and Finance capabilities retain their separately
measured build states; their existence does not prove the Showroom connections are complete.

**Approval ledger:** the operating model, document purposes, price-independent arrangement,
Sales/Operation responsibilities, no extra handoff approval, physical exception rules, confirmed-
terms customer-return journey, no fixed capacity settings, expanded movement cards, adding legs
and explicit per-card answers with optional unchecked reuse are APPROVED TARGET / NOT BUILT.
The detailed presentation/copy recommendations and Finance matching interface below remain
PROPOSAL / NOT LAW. This review does not ask the owner to approve the earlier rules again.

**Complete operator journey and owning result:**

| Stage | Staff does | Source / write door | What ends this work |
|---|---|---|---|
| Start day / find arrangement | Open own admitted action from Work or search the request register | Workspace projection → same Purchasing/Stock/Receiving/Delivery action | Only the owning saved result; no local Done |
| Record Sales agreement | Sales or Operation proxy records negotiator, actual recorder and supplied message/quotation | Display Request; source contacts and products remain owned elsewhere | Draft saved; saving neither approves price nor issues documents |
| Select goods and add routes | Every card answers goods/quantity, pickup, destination, contacts, transport party and dates; optional explicit group reuse | Catalog identity for new goods; Stock identity for held goods; arrangement owns intended scope | Required facts available for the specific next action, not an all-fields-complete gate |
| Resolve missing goods/source | Retain photos/model evidence; resolve Catalog or verified opening-stock source without a fictional old order | Catalog / Stock / existing source enquiry | Required identity/provenance established; formal Claim source guards remain |
| Review execution documents | Use verified ownership/purpose/locations to prepare supplier order, internal transfer or supplier return | Existing owning document; same-supplier swap retains one combined external instruction | Authorised issue with its actual source/version; no movement or payable inferred |
| Send supplier instruction | Review recipient and current PDF, then record actual sending | Purchasing shared sending authority | Exact version/recipient/channel/actor/time recorded; no inferred supplier acceptance |
| Arrange transport | Record actual parties, contacts and agreed dates for each relevant leg | Delivery Duty for no-Sales-Order coordination; owning schedule/actions | Evidenced arrangements exist for covered scope; unknown date remains unknown |
| Collect / receive | Physical participants record exact goods, condition, handover and receipt separately | Stock/Delivery physical doors and Receiving | Accepted actual events for those goods; unmatched/remaining goods retain work |
| Handle changes / issues | Revise unexecuted scope; record wrong/damaged/short goods; preserve performed work | Owning amendment, inspection, Claim or redirect/return door | The specific correction/outcome, not an erased old event |
| Supplier collects old goods | Record actual recipient and exact returned goods at their current location | Consignment Return instruction + owning physical handover | Accepted supplier collection for covered goods; arrival at Carres warehouse alone is insufficient |
| Customer later returns | Apply Service remedy and actual receipt/inspection; use confirmed supplier terms or obtain missing agreement | Service, Stock, Purchasing and Finance retain separate authority | Each authorised remedy, physical and commercial outcome; no automatic ownership/credit reversal |
| End day / later lookup | Review remaining goods, unconfirmed dates, identity gaps and commercial follow-up; find historical evidence | Same owning records and permitted Reports/export | No abandoned remainder concealed by a whole-arrangement completion tick |

**Recommended complete page contract — PROPOSAL / NOT LAW for remaining literal copy and
register details; approved expanded-object structure is retained.** All three registers use the
existing Shell/Register grammar, date then identity, search/filter/Columns/export and goods-only
expansion. No KPI strip, row writers, local work queue or second personal-layout engine.

| Destination | Recommended default reading order (business facts, not approved new labels) | Entry/action |
|---|---|---|
| Display Requests | Request date; full request identity; affected showroom(s); supplier(s); negotiating Sales; arrangement purpose; movement count; concrete remaining movement scope | Create here or from Stock selection; identity opens one full arrangement |
| Consignment Orders | Document date; order identity; supplier; source request; actual destination(s); incoming goods; confirmed supplier date(s); received/remaining scope; current sending evidence | Source-derived only; identity opens instruction/receipt/linked return |
| Consignment Returns | Document date; return identity; supplier; source request/order; current pickup location(s); confirmed collection date(s); handed-over/remaining scope; current sending evidence | Source-derived only; identity opens supplier-return scope and real handovers |

Multiple suppliers, Sites, dates or source documents never collapse to a fabricated single value.
Use a truthful count/disclosure; identity and evidence remain accessible. Counts of movements,
planned goods per leg and distinct physical goods are different measures. One Unit on three linked
legs is one physical Unit and three movements. Do not sum route quantities into showroom stock.
No fixed sofa/mattress/bedframe capacity or assumed set-to-Unit conversion is introduced.

The selected object remains one scroll:

```text
Display Request identity / recorded Sales agreement
Current applicable owning action
Goods / source identities
Movement card: goods + quantity / pickup / destination / contacts / party / dates
Movement card: same questions, independent answers, explicit optional reuse
Add further movement card
Connected documents / supplier sending evidence
Commercial evidence / permission-scoped Finance links
History
```

New literal-copy candidates for owner review, not shipped text (COPY-STANDARD, "Showroom movement controls", also marks them PROPOSAL / NOT LAW): `Add movement`, `Movement {n}`,
`Same goods as movement {n}`, `Same transport as movement {n}`, `Choose goods for this movement`,
`Choose pickup location`, `Choose delivery location`. Every reuse control must name the scope and
source card; it never means all fields are the same. Established words such as `Pickup Location`,
`Delivery Location`, `Qty`, `Supplier`, `Evidence`, `History`, `Save changes` and `Cancel` keep their
COPY meanings. The add/reuse controls use existing Button/Checkbox; no component admission is
being invented. If any exact literal is not accepted, it remains proposed and cannot ship.

**State and interaction contract:**

| Situation | Required behaviour |
|---|---|
| New / ordinary read | Source-prefilled known record facts, independently answered movement cards; no fabricated completion or three mandatory slots |
| Active edit | One owning form/primary save; preserve input and reveal affected scope; unsaved/error section stays open |
| Waiting / missing facts | Name the missing fact and its owning resolution; unknown date is not late, unknown price is not zero; relevant work can proceed independently |
| Partial / mismatch | Exact actual goods, remaining goods and recorded location remain distinguishable; quantity equality cannot hide wrong identity |
| Completed | Show source evidence, actor/date and remaining independent obligations; no manually checked completion |
| Due / missed | Only a governed saved date/calendar and unfinished owning fact produce the indication; no invented default urgency |
| Loading / failed read | Use shared loading/error states; retain trustworthy last-read data with stale status where applicable, never zero or Done; retry reads |
| Empty / filtered empty | Distinguish no records from no matches; clear filters returns the permitted population |
| Failed save / concurrent change | Keep input, show the actual refusal/conflict, reload/reconcile affected facts before retry; never overwrite another actor silently |
| Permission denied | Respect owning permissions; an unavailable action explains the specific reason and routes to the owning authorised role without granting access |

**Responsive acceptance intent, not a completed measurement:** at 1440/1180 use full-width shared
Blocks with readable fact columns; at 820/743 let facts wrap without dropping routes or forcing an
external PDF pane; at 390 stack facts and owning forms in the same order, keep identity visible,
and let only tables scroll horizontally. At all sizes and 200% zoom, keyboard users reach card
controls, goods selection, errors, save/cancel and linked evidence in logical order. Do not copy
Trello's drag interactions or Linear's automatic parent close. Rendered contrast, dimensions,
touch targets and focus behaviour remain a validation dependency, not a reason for another
business interview or a fabricated visual score.

**Finance boundary — APPROVED / LOCKED; Jess, 2026-10-02:** supplier-owned display stock
is not sold and its receipt is not billed as a purchase. Carres-owned purchased stock follows
ordinary PO/receipt supplier-invoice matching. Customer sale, customer return, supplier recovery,
credit and payment remain distinct owning facts. No sale-notice matching interface is required.


**Closure and dependencies:**

- Resolved rules above are not pending owner questions. Stock-label/set reconciliation and PJ
  opening ownership verification are physical-data/cutover work; never fabricate them to close a
  planning document. Their acceptance requirement is known even though the real records remain
  unverified. Official issue still needs governed Catalog identity.
- Source-linked document/receipt/transfer writers, versioned sending, exact goods identities,
  active-person duties/cover and Work admission are approved-target implementation dependencies.
  Missing code alone is not an unresolved business decision.
- Detailed register/copy recommendations and the Finance interface remain the current consolidated
  proposal. Finance's precise matching/posting contract is not proved by the existing ordinary
  bill UI. This is a real boundary to close before claiming complete cross-module readiness.
- Current non-goals remain: fixed capacity, new Consignment Note, second inventory/task/settlement
  ledger, automatic price acceptance, automatic ownership reversal, supplier account rollout,
  external-channel cutover, and production backfill without its own verification/authorisation.
- A complete owner review of the remaining proposal, authoritative persistence and the outstanding
  cross-module contract are required before `PLAN MISSION COMPLETE`. No application implementation,
  Card, production migration or rendered UI acceptance is claimed by this synthesis.

---

## 10 · Work, Quick Rail and Calendar

| Trigger | Owner rule | Action example | Completion fact |
|---|---|---|---|
| Manual Purchase Request awaits decision; due no later than its Order By | `Purchasing Approver` through the Shared Duty Resolver | `Approve purchase` (context: `Manual Purchase Request · Ready Stock · Carres Klang · Hooka`) | Stored approval or refusal with Primary, Cover and actual actor/time exists |
| Approved Manual Purchase has remaining demand; due on its Order By | Normal PO Duty/cover; Operations Superuser may act | `Issue PO` (same business context; distinct by request UUID) | Current PO version has confirmed-sent evidence and actual actor |
| Approved demand ready | Normal PO Duty/cover; Operations Superuser may act | `Issue the purchase order to Hooka` | Current PDF version sent, outbound fact and actual actor exist |
| Arrival due next Office work day | Normal PO Duty/cover; Operations Superuser may act | `Confirm Hooka's Fri, 28 Aug arrival` | Supplier DO or actual matching-date answer, channel, evidence, recorder and times exist on the exact PO |
| Required arrival at risk | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka if the goods can arrive by Fri, 28 Aug` | Governed supplier answer/exception, evidence and actual actor exist on the exact PO |
| PO/CO goods arrive | Normal GRN Duty/cover; Operations Superuser may act | `Receive PO-20260820-4827 from Hooka` | Exact Receiving Session records physical outcome and numbered GRN |
| Supplier DO/evidence missing | Normal GRN Duty/cover; Operations Superuser may act | `Add the Supplier DO before you finish receiving` | Supplier DO reference/evidence and actual recorder exist on the Receiving Session |
| Partial receipt leaves balance | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka for the balance delivery date` | Evidenced balance promise exists on the exact open PO line |
| Showroom display change | Negotiating Sales for commercial facts; authorised Operation proxy retains that Sales person (§9.8). Execution uses each owning action's Duty/cover | `Record the current Unit and requested model` | Required request facts exist; physical and commercial obligations close separately |
| Supplier claim reply missing | Current PO Duty | `Ask Hooka to reply to the supplier claim` | Supplier reply exists |
| Return collection missing | Current PO Duty | `Ask Hooka for the collection date` | Collection date exists |
| Repair date passed | Current PO Duty | `Ask Hooka when U1-000-001 will return` | The Units are received back (GRN) or an authorised outcome closes the repair; a Supplier reply or date never closes it (§9.7, corrected 2026-09-28) |
| Supplier invoice missing | Finance/AP Duty | `Ask Dorsettloft to send the invoice` | Supplier invoice fact exists |

Quick Rail may show source, exact Unit, supplier contact, current document/version, destination,
proof, linked object and read-only foreign-module state. It never edits another module's truth.

Calendar displays only governed work dates with actual weekday + calendar date. Purchasing /
Operation uses the Office calendar (Mon–Fri); Receiving / GRN / Warehouse uses the Warehouse
calendar (Mon–Sat). Sunday and Selangor public holidays are excluded. Recorded business dates are
never silently moved: PO Delivery Date, Supplier Confirmed Delivery Date and Goods Received Date remain the
dates actually stated/observed. A computed work due date may use its governed calendar only when
the rule and resulting date are visible.

`My Work` is the employee's complete daily list and is the default even for a manager. `Team Work`
is supervision over the same set: normal owner, dated cover, actual actor, due/late state, named
blocker and missing evidence. Neither surface exposes manual `Done`; actions close from the module
completion facts in the table above.

---

## 11 · Settings

Settings lives under the global header gear and requires authorised roles. It includes:

- document number format/version and locked Unit ID family;
- a read-only door to `Settings → Staff & Duties` for PO Duty / GRN Duty and Buddy-cover settings; Purchasing Settings
  stores no roster and performs no Duty calculation;
- The legacy `/api/operation/po-duty` response-shape adapter is retired. `PurchaseOrdersPage`,
  `SalesOrderWorkspace` and `OperationOrdersControl` consume the shared Workspace Duty resolver;
  the Quick Rail reads the shared Work response. No caller may restore a direct `ops_po_duty`,
  cover-table read, page-local rota or compatibility response.
- `PO Days` decides the days a PO window opens (owner correction 2026-09-25, §5.6.1); Jess sets
  it to every Office working day. It creates no free-text reminder or `ops_tasks` row. **Target:** issue work is one Work occurrence per PO window
  over the exact eligible demand, resolved to current PO Duty and closed only by the owning
  order/purchase facts. The built per-Sales-Order `issue_po` projection is implementation evidence
  that must converge onto the window occurrence, not the target.
- approval limits and Manual Purchase purposes;
- default `Supplier Deliver To` (`Carres Klang`) and permitted destinations, including add, address,
  availability, default, receiving station/party, arrival calendar, linked Warehouse/no-Stock
  consequence, Unit-scan requirement and signed-DO evidence controls;
- supplier channels, contacts, `Supplier addresses`, `Supplier work week` and Supplier × Product
  Category Production Days. `Transit days` was removed from Settings and from every date by owner
  ruling 2026-09-29;
- PO grouping rules and source-preservation law;
- purchased vs supplier-consignment agreements and settlement terms;
- supplier Unit-label capability (package, physical Unit, future machine-readable support);
- outside-readable PDF templates and permitted external notes;
- claim/return/repair outcome permissions;
- customer-privacy exclusion from supplier documents.

**SUPPLIER COMMUNICATION — BUILT / PRODUCTION-VERIFIED 2026-10-01.** The existing Settings
authority governs separate Email, WhatsApp group and preferred Channel saves through migration
0628; each changed field records old/new, actual actor and time. Anonymous and unauthorised
Operation writes are refused. Live Settings saves and database readback confirm Hookka Industries
and Ohana use `hookka.manufacturing@gmail.com` and default to Email; Nice Future uses
`farithazelam@gmail.com` with its existing WhatsApp behavior preserved. Four changes were saved
by the authenticated shared `principal` account, not Jess personally. Existing groups, historical
recipients and supplier access were not changed. No email or WhatsApp message was sent.

Hookka's fixed Deliver To is the existing HOUZS destination, with NETS collection and a populated
warehouse address. Its supplier factory address is not a substitute destination. Ohana's actual
fixed destination still has no address and correctly remains a named issue blocker; no address was
invented or copied from Hookka.

**PRODUCTION-DAY VALUES — OWNER CONFIRMED 2026-10-01, APPROVED / LOCKED.** Mattress: **7 working
days**; Bedframe: **7 working days**; Sofa: **14 working days**. Apply these values to missing
applicable Supplier × Category settings,
using the existing supplier-working-calendar calculation, not calendar days or added transit.
Do not silently replace an existing explicit supplier-specific value. The live set of missing
rows were rechecked on 2026-10-01. The authorised Purchasing Settings door populated seven
missing rows: Armani, Dorsettloft, Hookka Industries and Todern sofa = 14; Laveo, NB Furniture
and Rennes bedframe = 7. All prior values stayed unchanged. Readback verified all eleven
Supplier × Category rows and seven old-NULL/new-value history entries. The actual authenticated
settings actor was the shared `principal` account, not Jess personally. No accessory default was
written. Do not ask the owner to supply these values again.

**MP / PILLOW — OWNER CORRECTION 2026-10-01, APPROVED / LOCKED.** MP/protectors and pillows
are ready stock at the warehouse, not goods requiring a standard 7-working-day production wait.
Use actual governed stock availability for customer fulfilment. No 7-day accessory default is
approved, and no such default is to be populated by the placement-unblock BUILD. **For these two
goods, replenishment orders from China require 2 months of order lead time (owner confirmed
2026-10-01).** This governs advance replenishment planning, not a delay on customer fulfilment
from available warehouse stock. Preserve the duration as months, not an assumed 60 days or a
working-day production value; do not write it blindly into the existing Supplier × Category
Production Days field. This approval supplies the replenishment lead time only, not a minimum
stock level, automatic purchase authority, separate transit duration or guaranteed arrival date.

Supplier WhatsApp group/email maintenance is an approved §11 capability, not an owner data-entry
omission. Verify its actual delivery state in BUILD. Resolve a PO's address from its governed
Deliver To identity: a supplier address may be reused only where that destination genuinely is
that supplier location. Do not substitute the factory address for a different delivery destination.
A genuinely unknown destination address remains named as missing; never fabricate it.

Every setting change has actor, time, old value, new value and effective date. It never silently
rewrites an issued document or historical Unit.

---

## 12 · Reports and exports

Reports are generated from authoritative records and open in central Reports or from a Register:

- demand remaining/covered/ordered by source;
- purchase quantity and open balance by supplier/SKU/destination;
- unconfirmed, changed and passed supplier delivery dates;
- partial receipts, quantity/condition differences and missing delivery notes;
- supplier delivery, claim, return and repair performance;
- supplier-owned Units by showroom, label state and age;
- consignment placement and return by supplier/Unit/date;
- document versions not sent to the supplier;
- Units allocated but not received, legacy Units not labelled and replacement lineage.

Finance owns supplier invoice, credit, payable, settlement and payment amounts. Operations exports
are snapshots, not editable truth or a second settlement ledger.

---


### 12.1 Reference capability disposition — owner ruling 2026-10-01

**APPROVED SCOPE DECISIONS; not an implementation or production verification claim.** The owner
closed the remaining Houzs capability choices for this review as follows:

| Capability | Carres disposition |
|---|---|
| Supplier on-time / quality performance | KEEP the approved §12 delivery/claim performance reporting target; complete through the reporting surface, not a new Purchasing scoring engine. Approved does not mean built. |
| Scheduled future supplier prices | Catalog owns price maintenance; do not create a competing Purchasing price scheduler. |
| Copy previous PO | REJECT for this scope. New purchases continue from authorised source demand; no blank/independent PO entrance. This is a scope ruling, not a verified claim about a Houzs button's runtime behaviour. |
| Multi-PO printing / multi-PO date recording | DEFER until measured operator need warrants it. Existing multi-line recording within one PO remains; it is not equivalent to cross-PO bulk operation. |
| Excess receipt | KEEP Receiving's Extra Qty handling and existing stock-availability safeguards; do not introduce a second overreceipt engine. |

**Immediate delivery priority:** complete the already commissioned PO-placement unblock. Supplier
WhatsApp group/email maintenance belongs in Settings under §11, with authorised editing and
actor/time/old/new audit; it is not an external-contact or channel-cutover authorisation. Current
supplier-specific missing-contact, address and production-day lists must be remeasured at delivery;
chat-provided examples are not verified live master data and missing values must not be invented.
The four approved exception rulings remain approved targets; recording them does not silently add
their implementation to the placement-unblock commission. No duplicate BUILD chat is required when
that commissioned work is already in progress. This review does not certify the whole module as
built or production-verified.

---

## 13 · Permissions

| Role | May do | May not do |
|---|---|---|
| Sales / Showroom | create Display Request; read connected purchase state; receive/sign/report at showroom if rostered | issue PO/CO, change ownership |
| Requester | create Manual Purchase and supply missing request facts | issue PO or mark ordered merely because they requested it |
| Purchasing Approver (an active Principal person; today Jess) | approve/reject governed internal buy and commercial exceptions | decide a Manual Purchase they raised; replace receiving/PO evidence |
| Normal PO Duty / dated cover | owns the daily work; issue/revise supplier documents; record promises/claims through the one door | approve unauthorised price; post stock or supplier payment |
| Any active Operation person (owner rulings 2026-09-25 / 2026-09-29 / 2026-10-01) | issue and record current-version PO sending without holding Duty; record supplier answers and ordinary §5.8.1 cancellation with its required evidence; actual actor is stored separately from normal owner and cover | approve their own Manual Purchase; infer general revision/Deliver To or commercial approval rights from staff-help; bypass §5.8.1 cancellation conditions; authorise a claim outcome without its separate permission; become the duty holder by acting |
| Operations Superuser (`operation@carres.com` by its flag; Jess as a principal person — never the shared `principal@` login) | use the same governed operational doors when available, including PO issuance; actual actor remains separate from normal duty/cover | impersonate duty, create a second PO/receipt writer or bypass approval/commercial gates |
| Normal GRN Duty / dated cover | owns daily Receiving work; count, inspect, attach Supplier DO/evidence and finish source receipt | change PO price/quantity or ownership agreement |
| Stock / Warehouse | label, locate, move, reserve and prove physical custody | issue/cancel supplier commitments |
| Service | intake customer complaints and govern customer remedy; read related stock-claim progress | originate or govern Purchasing stock claims |
| Finance / AP | match supplier invoice, credit, settlement and payment | rewrite receipt, Unit, delivery or PO facts |
| Administrator | govern masters, templates, calendars, rosters and number versions | silently alter historical documents |
| Owner / Audit | read all authority, History and reports | bypass required source/evidence without an explicit governed authority |

No Purchasing object has one universal owner. Each action resolves owner and cover from its rule.

---

## 14 · External integration boundaries

**OWNER CONFIRMED 2026-10-01 — supplier PO channels, APPROVED / LOCKED.**
Hookka Industries and Ohana receive PO email at **hookka.manufacturing@gmail.com**.
Keep their separate Supplier identities; sharing a recipient never merges their POs or history.
Default both to the existing `Open email` action. Hookka currently receives all POs by email.
Nice Future's confirmed contact email is **farithazelam@gmail.com**; retain its current channel
and access arrangements. A possible end to Nice Future supply after Subscription launches is
future context, not a present cutover instruction. Historical recipients remain as recorded.
Opening email is never sent evidence; the current-version confirmation remains required.

A future Hookka/Ohana API must use canonical PO, supplier and evidence records and needs separate
owner authorisation. No API replacement, external contact or supplier login/access change is
commissioned by the placement unblock. **PROPOSAL / NOT LAW:** consider supplier portal retirement
only after a specific owner decision and a cutover/usage check. The suggested retirement of
`nicefuture@carres.com` and `hookka@gmail.com` is not approved; reported September last-action dates
do not prove current non-use. Falsifier: current portal dependency or a need to preserve supplier
access defeats retirement until the dependency is resolved.

- WhatsApp/email: supplier-facing PDF/questions are sent outside; the Portal records version,
  recipient, channel, actor and time. Opening the app is not proof of sending or chasing. A chase
  completes only when the actual supplier answer plus channel, evidence, reporter/recorder and
  relevant times are stored on the exact PO.
- Supplier portal: future read/response surface must write to the same PO/CO/claim/notice records,
  not create a parallel acknowledgement ledger.
- AutoCount/Finance: may receive approved PO/GRN/invoice references at the Finance boundary. It does
  not own purchase demand, receiving count, Unit ownership or consignment receipt payable.
- Barcode/QR: future carrier for `U1-000-001`; the Unit identity and History do not change.
- Logistics/Delivery: reads final `Supplier Deliver To` and emits actual movement/delivery facts; it does not
  revise the supplier document.
- Supplier documents always use the real Supplier Master name. Blueprint examples use Hooka, Ohana
  and Dorsettloft; production never shows a placeholder supplier name.

---

## 15 · Intentional rejects

The final Carres model rejects:

- a Purchasing Home/dashboard that duplicates registers;
- a module-specific My Purchasing Work;
- a Purchase Demands page or a `Purchase Needs` synonym;
- separate New Supplier/New SKU request destinations;
- blank independent PO, Return, Repair, CO or CRTN creation;
- separate Consignment Overview or Consignment Receipts;
- `Acknowledged` after Carres has sent the PDF;
- quiet post-send changes and silent price acceptance;
- generic work words or relative `Today/Tomorrow` dates;
- a permanent object Owner column;
- duplicate consignment receipt/accounting engines;
- customer sales of supplier-owned display goods and supplier sale-notification work;
- supplier payable at consignment receipt;
- reusing document numbers or Unit IDs;
- copying 2990 terminology, layout, deletion/right-click behaviour or cloned business rules.

---

## 16 · PLAN completion gate

The historical 2026-08-29 approval is not a blanket completion certificate for subsequent domain
expansion. Current approved rules and existing page architecture remain in this MASTER. The
2026-10-01 consolidated completion scope is §2.4; measured and reported defects retain their
verification limits. Remaining Showroom composition and Finance contract closure are stated in
§9.13, not silently approved by a scope acknowledgement.

No renewed per-page business interview is required. Complete ordinary research/design work against
existing authority, reconcile any genuine cross-module conflict, then present only the unresolved
business choice if one remains. Do not declare the expanded module PLAN MISSION COMPLETE or issue
new READY FOR CARD scopes until the remaining target truth is complete, reviewed and persisted.
PLAN does not implement application code or extend the existing BUILD commission. Production
completion is separately proved through authenticated business journeys and downstream evidence.


**Continuous delivery acceptance — 2026-10-02, bounded sending slice PRODUCTION-VERIFIED.** Approved planning from this
owner session is consolidated on origin/main without changing proposal labels. Current-version
send work must remain reachable after goods completion: Sending filter includes a received PO
whose current version lacks evidence, and its object opens the existing PDF/send form. The PO
remains in Completed goods; no sending evidence is fabricated. Cancelled-PO sending remains an
explicit separate gap because the current PDF and confirm-sent SQL reject cancelled documents.
Authenticated read-only acceptance on production commit `44c7473c0`: Sending includes 59 POs
(55 awaiting goods plus four Completed goods without a current send mark). PO-SMOKE-W remains
Completed and opens its rendered current PDF beside the existing send form. Both Pages projects,
both canonical hosts and the API Worker converged to that SHA. No supplier message or send mark
was written. Screenshot: `/tmp/purchasing-completed-po-send-production.png`.
The full nine-filter rail, quick Communication/full preview, Amendments, Monthly demand and other
§2.4 completion work are not claimed delivered by this bounded sending slice.


**Manual Purchase Work completion — DEPLOYED; object-open journey PRODUCTION-VERIFIED (2026-10-02).** The derived
request action remains open while authorised demand is uncovered or a linked current PO
version has no confirmed-sent evidence. Uncovered demand retains `Issue PO`; fully ordered
or arrived goods use `Confirm PO sent to supplier` and open the existing unsent PO.
The same `confirm-sent` door probes the request occurrence before and after its write and
records Completed only when every linked current version is sent and no demand remains.
Approval, ordered quantities, receipt facts and ownership are unchanged. No SQL migration
or external message is included. PR1848 passed CI and merged as
`547fe08ca16eee21374cbe5a247669ae123906d3`; deployment run `36978740900` succeeded and all
five canonical surfaces converged to that SHA. Authenticated Principal read-only acceptance
through Operations → Workspace, Team Work, search `MPR` showed MPR-20260904-9488 with
`Confirm PO sent to supplier`, `Sending not confirmed` and the current-version completion
condition. Clicking `Open MPR-20260904-9488` opened the actual PO-20260904-9834 V1 object at
`/operation/procurement?po=PO-20260904-9834`, with its exact MPR goods-line sources visible.
`Issue current PDF` opened the existing channel/recipient/confirm-sent form. No empty shell
remains. Acceptance boundary: this PO's destination address is missing, so its official PDF
preview refuses to render; address maintenance is the existing Settings door. Do not claim
PDF rendering or a sent/completion write from this walk. No supplier channel was opened and
no supplier message, sent mark, receipt or source fact was written. Screenshot:
`/tmp/purchasing-work-po-open-1848.jpg`.

**Monthly demand adoption — PRODUCTION-VERIFIED bounded journey, 2026-10-02.** Purchase Orders reuses the existing
SalesOrderMonthlyDemand component, useMonthlyDemandFacts reader and monthlyDemandOf arithmetic.
Listing and Monthly demand are shared vertical Tabs in the FilterRail fixed header. Monthly view
reads the canonical customer demand/to-buy sources over the existing six-month default; PO rows
never feed customer demand totals. A month opens the existing Sales Orders requested-month scope,
including the existing special overdue/undated row semantics. Filters collapse/reopen through the
shared rail control on narrow screens. No new demand writer or Sales Order edit is added.
Expanded monthly filtering and other approved register controls remain separate delivery work;
Production commit `1b7b840951f761686f46b9041d099c4774551001` converged across both Pages projects, both canonical hosts and the API Worker. Authenticated read-only acceptance showed October 2026 Total Qty 11, Not delivered 11 and To buy 5; selecting October opened `/operation/orders?requested=2026-10` with seven matching Sales Orders, then Back restored Monthly demand. At 390px the shared Hide filters/Show filters controls removed and restored the view tabs. Screenshot: `/tmp/purchasing-monthly-demand-production.png`. No customer, purchase or supplier facts were written; export download and expanded month filtering are not claimed verified.


**Fixed PO condition row — PRODUCTION-VERIFIED bounded journey (2026-10-02).** The existing shared DataGrid gains
an opt-in fixed 36px condition slot used by Purchase Orders only. The slot remains empty when
unfiltered; active chips and Clear all occupy it without moving listing tools or table results.
Multiple chips scroll horizontally with their remove controls retained. No other register adopts
this opt-in. The completed PO's action fact uses the governed `Sending not confirmed`; absence of
a mark is never presented as proof the PDF was not sent. Production commit
`ab74996d2f74e468f31d7876e993d8cc5f745948` converged across all five hosts. Authenticated
geometry: empty, Search `PO-SMOKE-W`, Search plus Sending, and Clear all retained a 36px
condition row at y=59, search at y=114 and first table at y=143. At 390px with the rail
collapsed, two chips occupied a 374px viewport with 429px horizontal content; clearing kept
the row 36px and table y=187. Temporary viewport and filters were reset. Screenshot:
`/tmp/purchasing-fixed-header-production.png`. No business fact was written.

**Committed Sales Order reversal — PRODUCTION-VERIFIED bounded journey, 2026-10-02.**
Jess approved the concrete prevention check after its plain-language explanation: an SO with
exact PO source lineage, legacy PO SO references, an exact reserved-line Unit binding, an active
SO reference binding or a sold-order Unit binding cannot return directly to Place. It uses the
existing `wrong_stage` refusal and existing Orders amendment/cancellation flow; no Purchasing or
Stock fact is deleted or reassigned. An uncommitted SO retains its existing reversal and audit.
Migration 0634 keeps the existing role/dealer gate, shared Order lock, grants and private writer.
Local full-chain acceptance covers all five independent commitments, the uncommitted positive
case, a released/free reference, permission refusals, a controlled guard-removal negative case
and a concurrent source reservation committed while reversal waits. The production rolled-back DO
probe passed the uncommitted positive, five independent bindings and an original-door negative
control. Triggers stayed enabled; no SO, PO or Unit number was allocated. Original function hash, ACL, 110 Orders,
473 Units and 72 source links were unchanged afterward. The exact committed file was applied
through apply_migration as `0634_unproceed_preserves_purchase_and_stock_commitments`, tracker
version `20261002065657`. Tracker file MD5 `5f017ef8230ece70b84889c1dfa1eceb` and live function
body MD5 `e90653050c4a4157a043132dfd9fe0db` match the Git file/body; grants and business row
counts remain unchanged. No customer reversal, supplier message or Stock reassignment persisted.
The applied live guard independently passed the same positive and five binding checks in
a rolled-back post-apply probe. PR1847 passed full CI (13m40s) and merged as
`44dba269e91d6be34d0d0ec8b09378b02145237d`; the deployment workflow succeeded and all five
hosts converged to that SHA. The applied body/file fingerprints were rechecked afterward and
exactly one tracker entry remains.
The existing API already returns the governed 422 refusal, so this SQL has no dependent
application writer or interface change awaiting deployment.


**PO-window sending after receipt — DEPLOYED; real received-window journey UNVERIFIED, 2026-10-02.** The measured shared
window adapter treated a received PO as already sent, contradicting §5.6 and §2.4. It now reads
only current-version confirmed-sent evidence. A window with no demand left but an unsent
completed PO retains the same occurrence and embedded send area; goods status remains Received.
The API projection acceptance covers received V2 without its current mark, the current send action
and disappearance only after that mark exists. No quantity, receipt, supplier channel or ledger
identity changes. PR1849 passed complete CI run `36978843122` and merged as
`6d377f03a913d74c78abf0e0c74a7bd78ebf19f6`. Deployment run `36981090221` succeeded;
all five canonical surfaces independently converged to that SHA
(`/tmp/purchasing-production-1849.log`). Deployment proof is not a live received-window
journey; that acceptance remains explicitly unverified.
The existing PO-window panel already reads this shared adapter and keeps its existing send door.
49 API projection, eight shared window and three panel tests pass. Restoring the receipt shortcut
makes the new received/current-version journey fail (negative control). Read-only production
inventory found the four Completed POs PO-2052, PO-2054, PO-SMOKE-C and PO-SMOKE-W have no exact
SO source lineage; no window membership is invented to create a live demonstration. This limits
production acceptance until a real source-linked received PO exists; preserve every original fact.

**PO Listing template, quantity footer and return journey — PRODUCTION-VERIFIED bounded scope, 2026-10-02.**
The owner-directed shared Sales template adoption (PR1851, PR1852 and PR1856) and its measured
return/category corrections (PR1855) are delivered at `7d827ba8df5d7c863f998f985d8e8a2fbf5709a1`.
PR1855 passed full CI run `37007662348` (14m27s); deployment run `37009270017` succeeded. All five
canonical surfaces independently converged (`/tmp/purchasing-production-1855.log`).

Authenticated Principal acceptance confirmed the existing Sales left-rail composition, vertical
Listing/Monthly demand navigation, group frames and selected states, shared Table/Cards and Page
tools. Columns opens the eleven-column chooser; Export opens Excel/PDF options. No setting was
saved and no export file was downloaded. Both PO and deployed Sales rows measured 39px using
their existing shared 32px row recipe. The toolbar has no duplicate PO count.

The footer alone states the filtered/selected visible PO scope and actual ordered goods quantity.
The existing catalog SKU-category reader now enriches PO lines for the shared classifier; unknown
or unrecognised categories are explicitly counted as `Not in catalog`. The real unfiltered footer
reads 63 purchase orders, Mattress 48, Bedframe 26, Sofa 50 and Not in catalog 6 — exactly matching
the read-only production facts. Receipt quantity and money remain separate facts.

Search `PO-SMOKE-W` yields one of 63 POs in Table and Cards. Cards selection survives Table;
Clear and the shared select-all/deselect controls change only selection. View opens that exact
Completed V1 object with 2 ordered / 2 received / 0 pending. Back restores Cards, the search and
selection through the existing DataGrid session memory and saved origin query. A directly opened
PO returns to the default unfiltered Table. The return and selection journeys fail when their
predecessor resets are restored. The 390px Cards/search acceptance also passed.
Screenshots: `/tmp/purchasing-listing-final-production.jpg`,
`/tmp/purchasing-cards-return-production.jpg`, `/tmp/purchasing-cards-mobile-production.jpg`.

Downloaded predecessor and deployed bundles retained the PO-register control (1→1), while the
PO-region toolbar count changed 1→0, session memory 0→1, labelled toolbar 0→1 and shared row
recipe 0→1. No source, sending, receipt, stock or supplier fact was written during acceptance.
This is not full nine-facet/supplier-exception, PO-object or Purchasing-module completion.
PR1859's quick-view Communication composition remains preliminary local evidence under owner
review; its technical checks are not accepted UX or permission to deploy that composition.

**Shared sending refresh — DEPLOYED / TEST-VERIFIED; real confirmation deliberately unexercised, 2026-10-02.**
Successful current-version confirmation through the existing `PoIssueEvidence` writer invalidates
PO, derived Work and PO-window reads in both shared layouts. Refusals complete nothing and
invalidate none. No new action, channel, recipient, permission or supplier writer is introduced.
The 24 shared sending tests cover both layouts and refusal; removing the refresh makes the new
acceptance fail. PR1861 passed full CI run `37010816296` (13m51s) and merged as
`51aea8bb9c16f5ccdb0d1c5b0e7502c0e5d91753`. Deployment `37012403845` succeeded; all five
canonical surfaces independently converged (`/tmp/purchasing-production-1861.log`).
Downloaded predecessor/current bundles retain the confirmation door (2→2), with the exact
PO/Work/PO-window refresh sequence changing 0→1. The authenticated register still reads the
correct 63-PO/category quantities and serves the new asset `index-BzSQ-KHp.js`.
No real PO was issued or confirmed sent and no inventory fact was changed for proof. The live
confirmation-write journey is therefore not claimed as exercised. PR1859's preliminary quick-view
Communication composition remains under owner review and is excluded from this release.
