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
| Physical count, condition, Supplier DO and GRN | Receiving — ERP Architecture §3.4; seam in §9.4 |
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
  PO door. `Needed By` carries the required date; it never bypasses quantity, Catalog, supplier,
  destination, approval, PO issuance or History.
- Every approved demand reaches the same PO issuance authority. Sales, Warehouse and the requester
  cannot mark goods as ordered.
- `purchase_demand` remains the canonical line-level need and coverage remainder, but it is not a
  staff destination and has no separate sidebar page.
- `SO Batch Purchase` and `Manual Purchase` are the two operator doors. `Purchase Orders` is the
  formal supplier commitment register.

Therefore the Manual Purchase relationship, demand truth and PO ownership are **RESOLVED FROM
AUTHORITY**. No Owner Decision remains.

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
vocabulary. A new Manual Purchase is numbered `MPR-YYYYMMDD-RRRR` through the one §6.1
allocator (0401); pre-0401 `REQ-####` identities are permanent and print exactly as stored.
An approved Display Request may route to Manual Purchase or Consignment Order; staff do not
retype it.

### 5.3 One PO issue authority

SO Batch Purchase and Manual Purchase reach ONE PO issuance authority. The normal PO Duty and dated
cover remain the work-owner metadata and the selection toolbar's normal-owner hint; they are not the
only permission. `operation@carres.com` and Jess are Operations Superusers and may use the same
governed issue/send doors. The audit stores the actual authenticated actor separately from the
normal duty holder and dated cover. Approval and commercial gates still apply; superuser authority
does not create a second PO writer or permit a requester to mark demand ordered.

**HOW IT IS ENFORCED — BUILT, migrations 0379 / 0380, PR #894.** `purchasing_po_actor()` is the ONE
resolver. It reads the month's `ops_po_duty` holder, the dated `ops_po_duty_cover` window and the
governed Operations Superuser identities, and returns owner metadata separately from the actual
authenticated actor. `purchasing_actor_may_issue()` is the gate,
and it is asked by the CREATION AUTHORITY itself — `purchasing_issue_pos_batch` — and by the evidence
door `purchasing_confirm_po_sent`. So SO Batch Purchase, Manual Purchase and a direct RPC call all
meet the same authority; a door only its caller guards is not guarded. A person who is neither an
Operations Superuser nor the resolved duty/cover is refused: audit access alone is not issuance
authority. Cover has no write policy — it is set
through a governed door, never by a browser.

### 5.4 Deliver To

The destination comes from the source PO/CO `Deliver To`. When a new buy needs a default, use the
configured Carres warehouse (currently Carres Klang); a showroom is an explicit exception, never a
Receiving guess.

- Before issue: change or split quantity freely in SO Batch Purchase / Manual Purchase.
- Numbered PDF prepared but not sent: update the same issue surface; History records it.
- Supplier already received a PDF: `Change Deliver To` creates a new version/change record and
  concrete work to send the new PDF.

The final destination is one Purchasing-owned fact read by Sales Order and receiving/logistics.

### 5.5 Supplier and SKU resolution

Staff never guess a SKU, supplier or document.

- If an approved catalog relationship exists, the system resolves it.
- If the SKU is missing, the buy stays blocked and opens an in-context Catalog request.
- If the SKU exists but has no approved supplier relationship, the buy stays blocked and opens an
  in-context supplier relationship request.
- A new supplier is added and approved in Supplier Master/Catalog governance, not inside a separate
  Purchasing sidebar page.
- When resolved, the original row continues; it is not re-entered.

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
- **THE PRICE IS DECLARED TOO.** Every line carries `expected_catalog_cost` — the price the operator
  reviewed — and `purchasing_check_line_commercials` compares it with Catalog. A mismatch is
  `supplier_price_changed` and creates ZERO purchase orders, because the batch is atomic and a
  half-priced batch is worse than a refusal. The API used to re-read Catalog and hand the value back
  as `cost_source: catalog`, so the check compared the live value against itself and always agreed.
