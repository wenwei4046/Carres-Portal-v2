# PURCHASING — MASTER

**All listing appearance — BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED (approved Jess, 2026-09-17):** follow
[UI MASTER §6.7 Portal-wide listing readability](../ui/MASTER.md#portal-wide-listing-readability--built-2026-09-17-slice-1--authenticated-walk-owed).
This is the shared default, not a PO visual pilot. Preserve this module's filter content,
control types, special schedules and business behavior; no page-local appearance specification.


Status: **APPROVED / LOCKED — OWNER REVIEW COMPLETE 2026-08-29; Supplier Claims stock-claim boundary and Problems UX owner-approved 2026-09-14**
Lane: **PLAN COMPLETE**

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
5. Which supplier-owned showroom Unit was sold and must now be reported to the supplier?

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

### 2.2 Ruling — RESOLVED FROM AUTHORITY

There are not two genuine Carres operating models.

- A Sales Order creates a system purchase demand only for the uncovered quantity.
- A person starts a non-SO buy in `Manual Purchase`; approval creates the same governed purchase
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
- `SO Batch Purchase` and `Manual Purchase` are the two operator doors. `Purchase Orders` is the
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
- Consignment receipt preserves supplier ownership and creates no payable. Actual consumption or
  sale creates supplier advice; Finance later matches the supplier invoice and pays.
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
| Non-SO buying | Requests are informal and may omit the business reason | Mature requisition separates internal approval from external PO | **ADAPT** | Staff create Manual Purchase; approval produces demand; rejection ends it | Select purpose, goods, quantity, date and destination; system routes approval | `Manual Purchase` Register and object; no separate request page | Catalog, Stock planning, approved Display Request, Finance approval boundary |
| Purchase demand | Staff may confuse “need” with a document to send | 2990 recomputes need; mature ERP keeps requisition/demand separate from PO | **KEEP + RELOCATE** | One hidden canonical line record stores required, covered, ordered and remaining quantity | Staff see demand facts through the correct work door; never create/send a demand document | No sidebar page; read in SO Batch, Manual Purchase, PO and Order Route | Source object creates/reduces/cancels demand; PO allocation covers it |
| Purchase Order | PDF/WhatsApp means the real order; changes can be lost | 2990 retains line balance, version and documents | **KEEP + IMPROVE** | Current PO Duty checks, sends the actual PDF, records channel/time; later changes create a version | Use 50/50 check/preview; send; record supplier promise or exception | `Purchase Orders` Register; full-width view; 50/50 only while issuing/editing | Demand, supplier, Goods Receipt, Stock, Finance read-only |
| Physical receipt / GRN | Supplier DO and Carres GRN can be confused; counts may hide damaged/wrong/extra goods | Mature ERP separates supplier delivery evidence, physical receipt and payable invoice | **ADAPT + IMPROVE** | Receiving starts from the PO/CO, records the supplier DO and physical counts, then Carres creates the numbered GRN once | Open the exact source, record Order/Received/Damaged/Wrong/Pending facts and evidence, finish once | Receiving-owned workspace and GRN record; no second receipt door | PO/CO source; Stock receives only valid goods; Supplier Claim consequence; no AP for consignment |
| Supplier problem | Receipt differences and later defects can be mixed | Source-linked claim/return flows preserve evidence | **IMPROVE** | Receiving records damaged/wrong/extra separately without reducing pending delivery or making stock available and reports a source-linked Purchasing claim; later discovery on a Stock Unit/receipt opens a Purchasing stock claim directly | Check source, evidence, supplier response and authorised outcome | `Supplier Claims` Register; claim object and optional supplier claim pack | Purchasing claim authority; GRN/Unit evidence; related customer Service Case read-only; Finance credit read-only |
| Purchase return | Staff may create a return because goods look wrong | 2990 can derive a return from GRN but also permits blank return | **ADAPT / REJECT blank create** | Only an approved claim/outcome creates a return; issue document; collection proof moves custody | Send return, obtain collection date, scan exact Units, record handover | `Purchase Returns` Register; formal object; 50/50 while issuing/revising | Claim source; Stock custody; Finance credit consequence |
| Repair order | Repair can be confused with replacement | Mature service logistics preserves exact serial/Unit custody | **IMPROVE** | Authorised inventory repair or Claim outcome creates RO (§9.7); same Unit leaves and must return; replacement gets a new Unit ID | Issue repair order, hand over, chase dated return, inspect same Unit | `Repair Orders` Register; formal object; 50/50 while issuing/revising | Authorised inventory repair or stock-claim outcome; Stock custody; Goods Receipt/inspection on return |
| Display request | Sales negotiates with supplier while Purchasing places/controls order | Requisition should state purpose before external commitment | **IMPROVE** | Showroom asks for a model/display change; Purchasing decides buy, consignment, swap or no action | Showroom enters simple request; Purchasing resolves supplier/SKU/path | `Display Requests` Register and internal object; no PDF preview | Showroom/Sales request; Catalog; Manual Purchase or CO; Stock location |
| Consignment order | Supplier-owned sofas are hard to count; purchased Hooka/Ohana displays are mixed in | Mature ERP keeps supplier ownership on receipt; 2990 has documents but fragmented truth | **ADAPT + IMPROVE** | Approved display/claim swap creates CO; exact Units and supplier ownership are fixed before delivery | Issue CO, send Unit IDs, record promise, receive through the one Receiving engine | `Consignment Orders` Register; formal object; 50/50 while issuing/revising | Display Request; Stock Unit; Goods Receipt; Consignment Return |
| Consignment return | Removal/swap may be arranged informally | Physical handover, not document issue, changes custody | **IMPROVE** | Approved remove/swap/claim/overdelivery creates return; combined swap can share one CO PDF | Send standalone return if needed; obtain collection date; scan and prove handover | `Consignment Returns` Register; formal object; 50/50 while issuing/revising | CO swap, Stock custody, supplier proof; no refund/credit on unsold consignment |
| Consignment sale notice | Staff may forget to tell supplier after a sale | Mature ERP creates consumption advice after actual consumption | **ADAPT + IMPROVE** | Successful delivery of exact supplier-owned Unit auto-creates one notice per supplier × attempt | Current PO Duty checks and sends; Finance later matches invoice | `Consignment Sale Notices` Register; no `+ New`; 50/50 while issuing/correcting | Delivery success; Stock ownership; source CO; Finance/AP continuation |

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
   └─ Consignment Sale Notices
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

`SO Batch Purchase` is system demand from customer Sales Orders. `Manual Purchase` is conscious
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
overwrites the 2026-09-04 no-number correction (Card 08).** The number is `MPR-YYYYMMDD-RRRR`
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

Current PO Duty, or the dated cover while one is in force, is the normal work owner and remains
accountable for PO issuance. A governed Operations Superuser may also complete any operational PO
action without becoming — or being displayed/audited as — the duty holder. Jess is an Operations
Superuser through Principal authority as a principal **person** (`is_operations_superuser`, 0533);
`operation@carres.com` is the explicitly governed shared Operations Superuser (its flag). The shared
owner login `principal@carres.com` is not a person and executes no duty (owner ruling 2026-09-18). An ordinary Operations login that is neither duty, cover nor superuser is
refused. Commercial approval remains separate and never follows from issue authority.

**HOW IT IS ENFORCED — migrations 0379 / 0380 plus 0403, and the dependent web/API code, are
production-verified at `98ce4220d15cd81482aef05124dbec470c2ed87b` on 29 Aug 2026. A real
`operation@carres.com` walk selected an eligible SO, saw the compact duty chip and active `Issue PO`
action, and reached `Review Purchase Orders`; the preview was not issued.**
`purchasing_po_actor()` is the production-verified **legacy module-local resolver**, not the final
architecture authority. **OWNER RULING 2026-09-01 supersedes its ownership boundary:** it must
converge behind ERP Architecture Law F.1's Shared Duty Resolver; no new Purchasing page or API may
read `ops_po_duty` or `ops_po_duty_cover` directly. Until that convergence is built, its existing
behaviour is implementation evidence only: it reads the month's duty holder and dated cover and
returns normal holder and acting cover separately. `is_operations_superuser()` reads Principal or the governed `app_users` capability;
application code never checks an email. `purchasing_actor_may_issue()` combines duty, dated cover
and that capability, and is asked by SO Batch Purchase, Manual Purchase, the API issue routes, the
creation authority `purchasing_issue_pos_batch`, and the evidence door
`purchasing_confirm_po_sent`. PO History records actual actor, normal duty, dated cover and the
authority used as distinct fields; a superuser is never rewritten as Yu Jun or the cover. Cover has
no browser write policy.

**Current roster, effective 2026-09-07:** Yu Jun and Shasha are the two Operation staff in the
monthly PO/GRN rotation. The two duties remain opposite in every month so the person who issues a PO
does not receive it. September 2026 is PO Duty = Yu Jun and GRN Duty = Shasha; October reverses.
Khor Yee retains only historical actor/assignment evidence and receives no current or future Work.

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

- Before issue: change or split quantity freely in SO Batch Purchase / Manual Purchase.
- Numbered PDF prepared but not sent: update the same issue surface; History records it.
- Supplier already received a PDF: `Change Deliver To` creates a new version/change record and
  concrete work to send the new PDF.

**Owner B, 2026-08-28:** one PO may carry several governed Deliver To destinations. The PO-level
destination is the default; a goods line may name another active Purchasing destination. The formal
PDF prints every line's effective destination and, when several are used, every exact address in its
DELIVER TO block. A closed destination remains visible on old records but cannot be selected for new
work. The final destination of each goods line is Purchasing-owned truth read by Sales Order and
receiving/logistics. Changing it after the supplier received the PDF mints a new PO version and send
work; it never silently changes the paper already sent.

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

`Product Categories` is a multi-select of the three governed Purchasing production categories:
`Mattress` · `Bedframe` · `Sofa`. It is never a free-text category creator. Every selected category
requires its own `Production Days`; one generic supplier lead time is forbidden. For this setup
door, the selected categories are the authority for which Supplier × Category Production Days rows
must exist; the form does not wait for a SKU to be linked before those values can be stored.

**APPROVED TARGET / NOT BUILT.** One new server/database transaction must write the Supplier
identity, delivery method, selected categories, `Supplier work week` and each selected category's
Production Days. It either saves the complete supplier setup or saves nothing; a sequence of
separate browser writes may not leave a partial supplier. This supersedes SKU-derived setup for
this door, while SKU relationships remain the authority for which specific goods that supplier may
supply. The form never asks for a PO Default Delivery Date: that date belongs to each Purchase Order, not
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
A supplier price change stops the issue/change and routes to the commercial approver; Operations
does not decide it.

**HOW IT IS ENFORCED — BUILT, migrations 0378 / 0379 / 0380, PR #894.**

- **THE VERSION IS DECLARED, NOT READ BACK.** The confirmation states the version it RENDERED;
  SQL locks the purchase order, compares, and refuses `stale_po_version` writing nothing. Reading
  the current version at confirmation time recorded a revision as sent that the supplier never
  received.
- **CATALOG IS THE NORMAL PRICE AUTHORITY.** Issue review is not a second cost-maintenance screen.
  The server reads the governed Catalog cost and sends that value as both the line cost and
  `expected_catalog_cost`; `purchasing_check_line_commercials` re-reads it inside the creation
  transaction. A missing or changed Catalog cost creates ZERO purchase orders. Commercial
  exceptions are approved and maintained in their governed Catalog/approval flow, never typed into
  SO Batch or Manual Purchase Issue review.
- **SUPPLIER COLLECTION IS MASTER DATA.** A factory-pickup supplier's collector and optional fixed
  destination come from `purchasing_supplier_settings`. SO Batch Purchase, Manual Purchase, the API
  and the `purchase_orders` database guard all use that same rule. Review neither repeats the
  collection arrangement nor asks the operator to choose a collector for one PO. Managers maintain
  both fields in `Settings → Purchasing → Supplier collection`; future factory-pickup suppliers appear from master
  data and future destinations continue to come from the adjacent `Supplier Deliver To` setting.
- **AN EXCEPTION NEEDS SOMEBODY ELSE'S APPROVAL.** A hand-entered cost and a Free of Charge each
  require an open, unexpired `po_cost_approvals` record. `purchasing_approve_po_cost` admits only
  `principal` or `finance`, and refuses a manager who is also today's PO actor: one person cannot be
  both sides of an exception. An approval is SPENT when used.
- **EVIDENCE CARRIES WHO.** `po_sends` stores the actor, the month's duty holder and the authorised
  cover, with channel, recipient, Malaysia time and the exact version. An `external_open` is
  communication history and completes nothing; a `confirmed_sent` for an EARLIER version stays
  history and never completes the current one.

### 5.7 The original date, the truthful reply, one arrival arithmetic, the kept document

**HOW IT IS ENFORCED — BUILT, migrations 0428 / 0430 (correction card, Jess 2026-09-06).**

- **THE ORIGINAL DATE IS CAPTURED AT BIRTH AND NEVER CHANGES.**
  `purchase_orders.official_delivery_date` is stamped from the birth `eta_date` by trigger at
  INSERT; once it holds a value no UPDATE may change it. `eta_date` stays the LIVE planning
  arrival (the ready-date door may recompute it); the register's `PO Default Delivery Date`, the PDF's
  `Deliver by` and every reply comparison read the immutable original. Pre-0428 records were
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
Supplier has not confirmed the PO date
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

Each line retains Order Qty, Received Qty and Pending Delivery Qty. Receiving records Damaged Qty,
Wrong Item Qty and Extra Qty separately; damaged, wrong and extra goods do not reduce Pending
Delivery Qty and never create available stock. A supplier date may split by quantity. An
unconfirmed, passed or changed supplier promise creates supplier-contact work; it never rewrites
the original PO Default Delivery Date or the customer promise. Confirmation work begins only after the
current PO version has confirmed-sent evidence, Pending Delivery Qty is above zero and no supplier
answer exists for that version.

---

## 6 · Document and Unit identity

### 6.1 Formal document numbers

```text
PREFIX-YYYYMMDD-RRRR
```

- `YYYYMMDD` is the Malaysia server issue date for an external document and creation date for an
  internal Display Request, always with a four-digit year.
- `RRRR` is chosen from the unused four-digit codes for that date. It is not a sequence, timestamp,
  customer, supplier or parent-document number.
- All Carres formal documents share the daily visible-code pool. A database uniqueness rule prevents
  duplicates. Cancelled/void numbers are never reused.
- Every new object gets its own number. Relationships live in Source and `Order Route`, never in
  matching tail digits.
- A revision keeps the original number: `PO-20260820-4827 · Version 2`.

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
| `MPR` | Manual Purchase Request |
| `GRN` | Goods Receipt |
| `SC` | Supplier Claim |
| `PRTN` | Purchase Return |
| `RO` | Repair Order |
| `DR` | Display Request |
| `CO` | Consignment Order |
| `CRTN` | Consignment Return |
| `CSN` | Consignment Sale Notice |

Internal records still use invisible permanent technical IDs. `MPR` is the Manual Purchase Request
number (owner ruling 2026-09-18, reinstated after the 2026-09-04 retirement): each Manual Purchase
request has one; CO, RO and other documents keep their own numbers. Historical `MPR-…` values keep their numbers; `REQ-####` stays searchable.

### 6.2 Unit ID

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
for EVERY governed destination — a showroom or external delivery gets its IDs too, because the
supplier writes them on the package wherever it goes. A quantity line is born with zero Unit IDs.
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

The opened PO's `Document → Goods lines` shows a `Unit ID` column: an exact-unit line lists its
real line-bound IDs immediately after issue; a quantity line prints `—` (intentional — it has
none by law); an exact-unit line with no IDs after issue is an integrity failure and says `Unit
IDs missing on this line — do not send this PO`, never an ordinary empty state. The official PO
PDF heads the same column `UNIT ID` and prints the same line-bound IDs
(`docs/pdf/PO-PDF-STANDARD.md`). The main Purchase Orders register stays one row per PO and
carries no Unit ID column. Current supplier capability requires one simple extra line on its own
package label:

```text
CARRES UNIT ID: U1-000-001
```

No supplier physical-Unit label, QR, barcode or Carres label template is required now. Carres
Operations attaches the same text Unit ID to the physical sofa at the showroom. Future suppliers
may attach the physical label and future QR/barcode may encode the same permanent machine value;
neither upgrade may renumber the Unit.

**MEASURED IN PRODUCTION, 2026-09-08.** `PO-20260908-2503` was issued through the real Manual
Purchase screens and its Unit `U1-000-082` was written in the same transaction — both rows carry
`2026-09-08 06:45:31.737518+00` — bound to the line, `identity_scope unit`, `source_ref po_mint`.
The PO object printed the ID under a `UNIT ID` heading, the register stayed one row per PO, and
the PO's receiving page listed the same ID under `EXPECTED UNITS` with an outcome to record
rather than an identity to invent. The 0442 apply classified 225 SKUs `exact_unit` and 4
`quantity`; the seven left NULL are service and guarantee SKUs, which are not physical goods.
0443's preflight restored exactly the 39 `po_mint` Units the retired 0366 destination trigger had
voided — identities already printed on supplier paper — and invented none.

🟡 **THE QUANTITY MODE IS UNREACHABLE UNTIL SETTINGS CARRY ACCESSORY PRODUCTION DAYS.** Every
`quantity` SKU is an accessory, and `purchasing_production_days` holds only Hookka/bedframe,
Nice Future/mattress, Ohana/bedframe and Ohana/sofa. Manual Purchase therefore refuses an
accessory line by name before the Catalog mode is ever consulted, so no PO can carry a quantity
line and neither the `—` column state nor a quantity receive can be walked. The law is built and
probed; the block is configuration. **Fix:** Purchasing Settings gains production days for each
supplier's accessory category. The number is a real supplier lead time and belongs to Jess.

Legacy showroom stock receives a Unit ID during opening count with supplier, ownership, model,
location, existing serial/label and photo evidence. Until the physical label is attached, the Unit
remains usable but carries concrete label work.

---

## 7 · End-to-end business flows

### 7.1 SO purchase

```text
Sales Order line
→ Stock reads available/reserved/incoming quantity
→ uncovered quantity becomes purchase_demand
→ Delivery-derived latest arrival date becomes Purchasing required date
→ Settings resolve production + transit days; Order By walks both legs backwards
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
→ Catalog resolves supplier/category and Settings resolves production + transit days
→ server previews Proceed Date and defaults Delivery Date from the slowest selected line
→ Delivery Date minus those same lead days derives each line's Order By
→ Catalog/supplier/price authority checks
→ governed approver approves or rejects
→ approved record creates purchase_demand
→ an authorised issuer uses the same PO path; Manual grouping keeps Delivery Date distinct
→ the same Receiving engine handles physical arrival
```

### 7.3 Receiving and later defect

```text
PO/CO carries the official Deliver To and original PO Default Delivery Date
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

Office direct receiving and Warehouse submission are two entry doors to one Receiving Session and
one posting engine. A Warehouse submission moves no Stock until GRN Duty posts it. Office direct
receiving posts one `posted` event because one person performed one business act. `GRN-…` is the
formal Receiving Record number and exists from the posted session; a draft/submitted count is not a
formal GRN.

Normal GRN Duty, dated cover and actual actor remain separate evidence. Jess and the governed
Operations Superuser may perform the operational act without becoming GRN Duty. An ordinary person
outside duty/cover/capability is refused by the same web, API and SQL authority.

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

### 7.5 Purchased showroom display

Hooka/Ohana display goods are Carres purchases, not consignment. A Display Request resolves to Manual
Purchase/PO. When the model changes, the Unit returns to Carres custody, may go to Hooka/Ohana for
repair and may later be resold. Stock ownership remains Carres unless an authorised consequence
changes it.

### 7.6 Supplier-consignment showroom display

Other sofa suppliers such as Dorsettloft may own display stock.

```text
Display Request approved for consignment
→ CO lists exact incoming Units and supplier ownership
→ supplier writes each Carres Unit ID on the package label
→ Goods Receipt accepts without payable
→ Stock places supplier-owned Unit at selected showroom
→ display swap/removal creates Consignment Return path
→ successful customer delivery of exact Unit creates CSN
→ Purchasing sends CSN to supplier
→ Finance matches supplier invoice and settles
```

A model swap uses one CO external instruction with `COMING IN` and `GOING BACK`. The outgoing return
record is auto-linked; no duplicate supplier message. Document issue alone does not move either Unit.

### 7.7 Consignment sale notice trigger

Only a successful/partially successful delivery attempt for an exact supplier-owned Unit creates a
notice. SO creation, deposit, reservation and delivery planning do not.

One notice is created idempotently per supplier × delivery attempt and contains only successfully
delivered Units. It excludes customer identity/contact/address, customer selling price, discount and
supplier settlement amount. A customer return never deletes the original notice; an authoritative
correction preserves lineage.

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

- View is full width and usually one scroll: WORK, authoritative facts, lines/Units, source,
  connections, evidence, corrections and History.
- Tabs exist only for parallel/reference surfaces: Document, Revisions where applicable, History and
  `Order Route`.
- Use `Order Route`, never `RelationMap`, `RelationshipMap` or `Relation Map`.
- A formal outside-readable document uses 50% edit/check + 50% live PDF preview only during
  issue/edit/revision. It returns to full-width view after completion.
- **Review Purchase Orders opens with a rendered draft (owner request, 2026-09-07).**
  The selected document is visible before Issue PO, using the PO template and its
  explicit draft treatment in `docs/pdf/PO-PDF-STANDARD.md`. Navigating documents
  changes the draft. Previewing creates nothing; Issue PO remains the creation action.
- **THE 50/50 BINDS FROM 1130px** (measured: two 565px halves is the narrowest a readable A4 preview
  and a full decision column both fit). Narrower, the surface STACKS — decision work first, the
  document below it keeping a readable height — and the surface scrolls. Nothing is compressed:
  walked at 1129px on 2026-08-24, a one-column grid squeezed the decision pane to 208px and clipped
  the cost block, the blocker and both buttons with no scrollbar, because the row reported that it
  fitted.
- **ONE COMMUNICATION AREA PER DOCUMENT.** The doors out of the Portal (`Copy message`,
  `Open WhatsApp group` / `Open WhatsApp`, `Open email`, `Download PDF`) and the act
  (`PO sent to supplier`) are drawn by ONE component on every surface that chases a document. Two
  sets of send controls on one object is two accounts of what happened to it.
- **`Download PDF` HANDS OVER A PDF.** Never a link to the JSON payload behind it: a page that
  shows an API response as if it were a document teaches the operator that the document is
  unreliable.
- Internal Manual Purchase and Display Request objects have no empty PDF preview.

### 8.3 Two-line fact/action copy

Official UI language is English at primary-school reading level.

```text
Supplier has not confirmed the PO date
[YJ] Ask Dorsettloft to confirm the PO delivery date
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

**Shared dictionary — APPROVED / NOT BUILT (Jess, 2026-09-18).** All four reviewed listings
(§9.1–§9.4), their detail facts and exports use [COPY-STANDARD: Purchasing UI dictionary](../COPY-STANDARD.md#purchasing-ui-dictionary).
The exact lists below are the owner's order; never rearrange them using a generic ordering heuristic.
This document approves presentation, not unverified new storage fields, identifiers or customer links.


**Purpose / source:** system-generated uncovered SO lines only; no `+ New`.

**OWNER RULINGS R1–R8 — SO BATCH ROUND 1, APPROVED / LOCKED 2026-09-16.** Built in PR #1395.
Fixture-walked in the real portal shell; the authenticated production walk is recorded in Card 11.

- **R1 · One table, two groups.** `To buy` sits first, always open, and is a HEADING, never a
  control; it stays visible with `0` while the Register holds records. `No purchase needed` sits
  below, initially collapsed, and is a real disclosure button (`aria-expanded`). Grouping reads
  REMAINING purchasing demand from the shared projection (`soBatchOrderPlanning` over
  `soBatchOrderLineOutstandingQty`: customer quantity less current Ready Stock coverage less exact,
  non-cancelled PO lineage), never the raw blank/partial/ordered status. Blocked, unverified and
  pool-covered demand is never assumed bought, so it stays in `To buy`. PO-covered and
  Ready-Stock-only orders (including orders that never had a PO) need no purchase. Search, column
  filters and rail filters cover both groups; while any narrowing is active every group opens, and
  clearing it returns the groups to the state the operator had before.
- **R2 · Planning fact.** Order By remains the engine/detail date, not a parent column; the parent
  displays `PO Safety Days` under the shared dictionary. The planning date is the earliest over exactly the
  leaves the parent checkbox would tick; blank when nothing is left to buy. An undated `To buy`
  order says WHICH of three facts holds (S1, built 2026-09-17, `soBatchOrderPlanning().absence`):
  `Not planned` only when a leaf is blocked by missing setup (or an eligible leaf has no derivable
  date); `Coverage not checked` when whether an open PO covers a leaf could not be verified;
  `Already on a PO` when another open PO covers the remaining leaf. Setup is named first; an
  unverified leaf is named before a covered one, because unknown must never read as covered. `To buy` reads selectable Order By ascending → `Not planned` →
  SO No descending; `No purchase needed` reads SO No descending. Header sorting orders rows inside
  each group, never across them. No client calendar arithmetic is admitted.
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
- **R8 · Issue workspace.** `Back to buying` returns to the SAME Register — it stays mounted and
  hidden behind the workspace, keeping search, rail filters, open groups, ticks and scroll offset,
  and the list is re-read so a line bought meanwhile drops its tick. `Esc` closes only transient
  inspection (Search, menus); it never leaves the Issue workspace.

Approved review A1–A15 also requires canvas-based rail overlay below 896px, 40px touch rows
below 768px canvas, issue halves only at 1130px surface width, truthful no-match and true-empty
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

**Left rail — APPROVED / LOCKED, latest owner ruling 2026-08-30.** The rail lets an operator inspect
what remains unordered, when each order should be placed, which product category and which actual
supplier and delivery region — with every label fully readable. It does not repeat central Work or
expose Sales/Catalog actions to Operation. Six sections, in this exact order:

An unavailable row explains its own blocker inside that Sales Order's framed expansion. Missing
Catalog cost therefore reads `Catalog cost is missing` plus `Set the cost of {item} in Catalog` on
the affected order; it never returns as a `WORK TO DO` rail panel or as an editor in Issue review.

```text
ORDER TIMING
  Can order early
  14 safety days left
  1–13 safety days left
  No safety days left
  Not enough production days

PRODUCT                   ▾ compact fact dropdown (owner ruling 2026-09-11)
  All products
  Mattress · Bedframe · Sofa

SUPPLIER                  ▾ compact fact dropdown (owner ruling 2026-09-11)
  All suppliers
  [actual supplier names, alphabetical — never hardcoded]

REGION                    ▾ compact fact dropdown (owner correction 2026-09-11)
  All regions
  Klang Valley
  [actual outstation Delivery State names, alphabetical]
  Others                    ← only when Delivery State is not recorded

SETUP TO FIX              ← the whole section renders only when at least one affected SO exists
  Production days not set
```

- **`PRODUCT`, `SUPPLIER` and `REGION` are compact fact dropdowns** (owner ruling
  2026-09-11, completed for `REGION` by the owner correction of the same day — the shared
  purchasing rail grammar; Manual Purchase collapses the same shape plus `PURCHASE PURPOSE`,
  and §9.2 carries the reasoning). All three are FACT lists that grow with the business:
  every supplier Carres buys from and every outstation state it delivers to earns a row, and
  as rows they pushed `SETUP TO FIX` — and on a short window `ORDER TIMING`, *what to buy
  today* — below the fold of a 240px rail. Each control writes the same single-slot section
  value the rows wrote, keeps the counts in its option text and wears the rail's own blue
  active treatment when narrowed. `ORDER TIMING` and `SETUP TO FIX` keep their visible rows:
  they are the daily worklist, not a fact list.
- **⭐ `TO ORDER / All not ordered` IS RETIRED — owner correction 2026-09-11.** It was the one
  rail row that named no FACT about a Sales Order: it named the page's own DEFAULT, which is
  the unfiltered purchasing population — and it sat ABOVE `ORDER TIMING`,
  the section that answers *what to buy today*. The section, the row and the word are gone from
  this surface and may not return under another spelling. **The arithmetic behind it is
  untouched** (`soBatchOrderLineOutstandingQty`): customer quantity less current Ready Stock coverage
  less exact non-cancelled `po_line_sources` lineage still governs the tick and the Ready
  Stock reservation door. Manual Purchase uses its governed groups (§9.2); its request remainder arithmetic
  remains distinct from SO coverage.
- **The rail is navigation, not batch selection.** No checkboxes in the rail — rows use the
  governed `NavRow` active treatment; the only checkboxes on the page are the Register's own
  `Issue PO` selection. One filter may be selected per section; filters from different
  sections combine; clicking a selected timing row again clears it; `All products`,
  `All suppliers` and `All regions` clear their sections; clearing every filter restores the
  complete permanent Register in its two groups, including the collapsed `No purchase needed` group.
- **Counts are UNIQUE Sales Orders** — never documents, notifications, leaf lines, SKU
  quantities or PO counts. Each section's counts update against the other selected sections,
  so the printed number predicts the resulting SO rows. The fixed rows (the five timing rows,
  the three product rows and the setup row) print their live count, zero included. A supplier or
  region appears only while it has a matching SO under the other active filters — except the
  currently selected row, which stays visible with `0`.
- **The outstanding arithmetic reads the permanent Register's exact coverage facts** — for each SO
  line, customer quantity less Ready Stock already taken and less non-cancelled PO lineage
  (`soBatchOrderLineOutstandingQty`). A generic Open PO SKU pool may prevent the same units being
  issued twice today, but it does not make that Sales Order ordered and it may not claim coverage
  without exact `po_line_sources` evidence. The issue leaf is an action contract, never the
  coverage authority.
- **Product comes from the authoritative Catalog category** — never SKU text, model name,
  description, supplier, or a browser-only mapping. A multi-category Sales Order counts once
  under every matching category and still appears once in the Register. Records outside the
  three categories remain visible under `All products` and never silently leave the
  permanent Register.
- **Supplier uses the same projection as the Register's `Supplier` column** — the resolved
  outstanding-demand supplier plus the issued PO lineage supplier
  (`soBatchOrderSupplierNames`), no second browser-only supplier calculation. Actual names
  only, alphabetical. There is no `No supplier` fact category: an unexpectedly missing
  supplier fails at Catalog authority; its concrete `Check the supplier` action belongs to the
  responsible owner's central Work list, not this Operation rail.
- **Region reads the server's recorded Delivery State** — never customer text, supplier address or
  a postcode guessed on this page. Kuala Lumpur, Selangor and Putrajaya group as `Klang Valley`;
  every outstation state keeps its own name; a missing state remains findable as `Others`.
- Every timing row remains orderable. `Can order early`, `1–13 safety days left`,
  `No safety days left` and `Not enough production days` express timing risk, never
  `Cannot buy`. Order By is a planned date, never an unlock date.
- `Production days not set` is the only normal setup blocker on this surface. It belongs to
  Purchasing Settings, and its lines are not selectable until the Supplier × Category
  production days exist.
- **The readable rail shell (Card 02-C):** 240px wide · 12px outer padding · 8px heading →
  first row · 20px between groups · 36px minimum row · a wrapped label takes its natural
  height (≥ 48px) in the same body font. A governed label is never truncated and never
  hidden behind a tooltip; the count stays visible and right-aligned; the rail scrolls
  vertically as supplier names grow; at narrow desktop widths the Register scrolls
  horizontally and the rail is never squeezed below 240px. The shell/group/row grammar is
  the shared `FilterRail` component (`workspace-rail.tsx`). Manual Purchase imports the
  same shell, grammar, daily-work lens, Product authority and unique-object count rule (§9.2,
  Card 06). Its `ORDER TIMING` reads Manual `Order By`; it never imports SO Safety-days arithmetic
  or the SO-specific meaning of `All not ordered`.
- **The rail may hide completely.** Its top-right `Hide filters` control uses the same governed
  panel-left icon grammar as the Portal sidebar. While hidden it does not become a 60px icon rail;
  the Register takes the width and its toolbar exposes `Show filters`. The choice is remembered for
  that staff browser. This is one local-filter control, not another module-navigation control.
- **⭐ ON A NARROW WINDOW THE RAIL FLOATS; IT DOES NOT EAT THE TABLE — owner correction
  2026-09-11.** Below 896px of available canvas the 240px rail leaves the flow and overlays the Register, which is the
  shared purchasing responsive pattern already shipped on Purchase Orders. At 459px the Register
  keeps its full width, the page itself never scrolls sideways, each table scrolls inside its own
  box, and `Issue PO` stays on screen. At or above 896px of available canvas the rail stays in flow. The rail is never squeezed
  below 240px and a governed label is never truncated. **S3 (built 2026-09-17, SO Batch and Manual
  Purchase, `useFilterRailOpen`):** below 896px of canvas the rail STARTS hidden unless this browser
  opened it before; a browser that hid it keeps it hidden at any width.
- **PO Duty appears only in the selected Issue action, never as a permanent toolbar/rail block and
  never repeated on rows.** Selection replaces the Register's top Work Toolbar; it never adds a
  bottom action bar. The selected bar direction is
  `1 selected · 1 unit · Issue 1 PO  [Clear]  [YJ]  [Issue PO]          [Export Excel (1)]`.
  `[YJ]` is a compact structured owner
  avatar chip; hover/title reads `Yu Jun · PO Duty`. A dated cover replaces the initials and title
  with the cover identity. The action sentence never names Yu Jun. The chip states normal ownership;
  button authority comes from §5.3, so duty/cover, Jess and `operation@carres.com` see the live action.
- Fully covered / `Buy = 0` DEMAND leaves the buying selection — it is not offered a tick, and
  the leaf listing drops it — but the SALES ORDER'S ROW never leaves (Card 02-B). If a PO is
  cancelled and the quantity is still required, the selectable demand returns automatically by
  recomputation; nothing is stored.
- A line whose customer date, SKU or supplier is unexpectedly missing fails safely at its owning
  boundary (Sales / Catalog). It is named on its own row; the owning person's central Work action
  deep-links to that owning door. It never becomes a local rail category and is never silently
  defaulted.
- Every category derives from the one server planning engine. There is no second stored status.
- Retired rail words, never to return on this surface: `TO ORDER` · `All not ordered` ·
  `Ready to buy` · `Covered` ·
  `No customer date` · `No SKU` · `No supplier` · `No production days` · `BUYING RECORDS` ·
  `All lines` · `No buying needed` · `Cannot buy` — alongside the standing bans
  `Today` · `Tomorrow` · `Overdue` · `Follow Up` · `Needs Attention` · `Priority` · `Pending` ·
  `Waiting` · `Next Action` · `Buffer`.

**Safety days — APPROVED 2026-08-26.** The visible term is `Safety days`; `buffer` never reaches
a screen. `Safety days = 14 working days` on the governed Office working calendar and holidays;
`Production working days` is the existing Supplier × Category setting on the supplier's configured
work week and holidays. The one server planning engine owns the arithmetic — browser code performs
no working-day arithmetic, and Safety days are subtracted exactly once:

```text
Requested Delivery Date − 14 Safety days                         = Goods Must Arrive
Goods Must Arrive − Supplier transit working days                = Goods Must Be Ready
Goods Must Be Ready − Supplier × Category production working days = Order By
```

**THE TRANSIT LEG — APPROVED / LOCKED, owner correction 2026-09-09. BUILT.** The backward walk
subtracted production days only, while the forward arithmetic that stamps a PO's `eta_date`
(`expectedArrivalOf`) has always been `production + transit`. One derived fact therefore had two
arithmetics (Architecture Law D), and the gap was paid out of the Safety period: a PO issued
exactly ON `Order By` arrived one working day AFTER `Goods Must Arrive`. Measured on live data
(every configured supplier carries `transit_days = 1`): a Mon 2 Nov 2026 customer date gave
`Goods Must Arrive` Tue 13 Oct and `Order By` Sat 26 Sep, and the PO born that day promised
Wed 14 Oct — **13 of 14 safety days, not 14.**

`Order By` is now Fri 25 Sep for the same order, and the two walks are exact inverses of each
other. The rules that do not change: **Safety days are subtracted exactly once**, at
`Goods Must Arrive`; each leg counts on its own named calendar (Law 2A) — the transit leg on the
OFFICE week because Carres arranges the movement, the production leg on the factory's own week;
`Goods Must Be Ready` is engine-internal and is **not** a screen word, a column or a stored date;
and `Order By` remains a planned date, never an unlock date. `transit_days` is the SAME governed
`purchasing_supplier_settings` number the PO already used — nothing was added, renamed or
defaulted. A supplier with no number set keeps the pre-correction behaviour (the leg is omitted,
never guessed); this is currently unreachable, because every supplier that has production days
also has transit days.

**PO DAYS DO NOT MOVE `Order By`.** `po_days` (live: `Mon · Wed · Fri`) is a scheduling fact, not
an input to this arithmetic — the SO Batch surface passes no review days to the planner at all, so
`Order By` is calendar arithmetic alone and may legitimately land on a day POs are not sent (in the
worked example above, a Saturday). It never becomes an unlock date and never delays a late line.

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
Status · Proceed Date · SO No · PO Safety Days · Customer Requested Delivery Date ·
Customer Delivery Location · Customer · Items · Supplier · Supplier Deliver To · PO No ·
PO Default Delivery Date
```

`Items` shows `{first item} + {n} more`, with all items available in expansion.
The default sort is unchanged — groups, then the Order By urgency, then SO No — and the `To buy` /
`No purchase needed` groups stay. `PO Safety Days` reads the remaining working-day margin defined in the shared COPY dictionary; the Order By date is not a goods-table column; underlying timing calculations remain unchanged. `Proceed Date` and `SO No` pin at canvas ≥768px; below 768px only `SO No`
pins. `Proceed Date` reads `orders.proceeded_at` (the actual hand-off), never
`orders.proceed_date`. The build bumps the saved layout key so no stored arrangement keeps the old
order; `leadingColumns` still refuses to hide or move the pair. Widths are measured at 1440 in the
shell with the rail open during the build.

- **Status is the new-PO need, not a generic Partial/Ordered progress badge.** Use `Need PO` /
  `No PO needed`; retain the authoritative selection and coverage gates. Neither a status word
  nor an unknown coverage read authorizes purchasing. Partial/Ordered footer tallies stay retired.
- **Visible PO attribution comes ONLY from `po_line_sources`** — never `purchase_orders.so`,
  `so_refs`, or a global SKU/supplier/customer match. `PO Default Delivery Date` is
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
  and `PO Default Delivery Date` describe a document; on a row that has none they stay blank rather than
  printing the same sentence three times across one row. `Not recorded` under `PO Default Delivery Date`
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
review (50/50 from 1130px, stacked below); that preview remains unfinished in this design review.

**THE READ-ONLY RECORD — `Purchase order details`, its own heading, its own table.**

```text
PO No              Unit ID              SKU       Item              Qty  Deliver To    Supplier  PO Default Delivery Date
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
  **`PO-20260904-4665` is never shortened to `PO-260904-4665`** — no numbering change is approved,
  and a shortened number names a document that does not exist.
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
- **Consignment stock is choosable and is labelled.** §7.7 already rules that reservation creates no
  supplier notice; what the operator needs is to SEE that the goods belong to a supplier.
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

**APPROVED / LOCKED — Jess, 2026-09-16. BUILT in Manual Purchase Round 2 (migration 0522).**
Every request requires approval, regardless of purpose or amount; the decision and issue doors
enforce it. Per-purpose approval configuration is retired. The Register, rail, object rounds and
the create form below describe the built page; fixture walks cover every state, and the
authenticated owner walk remains owed.

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
  Transit days not set
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
  `Set the holder in Workspace → Staff & Duties.` The holder away with no eligible cover means
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
shows one total, including collapsed rows: `{n} Manual Purchases`, `1 Manual Purchase`, or
`{n} of {m} Manual Purchases` after filtering. Group counts use the same request population.
Use earliest Order By first for pending/buying work, undated `Not planned` after dated rows,
then newest Proceed Date; the lower history group uses newest Proceed Date. Header sorting
acts within groups. Search, column filters and export retain accurate source values.

**Columns — OWNER RULING (Jess, 2026-09-18) · APPROVED / NOT BUILT, exactly in this order:**

```text
Status · Proceed Date · MPR No · Approval Status · Purpose · Requested By · PO Safety Days ·
Customer Requested Delivery Date · Customer Delivery Location · Customer · Items · Supplier ·
Supplier Deliver To · PO No · PO Default Delivery Date
```

**Identity — MPR, owner ruling (Jess, 2026-09-18); overwrites the same-day "PO No as identity" and
the 2026-09-04 MPR retirement. BUILT in 0546.** Each Manual Purchase request has its own number
`MPR-YYYYMMDD-RRRR` (§6.1), allocated when the request is created, permanent and never reused.
0546 restores the `allocate_formal_document_code('MPR')` default that 0424 dropped. **Rows raised
between 0424 and 0546 stored NULL and are NOT backfilled** (CLAUDE.md §6): they print the governed
absence `Not recorded`, open from the row and its menu, and no number is invented to fill a column.
A stored `REQ-####` does not print under `MPR No` either — the ruling promises those "stay
searchable", a weaker promise than the one it makes for MPR, and Card 08 retired the series from
every operator-facing surface; the search still finds it. `MPR` = Manual Purchase Request: it is requested and
approved before it becomes one or more POs. `MP` is not used — it is already the Mattress Protector
SKU code. Historical `MPR-…` values stay as they are; historical `REQ-####` values stay searchable.
`MPR No` and `Proceed Date` pin at canvas ≥768px, `MPR No` alone below; `MPR No` opens the request.
`PO No` lists every resulting PO (blank before any PO), each opening its own PO; one row remains one
request. Customer and supplier facts use the shared dictionary. Existing groups and sorting stay.

**Customer columns on a Manual Purchase — build note.** Manual Purchases serve the governed purposes
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
- `Order By` is derived for every line by walking Delivery Date backwards through supplier transit
  days on the Office calendar and Supplier × Category production days on that supplier's calendar.
  One request uses the earliest line result. It drives timing/work and the optional quiet
  `Order by {date}` second line but not a parent or goods `Order By` column. It is not a stored date;
  missing setup prints the governed missing-planning fact.
- Manual Purchase does not subtract SO Safety days; Delivery Date is already goods arrival at
  Carres. Missing production/transit Settings produce no default or Order By.
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
  `—` (a fact, not a button) · the one clickable number · `{n} POs` opening the object's
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
- **The create form (D1, Round 2).** Below a 640px form the item search takes a whole row, `Qty` ·
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

**Goods order — BUILT:** `☐ · Status · Category · Qty · Item · Ready Stock · Supplier · Supplier Deliver To · PO No · PO Default Delivery Date`.
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

✅ **CLOSED BY 0549 (owner ruling 2026-09-20): the create form asks the question.**
`Can stock answer this?` sits beside `Need for`, two answers, **no default**, and `Send` refuses an
unanswered form with `Send — say whether stock can answer this`. The route sends
`p_fulfilment_intent` BY NAME — that is the whole fix, because PostgREST resolves an RPC by the
argument names it carries — and `purchasing_create_request_with_lines` gained the parameter and
names it in turn when it calls the header door. NULL stays legal and stays its own state: a request
raised before the question existed recorded no answer, is never guessed into one, and must answer
before it is sent again. The words are composed under ui MASTER §1.1 and reviewed asynchronously.

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
different dates therefore report and create different POs. The issued PO saves the approved
Manual Delivery Date instead of recomputing an ETA from issue day. Work ownership and reminders
stay in central `Work`; issuance authority remains the one `purchasing_issue_pos_batch` door.

**Object detail.** Clicking `MPR No` opens the full-width, one-scroll object on the shared
Object Header + Summary + Sections + History template. No tabs, no drawer, no split preview, no PDF and no narrow
720/900px islands. Sections, exactly and in this order:
`Request → Items Requested → What We Already Have → Approval → Purchase Orders → History`.

- **Object Header** — the shared object identity header (the Sales Order / Delivery Order
  implementation, Law C): one back destination `Manual Purchase` that restores the complete
  Register state the operator left (the grid stays mounted underneath — rail filters, search,
  column filters, sort, scroll and expansion survive); the business heading
  `{Need for} · {For}` with the quieter `{Proceed Date} · {supplier summary}` context
  (MPR No is visible; no UUID, and a browser title of `Manual Purchase — Carres`);
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
  never `placed_at`, which is the creation time) · `PO Default Delivery Date` (the
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
  business facts — `Manual Purchase · {Need for} · {For} · {supplier}` — while the Work
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
  a missing cron was never what was wrong.** `eta_date` is OUR production-plus-transit
  prediction (`expectedArrivalOf`), never a supplier-confirmed date and never a shipping date.

**Journey:** `+ Manual Purchase` → choose plain-language purpose → name the purpose's
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
PO Default Delivery Date · Supplier Confirmed Delivery Date · Goods Received Date · GRN No · PO Version
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
  (`MPR-YYYYMMDD-RRRR`, §6.1 / migration 0359) is READ and printed. A request with no stored number
  keeps the governed label `Manual Purchase` and opens nothing — never a UUID, never a minted
  number. Manual sources still dedupe by request identity, never by label.
- `Items`: one name or `{first item} + {n} more`; expansion shows every item.
- **The three delivery-date columns are three columns, and one is NEVER filled in from another**
  ([shared UI dictionary](../COPY-STANDARD.md#purchasing-ui-dictionary)). `PO Default Delivery Date`
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
- `PO Version`: `PO V{n}` with `PO sent to supplier · {channel} · {date}` for the current version,
  or `Sending not confirmed` when the CURRENT version's confirmation is missing. Earlier evidence
  stays in Revisions. Missing evidence never proves the PO was never sent.

🔴 **GOODS RECEIVED DATE HAS NO TIME, AND THE SCREEN SAYS SO.** The dictionary asks for the arrival
date AND time; `warehouse_receipts.goods_received_at` is a `date` column (0314) and the database
holds no arrival clock anywhere. Every row therefore prints the date plus the dictionary's own
words for a date-only record, `Time not recorded` — a guess from `submitted_at` would be the time
somebody filed paperwork, not the time a lorry arrived. **Fix, and it is Receiving's:** carry the
arrival time on the receipt (a new column and the Receiving form field that fills it), then this
column prints it with no change here. Until then the gap is stated on screen, not hidden.

**Groups — APPROVED / LOCKED, wording correction Jess 2026-09-17:** `Confirm PO sent to supplier`
and `Waiting for goods from supplier` are open headings; `Completed` and `Cancelled` are collapsed
buttons. Classify in priority order Cancelled → Completed → Waiting for goods from supplier
(current version marked as sent with goods pending) → Confirm PO sent to supplier. Each PO occurs
once. A failed/unknown quantity read is never zero or Completed; completed legacy POs without a
mark stay Completed. Search/filters cover all groups and reveal matching collapsed groups.
Default order: unmarked by PO Default Delivery Date ascending; Waiting for goods from supplier by
confirmed supplier date, falling back to original PO date, ascending; Completed/Cancelled newest
first. Unknown dates remain explicit, not invented.

**Group-local header — owner ruling 2026-09-18, BUILT 2026-09-18.** A collapsed group is its
heading and its count; an open group reads heading → column header → records. There is no header
above all groups. Every group shares one width, visibility, sorting and resizing set, and the
current group's header is sticky inside its own group and stops at its boundary. Pinned date +
number on desktop, number only on narrow screens. **UI MASTER §6.10 owns this**, once, for every
grouped listing page; this section neither restates its mechanics nor varies them.

**Rail — owner correction Jess 2026-09-18, BUILT 2026-09-18.** `Supplier reply` contains
`Supplier has not confirmed the PO date`, `Supplier Confirmed Delivery Date changed` and
`Supplier delivery date passed`, using the existing current-version sent/pending predicates.
`Receiving` contains `Partly received`. `Supplier` and `Supplier Deliver To` keep their facts and
selection rules. **The complete label is used everywhere — row, active-condition chip and export —
and is written once.** `Date changed` named none of the page's three dates, and the group heading
meant to qualify it scrolls away and does not exist on a chip at all. Icons come from the shared
kit at its own 16px / stroke 2 / neutral ink with an 8px gap: Supplier reply → message · Receiving
→ goods · Supplier → supplier · Supplier Deliver To → warehouse. A selected facet clears by being
clicked again; selects keep their `All …` option. **There is no Clear filters control in the rail**
(verified: the shared `FilterRail` has never had one). The toolbar's active-condition strip and its
own `Clear filters` are the shared listing standard's and are unchanged. No duplicate
`All purchase orders` row, DOCUMENT group or action line. Counts and predicates are preserved:
a facet's number describes the whole register, never what another facet happens to have selected.
Appearance follows UI MASTER §6.7 Portal-wide readability; do not duplicate its styling here.

**Expansion — APPROVED / LOCKED, owner confirmation 2026-09-18 · BUILT 2026-09-18.** Read-only
ordered goods, exactly in order:

```text
Category · Supplier · Supplier Deliver To · PO No / Unit ID · Qty · Items
```

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

**Footer:** `{n} purchase orders` / `{n} of {m} purchase orders` / `1 purchase order`; no quantity
totals, and no page title repeated inside the toolbar.
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

**Journey:** open prepared issue → validate authority/price/Units/destination → send PDF → record
outbound fact → record the supplier's confirmation or changed date → monitor receipt balance.
**Object/placement:** full-width view; 50/50 check/preview for issue/change; Document, Revisions,
History, Order Route. The formal PO detail, issue, revision and PDF workflows are unchanged by the
2026-09-18 listing work, and no Finance functionality was added.
**Exceptions:** supplier fabric/model unavailable, delayed/split promise, quantity change,
overdelivery, price change, cancellation and post-send destination change.
**Connections:** demand, supplier, GRN, Stock, claims, Finance read-only.


### 9.4 Receiving / GRN — owner instruction 2026-09-04 + owner correction 2026-09-06, PRODUCTION-VERIFIED

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
refused `no_grn_duty_holder`). GRN Duty is honestly unassigned until the manager assigns it in
`Workspace → Staff & Duties`. The SECOND 2026-09-06 owner correction — one Receiving
destination with the rail month Calendar, governed Supplier-Delivery-Date filtering and
server-side pagination — is PRODUCTION-VERIFIED 2026-09-07: PR #1117 merged `00bf3ced`,
both canonical surfaces on that exact SHA, served bundle carrying every new governed word and
zero retired/view-switch words, and a read-only authenticated walk proving the fixed calendar,
the date-pick filter round-trip, only-present categories, `Showing 1–7 of 7` server paging and
the intact 50/50 GRN object (evidence in CARD-2026-09-04-receiving-01).** The operating rule is:

```text
Warehouse submits count                (or Operation enters goods directly)
→ Operation reviews Receiving
→ Save Receiving
→ GRN created (allocate_formal_document_code('GRN'), stored grn_no)
→ Inventory updated automatically at Goods arrived at
```

- **ONE RECEIVING DESTINATION (owner correction 2026-09-06, second ruling).** `Purchasing →
  Receiving` is the only Receiving page. No Receiving Monitor, no `Calendar View / GRN Register
  View` switch, no permanent tabs, no second Receiving destination — the earlier two-view
  proposal is superseded. The page is: left, the 240px factual rail (GRN date and the business
  filters, portal-wide rail style); right, always the complete GRN Register. The right side never becomes a weekly calendar and never shows work cards —
  daily Receiving actions stay in My Work / Team Work.
- **THE REGISTER BOUNDARY (owner correction 2026-09-06 §1).** `Receiving` is the formal GRN
  Register, not the daily work queue: `My Work` / `Team Work` hold what staff must receive or
  review; the Register holds formal GRN records. A Warehouse count awaiting Carres action appears
  in Work and deep-links to its Receiving review; it becomes a Register row only when
  `Save Receiving` creates the GRN. The old permanent state rows (`All receiving` · `Count
  waiting for check` · `Sent back to recount` · `Posted` · `Voided`) are retired.
- **Document status — APPROVED / NOT BUILT (Jess, 2026-09-17).** A normal GRN shows no status label.
  A cancelled GRN shows `Cancelled` beneath its GRN No — `Valid` and the Status column are retired.
  `Posted`/`Voided` remain internal database statuses and never reach a normal user's screen;
  `Void Receiving` stays the act's name.
- **THE RECEIVING RAIL — APPROVED / NOT BUILT (Jess, 2026-09-17).** The month calendar is removed;
  the expected-arrival view lives in Warehouse Arrival Schedule. The rail uses the portal-wide rail
  style (UI MASTER §6.7) and carries no explanatory sentences. Groups, in order:
  - `GRN date` — the date each GRN was created: weeks (e.g. `14 – 20 Sep`), months and
    `Choose dates…`. The arrow beside a week only expands it into its days and never filters;
    pressing a week, month or day filters. Only days with GRNs are listed, Sunday included.
  - `Received with` — `Damaged goods` · `Wrong items` · `Extra goods`. A record of what was found
    at receiving, not a to-do list. Counted by GRN; one GRN may appear in more than one row.
  - `Category` — only the governed categories present, in the shared display order (`Mattress` ·
    `Bedframe` · `Sofa` · `Pillow` · `Mattress protector`); counted by GRN, a GRN with several
    categories counts in each. Category comes from the ONE shared ladder (`goodsCategoryWordOf`).
  - `Goods arrived at` — the receiving locations present.
  - `Supplier` — the suppliers present.
  - last row `Cancelled GRNs`.
  One choice per group; no `Any` or `All …` rows; pressing the chosen row again clears it. Rail
  counts, table rows and the footer (`Showing 1–{n} of {total}`) come from the same complete
  server-side filtered set, never the loaded page. **There is NO permanent `Clear filters` button
  at the foot of the rail (owner correction 2026-09-18)** — the toolbar's active-condition chips
  name what is on and clear it, one condition at a time or all of them. The earlier reading that
  this removal was a Purchase Orders correction only is superseded.
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
  zone and shown in `Asia/Kuala_Lumpur` on screen and PDF (APPROVED / NOT BUILT, 2026-09-17; the
  column is date-only today). An older record keeps its date and shows `Time not recorded`; it is
  never back-filled to midnight or to the save time. `Actual Site`, `Delivery Location`
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
- **One engine, three doors, one authority.** Office direct receiving (`office_receive_post`),
  the external Warehouse two-step (`warehouse_submit_receipt` → GRN Duty review), and the review
  doors (`warehouse_receipt_check_in` / `_return`) all pass `warehouse_receipt_validate_lines`
  and `operation_receive_po_with_do`. Every posting/review door is gated on
  `receiving_actor_context()` (0425): **GRN Duty, its dated cover, or an Operations Superuser** —
  at page, API and SQL. The posting stores the duty-evidence trio (normal holder · dated cover ·
  actual actor), never one overwritten name. GRN Duty resolves through the ONE Shared Duty
  Resolver `workspace_resolve_duty()` (Law F.1): an effective-dated `workspace_duty_assignments`
  record, or an honest `not_assigned` answer — **a rota recommendation is never silently turned
  into an assignment (owner correction 2026-09-04)**. While nobody holds the duty, the pages say
  so plainly and protected posting refuses (`no_grn_duty_holder`); the manager assigns the holder
  in `Workspace → Staff & Duties`.
- **The GRN number is STORED at posting** — `warehouse_receipts.grn_no`, drawn from the daily
  formal-document pool (0381), `GRN-YYYYMMDD-RRRR`. Sessions posted before 0426 keep their
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
  "not received". **APPROVED / NOT BUILT (Jess, 2026-09-17):**
  - The person names each exact Unit in both directions (`Received` ↔ `Not received`); the system
    never picks another Unit (today the function picks the newest free or oldest incoming Unit —
    that behaviour is retired). Received Qty is counted from the named Unit outcomes. Quantity lines
    keep quantity edits.
  - Checks follow what changes. A change to a Unit outcome or to `Goods arrived at` is refused per
    affected Unit that is reserved, on a DO, delivered or on a Supplier Claim (the Claim check is
    added), naming the reason on that Unit. Corrections to Supplier DO No and evidence are not
    blocked by other locked Units, but still pass permission and audit.
  - Concurrency: the first save wins; a later save based on an older version is refused as a whole
    with `Someone changed this GRN. Check it again.` Nothing is partly saved.
  - Every amendment keeps reason, before/after, actor and time in the append-only history and prints
    on the GRN.
  `Void Receiving` (`receiving_void`) is only for a GRN that should never have existed: full exact
  reversal when safe, a named blocker otherwise (`claims_block_void` · `threads_block_void` ·
  `units_block_void`), the record and number preserved forever. Every physical arrival creates a
  NEW session and a NEW GRN — a later arrival is never edited into an earlier one.
- **Work**: the `Goods to receive` queue projects into My Work / Team Work from two triggers only
  — a submitted Warehouse count, and an arrived supplier date with goods still owed (outstanding
  quantity alone never makes a row). Owner = the resolved GRN Duty; completion = the posted
  session; lateness counts on the Warehouse calendar (Mon–Sat).
- **`Workspace → Staff & Duties`** is the ONE assignment surface: the resolution today
  (holder / `{cover} covering for {holder}` / `Nobody holds GRN Duty.`), effective-dated
  assignment, dated cover, immutable history; the manager gate mirrors the SQL door and the page
  never offers a control the server would refuse. **`Reports → Receiving & Inbound`** is the
  central report: every non-draft session with its GRN, source, site facts, totals from the
  shared arithmetics, submitter/poster, and the `Still owed by suppliers` pending section.
- **The Warehouse boundary (owner correction §7).** The 50/50 GRN screen belongs to
  Operation / GRN Duty. Warehouse may only scan Units, record count/outcomes, upload arrival
  photo/video, and return the count to Carres. Warehouse cannot create, amend or void the GRN,
  and cannot directly update Inventory — enforced at web, API (`requireOperation`) and SQL
  (`receiving_require_post_authority`).
- The GRN Duty reviewer may verify/correct `Goods arrived at` on a submitted Warehouse count at
  check-in; `Supplier Deliver To` is never overwritten. No Manual receipt lane exists; no approved
  Receiving scope is deferred to a later card.

### 9.5 Supplier Claims — approved complete Blueprint

**Release scope — 2026-09-07, restated 2026-09-18:** the current delivery is the governed factual
Register, full-width read-only SC object and paginated source/catalog/Unit reads. Stock-claim
intake from a Stock Unit, the claim write controls below, **the shared saved-evidence viewer** and
**the Supplier Response recording surface** are all **APPROVED TARGET / NOT BUILT**. Local
implementation evidence below is not production proof.

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

**Existing rule; implementation convergence REQUIRED, not yet built.** A passed ETA or routine
partial delivery alone never opens a product Claim. Current source still calls
`runSupplierClaimSweepCron` from `apps/api/src/index.ts`; its RPC
`supplier_claim_sweep_overdue()` is defined in migration 0519. This is source evidence, not a live
production scheduler or data-count verification.

The build must retire this automatic creation path, inventory every caller and scheduled trigger,
and remove or disable the obsolete RPC safely in a new migration after dependency review. Do not
edit applied migrations or stop unrelated daily jobs. Preserve PO balance and date follow-up in
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
follow-through dates, never a claimed supplier promise. **APPROVED TARGET / NOT BUILT.**

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

**RESOLVED:** keep permanent internal identity and the formal `SC-YYYYMMDD-RRRR` number family,
shared daily code pool, Malaysia date and non-reuse law in §6.1. Old `SC-1019`-style numbers remain
unchanged. Revisions keep the number; links, not matching digits, show family relationships.

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
| The repair return date has passed | Ask Hooka when the same Unit will return | PO Duty; evidenced new date or authorised changed outcome |
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
2026-09-18, NOT BUILT.** Opening Supplier Claims shows every permitted claim — new, historical,
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
to lead and cannot express this order — Supplier Claims must NOT adopt it as built; the engine
needs a pinned-prefix that takes the page's own leading columns. No column is hidden by width; the
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
(`Items`), so every row uses the **shared 54px two-line listing row** with vertically centred
checkbox, disclosure and quantity (§6.8). The engine's 38px single-line default stays correct for
single-line registers; 54px is the goods-row geometry, not a portal-wide replacement. Short
content fits inside 54px; long content and accessibility needs may grow the row — a required
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

**OWNER-CONFIRMED 2026-09-18 · APPROVED / NOT BUILT.** The expansion has exactly one job: read the
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
fits the shared 54px row; long problem text and accessibility needs may grow it.

- **Clicking expands that Unit's evidence directly beneath that Unit. Clicking again collapses
  it.** `aria-expanded` states it. Each Unit owns its own evidence disclosure; opening one never
  closes another and never moves the rows above it.
- A count is never printed when it is unknown: an unread evidence list reads
  `Evidence could not be loaded` + `Try again`, never `Photos 0`. `Photos 0` means the record
  genuinely has none — and a kind with zero files prints no control at all rather than a dead one.

**The saved-evidence viewer — ONE shared component, and it does not exist yet.**

| Check | Measured answer |
|---|---|
| Does a shared saved-evidence viewer exist? | **No.** `apps/web/src/pages/operation/components/CaseEvidenceGallery.tsx` is a Service-Case list with an UPLOADER (append-only, no delete) and no zoom, drag, Previous/Next or overlay. `ClaimPhotoUploadField.tsx` is an upload field. `SupplierClaimPanel.tsx:35` prints `Evidence: {n} photos` as text. Source read on this branch, 2026-09-18 |
| Consequence | **🟡 KIT COMPONENT REQUEST — the component must join the kit before this page is built** (Constitution §2: never draw one inline "just this once"). Its contract is below. It is `APPROVED TARGET / NOT BUILT` |

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
| Pinned columns | The two leading controls plus `Claim status` and `Supplier Claim No` pin at canvas ≥768px; below 768px only `Supplier Claim No` pins. `Claim Reported` is never pinned. The shipped `leadingColumns` capability cannot express this order and is not adopted here. No column is hidden by width; the approved defaults or the person's saved layout always show, and overflow scrolls inside the grid |
| Widths | Content-measured `width` + `minWidth` like SO Batch/Manual Purchase, with the minimum set by the complete two-line header plus its controls. Candidates from production Inter 13px text: `SC-20260916-0007` 122.8px text (column ≈147px); widest date `Wed, 08 May` 81.1px text (column ≈97px); `In progress` needs ≈96px; `PO-20260904-4665` and `U1-000-075` share one cell, so its width is the wider of the two lines. Final values come from the build's DOM measurement |
| Row height | Shared 54px two-line listing row (§6.8), vertically centred controls. Growth for long content and accessibility is allowed; ellipsising a required fact to protect 54px is not |
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

**Implementation state of reply recording — measured on this branch, 2026-09-18, source evidence
only (no production walk):**

| Layer | Measured | Classification |
|---|---|---|
| Server door | `apps/api/src/routes/operation/supplier-claims.ts:413` defines `POST /:id/response` | **BUILT — source measured** |
| Web caller | **None.** No call to that route exists anywhere in `apps/web/src` | **NOT BUILT** |
| Record surface | `SupplierClaimPanel.tsx:83` prints `Supplier Response` read-only; its own header comment states the old inline mutations cannot stand in for the approved doors | **Read-only today** |
| Governed reply recording as designed above (answer + affected scope + date + evidence, under the approved permission gate) | Not present | **APPROVED TARGET / NOT BUILT** |

Do not describe reply recording as available. A committed route is not a delivered capability, and
neither is an approved design.

**TWO APPROVED TARGETS, BOTH NOT BUILT, AND NEITHER MAY BE DELIVERED HALF-WAY.**

| Target | State | The build's obligation |
|---|---|---|
| The ONE shared read-only saved-evidence viewer (UI MASTER §6.8) | **APPROVED TARGET / NOT BUILT** | It joins the kit before this page uses it. One implementation for Supplier Claims, Receiving, Stock and Service Case — never a page-local copy |
| The Supplier Response recording surface on the full-width claim record | **APPROVED TARGET / NOT BUILT** | The build **must** ship a working reply-recording journey, not a read-only page plus a promise |

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
2026-09-20; AUTHENTICATED PRODUCTION WALK OWED.**
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

**Still NOT built, and deliberately so.** No screen CREATES a return. §7.4 rules who may — an
approved claim outcome — and `0548` carries that door in SQL
(`purchasing_issue_purchase_return`, `operation`/`principal` only), but the confirmed UI was
the REGISTER, not a creation screen, so the screen that calls it is a later scope with its own
owner decision. The evidence viewer is not wired either: the entries carry the door and say
why they are inactive. The authenticated production walk is owed, as it is for §9.1.

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
Return document: `Return document not sent`. Pickup: `Pickup date not confirmed`, `Not picked up`,
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

**Owner-confirmed business blueprint — 2026-09-18; price/approval and owner-consent rulings 2026-09-19. APPROVED TARGET / NOT BUILT.**
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
Issue/send time, pickup time or a Service Case deadline. The governed setting supplies the period;
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
🟡 **§9.6's `Return document not sent` contradicts that same principle and §9.7's own COPY rule.**
It is named here and belongs to Purchase Returns' own round to correct; this section does not
edit another page's confirmed text.

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

**🔴 TWO MEASURED STRUCTURAL CONFLICTS — found 2026-09-20 on `61ccf39`, named before any build.**

| Conflict | Measured evidence | Consequence for build |
|---|---|---|
| **`RO No` is minted today by the RETURN LEG, not by the repair commission.** `arrival_sources` allocates it for a `repair-return` — a table that carries no supplier, price, cost responsibility, approval or sent version, and that requires a Claim or Case | `supabase/migrations/0490_…sql:136` (`allocate_formal_document_code('RO', v_id::text)`), with the source constraint at `:31` | One `RO-…` cannot name both the commission and its inbound leg — ownership Law A, and Law C's "a door, never a duplicate". The commission must mint `RO No` and the arrival source must REFERENCE it. Extend 0490's `repair-return` source check from "Claim or Case" to "an authorised RO", in a NEW migration; keep its physical checks at `:148` (Units at the recorded origin Site, status `free`/`reserved`/`on_hold`) — those are physical truth, not a source restriction. Never edit an applied migration, fabricate a Claim, or relax the checks globally |
| **There is no shared formal-document Issue engine; the only one is PO-specific.** §9.7 says Issue "uses the shared formal-document flow" — that flow does not exist | `supabase/migrations/0377_…sql`: `po_sends` keys every send on `po_id` + `po_version`, with the `confirmed_sent` unique index on that pair | Version/recipient/channel/actor/time evidence must be lifted into a document-agnostic component that RO, PRTN, CO and CRTN share, before RO Issue is built. Do not draw a second set of send controls on this page (§8.2, ONE COMMUNICATION AREA PER DOCUMENT) |

**Also measured 2026-09-20, and not defects — recorded so the next chat does not re-derive them:**
the outbound leg has no owning record (`apps/web/src/pages/operation/warehouse-schedule-view.ts:69`
states `repair-pickup` and `supplier-return` render nothing today); `Repair Orders` is
`soon: true` in `portal-nav.ts:373`; `OperationOpsRepair.tsx` is the legacy Stock `needs_repair`
queue and is NOT this register; `ops_stock_items.ownership` admits only `carres_owned` and
`supplier_consignment` (`0366_…sql:117`), so the screen has exactly two ownership words and
`Dealer` is a LOCATION; and `warehouse_kind` is only `own` / `logistics_partner` (`0027`), so
Showroom and Dealer are not governed Stock Sites yet — Stock §12.9 holds that as an approved
target. **Consequence, planner decision 2026-09-20:** the UI is drawn for all three locations now,
and selection opens Warehouse first, with Showroom and Dealer following Stock's Site work. This
neither narrows the 2026-09-18 approved scope nor pretends a Dealer Site exists today.
*Falsifier: a governed Showroom/Dealer Site row in `warehouses`, which would open selection at once.*


### 9.8 Display Requests

**Purpose / source:** showroom staff request a new model, replacement, removal or display change;
Purchasing chooses the commercial path.
**Left rail:** `Purchasing decision missing`, `SKU missing`, `Supplier path missing`, `Ready to order`, `Ordered`, `At showroom`, `Not going ahead`.
**Columns:** Request No., Outlet, Requested By, Current Unit/Model, Requested Model, Reason, Needed
Date, Purchasing Decision, Source Order, Work.
**Journey:** showroom logs in → records simple request/photo/current Unit → Purchasing decides Buy,
Consignment, Swap, Remove or No Action → system creates the correct source-linked record.
**Object/placement:** internal full-width object; no PDF preview.
**Exceptions:** Catalog SKU absent, unclear ownership, old Unit has no ID, supplier/model unavailable,
duplicate request.
**Connections:** Showroom, Catalog, Manual Purchase, CO/CRTN, Stock transfer/Unit.

### 9.9 Consignment Orders

**Purpose / source:** supplier-owned display placement or swap from approved Display Request/claim;
no blank `+ New`.
**Left rail:** `PDF not sent`, `Supplier date missing`, `Due at showroom`, `Part received`, `Swap return proof missing`, `Completed`.
**Columns:** CO No, Supplier, Source Request, Coming In Units, Going Back Units, Showroom, Supplier
Date, Received, Return Handover, Work.
**Journey:** verify supplier ownership → allocate exact Unit IDs → check coming-in/going-back lines →
send one PDF → record promise → receive through Receiving → prove outgoing handover.
**Object/placement:** full-width view; 50/50 while issuing/revising. Ownership is locked.
**Exceptions:** supplier cannot label physical Unit, package-only label, missing Unit source, partial
swap, supplier changes model/date.
**Connections:** Display Request, Stock ownership/location, Goods Receipt, linked Consignment Return.

### 9.10 Consignment Returns

**Purpose / source:** return an unsold supplier-owned Unit after approved removal, paired swap,
supplier collection, overdelivery or claim outcome; no blank `+ New`.
**Left rail:** `PDF not sent`, `Collection date missing`, `Handover proof missing`, `Part collected`, `Collected`.
**Columns:** Return No, Supplier, Source, Exact Units, Collect From, Collection Date, Handover,
Paired CO, Work.
**Journey:** system creates source-linked return → standalone return sends PDF; paired swap uses the
combined CO PDF → scan exact Unit and prove collection.
**Object/placement:** full-width view; 50/50 only for standalone issue/revision.
**Exceptions:** supplier collects wrong/partial Unit, Unit condition disputed, date changed,
unidentified legacy Unit.
**Connections:** CO/Display/Claim, Stock custody, supplier. Unsold return creates no refund, credit or
value posting.

### 9.11 Consignment Sale Notices

**Purpose / source:** system report of exact supplier-owned Units successfully delivered to a
customer; no `+ New`.
**Left rail:** `Ready to issue`, `PDF not sent`, `Supplier contact missing`, `Correction must be sent`, `Sent`. Finance invoice/match facts are read-only links, not Purchasing work.
**Columns:** Notice No., Supplier, Units Sold, Customer Received, Sales Ref, Source CO, Notice,
Finance. Customer personal information and selling price are absent.
**Journey:** Delivery success auto-creates → Current PO Duty checks exact Units → sends notice →
Finance later reads the same object.
**Object/placement:** full-width view; 50/50 check/preview during issue/correction.
**Exceptions:** duplicate delivery retry returns same notice, source supplier missing, supplier
disputes ownership, customer later returns Unit, authoritative Unit/delivery correction.
**Connections:** Delivery attempt/proof, Stock Unit ownership, source CO/GRN, Sales reference, Finance
invoice/settlement.

---

## 10 · Work, Quick Rail and Calendar

| Trigger | Owner rule | Action example | Completion fact |
|---|---|---|---|
| Manual Purchase awaits decision; due no later than its Order By | `Purchasing Approver` through the Shared Duty Resolver | `Approve purchase` (context: `Manual Purchase · Ready Stock · Carres Klang · Hooka`) | Stored approval or refusal with Primary, Cover and actual actor/time exists |
| Approved Manual Purchase has remaining demand; due on its Order By | Normal PO Duty/cover; Operations Superuser may act | `Issue PO` (same business context; distinct by request UUID) | Current PO version has confirmed-sent evidence and actual actor |
| Approved demand ready | Normal PO Duty/cover; Operations Superuser may act | `Issue the purchase order to Hooka` | Current PDF version sent, outbound fact and actual actor exist |
| Supplier has not confirmed the PO date | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka to confirm the PO delivery date` | Actual supplier answer, channel, evidence, recorder and times exist on the exact sent PO version |
| Arrival due next Office work day | Normal PO Duty/cover; Operations Superuser may act | `Confirm Hooka's Fri, 28 Aug arrival` | Actual supplier answer/date, channel, evidence, recorder and times exist on the exact PO |
| Required arrival at risk | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka if the goods can arrive by Fri, 28 Aug` | Governed supplier answer/exception, evidence and actual actor exist on the exact PO |
| PO/CO goods arrive | Normal GRN Duty/cover; Operations Superuser may act | `Receive PO-20260820-4827 from Hooka` | Exact Receiving Session records physical outcome and numbered GRN |
| Supplier DO/evidence missing | Normal GRN Duty/cover; Operations Superuser may act | `Add the Supplier DO before you finish receiving` | Supplier DO reference/evidence and actual recorder exist on the Receiving Session |
| Partial receipt leaves balance | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka for the balance delivery date` | Evidenced balance promise exists on the exact open PO line |
| Showroom display change | Showroom role then Purchasing decision role | `Record the current Unit and requested model` | Required request facts exist |
| Supplier claim reply missing | Current PO Duty | `Ask Hooka to reply to the supplier claim` | Supplier reply exists |
| Return collection missing | Current PO Duty | `Ask Hooka for the collection date` | Collection date exists |
| Repair date passed | Current PO Duty | `Ask Hooka when U1-000-001 will return` | New governed date/outcome exists |
| Consignment Unit sold | Current PO Duty | `Issue the sale notice to Dorsettloft` | Current notice version sent |
| Supplier invoice missing | Finance/AP Duty | `Ask Dorsettloft to send the invoice` | Supplier invoice fact exists |

Quick Rail may show source, exact Unit, supplier contact, current document/version, destination,
proof, linked object and read-only foreign-module state. It never edits another module's truth.

Calendar displays only governed work dates with actual weekday + calendar date. Purchasing /
Operation uses the Office calendar (Mon–Fri); Receiving / GRN / Warehouse uses the Warehouse
calendar (Mon–Sat). Sunday and Selangor public holidays are excluded. Recorded business dates are
never silently moved: PO Default Delivery Date, Supplier Confirmed Delivery Date and Goods Received Date remain the
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
- a read-only door to `Workspace → Staff & Duties` for PO Duty / GRN Duty and Buddy-cover settings; Purchasing Settings
  stores no roster and performs no Duty calculation;
- The legacy `/api/operation/po-duty` response-shape adapter is retired. `PurchaseOrdersPage`,
  `SalesOrderWorkspace` and `OperationOrdersControl` consume the shared Workspace Duty resolver;
  the Quick Rail reads the shared Work response. No caller may restore a direct `ops_po_duty`,
  cover-table read, page-local rota or compatibility response.
- PO Days remain scheduling facts. They do not create reminders or `ops_tasks`; every order that
  requires issue is already one structured `issue_po` Work projection, resolved to current PO Duty
  and closed only by the owning order/purchase facts.
- approval limits and Manual Purchase purposes;
- default `Supplier Deliver To` (`Carres Klang`) and permitted destinations, including add, address,
  availability, default, receiving station/party, arrival calendar, linked Warehouse/no-Stock
  consequence, Unit-scan requirement and signed-DO evidence controls;
- supplier channels, contacts, `Supplier work week`, Supplier × Product Category Production Days
  and `Transit days` — the last of these reached a screen on 2026-09-09. Its column and its audited
  write door (`purchasing_set_supplier_transit_days`) shipped with migration 0318 and nothing had
  ever called them, while Manual Purchase told the operator to *"Add transit days for {supplier} in
  Settings"*. Stored values are shown as they are; a supplier nobody has set reads `Set a number`,
  and the door refuses a null so an unknown lorry leg stays unknown rather than becoming `0`;
- PO grouping rules and source-preservation law;
- purchased vs supplier-consignment agreements and settlement terms;
- supplier Unit-label capability (package, physical Unit, future machine-readable support);
- outside-readable PDF templates and permitted external notes;
- claim/return/repair outcome permissions;
- customer-privacy exclusion from supplier documents.

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
- consignment placement, return and sale notices by supplier/Unit/date;
- document versions not sent to the supplier;
- Units allocated but not received, legacy Units not labelled and replacement lineage.

Finance owns supplier invoice, credit, payable, settlement and payment amounts. Operations exports
are snapshots, not editable truth or a second settlement ledger.

---

## 13 · Permissions

| Role | May do | May not do |
|---|---|---|
| Sales / Showroom | create Display Request; read connected purchase state; receive/sign/report at showroom if rostered | issue PO/CO, choose supplier price, change ownership |
| Requester | create Manual Purchase and supply missing request facts | issue PO or mark ordered merely because they requested it |
| Purchasing Approver (an active Principal person; today Jess) | approve/reject governed internal buy and commercial exceptions | decide a Manual Purchase they raised; replace receiving/PO evidence |
| Normal PO Duty / dated cover | owns the daily work; issue/revise supplier documents; record promises/claims through the one door | approve unauthorised price; post stock or supplier payment |
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
- blank independent PO, Return, Repair, CO, CRTN or CSN creation;
- separate Consignment Overview or Consignment Receipts;
- `Acknowledged` after Carres has sent the PDF;
- quiet post-send changes and silent price acceptance;
- generic work words or relative `Today/Tomorrow` dates;
- a permanent object Owner column;
- duplicate consignment receipt/accounting engines;
- customer personal/selling-price data in a Consignment Sale Notice;
- supplier payable at consignment receipt;
- reusing document numbers or Unit IDs;
- copying 2990 terminology, layout, deletion/right-click behaviour or cloned business rules.

---

## 16 · PLAN completion gate

| Gate | Result |
|---|---|
| ERP PLAN CHAT START PROTOCOL re-read | PASS |
| Current authority and conflicts audited | PASS |
| Manual / demand / PO Owner Decision Gate | **RESOLVED FROM AUTHORITY** |
| Purchasing → Receiving owner seam reconciled 2026-08-29 | **PASS — no implementation/migration authorised** |
| Current Carres challenged | PASS |
| 2990 purchasing/consignment domain mined top-to-toe | PASS |
| Mature ERP/WMS/logistics references reconciled | PASS |
| Navigation and all 11 pages owner reviewed | PASS |
| Daily journey, registers, detail, actions and exceptions defined | PASS |
| Work, Quick Rail, Calendar, Settings, Reports and permissions defined | PASS |
| External boundaries and cross-module ownership defined | PASS |
| Superseded page model rejected from final truth | PASS |
| Final truth persisted to canonical MASTER | PASS |

**PLAN MISSION COMPLETE**
