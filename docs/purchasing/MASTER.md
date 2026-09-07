# PURCHASING — MASTER

Status: **APPROVED / LOCKED — OWNER REVIEW COMPLETE 2026-08-29**
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
| Buy reason, purchase demand remainder, supplier, PO, supplier date and `Deliver To` | Purchasing |
| Physical count, condition, Supplier DO and Goods Receipt/numbered GRN evidence | Receiving — ERP Architecture §3.4; seam in §9.4 |
| Exact Unit, ownership, custody, location and availability | Stock / Warehouse |
| Actual customer handover and delivery proof | Delivery |
| Customer money | Payment |
| Supplier invoice, settlement, credit and payment | Finance / AP |
| Customer or product problem intake and outcome authority | Service Case |
| Formal Supplier Claim, Purchase Return and Repair Order execution | Purchasing after an authorised source/outcome |

The same object may appear in several modules. Only its authority edits it; every other module reads,
summarises and links.

---

## 2 · Resolution Pass and Owner Decision Gate

### 2.1 Evidence searched

The completion pass checked the former emergency-order approval law, Manual Purchase authority,
`purchase_demand` truth, PO issuance ownership, Sales Order purchasing seam, Stock Unit ownership,
Goods Receipt, Service Case outcomes and Finance/AP boundary.

### 2.2 Ruling — RESOLVED FROM AUTHORITY

There are not two genuine Carres operating models.

- A Sales Order creates a system purchase demand only for the uncovered quantity.
- A person starts a non-SO buy in `Manual Purchase`; approval creates the same governed purchase
  demand truth.
- There is no `Emergency`, `Urgent` or `Unknown` Manual Purchase purpose, question, queue or special
  PO door. Manual Purchase carries `Proceed Date` and `Delivery Date`: Proceed Date is the actual
  successful request hand-off; Delivery Date is when the supplier's goods must reach `Deliver To`.
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
| SO buying | Staff rely on Sales messages and personal memory | 2990 computes SO/MRP need and groups supplier lines | **ADAPT + IMPROVE** | SO uncovered quantity becomes demand; stock/PO coverage reduces it; ready lines batch by supplier | Open dated work, fix named blockers, set/split `Deliver To`, issue | `SO Batch Purchase` Register + row inspector + issue surface | Sales Order source; Stock coverage; Delivery required-arrival date |
| Non-SO buying | Requests are informal and may omit the business reason | Mature requisition separates internal approval from external PO | **ADAPT** | Staff create Manual Purchase; approval produces demand; rejection ends it | Select purpose, goods, quantity, date and destination; system routes approval | `Manual Purchase` Register and object; no separate request page | Catalog, Stock planning, approved Display Request, Finance approval boundary |
| Purchase demand | Staff may confuse “need” with a document to send | 2990 recomputes need; mature ERP keeps requisition/demand separate from PO | **KEEP + RELOCATE** | One hidden canonical line record stores required, covered, ordered and remaining quantity | Staff see demand facts through the correct work door; never create/send a demand document | No sidebar page; read in SO Batch, Manual Purchase, PO and Order Route | Source object creates/reduces/cancels demand; PO allocation covers it |
| Purchase Order | PDF/WhatsApp means the real order; changes can be lost | 2990 retains line balance, version and documents | **KEEP + IMPROVE** | Current PO Duty checks, sends the actual PDF, records channel/time; later changes create a version | Use 50/50 check/preview; send; record supplier promise or exception | `Purchase Orders` Register; full-width view; 50/50 only while issuing/editing | Demand, supplier, Goods Receipt, Stock, Finance read-only |
| Physical receipt / GRN | Supplier DO and Carres GRN can be confused; counts may hide damaged/wrong/extra goods | Mature ERP separates supplier delivery evidence, physical receipt and payable invoice | **ADAPT + IMPROVE** | Receiving starts from the PO/CO, records the supplier DO and physical counts, then Carres creates the numbered GRN once | Open the exact source, record Order/Received/Damaged/Wrong/Pending facts and evidence, finish once | Receiving-owned workspace and GRN record; no second receipt door | PO/CO source; Stock receives only valid goods; Supplier Claim consequence; no AP for consignment |
| Supplier problem | Receipt differences and later defects can be mixed | Source-linked claim/return flows preserve evidence | **IMPROVE** | Receiving records damaged/wrong/extra separately without reducing pending delivery or making stock available; later discovery enters Service Case and creates Purchasing claim work | Check source, evidence, supplier response and authorised outcome | `Supplier Claims` Register; claim object and optional supplier claim pack | Service Case authority; GRN/Unit evidence; Finance credit read-only |
| Purchase return | Staff may create a return because goods look wrong | 2990 can derive a return from GRN but also permits blank return | **ADAPT / REJECT blank create** | Only an approved claim/outcome creates a return; issue document; collection proof moves custody | Send return, obtain collection date, scan exact Units, record handover | `Purchase Returns` Register; formal object; 50/50 while issuing/revising | Claim source; Stock custody; Finance credit consequence |
| Repair order | Repair can be confused with replacement | Mature service logistics preserves exact serial/Unit custody | **IMPROVE** | Approved repair outcome creates RO; same Unit leaves and must return; replacement gets a new Unit ID | Issue repair order, hand over, chase dated return, inspect same Unit | `Repair Orders` Register; formal object; 50/50 while issuing/revising | Service outcome; Stock custody; Goods Receipt/inspection on return |
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
vocabulary. **A Manual Purchase has NO visible document number — owner correction
2026-09-04 (Card 08); PRODUCTION-VERIFIED on `bc96a1e3`/`23ab3121` 2026-09-04** (0424
applied through the governed path after the compatible app deployed; walked
authenticated as `operation@`: a new Manual Purchase was created with `req_no NULL`,
no number shown or announced anywhere, `—` in its PO No cell, business-fact object
heading, and the two historical rows keeping their stored `MPR-…` values untouched).
It is an internal way to prepare and approve a purchase, not a
second supplier document: before `Issue PO` nothing shows, and after it the only visible
purchasing document identity is the actual `PO No` (`PO-YYYYMMDD-RRRR`, the same formal
document both buying doors produce). The canonical invisible identity is
`purchase_requests.id`; migration 0424 retires the MPR allocator default and lets new
rows carry a null `req_no`. Historical `REQ-####` / `MPR-YYYYMMDD-RRRR` values stay
stored unchanged as legacy compatibility data — never displayed, never renumbered, and
no operator-facing surface may consume them.
An approved Display Request may route to Manual Purchase or Consignment Order; staff do not
retype it.

### 5.3 One PO issue authority

Current PO Duty, or the dated cover while one is in force, is the normal work owner and remains
accountable for PO issuance. A governed Operations Superuser may also complete any operational PO
action without becoming — or being displayed/audited as — the duty holder. Jess is an Operations
Superuser through Principal authority; `operation@carres.com` is the explicitly governed shared
Operations Superuser. An ordinary Operations login that is neither duty, cover nor superuser is
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

The destination comes from the source PO/CO `Deliver To`. When a new buy needs a default, use the
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
supply. The form never asks for a PO Delivery Date: that date belongs to each Purchase Order, not
Supplier Master.

**BUILD 2026-09-06 / DATABASE APPLIED, APPLICATION DEPLOYMENT PENDING:** the form and API submit
one complete setup to `catalog_create_supplier_setup`. Owner-approved migration `0428` was applied
at 07:35:20 UTC after production rollback assertions and a negative control passed. All six
function hashes and the tracker SQL SHA-256 match the committed approved file; no fixture rows
remain. PR #1105 carries the dependent application and deployment proof.

### 5.6 Issue means the PDF was actually sent

Opening WhatsApp, email or a PDF is not issue. The system generates the numbered version in the
50/50 surface and completion requires the actual outbound fact: document version, recipient,
channel, sent by and sent time. Once the PDF is sent by WhatsApp/email, the order is `Issued` even if
the supplier is silent. There is no `Acknowledged` status.

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
  data and future destinations continue to come from the adjacent `Deliver To` setting.
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
  arrival (the ready-date door may recompute it); the register's `PO Delivery Date`, the PDF's
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
  Supplier Delivery Date.
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
Not sent to supplier
Issued
Supplier has not confirmed the PO date
Supplier Delivery Date changed
Supplier delivery date passed
Partly received
Completed
Cancelled
```

Each line retains Order Qty, Received Qty and Pending Delivery Qty. Receiving records Damaged Qty,
Wrong Item Qty and Extra Qty separately; damaged, wrong and extra goods do not reduce Pending
Delivery Qty and never create available stock. A supplier date may split by quantity. An
unconfirmed, passed or changed supplier promise creates supplier-contact work; it never rewrites
the original PO Delivery Date or the customer promise. Confirmation work begins only after the
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
| `GRN` | Goods Receipt |
| `SC` | Supplier Claim |
| `PRTN` | Purchase Return |
| `RO` | Repair Order |
| `DR` | Display Request |
| `CO` | Consignment Order |
| `CRTN` | Consignment Return |
| `CSN` | Consignment Sale Notice |

Internal records still use invisible permanent technical IDs. `MPR` is retired (Card 08,
2026-09-04): a Manual Purchase is an internal preparation record with no visible number;
its stored historical `MPR-…`/`REQ-…` values are permanent legacy data, never displayed.

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

**HOW IT IS ENFORCED — BUILT, migrations 0381 / 0382, PR #894.** `unit_id_series` is ONE row, locked
`FOR UPDATE` while allocating, so two receipts cannot mint one Unit ID; it is a table rather than a
sequence because a sequence cannot roll `U1-999-999` into `U2-000-001` and cannot be read back
without consuming. `allocate_unit_id()` is the only door and the table is revoked from
`authenticated`. `normalise_unit_id()` makes `U1-000-001`, `U1-000001` and `U1000001` the same Unit
for search and scan. Units are minted for EVERY governed destination, not only Carres-owned
warehouses, because §6.2 requires the supplier to write the Unit ID on a showroom or external
delivery's package too. The series is seeded ABOVE anything already in the locked format:
**existing units are never recoded.**

Unit IDs are allocated when the PO/CO is confirmed for issue so the supplier-facing document can
list every expected Unit. Current supplier capability requires one simple extra line on its own
package label:

```text
CARRES UNIT ID: U1-000-001
```

No supplier physical-Unit label, QR, barcode or Carres label template is required now. Carres
Operations attaches the same text Unit ID to the physical sofa at the showroom. Future suppliers
may attach the physical label and future QR/barcode may encode the same permanent machine value;
neither upgrade may renumber the Unit.

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
PO/CO carries the official Deliver To and original PO Delivery Date
→ supplier provides its Supplier DO and may provide a changed Supplier Delivery Date
→ Receiving starts from that exact PO/CO; it never authors another purchase or receipt source
→ record Goods received on as the physical arrival date, and Goods arrived at as the physical arrival location
→ record Order Qty, Received Qty, Damaged Qty, Wrong Item Qty and Pending Delivery Qty
→ attach Supplier DO/evidence and exact Unit IDs where required
→ finish physical receiving; Carres creates the numbered GRN
├─ valid received goods → Stock receives custody/location
├─ damaged/wrong/extra → no available stock and no reduction of Pending Delivery Qty
└─ problem found later → Service Case → Supplier Claim workstream
```

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
  (`Record the PDF sent`) are drawn by ONE component on every surface that chases a document. Two
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