- **AN EXCEPTION NEEDS SOMEBODY ELSE'S APPROVAL.** A hand-entered cost and a Free of Charge each
  require an open, unexpired `po_cost_approvals` record. `purchasing_approve_po_cost` admits only
  `principal` or `finance`, and refuses a manager who is also today's PO actor: one person cannot be
  both sides of an exception. An approval is SPENT when used.
- **EVIDENCE CARRIES WHO.** `po_sends` stores the actor, the month's duty holder and the authorised
  cover, with channel, recipient, Malaysia time and the exact version. An `external_open` is
  communication history and completes nothing; a `confirmed_sent` for an EARLIER version stays
  history and never completes the current one.

### 5.7 PO states and balances

The operator sees facts, not a vague workflow:

```text
Not sent to supplier
Issued
Supplier date missing
Supplier date changed
Partly received
Completed
Cancelled
```

Each line retains Order Qty, Received Qty and Pending Delivery Qty. Receiving records Damaged Qty,
Wrong Item Qty and Extra Qty separately; damaged, wrong and extra goods do not reduce Pending
Delivery Qty and never create available stock. A supplier date may split by quantity. A late,
missing or changed promise creates supplier-contact work; it never rewrites the original PO
Delivery Date or the customer promise.

---

## 6 · Document and Unit identity

### 6.1 Formal document numbers

```text
PREFIX-YYYYMMDD-RRRR
```

- `YYYYMMDD` is the Malaysia server issue date for an external document and creation date for an
  internal Manual Purchase/Display Request, always with a four-digit year.
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
| `MPR` | Manual Purchase |
| `PO` | Purchase Order |
| `GRN` | Goods Receipt |
| `SC` | Supplier Claim |
| `PRTN` | Purchase Return |
| `RO` | Repair Order |
| `DR` | Display Request |
| `CO` | Consignment Order |
| `CRTN` | Consignment Return |
| `CSN` | Consignment Sale Notice |

Internal records still use invisible permanent technical IDs.

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
→ supplier promise/exception is recorded
→ Receiving starts from that exact PO and the supplier DO
→ Carres records physical receipt and creates the numbered GRN
→ Stock owns only valid received Units and location
```

Partial availability creates separate Warehouse work for available quantity and Purchasing work for
missing quantity. Sales Orders only displays the risk.

### 7.2 Manual Purchase

```text
Staff selects purpose
→ enters goods, quantity, required date, Deliver To and reason
→ Catalog/supplier/price authority checks
→ governed approver approves or rejects
→ approved record creates purchase_demand
→ an authorised issuer uses the same PO path as SO Batch Purchase
→ the same Receiving engine handles physical arrival
```

### 7.3 Receiving and later defect

```text
PO/CO carries the official Deliver To and original PO Delivery Date
→ supplier provides its Supplier DO and may provide a changed Supplier Delivery Date
→ Receiving starts from that exact PO/CO; it never authors another purchase or receipt source
→ record Goods Received At as the physical receipt date
→ record Order Qty, Received Qty, Damaged Qty, Wrong Item Qty and Pending Delivery Qty
→ attach Supplier DO/evidence and exact Unit IDs where required
→ finish physical receiving; Carres creates the numbered GRN
├─ valid received goods → Stock receives custody/location
├─ damaged/wrong/extra → no available stock and no reduction of Pending Delivery Qty
└─ problem found later → Service Case → Supplier Claim workstream
```

The user-facing gate uses two lines:

> **Delivery note is missing**
> Upload it before you finish receiving.

### 7.4 Purchased showroom display

Hooka/Ohana display goods are Carres purchases, not consignment. A Display Request resolves to Manual
Purchase/PO. When the model changes, the Unit returns to Carres custody, may go to Hooka/Ohana for
repair and may later be resold. Stock ownership remains Carres unless an authorised consequence
changes it.

### 7.5 Supplier-consignment showroom display

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

### 7.6 Consignment sale notice trigger

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
Supplier date is missing
[YJ] Ask Dorsettloft for the delivery date
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

---

## 9 · Page blueprints

### 9.1 SO Batch Purchase

**Purpose / source:** system-generated uncovered SO lines only; no `+ New`.

**Left rail — APPROVED / LOCKED, owner ruling 2026-08-27 (Card 02-C).** The rail answers, for
an inexperienced operator: when should each order be placed, which product category, which
actual supplier — with every label fully readable. Five sections, in this exact order:

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

SETUP TO FIX              ← the whole section renders only when at least one affected SO exists
  Production days not set
```

