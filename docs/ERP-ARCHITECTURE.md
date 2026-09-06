# CARRES ERP — THE ARCHITECTURE

> **This is the blueprint. It is not a module MASTER, not a UI design, and not a task list.**
> It answers four questions and only four: **what each module OWNS · what ACTIONS belong to it ·
> what it only SUMMARISES from somewhere else · what it LINKS to instead of owning.**
>
> **Orders V1 is no longer the reference implementation.** Measured behaviour remains valid
> until replaced by better evidence. Approved architecture decisions may replace existing
> implementations incrementally. **Implementations provide evidence; they do not define
> architecture.**
>
> **When this document and a module MASTER disagree, this document wins** — a MASTER describes
> one module, and every boundary defect the audits found lived *between* two of them.

---

# §0 · Why this document exists — the lesson in one page

Nine engineering-debt items were found by reading Orders V1 end to end and measuring
production. **Every single one is the same defect wearing different clothes:**

| | What went wrong | The real cause |
|---|---|---|
| D1 | The Orders list told an operator to buy goods Purchasing had already bought — on 4 named orders | It asked *"has this been ordered?"* by reading a column **the AutoCount importer owns**, not the module that owns purchasing |
| D2 | A receive could be written from the Orders drawer with no Receiving Session | Orders **wrote another module's record** |
| D4 | Two storage arithmetics for one order | Two owners for one number |
| D5 | A carrier's global working days edited from inside one customer's order | Orders **wrote another module's configuration** |
| D9 | The Sofa facet reads **0** while 10 of 28 live orders carry a sofa; the storage rate resolves to neither on **every** live order | *"What kind of product is this?"* has **three answers and no owner** — and the one that is right (the catalog) is never asked |
| | **D9 — two of the three answers now ask the catalog.** `56239a3c` (PR #859, 2026-08-19) moved **Stock/On hand** onto `sku → product_skus → product_models.category` through the one shared reader (`apps/api/src/lib/sku-categories.ts`). 2026-08-20 moved the **Sales Order** answer the same way: the order-detail endpoint carries `category` on both the lines and the free units, and the drawer's loan flow reads it through `resolvedCategory` instead of parsing the SKU text. That half was never cosmetic — `LoanPanel` FILTERS warehouse stock with the result, so a real sofa absent from a hardcoded keyword list could not be offered as a loaner. **🔴 THE THIRD ANSWER IS STILL ITS OWN: the storage rate.** D9 does not close until it asks too. **And the parser is not dead** — `resolvedCategory` still falls back to `lineClass` when the catalog holds no row for a SKU, because 975 live units are in that bucket (2026-08-19); the fallback is scheduled to die with the bucket, not before. | |

**None of them is a missing feature. Every one is an unowned record.**

```
THE LESSON, and it is the whole document:

    ONE RECORD, ONE OWNER.
    Everyone else READS it, LINKS to it, and may never WRITE it.
```

**The second lesson, and it is why V1 drifted:** a page that is allowed to SHOW cross-module
work will, over months, be asked to DO it — because the operator is already there. Orders
became the portal's control surface and then quietly became its write surface. **Showing is
free. Writing is ownership.**

## §0.1 · The ERP V2 separation law — owner ruling 2026-08-11

```
MODULES       = TRUTH
WORK          = ACTION
ISSUE TRACKER = ACCOUNTABILITY + MEMORY + LEARNING
```

Modules own and preserve the transactional facts. Work reads those facts and presents the
actionable layer as **structured Owner + structured Object + Fact/Problem + Action/Object + required
Recipient/Result + WHEN (actual working weekday/date)**, using the
authoritative wording in `COPY-STANDARD.md` and calendar in `ACTION-FLOW-STANDARD.md`; it never
creates a second operational status or writes another module's completion fact. Truth is not
forced into action wording: if nobody must do anything, it remains a fact in its owning module.
The Issue Tracker does not replace SO, PO, Unit, Delivery or Payment truth. It preserves what
happened, accountability, financial consequence, recovery and the learning that survives into
meeting, training and SOP. Its approved operating model lives once in
[`issue-tracker/MASTER.md`](issue-tracker/MASTER.md).

**ACTION HAS AN OWNER; A BUSINESS OBJECT DOES NOT GAIN ONE UNIVERSAL OWNER.** Every action and
approval carries an owner rule expressed as a shared duty, a resolved primary holder, optional
today's buddy cover, actual actor and evidence. Workspace owns assignment. Modules only name the
duty required. Owner identity is metadata/avatar, never repeated inside the action sentence.

The approved end-to-end Sales Order V2 target, its implementation state and its restart order
live once in [`orders/MASTER.md`](orders/MASTER.md), immediately after the Card 1 production
record. Architecture owns this boundary; the Orders MASTER owns the build sequence and business
flow.

**PURCHASING → RECEIVING → GRN → CLAIM / RETURN WORK SLICE — OWNER-APPROVED / LOCKED
2026-08-29.** Module writers remain separate; one shared Work projection composes their open
actions. Purchase Orders owns supplier commitment and evidenced response, Receiving owns the
physical session/posting/formal GRN, Stock owns accepted Unit consequences, and Supplier Claim /
Return owns the authorised continuation. `My Work` and `Team Work` read the same stable action
identities and write no completion. Module filter rails do not copy those actions into a local
`WORK TO DO` panel; SO Batch Purchase is the ruled example. The complete contract is
[`purchasing/MASTER.md` §2.3 and §7](purchasing/MASTER.md) and its approved design record.

---

# §1 · The five ownership laws

### Law A · One record, one owner
A business record has exactly ONE module that creates, changes and closes it. That module owns
its completion evidence. **No second module may write it, even in an emergency, even "just this
field".**

### Law B · A summary is READ-ONLY, forever
A module may display another module's record to make its own work possible. **That display may
never gain a form.** The test is mechanical: *if this control disappeared, would any business
record become unreachable?* If **no**, it is a summary and it must not write.

### Law C · A door, never a duplicate
When work belongs elsewhere, the surface offers a **LINK to that workspace** carrying the
record's identity — never a second form for the same act. **Two forms for one act produce two
records, and no surface can reconcile them** (D2).

### Law D · A derived fact has one arithmetic
If two surfaces must agree on a number, they call ONE function. **Not two implementations that
currently agree** — that is the arrangement under which a third, wrong one grows unnoticed.
Proven three times in V1: the money rule, the storage rule, and the category (still unfixed).

### Law E · An object decision carries every ERP consequence
A decision about one business object is never only a decision about its page. Before Plan/Design
may call the architecture complete or identify the next owner decision, it maps the object's
relevant lifecycle and checks every affected record owner. The planner owns finding those
consequences; Jess owns the business ruling and final approval.

For example, changing a Customer Order may affect an existing Purchase Order/supplier promise,
Receiving expectations, Stock/Unit reservation, Delivery/DO commitment, Payment/deposit and
commercial truth, customer-facing document versions, Work, Finance, Claims, Issue Tracker,
permissions and audit evidence. Apply the analogous test to Purchase Order, Receiving, Claim,
Payment, Delivery, Warehouse Unit and every other domain. **A consequence does not transfer
ownership:** the source module reads or links to the owner; it never gains a second writer.

`CLAUDE.md`'s **OWNER-APPROVED OBJECT / DOMAIN ARCHITECTURE COMPLETENESS LAW** governs the full
lifecycle checklist, object-level reference capability matrix, evidence/output discipline and
Plan/Design restart. This blueprint supplies the ownership map that pass must use.

### Law F · An action has an owner; a business object does not have one universal action owner

**OWNER ENGINE — OWNER-APPROVED / LOCKED 2026-08-14.** A Sales Order, Purchase Order, Delivery,
Payment or Service Case may carry a stable PIC or accountable owner, but that identity does not
own every action created from the object. Each open action resolves its own owner from the
authoritative business rule and current roster:

```
missing customer commitment       → responsible salesperson
issue PO / confirm supplier date  → current PO Duty
receive goods                     → current GRN Duty
collect customer balance          → Payment ownership rule
confirm delivery appointment      → Delivery ownership rule
```

The rule resolves automatically. Staff do not assign routine work order by order. **People** owns
employment/account eligibility facts only; **Workspace → Staff & Duties** is the ONE company-wide
Duty assignment door. Every module references a Duty key and never stores its own staff list. The
Shared Duty Resolver applies the active Primary holder and governed Buddy cover so absence changes
who sees today's work without changing the underlying business record or rewriting its history. A
manager may see or filter the resolved owner, but Work never creates a second assignment truth.

### Law F.1 · One Shared Duty Resolver

**OWNER-APPROVED / LOCKED 2026-09-01; GLOBAL DUTY MODEL OVERWRITTEN 2026-09-03.** No page, module
or API reads a rota table or calculates a Duty holder for itself. The same assignment, approval
routing and Buddy-cover mechanism applies across the ERP; each kind of work still names its own
Duty. The complete resolution chain is:

```
People — individual staff identity, active/access, last working date and leave facts
→ Workspace → Staff & Duties — Duty catalogue, one Primary holder and optional Buddy cover
→ Shared Duty Resolver — date + active staff + leave/cover rules
→ Work Engine — resolves the owner of each action from its Owner rule
→ every Register, object, Dashboard, My Work, Team Work and Quick Rail
```

An action stores its `Owner rule`, trigger, completion fact, governed date and source object. Its
audit evidence preserves three distinct identities: the normal Primary owner, today's resolved
Cover (when one acts), and the actual person who completed/approved the work. Historical evidence
never changes when a Duty holder changes later. The displayed owner/avatar is the resolver result,
not a second stored `assigned_to`. A page may not read `ops_po_duty`, `ops_po_duty_cover`, a GRN
rota or any equivalent table directly. It may not implement its own rotation arithmetic. Any action
or owner avatar that did not come from the shared Work Engine's resolved owner is an architecture
violation, not an acceptable temporary integration.

The governed Duty catalogue is business-specific, not one fake `ERP Owner`:

| ERP work | Owner Duty |
|---|---|
| Storage free approval | `Storage Waiver Approver` |
| Purchase Order approval | `Purchasing Approver` |
| Delivery charge approval | `Delivery Charge Approver` |
| Payment exception | `Payment Approver` |
| Stock adjustment | `Stock Adjustment Approver` |
| Service Case decision | `Service Case Approver` |

Each Duty has exactly one active Primary holder and may have one governed Buddy cover. When the
Primary holder is on recorded leave, the Work Engine routes today's open work to the active Cover;
it does not rewrite the normal owner. Changing staff or approval ownership happens once in
`Workspace → Staff & Duties`, and every module, My Work and Team Work resolves the change together.
No action sentence, module setting or permission check hard-codes `Jess`, `Manager` or another
person's name.

Automatic rotation may supply a recommended Primary/Cover for operational rotas such as PO Duty and
GRN Duty, but the authoritative assignment is the effective-dated record in `Staff & Duties`. A
last-working-date change removes the person and re-resolves open and future Work. Only no eligible
Primary or Cover produces `Not assigned`, with a direct door to People / Staff & Duties. Capability
remains separate: an authorised actor may perform an act without becoming its resolved owner, and
history records normal owner, cover and actual actor separately.

An action owner and an action capability are separate facts. A governed Operations Superuser may
perform the operational action without replacing the resolved owner. The event records both the
actual actor and the normal duty/dated-cover context; UI owner chips continue to show the owner, not
an invented reassignment.

Keep these identities separate: object PIC/accountability · action owner · fault owner · cost
bearer · service provider. A module may summarise another module's action and owner, but the module
that owns the trigger and completion fact owns the owner rule. `ACTION-FLOW-STANDARD.md` defines the
shared action contract; `ui/MASTER.md` defines how the resolved owner appears.

> **The ownership test used by all five laws, and the one V1 needed and did not have:**
> ```
> Does this screen CREATE, CHANGE or CLOSE the record?
>     YES → this module owns it. It owns the completion evidence too.
>     NO  → is the record needed to do this module's own work?
>              YES → a SUMMARY (read-only) or a LINK (a door)
>              NO  → it does not belong on this screen at all
> ```

---

# §2 · The modules — one line each

**A module is a body of WORK with its own records, not a screen.** A screen that owns no record
is a VIEW of a module, and it says so.

| Module | Owns the question |
|---|---|
| **Catalog** | *What is this thing we sell?* |
| **Customer Order** | *What did we promise, to whom, by when?* |
| **Purchasing** | *What are we buying, from whom, for when?* |
| **Receiving** | *What physically arrived, and in what condition?* |
| **Stock** | *What do we physically hold, and where?* |
| **Delivery** | *How do the goods reach the customer?* |
| **Money In** | *What has the customer paid, and what is still owed?* |
| **Supplier Claim** | *What does a supplier owe us for an item problem?* |
| **Service** | *What customer problem needs coordinated follow-up, and is the customer finished?* |
| **Guarantee / Service Package** | *What item-level entitlement exists, when does it run, and what has it consumed?* |
| **Rental / Subscription** | *What recurring agreement, asset, money schedule and included service does the customer hold?* |
| **People** | *Who does the work, and what are they owed?* |
| **Issue Tracker** | *What went wrong, who contributed, what did it cost, and what must Carres learn?* |

These are business authorities, not a promise of one navigation door per row. **Catalog still has
no canonical module MASTER; that is a current authority gap, not permission for another module to
invent Catalog truth.** Receiving and Supplier Claim remain responsibilities governed inside the
Purchasing MASTER until an approved re-ruling gives either a separate MASTER.

Workspace is deliberately absent from this business-record ownership table. Dashboard and Work are
cross-module projections and own no business outcome. `docs/workspace/MASTER.md` is the single
Workspace authority. Its Staff & Duties, Shared Duty Resolver, one cross-module Work boundary and
staged delivery sequence are **APPROVED / LOCKED**; Dashboard composition remains downstream of
production-verified module projections. The Purchasing/Receiving/GRN/Claim/Return projection slice
is governed by this Architecture and the Purchasing MASTER. Approval of that slice does not claim
that Dashboard or every module projection is built.

---

# §2.1 · Naming and navigation

**A page is named after the operator's primary responsibility.** Usually that is a business
object; sometimes it is an accepted ERP operation (`Receiving`); cross-cutting system pages
(`Reports`, `Settings`) are exceptions. **Never the screen form (`List`), never an action
(`To Order`), never a state.**

```
WORKSPACE
├── Dashboard
├── Work
│   ├── My Work
│   └── Team Work
└── Issue Tracker

SALES
├── Sales Orders
└── Amendments

SUPPLY CHAIN
├── Purchasing
│   ├── BUY
│   │   ├── SO Batch Purchase
│   │   ├── Manual Purchase
│   │   └── Purchase Orders
│   ├── RECEIVE
│   │   └── Receiving
│   ├── PROBLEMS
│   │   ├── Supplier Claims
│   │   ├── Purchase Returns
│   │   └── Repair Orders
│   └── SHOWROOM
│       ├── Display Requests
│       ├── Consignment Orders
│       ├── Consignment Returns
│       └── Consignment Sale Notices
├── Warehouse
│   ├── Dashboard
│   ├── Inbound
│   ├── Inventory
│   └── Outbound
└── Delivery

FINANCE
└── Payments

CUSTOMER CARE
├── Rental
├── Service Cases
└── Guarantees

MASTER DATA
├── Catalog
└── Suppliers

ADMIN
├── Reports
└── Settings
```

This is the **ERP Shell V1 destination grammar**, owner-approved 2026-08-13. A module may expose a
`Settings` shortcut, but it deep-links into the one central Settings destination; it does not create
a second settings home. `Old Orders` is a temporary cutover door and is not part of permanent IA.
The right Quick Rail is governed by `ui/MASTER.md`; it never adds duplicate module destinations or
business truth.

**Warehouse placement — owner ruling 2026-09-01.** Inventory is the one current Unit Register.
Ready Stock is a saved eligible-Unit view shared with Sales, not a destination or second pool;
Transfer projects into origin Outbound, destination Inbound and Inventory History; `Counts &
Adjustments` is one Inventory control view. The former `Stock · Ready stock · In & out · Transfers
· Counts` Warehouse subtree is superseded.

**`Receiving` is the exact Purchasing destination/workspace word** (owner correction 2026-08-29).
It names the physical operation. The supplier provides the delivery date and Supplier DO; Carres
creates the Goods Receipt and numbered GRN only after physical receiving. Neither document word
replaces the navigation word, and `Goods Receipts` is retired as navigation. The internal
letters `GRN` remain banned from navigation and staff-facing status copy.

**This is navigation, not workflow.** How the operator moves between these pages — which one
feeds which — is the module MASTER's, and it changes when the business changes.

**A MODULE'S PAGES LIVE IN THE RAIL, AND THE WHOLE MAP IS SHOWN FROM DAY ONE.** The shared
module row expands in place: one rail, not a second module sidebar or a long tab strip. Purchasing
adds one nested level because its complete map has four recognisable operator groups: BUY, RECEIVE,
PROBLEMS and SHOWROOM. Each group expands independently; the active destination's group remains
open. The exact interaction and wire-line grammar live in `docs/ui/MASTER.md` §4.2.

**Every approved page is listed before it exists.** The rail is the module's MAP, and a map
showing four of eleven roads teaches the operators a shape that is about to change under them
seven more times. An unbuilt entry prints **`Coming soon`** and **is not a control** — a
`<span>` with no href, out of the tab order, `aria-disabled`. `03-page-patterns.md:149` bans
a control that opens nothing; there is no dead arrow because there is no arrow. `:219` of the
same file requires a deliberately disabled control to say why on screen, and `Coming soon` is
that sentence (`COPY-STANDARD.md` — the ONE word for it, never `TBD`, never `Not available`).

**An entry goes live in its own page's PR by exactly two edits: drop the flag, and the span
becomes a link.** Nothing is added later and no order is renegotiated, so the rail never
reshuffles under a staff member who has learned it.

**The cost, stated:** the complete Purchasing tree can exceed a laptop rail, so only the middle
destination region scrolls. The active row is brought into view without centring or animation;
the brand/collapse area and signed-in user remain fixed.

**A DOCUMENT EARNS A DOOR WHEN A HUMAN LOOKS FOR IT BY NAME.** Carres runs three operations staff
who each do every Purchasing job, so findability may not depend on memory. `My Work` and `Team Work`
remain the one shared Work Engine; Purchasing does not duplicate them. `purchase_demand` remains the
authoritative line-level need and coverage remainder, but it has no sidebar destination or Issue
authority. `SO Batch Purchase` and approved `Manual Purchase` feed the one PO issuance authority.
Named doors improve findability without multiplying action engines or business truth.


---

# §3 · Module by module

Each module answers the four questions in the same order. **`OWNS` is the contract; everything
else is a consequence of it.**

---

## 3.1 · CATALOG

> **The module V1 does not have, and the one that caused the most measured damage.**

**OWNS**
- What a SKU **IS**: its category (mattress · bedframe · sofa · accessory · service ·
  guarantee), its model, its size, its supplier, its cost and its price.
- **The category is the CATALOG's answer and nobody else's.**

**ACTIONS** — author a SKU · set its category and supplier · price it · retire it.

**SUMMARISES** — nothing. It is a root.

**LINKS TO** — Purchasing (which factory makes this), Stock (what is on the shelf).

### THE TWO CATALOG DOORS SHOW THE SAME CATALOG — OWNER RULING 2026-08-26 (Jess)

The catalog is reachable through two destinations: **Product & Maintenance** (Admin) and
**Catalog** (Operations). They had grown into two different surfaces — selling price, margin,
import/export and `+ New SKU` on one; cost and supplier on the other — and neither could see what
the other did. Jess ruled that off:

> *"if it available [at the admin catalog] to add stuff into catalog then it should be doable from
> operations' side catalog as well — the 2 catalogues should align"*

**The split had no authority behind it.** It was never written in any governing document: it lived
in a source comment and an archived worklog, and `docs/archive/` is not read as authority (Law 1).
The architecture above says the opposite in its first line — a SKU's **cost and its price** belong
to ONE owner — and the approved Shell IA names **one** `Catalog` destination under `MASTER DATA`.

**What aligns, and what does not.** Both doors show the same columns and offer the same doors
(`+ New SKU`, Import, Export, supplier filter). What differs is who may WRITE, and that is not a
second policy invented in the UI — **the screen mirrors the API gate exactly**, so no cell offers
an edit the server would refuse:

```
price · pwpPrice · pricesBySize    principal ONLY   (0175 + enforce_sku_price_cost_principal_only)
cost                              operation OR principal (0226)
supplier · supplier code · rest   any internal user
```

**Operation SEES the selling price and cannot change it** — Jess, 2026-08-26: *"it makes sense to
let them see and not change it, cuz it avoids data pollution"*. A read-only number answers the
question that was previously asked across the room; it cannot be typed into the customer's price.

**SUPPLIER JOINS THE SELLING DOOR TOO — 2026-08-26 (YH):** *"make the admin catalog show supplier
too, show supplier code too if possible so if supplier code entered wrong can check from there as
well."* Both doors now carry the supplier and THEIR code for the item, in one cell, editable in
either place — neither is money, so neither is 0175-locked and the API leaves both ungated.

⛔ **COST did NOT come with it, and that is a ruling, not an oversight.** Loo dropped the cost
column from the selling grid on 2026-07-06 (*"not needed for now"*, `9f21582e`) and nothing has
reopened it. The alignment is therefore asymmetric ON ONE COLUMN by explicit decision.

🟡 **Bulk delete is the one gap deliberately left open.** Every other difference Jess named is
closed, but permanently destroying catalog rows was never asked for by name, and *align* is not a
yes to it. It needs its own ruling.

🟡 **Once aligned, the two doors show the same page.** That is the honest consequence, and it makes
the follow-up question concrete rather than theoretical: whether Carres wants one Catalog
destination (as the Shell IA already says) or two doors into one surface. **Supplier Items** is a
third, different thing and is NOT a catalog door — it is a read-only report answering *"what does
each supplier call the things they sell us?"*, derived from the catalog and never editing it.

> ### 🔴 THE MEASURED FAILURE THIS FIXES
> Today three functions answer *"what kind of product is this?"* — `product_models.category`
> (the catalog, correct), `lineCategory()` (a keyword regex, partly correct) and
> `storageCategoryForSku()` (prefix-only, **wrong for every live SKU**). Measured on production:
> **26 sofa lines read as accessories across 10 named orders**, the Sofa facet reads **0** while
> 10 of 28 live orders carry a sofa, and the storage rate resolves to **neither** rate on
> **every** live order — so the moment an operator turns storage on, the fee computes zero.
>
> **In V2 there is one answer and every module asks the catalog for it.** No screen and no
> shared function may re-derive a category from a SKU string.

---

## 3.2 · CUSTOMER ORDER

**OWNS**
- The **promise**: what was sold, to whom, at what price, **for what date**.
- The customer's identity for this sale, the delivery address and the building type.
- The **PIC** — who is answerable for this order.
- The order's own lifecycle: placed → being arranged → finished.

**ACTIONS**
- Take the order · change what was sold (up-sell only, through the approved change path) ·
  set or correct the promised date · assign or reassign the PIC · cancel the order.

**SUMMARISES — read-only, and each of these must be a summary rather than a form**
- whether the goods are bought (Purchasing) · where they are (Stock) · whether they arrived
  (Receiving) · the delivery booking (Delivery) · what is still owed (Money In) · whether a
  claim or a service case exists.

**LINKS TO** — every one of the above, carrying the order's identity.

> ### THE PROMISED DATE NEVER MOVES
> Kept from V1 verbatim, because every late/on-time figure in the business measures against it.
> A delay records a NEW booking; it never rewrites what was sold. **In V2 the route that
> corrects a mis-keyed date and the route that records a delay are different routes and always
> will be.**

> ### 🔴 WHAT LEAVES THE CUSTOMER ORDER IN V2
> V1's Orders module writes eleven kinds of record across five modules. **Four move out:**
> receiving a line (D2, already removed) · reserving and releasing stock · editing carrier
> configuration (D5) · recording a payment. **Each becomes a LINK.**
>
> **What STAYS, and why it is not arbitrary:** the delivery BOOKING and the money GATE stay
> with the order, because **both are promises to the customer, and the customer's promise is
> what this module owns.** A booking is *"we told them Tuesday"*; the gate is *"we do not send
> goods that are not paid for"*. Neither is a fact about a truck or a ledger. **The operational
> ARRANGEMENT — which Logistics Partner carries a scope, the confirmed operational date and
> time, ETA, note, reply proof, driver/vehicle — is Delivery's own record**
> (`ops_delivery_arrangements`, owner ruling 2026-08-24): the promise and the arrangement are
> two facts with two owners, and neither module writes the other's.

---

## 3.3 · PURCHASING

**OWNS**
- The **purchase order** — what we asked a factory for, when we asked, what they promised.
- The approved `purchase_demand` remainder, whether its source is a Sales Order or Manual Purchase.
- `Deliver To`, supplier-facing versions and proof that the current PDF was actually sent.
- The supplier conversation and every promise on it (append-only; a promise is never
  overwritten).
- The engine numbers: production days, order-by buffer, PO days, supplier work week.
- **Whether a demand is still to buy** — and that is a GENERATED remainder, never a second
  stored number.

**ACTIONS**
- Issue/revise a purchase order · ask the supplier for an actual date · ask about a dated late
  delivery or balance · govern supplier claims/returns/repairs · issue consignment orders/returns/
  sale notices · cancel an outstanding demand · set the engine numbers.

**SUMMARISES** — the customer's promised date and the customer's name (to know what is urgent
and who is waiting) · free stock (to suggest, never to consume).

**LINKS TO** — the customer order · Receiving · Stock · Delivery required-arrival dates · Service
Case outcomes · Finance/AP read-only continuation.

> **The rule V1 proved by breaking it (D1): a customer order asking *"has this been bought?"*
> must ask PURCHASING, through the purchase order.** Never through a column an importer writes.

---

## 3.4 · RECEIVING

**OWNS**
- The **Receiving Session / Goods Receipt** — ONE physical delivery, one session, from a PO or CO.
- The supplier's DO reference/evidence and Carres's numbered GRN. The supplier provides its DO;
  Carres creates the GRN only after physical receiving — one cannot substitute for the other.
- The three times (goods received at · submitted at · posted at) and the append-only event
  ledger. **Amend and Void are its acts; history is never edited in place.**
- **`purchase_order_lines.received_qty` moves only through this module.**

**ACTIONS** — start from the exact PO/CO · count Order/Received/Pending quantities · record damaged,
wrong and extra separately · attach Supplier DO/evidence · post it ·
amend it · void it · return a count for a re-check.

**SUMMARISES** — the purchase order it is receiving against · the customer orders waiting on it.

**LINKS TO** — Purchasing (the PO) · Stock (where the units landed) · Supplier Claim (what the
count opened).

**UNIT RECONCILIATION — OWNER RULING 2026-09-01.** Receiving never maintains a second stock
quantity. It starts from the exact Source Document line and records one physical result for each
expected Unit ID: `Received` · `Received with issue` · `Not received`. Posting the numbered GRN
publishes those authoritative events. Stock derives the current Unit consequences; Purchasing
reads the missing remainder. The control is derived, never re-keyed:

```
Expected Units = Received Units + Not received Units
```

A received Unit with an issue is physically present but controlled and unavailable. A Unit not
received remains expected against the same source; neither result may be converted into Ready
Stock by a manual tally.

Supplier-consignment receipt preserves supplier ownership and creates no payable. Receiving
is the one receipt engine; a separate Consignment Receipt page would duplicate the physical act.

> **ONE DOOR. This is the boundary D2 restored**, and it is the sharpest example of Law C in the
> whole system: a second receive form did not create a second door onto one act — **it created a
> second RECORD of it**, which no surface could reconcile.

---

## 3.5 · STOCK

**OWNS**
- The **per-unit register** — every physical Unit, its permanent Carres Unit ID, current
  **Where**, current **Who has it**, ownership, condition, calculated availability and
  append-only physical history.
- Site-to-Site transfer and physical-count records, Unit-level differences and evidence-backed
  corrections/adjustments.
- The Month-end Stock Confirmation: the physical cut-off, reconciliation and frozen versions.

**ACTIONS** — record physical handovers through the owning Receiving/Delivery door · transfer
Units between Sites · count and count again · inspect returned/problem Units · correct a physical
record · propose an adjustment · submit month-end physical truth.

**SUMMARISES** — the Sales Order reservation and customer promise · the PO/Consignment Order and
supplier reason · Receiving session · Delivery journey · Finance valuation.

**LINKS TO** — Sales Order for choose/reserve/release · Purchasing and Supplier Claim · Receiving ·
Delivery · Service Case · Finance.

> **The register is the authority; a rollup is not.** Two base tables with no trigger between
> them was V1's trap: a rollup does not fall when a draw happens, so the same units get offered
> again tomorrow. **Anything deciding availability reads the REGISTER.**
>
> **Reservation is the Sales Order's exact-Unit promise.** Stock validates eligibility and
> reflects the binding; it does not expose a second reservation/release editor. Problems protect
> the Unit through observed facts and governed actions, never a generic operator-facing
> quarantine status.

### 3.5.1 · CROSS-MODULE UNIT RECONCILIATION — OWNER-APPROVED / LOCKED 2026-09-01

One authoritative physical event is written once and projected wherever it is needed; modules
never copy quantities into parallel ledgers.

Receiving, Stock/Warehouse and Delivery do not tally by retyping quantities into three modules.
They reconcile through the same source-document scope, permanent Carres Unit IDs for traceable
goods, quantity lines for governed interchangeable goods, and append-only physical events.

```
Receiving proves what physically arrived
→ Stock states where each received Unit is and who has it
→ Delivery states which exact Units the customer journey requires
→ Warehouse Outbound proves which exact Units were handed over
```

The shared reconciliation equations are projections, never stored replacement totals:

```
PO/Consignment scope: expected = cumulatively received + not yet received
DO/Outbound scope:     required = handed over + not handed over
Open Delivery leg:     collected = arrived + still with the recorded journey holder
                       + explicitly returned/exception-routed
Stock Count:           Portal Units versus physically scanned Units produces Difference
```

Every result drills to exact Unit IDs where Unit identity is governed. A partial event changes only
the affected Units. A scheduled collection, expected arrival or whole-document status never moves
physical authority. The owning event does: Receiving posts arrival; Warehouse records physical
handover; Logistics records its receipt and arrival; Stock derives current `Who has it` from those
facts. If two parties record different quantities, both original facts remain and the difference
creates `Needs checking`; neither side overwrites the other to make the totals match.

The lineage is always clickable: `SO → DO → Outbound handover → Unit IDs → Logistics receipt →
customer arrival proof`, and `PO/Consignment Order → Receiving Session/GRN → Unit IDs → Inventory`.
Each module may show the shared reconciliation block read-only, but only the owning door may create
or correct its event.

---

## 3.6 · DELIVERY

**OWNS**
- The **carrier**: who they are, their working days, closed dates, capacity, notice period,
  geography, staging rules and **their own pickup/delivery weekday calendars** (owner ruling
  2026-09-01 — TEOW's and TT's KL pickup days are Partner Settings facts, never staff memory).
- The **arrangement** (`ops_delivery_arrangements`, owner ruling 2026-08-24): which Logistics
  Partner carries a scope or Journey leg, the confirmed operational date and time, ETA, note,
  the partner's actual reply proof and driver/vehicle.
- The **Delivery Order document** and its lifecycle — issued by the SYSTEM through the one
  governed path when the gate is met; no Issue/Release/Approve control exists anywhere.
- The **Journey derivation**: the trip is **not a record; it is a derived view** (§6.2, frozen):
  confirmed bookings grouped by **carrier + delivery date**, including a split across trips.
  Delivery owns the ONE derivation rule (Law D), and for multi-leg journeys the ONE backward
  calculation `customer date → latest partner-warehouse arrival → KL pickup day → latest Carres
  Warehouse ready date`, which Warehouse and Purchasing consume through dated Work.
- The **proof**: the delivery photo and the signed document.

**ACTIONS** — assign or change a carrier · record the arrangement · record the delivery
result · upload the proof · maintain the carrier's rules. (The SYSTEM issues the delivery
order; `Request Delivery Order` is the one governed manual door.)