**Purpose / source:** system-generated uncovered SO lines only; no `+ New`.

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
TO ORDER
  All not ordered

ORDER TIMING
  Can order early
  14 safety days left
  1–13 safety days left
  No safety days left
  Not enough production days

PRODUCT
  All products
  Mattress
  Bedframe
  Sofa

SUPPLIER
  All suppliers
  [actual supplier names, alphabetical — never hardcoded]

REGION
  All regions
  Klang Valley
  [actual outstation Delivery State names, alphabetical]
  Others                    ← only when Delivery State is not recorded

SETUP TO FIX              ← the whole section renders only when at least one affected SO exists
  Production days not set
```

- **The rail is navigation, not batch selection.** No checkboxes in the rail — rows use the
  governed `NavRow` active treatment; the only checkboxes on the page are the Register's own
  `Issue PO` selection. One filter may be selected per section; filters from different
  sections combine; clicking a selected timing row again clears it; `All products` and
  `All suppliers`, and `All regions` clear their sections; clearing every filter restores the
  complete permanent Register, Ordered records included. `All not ordered` remains the
  explicit outstanding-only filter.
- **Counts are UNIQUE Sales Orders** — never documents, notifications, leaf lines, SKU
  quantities or PO counts. Each section's counts update against the other selected sections,
  so the printed number predicts the resulting SO rows. The fixed rows (`All not ordered`,
  the five timing rows, the three product rows and the setup row) print
  their live count, zero included. A supplier or region appears only while it has a matching SO
  under the other active filters — except the currently selected row, which stays visible with `0`.
- **`All not ordered` reads the permanent Register's exact coverage facts** — for each SO line,
  customer quantity less Ready Stock already taken and less non-cancelled PO lineage. A generic
  Open PO SKU pool may prevent the same units being issued twice today, but it does not make that
  Sales Order ordered and must not remove it from this count without exact `po_line_sources`
  evidence. The issue leaf is an action contract, never the count authority.
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
- Retired rail words, never to return on this surface: `Ready to buy` · `Covered` ·
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
Goods Must Arrive − Supplier × Category production working days  = Order By
```

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
proceeded-SO population. Rail filters combine with AND: `All not ordered` plus a timing facet shows
only rows satisfying both.

**Columns, exactly and in this order:** Status · Proceed Date · PO No · SO No · Customer ·
Delivery Location · Requested Delivery Date · Supplier · Deliver To · PO Delivery Date.
`Delivery Location` sits immediately after `Customer`; `SO No` is the identity and stays sticky
during horizontal scrolling. `Proceed Date` reads `orders.proceeded_at`: the actual date Sales
handed the complete order to Operations. It never reads `orders.proceed_date`, the planned
production-start date. Retired as Register columns, never to return: `Source SO` ·
`Required For` · `SKU / configuration` · `Required` · `Stock` · `Open PO` · `Buy` ·
`Goods Must Arrive` · `Work` · `Action` — their FACTS survive off-screen (`goodsMustArrive`
keeps feeding the rail and Work Engine; structured actions keep feeding central Work).

- **Status is derived, never stored:** blank · `Partial` · `Ordered`, from the quantity that
  genuinely requires purchasing (demanded minus Ready-Stock coverage) against the quantity
  covered by a NON-CANCELLED purchase order whose CURRENT PDF version has confirmed-sent
  evidence (`po_sends.kind = 'confirmed_sent'` at `COALESCE(purchase_orders.version, 1)`).
  `external_open` never counts; supplier silence changes nothing; a numbered but unsent PO shows
  under `PO No` with blank Status; a new unsent revision invalidates older-version completeness;
  received lineage with valid evidence stays `Ordered`; a fully Ready-Stock-covered order stays
  visible, blank and unselectable.
- **Visible PO attribution comes ONLY from `po_line_sources`** — never `purchase_orders.so`,
  `so_refs`, or a global SKU/supplier/customer match. `PO Delivery Date` is
  `purchase_orders.eta_date`, the official supplier-facing date — never `expected_ready_date`,
  never the internal `Goods Must Arrive`, never an "if ordered today" estimate.
- **Deterministic summaries:** one value prints itself; several print `2 POs` · `2 suppliers` ·
  `Multiple`, with the exact item-to-PO/supplier/destination/date mapping in the expansion.
- **Selection:** the parent checkbox is ALL of the order's eligible uncovered child demand;
  a Partial order selects only its uncovered remainder; Ordered and fully Ready-Stock rows refuse
  the tick; part-selected children render the checkbox indeterminate; the header checkbox covers
  visible eligible demand only. The issue contract remains the leaf `SoBatchSelection[]`.

**Journey:** choose ready orders/lines → group by supplier → change/split destination if
exceptional → 50/50 check grouped POs → send PDFs.
**Object/placement:** the row expand is **`GoodsMiniTable`**, the ONE child table Sales Orders and
Delivery draw (owner ruling 2026-08-15; corrected onto this page 2026-08-24; widened with the
optional `Covered by` · `Supplier` · `PO Delivery Date` columns 2026-08-27 — siblings that do not
ask render byte-identically). It says only what the ROW cannot: per item line, what covers it
(`Ready Stock` · the exact PO numbers · `Not ordered yet`), the Unit ID where one is allocated
(read through the Sales Order expansion door), the exact supplier/`Deliver To`/`PO Delivery Date`
mapping, and the arrangement editor for lines still being bought. Batch Purchase owns no
duplicate demand editor and no second mini-table.
**Exceptions:** cancelled/changed SO, stock becomes available, supplier missing, supplier date too
late, price changed, split destination.
**Connections:** Sales Orders, Stock, Delivery calendar, Catalog, PO.

**THE DOCUMENT PARTITION — ONE CONTRACT, BOTH SIDES.** A purchase order is one
`Supplier × Deliver To × Category × (one-PO-per-order category ? Source Order : —)`. The browser and
the server compute that key from the same facts (`documentPartitionKey`), so `Issue N POs`, `1 of N`,
the commercial decisions, the server's grouping and the number of purchase orders created cannot
drift apart; the server still recomputes it from its own recomputation, which is agreement rather
than trust. A commercial decision names the exact document it belongs to, and a duplicate, foreign,
stale or partial-coverage decision is refused BY NAME. A `Deliver To` split therefore buys the
demand ONCE: lines are composed from the ALLOCATION, not from the whole build.

**EVERY PO LINE CARRIES ITS SOURCE.** `po_line_sources` records which customer order, SO number and
order line each unit is for, validated in SQL rather than trusted, and the parts must add up to the
line. The supplier-facing document prints that breakdown, so a bulk purchase order no longer shows a
blank `SO NO`.

### 9.2 Manual Purchase

**Purpose / source:** non-SO internal buys under the approved §5.2 purpose vocabulary:
`Ready Stock` · `Showroom Display` · `Service Case` · `Internal Staff Purchase` ·
`Subsidiary Purchase` · `Other Purchase` (Card 04, 2026-08-29 — only `Other Purchase`
asks `What is this for?`).

**Left rail — OWNER-CORRECTED 2026-08-29 (Card 06 supersedes Card 03's four-section
shape; Card 03 remains the shipped shell/count history); PRODUCTION-VERIFIED on merge
`87ef0e2812fc80271d1e527f74513571b32466e9` 2026-08-30** (PR #987; no migration; walked
authenticated on the live `operation@carres.com` account: the exact seven sections with
live unique-MPR counts, `ORDER TIMING` deriving `Order date passed 1` for the real
`MPR-20260829-2779` from the configured lead days, the timing filter narrowing to exactly
that request, and `SETUP TO FIX` honestly absent with no affected request — Card 06 §12
holds the complete evidence, including the create form's server-proposed Delivery Date
and the `Approve {MPR}` Work hand-off grouped under Jess, due on Order By, deep-linking
the exact object).** The vocabulary's applied door authority is
migration 0399 (2026-08-28), widened by 0401 (Card 04) with `other_purchase`; the sixth
rail row arrives through the one shared `DEMAND_PURPOSES` list, so the rail and the doors
cannot drift. The shared 240px
`FilterRail` shell Card 02-C built — same group-heading typography and spacing, same blue
`NavRow` active treatment, no checkboxes, labels wrap and never truncate, counts visible and
right-aligned, rail scrolls vertically, Register scrolls horizontally when narrow and the
rail is never squeezed below 240px. Seven sections, in this exact order:

```text
WORK TO DO
  Approve purchase
  Issue PO
  Check the supplier
  Add production days
  Add transit days

TO ORDER
  All not ordered

ORDER TIMING
  Can order early
  Order date reached
  Order date passed

PURCHASE PURPOSE
  All purposes
  Ready Stock
  Showroom Display
  Service Case
  Internal Staff Purchase
  Subsidiary Purchase
  Other Purchase

PRODUCT
  All products
  Mattress
  Bedframe
  Sofa

SUPPLIER
  All suppliers
  [actual supplier names, dynamic and alphabetical — never hardcoded]

SETUP TO FIX
  Production days not set
  Transit days not set
```

- The default no-filter Register is the permanent Manual Purchase listing, ordered history
  included. Counts are UNIQUE Manual Purchase requests, cross-computed against the other
  selected sections. One filter per section; sections combine with AND; each `All …` row
  clears only its own section; a second click on the active row clears it.
- `WORK TO DO` is a local action lens over central Work's same stable action identities, not a
  second queue. All five rows remain visible with zero. `Approve purchase` is submitted and
  undecided approval; `Issue PO` is approved remaining demand; the other three name the exact
  Catalog/Settings repair. `Need approval` and `Ready to order` retire from `TO ORDER` because
  their capability has moved to these concrete action rows without duplication.
- Everyone permitted to read Manual Purchase may use these rows as filters. The filtered
  Register/object names the real action owner; a filter never grants approval or PO authority.
- `All not ordered` = live quantity not yet fully issued to a PO. Fully ordered requests leave
  this filter but stay searchable in the permanent Register.
- `ORDER TIMING` reads the request's earliest calculated `Order By`: today before it =
  `Can order early`; today equals it = `Order date reached`; today after it =
  `Order date passed`. These are filters and facts, not permission gates; an authorised issuer
  may buy early.
- `SETUP TO FIX` renders only when an affected request exists. `Production days not set` and
  `Transit days not set` state the configuration fact; their owning actions and Settings links
  live in `WORK TO DO`. The engine never invents a date.
- Product is the authoritative Catalog category — never SKU text or a browser-only mapping.
  Supplier is the demand line's Catalog-derived supplier (plus identical PO lineage) —
  derived, never selected by Operation; actual names only, alphabetical; the selected
  supplier stays visible with `0`.
- **Banned rail rows, never to return:** `Supplier not selected` · `No supplier` ·
  `Not in catalog` · `Need price` · `Ordered` · `Part received` · `Received` · `Arrived` ·
  `Cancelled` · `My drafts` · `Need correction` · `Queues` · safety-days rows. A missing SKU or
  supplier is named inside the affected request and handled through
  its owning Catalog boundary; it never becomes a permanent rail facet. Price is not a rail
  state or filter.
- The rail says `Approve purchase`; the Register/object shows the real action owner's name —
  the governed sentence `{name} approves` beside `Waiting for approval`, naming the resolved
  `Purchasing Approver` Duty holder; a robot or shared-password login never prints while a named
  person holds the duty; nothing resolved prints nothing.
  Purchasing Settings stores only the required `Purchasing Approver` Duty key; the person resolves
  from `Workspace → Staff & Duties`, so the holder can change without redesigning this rail. The
  holder may approve a purchase they requested when the purchasing rule permits self-approval. Operation
  prepares and submits; it does not approve and does not control price. Approved requests
  continue into the one governed PO Duty issuance door; Manual Purchase and SO Batch
  Purchase remain separate doors.
- **The decision renders only for who the SQL door would pass (fixed 2026-08-29).**
  The approved target is the resolved `Purchasing Approver` Duty. The current
  `purchasing_decide_request` gate (`purchasing_settings_gate`, 0360) still admits `principal`
  or the `ops_manager` position duty — legacy implementation that must converge behind the Shared
  Duty Resolver, with no legacy-email pass — and `canApprove`
  (the Approve/Refuse controls AND the approver-only money) asks exactly that, never the
  wider daily-surface manager check that admits the shared `operation@` login. Card 04's
  production walk measured the disagreement (`MPR-20260829-2779`: controls offered, door
  refused with the raw word `forbidden`); the door's 42501 now leaves as the governed two
  lines (`not_purchase_approver`), naming the resolved approver.
- **The vocabulary's applied door authority is migration 0399** (2026-08-28): two Card-03
  build lanes collided on 0398, and the intermediate `0398a` apply left two inert
  `purchasing_purpose_approval` rows (`internal_staff`, `subsidiary`) that 0399 documents
  and tolerates; the repo's `0398_a_purchase_names_the_approved_purpose.sql` is superseded
  by 0399 and must never be applied. The vocabulary itself is unchanged from the owner
  ruling above.

**THE PERMANENT REGISTER — APPROVED / LOCKED, Card 04 (2026-08-29); PRODUCTION-VERIFIED
on `a1d11d53` 2026-08-29** (migration 0401 applied; walked authenticated — the live door
minted `MPR-20260829-2779`). One Manual
Purchase request per parent row, on the same Register engine and visual grammar as Sales
Orders (`register/DataGrid`, `appearance="reference"`, 36px header / 38px rows / 32px
footer, sticky Manual Purchase identity, horizontal scroll that never squeezes the 240px
rail). The default population is the COMPLETE permanent history, ordered records included —
`All not ordered` stays an explicit rail filter, never a silent default. Default order:
newest `Proceed Date` (`created_at`) first. A work/timing lens sorts earliest calculated
`Order By` first, then newest Proceed Date.