- **The rail is navigation, not batch selection.** No checkboxes in the rail — rows use the
  governed `NavRow` active treatment; the only checkboxes on the page are the Register's own
  `Issue PO` selection. One filter may be selected per section; filters from different
  sections combine; clicking a selected timing row again clears it; `All products` and
  `All suppliers` clear their sections; clearing every filter restores the complete permanent
  Register, Ordered records included. `All not ordered` remains the explicit
  outstanding-only filter.
- **Counts are UNIQUE Sales Orders** — never documents, notifications, leaf lines, SKU
  quantities or PO counts. Each section's counts update against the other selected sections,
  so the printed number predicts the resulting SO rows. The fixed rows (`All not ordered`,
  the five timing rows, the three product rows, the setup row) print their live count,
  zero included. A supplier appears only while it has a matching SO under the other active
  filters — except the currently selected supplier, which stays visible with `0`.
- **Product comes from the authoritative Catalog category** — never SKU text, model name,
  description, supplier, or a browser-only mapping. A multi-category Sales Order counts once
  under every matching category and still appears once in the Register. Records outside the
  three categories remain visible under `All products` and never silently leave the
  permanent Register.
- **Supplier uses the same projection as the Register's `Supplier` column** — the resolved
  outstanding-demand supplier plus the issued PO lineage supplier
  (`soBatchOrderSupplierNames`), no second browser-only supplier calculation. Actual names
  only, alphabetical. There is no `No supplier` filter: an unexpectedly missing supplier
  fails at Catalog authority and is not a normal purchasing category.
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
  same shell, grammar, Product authority and unique-object count rule (§9.2, Card 03) —
  never `ORDER TIMING`, Safety-days arithmetic or the SO-specific `All not ordered` meaning.
- **The rail may hide completely.** Its top-right `Hide filters` control uses the same governed
  panel-left icon grammar as the Portal sidebar. While hidden it does not become a 60px icon rail;
  the Register takes the width and its toolbar exposes `Show filters`. The choice is remembered for
  that staff browser. This is one local-filter control, not another module-navigation control.
- **PO Duty appears once in the Register toolbar, never in the filter rail and never repeated on
  every order.** The avatar/name comes from the live resolved Operation roster: dated cover first,
  otherwise the monthly holder. Selection actions use the same resolved person.
- Fully covered / `Buy = 0` DEMAND leaves the buying selection — it is not offered a tick, and
  the leaf listing drops it — but the SALES ORDER'S ROW never leaves (Card 02-B). If a PO is
  cancelled and the quantity is still required, the selectable demand returns automatically by
  recomputation; nothing is stored.
- A line whose customer date, SKU or supplier is unexpectedly missing fails safely at its owning
  boundary (Sales / Catalog). It is named on its own row; it never becomes a permanent Purchasing
  rail facet and is never silently defaulted.
- Every category derives from the one server planning engine. There is no second stored status.
- Retired rail words, never to return on this surface: `Ready to buy` · `Covered` ·
  `No customer date` · `No SKU` · `No supplier` · `No production days` · `BUYING RECORDS` ·
  `WORK TO DO` · `All lines` · `No buying needed` · `Cannot buy` — alongside the standing bans
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