**SUMMARISES** — the customer's promised date and confirmed booking · what the order contains ·
whether money holds it.

**LINKS TO** — the customer order.

> ### THE ONE BOUNDARY THAT CHANGES FROM V1, AND IT IS SMALL
> **The BOOKING (a promise to a customer) stays with the Customer Order. The TRIP QUESTION and
> the CARRIER move here** — and the trip itself is a derived view, never a record (§6.2).
> V1 blurred them: a customer's confirmed date and a carrier's capacity
> lived in the same drawer, which is why a global carrier rule ended up editable from one
> customer's order (D5).
>
> **Test:** *if this customer cancelled, would the fact still be true?* The booking dies with
> them; the carrier's Saturday hours do not.

---

## 3.7 · MONEY IN

**OWNS**
- The **payment record** — what came in, when, by what method, against what.
- The receipt and the invoice.
- **`orders.paid` and the payment ledger must become ONE store owned here.** V1 has two, and
  the shared money rule is forbidden to read one of them because the other double-writes it.

**ACTIONS** — record a payment · void a payment · issue a receipt · issue an invoice · chase a
customer for money.

**SUMMARISES** — what the order is worth · whether the goods are ready (**催钱前先看货** — you
do not chase payment for goods you cannot deliver).

**LINKS TO** — the customer order.