**Columns, exactly and in this order — owner correction 2026-09-04 (Card 08 removes the
number column from Card 06's verified order); PRODUCTION-VERIFIED on `23ab3121`
2026-09-04 (the date contract stays as verified on
`87ef0e28` 2026-08-30 — the issued PO's `eta_date` IS the approved Manual Delivery Date,
and the issue partition adds Delivery Date through the one `purchasing_issue_pos_batch`
door):** Proceed Date ·
Approval Status · PO No · Delivery Date · For · Items · Qty · Supplier ·
Deliver To · Requested By.

- `Proceed Date` is the Malaysia date of the successful `Send for approval` header transaction,
  projected from the actual `created_at`. It is immutable and never approval date, PO issue date,
  Delivery Date or calculated Order By.
- `Delivery Date` is `purchase_requests.required_by`: when supplier goods must reach `Deliver To`,
  not a customer promise or physical receipt time. With complete Catalog/Settings, the create form
  defaults it to the latest `expectedArrivalOf(Settings, Proceed Date)` across selected lines.
  Staff may move it; the engine never silently overwrites a chosen value.
- `Order By` is derived for every line by walking Delivery Date backwards through supplier transit
  days on the Office calendar and Supplier × Category production days on that supplier's calendar.
  One request uses the earliest line result. It drives timing/work and the optional quiet
  `Order by {date}` second line; it is not another parent column or stored date.
- Manual Purchase does not subtract SO Safety days; Delivery Date is already goods arrival at
  Carres. Missing production/transit Settings produce no default or Order By.
- `Approval Status` is the approval FACT (`Need approval` · `Approved` · `Refused` ·
  `No approval needed`); while approval is needed a quiet second line names the real
  configured approver — `{name} approves` (Card 03 §3's arithmetic).
- There is NO number column (Card 08). The row and its deep-link run on the invisible
  request UUID; `req_no` is legacy database data no operator surface consumes.
- `PO No` reads ONLY the lines' real lineage (`purchase_order_lines.demand_id`, the
  demand's own `po_id` as pre-0361 fallback) resolved to actual `purchase_orders.po_no`:
  `—` (a fact, not a button) · the one clickable number · `{n} POs` opening the object's
  exact linked PO list. Never a UUID, never a SKU/supplier/date inference, and never the
  Manual Purchase identity — a purchase may have no PO or several.
- `For` is the structured object the purchase serves (§5.2): destination context for
  `Ready Stock` / `Showroom Display`, the linked Service Case, the real staff member, the
  actual subsidiary, or `Other Purchase`'s required answer. It is the clear single-click
  entrance to the object and the sticky business column during horizontal scrolling; a
  historical row without the structured fact prints its purpose word so the entrance
  never disappears.
- `Items` speaks Catalog human words through the ONE item-label arithmetic
  (`railItemLabel`): one item's name, or `{first item} + {n} more`; the SKU stays
  searchable and shows in the expansion. `Qty` is the total originally requested
  quantity, never the remainder. `Supplier` is Card 03's Catalog-derived projection —
  one actual name or `{n} suppliers`, never `Supplier not selected`. `Deliver To` prints
  the governed destination, `Multiple` when several. `Requested By` is the real staff
  name — never a shared account, role, email or `(you)`.
- **Purpose is NOT a parent column** — it lives in the rail, the expansion context and
  the object. Banned parent columns, never to return: `Purchase Purpose` · `Order late` ·
  `Need price` · `Part received` · `Received` · `Arrived` ·
  `Work` · `Next action` · `Reason` · `Remark` · `Price` · a permanent PO Duty ·
  row action buttons.

**The row expansion** is ONE quiet read-only child table — `SKU · Item · Requested Qty ·
Approved Qty · Ordered Qty · Still To Order · Supplier · Deliver To · PO No` — using the
one governed remainder arithmetic (`manualPurchaseLineRemainingOf`: the approver's number,
falling back to the ask, less what was issued, floored at zero — the same function the
issue door and issue-costs read). No Approve/Refuse/Receive, no price editing, no PO
creation and no PDF preview inside it.

**Selection and PO Duty.** Only requests whose derived status is `Ready to order` with
live remaining quantity take the tick. With no selection there is NO PO Duty block,
initials or reminder anywhere on the page; with a selection, PO Duty appears once beside
the one issue action — `{n} selected · {u} unit(s) · Issue {p} PO(s)`, the resolved
person, `Issue PO` — where the PO count is the same document partition the issue door
groups by (supplier × category × destination × purpose × Manual Delivery Date, merged across
requests only when every fact matches). One PO has one official supplier-facing Delivery Date;
different dates therefore report and create different POs. The issued PO saves the approved
Manual Delivery Date instead of recomputing an ETA from issue day. Work ownership and reminders
stay in central `Work`; issuance authority remains the one `purchasing_issue_pos_batch` door.

**THE OBJECT DETAIL — APPROVED / LOCKED, Card 05 (2026-08-29); PRODUCTION-VERIFIED on
`a43de3b7` 2026-08-29** (PR #984; no migration; walked authenticated on the live
`operation@carres.com` account against the real `MPR-20260829-2779`: full-width six-section
object, `Requested By` honestly `Staff identity not recorded` for the shared-login record,
Approval showing `Need approval · Jess approves` with NO money and NO controls, `Not ordered
yet` lineage, History `Purchase requested` in the three-rank grammar, and `‹ Manual Purchase`
restoring the Register; the approver money/decision surface and the prev/next stepping were
proven on the same SHA's seeded dev walk plus the API contract tests — Jess's live positive
walk remains hers). Clicking the `For`
cell opens WORK (Card 08 — the retired number column's one job): one full-width,
one-scroll object on the approved Object Header + Summary +
Sections + History template. No tabs, no drawer, no split preview, no PDF and no narrow
720/900px islands. Sections, exactly and in this order:
`Request → Items Requested → What We Already Have → Approval → Purchase Orders → History`.

- **Object Header** — the shared object identity header (the Sales Order / Delivery Order
  implementation, Law C): one back destination `Manual Purchase` that restores the complete
  Register state the operator left (the grid stays mounted underneath — rail filters, search,
  column filters, sort, scroll and expansion survive); the business heading
  `{Need for} · {For}` with the quieter `{Proceed Date} · {supplier summary}` context
  (Card 08 §3.3 — no MPR, no UUID, and a browser title of `Manual Purchase — Carres`);
  one derived
  state pill (`manualPurchaseStatusOf`); the filtered Register position `{n} of {m}` with
  keyboard-operable previous/next when the object is in the filtered list. No duplicate Back,
  page title, pseudo-tab, breadcrumb or PDF action; no new edit/delete/undo/take-back door.
- **Request** — `Proceed Date · Delivery Date · Need for · For · Deliver To · Requested By`, in
  that reading order. Proceed Date is the actual successful request hand-off; Delivery Date is
  supplier-goods arrival at Deliver To. With a complete plan, a quiet second line reads
  `Order by {date}`; if passed, the fact first states `Order date passed`. `Requested By` is the
  real individual resolved server-side; a
  shared-account record reads `Staff identity not recorded` — a person is never invented. A
  pre-Card-04 stored reason stays visible under the historical `Why`.
- **Items Requested** — read-only `SKU · Item · Supplier · Requested Qty · Deliver To · Note`;
  Catalog human words beside the explicit SKU; a missing Catalog supplier is a named fact on
  the line (`No supplier yet` + the Catalog act) and never a rail facet.
- **What We Already Have** — `SKU · Free Stock · Already On PO · Still Needed` per live SKU,
  through the one shared arithmetic (`stillNeededOf`) and the same stock/open-PO reads the
  create workspace uses. Decision facts, not buttons and not Work rows.
- **Approval** — always present. `No approval needed`; or `Need approval` + `{name} approves`
  for a viewer without the gate; or, for the actual approver only, one line per live SKU
  (`SKU · Requested Qty · Still Needed · Approved Qty · Transaction Cost · Line Total`) with
  `Approved Qty` prefilled once from Still Needed (whole 0..Requested; a human edit is never
  overwritten by a refetch), `Approve` as the one primary action, `Refuse` neutral behind a
  required `Decision reason`. Cost is read-only approval evidence, never an Operation price
  control. A decision is atomic and final; success STAYS on the object, refetches the facts,
  removes the controls and appends History. A decided object shows the fact, the real actor,
  date/time and (approved) the per-line quantity / (refused) the reason.
- **Purchase Orders** — read-only exact lineage: `PO No` (a door to the exact PO) ·
  `Ordered Qty` · `Still To Order` · `PO Issued` (`placed_at`) · `PO Delivery Date` (the
  ORIGINAL supplier-facing date — the promise ledger's first held date when the supplier moved
  it, else the issue-stamped date) · `Supplier Delivery Date` as `Not confirmed` until supplier
  evidence exists, `Same as PO` when the supplier confirms the PO date, or the supplier's changed
  date. No lineage reads `Not ordered yet`. **The PO number
  IS `purchase_orders.id`** — no `po_no` column exists; Card 05 fixed the latent register read
  that selected one (it would have 400'd the whole Register on first lineage).
- **History** — the final section: `Today · Yesterday · Earlier`, the locked three-rank record
  grammar, stored facts only (`Purchase requested` · `Purchase approved` · `Purchase refused`
  · `Marked not going ahead` · `Purchase order issued`). Real individual actor and actual
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
  approver) · `no_purchase_approver` · `already_decided` · `reason_required` ·
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
  source (`?tab=manual-purchase&mp={uuid}`); the local
  `WORK TO DO` rail filters these same identities and never becomes a second queue or manual Done.

**Journey:** `+ Manual Purchase` → choose plain-language purpose → name the purpose's
structured For object → enter goods/quantity/destination → system previews Proceed Date and
defaults Delivery Date from Settings → Send records actual Proceed Date → approval → approved
demand goes to PO Duty by Order By.
**Exceptions:** duplicate stock, missing quantity/date/destination, unapproved price,
missing governed Catalog/supplier relationship, refused/withdrawn request.
**Connections:** Catalog, Stock planning, Display Request, Purchase Demand, PO, Service Case.

### 9.3 Purchase Orders

**Purpose / source:** every numbered supplier purchase commitment and version. No blank independent
PO; source is approved demand.
**Left rail — OWNER-CORRECTED 2026-08-31 (Card 07):** the open 240px rail has no visible generic
`Filters` title. It uses business groups and the existing filter truth/counts:

```text
PURCHASE ORDERS
  All purchase orders

DOCUMENT
  PDF not sent
  Version changed
  Send the new version to supplier   ← line 2 of the same row/count

SUPPLIER REPLY
  Supplier has not confirmed the PO date
  Supplier delivery date passed

RECEIVING
  Partly received
  Completed
```

The version row is one `supplier_update_required` filter, not two rows. Its fact and action are
deliberate separate lines; the em dash and the ambiguous phrase `supplier update required` never
render. Grouping changes no population, filter key, count, permission or completion fact.
**Date facts:** `PO Issued` sits beside `PO No` and means when Carres issued the current supplier
commitment. `PO Delivery Date` is the original official supplier-facing date on the PO and therefore
is never described as missing merely because the supplier has not replied. `Supplier Delivery Date`
reads `Not confirmed` until supplier-answer evidence exists, `Same as PO` when the supplier confirms
the PO date, and the supplier's actual date when it differs. `Not confirmed` is a cell fact; it
becomes a rail/work condition only after the current PO version has confirmed-sent evidence and
Pending Delivery Qty is above zero. `Goods received on` belongs to Receiving and never substitutes
for any of these dates.
**Columns — APPROVED 2026-09-04, in this order:** PO No, PO Issued, Supplier, Source, Deliver To,
PO Delivery Date, Supplier Delivery Date, Order Qty, Received Qty,
Pending Delivery Qty, PO Version, Sent to Supplier. The Register lists authoritative facts only:
no `Work` column, no action sentence, no owner avatar or duty holder on any row — actions live in
My Work, Team Work, the Purchase Order detail and Order Route, unchanged.
**Quantity facts:** `Order Qty` is the total on the current PO. `Received Qty` is the correct and
accepted quantity posted through Receiving. `Pending Delivery Qty` = Order Qty − Received Qty,
pieces of goods, never a money balance; damaged, wrong and extra goods are separate receiving
facts and never reduce it. The footer totals use these same three words.
**PO Version fact:** the current OFFICIAL document version, printed `PO V1` · `PO V2` · `PO V3` —
never `Version 1`, `Current Version` or `PDF Version 1`, and never the WhatsApp/email copy.
**Sent to Supplier fact:** the latest exact PO version with `confirmed_sent` evidence, with the
channel and date as its evidence second line (`PO V1` / `WhatsApp · Thu, 4 Sep`); no confirmed
send ever — including a legacy PO that received goods without one — reads `Not sent`, and missing
evidence stays visibly missing. Opening, downloading or previewing the PDF proves nothing, and the
system never claims the supplier read or accepted the PO — only which version Carres sent, through
which channel, to which recipient, when and by whom. `PO Version` beside `Sent to Supplier` makes
a version mismatch (`PO V2` vs `PO V1`) immediately visible.
**BUILD 2026-09-06 / DATABASE APPLIED, APPLICATION DEPLOYMENT PENDING:** migration `0428`
preserves an immutable original PO date and requires an append-only current-version reply with
channel/evidence/reporter/recorder/time and shared duty/cover. Production rollback verification
proved atomic supplier setup, role/send/version/evidence guards, preserved known and unknown
original dates, exact persisted source planning without changing an unrelated order, and a
negative control that fails when the send guard is removed. All six committed function bodies
were reconciled before and after apply; tracker version `20260906073520` stores the exact approved
SQL SHA-256 `c4fe5a29f4d4672cf13535577c28f60d8222b37d6399d657245150d385c7cb85`.
Earlier records receive no invented dates or reply evidence. PR #1105 carries the Register,
reply form and shared Work projection; application deployment proof remains pending.
**Journey:** open prepared issue → validate authority/price/Units/destination → send PDF → record
outbound fact → record the supplier's confirmation or changed date → monitor receipt balance.
**Object/placement:** full-width view; 50/50 check/preview for issue/change; Document, Revisions,
History, Order Route.
**Exceptions:** supplier fabric/model unavailable, delayed/split promise, quantity change,
overdelivery, price change, cancellation and post-send destination change.
**Connections:** demand, supplier, GRN, Stock, claims, Finance read-only.

### 9.4 Receiving / GRN — owner instruction 2026-09-04 + owner correction 2026-09-06, PRODUCTION-VERIFIED

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
  proposal is superseded. The page is: left, the 240px rail with the full month Calendar FIXED
  on top and the business filters scrolling independently beneath it; right, always the complete
  GRN Register. The right side never becomes a weekly calendar and never shows work cards —
  daily Receiving actions stay in My Work / Team Work.
- **THE REGISTER BOUNDARY (owner correction 2026-09-06 §1).** `Receiving` is the formal GRN
  Register, not the daily work queue: `My Work` / `Team Work` hold what staff must receive or
  review; the Register holds formal GRN records. A Warehouse count awaiting Carres action appears
  in Work and deep-links to its Receiving review; it becomes a Register row only when
  `Save Receiving` creates the GRN. The old permanent state rows (`All receiving` · `Count
  waiting for check` · `Sent back to recount` · `Posted` · `Voided`) are retired.
- **Document status words are `Valid` / `Cancelled`.** `Posted`/`Voided` remain internal
  database statuses and never reach a normal user's screen; `Void Receiving` stays the act's
  name.
- **THE RAIL MONTH CALENDAR (owner correction 2026-09-06, second ruling).** The full month
  Calendar stays fixed at the top of the rail; the ‹ › arrows move exactly one month. Sunday
  stays visible for understanding the month and wears the muted non-working state — Receiving
  follows the Warehouse working calendar, Monday–Saturday. A date with expected supplier
  arrivals prints a visible COUNT (colour is never the only signal, and the day's aria sentence
  says it in words); expected dates come from the linked POs' governed `Supplier Delivery Date`
  (`poSupplierDeliveryDateOf` — the evidenced supplier reply; a date only Carres computed never
  marks a day, and a fully received or closed PO stops being expected). Selecting a date filters
  the SAME right-hand GRN Register by that Supplier Delivery Date; selecting it again, or
  `Clear filters`, restores the complete listing. The Calendar shows no work cards.
- **The Filter Rail (owner correction §2)** holds, beneath the Calendar: `CATEGORY` ·
  `SUPPLIER` (the suppliers present in the records) · `GOODS ARRIVED AT` (the receiving
  locations present in the records) · `Clear filters`. CATEGORY shows ONLY the governed rows
  actually present in the Receiving result set, in the shared display order (`Mattress` ·
  `Bedframe` · `Sofa` · `Pillow` · `Mattress protector`; `MP` always prints as `Mattress
  protector`). No `Any`, no `All …`, no invented category, no second received-date filter — the
  table's `Goods received on` column owns detailed date filtering. Re-clicking the active row
  clears its section. Category comes from the governed catalog truth through the ONE shared
  ladder (`goodsCategoryWordOf`, the same rule the Sales Orders register speaks); Receiving
  never derives its own category from SKU text.
- **SERVER-SIDE PAGINATION (owner correction 2026-09-06, second ruling).** The Register never
  renders the whole GRN history: the server pages it (default `Showing 1–50 of {total}`,
  Previous/Next), and the footer total plus every rail count speak for the COMPLETE filtered
  result set — computed by the ONE shared arithmetic (`buildGrnRegisterView`, behind
  `GET /api/operation/warehouse-receipts?scope=grn`), never by the loaded page. Search, column
  filters, Columns and Export stay; a changed filter or search term returns to page 1.
- **Register columns** lead with identity and the arrival story: `GRN No` · `Supplier Delivery
  Date` (the linked PO's governed supplier answer — the same date the Calendar filters by;
  `Not confirmed` while no evidenced reply exists) · `Goods received on` · `PO/CO No` ·
  `Supplier` · `Product` (the GRN paper's own line words — `product_skus.variant`, else the
  SKU) · `Deliver To` · `Goods arrived at` · `Received Qty` · `Status`, with `Supplier DO No.`
  and the damaged/wrong/extra quantity facts behind them.
- **The corrected location/date words (owner correction §3):** `Deliver To` = where the PO
  instructed the supplier to deliver · `Goods arrived at` = where the goods physically arrived ·
  `Goods received on` = the physical arrival date and time. `Actual Site`, `Delivery Location`
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
  `Goods received on`, `Goods arrived at`, Supplier DO number and evidence (0427: a corrected
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
- **Per-Unit outcomes** (ERP-ARCHITECTURE §3.4): a governed expected Unit records exactly
  `Received · Received with issue · Not received` (`receiving_unit_results`); posting flips the
  EXACT named Units (received → free at Goods arrived at; with-issue → the claim hold). Quantities
  are DERIVED from the outcomes; a line without minted Units keeps the lawful quantity inputs.
  Duplicate scans, foreign Units and already-received Units refuse by name. The external
  Warehouse count uses the same outcomes: `warehouse_incoming_pos()` lists the expected Units,
  the count modal records one physical result per Unit, and the submission carries the per-Unit
  outcomes plus arrival photo/video evidence.
- **Stock posts by Units only (0366 unit authority).** The receive engine flips/mints
  `ops_stock_items`; `stock_balances` is DERIVED by the rollup triggers and is never written
  directly, and the pre-0366 aggregate-reserve write is gone — reservation is the Sales Order's
  exact-Unit binding, owned by the Stock reserve door. (0426 corrects the live engine, which
  still carried both pre-0366 writes and would have refused any stock-posting receive.)
- **CO / consignment receiving runs through the SAME engine.** `purchase_orders.is_consignment`
  marks the source; received Units enter Inventory as `supplier_consignment` with the supplier
  named, and the posting creates no AP consequence — supplier ownership is preserved, never
  silently converted to Carres-owned.
- **`Goods arrived at` never overwrites `Deliver To`.** Both facts are stored and displayed;
  valid received Units enter Inventory at Goods arrived at. `Arrival evidence` supports photo
  AND video beside the `Signed DO photo`. `Extra Qty` is recorded separately and never enters
  Inventory or the pending arithmetic.
- Quantity words stay `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` ·
  `Pending Delivery Qty`; damaged/wrong/extra never reduce Pending Delivery Qty and never create
  available stock. `Goods received on` is the physical arrival date only.
- **A posted GRN has no ordinary Edit.** `Amend Receiving` (`receiving_amend`) requires a reason,
  records before/after in an append-only `amended` event, recalculates the PO counters and stock
  safely, and refuses by name when goods moved on (`threads_block_amend` · `units_block_amend`).
  Damaged/wrong corrections belong to their claims, not to Amend. `Void Receiving`
  (`receiving_void`) is only for a GRN that should never have existed: full exact reversal when
  safe, a named blocker otherwise (`claims_block_void` · `threads_block_void` ·
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
  check-in; `Deliver To` is never overwritten. No Manual receipt lane exists; no approved
  Receiving scope is deferred to a later card.

### 9.5 Supplier Claims — approved complete Blueprint

**Release scope — 2026-09-07:** the current delivery is the governed factual Register,
full-width read-only SC object and paginated source/catalog/Unit reads. It does not
release the local Case intake/linking/Receiving SQL proposal. Case write controls
remain unavailable until that database dependency is governed and verified. Local
implementation evidence below is not production proof. Owner authorizes testing,
merge, deployment and authenticated production verification for this delivery.

**OWNER-APPROVED / LOCKED — 2026-09-06.** This is the single complete Supplier Claims
operating model. It replaces the former small blueprint and proposal. Existing built facts and
unbuilt target rules are distinguished below. This PLAN creates no Card or application change.

**ONE CASE FOR CUSTOMER AND UNSOLD-STOCK SUPPLIER PROBLEMS — OWNER-APPROVED / LOCKED,
2026-09-06.** A supplier defect on unsold warehouse or showroom goods uses the same Service Case
parent and shared intake as a customer-affecting problem. No customer, Sales Order or customer
confirmation is required when no customer is affected. Purchasing owns the supplier workstream;
the Service Case Approver governs the product remedy. The Case closes from all required product
and supplier outcomes. If customer impact appears later, link the customer/Sales Order to the
same Case and apply the customer-outcome requirements; never copy the problem or its evidence.
Pure SOP, staff and system failures stay in Issue Tracker, with links when relevant. **APPROVED TARGET / NOT BUILT.**

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
duplicating the Case, physical stock, customer promise or money record.

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
| RESOLVED FROM AUTHORITY | One intake; Case parent; supplier claim has no independent create. ERP Architecture §3.8–3.9 and §6④; Service §1.1 | Keep one report and linked workstreams; no duplicate customer complaint |
| RESOLVED FROM AUTHORITY | Purchasing owns supplier ask/answer and execution documents; Service governs customer/product outcome. This MASTER §1, §7.4, §9.5–9.7; Service §1.1 | Separate decision and execution writers |
| RESOLVED FROM AUTHORITY | Four layers stay independent, including apparently inconsistent recorded answers. §9.5, owner ruling 2026-09-01 | Do not restrict what staff may truthfully record to fit a pair of dropdown values |
| RESOLVED FROM AUTHORITY | Repair keeps Unit ID; replacement gets a new one; receipt/handover proves physical change. §6.2; Stock §3, §5 and §12.8 | Claim closure and document issue cannot move goods |
| RESOLVED FROM AUTHORITY | Customer Payment is Money In; exceptional customer refunds require the Case/Management/Finance route. Payment §1, §13 | Supplier credit and supplier cash must never enter customer Payments |
| RESOLVED FROM AUTHORITY | Each action uses the current shared Duty resolver. ERP Architecture Law F.1; Workspace §3–5; this MASTER §10 | Earlier opening-month claim-duty rules are stale; keep historical holder evidence, route current work to current PO Duty/cover |
| RESOLVED FROM AUTHORITY | Register has facts only; no Work column or owner avatar. UI MASTER §5, 2026-09-04 | Remove stale local work presentation; preserve shared actions |
| BUILT / VERIFIED — bounded | Production read above confirms separate layers and legacy register. `packages/shared/src/supplier-claim.ts` defines their vocabulary | Keep useful facts; live layout is evidence only |
| BUILT — source measured, not end-to-end verified | `supabase/migrations/0426_a_posted_receiving_wears_its_grn_number.sql:580,606,1028` creates damage/wrong-item claims and links the receipt; `0299_problem_stock_is_quarantined.sql:121` links controlled Units through the claim | Receiving-to-claim and Unit protection exist; not a new engine invented from nothing |
| BUILT — source measured | `0288_supplier_claims.sql:70` has required PO, nullable PO line, supplier/SKU snapshot, quantity, photo array and open/closed status; `0302_warehouse_files_its_own_receiving.sql:228` adds receipt link | Source integrity and exact affected-Unit scope need convergence |
| BUILT — source measured | `apps/api/src/routes/operation/supplier-claims.ts:133,411,431,451,485,532,576` exposes list/photos, request, response, close, stock outcome, customer resolution and execution | No Case intake/link, split, reopen, formal claim-version/send or Finance completion door was found in this router |
| APPROVED TARGET / NOT BUILT | Case workstream creation remains named in Service §6; current Claim row/router has no Case link. `supplier_claim_close` in `0291_supplier_claim_lifecycle.sql:389` checks ask + answer, not completion of promised goods/money | Connect the approved Case model; strengthen closure to the approved full outcome boundary |
| APPROVED TARGET / NOT BUILT | Source-linked PRTN/RO and shared Claim Work projection: §9.6–9.7 and Workspace §6, §10 | Reuse owning documents and shared Work contract |
| RESOLVED — owner approved 2026-09-06 | The former consequence gap is settled by the scoped outcome contract below | Preserve independent facts; only approved future legs create owning-module work |
| RESOLVED — owner ruling 2026-09-06 | §9.5 admits unsold-stock supplier defects to the same Case; Architecture §3.9 and Service §1.1 carry the boundary | No required customer or customer confirmation; same Case gains customer links if impact appears later |
| RESOLVED — owner approved 2026-09-06 | Formal Claim requires verified purchase provenance; Case accepts missing-source intake | Keep the problem/evidence and source-search work; do not fabricate a PO or formal supplier claim |
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
| Parent problem with execution documents (M2) | Approved Service parent is not connected to current Claim writer | BUILD approved connection | Report where found → shared Case → Purchasing workstream; one evidence set |
| Partial replacement/return (M1/M3) | Current Claim has one quantity/answer | ADAPT line/Unit allocations | Supplier may agree different results for different Units; details show each remainder |
| Replacement before/after collection (M2) | Four-layer model is built | KEEP independence; IMPROVE executable scope | Case approves result and order of movement; separate old/new Unit legs in Delivery/Stock |
| Repair and reinspection (M2 + Stock §12.8) | RO target; no live destination | BUILD owning path | Claim → RO → Outbound → same Unit back through Receiving → inspection |
| Credit separate from receipt/cash (M4) | Finance boundary exists; Claim has no money completion | ADAPT without AP clone | Supplier evidence on Case/Claim, Finance match/acceptance linked read-only |
| Document versions and source links (prior 2990 study §3.1; existing PO) | PO has version and sent evidence; Claim request does not | ADAPT existing Carres document contract | Claim pack review/preview; exact version/recipient/channel/time proof |
| Search/filter/export (prior 2990 study; UI §6.7) | Legacy Claim table/row editor exists | KEEP search/filter power; RELOCATE editors | Fact register → read-only inspector → full object; shared toolbar and export |
| Quality/reason facts (M2) | Shared Service issue words; Stock controls suitability | KEEP one dictionary; REJECT second quality module | Reason-specific evidence, inspection at physical location, approved control release |
| External return reference (M2) | Supplier answer note only | ADAPT optional fact | Supplier's claim/return reference on answer and pack; never required before reporting |
| Maintenance and supplier performance (M3; this MASTER §11–12) | Central Settings/Reports already governed | KEEP homes; IMPROVE evidence coverage | Rules/calendars/contacts in central Settings; outcome and age reports with drill-down |

**INFERENCE — capability fit:** existing receipt, Unit, formal-document and Work primitives cover
parts of the need. This is not a finding that the complete Claim journey is ready today. Proven
local primitives can be reused; external patterns require adaptation. No uninspected 2990 code
is labelled COPY REQUIRED. Remaining Case linkage and outcome coordination are Carres integration
gaps, not evidence that another generic workflow engine is needed.

#### Purpose, parent and intake

**APPROVED:** Supplier Claims answers: “What must this supplier do about these goods, and what
proves it is finished?” It is Purchasing's register of supplier workstreams. Service Cases keeps
the one problem, shared evidence and customer/product decision. Issue Tracker keeps fault, cost
reason and learning. None owns another module's transaction.

One incident has one parent Case. It can have several supplier workstreams when different
suppliers or source lines must act. One workstream has one supplier, one original PO/CO line and
one SKU identity. Separate source lines get linked workstreams; a shared supplier pack may group
them without merging their quantities, outcomes or money. Case count and Claim count are reported
separately. A supplier being investigated is not automatically a confirmed Fault Owner.

| Origin | System carries forward | Next step |
|---|---|---|
| Damaged/wrong goods accepted during Receiving | PO/CO line, GRN, Supplier DO, exact Unit results, photos, recorder and real arrival | Protect affected Units; open/link Case and supplier workstream once |
| Rejected at arrival | Actual rejected Units/quantity, reason, photo and hand-back proof | No available stock; claim only if a supplier remedy remains owed |
| Normal partial delivery or supplier date passed | Exact pending line and evidenced date | PO balance/date work; no automatic second product claim merely because time passed |
| Later warehouse/showroom fault | Unit, original source, current Where/Who has it, inspection evidence | One Report issue/Report Problem authority; unsold-stock supplier defects use the same Case under §9.5 |
| Customer/Delivery fault | Existing Case/SO/DO/Unit and customer evidence | Case routes supplier work if supplier responsibility is in scope; Logistics fault routes to Delivery |
| Extra/unordered goods | Receiving's separate extra record and actual physical holder | Preserve observation; obtain Purchasing return/acceptance decision; do not invent a matching PO line, credit or available Unit |
| Source or Unit cannot be found | Real party/item/label facts and evidence | Save the Case, create Purchasing source-search work; no guessed source, supplier or new Unit ID |

Duplicate matching checks source event, Unit, problem and existing Case. An identical retry opens
the same record. A second reporter appends evidence to that problem. A similar fault on another
Unit is related, not silently merged. Separate later failures have their own occurrence and history.
An authorised correction links the true source without erasing the original wrong reference.
Once issued, a claim's supplier/source identity cannot be repointed; wrong-source cancellation
and linked replacement preserve both histories.

**Source-gap rule:** supplier enquiries may proceed as Purchasing work on the Case
using real product/label evidence. The formal Claim waits for verified purchase provenance.
Customer help does not wait for that match. A CO line counts as governed purchase provenance for
consignment; its return is CRTN and creates no credit on unsold goods. Without verified provenance, the approved route remains Case-based source search and enquiry;
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
| Incident, observed problem, discovery time, reporter, customer impact, shared photos/video | Case/intake authority; Claim reads the same evidence |
| Claim supplier, original PO/CO line, SKU snapshot, affected scope, request and answer events | Purchasing; permanent source references and historical snapshots |
| Supplier's claim/return reference, contact, stated answer date, reply channel/proof, quantity and promise | Purchasing records what the supplier actually said; no inferred acknowledgement |
| Customer Resolution, approved remedy, reason, decision scope/version | Service Case Approver through the Case authority |
| Carres Execution decision, exact old/new Units, required legs and prerequisites | Authorised Case/Purchasing decision as applicable; owning documents execute |
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
measurement video where needed. Late/short delivery needs the source, count and promise, not a
photo of absent goods. Warehouse is never asked for a customer WhatsApp screenshot.

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

**RESOLVED:** preserve Customer Problem → Supplier Response → Carres Resolution → Carres
Execution as separate facts. Customer Resolution retains Replace / Repair / Accept As-Is /
No Replacement Required. Execution retains Return to Supplier / Collect Defective Item /
Replace First / Collect First / Exchange on Collection. A supplier offer never approves the
customer remedy, and an item outcome never cancels a customer commitment.

**APPROVED:** recording those facts remains flexible. Issuing a new instruction requires a
separate approved scope: exact Units/quantity, customer result if applicable, goods result,
supplier agreement or authorised Carres-funded exception, movement order, party, destination,
required dates, cost authority and completion evidence. Incomplete or conflicting facts create
a named decision action. They never silently create Stock, Finance or demand writes.

All four resolutions may coexist in the record with all five execution answers. No matched-pair
guard is reintroduced. The system instead checks each proposed future leg against its own approval
and actual facts. A collection already performed must always be recordable, including an
unauthorised one with an Issue. Recording it grants no permission for a future replacement.
An obsolete instruction is explicitly cancelled/replaced with its consequence reviewed.

| Approved result | Approved Carres flow and evidence | Owning door / cross-module consequence |
|---|---|---|
| Missing goods / parts or correct item | Keep the original unfulfilled supplier quantity covered once; record exact new promise; receive actual goods/parts and inspect completeness | PO/Claim instruction → Receiving → Stock. Parts attach to the original Unit unless independently identified under Catalog; no second full-item buy |
| Supplier replaces goods rejected at receipt | New physical Unit ID; linked replacement instruction fulfils the existing original pending quantity once | Purchasing owns coverage; Receiving posts a new GRN. Original damaged Unit stays controlled until its own outcome |
| Supplier replaces goods accepted earlier | Preserve original GRN/PO receipt; approved Case creates a distinct linked replacement need/instruction with new Unit ID | Existing stock coverage or authorised supplier replacement covers need once; new paid buy uses Manual Purchase purpose Service Case and normal PO authority |
| Supplier repairs the same item | RO identifies the same Unit, fault, repairer, cost agreement, out/back dates; actual handover → return receipt → inspection | Purchasing RO; Warehouse Outbound/Inbound; Receiving; failed repair reopens supplier work, never becomes Available by default |
| Supplier inspects before answering | Approved inspection scope with exact Unit and expected return date; outcome remains undecided | RO/inspection instruction as applicable; continuous holder history; no “Returned to supplier” final outcome merely for temporary inspection |
| Carres replaces first | Authorised new Unit delivery may complete while old-item collection remains open | Delivery records new acceptance and old collection independently; Case stays open for required collection; no double sale or hidden old Unit |
| Carres collects first | Collect old Unit with required condition gate; accepted return fact unlocks the approved next dispatch | Case decision → Delivery collection → Receiving/Stock → Delivery replacement; no fake receipt to unlock dispatch |
| Exchange on collection | One arranged visit carries separate incoming/outgoing Units and separate results | Delivery may report a partial result; failed old-item collection cannot be concealed by successful replacement |
| Accept As-Is | Customer acceptance when a customer is affected, plus authorised conditions; Stock separately confirms suitability for any retained stock | Case records customer result; Finance records any agreed allowance. No stock release from a Claim picker |
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
Partial receipt, collection or credit completes only that scope. Split a workstream only when
different supplier discussions/outcomes cannot be managed clearly together. Child workstreams
retain Case, source and split history; allocate disjoint Units/quantity and remaining money.
Parent is a read-only grouping, not another open debt. Existing sent documents remain attached to
their original scope. Changing supplier requires a new linked claim/commitment, never editing the
old supplier identity. Count reports exclude grouping parents and never double-count the split.

**Replacement receipt:** the authorised replacement instruction supplies a governed source to the
one Receiving engine, not a second receipt form. It lists original SC/PO/GRN, new Unit IDs, SKU,
quantity, supplier, Deliver To, promise and commercial basis. New arrival → new GRN, Supplier DO,
Goods received on, Goods arrived at, exact outcomes and inspection. A different model needs Case/
Catalog/commercial approval. A different Unit returning from repair is a replacement exception,
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
| No supplier responsibility | Authorised finding closes that supplier scope; Case/Issue continues with the right owner; no false supplier reply or “recovered” amount |

The approved lifecycle is **Open · Closed · Cancelled**. Missing reply, late collection,
repair not returned and credit evidence missing are derived facts, not new editable statuses.
Closed requires source/scope, request/contact evidence, actual reply or approved no-response
decision, required outcome evidence and no unresolved supplier obligation. No generic Done or
status dropdown closes work. The close control, if retained, confirms the computed evidence
summary and creates a sealed closing event; it cannot override a missing fact.

Customer resolution may be complete while the Supplier Claim remains open. The parent Case shows
that distinction and closes only when the customer and all required outcomes are complete under
Service authority. Supplier Claim, Case, Issue and Finance close independently; closing one never
closes another. No customer confirmation is fabricated for a stock-only problem (approved §9.5 ruling).

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
PO Duty owns supplier conversation; Service Case Approver owns customer/product remedy decisions;
Purchasing Approver owns governed supplier commercial exceptions; GRN Duty owns formal receipt;
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

For customer-affecting Cases, the Service deadline remains its existing 14 Office working days, warning four working days
before, with its governed one bounded extension. Claim/supplier dates do not move that deadline.
The shared Service rule supplies the extension limit; no second value is introduced here.
Supplier contractual claim windows, when evidenced, are stored with source terms/version and
raise earlier submission work. No undocumented supplier window or extension is assumed. Missed
windows remain visible and require a decision; they never auto-reject the customer's Case.

| Trigger / line 1 | Smaller line 2 | Duty and completion |
|---|---|---|
| The purchase source is not recorded | Check the Unit label and link its purchase record | PO Duty; verified original source linked |
| The damage photo is missing | Ask NETS Warehouse for a clear photo of the damage | Intake/Case duty; required source evidence exists |
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
No New Claim, module Work page, dashboard, second sidebar or duplicate editors. Use the current
50px destination header, governed toolbar, 240px factual rail, 36/38/32 table grammar and tokens.
These values reuse the shared authority; this Blueprint reuses existing kit components.

**APPROVED — register defaults:** Claim No. (or Not issued), Reported, Supplier, Source, Product,
Affected Qty, Problem, Supplier Response and Claim status. Product uses human description with
SKU as supporting evidence; source links Case/PO/GRN. One row is one supplier workstream, never one
row per photo or Work action. Freeze identity/supplier when horizontal scroll is needed. Wider
detail/reference fields are optional Columns: Units, Requested Result, Customer Resolution,
Carres Execution, Item Outcome, Reply expected, Collection date, Expected back, Credit expected,
Claim Version and Sent to Supplier. Only relevant date facts appear; no generic workflow field.
Unknown optional facts are not promoted to permanent empty columns; measure before final layout.

```text
Supplier Claims                                      Jump to · Alerts · Help · Settings
                                                     Search · Export · Columns
SUPPLIER               Claim No. | Reported | Supplier | Source | Product | Qty | Problem ...
  actual suppliers     one row per supplier workstream; facts and evidence only
PROBLEM
  observed types       footer: matching claims · affected Units/quantity with clear scope
CLAIM STATUS
  Open / Closed / Cancelled
SUPPLIER RESPONSE
  Not recorded / actual recorded answer
EVIDENCE
  Source not linked / Reply evidence missing / Credit evidence missing
Clear filters
```

Rail entries are factual predicates with truthful counts, not action queues. No empty invented
supplier/category rows. Typed date filtering stays with the date column. Search covers claim,
source Case/PO/GRN, Unit, supplier, supplier reference and item; no privileged customer data leaks
into supplier views. Clearing filters returns the full permitted set. Empty result, no access and
load failure are different states. A failed source is never shown as zero claims.

Read-only row expansion is a short inspector: problem/source, affected Units, reply/result facts,
evidence and Open Claim. It has no decision or Stock form. Opening the object preserves register
filters, scroll and record position. Keyboard access, visible labels and narrow-screen wrapping
reuse the kit; no meaning depends on hover alone.

```text
SC number / source problem                Supplier · Open                 previous / next · close
Problem fact
[owner avatar] one smaller specific action                        actual working date · action

The Item        original PO/CO · GRN · Supplier DO · SKU · affected Units/quantity
Problem         shared Case · observed event · photos/video · customer impact
Supplier Response   asked / actual answer / exact scope / promises / contact proof
Customer Resolution read-only Case decision + Open Case
Carres Execution    approved scope and movement order + owning document doors
Item Outcome        read-only Where / Who has it / condition / inspection / remaining result
Supplier money      requested/agreed remedy + Finance acceptance/result links
Documents           version · recipient · actual send · required print/sign proof
History             observed/recorded dates · actor/duty/cover · decision/revision/results

Reference tabs: Document · Revisions · History · Order Route
```

Main object is one full-width working scroll. Only claim-owned request/answer and supplier
instruction controls edit here. The customer decision opens the one Case door; physical outcome
opens Stock/Receiving/Outbound; Finance opens its own acceptance record. A shortcut never creates
a second editor. Current action uses 13px fact / 11px instruction as governed; History uses its
three-rank record grammar. Section actions live in their governed section header; rare
Split/Cancel/Reopen are in More with reasons and exact consequence review.

External claim pack uses 50/50 only while preparing/revising: facts/checks left, exact PDF right,
stacked below the governed width. Includes SC/version, supplier, source PO/GRN/Supplier DO,
supplier reference, item/Units, problem, approved request, relevant evidence and required reply.
Exclude internal fault review, margin, selling price and unrelated customer information. A
supplier home visit releases only the authorised visit/contact details through its governed Case
instruction. It does not turn the supplier pack into a complete customer record.

Every pack has a frozen version, output file, recipient/audience, channel, actual sent time and
actor/proof. Reprint uses the saved version. Revised facts create a new version and a concrete
“new version not sent” fact; old sends never complete the new one. Download/open/copy is history,
not send proof. Stale review refuses the send/approval and shows what changed without discarding
staff input. A repeated save returns the same result. Printed/signed return and repair papers are
listed from their owning documents; the Case Documents panel reads the same checklist.

Order Route is a graph of real linked records, not an invented single sequence:

```text
PO / CO → Receiving / GRN → original Unit → problem Case → Supplier Claim
                                                    ├→ PRTN / CRTN → actual handover
                                                    ├→ RO → same Unit out / back / check
                                                    ├→ replacement instruction / PO → new Unit / GRN
                                                    │                                  → replacement DO / proof
                                                    └→ Finance credit / cash / application
Case ↔ original SO / DO / customer collection; Issue ↔ incident and cost/recovery references
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
| One problem and supplier workstream | Shared Case intake, duplicate matching, verified source and the approved §9.5 parent rule | Receiving and Customer Care report the same Unit fault; one Case/evidence set and one supplier obligation remain |
| Claim identity and communication | Shared number/version authority, Supplier Master contact, exact sent evidence | Retrying an uncertain send keeps the same claim/version; opening WhatsApp alone completes nothing |
| Scoped outcomes | Case/Purchasing approval, original source coverage and exact Unit identity | Three damaged Units: two repaired, one replaced; every Unit and remainder stays visible without a second buy |
| Replacement fulfilment | Authorised instruction, one purchase-demand coverage, Receiving and Stock | New physical replacement gets a new Unit and new receipt; the original damaged Unit remains traceable |
| Repair/return | Owning RO/PRTN/CRTN plus physical Outbound/Inbound evidence | One of two Units collected leaves the other open; a repaired Unit is not usable until inspection passes |
| Supplier money completion | Finance-owned acceptance, external evidence and unique scoped allocation | RM80 agreed and RM50 received leaves RM30 open; credit is never displayed as received cash |
| Dated Work | Shared Duty resolver, admitted source projection and approved date policy | Buddy cover sees the same obligation; the actual actor and normal owner remain separate in History |
| Closure/correction | All required owner completion facts and append-only history | Customer served first; supplier collection still open keeps that work visible; reopen preserves the first close and original age |

A missing Finance continuation cannot be replaced with a Purchasing “paid” tick or sent to BUILD
as an unresolved business choice. The acceptance contract may use an authorised Finance record
and external evidence without inventing a full AP module. Source/duty unavailability must be shown
as a named dependency, never fabricated completion. No external-account, cutover or live data
change is included in these acceptance boundaries.

#### Current local build evidence — 2026-09-07

The independently released slice is the governed factual Register, full-width read-only
SC object and paginated source/Catalog/held-Unit reads. The shared FilterRail replaces
the retired queue/card chrome; View, Search, Export and Columns use one Register toolbar.
Hide/Show filters preserves the active predicates, filtered totals name the complete set,
and opening/returning from a Claim preserves the Register state. The object reads the
independent supplier/customer/execution/stock layers and explicitly identifies unavailable
Case writes, versioned communication, physical completion and Finance settlement.

**Delivery evidence:** [PR #1138](https://github.com/wenwei4046/Carres-Portal-v2/pull/1138)
records the release, scoped validation and authenticated production verification;
[the release workflow](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/34081474775)
records deployment of main `90a8f3ef`. The PR's complete CI passed, including 9,685 tests,
type checks, production build and bundle-secret checks. The Catalog-field negative control
fails as required; desktop and 768px fixture checks cover search, View, rail collapse,
full-width object and return. Workflow success and the authenticated checks in the PR are
the production evidence; a local fixture is never production proof.

The separate Case-linked intake/Receiving implementation remains a local, unnumbered SQL
proposal and associated API/web/shared changes. It is **NOT PRODUCTION-READY**. Code review
on 2026-09-07 found that `service_case_match_unit_problem(stock_item_id, issue_type)` matches
an open Case by Unit + problem only; it does not compare source occurrence. It can therefore
collapse a later fault into an earlier still-open Case. Permanent occurrence links alone
do not prove correct duplicate matching. Before release, match the verified incident/source
occurrence, keep later faults distinct even while an earlier Case remains open, and add that
regression case. Current isolated SQL tests do not cover this boundary. Receiving orchestration,
source-search Work, Case linking and intake remain unverified for production until that fix,
full dependency review and the governed migration/apply path are complete. No such database
change or Case write control is part of PR #1138.

#### Decision rationale and future review triggers

| Current → problem | Approved decision / trade-off | Evidence requiring a fresh owner ruling |
|---|---|---|
| Ask/answer can close the current claim → goods or money can remain unfinished | Close on supplier outcome evidence; more honest open claims and more visible follow-through | An owner-approved process explicitly defines the Claim as negotiation only and provides another proved end-to-end obligation owner |
| Single quantity/answer → partial results are ambiguous | Scoped Unit/quantity outcomes and conserved split lineage; adds detail when outcomes differ | Real claim examples prove every result always applies to the whole scope and no partial outcome is required |
| Flexible layers with no consequence rule → staff must remember documents | Keep recording flexible; require approved executable scope; one extra review only when authority is needed | An observed necessary legitimate act cannot be recorded, or an approved future act is blocked despite complete authority/evidence |
| Current row edits customer/stock answers → several modules can appear to decide one fact | Read facts and open the one owning editor; an extra navigation step buys one truth | Current-main authority explicitly gives Purchasing that record rather than summary responsibility |
| Supplier note can mean cash/credit/offset → “money recovered” may be false | Separate Finance acceptance and settlement evidence; adds explicit financial scope | Finance authority defines another single record that proves all the named outcomes without losing partial balances |
| No fixed supplier follow-through timing → reminders rely on memory | Approved configurable 2+2 reply/escalation rule; next-day intake is approved | Recorded supplier terms or measured response/claim-loss data show these intervals harm the operation |

**Owner approval — 2026-09-06:** the owner approved the remaining complete Blueprint after
separately approving the same Case for unsold-stock supplier defects and the two configurable
2-day reply settings. This approves source/identity, scoped remedies and consequences, evidence,
documents, partial quantities, Finance settlement, closure, cancellation/reopening, Work/dates,
UI, permissions, Settings, reports and the cross-module acceptance boundaries above. No business
choice remains pending in this scope. Measured implementation gaps and future UI/data checks
remain explicit; approval is not implementation or production verification.

**Intentional rejects:** duplicate Case/Claim intake, stock-only fake customer, automatic refund,
credit treated as cash, automatic blame, stock release by claim status, automatic supplier claim
for routine partial delivery, independent assignments, generic Work/Due/Priority/Next Action,
notification-driven workflow, duplicate editors, blank return/repair creation, re-entry of photos,
new Unit on repair, historical renumbering, invisible partial quantity, forced matched-pair answers,
Carres customer-site inspection, external supplier cutover, Cards and application implementation.

### 9.6 Purchase Returns

**Purpose / source:** return Carres-owned purchased goods only after approved claim/outcome. No blank
`+ New`.
**Left rail:** `PDF not sent`, `Collection date missing`, `Handover proof missing`, `Part collected`, `Collected`.
**Columns:** Return No., Supplier, Source Claim/PO/GRN, Units/Qty, Collect From, Collection Date,
Handover, Credit Consequence, Work.
**Journey:** system creates from outcome → check exact goods → send return PDF → record collection
date → scan/count at handover → upload proof.
**Object/placement:** full-width view; 50/50 while issuing/revising.
**Exceptions:** supplier refuses collection, partial collection, wrong Unit collected, credit note
missing/different.
**Connections:** Claim, Stock custody, supplier, Finance credit read-only.

### 9.7 Repair Orders

**Purpose / source:** send a specific Carres-owned Unit for approved supplier/repairer work; no blank
`+ New`.
**Left rail:** `PDF not sent`, `Handover out missing`, `Expected back date missing`, `Expected back date passed`, `Return inspection missing`, `Closed`.
**Columns:** RO No., Repairer, Source Claim/Case, Unit, Problem, Sent Out, Expected Back, Returned,
Inspection, Work.
**Journey:** create from approved repair outcome → issue → prove same Unit handed out → chase actual
date → receive/inspect same Unit → close or route failed repair.
**Object/placement:** full-width view; 50/50 while issuing/revising.
**Exceptions:** cannot repair, repairer returns a different physical Unit, date changed, damage added,
replacement offered.
**Connections:** Service Case/Claim, Stock custody/history, Goods Receipt/inspection.

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
**Columns:** CO No., Supplier, Source Request, Coming In Units, Going Back Units, Showroom, Supplier
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
**Columns:** Return No., Supplier, Source, Exact Units, Collect From, Collection Date, Handover,
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
never silently moved: PO Delivery Date, Supplier Delivery Date and Goods received on remain the
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
- `/api/operation/po-duty` is a one-release response-shape adapter only. It reads and writes the
  shared Workspace Duty resolver and must be deleted when `PurchaseOrdersPage`,
  `SalesOrderWorkspace`, `OperationOrdersControl`, the Quick Rail `TeamPanel`, and the PO-day
  reminder consume the Workspace Duty contract directly; no caller may restore a direct
  `ops_po_duty` or cover-table read behind it.
- approval limits and Manual Purchase purposes;
- default `Deliver To` (`Carres Klang`) and permitted destinations, including add, address,
  availability, default, receiving station/party, arrival calendar, linked Warehouse/no-Stock
  consequence, Unit-scan requirement and signed-DO evidence controls;
- supplier channels, contacts, `Supplier work week` and Supplier × Product Category Production Days;
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
| Purchasing Approver | approve/reject governed internal buy and commercial exceptions; the resolved holder may approve their own request where the rule permits | replace receiving/PO evidence |
| Normal PO Duty / dated cover | owns the daily work; issue/revise supplier documents; record promises/claims through the one door | approve unauthorised price; post stock or supplier payment |
| Operations Superuser (`operation@carres.com`, Jess) | use the same governed operational doors when available, including PO issuance; actual actor remains separate from normal duty/cover | impersonate duty, create a second PO/receipt writer or bypass approval/commercial gates |
| Normal GRN Duty / dated cover | owns daily Receiving work; count, inspect, attach Supplier DO/evidence and finish source receipt | change PO price/quantity or ownership agreement |
| Stock / Warehouse | label, locate, move, reserve and prove physical custody | issue/cancel supplier commitments |
| Service | intake problem and govern problem/outcome record | create unapproved Purchasing consequence |
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
- Logistics/Delivery: reads final `Deliver To` and emits actual movement/delivery facts; it does not
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