**Left rail — APPROVED / LOCKED, owner ruling 2026-08-28 (Card 03); BUILT, PR #973,
production-verified on `4c8aa6d5` 2026-08-28.** The vocabulary's applied door authority is
migration 0399 (2026-08-28), widened by 0401 (Card 04) with `other_purchase`; the sixth
rail row arrives through the one shared `DEMAND_PURPOSES` list, so the rail and the doors
cannot drift. The shared 240px
`FilterRail` shell Card 02-C built — same group-heading typography and spacing, same blue
`NavRow` active treatment, no checkboxes, labels wrap and never truncate, counts visible and
right-aligned, rail scrolls vertically, Register scrolls horizontally when narrow and the
rail is never squeezed below 240px. Four sections, in this exact order:

```text
TO ORDER
  All not ordered
  Need approval
  Ready to order

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
```

- The default no-filter Register is the permanent Manual Purchase listing, ordered history
  included. Counts are UNIQUE Manual Purchase requests, cross-computed against the other
  selected sections. One filter per section; sections combine with AND; each `All …` row
  clears only its own section; a second click on the active row clears it.
- The three `TO ORDER` rows are DERIVED request truth, never a stored status:
  `All not ordered` = live quantity not yet fully issued to a PO (fully ordered requests
  leave it but stay searchable in the Register); `Need approval` = submitted, awaiting the
  configured approver's decision; `Ready to order` = approved remainder available for PO
  Duty to issue.
- Product is the authoritative Catalog category — never SKU text or a browser-only mapping.
  Supplier is the demand line's Catalog-derived supplier (plus identical PO lineage) —
  derived, never selected by Operation; actual names only, alphabetical; the selected
  supplier stays visible with `0`.
- **Banned rail rows, never to return:** `Supplier not selected` · `No supplier` ·
  `Not in catalog` · `Need price` · `Ordered` · `Part received` · `Received` · `Arrived` ·
  `Cancelled` · `My drafts` · `Need correction` · `Queues` · `ORDER TIMING` · safety-days
  rows. A missing SKU or supplier is named inside the affected request and handled through
  its owning Catalog boundary; it never becomes a permanent rail facet. Price is not a rail
  state or filter.
- The rail says `Need approval`; the Register/object shows the real action owner's name —
  the governed sentence `{name} approves` beside `Waiting for approval`, naming the resolved
  `ops_manager` duty holder(s); a robot or shared-password login never prints while a named
  person holds the duty; nothing resolved prints nothing.
  The approver is the configured Purchasing Settings manager gate — Jess today, changeable
  without redesigning this rail; Jess may approve a purchase for herself. Operation
  prepares and submits; it does not approve and does not control price. Approved requests
  continue into the one governed PO Duty issuance door; Manual Purchase and SO Batch
  Purchase remain separate doors.
- **The decision renders only for who the SQL door would pass (fixed 2026-08-29).**
  `purchasing_decide_request`'s gate (`purchasing_settings_gate`, 0360) is the `principal`
  role or the real `ops_manager` position duty — no legacy-email pass — and `canApprove`
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
newest `Requested Date` (`created_at`) first.

**Columns, exactly and in this order:** Requested Date · Approval Status · Manual Purchase
No · PO No · Needed By · For · Items · Qty · Supplier · Deliver To · Requested By.