> ### THE GATE STAYS WITH THE ORDER, THE MONEY MOVES HERE
> **The arithmetic of "what is still owed" is ONE function** (Law D) and Money In owns it.
> **Whether that number stops a delivery is the Customer Order's rule**, because it is a
> decision about the promise, not about the ledger. V1 proved they are different: a manager may
> RELEASE a delivery without FORGIVING the money, and the two answers part company on exactly
> that order.

> ### STORAGE — FROZEN (§6.1, Decision ①)
> **Money In owns the FEE** — the rate table, the one arithmetic, the charge, the collection
> and the waiver. The Customer Order owns the TRIGGER and the HOLD. The clock starts only when
> Carres can complete the agreed delivery scope AND the customer delays/refuses it; the later
> authoritative witness is Storage Start. Supplier/Carres delay and goods-not-ready days never
> charge. Stock/Warehouse supplies readiness, location, condition and photo evidence.
> The rate asks the CATALOG for the category, which closes D9's storage half by ownership.

---

## 3.8 · SUPPLIER CLAIM

**OWNS**
- The **claim workstream** — opened under one Service Case when evidence indicates supplier
  responsibility, bound to its PO line, SKU and supplier forever.
- What we asked, what the supplier answered, **Carres' own resolution**, and the item's outcome.
- The claim's own money: what the supplier owes us, completed on **external evidence** (their
  credit-note or debit-note number), never a tick-box.

