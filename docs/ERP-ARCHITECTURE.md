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
actionable layer as **WHO + ACTION/OBJECT + RECIPIENT + REQUIRED RESULT + WHEN (actual working
weekday/date)**, using the
authoritative wording in `COPY-STANDARD.md` and calendar in `ACTION-FLOW-STANDARD.md`; it never
creates a second operational status or writes another module's completion fact. Truth is not
forced into action wording: if nobody must do anything, it remains a fact in its owning module.
The Issue Tracker does not replace SO, PO, Unit, Delivery or Payment truth. It preserves what
happened, accountability, financial consequence, recovery and the learning that survives into
meeting, training and SOP. Its approved operating model lives once in
[`issue-tracker/MASTER.md`](issue-tracker/MASTER.md).

The approved end-to-end Sales Order V2 target, its implementation state and its restart order
live once in [`orders/MASTER.md`](orders/MASTER.md), immediately after the Card 1 production
record. Architecture owns this boundary; the Orders MASTER owns the build sequence and business
flow.

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

The rule resolves automatically. Staff do not assign routine work order by order. People owns the
roster, duty and buddy/cover facts; the Work Engine applies them so absence changes who sees today's
work without changing the underlying business record or rewriting its history. A manager may see or
filter the resolved owner, but Work never creates a second assignment truth.

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
| **People** | *Who does the work, and what are they owed?* |

**Ten modules. Two of them do not exist as owners today, and that is the finding:**
**Catalog** owns a question three other files answer for themselves (D9), and **Receiving**
owns a record Orders was also writing (D2).

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
│   ├── SO Batch Purchase
│   ├── Manual Purchase
│   ├── Purchase Orders
│   ├── Receiving
│   └── Supplier Claims
├── Warehouse
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

**This is navigation, not workflow.** How the operator moves between these pages — which one
feeds which — is the module MASTER's, and it changes when the business changes.

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
> goods that are not paid for"*. Neither is a fact about a truck or a ledger.

---

## 3.3 · PURCHASING

**OWNS**
- The **purchase order** — what we asked a factory for, when we asked, what they promised.
- The supplier conversation and every promise on it (append-only; a promise is never
  overwritten).
- The engine numbers: production days, order-by buffer, PO days, supplier work week.
- **Whether a demand is still to buy** — and that is a GENERATED remainder, never a second
  stored number.

**ACTIONS**
- Issue a purchase order · call the supplier for a ready date · call about tomorrow's delivery ·
  call about a balance date · cancel an outstanding demand · set the engine numbers.

**SUMMARISES** — the customer's promised date and the customer's name (to know what is urgent
and who is waiting) · free stock (to suggest, never to consume).

**LINKS TO** — the customer order · Receiving (hand over when the van is coming) · Stock.

> **The rule V1 proved by breaking it (D1): a customer order asking *"has this been bought?"*
> must ask PURCHASING, through the purchase order.** Never through a column an importer writes.

---

## 3.4 · RECEIVING

**OWNS**
- The **Receiving Session** — ONE physical delivery, one session.
- The three times (goods received at · submitted at · posted at) and the append-only event
  ledger. **Amend and Void are its acts; history is never edited in place.**
- **`purchase_order_lines.received_qty` moves only through this module.**

**ACTIONS** — start a receiving · count the lines · record damaged and wrong · post it ·
amend it · void it · return a count for a re-check.

**SUMMARISES** — the purchase order it is receiving against · the customer orders waiting on it.

**LINKS TO** — Purchasing (the PO) · Stock (where the units landed) · Supplier Claim (what the
count opened).

> **ONE DOOR. This is the boundary D2 restored**, and it is the sharpest example of Law C in the
> whole system: a second receive form did not create a second door onto one act — **it created a
> second RECORD of it**, which no surface could reconcile.

---

## 3.5 · STOCK

**OWNS**
- The **per-unit register** — every physical unit, its condition, its warehouse, its status.
- Reserve · release · take out · quarantine, and the reasons for each.
- The reorder points and reserve levels.

**ACTIONS** — reserve a unit to an order · release it · take it out · quarantine a problem unit
and resolve it · set a reorder point.

**SUMMARISES** — the customer order a unit is reserved to · the purchase order it came from.

**LINKS TO** — the customer order · Receiving · Supplier Claim.

> **The register is the authority; a rollup is not.** Two base tables with no trigger between
> them was V1's trap: a rollup does not fall when a draw happens, so the same units get offered
> again tomorrow. **Anything deciding availability reads the REGISTER.**

---

## 3.6 · DELIVERY

**OWNS**
- The **carrier**: who they are, their working days, closed dates, capacity, notice period,
  geography and staging rules.
- The **trip DERIVATION** — the trip is **not a record; it is a derived view** (§6.2, frozen):
  confirmed bookings grouped by **carrier + delivery date**, including a split across trips.
  Delivery owns the ONE derivation rule (Law D).
- The **proof**: the delivery photo and the signed document.

**ACTIONS** — assign a carrier · arrange a trip · issue the delivery order · record the
delivery · upload the proof · maintain the carrier's rules.

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
> and the waiver. The Customer Order owns the TRIGGER and the HOLD (the clock runs from the
> PROMISE — *you did not collect*, never *your goods are here*). Stock is the WITNESS.
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

> **Duty, not email, decides permission** — V1's law, kept. **And the PIC on an order is a
> POINTER to a person, never a copy of them.**

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

# §6 · Decisions still owed — business, not engineering

**These cannot be settled by reading code, measuring the database, or applying a law already
ruled. They are the only things this document leaves open.**

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
WhatsApp manifest sent to the carrier = generated from the view. Multi-leg staging
(HOUZS → Balakong → AL collects) needs no trip either: a warehouse-to-warehouse leg is a
stock movement (Stock's record, §3.5); the final leg is the delivery (the booking).

**The upgrade clause:** the day a fact must attach to the VAN itself and to no order — a
per-trip carrier cost, an own-fleet dispatch, a signed loading manifest — the trip becomes a
first-class record THEN, owned by Delivery, and the migration is a grouping of the bookings
that already exist. Until that fact exists, a trip table is an unowned record — V1's disease.

> *Naming note: `ops_order_control.delivery_trips` (0282) is unaffected — it is the
> append-only history of bookings a later confirmation replaced, not a trip store.*

**③ Does Purchasing own the goods until they are received, or does the customer order?**
Today a demand belongs to the order and a PO belongs to Purchasing, and the seam between them
is where D1 lived. **A clean answer removes a whole class of defect.**

**④ One entrance to Supplier Claim, or two?**
Adding the Service entrance means the entry rule and the refurbish door move together — that
was already recorded as the price. **It is approved architecture and not yet a decision to
build.**

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