- `Requested Date` is the actual `created_at` — never Needed By, approval or PO date.
- `Approval Status` is the approval FACT (`Need approval` · `Approved` · `Refused` ·
  `No approval needed`); while approval is needed a quiet second line names the real
  configured approver — `{name} approves` (Card 03 §3's arithmetic).
- `Manual Purchase No` is the identity and link, sticky during horizontal scrolling. New
  requests mint `MPR-YYYYMMDD-RRRR` (§6.1 allocator, 0401); historical numbers print
  exactly as stored.
- `PO No` reads ONLY the lines' real lineage (`purchase_order_lines.demand_id`, the
  demand's own `po_id` as pre-0361 fallback) resolved to actual `purchase_orders.po_no`:
  `Not ordered yet` · the one clickable number · `{n} POs`. Never a UUID, never a
  SKU/supplier/date inference.
- `For` is the structured object the purchase serves (§5.2): destination context for
  `Ready Stock` / `Showroom Display`, the linked Service Case, the real staff member, the
  actual subsidiary, or `Other Purchase`'s required answer. A historical row without the
  structured fact prints nothing.
- `Items` speaks Catalog human words through the ONE item-label arithmetic
  (`railItemLabel`): one item's name, or `{first item} + {n} more`; the SKU stays
  searchable and shows in the expansion. `Qty` is the total originally requested
  quantity, never the remainder. `Supplier` is Card 03's Catalog-derived projection —
  one actual name or `{n} suppliers`, never `Supplier not selected`. `Deliver To` prints
  the governed destination, `Multiple` when several. `Requested By` is the real staff
  name — never a shared account, role, email or `(you)`.
- **Purpose is NOT a parent column** — it lives in the rail, the expansion context and
  the object. Banned parent columns, never to return: `Purchase Purpose` · `ORDER
  TIMING` · `Order late` · `Need price` · `Part received` · `Received` · `Arrived` ·
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
groups by (supplier × category × destination × purpose, merged across requests). Work
ownership and reminders stay in central `Work`; issuance authority remains the one
`purchasing_issue_pos_batch` door.

**Journey:** `+ Manual Purchase` → choose plain-language purpose → name the purpose's
structured For object → enter goods/quantity/date/destination → system resolves
Catalog/supplier/approval → approved demand goes to PO Duty.
**Object/placement:** internal full-width object; no supplier PDF. New supplier/SKU request is an
in-context blocker, not a page.
**Exceptions:** duplicate stock, missing quantity/date/destination, unapproved price,
missing governed Catalog/supplier relationship, refused/withdrawn request.
**Connections:** Catalog, Stock planning, Display Request, Purchase Demand, PO, Service Case.

### 9.3 Purchase Orders

**Purpose / source:** every numbered supplier purchase commitment and version. No blank independent
PO; source is approved demand.
**Left rail:** `PDF not sent`, `Supplier date missing`, `Supplier date passed`, `Version changed — supplier update required`, `Partly received`, `Completed`.
**Date facts:** `PO Issued` sits beside `PO No` and means when Carres issued the current supplier
commitment. `PO Delivery Date` is the original official supplier-facing date on the PO. A separate
`Supplier Delivery Date` Register column appears only when the supplier has changed that date;
unchanged rows read `Same as PO`. `Goods Received At` belongs to Receiving and never substitutes for
any of these dates.
**Columns:** PO No., PO Issued, Supplier, Source, Deliver To, PO Delivery Date, Supplier Delivery
Date when changed, Ordered, Received, Pending Delivery Qty, Current Version, Supplier Has.
**Journey:** open prepared issue → validate authority/price/Units/destination → send PDF → record
outbound fact → record supplier date or exception → monitor receipt balance.
**Object/placement:** full-width view; 50/50 check/preview for issue/change; Document, Revisions,
History, Order Route.
**Exceptions:** supplier fabric/model unavailable, delayed/split promise, quantity change,
overdelivery, price change, cancellation and post-send destination change.
**Connections:** demand, supplier, GRN, Stock, claims, Finance read-only.

### 9.4 Receiving / GRN seam — OWNER CORRECTION 2026-08-29

This section supersedes the stale `Goods Receipts` rail, status legend, `Source`, `Arrival Date`,
`Expected`, `Accepted`, `Rejected` and Receiving `Work` column proposal that formerly lived here.
The separate Receiving owner review owns its final page presentation; Purchasing binds these shared
facts only:

- Navigation/workspace is `Receiving`. The supplier gives the Supplier DO; Carres creates the Goods
  Receipt and numbered GRN only after physical receiving.
- One Receiving engine handles PO and CO arrivals. SO Batch Purchase and Manual Purchase both pass
  through the one PO authority and this same Receiving engine; no Manual receipt lane exists.
- Source `Deliver To` is authoritative. The normal default is the configured Carres warehouse; a
  showroom is an explicit source exception.
- `Goods Received At` is the physical receipt date only. It never means keyed, submitted or posted
  time and never replaces PO Issued, PO Delivery Date or Supplier Delivery Date.
- Quantity words are `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` ·
  `Pending Delivery Qty`. Extra quantity is recorded separately. Damaged/wrong/extra never reduce
  Pending Delivery Qty and never create available stock.
- Supplier DO, channel/evidence, recorder and event times remain auditable. Finishing receiving
  creates the GRN once and moves only valid received goods into Stock custody.
- Receiving-owned work deep-links the exact PO/Receiving Session. A Purchasing supplier chase
  deep-links the exact PO. Merely opening WhatsApp/email completes nothing.

No migration or Receiving implementation is authorised by this 2026-08-29 seam record.

### 9.5 Supplier Claims

**Purpose / source:** Purchasing workstream for a supplier-responsible Service Case or receiving
problem; no second problem intake.
**Left rail:** `Supplier reply missing`, `Carres decision missing`, `Item outcome missing`, `Supplier evidence missing`, `Closed`.
**Columns:** Claim No., Supplier, Source Case/GRN/PO, Unit, Problem, Requested Result, Supplier Reply,
Authorised Outcome, Work.
**Journey:** open source evidence → issue claim pack where needed → record supplier response → obtain
authorised outcome → system offers only valid downstream document.
**Object/placement:** full-width claim record; 50/50 only when producing/revising an external claim
pack.
**Exceptions:** supplier denies responsibility, no source Unit, replacement vs repair dispute,
commercial credit mismatch.
**Connections:** Service Case authority, Goods Receipt, Unit, Purchase Return, Repair Order, Finance.

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
| Approved demand ready | Normal PO Duty/cover; Operations Superuser may act | `Issue the purchase order to Hooka` | Current PDF version sent, outbound fact and actual actor exist |
| Supplier date missing | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka for the delivery date` | Actual supplier answer, channel, evidence, recorder and times exist on the exact PO |
| Required arrival at risk | Normal PO Duty/cover; Operations Superuser may act | `Ask Hooka if the goods can arrive by Fri, 28 Aug` | Governed supplier answer/exception, evidence and actual actor exist on the exact PO |
| PO/CO goods arrive | Normal GRN Duty/cover; Operations Superuser may act | `Receive PO-20260820-4827 from Hooka` | Exact Receiving Session records physical outcome and numbered GRN |
| Supplier DO/evidence missing | Normal GRN Duty/cover; Operations Superuser may act | `Add the Supplier DO before you finish receiving` | Supplier DO reference/evidence and actual recorder exist on the Receiving Session |
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
never silently moved: PO Delivery Date, Supplier Delivery Date and Goods Received At remain the
dates actually stated/observed. A computed work due date may use its governed calendar only when
the rule and resulting date are visible.

---

## 11 · Settings

Settings lives under the global header gear and requires authorised roles. It includes:

- document number format/version and locked Unit ID family;
- PO Duty and GRN Duty rosters, buddy cover, Operations Superusers and working calendars;
- approval limits and Manual Purchase purposes;
- configured default warehouse `Deliver To` (currently `Carres Klang`) and permitted showroom
  exceptions;
- supplier channels, contacts, lead/production days and calendars;
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
- missing, changed and passed supplier dates;
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
| Approver / Manager | approve/reject governed internal buy and commercial exceptions; the configured approver may approve their own request | replace receiving/PO evidence |
| Normal PO Duty / dated cover | owns the daily work; issue/revise supplier documents; record promises/claims through the one door | approve unauthorised price; post stock or supplier payment |
| Operations Superuser (`operation@carres.com`, Jess) | use the same governed PO and Receiving doors when needed; actual actor remains separate from normal duty/cover | create a second PO/receipt writer or bypass approval/commercial gates |
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