**ACTIONS** — ask the supplier · record their answer · decide the customer resolution · decide
the item outcome · split a claim · close it.

**SUMMARISES** — its parent Service Case · the purchase order · the receiving or downstream
event that found the problem · the customer order waiting on the goods, when applicable.

**LINKS TO** — Service Case · Receiving · Purchasing · Stock · the customer order.

> **A claim has no independent create button.** Staff report the problem where they discover it;
> the system opens or links one Service Case and, when supplier responsibility is in scope,
> creates the Supplier Claim workstream for Purchasing. `Supplier Claims` is Purchasing's work
> view of those workstreams, not a second case register and not a second intake form.

---

## 3.9 · SERVICE

**OWNS**
- The **case** — the one parent record for a customer-affecting problem that requires evidence,
  remedy, communication or follow-up, whether first found by Customer Care, Delivery, Warehouse,
  Receiving, Purchasing or Finance.
- The shared evidence, affected item/order/document links, parties, Work, decisions, deadlines,
  history and completion evidence.

**ACTIONS** — report a problem in context · route Work to the responsible teams · drive its
steps · generate required execution documents · explain a delay · close only when every
required party/outcome is complete.

**SUMMARISES** — every linked source and execution document; it does not become the accounting,
stock, purchasing or delivery authority for those transactions.

**LINKS TO** — Customer/Sales Order · Delivery Order/event · Warehouse/Stock · PO/Receiving ·
Supplier Claim · Payment/Refund · Guarantee, as applicable.

> **ONE INTAKE RULE:** normal work stays in its owning module. When something abnormal needs
> evidence, another owner, later follow-up, investigation, hold, remedy or recovery, staff press
> `Report Problem` on the record already in front of them. The system decides whether the facts
> require a Service Case, an Operational Issue, an owning-module exception, or linked records;
> staff do not choose a module or document type first.
>
> **A customer-facing case is finished when the CUSTOMER is, and all required internal or
> external outcomes are complete** — never merely when a dropdown changes.

---

## 3.10 · PEOPLE

**OWNS** — who works here, what they are owed, what they are aiming at, what the team costs, and
**which duties they hold**.

**ACTIONS** — hire · assign a duty · close a commission month · set a target · disable a login.

**SUMMARISES** — sales attributed to a person.

**LINKS TO** — the customer order (as its PIC).

> **Duty or a governed capability — never a runtime email check — decides permission.** Duty stays
> the normal owner; an Operations Superuser capability permits action without changing ownership.
> **And the PIC on an order is a POINTER to a person, never a copy of them.**

### GLOBAL DUTY AND APPROVAL ROUTING — OWNER-APPROVED 2026-09-03

Workspace owns one Staff & Duties registry for every ERP module. Each work/approval type maps to
its own duty (for example Payment Duty, Storage Waiver Approver, Purchasing Approver); there is no
universal ERP Manager owner. A duty has a primary holder and optional buddy cover. Resolution
retains normal owner, today's cover and actual actor, so absence changes today's work without
rewriting history. Reassignment is one Workspace change and never a module code change.

---

# §4 · What belongs to NO screen

These are engines. They have no page, they own no record, and every module calls them.
**A second implementation of any of these is a defect, not a variation** (Law D).

| Engine | The one question it answers |
|---|---|
| **The action engine** | *What is open on this record, which one leads, and what closes it?* |
| **The word dictionary** | *What is this act called?* — one word per act, portal-wide |
| **The money rule** | *What is still owed?* |
| **The category rule** | *What kind of product is this?* — **and in V2 it just asks the Catalog** |
| **The working-day calendar** | *When is this due?* — office week and warehouse week are different, and an action that does not name its calendar is not finished |
| **The document numbering** | *What is this paper called?* — a reprint matches the signed original |

> ### THE ACTION ENGINE IS V1'S BEST IDEA AND IT SURVIVES WHOLE
> Independent tracks · one action per track · a separate decision about which one leads ·
> a broken commitment outranking everything · **and every action carrying its own trigger,
> checklist, completion evidence, due date and owner.**
>
> **In V2 it is not the Orders module's engine. It is the ERP's**, and every module raises
> actions into it. That is the difference between *"Orders shows all the work"* and *"Orders
> does all the work"* — the drift V1 measured.

---

# §5 · The boundaries V1 got wrong, and where they land

| V1 reality | V2 |
|---|---|
| Orders writes a receive | **Receiving.** Orders links. *(Already true — D2)* |
| Orders reads "is it bought?" from an importer's column | **Purchasing**, through the purchase order. *(Already true — D1)* |
| Orders reserves and releases stock units | **Stock.** Orders links |
| Orders edits carrier configuration | **Delivery.** Orders links |
| Orders records a payment into a ledger nothing reads | **Money In**, and the two stores become one |
| Three functions answer "what category?" | **Catalog.** One answer, everyone asks |
| Storage arithmetic in two places | **One owner — and §6 asks WHICH** |
| A page that shows work grows forms | **Law B: a summary may never gain a form** |

**Nothing above is a new feature.** Every line is a record moving to the module that already
owns its meaning.

---

# §6 · Cross-module decisions and resolved rulings

This section records the authority decisions that fix cross-module seams. A row explicitly marked
resolved is not an Owner Decision and may not be reopened merely because a later build needs detail.

**① Where does STORAGE live? — FROZEN 2026-08-06. See §6.1, and it is the
reference pattern for every future cross-module ownership question.**

## §6.1 · DECISION ① — STORAGE, frozen 2026-08-06, and it is the REFERENCE PATTERN

> **One business concern, three modules, and the split is by RECORD, not by feature.**
> Verified against the V1 implementation before freezing — two of the three lines were already
> true in code, and the third was corrected by measurement rather than accepted as proposed.

```
CUSTOMER ORDER   owns the TRIGGER and the HOLD
                   the clock starts from the PROMISE — the delivery deadline plus the
                   grace week — because the customer owes for not collecting, never for
                   our goods sitting in our own supply chain. And whether an uncollected
                   fee stops the delivery is a decision about the promise.

MONEY IN         owns the FEE
                   the rate table and the arithmetic (ONE function — Law D), the charge,
                   the collection (a `storage` payment with a receipt), and the WAIVER —
                   writing off a receivable is a money decision, manager-gated.

STOCK            owns the WITNESS
                   the warehouse facts: when a unit physically arrived (`date_in`,
                   135/135 units carry it), where it sits, what condition. Stock
                   TESTIFIES; it does not own the clock and it does not price anything.
```

**Why the clock is the ORDER's and not Stock's — measured, then reasoned.** The V1
implementation reads ZERO warehouse facts (grepped across all three storage files:
`ops_stock_items` never appears), and that is not an accident: Jess's own rule anchors the
clock on *the next same weekday after the delivery deadline*. **The business meaning is "you
did not collect", not "your goods are here"** — goods arriving three weeks early are our
supply-chain timing and may never bill the customer. A supplier-late stretch already moves the
anchor rather than billing it, which is the same principle applied from the other side.

**The one V1 defect this ruling fixes when built:** the fee's RATE depends on the catalog
category, and V1 resolves it with the prefix-only `storageCategoryForSku` — **wrong for every
live SKU** (D9). Under this ruling Money In's arithmetic asks the CATALOG, closing that hole as
a side effect of correct ownership.

**The RELEASE discipline survives verbatim (C9):** a manager may lift the HOLD without
forgiving the FEE. The hold is the order's; the fee is Money In's; releasing one never touches
the other — that is the three-way split working, and it was proven in V1 before it was named
here.

### The reference pattern, for every future cross-module question

```
1  Find the RECORDS inside the feature — a "feature" that needs three owners is
   three records wearing one name.
2  Give each record to the module whose QUESTION it answers
      trigger/hold → the module that owns the promise
      money        → the module that owns money
      physical     → the module that owns the physical world
3  The test for each line:  "if the customer cancelled, is it still true?"
      dies with the customer  → the order's
      still true              → it was never the order's
4  One arithmetic, owned by ONE of them, called by the rest (Law D).
5  A module that merely KNOWS something relevant is a WITNESS — it testifies
   (read-only), it does not own the clock.
```

**② Does the delivery TRIP become a first-class record? — FROZEN 2026-08-06: NO.
See §6.2 — the trip is a DERIVED VIEW over confirmed bookings.**

## §6.2 · DECISION ② — THE DELIVERY TRIP, frozen 2026-08-06

> **The trip is NOT a first-class business record. It is a DERIVED VIEW.**
> Ruled by the §6.1 reference pattern, and verified against production before freezing.

```
TRIP  =  a VIEW over confirmed bookings, grouped by  CARRIER + DELIVERY DATE

  DELIVERY        owns the ONE derivation rule (Law D)
  CUSTOMER ORDER  keeps the BOOKING — the promise to the customer (§3.2)
  NOBODY          writes a trip. A derived view has no writer; to change it
                  you change its source, the booking, through the order's door.
```

**The business owns BOOKINGS. A trip is simply one way of VIEWING those bookings, not a
separate business entity** (Loo, 2026-08-06).

**Why a view and not a record — measured, then reasoned.** Production: 65 orders,
0 confirmed bookings, 0 rows in any trip store, 8 carriers — **all external** — and 1
registered vehicle. **The van is the carrier's, not Carres'**: driver, plate and route are
another company's morning decision, and the portal records only what it OBSERVED. A trip
table would be a record whose distinguishing fields Carres can never fill.

**Every question a trip answers, the view answers:** capacity = count of confirmed bookings
per carrier + day against `daily_capacity` (the calendar already computes exactly this) ·
piggyback-vs-paid-urgent = whether another booking already holds that carrier + day · the
WhatsApp manifest sent to the carrier = generated from the view. Multi-leg journeys need no
trip RECORD either, but the legs are **Delivery Journey legs, not stock movements** (owner
ruling 2026-09-01, overwriting the 2026-08-06 "a warehouse-to-warehouse leg is a stock
movement" half): a Singapore SO's KL → JB-partner-warehouse leg and its JB → customer leg each
carry their own Logistics Partner, DO/scope, dates, handover and exact-Unit reconciliation
(`../delivery/MASTER.md` §1.1, §8; `../stock/MASTER.md` §5). Stock still owns each Unit's
current `Where`/`Who has it` along the way; an internal reposition that serves no customer
Journey remains Stock's Transfer.

**The upgrade clause:** the day a fact must attach to the VAN itself and to no order — a
per-trip carrier cost, an own-fleet dispatch, a signed loading manifest — the trip becomes a
first-class record THEN, owned by Delivery, and the migration is a grouping of the bookings
that already exist. Until that fact exists, a trip table is an unowned record — V1's disease.

> *Naming note: `ops_order_control.delivery_trips` (0282) is unaffected — it is the
> append-only history of bookings a later confirmation replaced, not a trip store.*

**③ Purchasing / customer-order seam — RESOLVED FROM AUTHORITY 2026-08-22.**
The customer order owns the reason and promise. Purchasing owns the generated `purchase_demand`
remainder, supplier commitment and `Deliver To`; Receiving owns the physical receipt; Stock
then owns Unit custody/location. The Sales Order reads risk and connected documents but cannot mark
goods ordered or received.

**④ Supplier Claim entrance — RESOLVED FROM AUTHORITY 2026-08-22.**
There is one problem intake through Service Case or the authoritative receiving exception. The
system creates the Purchasing claim workstream when supplier responsibility is in scope.
`Supplier Claims` is the Purchasing work view, not a second intake.

**⑤ Is Orders V1 migrated, or replaced?**
This document is the blueprint either way. **Which one it is changes nothing above and
everything about sequencing** — and it is the first thing a build plan needs.

---

# §7 · What Orders V1 leaves behind

**The evidence base.** It is the only place in the business where the whole customer journey
has been built end to end, and its measured record is what everything above rests on.
**Measured behaviour is the evidence base for architectural decisions; it is not a template.**

**Kept as law, not as code:**

```
one record, one owner            three independent tracks, none hiding another
a summary never gains a form     the promised date never moves
a door, never a duplicate        the customer is the last to know
one arithmetic, many readers     a waiting state is not an action
the portal records only          an action with no measurable completion
what it OBSERVED                 is not an action
```

**Not fixed inside V1, and deliberately:** D3 · D4 · D5 · D8 · D9. **Each one is a question
about where a responsibility belongs**, and this document is where that is answered.
**Some of them will disappear because the responsibility moves.**

**A redesign changes only the responsibility being redesigned.** Unrelated responsibilities
remain unchanged until they have their own approved decision. D1 and D2 were fixed in place
because each was a production-critical defect; **the rest are architecture, and architecture is
decided here first.**
