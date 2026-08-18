# ORDERS — MASTER

> ## ORDERS V1 — historical implementation evidence
>
> **Orders V1 is historical implementation evidence. It is not the architectural template.**
> It is the only place in the business where the whole customer journey was built end to end,
> and its measured record is the evidence base for
> [`../ERP-ARCHITECTURE.md`](../ERP-ARCHITECTURE.md).
>
> **Each responsibility evolves independently. A redesign changes only the responsibility being
> redesigned.** D1 and D2 were fixed in place as production-critical defects;
> **D3 · D4 · D5 · D8 · D9 were not.**
>
> **Every one of those five is a question about where a responsibility belongs, not a bug**, and
> the architecture is where that is answered. **Some of them will disappear because the
> responsibility moves to another module.** §12 keeps them for that decision, not for a fix.
>
> **The only Orders document.** Overwritten when something is re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.** Open `COPY-STANDARD.md` for a word,
> `ACTION-FLOW-STANDARD.md` for the engine law, `01/02/03-*.md` for a token, `ENGINEERING.md`
> for mechanics. **Do not read them to start work.**

| I am working on | Read |
|---|---|
| anything | **§1 · §2 — short, and they bind everything** |
| the Orders list | **§3** |
| the order drawer | **§4** |
| goods on an order | **§5** |
| a delay | **§6** |
| delivery on an order | **§7** *(the Delivery PAGE is [`../delivery/MASTER.md`](../delivery/MASTER.md))* |
| money on an order | **§8** *(the collections desk is [`../payment/MASTER.md`](../payment/MASTER.md))* |
| documents and evidence | **§9** |
| something decided and not built | **§11 Approved Evolution** |

---

# §0 · THE CHARTER — FROZEN 2026-08-08 (Loo). Phase 1 of the Golden Template.

> **Sales Order is the truth/register home of the customer order: find any order and compare
> what was ordered, for whom and for when — while work and execution stay with their owning
> modules.**

**Sales Order is the truth/register surface, not a work queue.** Its job is to let an authorised
operator find any order and compare stable facts about what the customer ordered. Work belongs
on the owning module's work surface; this register does not invent an overall status, current
stage or `Current` pointer for the Sales Order.

**DATE SCOPE:** `All` means every non-cancelled order, never a month window. Narrowing controls
are filters over the register, never a second work mode.

## §0.1 · APPROVED REGISTER DEFAULT — owner ruling 2026-08-11

```
Select · Expand · Ordered · Customer Delivery · SO No · Customer ·
Matt · Bed · Sofa · Acc · Total
```

- The selection checkbox is permanent, with select-all in the header. It is part of the Sales
  Order register baseline, not an optional mode.
- `Matt` · `Bed` · `Sofa` · `Acc` are permanent factual quantity columns because Logistics must
  see the physical load without opening each order. They sum ordered quantity, not line count;
  zero renders as `—`.
- `Total` is the total PHYSICAL quantity Logistics must handle. Delivery fees, Service,
  Guarantee and other non-physical lines do not count. An uncategorised physical line counts in
  `Total` but may never be silently classified as `Acc`.
- Item description · SKU · category · per-line quantity belong in row expansion. There is no
  permanent `Items` summary column.
- The disclosure control expands read-only order detail in place. Editing never turns the
  expanded register row into a form: View and Edit open the Sales Order's separate full-page
  workspace, and PDF opens the actual generated Sales Order document.
- Existing useful Register capabilities default to **KEEP** unless Jess separately rules one out;
  redesigning the columns does not silently remove selection, expansion, View, Edit or PDF.
- Every default column has a governed, predetermined template width (or an explicitly governed
  range) that keeps this approved default set clean and readable. `Customer` may have a governed
  width or range but does not simply absorb all remaining width.
- Staff do not drag-resize columns to make the default register usable, and default columns are not
  squeezed narrower merely to avoid overflow. Horizontal scrolling is not the normal default-layout
  solution; it becomes intentional when optional/additional columns make the table exceed the
  available width.
- `Columns` decides which optional factual columns to display, not staff-designed layout widths;
  reload restores the shared default layout.
- **APPROVED / LOCKED CUSTOMER DELIVERY ACTION PRESENTATION — owner ruling 2026-08-14.**
  A Sales Order has no universal action owner and the Register gains no permanent `Owner` column.
  When `Customer Delivery` is empty, that cell may render:
  ```text
  ⚠ No delivery date
  [SH] Ask customer for a delivery date
  ```
  The first line is the fact. `[SH]` is a structured avatar chip for the action's resolved
  `Responsible Salesperson` owner rule; hover/focus exposes `Shasha`, and the avatar is never part
  of the action sentence. The existing `SO No` and `Customer` columns are not repeated. Do not add
  `Save the agreed date` unless the Register actually owns that write door. If the Register remains
  reference-only, it may show only `⚠ No delivery date`; the full action stays in Sales Order
  detail / Work Engine. Register, My Work and Team Work read the same structured action contract
  and change only presentation density.
- **There is no standalone Register scope dropdown** such as `Not delivered` / `All orders`.
  The Sales Order truth/register opens on every non-cancelled order and every narrowing happens
  through the shared global Search or the matching column's filter. A second scope control would
  duplicate those filter doors and silently turn the Register into a work queue.
- **The approved default columns fit cleanly without horizontal scrolling.** The Register does
  not open in 2990's always-overflow state. Horizontal scrolling begins only after the operator
  uses `Columns` to add enough optional columns to exceed the available width. From that point the
  listing may continue horizontally for every added governed column; default columns never shrink
  to absorb the additions and there is no arbitrary optional-column limit.
- **The Sales Order row right-click menu copies 2990's menu capability and grouping:** `Edit` ·
  `View` · `Preview` · `Print` · divider · `Issue delivery order` ·
  `Copy to new Sales Order` · divider · `Cancel SO`. Each item acts on that one Sales Order.
  Permission- or state-ineligible items do not render. `Issue delivery order` is a door into the
  owning governed workflow and its existing goods, money, date and slot gates; the Register does
  not gain a second writer. `Cancel SO` uses the Customer Order's governed cancellation path and
  never means hard delete.

### WHAT SALES ORDER OWNS
```
✓ the customer order's identity          ✓ the customer
✓ WHAT WAS ORDERED (order_lines)         ✓ the customer's promise / required date
✓ PIC / ownership                        ✓ the order's history
✓ overall risk / issue VISIBILITY        ✓ the cross-module journey SUMMARY
```

### WHAT IT DOES NOT OWN — it may only READ · SUMMARISE · LINK
```
✗ issuing or managing a purchase order    ✗ receiving goods / GRN
✗ supplier claim settlement               ✗ delivery planning execution
✗ payment collection accounting           ✗ service-case execution
```

> ### ⚠️ AND THE NEXT ACTION IS A SUMMARY, NOT A POSSESSION (corrected on the draft, 2026-08-08)
> The draft listed *"overall operational next action"* under OWNS. **It is not Orders'.**
> `Issue PO` is Purchasing's act, `Call {logistics} — confirm delivery date` is Delivery's,
> `Collect RM {amount}` is Payment's — and §1 already rules *"the same action is never defined
> in two files"*, with `packages/shared/order-actions.ts` SHARED and the Delivery page rendering
> the same computation. **Orders owns WHICH ACTION LEADS on the row. It does not own the
> action.** Left under OWNS, this is the first door through which action logic walks back into
> Orders — the exact failure this Charter exists to close.
>
> **Same distinction on the items:** Orders owns *what the customer ORDERED*. It does not own
> their STATE — stock is Stock's, received is Receiving's, bought is Purchasing's.

**THE BOUNDARY, drawn once:**
```
Customer Order → SALES ORDER (operational home)
                   ├── Purchasing  "what is happening?"
                   ├── Receiving   "what was received?"
                   ├── Delivery    "what is booked?"
                   ├── Payment     "what is still owed?"
                   └── Service     "what issue is open?"
Sales Order is the CUSTOMER-ORDER VIEW of the truth. Each module keeps its own truth.
```
This is `../ERP-ARCHITECTURE.md` Law B applied — *a summary is READ-ONLY, forever; it may
never gain a form.*

### ⭐ AND THE RULING THAT GOVERNS THE WHOLE REBUILD
```
The old OperationOrdersControl's business logic is EVIDENCE, not a UI SPECIFICATION.

    keep what it KNOWS   ≠   keep how it DRAWS
```
**Every element of the old page — `Journey · Health · Calls · Current Issues · Tabs · Queue ·
Calendar · Team` — is re-asked: does Sales Order need this fact, and if so where does it live?
Nothing survives merely because it is already there.**

---

# ⛔ START HERE — CURRENT SALES ORDER BUILD STATE

**Current authority path:** `CLAUDE.md` → this MASTER → `docs/ui/MASTER.md` when UI detail is
needed. There is no build queue, handover, checkpoint, cutover spec, or separate Stage 3 law.

**Sales Order Plan / Design restart boundary.** A fresh planning chat does not continue from the
last local Sales Order question. It first applies the Constitution's OWNER-APPROVED OBJECT / DOMAIN
ARCHITECTURE COMPLETENESS LAW to the whole relevant Sales Order lifecycle, resumes one capability
matrix and unnumbered dependency roadmap, and traces consequences through Purchasing, Receiving,
Stock / Unit, Delivery / DO, Payment / Finance, Claims, Issue Tracker, Work, permissions, audit and
versioned customer documents. It may call a decision **NEXT** only after that pass proves why it is
next. The approved Register and amendment/revision truths below are baselines, not questions for
Jess to approve again. No planning pass licenses Sales Order/Register/UI/application implementation
or an invented Card number.

**Built and closed:** Stage 1 register/read-only workspace (`182d1cae`); Stage 2 create/edit and
append-only revision engine (`2a6a5e9e`); Stage 3 cards 3.0–3.5 through the amendment spine and
`base_contractual_hash` (`8e8224dd`). Stage 3 runs continuously between approved cards, with a
separate commit and fresh evidence for each card. Green CI is the floor: exercise each route,
database function branch, screen at 1440 and 1130, guard negative control, and migration for real.

**APPROVED / LOCKED AMENDMENT + REVISION RULE — owner ruling 2026-08-12.** Follow 2990's
proven operational shape, then strengthen its audit boundary for Carres:

- Editing a Sales Order never asks the customer to sign again. There is no customer-acceptance,
  customer-signature or customer-issued amendment-document gate.
- Ordinary staff may view the complete Sales Order but may not directly change its commercial or
  execution truth. They submit a change request with a reason. A management user — including a
  Manager or COO — may edit directly or approve / reject a staff request. The exact management
  role names come from the governed role directory; the UI must not hard-code job-title guesses.
  Management authority removes the wait for a second approver; it never removes the audit duty:
  every direct management edit also requires a reason.
- This authority is the same before and after a Supplier Order. A PO does not decide who may edit;
  it decides which additional consequences must be checked. When an affected item has entered a
  Supplier Order, the current Sales Order remains unchanged while Carres coordinates the affected
  PO / Supplier consequences. Purchasing owns PO / Supplier confirmation and PO revision; Sales
  Order owns the resulting customer-order revision.
- **Revision 1 is the immutable original Sales Order.** It is never overwritten or reconstructed
  from the current row. Every approved or management-applied change creates the next immutable
  revision and keeps every earlier revision available.
- The operator can see the revision number, who requested / changed / approved it, when, the
  reason, and a field-level **Before / After** comparison. The actual PDF for each revision is
  rendered from that revision's own stored snapshot, never from today's order.
- A pending or rejected request is not a revision and does not change the Current Sales Order.
  Only an applied change advances Current to the next revision.
- **APPROVED / LOCKED APPLY GATE — owner ruling 2026-08-12.** Management approval decides that
  Carres accepts the commercial change; it does not bypass the modules that must execute its
  consequences. If no governed downstream fact is affected, approval may apply immediately. If
  Purchasing / Supplier, Receiving, Stock / Unit allocation, Delivery / DO, Payment / refund or
  another owning module is affected, approval creates the required owner work and Current remains
  unchanged. Every required owner must confirm that its consequence is executable. Only after all
  required confirmations pass does the system apply the amendment once, atomically, and create the
  next immutable Sales Order revision. A rejection, block or failed confirmation returns the
  amendment to Management; it creates no partial Sales Order revision and no half-applied customer
  order. Customer signature is never part of this gate.
- **APPROVED / LOCKED FULFILMENT CONSEQUENCE — owner ruling 2026-08-12.** Amendment eligibility
  is per affected item, never all-or-nothing merely because another line is further ahead:
  - A **Delivered item is historical fact** and can never be changed, removed or replaced through
    Sales Order Amendment. Customer change, return, exchange, refund or repair after delivery
    starts the governed Service Case / Delivery Return / Replacement / Payment Refund path. Those
    records link back to the Sales Order; they never rewrite what was sold and delivered. An
    undelivered sibling line on the same order may still take its own amendment path.
  - An **undelivered item already ordered from a Supplier** is normally not changeable: the
    operator's default answer is that the goods have already been ordered. Carres nevertheless
    keeps an explicit exception request for the rare case that must proceed. It requires a reason,
    Management approval, and Purchasing / Supplier confirmation that the consequence is executable;
    Current remains unchanged until the atomic APPLY gate passes. The exception is never a casual
    direct edit and never silently rewrites the PO.
  - A **Unit ID / stock allocation is Stock-owned execution truth.** Ordinary staff and the Sales
    Order edit / amendment surface may read it but may never choose, release, replace or rewrite it.
  - **A SALESPERSON MAY NAME A UNIT; ONLY STOCK MAY GRANT IT** (Jess, 2026-08-18). A customer
    sitting on a floor sofa is buying THAT sofa — its wear, its light-fade, the one they touched —
    and an order that records only the SKU lets a different unit ship and the customer discover it
    at the door. So the salesperson SCANS or types the Unit ID off the label: that is a customer
    fact, not an allocation. **Stock then decides**, and refuses out loud with the reason —
    `already sold` · `damaged, waiting on the supplier` · `the supplier collects it next week`.
    Naming is not choosing; the rule above is unchanged, and two salespeople can no longer claim
    one sofa.
    When an affected undelivered item already has a Unit allocation, Management approval creates a
    Stock-owner confirmation. While the request waits, the existing Unit remains reserved and a
    replacement Unit is not prematurely consumed. Final APPLY is one atomic outcome: release the
    old Unit, create the new immutable Sales Order revision, and allocate a Unit that satisfies the
    approved new specification. If Stock cannot confirm a suitable allocation, the amendment
    returns to Management and none of those three changes occurs.
  - A **Delivery Order / booking is Delivery-owned execution truth.** Customer contact corrections
    that do not affect delivery need no Delivery confirmation. A change to delivery address,
    Customer Delivery date, item, quantity, physical specification or load requires Delivery-owner
    confirmation whenever a DO or booking exists. The existing DO / booking remains current while
    the request waits; Sales Order never edits it directly. Final APPLY creates the new Sales Order
    revision and instructs Delivery to revise / reissue its own DO or booking through Delivery's
    governed path. Once the affected goods are loaded or the trip has departed, Sales Order
    Amendment is no longer available: the event is handled as a Delivery Exception, without
    rewriting the original order or delivery record.
  - **Price and payment never become Operation edit fields.** Selling price originates in the
    Sales Portal and changes only through the governed Management path. Payment / Finance owns
    receipt verification, payment truth, invoice, credit, debit and refund consequences. Operation
    sees no price by default, follows the outstanding amount, uploads the customer's receipt and is
    then done; the submission becomes visible to Finance. An amendment that changes value creates
    Finance consequence work but does not wait merely for routine verification and does not let
    Sales Order rewrite `Paid`, the ledger or an invoice. Outstanding or Finance silence never
    blocks amendment APPLY or delivery. Only an explicit Finance-owned `payment not received /
    payment exception` may hold delivery until Finance clears it.

**The implementation wall has changed:** the already-built amendment spine still reflects the
superseded customer-acceptance model. Do not build its former 3.6 ISSUE, 3.7 customer ACCEPT or
3.8 Class-A APPLY sequence. Before amendment application can be implemented, replace that model
with the approved Management-decision → affected-owner-confirmation → atomic-APPLY boundary above,
define the exact consequence/owner matrix, and provide a withdrawal / rejection path. Current code
may record a proposal but must continue to refuse APPLY until that replacement workflow is
governed and built.

**Current approved card — Sales Order production cutover, then stop:**
1. Make the new Sales Order register the official Sales Orders navigation entry.
2. Keep the old Orders page on a separate, explicitly temporary legacy route for unmigrated
   Delivery, Payment, Purchasing, AutoCount/import, and PIC work.
3. Do not delete, hide, enhance, or copy from the old page; do not start downstream migration or
   change Stage 1–3 business design.
4. On production, verify the new register, order open/edit/revision, PDF, both target widths and
   clean console; verify the legacy queues/actions/import/PIC filters still work.
5. Exercise the exact rollback on production, roll forward, post evidence, and stop.

After the cutover passes, dismantling is module-by-module and begins from each owning module's
operator journey, never by copying the old widget. The old page is frozen except for blockers and
data-defect fixes until all responsibilities and the import surface have moved; its end state is
hidden, then deleted.

---

# §1 · Overview

**One table. One row = one customer order.** Every order in the business lands here; a click
opens the drawer, which has full control.

## 1.1 · MEASURED REALITY — 2026-08-06, and this is the baseline

> **How it was measured.** `packages/shared/src/order-actions.ts` (496) · `order-money.ts` (145)
> · `order-action-due.ts` (169) · `order-action-checklist.ts` (168) · `storage-hold.ts` (124)
> **read end to end.** `OperationOrdersControl.tsx` (5,121) — **all logic read end to end**
> (lines 1–2740: stage derivation, readiness, money, the ladder mapping, every facet, every
> bulk action); the JSX render was read structurally (rail groups, column defs, cell order).
> `OrderDetailDrawer.tsx` (7,717) — **read structurally, not line by line**: its tab union, all
> 44 panel titles, its two-column shell, every hook and every endpoint it writes. Database
> figures are live SQL.

```
orders                65      live (not AutoCount)      28
ops_order_control     65      with a PIC                65    ← the assignment sweep works

booking confirmed      0      delay_decision             0     delivery_photos    0
do_number              0      delivered                  0     order_payments     0
storage_from           0      balance keyed              0     line_etas          3
open ops_tasks         1
```

> ### 🔴 THE HEADLINE: **everything after "assign logistics" has never run.**
> Zero confirmed bookings · zero delivery orders · zero deliveries · zero photos · zero
> payments through the ledger · zero storage · zero delay decisions. **Roughly half of this
> module is shipped, tested and unexercised.** Every rule below about booking, the DO, the
> delivery day, the photo, storage and the delay clocks is proved by tests and by rolled-back
> transactions — **not by one real order having been through it.**

**Of the 28 live orders:** 22 carry a promised date · 1 is past it · 14 have a logistics
company · 18 have taken some money · 25 are priced · **19 are covered by a real purchase
order** · **0 carry `order_lines.source_po`.** That last pair is §5.1 — **the defect it caused was FIXED by D1 on 2026-08-06**, and the numbers are kept because they are what the fix was measured against.

**There is no single overall Order Status, and there never will be.** Business facts, actions,
module stages and exceptions are stored independently — `booking_stage`, `line_received`,
`delivery_photos` each record their own thing — and the view is COMPUTED at read time. **No row
carries one word claiming to summarise it.**

**An order can have several open actions at once**, computed independently so one never hides
another. The row shows the highest-priority one plus `+N`; the drawer shows them all.

**Pages that re-cut these orders by another angle are VIEWS, not modules.** The Delivery page
has its own sidebar item because operators live there all day, but it owns no records and
raises no actions — it renders §7's actions through the same shared computation this list runs.
**The same action is never defined in two files.**

---

# §2 · Shared architecture

## 2.1 · The action engine — two layers

**Layer 1** computes THREE TRACKS independently — goods · delivery · money — one action each at
most. The rungs inside a track are states of the same question, not parallel work.
**Layer 2** picks which one leads, giving every key its own rank inside its priority rung so the
sort is TOTAL — two actions can never tie and flip between renders.

**A broken commitment jumps every rung**, modelled as a FLAG rather than a rank: broken is a
fact about the ORDER, not about the kind of action.

```
1  Broken commitment or today's run     Deliver today · Upload delivery photo
2  The customer must be told — THROUGH LOGISTICS, never by us
                                        Call {logistics} — arrange new delivery date
3  Goods are not secured                Call {supplier} — confirm ready date · Issue PO
4  Delivery preparation                 Assign logistics · Call {logistics} — confirm delivery
                                        date · Issue delivery order
5  Money                                Collect RM {amount} from {customer}
```

**Money shows last and it is not a demotion** — you do not chase payment for goods you cannot
deliver. It never disappears: always in the drawer list and the Owing filter.

**Every action carries TWO strings** — a party-free QUEUE word for the facet row, the filter
chip and the count (a queue holds many suppliers, so it cannot name one), and a party-named ROW
line for a single order. Both come from ONE module, `packages/shared/src/order-action-words.ts`,
so a queue and a row **structurally cannot spell one action two ways**.

**Every open action opens the steps that close it** (`order-action-checklist.ts`). Each step is
one of the portal's OWN actions, so it is worded by that action's BUTTON string; **the last step
is the action's own outcome and is never ticked**, so an open action can never show a fully
ticked list. **No checkbox, no tick, no writer** — the state is READ from the same signals the
ladder just read.

## 2.2 · Ownership — two different things, and NEITHER is stored on an action

**Task Owner** = the order's PIC. The PIC owns EVERY action of that order, so an action carries
no owner field. **Case Owner** = the one person responsible for this customer's case start to
finish; it never changes and is never repeated on an action.

**How the PIC is decided** (LIVE, migrations 0232 + 0235;
`ops_order_control.assigned_staff / assigned_by / assigned_at` + `ops_staff_settings`):

- **One order, one owner, decided when the order arrives.** The system never moves an order off
  a person mid-flight on its own.
- **Opening an account is joining; disabling it is leaving.** An operation account joins the
  pool on its FIRST login and is dealt a share on that same page load. A generic, non-person
  account never joins. **Managers are never dealt orders.**
- **OWNER SCOPE — ruled by Jess 2026-08-07, and it replaces the two sentences that used to sit
  here and in §3 saying opposite-sounding things.**
  ```
  Sales Order is a SHARED REGISTER: every authorised operator may view and open
  every order.

  On first load a NON-MANAGER defaults to My Orders.
  A MANAGER defaults to Everyone.

  The owner filter is a STARTING VIEW, never an access restriction.
  The operator may switch to Everyone at any time.
  ```
  **The PIC says who is answerable, not who is allowed.** The old pair —
  *"no per-owner row filter"* beside *"a non-manager is defaulted to their own PIC filter"* —
  read as a contradiction and was not one; the missing word was **starting view**.
  Verified in code the same day: `OperationOrdersControl.tsx:2295-2307` defaults a non-manager
  to their own `staffFilter` once (ref-guarded, `if (isManager) return`), and the `TEAM` rail
  group renders for everyone — only `TeamPopover` (pool management) is manager-gated.
  **Nothing in code changes; this freezes what already ships.**
- **Only a manager may assign by hand** (`ops_manager`; the web hides the control, the API
  answers 403).
- **The sweep only re-spreads what the SYSTEM handed out.** Unowned orders and orders with
  `assigned_by` NULL are re-split evenly; **an order a human assigned never moves.** The split
  is deterministic, so two operators triggering it at once produce the same plan.
- **Absence needs no click.** A heartbeat is stamped while an operator has the portal open.
  **Before 10:00 MYT everybody keeps their share** — late is not absent. From 10:00 a member
  with no heartbeat counts as out and their system-assigned orders flow to whoever is in; they
  log in later and the share flows straight back.

## 2.3 · Row order

```
Primary    risk to the promise — overdue → due today → due next working day →
           commitment broken → stock will miss the window → action due soon → normal
Secondary  the customer's promised date
Tertiary   order value, high to low — a tie-breaker ONLY
```

**A large order weeks away never outranks a small one going out tomorrow.**

## 2.4 · The three dots

Three independent facts beside the stage pill. **Each dot carries its own icon** (goods
`package` · delivery `truck` · money `wallet`, 14px), so the dots need no header of their own;
the `Status` header belongs to the pill. **Never emoji, never a bare circle** — a colour nobody
can name without looking elsewhere is not a signal.

| | green | amber | red |
|---|---|---|---|
| goods | all in | waiting goods arrival | no PO raised, or the supplier's date is late against the deadline |
| delivery | the CUSTOMER confirmed | logistics gave a date, customer has not | past the deadline and still unconfirmed |
| money | settled | still owing, not late yet | still owing AND late — the balance due date passed, or the goods are delivered |

**A delivered order never alarms on goods or delivery. Delivered is not paid** — once the goods
are out, owing money is always RED: there is nothing left to wait for.

## 2.5 · What is deliberately NOT an action

- Anything a trigger already does by itself (a number the database stamps).
- Any step nobody records — *"goods loaded"*, *"driver departed"*.
- **Any tick-box that would only record "I say I did it."**
- **Waiting states are not actions.** Nobody does anything while one is true. A wait becomes an
  action when it EXPIRES or a human decision is required.
- **"Everything is ready, the day has not come" is not an action.** Goods in · logistics
  assigned · the date confirmed · that date still ahead — there is nothing for a human to do,
  which is why the old `Confirm delivery with {customer}` was the one drawer row **no button in
  the portal could close.** It is a quiet FACT — `Delivering 27 Jul · 9–11 AM` — and
  `Deliver today` takes over on the day.

## 2.6 · What the flow reads

| Signal | Where it lives |
|---|---|
| the customer's promised date | `orders.delivery_date` (+ `delivery_date_tbd`) |
| goods ordered / not | `purchase_orders` for this order |
| the supplier's ready date | `ops_order_control.line_etas` |
| goods physically in | `ops_stock_items` reserved to this order · `line_received` |
| logistics chosen | `orders.delivery_partners` / `ops_assigned_logistic` |
| the booking | `ops_order_control.booking_stage` + `confirmed_date` + `confirmed_time_slot` |
| delivery photos | `ops_order_control.delivery_photos` |
| the building we deliver to | `orders.entry_data → fields.building_type` — **it decides half-day vs full-day** |
| money | **`orders.paid`** — the one money truth. Shared rule: `packages/shared/src/order-money.ts` |

---

# §3 · The Orders list

### MISSION
One daily-driver table where every order lands, ordered by risk to the customer's promise.

### WORKFLOW
Six stage tabs map the Master Sheet's logistics-remark flow onto the live pipeline. **`Pending`
is a banned word** (pending on WHAT?) and **a date logistics proposed is not a booking**, which
is why the middle two are named as they are.

```
All · Placed · Proceed · To book · Customer confirmed · Delivered
```

- **Placed** — genuinely new, not yet triaged.
- **Proceed** — being arranged. **Includes AutoCount-imported orders** by the agreed entry rule
  (AutoCount import → Proceed; a future salesperson order → Placed).
- **To book** — past placement, goods and/or the customer's date still outstanding.
- **Customer confirmed** — stock in AND the customer confirmed a date + slot.
- **Delivered** · **All**.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/OperationOrdersControl.tsx`, **5,152 lines** ·
route `/operation/orders` · ***measured 2026-08-06 — every line of logic read end to end;
the JSX read structurally.*** It merges three legacy surfaces — the 6-column kanban, the
AutoCount triage Inbox and the flat read-only feed — into one table.

**The table itself is `kit/DataTable` since S1 (2026-08-07).** The page owns the columns, the
cells, the sort order and the 30-row window; the `<table>`, the `<tr>`, the widths, the 40px,
the sticky head, the select box and the column rules are the kit's. **Orders is no longer the
one register in the portal outside the kit.**

**The nine rail groups, in render order:** `QUEUES` (danger) · `DELIVERY` · `TEAM` ·
`DEADLINE` · `LOGISTICS` · `SUPPLIER` · `REGION` · `CATEGORY` · `FIX DATA`.
`FILTERS`, `FIX DATA` and `CATEGORY` start **collapsed**.

**QUEUES holds, in order:** `Overdue` · `Owing` (with the money total) · the four STOCK action
queues (`Issue PO` · `Confirm ready date` · `Delay planning` · `Arrange new delivery date`) ·
`Supplier late` · `Follow-up` · `For manager review`. **A row with a count of zero is not
rendered.** The two delay queues carry a `N · M late` tail from their own office-calendar
deadline; the other queues carry none.

**Every count runs over `liveScope`** = the current tab, minus completed, minus the AutoCount
archive. **`Owing` and the delivery-photo queue are the two deliberate exceptions** — both span
delivered orders, because the money and the proof outlive the delivery.

**The bulk bar writes:** assign logistics (loops the ops-assign endpoint) · create follow-up
tasks · mark completed (**server-scoped to AutoCount rows only**) · **No storage** (writes
`storage_fee_override = 0`) · CSV · Print.

**The auto-assign sweep is SERVER-SIDE and fires once per page load from ANY operation
session** — a staff member receives their share the moment THEY open the portal, with no
manager session. **The owner scope on first load is §2.2's OWNER SCOPE rule; it is stated
once, there.**

### DATE SCOPE — ruled by Jess 2026-08-07
```
No default date window.
`All` means every non-cancelled order the server returns.
NEVER default Sales Order to This Month.
```
**Sales Order is the REGISTER; SO Batch Purchase is the work queue and defaults to the current
purchasing window.** An order that is old AND still unpaid, undelivered or in service is
exactly the one a month window would hide, and it is the one that must not disappear quietly.
**AutoCount already separates these two uses and its own screens are the evidence** — its
`Sales Order` register loads all 1,567 with no filter chip; its `Sales Order Batch Posting`
opens on `Processing Date · Is this month · Record 31 of 31`
(`../research/grid-findings.md` F43 · F43a).

**How the page performs while showing everything is an ENGINEERING problem and may never
narrow this scope.** It is a gate on the build, not a reason to re-open the ruling.
**Verified unchanged in code:** `OperationOrdersControl.tsx:1561` defaults the tab to `all`,
`:1903-1906` returns `orders` unfiltered on that tab, and `liveScope` (`:1918`) narrows the
FACET COUNTS only, never the rows.

> 🟡 **The one gap this ruling exposes, reported not fixed.** The rule says *"the operator may
> switch to Everyone at any time"*, and today **`Everyone` is not a control with a name** — it
> is the cleared state, reached by clicking the ALREADY-ACTIVE `TEAM` row a second time
> (`OperationOrdersControl.tsx:2985`). Access is real; discoverability is not. **Whoever next
> touches the TEAM rail owes it a named row.**

```
FACET RAIL     QUEUES (the module's open actions, danger group first) ·
               DEADLINE (Overdue · Due ≤3d · This week · Next week) ·
               TEAM (per PIC) · LOGISTICS · CATEGORY · FIX DATA · Owing
TABLE          ☐ · Follow-up · Status(pill + 3 dots) · Order · Customer ·
               Deadline · Stock · Delivery · PIC · Actions(verb-led line + `+N`)
               rows 40px · default order = risk to the promise
FOOTER         the count band, and the `Loading more…` statement while the
               30-row window is short of the total
```

**Measured on production 2026-08-05 at 1440×900:** table 1012px in 951px available, 32 clipped
cells of 300 (all `Actions`, which needs 249px on every row and gets 208.5), 16 fully visible
rows. **The residual truncation is ACCEPTED** — the verb and the party are visible, the full
text is in the `title` and in the drawer. **`Actions` is still 208.5px after S1 and its
truncation is unchanged**; what S1 moved is below, measured the same way.

### ✅ S1 · SHIPPED 2026-08-07 — the list renders through `kit/DataTable`

**The migration is done and the card is closed.** `OperationOrdersControl.tsx` no longer
hand-writes a `<table>`: the eight business columns are `Column` objects, the header word is
typed once in the column def, and the `<tr>`, the widths, the 40px, the sticky head, the
select box, the row washes and the column rules are `kit/DataTable`'s. Same eight columns,
same data, same 30-row window, same risk order.

**WHAT WENT WITH THE HAND-WRITTEN TABLE**
```
carres.orders.hiddenCols  the localStorage store of column visibility.
                          Loo RULED against it 2026-08-04 (grid-findings F58 ·
                          F61) and the kit has nowhere to put it. The `⋮ Show
                          columns` popover and its `N/M` chip went with it —
                          the ⋮ held nothing else.
the <tr> sentinel         the append trigger moved onto the SCROLLER, through
                          `DataTable.rootRef`, at the same 240px threshold.
                          The `Loading more… (N of M)` statement moved to the
                          FOOTER count band — same words, beside the number it
                          qualifies.
the page's own <Th>       and its header hex, its colgroup and its wrapper
                          frame (P16: a list grid is a SHEET, not a card).
```
**Measured, not asserted:** the design guard's rule L — *"a browser-persisted UI-shape key in
`pages/**`"* — fell **8 → 6**. Rule G (*a hand-rolled table*) fell 682 → 678. No guard rule
rose.

**WHAT IS AVAILABLE BUT NOT WIRED, AND WHY.** Header-click sort and the per-column ▼ are one
prop away now, and S1 passes neither. `CLAUDE.md` §2: *"a feature is wired only if it makes the
operator finish faster today; 'the kit has it' is not an answer."* Sort needs the PAGE to
reorder rows against `compareBySlack` — the page's own answer to *what is most urgent* — and
what an operator should be allowed to sort away from that is a decision, not a prop. **It is
the next card's question and it is now cheap to answer.**
**→ S2.1 answered it on 2026-08-08 and sort is now wired; the ▼ is S2.2's.**

# ✅ S3 · SHIPPED 2026-08-08 — the width card, and it unblocked S2.5

> **Everything waited on this, and all of it is now paid.** S2.5 was blocked on it (measured,
> #692) and **shipped the same day S3.2 freed its 42px**; the ⚑ regression was it (`8340b0f0`);
> and `Actions` truncating on 30 of 30 rows had been marked ACCEPTED on an arithmetic this card
> overturned.

**⭐ THE DECISION, AND IT IS NOT A NEW ONE — IT IS TWO OF LOO'S OWN RULINGS, OPPOSED.**

```
Orders    2026-07-09  the table is ALWAYS exactly the container width, NEVER scrolls
                      sideways; long content ellipsis-truncates
To Order  2026-08-06  below its own width the grid SCROLLS SIDEWAYS, never truncates —
                      "deleting a business column, or shrinking one below its measured
                       content, to avoid a scrollbar is FORBIDDEN"
```

**One owner, two rulings, opposite directions, two pages — and the older one has now produced
the failure the newer one exists to forbid.** Measured on production at ~1130px: `Order` reads
`S(`, `Customer` reads `W. K.`, `Stock` reads one letter. **Every one of those is a column
shrunk below its measured content, which the 2026-08-06 ruling names and bans.**

> **S3 applies the LATER, MORE SPECIFIC ruling to Orders.** This is not a new law and not a
> reversal on the merits — it is the same owner's own rule, applied where its own stated
> failure has now appeared. **If Loo wants Orders to keep truncating instead, that is one
> sentence and S3 stops.**

```text
BUILD CARD · S3.   git pull, then read CLAUDE.md + docs/orders/MASTER.md §3.

S3.1 ✅ SHIPPED — Orders columns are CONTENT-SIZED — sizing="content", px widths
      measured in a real browser against each column's worst live string,
      exactly as To Order and Purchase Orders already are. Below the sum the
      grid scrolls sideways. It stops squeezing.
      ⚠ MEASURE AT ≤1130px. Every earlier width reading in this programme ran
        at 1440x900, where the defect is invisible (8340b0f0).

S3.2 ✅ SHIPPED — FREED THE ⚑'s 72px. It holds a 15px flag; it costs 72 because its HEADER
      needs the word. That needs `Column.label` to stop being `string` —
      A KIT CHANGE, reaching three FROZEN pages, so it is OPTIONAL and
      additive or it does not ship. If the kit refuses, S3.2 STOPS and reports;
      S3.1 stands on its own.

S3.3 ✅ SHIPPED — RE-OPENED `Actions`. §3 marks its 30-of-30 truncation ACCEPTED on the
      premise that all eight columns must be visible at once. S3.1 removes
      that premise. Re-measure and state whether ACCEPTED still holds.

DO NOT TOUCH   queues · business rules · the action ladder · the drawer ·
               permissions · api · row height · row ORDER (§2.3 is frozen,
               and S2.4 was refused on it).

THEN  test → self-review → PR → merge → deploy → verify production.
```

### ✅ S3.1 · SHIPPED 2026-08-08 — the columns stop being a share of the window

**Every column is now a MEASURED PIXEL and the grid scrolls below their sum.** The eight
business columns, the ⚑ and the kit's select box total **1,198px**; below that the kit's own box
scrolls sideways, and above it the slack goes to the kit's filler — **no column grows and none
shrinks.**

**THE MECHANISM WAS THE DEFECT.** A percentage makes a column's width a function of the WINDOW
instead of its CONTENT, so a narrow window silently spends C14's measurements down to nothing.
That is `Order` reading `S(`. `sizing="content"` + px widths ends it, and
`REFERENCE_TABLE_PX` · `GUTTER_DEFICIT_PCT` · `DEFICIT_SHARE` are **deleted** — all three
existed to answer *which business column pays for the gutters*, and the later ruling says
nobody does.

### ⭐ C14's METHOD WAS RIGHT AND THREE OF ITS NUMBERS WERE SHORT — ONE CAUSE

Re-measured in Chromium in each cell's **real markup**, 2026-08-08:

```
column     C14   S3.1   the measured cell                              why it moved
Status     133 → 139    pill + gap + three 14px dots      = 122.3      padding
Order       74 →  87    `CR0925 +2` mono 13/600           =  70.2      + string
Customer   185 → 189    `MyHouse Management PLT`          = 172.5      padding
Deadline   147 → 154    heat badge + gap + `Wed, 22 Jul 26` = 137.9    padding
Stock       50 →  54    `ETA —`                           =  37.6      padding
Delivery   147 → 160    `logistics said Mon, 20 Jul`      = 143.9      + string
PIC         58 →  58    the chip 24; header + arrow 34                 unchanged
Actions    207 → 253    verb line + `+N`                  = 236.2      + string
```

**Every width is `measured cell + 16px`, and 16 is the cause.** C14 budgeted 8–12px of cell
padding; **the kit's uniform `px-2` is 16.** S1 already recorded that four-pixel loss —
*"the kit's uniform `px-2` costs every column 4px of content box"* — and S3.1 is where it is
finally paid rather than absorbed. Two strings also simply measured wider than C14's note
(`CR0925 +2` is 70.2, not 65; `logistics said Mon, 20 Jul` is 143.9, not 135).

### MEASURED, NOT ASSERTED — AT FOUR WIDTHS INCLUDING LOO'S OWN

```
table container   1400    1022    890 (~1130px window)    850
table width       1398    1198    1198                    1198
scrolls?           no     YES     YES                     YES
columns off their declared px          NONE at any width
CELLS CLIPPED                          ZERO at any width
header row                             40px, no wrap, at every width
```

At 1400 the FILLER takes the slack — the columns stay exactly their measured pixels instead of
inflating, which is the half of `sizing="content"` that makes a measurement mean something on a
1920 monitor as well as a 1280 laptop.

> ✅ **AND IT CLOSES S2.1's REPORTED 🟡 FOR FREE.** `Stock` at 54px now holds its own sort
> arrow: S2.1 measured the arrow needing 46px against a 37.9px content box and being painted
> over by `Delivery`'s header. Nothing was done about it — the column simply stopped being
> squeezed.

### ✅ S3.2 · SHIPPED 2026-08-08 — the flag column costs 30px, and the kit did not refuse

**72px → 30px. 42px back to the eight business columns, and the word did not move.**

The cell was always ONE 15px flag. It cost 72 because `Column.label` is a `string`, so the head
had to SPELL it — `Follow-up` is 52.4px + the kit's 16. `8340b0f0` is what that bought: on a
~1130px window this column kept its 72 while `Order` collapsed to `S(`. **The column that
survived was the one answering nothing.**

### THE KIT DID NOT REFUSE, BECAUSE IT WAS NOT ASKED TO CHANGE A SIGNATURE

Widening `label` to `ReactNode` was the obvious fix and it is impossible — it reaches three
FROZEN pages. **`Column.headerContent?: ReactNode` is OPTIONAL and additive**, which is the same
door S1 used for `selection.rowLabel`: *"a changed signature reaches a frozen page; a new
optional prop cannot."*

**The word is not lost, and §10.1 is why it may not be.** `label` stays required, stays the
column's NAME, and is still the accessible name and the `title`. **Measured: the header's
accessible name reads `Follow-up` before AND after.** A screen reader and a hover get exactly
what they got; only the pixels changed. A kit test asserts both halves — that a caller passing
nothing emits **byte-identical markup**, and that a drawn header still answers to its name.

```
                        before            after
th width                72px              30px
content box             56.0              14.0
header needs            52.4 (the WORD)   14.0 (the drawn flag)
wraps?                  no                no
accessible name         Follow-up         Follow-up
table width             1198px            1156px
```

> ### ⭐ AND THE 42px IS EXACTLY WHAT S2.5 COSTS — TO THE PIXEL
>
> #692 measured the expansion chevron at 3% of a percentage-sized table. **Orders is
> `sizing="content"` since S3.1, and at content sizing the kit fixes that gutter at a flat
> `42px`** (`expansion && <col style={{ width: fills ? "42px" : "3%" }} />`). S3.2 freed
> **42px.** The gutter is paid for and not one business column pays anything.
>
> **S2.5 is unblocked.**

### ✅ S3.3 · SHIPPED 2026-08-08 — ACCEPTED does not hold, and C14's string was the wrong one

**`Actions` is 331px. The verdict §3 recorded is overturned — but not by re-running C14's
measurement. By finding that C14 measured the wrong string.**

Measured 2026-08-08, the `+N` chip included, + the kit's `px-2`:

```
Collect RM 1,234,567.00 from MyHouse Management PLT   397.9   UNBOUNDED
Call Nice Future Bedding — confirm ready date         330.1   ← the widest BOUNDED
Call HOUZS — arrange new delivery date                293.4
Collect RM 2,250.00 from Tan Ah Kow                   275.8
Delivering Mon, 20 Jul · 12pm–3pm                     256.4
Check in from Nice Future Bedding                     255.1
Call NETS — confirm delivery date                     252.2   ← C14's, and every
Issue PO to Nice Future Bedding                       238.3     card sized to it
```

> **THE WIDTH IS A FUNCTION OF THE PARTY, NOT OF THE TEMPLATE** — and C14 measured on a day
> whose live party was `NETS`, four characters. **Seven of the eleven reachable lines are wider
> than the 253 S3.1 derived from it**, and C14's own string is nearly the NARROWEST of the
> party-named family. The "widest LIVE content" method is right for a column whose content is
> data; it is wrong for one whose content is COMPOSED from a template and a configuration list.

**331 HOLDS EVERY BOUNDED LINE WHOLE.** Logistics companies and suppliers are CONFIGURATION
(`CLAUDE.md` §6 — *"what must survive is configuration: suppliers, SKUs, production days,
rates"*): a short, known, slow-changing list. Every action naming one of them now fits.

**THE ONE THAT STILL TRUNCATES IS `Collect … from {customer}`, and it is the right one to
accept.** A customer name is UNBOUNDED, so **no number retires this** — and it is the only
action line whose information is fully repeated on the same row: the customer is two columns
left, and the money is in S2.3's footer total and the `Owing` rail. Every other line names a
party that appears nowhere else on the row.

**So ACCEPTED is replaced, not renewed.** It used to mean *"every row truncates and we cannot
afford otherwise"*; it now means *"one action line truncates when one customer's name is long,
and its content is on the row twice already."*

**WHAT THIS UNBLOCKED — and S2.5 spent it the same day.** #692 measured the expansion chevron at
3% — **−24 to −28px taken from the eight business columns, `Actions` worst.** At `sizing="content"`
that gutter is a flat 42px instead, and S3.2 freed exactly 42. **S2.5 shipped on it, and every
one of the eight widths below is unchanged** — re-measured in Chromium at 1130px with the gutter
present (§3 · S2.5).

---

### 🔴 S1 REGRESSION, SEEN BY LOO ON A NARROW WINDOW 2026-08-08 — `Follow-up` NO LONGER SHRINKS

**Observed on production, not measured in a harness, and that is the point.** On a ~1130px
window the eight business columns collapse to a few characters each — `Order` reads `S(`,
`Customer` reads `W. K.`, `Stock` reads one letter — **while `Follow-up`, which holds one flag
icon, is among the widest columns on the sheet.**

```
BEFORE S1   ⚑ was 3% — a SHARE. It shrank with everything else.
AFTER  S1   ⚑ is 72px — FIXED. It keeps its space while the data loses theirs.
            (S1 had to: `Column.label` is a string, so the icon became the word
            `Follow-up`, and at a percentage it wrapped to `Follow-` / `up`.)

→ the narrower the window, the LARGER the share one flag icon takes.
  At a ~550px table that is ~13% for the flag plus 4% for the checkbox:
  a sixth of the sheet is control columns.
```

**Why no measurement caught it:** every width reading in `../research/grid-findings.md` §4.7
and every S1/S2.1 harness ran at 1440×900 or wider, where the loss is invisible. **The defect
only exists below the measured window, so an operator's eye found what the instrument could
not.** Re-measure at ≤1130px before claiming any width is safe.

**NOT FIXED HERE, and it is not S2's.** S2 wires grid powers and changes no width. This is the
first line of the width card (S3), and it joins the same defect family already measured in
Purchasing: `../research/grid-findings.md` §4.8 F71–F73 — three width mechanisms, two
scrollbars, and on four of six tabs **the column that falls off the edge is the one answering
the tab's own question.** Here the column that survives is the one answering nothing.

**🟡 SEEN IN THE SAME PASS, in the drawer, which every current card names DO NOT TOUCH:** the
items table's `PO` and `ITEM` headers render on top of each other (`PIOEM`). Recorded so it is
not lost; it belongs to whoever next opens §4.

### ⚠ THE WIDTH BUDGET MOVED, AND THE CARD'S "SAME WIDTHS" COULD NOT HOLD

The card said *same widths*. **It is arithmetically unsatisfiable and the build measured why**,
so the record is here rather than in a chat:

```
kit/DataTable OWNS the select column at a FIXED 4%   (the page spent 3%)
`Column.label` is a `string`, so ⚑ takes a WORD.
   `Follow-up` measures 54.4px at the th's text-label + the kit's px-2
   → the column is 72px, IN PIXELS                   (the page spent 3%)
────────────────────────────────────────────────────────────────────────
at C14's 1012px reference that is 7.11%, so the two control columns
cost 11.11% where they cost 6%
→ 5.11% MUST come out of the eight.  The only question is WHICH.
```

> ### ⛔ AND THE ⚑ COLUMN IS SIZED IN PIXELS, WHICH ONLY A REAL BROWSER COULD TELL US
>
> **S1 first shipped that column as a percentage — 7.25%, tuned to the 1012px table C14
> measured — and the header WRAPPED the first time the page was opened in Chromium.** At
> 1440×900 with the nav EXPANDED the table is **850px**, and 7.25% of that is 61.6px against a
> word that needs 70.4px. `Follow-up` rendered as "Follow-" over "up".
>
> **All 155 unit tests passed while it wrapped, and they always would have: jsdom has no
> layout engine.** A percentage of a table that changes width cannot protect a word whose width
> is fixed — only a pixel can. The kit already documents the recipe (`Column.width`: *"a string
> = raw CSS width — fixed interior columns … the international recipe"*).
>
> **The rule this leaves behind: a column whose HEADER is the widest thing it will ever hold is
> sized in pixels, not percent.** The unit test now pins `72px` and says why — it cannot catch
> the wrap, it can only hold the pixel that prevents it.
>
> **Measured in Chromium after the fix, both nav states, live dev server:**
> ```
> nav EXPANDED   table  850px   ⚑ 72px, one line   no sideways scroll
> nav COLLAPSED  table 1022px   ⚑ 72px, one line   no sideways scroll
>                Status 134.9 · Order 75.5 · Deadline 151.1 · Stock 54.0 ·
>                PIC 59.4 · Actions 210.5   ← every one of C14's, to the pixel
>                Customer 106.7 · Delivery 116.3   ← the two that pay
> ```
**Answered by measuring in Chromium at the real 1012px, on C14's own worst-case strings,
before and after in the same harness.** Two allocations were built and rejected first:

```
ALL ON `customer`, per C14's own deficit rule   →  123px → 77px,
    and `Tan Ah Kow` truncates.  REJECTED — an ordinary human name is
    not an edge case, and a rule written to absorb 50px does not
    survive being asked for 95px.
EVEN SPLIT customer + delivery                  →  `Tan Ah Kow` still
    loses 5px.  REJECTED — a symmetrical number is not an argument.
1 / 2 · `delivery` pays TWICE `customer`        →  SHIPPED
    customer 123 → 105px  ·  delivery 150 → 114px
    Actions · Deadline · Status · Order · Stock · PIC keep C14's
    width TO THE DIGIT, and the budget still lands on the whole table.
```
**`delivery` pays the larger share because it carries the least, and this module already ruled
why:** §3's frozen rule is that *"the `Delivery` cell never repeats the sentence `Actions`
already carries"* — the row says what to DO about missing logistics one column to the right,
every time — and C14 records this column's live exposure to its sizing string as **zero of 65
orders**. A customer's name is read on every row and nothing else on the row says it.

**C14's reason for not squeezing `delivery` was a hazard the kit REMOVES** — *"neither date
line carries `truncate`, so under-sizing this column does not ellipsise, it OVERFLOWS into
PIC."* The kit clips every cell, so nothing can bleed into PIC; all three of that cell's lines
now carry `truncate` + a `title`, so the clip shows an ellipsis instead of half a glyph.

**AND THE KIT'S UNIFORM `px-2` COSTS EVERY COLUMN 4px OF CONTENT BOX.** The page's cells padded
8–12px each. Measured deltas, same strings, before → after:
```
Actions   −135 / −78 / −78  →  IDENTICAL.  The column is 208.5px in both.
Status    −19 → −24   Order −34 → −43   Deadline −8/−5/−18 → −12/−9/−22
Stock       0 → −2    (`ETA —`, and it ellipsises)
Customer  −85 → −108  (the deficit; the name is in the title + drawer + search)
```
**Every one of those cells already truncated before S1** except `Stock`, and the MASTER already
marks the residual ACCEPTED. **`Actions` — the one thing on the row a human acts on — is
untouched**, which is what the card asked for and what was verified first.

> 🟡 **REPORTED, NOT FIXED — and the next card that re-tabulates this page starts here.**
>
> **① A 15px flag icon now occupies 73px, because its HEADER needs the word.** `Follow-up` is
> the widest thing that column will ever hold and it is in the HEAD, not the data — the cell is
> one tooltipped icon whose colour is the whole state. 7.25% is more than `Stock` (5.28) or
> `PIC` (5.81) get, on a table C14 measured **50px SHORT of its own content**. Either the kit
> learns an icon header (`Column.label` would have to stop being a `string`, which reaches
> three FROZEN pages) or the flag stops being a column. **S1 does not decide it** — the
> migration was approved with the word, and a build card does not reopen an approved rule.
>
> **② `Deadline` is clipped and deliberately has NO `truncate`.** S1 added one and took it back
> out: the ellipsis reserves its own width, so `Wed, 22 Jul 2` became `Wed, 22 Ju…` and the
> operator lost the MONTH to gain a signal they could already see. A date is read left to right
> and its tail is the year. **Re-measure before reaching for that again.**
>
> **③ `Actions` still truncates on every row**, exactly as before. The MASTER marks it ACCEPTED
> on an arithmetic that assumed all eight columns must be visible at once, and **a frozen
> identity gutter would change the assumption.** Still open, still not this card's.

### ONE KIT CHANGE, AND IT WAS A DEFECT REPAIR

Card 01 mapped 28 capabilities and found nothing missing. **It missed one, and the build
found it:** `selection` names the select-all box but had no word for a ROW's box — that name
was built from `rowId`. Orders keys its rows by the database uuid, as every write on the page
does, so the migration would have had a screen reader announce `Select 0f3a…` on all thirty
rows and would have LOST the operator's own name for the row.

`selection.rowLabel?: (row) => string` is now an optional prop, passed here as
`Select SO-1221`. **Optional is the kit's own rule for exactly this reason** — *"a changed
signature reaches a frozen page; a new optional prop cannot"* — and the three pages that pass
nothing emit byte-identical markup. **Card 01's verdict stands: zero ENGINE changes. This is a
missing word, and the kit's own §10.1 says a word is never the kit's to supply.**

# ▶︎ S2 · APPROVED TO BUILD 2026-08-08 — wire the powers S1 made reachable

> **S1 was INFRASTRUCTURE. It replaced the table renderer and deliberately wired nothing.**
> S2 is IMPLEMENTATION, not another research card. **Do NOT create a new Orders page** — keep
> amending `OperationOrdersControl.tsx`, which is where the business lives.

```text
BUILD CARD · S2 · connect the grid powers.   git pull first.
READ ONLY   CLAUDE.md  +  this §3.   Card 01 already returned READY.

ONE CAPABILITY PER COMMIT, IN THIS ORDER. Never one huge PR.
   S2.0  Make main GREEN         → ✅ SHIPPED 2026-08-08, recorded below
   S2.1  Header sorting          → ✅ SHIPPED 2026-08-08, recorded below
   S2.2  Header filter dropdowns → ✅ SHIPPED 2026-08-08, recorded below
   S2.3  Footer totals           → ✅ SHIPPED 2026-08-08, recorded below
   S2.4  Grouping                → ⛔ REFUSED 2026-08-08, recorded below
   S2.5  Expansion               → ✅ SHIPPED 2026-08-08, recorded below

S2 IS CLOSED. All five capabilities are answered — three wired, one refused,
one shipped once the width card paid for it.

COPY 2990's behaviour. Do NOT redesign any of them.
   2990s/apps/backend/src/components/DataGrid.tsx  (+ MfgSalesOrdersList.tsx)

DO NOT TOUCH   Queues · business rules · Actions · the drawer · permissions · API.
               Only rendering behaviour INSIDE the grid changes.
               Everything outside the grid stays OperationOrdersControl's.

IF A CAPABILITY CANNOT BE COPIED FROM 2990 — STOP AND REPORT.
Do not invent a replacement without approval.
```

**TWO CONFLICTS ARE ALREADY MEASURED. They are reported here so the build does not discover
them at the keyboard.**

**🔴 S2.3 · 2990 HAS NO FOOTER TOTALS. Nothing to copy.** Verified first-hand 2026-08-08:
`tfoot` · `totalRow` · `footerTotal` · `sumRow` return **two hits in 1,551 lines and both are
`totalRows`, a GROUP's row count** (`DataGrid.tsx:761-763`), not a totals strip. The source for
S2.3 is therefore **Carres' own kit** (`DataTable.totals`, D0.5d power 4) **and To Order's live
usage of it** — not 2990. **That is a source change, not an invention, so it needs no approval;
but the card may not claim it copied 2990.**

**🟡 S2.4 · GROUPING REORDERS ROWS, AND ROW ORDER IS FROZEN.** §2.3 rules the order is *risk to
the promise* — `compareBySlack` — and the kit emits a group header whenever the key CHANGES
from the row above, so **grouping and the frozen order cannot both hold.** Purchasing hit this
exact wall and its answer is on record (`../purchasing/MASTER.md` §3: re-cluster after every
sort so an order's items stay together). **Grouping an Orders row by anything is a BUSINESS
question — what an operator may be allowed to reorder away from risk — so S2.4 STOPS and asks
before it builds.**

> ### ⛔ S2.4 IS REFUSED, 2026-08-08 — and NO new ruling was needed to refuse it
>
> **§2.3 already answers this, and it is already frozen.** The card was right to stop; it was
> wrong that a decision was owed. Grouping is not a new question awaiting approval — it is a
> request to REVERSE a frozen rule, and **nobody has offered a reason to.**
>
> ```
> §3  MISSION      "ordered by risk to the customer's promise"
> §2.3 FROZEN      primary = risk · secondary = the promised date · tertiary = value
>                  "A large order weeks away never outranks a small one going out tomorrow."
>
> Grouping puts whatever sorts first at the top. The most urgent order sits
> wherever its group landed. That is the ONE thing this page exists to prevent.
> ```
>
> **AND THE PAGE ALREADY HAS WHAT GROUPING BUYS.** The facet rail is nine groups —
> `QUEUES · DELIVERY · TEAM · DEADLINE · LOGISTICS · SUPPLIER · REGION · CATEGORY · FIX DATA` —
> and a click filters to one. S2.2 added four header ▼ on top. **Grouping would be a tenth door
> onto facts that already have one, which is the duplication §3's own frozen rule bans.**
>
> **WHY 2990 HAS IT AND WE DO NOT — the standing rule, applied.** 2990's Sales Order list has
> **no facet rail and no action ladder** (§2 F22: *"no owner, queue or next-action concept
> anywhere in the 1,669 lines"*). It groups because grouping is the only way to find anything
> in a flat register. **We are not missing its power; we already solved the problem it solves,
> better. Copying it would be copying the ASSUMPTION.**
>
> **What would REOPEN it:** an operator observed doing a job the rail cannot do — needing every
> logistics company on screen AT ONCE rather than one at a time. **That is an observation of a
> person, not an argument about a grid**, and none exists. The owner may reopen §2.3 at any
> time; nothing here asks them to.
>
> **S2.4 is CLOSED. Go straight to S2.5 · Expansion.**

**SORTING'S DIVISION OF LABOUR DIFFERS AND THAT IS NOT A DEFECT.** 2990 sorts INSIDE its grid
(`sortedRows`, `col.sortFn`, `DataGrid.tsx:685-689`); Carres' kit states *"The PAGE sorts the
rows; the kit only shows the arrow."* **So S2.1 copies 2990's BEHAVIOUR — asc ⇄ desc ⇄ off —
into the page's own comparator, and does not move sorting into the kit.** The third click
already returns to `null`, which is `compareBySlack`, so §2.3 survives sorting by construction.

**THEN** test → self-review → PR → merge → deploy → verify production **per capability**.
**Do NOT come back for approval on engineering.** The four reasons to interrupt are the
Constitution's, and a truncated cell is not one of them.

### ✅ S2.0 · SHIPPED 2026-08-08 — main is GREEN, and the tests were the ones that were wrong

**231 files · 2,700 tests · 0 failures.** Was 16 failures across 4 suites, reproduced on a
clean `d0cede0c` checkout, so they predate S2 entirely. **Every one was a test asserting UI a
RULING had removed, and no component was touched** — `git status` on the whole card lists four
`.test.tsx` files and nothing else.

```
OperationOrders          7  the drawer's ActionBar buttons
OhanaSofaTab             4  "the Receive button is absent"
OrderCustomerCard        4  "the card has an Edit button"
NiceFutureMattressTab    1  "the row shows the supplier + warehouse"
```

**ONE RULING CAUSED NINE OF THE SIXTEEN.** Jess, 2026-07-11 — *every panel's actions live in
its header ⋮; the redundant inline button is gone.* The drawer's stage actions moved into the ⋮
(`OrderDetailDrawer.tsx:7266-7269`: *"the per-stage 'next step' lives in the ⋮ now — no sentence
row"*) and so did the customer card's Edit. **Test 15 in that same file had already followed the
move a card earlier; the stage tests never did**, which is exactly how a suite rots one ruling at
a time. The words moved with them: `Assign delivery partner` → **`Assign logistics`** ·
`Issue POs` → **`Issue PO`** · `Attach DO & mark delivered` → **`Mark delivered`** (from the
action dictionary, not spelled in the test) · `Transfer to ready (stock on-hand)` →
**`Transfer to ready`**. `Waiting for them to push it to operation` greps **0 times in `src`** —
the sentence row it belonged to was deleted, so that test was reading for a string, not a
behaviour.

**THE OTHER SEVEN WERE THREE MORE RULINGS.** Loo's **Direct-Receive escape hatch** (2026-05-11)
put a `Direct receive →` link on every non-terminal state, so *"the receive testid is absent"*
became false **and correct** — the receive RPC only requires `status='open'`, so operation can
legitimately receive whenever the DO arrives via the supplier. Loo's **row redesign C+D**
(2026-05-18) dropped the Supplier column (*"redundant per supplier tab"*) and the Warehouse
column (*"only 1 WH currently, zero info"*).

**NOTHING WAS DELETED TO GO GREEN — THE ASSERTIONS WERE INVERTED OR RE-AIMED.** A deleted
assertion lets the removed thing quietly come back; an inverted one fails the day it does and
names the ruling that would have to be reopened first. The three tests guarding real
`update_order` behaviour — PATCH only the changed field · a too-short name is refused · a no-op
Save just closes — were **kept exactly as written** and simply enter through the door that
exists (`startEditRef`, which IS the ⋮'s handle). **Three control cases were added** so the new
assertions cannot pass vacuously: a completed order offers no Abandon, a delivered partner does
offer the primary check-in, and the supplier name is asserted ABSENT rather than not-asserted.

> ### 🔴 AND THE CARD FOUND SOMETHING THAT IS NOT A TEST PROBLEM — **D9**
>
> Four of these tests could not reach the branch they named **no matter what stock the fixture
> declared**, and the reason is a live rule: `lineCategory()` reads `SOFA-NORD-3S` as an
> **accessory**, and §7 rules that accessories never block a delivery. So the line reported
> `1/1 ready` on **zero units**, `allReceived` went true, and the drawer's ladder answered
> `ready` — *goods secured* — for an order with no goods. **In a test that wasted a day; in
> production that is an order told it can be delivered.** Filed as **D9 🔴** with its live
> exposure named as the open question. **Not fixed by S2.0** — it reaches Stock and Purchasing,
> and that card's mandate was the tests. **It is fixed now; the two blocks below are the
> measurement and the build.**
>
> ### 🔴🔴 THE OPEN QUESTION IS ANSWERED. D9 IS LIVE, AND IT IS 1 IN 6 ORDERS.
> **Measured on production 2026-08-08** by replaying `lineCategory()`'s exact branches in SQL
> over every line of every non-cancelled order:
> ```
> live orders                                              77
> orders touching a MISREAD sku                            17
> orders whose EVERY line classifies as `acc`              12   ← 16% of the register
> misread lines                                            36
> ```
> **Those twelve orders can never fail a stock check.** Every line reads as an accessory, §7
> says an accessory never blocks delivery, so the ladder answers *goods secured* without ever
> asking the warehouse. **The build chat's guess that canonical SKUs are safe was right and
> beside the point — the damage is in the free-text ones, and they are the majority of the
> sofa book.**
>
> **What is being misread, verbatim from production:**
> ```
> SOFA MODULES read as accessories — 10 skus
>   5539-1A(LHF) · 5539-1B(LHF) · 5539-2A(RHF) · 5539-2B(LHF) · 5539-CNR ·
>   5539-L(RHF) · 5539-STOOL · LYYAR-1A(LHF) · LYYAR-1A(RHF) · TELLUC-1S
>   (LHF/RHF = left/right hand facing · CNR = corner. These are the SAME
>    strings Purchasing prints on live POs — PO-2031 carries `5539-2A(RHF)`.)
>
> MATTRESS-SHAPED read as accessories — 3 skus
>   M1201F-K · N1001S-Q · GRT-MATTRESS-15Y
>   `M1401F-K` IS classified mattress because the list holds `m140`.
>   `M1201F-K` is one digit away and falls through. One product family,
>   two answers.
> ```
> **THE CAUSE IS THE SHAPE OF THE RULE, NOT A MISSING ENTRY.** `lineCategory()` ends in
> `return "acc"` — an unknown SKU is silently declared an accessory, and an accessory is
> declared safe. **The default is the most dangerous of the four answers.** Adding `5539` and
> `lyyar` to the keyword list fixes today's twelve orders and rebuilds the trap for the next
> model Ohana names. **D9 had to decide what an UNRECOGNISED sku is allowed to claim** — and
> *"it does not block delivery"* could not be it. **It now claims nothing.**
>
> **Bounded honestly:** `CLAUDE.md` §6 rules every live row is TEST data, so 12/77 is evidence
> about the CODE, never about business volume. **It is not evidence about severity, which is
> the same at any volume.** Re-run the query at go-live.
>
> ## ✅ D9 · SHIPPED 2026-08-08 — an unrecognised SKU no longer claims it is safe to deliver
>
> **Live on `a7daf937`** — web bundle `index-CTbZKTLN.js` across all four canonicals, Worker
> version `fa58a642`. **The Worker was owed even though D9 changed no `apps/api` file**:
> `order-control.ts` imports `bookingConfirmGate`, and the gate's answer moved. Deploy proof in
> [`ENGINEERING.md`](../ENGINEERING.md) §9.
>
> **The headline number, re-measured before the build and again after it:**
> ```
>                                                    before      after
> live orders                                            77         77
> orders that could NEVER fail a stock check             20   →       0
> lines answering `acc` because nothing recognised them  45   →       0
> lines re-classified into anything OTHER than unknown         →      0
> ```
> **The last row is the one that says the fix is safe.** Not one line was promoted into a new
> category. Everything the rule already recognised answers exactly what it answered yesterday;
> the ONLY thing that changed is that a line nothing recognised stopped calling itself an
> accessory. The card's own 77 / 17 / 12 / 36 replicated to the digit — the counts were re-run,
> not inherited.
>
> ### THE FIX IS A SHAPE, NOT A KEYWORD
> `5539` and `lyyar` were deliberately **not** added. Adding them clears twelve orders and
> rebuilds the same trap for the next model Ohana names — and the classifier mirrors the
> server's `resolve_demand_category` (0148) verbatim, so a keyword may not move on one side
> alone. The defect was never a missing entry. It was **one word carrying two facts**: `acc`
> meant both *"this is an accessory"* and *"I do not recognise this"*, and §7 rules the first
> one safe.
>
> ```
> lineClass(sku)   mattress · bedframe · sofa · acc · UNKNOWN
>                  `acc` is now EARNED by an accessory word. Nothing reaches it
>                  by elimination. The fallthrough is `unknown`, which is
>                  §2.5's third state — it raises nothing and claims nothing.
> ```
>
> **Where the third state actually bites, because a type nobody reads is not a fix:**
> - `lineReadiness` — the `acc ⇒ always reserved` shortcut is now spent only on a RECOGNISED
>   accessory. `unknown` is checked **last**, so it yields to every piece of real evidence
>   (units reserved to the SO · free matching stock · an open PO) and only ever replaces the
>   bare guess. It is deliberately **not** `no_po` — *"nobody ordered it"* is a claim about a
>   thing you can name, and the action here is to say what the line is, not to raise a PO.
> - `bookingConfirmGate` — a groupless line used to be walked past, and an unrecognised line
>   WAS a groupless line. It now collects `unknownSkus`, `goodsReady` goes false while any
>   survive, and they are repeated into `notReadySkus` so the 422 an operator already reads
>   names them instead of going silent. **A fully-reserved bed set is held back by one
>   unplaceable line riding along**, and `splitAvailable` goes false — there is no honest
>   answer to *"which trip does this go on"* for a thing nobody can classify.
> - `importAccessoryKind` — an unrecognised SKU is no longer forecast as a container of pillows.
>
> **Three ownership facts kept the blast radius honest.** `deliveryGroupOf` still returns `null`
> for both a pillow and an unknown line, so `null` now means two different things — the module
> exports `isOutsideTheTrip` and `isUnknownGood` to tell them apart, and a bare `null` may never
> again be read as "harmless". `lineCategory` was NOT widened: two screens group their rows by
> it, and both are files this card was forbidden to touch, so it survives as a documented
> three-answer VIEW of `lineClass` that folds `unknown` into `acc`. Every SAFETY reader was moved
> to `lineClass`.
>
> **What that fold still costs, stated rather than hidden:** an unrecognised sofa module still
> prints under the `Accessory` header in the drawer and in the list's items chip. **The label is
> still wrong. The claim is not** — nothing reachable from that fold can call goods ready.
>
> ### 🟡 THE TWO FOLLOW-UPS THIS CARD REFUSED TO FAKE
> 1. **Delete `lineCategory`.** Move `OperationOrdersControl.tsx:1542` and the drawer's
>    `groupCatOf` (`OrderDetailDrawer.tsx:3506`) onto `lineClass`, give `unknown` its own header
>    and its own pill word. Today an unknown line renders `No PO` — true, but not the sentence
>    the operator needs. **Blocked only by file ownership, not by design.**
> 2. **Name the sixteen SKUs** — 10 Ohana sofa modules, 3 mattress-shaped, and the rest. This is
>    a Purchasing/Stock card, not an Orders one: the keyword list and migration 0148 must move
>    together, and until they do those lines correctly read `unknown` rather than incorrectly
>    reading safe. **`M1401F-K` classifies and `M1201F-K` does not — one product family, one
>    digit, two answers**, and that is the argument for a catalog lookup instead of a longer
>    regex.
>
> **PROPOSAL, NOT LAW — and its falsifier.** *An unrecognised good must block, while unknown
> MONEY does not* (§8: "unknown warns, never blocks"). The asymmetry is deliberate: unknown money
> is a number nobody entered, and holding a customer's goods over our own missing data entry
> punishes the customer for our gap. An unknown good is a physical object that has to be on the
> truck. **This is overturned the day an operator is blocked on a line that turns out to be a
> genuine accessory** — the observable event is an order stuck at `unknown` whose line, once
> named, classifies as `acc`. Follow-up 2 is what closes that, and `Leg 4"` (1 live line) is the
> candidate to watch.

### ✅ S2.1 · SHIPPED 2026-08-08 — the operator sorts, and the third click gives the risk order back

**Eight of the nine columns sort. The cycle is 2990's** — `asc ⇄ desc ⇄ OFF`, and **`OFF` is not
"no sort", it is `compareBySlack`**, so §2.3's frozen row order is one click away and is never
something an operator has to rebuild by hand. **The sort runs on `visible`, never on the 30
rendered rows** — sorting a window shuffles the rows already on screen and silently claims to
have ordered 65; a test pins it with the smallest value deliberately placed outside the window.

**The division of labour is Carres', not 2990's, and the card said so before the build.** 2990
sorts inside its grid; `kit/DataTable` rules *"the PAGE sorts the rows; the kit only shows the
arrow"*. So **2990's COMPARATOR** (`DataGrid.tsx:689-699` — numeric when both sides are numbers,
`localeCompare` otherwise, **blanks LAST in both directions**) lives in the page, one sort value
per column, and **nothing about sorting moved into the kit.** The default order is applied first
and `Array.prototype.sort` is stable, so **`compareBySlack` survives inside every tie.**

**THREE RULES, and every column obeys one:**
```
a WORD   sorts A → Z          Order · Customer · PIC · Actions
a STATE  sorts WORST FIRST    Status · Deadline · Stock · Delivery — so the FIRST
                              click never buries the work at the bottom
a BLANK  sorts LAST in BOTH directions — Excel's rule, and 2990 spells it too
                              (`(a || '~')`, `:682`). Without it, ascending
                              `Deadline` opens on every undated order there is.
```
**A rank is never typed twice:** the stage rank IS `TABS`, the stock rank IS `STOCK_BUCKETS`
(Law D — a derived fact has ONE arithmetic). **A TBD date sorts with the blanks**, because it is
no date, not a late one.

### ✅ S2.5 · SHIPPED 2026-08-08 — the expansion, and the label was a different column than the card thought

**The list can now answer *what did they buy* without losing itself.** The drawer *"renders IN
PLACE of the list, not as an overlay"*, and the Items column was removed from this table
entirely (`itemRollup` survives only in the CSV/print export) — so until this card there was
**no answer to R4 on this screen at all**. Expand is the one grid power that buys something the
drawer structurally cannot.

**IT COST NO BUSINESS COLUMN ANYTHING, AND THAT IS THE WHOLE REASON IT COULD RUN.** #692 blocked
it on a number: the chevron is a third gutter at **3%** of a percentage-sized table, −24 to −28px
taken off the eight business columns with `Actions` worst. S3.1 made every column a measured
PIXEL, where the kit fixes that gutter at a flat **42px**; S3.2 freed exactly **42px** off the ⚑.
**Measured in Chromium at 1130px — Loo's own regression width — after the change:**

```
expand      42.0    select    32.0    ⚑ Follow-up  30.0
Status     139.0    Order     87.0    Customer    189.0    Deadline  154.0
Stock       54.0    Delivery 160.0    PIC          58.0    Actions   331.0
                                              table 1276px in a 1130px viewport → scrolls
```

**Every business width is byte-identical to S3.3's.** The width test asserts the gutter and the
eight together, so the trade cannot be silently un-paid later.

### ⭐ THE OPEN ITEM: `variant` WAS THE WRONG COLUMN, AND `description` WAS ALREADY ON THE WIRE

**#692 flagged one thing to settle first — `order_lines` carries `{ sku, qty, unit_price }` with
no description, R4 requires *"human words, not codes"*, and it named the catalog's `variant` as
the human label. Measured on production, `variant` carries no human word at all.** It is a SIZE
or a MODULE CODE:

```
sku            variant     product_skus.description
B1201S-K       King        Mattress B1201S 183X190CM
CODY-Q         Queen       Bedframe Cody 152X190CM
5539-CNR       CNR         Sofa Booqit CNR
5539-2A(RHF)   2A(RHF)     Sofa Booqit 2A(RHF)
```

**`description` is the label.** 209/209 filled, equal to neither the sku nor `name + variant` on
any row, and the only field carrying R4's three parts at once — the noun (*what it is*), the
model, and the spec (*the physical size*). **This is S3.3's lesson a second time: the method was
right and the column was wrong.** C14 measured the wrong string; #692 named the wrong field.

**It cost no fetch, no route and no migration.** The API already generates it for bed sizes and
the catalog admin may type it (`catalog.ts:754`); it already rides `GET /api/catalog` through
`productSkuFromRow`; and this page **already** called `useCatalog()` for the SUPPLIER facet. The
whole change is three fields on a map that existed.

### THE FALLBACK IS A WHOLE POPULATION, NOT AN EDGE — AND IT IS NOT A DEGRADATION

**Measured 2026-08-08 over 184 live lines. The split is by SOURCE, not by chance:**

```
source        orders   lines   matched a catalog row
autocount         37      94     0      ← none. not "some".
native (POS)      32      82    81
rental             8       8     8
```

**Zero of 94.** A fallback that shrugged would blank half the list. It does not have to:
**the AutoCount "SKU" IS free text a human typed** — `Breeze FirmCare-B1201F-Q` · `Essential
Memory Pillow(L)` · `Mattress Disposal` · `No Lift Per Floor Charge` — and on that population it
is frequently MORE human than a catalog label would be. **So it is printed verbatim, and the
card's instruction *"do not invent a name"* is obeyed literally**: nothing is composed out of
`lineClass` + `lineSize` to dress a line the record cannot name. When nothing is known, the
string that IS there is what is shown.

> **FALSIFIER, and it already has one instance.** A NATIVE line whose sku has no catalog row
> prints a bare code with no human word in it. Live today: **1 of 82** — `M1201F-K`, and no
> `M1201F%` sku exists at all, so it is a deleted-catalog artefact of the trial data §6 throws
> away at go-live. **If a second appears from the POS path, the fallback stops being cosmetic
> and `order_lines` must store the description AT SALE** — a line should not be renamed by a
> later catalog edit anyway.

### WHAT WAS COPIED FROM 2990, AND THE THREE THINGS THAT WERE NOT

**The SHAPE is 2990's** — the expand is the record's line items, every caller, no exceptions
(`MfgSalesOrdersList.tsx:574`). Three of its parts were left behind, each for a stated reason:

| 2990 has | Carres does not | Why |
|---|---|---|
| `UNIT COST · LINE COST · MARGIN` | — | §4 **R5: never cost, never margin.** A test asserts no money word reaches the panel. |
| a fetch, with loading + error states | — | `order_lines` is already embedded in the list response the row was drawn from. **A state that cannot occur does not get a branch.** |
| a full grid — sort, group, resize, persisted layout | — | Measured: **77 orders hold 1–8 lines, median 2**; only 3 carry more than five. A configurable grid over two rows is furniture, and F61 forbids persisting a layout. |

**Nor does it carry stock, PO or GRN state.** R4 *"proves nothing"*; the row's own `Stock` and
`Actions` cells already answer that, and a second home for one fact is ownership Law C.

**No de-duplication and no rollup.** Two lines of the same SKU is what AutoCount booked (one live
order carries `Essential Memory Pillow(L)` twice) and merging them would show a record that does
not exist — so the panel keys by INDEX, not by sku. `itemTags` stays where it is: it answers
*what kind of goods* in one line for the CSV and **cannot** answer *which mattress*, which is the
question R4 opens on.

**The control's word is `Show items in SO-1221`** — the operator's own name for the row, the same
reason `selection.rowLabel` exists. `aria-expanded` carries open/closed, so the word never flips.
An order with no lines gets **no control at all**, which is the kit's own rule rather than a dead
chevron. Nothing is remembered across a remount (§0.4).

> 🟡 **FOUND IN PASSING, NOT FIXED HERE — the drawer's Items panel keys its rows by `l.sku`**
> (`OrderDetailDrawer.tsx:3327`), and a sku is NOT unique within an order. Two real lines collapse
> to one React child on exactly the live order above. **The drawer is DO-NOT-TOUCH for every S2
> card**, so it is recorded rather than taken; it is one word (`key={i}`) whenever a card owns
> that file.

### ✅ S2.3 · SHIPPED 2026-08-08 — the footer total, and it counts the LIST, not the window

**The strip states the money this view is owed** — one spanned sentence pinned under the last
row the way the head is pinned over the first:

```
Total · RM 1,234,567.00 outstanding · 12 not priced
```

**THE CARD WAS RIGHT THAT 2990 HAS NOTHING TO COPY, and the source change needed no approval.**
Re-verified: `tfoot` · `totalRow` · `footerTotal` · `sumRow` return two hits in 1,551 lines and
both are `totalRows`, a GROUP's row count. So this is **Carres' own kit** (`DataTable.totals`,
D0.5d power 4) **and To Order's live usage of it** (T1, 2026-08-06) — the spanned-`cells` shape,
because *"a total that reads as a sentence rather than a digit marooned under one column"* is
exactly this table's problem: **Orders has no money column** for a per-column aggregate to land
under.

### ⛔ THE DEFECT THIS CAPABILITY INVITES, AND THE ONE THING THAT HAD TO BE DESIGNED AROUND

**The kit hands `totals.cells(rows)` exactly what it RENDERED, and this page renders a 30-row
window.** Summing that argument prints the total of thirty orders under a footer band that says
`30 of 65` one line below — **and the number climbs as the operator scrolls.**

**The argument is therefore deliberately unused**; the sum closes over `visible`, the whole
filtered list. **This is the same defect S2.1 had to design around for the sort, arriving
through a different door** — and it is the second time on this card that the kit's convenience
argument was the wrong set of rows.

**Proved by a NEGATIVE CONTROL, not by assertion.** With the implementation switched to sum the
callback's argument, the test reports `RM 3,000.00` where the truth is `RM 3,500.00` — 30 rows
of a 35-row list. Restored, it reads 3,500.

### WHAT IT STATES, AND EACH HALF IS A DECISION

- **The money, not the count.** The footer band already prints `{total} orders` two lines down,
  and §3's frozen rule is that nothing on this list says the same thing twice. **Nothing on
  screen states the money for the CURRENT view** — the `Owing` rail row carries a total, but
  that is one fixed queue over every order, not what these filters left. Money is also what a
  footer totals in the tool the team already uses.
- **What it could NOT price, out loud.** `orderMoney` answers `unknown` when an order has
  neither priced lines nor a keyed balance, and §4's rule is ***"not priced", never RM 0***. A
  sum that silently skipped those would be a smaller number wearing a complete number's
  clothes. The caveat renders only when there is one.
- **`fmtMoney` spells the figure**, asserted by identity — never a hand-rolled `RM ${n}` that
  would pass every other test and diverge the day the shared format changes.
- **It does not draw over an empty view.** The kit already withholds it while loading or empty:
  a totals strip over no rows states a total of nothing.

**MEASURED IN CHROMIUM AT FOUR WIDTHS**, on the longest sentence the strip can ever hold (a
seven-figure sum plus the caveat, 320px):

```
table width          1022      890      850      700
td content box      963.2    836.9    798.6    655.0
sentence                320      320      320      320   ← one line at every width
spare                +643     +517     +479     +335
```

`colspan` **9**, the foot's cells sum to the table width to the pixel at every width, the row is
**40px** — the head's own height — and it is `position: sticky`. **No wrap, no horizontal
scroll.**

> 🟡 **REPORTED — the strip costs 40px of PERMANENT height**, so §3's measured *"16 fully
> visible rows"* at 1440×900 becomes 15. That is the honest price of an always-on total, and
> AutoCount pays it too. Recorded here so the next card that counts visible rows starts from 15
> rather than re-deriving 16 from a stale line.

### ✅ S2.2 · SHIPPED 2026-08-08 — the header ▼, on the four columns where it is a DOOR and not a second home

**FOUR columns filter from their header. Four deliberately do not, and that split is this
module's own frozen rule doing its job**, not a shortcut:

> **Nothing on the list says the same thing twice.** … `Overdue` has exactly ONE home
> (the QUEUES rail).

2990 puts a funnel on **every** column (`DataGrid.tsx:342-345`, Commander 2026-05-29 —
*"没有 drop-down 菜单让我去做选择"*), and the kit already renders the popover Jess approved on
2026-08-01. What could not be copied wholesale is WHICH columns, because **almost every column
here already has a rail facet.** So the test is not *does 2990 have a ▼* — it is **does this ▼
create a second FILTER, or a second DOOR onto the one that exists**:

```
order      no rail facet             →  the ▼ owns its own state      WIRED
customer   no rail facet             →  the ▼ owns its own state      WIRED
deadline   DEADLINE   Set<DueBucket> →  the ▼ WRITES THE RAIL'S SET   WIRED
delivery   LOGISTICS  Set<string>    →  the ▼ WRITES THE RAIL'S SET   WIRED
──────────────────────────────────────────────────────────────────────────
dots       the stage TABS own it     →  a THIRD home for the stage    NOT WIRED
stock      stockFilter  — SINGLE-select
pic        staffFilter  — SINGLE-select
next       nextFilter   — SINGLE-select                               NOT WIRED
```

**`Deadline` and `Delivery` do not keep a set of their own.** Ticking `Due ≤3d` in the header
is the same act as clicking it in the rail; clearing either clears both. **One truth, two
doors** — the architecture's Law C is about two RECORDS, not two surfaces onto one. A test
asserts it **in both directions**, which is the only way to tell that apart from two states
that merely agree today.

**THE CASCADE IS EXCEL'S, AND TO ORDER ALREADY SHIPPED IT.** Each ▼ lists the values that
survive every OTHER narrowing, so an option a menu offers is an option that can return a row.
**With one correction the rule needs:** a column's ▼ is computed with **its own filter LIFTED**.
Filter it by itself and ticking one value makes every other value vanish — no way back except
Clear. Pinned by its own test.

> ### ⛔ THE LAST THREE ARE A CARD BOUNDARY, NOT A JUDGEMENT
>
> `stockFilter` · `staffFilter` · `nextFilter` are `T | null` — clicking a second PIC in the
> rail REPLACES the first. The kit's ▼ is a multi-select checklist, so wiring it to those three
> means **widening them to sets, and that changes what the RAIL does.** The S2 card is explicit:
> *"DO NOT TOUCH Queues … Only rendering behaviour INSIDE the grid changes."* Widening a rail
> facet from single to multi-select is not rendering behaviour inside the grid — and three of
> the four are QUEUES rows by name.
>
> **Whether an operator may hold two PICs or two stock states at once is a real question with a
> real answer, and it belongs to the card that owns the rail** — not to a grid-wiring card that
> would answer it as a side effect.

**MEASURED IN CHROMIUM AT FOUR WIDTHS, and the fourth is there because of `8340b0f0`** — the
S1 regression Loo caught at ~1130px, whose lesson was *"re-measure at ≤1130px before calling any
width safe."* The ▼ button is **24px**. The header row stays **40px** and every label stays on
**one line** at all four:

```
table width   1022 (nav collapsed)   890 (~1130px viewport)   850 (nav expanded)   700
order            fits, 3.4 spare        +7.0 into padding      +10.2  ▼ 2px clipped   +22.2 ✂
customer         fits, 13.1 spare       +1.7 into padding      +6.2   fits inside     +23.0 ✂
deadline         fits, 62.6 spare       fits                   fits                   fits
delivery         fits, 30.8 spare       fits                   fits                   +8.6  ✂
```

**At the width Loo actually reported the ▼ fits** — the spill at 890px is into the `th`'s own
8px padding, not past its border. `Order` is the tightest column and the first that would lose
its ▼ if anything else joined the header.

> 🟡 **REPORTED, NOT FIXED — below ~800px the `Order` ▼ is clipped by its neighbour.** Same
> class as S2.1's `Stock` arrow: the label stays whole, the control is what gets overpainted.
> **It is not fixed here because the fix is a WIDTH**, and `8340b0f0` already rules widths out
> of S2 (*"S2 wires grid powers and changes no width"*). It joins that card's list.

### ⛔ ⚑ `Follow-up` DOES NOT SORT, AND ONLY A REAL BROWSER COULD SAY SO

**Measured in Chromium, both nav states, with the arrow actually in the DOM** — a sortable
header renders its chevron only on hover or once sorted, so measuring the resting header proves
nothing. The harness renders the real `kit/DataTable` at the two live table widths and
reproduces C14's columns to the digit at 1022px.

```
column      content box        label      verdict
            850 / 1022 px    + arrow
Follow-up    56.0   56.6       68.4     WRAPS "Follow-" / "up" — at BOTH widths
Stock        28.1   37.9       46.0     arrow 17.9 / 8.1 past the content box
PIC          32.5   43.3       34.0     0.2–1.6 over at 850, absorbed by the padding
Order        45.8   59.4       46.0     — and both stay on ONE line
Status · Customer · Deadline · Delivery · Actions   fit at both widths
```

**`Follow-up` is the one label on this table with a HYPHEN, and a hyphen is a break
opportunity** — which is why being over the content box is not on its own the test. `Stock`,
`PIC` and `Order` are all over it at 850px and every one stays on one line: a single word with
no break opportunity can only overflow. **S1 shipped that wrap once and pinned 72px to stop it;
sorting the column would hand back the pixel S1 paid for.** Nothing is lost — the QUEUES rail
already carries `Follow-up` and `For manager review` as FILTERS, and **a filter beats a sort for
*show me my flags*: it removes the other rows instead of stacking them underneath.**

> 🟡 **REPORTED, NOT FIXED — `Stock` loses its arrow at ONE of the two widths.** With the nav
> EXPANDED the arrow runs 9.9px past the column's border and `Delivery`'s header background
> paints over it; with the nav COLLAPSED it lands flush against the rule, tight but whole.
> **Kept sortable on purpose:** the rows visibly reorder and `aria-sort` is correct for a screen
> reader, and the alternative is losing worst-first stock ordering over 9 pixels at one window
> size. There is no cheap width to take them from — C14 sized every column to its CELLS.

**Measured, not asserted:** every design-guard rule is byte-identical to `d0cede0c` with and
without this change — **no guard rule rose.** `tsc` clean, `v4-guard` clean, the page's suite
**165 passing**.

> 🔴 **AND THE WEB SUITE WAS ALREADY RED BEFORE THIS CARD OPENED.** 16 failures across
> `OperationOrders.test.tsx` (7) · `OhanaSofaTab` (4) · `NiceFutureMattressTab` (1) ·
> `OrderCustomerCard` (4), **reproduced on a clean `d0cede0c` checkout — identical set, identical
> count.** They are stale tests asserting UI their components no longer render (`OrderCustomerCard`
> looks for an `Edit` button on a card that is now read-only rows, which may be §4's *"the right
> panel does not edit"* landing correctly and the test never following). **Not fixed here** —
> the S2 card names the drawer and business rules as DO NOT TOUCH, and deciding which side is
> out of date is a card, not a line. **A red suite on main means every future card starts unable
> to tell its own failures from the inherited ones.**

### API + DATA
`GET /api/operation/orders` is the single source of stage derivation — the control table is the
kanban-as-table, so stage logic lives in one place. `ops_order_control` carries the operational
columns. **Cancelled orders are excluded server-side**, so `All` means every LIVE order.

### FROZEN RULES
- **The AutoCount archive is excluded from WORK, never hidden from the record.** `liveScope`
  drops `source_system='autocount'` from every queue, group and tile, and a facet click drops
  them from the table — but with NO facet engaged they stay visible, openable and searchable.
  **A facet may never print a number its own click cannot produce.**
- **Nothing on the list says the same thing twice.** The `Delivery` cell never repeats the
  sentence `Actions` already carries; `Overdue` has exactly ONE home (the QUEUES rail);
  a LOGISTICS row counting zero is not rendered — **but `Khor Yee · pending 0` stays, because a
  person on the roster is not a filter statistic.**
- **Every money figure is `fmtMoney` from `packages/shared/src/money-format.ts`.** One spelling,
  asserted by identity, never by two implementations agreeing.
- **The stage pill and the dots sit side by side.** The pill says WHERE the order is; the dots
  say WHICH PART has trouble.

---

# §4 · The order drawer

### MISSION
Everything about one order, in the order a human's brain asks for it.

### WORKFLOW — the six questions, and the order is the point

**~80% of openings end at step ②.** Every step must finish its job ALONE, and **three different
people enter at three different steps** — so the six are an order you may ENTER AT ANY POINT,
not a path you must walk.

```
①  Whose order is this? Does it concern me?
②  What do I have to do now?          ← 80% stop here
③  Why?
④  What did they buy?
⑤  Is there a money problem?
⑥  What has happened?
```

**One tension, ruled rather than left to layout:** money is step ⑤ when READING (催钱前先看货)
and the FIRST SECOND when SPEAKING — so the figure travels independently of the step that
explains it.

### THE LAYOUT LAW — L1 to L4, frozen 2026-07-28

**L1 — six REGIONS OF RESPONSIBILITY** (not places). Each carries a contract, and **the
"does NOT answer" half is the load-bearing one**:

**R1 · Identification** — *whose order is this, does it concern me?*
Done when ONE plain sentence carries both halves: whose (customer · the Ref they recognise · the
date we promised) and my role. Fed by identity, the promised date **as identification only,
never as a judgement**, and the outstanding figure as a persistent fact resident here.
**Never judges urgency and never chases.** One exception: a missing building type is handed to
R2 as WORK, because it blocks a booking. No date → *"date not set"*; no prices → **"not priced",
never RM 0.** **Never absent — all three readers enter here.**

**R2 · The work** — *what do I have to do now?*
Done when EVERY open item is listed, each saying what · with whom · by when. Fed by the actions,
the verdict (how late → order and tone) and the DOOR that closes each item, which travels with
it. **It never asks the reader to work out what to do** — the engine computed it, and making a
human re-derive it wastes the computation. **When empty it must SAY SO plainly: silence is a
failure**, because a blank reads as *"I have missed something."* **Never absent.**
**Records do NOT feed this region** — the engine reads the same stored signal and raises the
action itself. **There are ZERO cross-region channels.**

**R3 · Explanation** — *why?*
Done when there are **THREE INDEPENDENT ANSWERS — goods · delivery · money, one line each, and
they may never be merged into one summary.** Fed by commitment ⟷ reality subtracted per track.
**It never tells anybody to do anything**, and it does not lay out evidence — PO numbers, unit
identifiers and working-day arithmetic are the SECOND sentence, not the answer. **A track that
is fine does not explain itself**, and when nothing is wrong on any track **the region does not
draw at all**: a block that says *"nothing is wrong"* spends height to say nothing. Unknown IS
an answer — *"the factory has not given a date."*

**R4 · Contents** — *what did they buy?*
What · how many · which spec, **in human words, not codes.** It proves nothing. **Its normal
state is UNREAD, and that is correct, not failure** — three things trigger it: the customer is
asking · goods must be counted for a PO or a delivery document · R3 did not add up.

**R5 · Money** — *the EXPLANATION half of the money question.*
What was collected · how storage accrued · whether the due date passed · whether a manager
released it. **It does NOT answer the figure itself** — that is a persistent fact resident in
R1, because the SPEAKING order needs it before the READING order arrives. **Never cost, never
margin.** **Half of it cannot be built today**: the payment breakdown reads a ledger with no
reader and can contradict the figure, so until that is fixed it states only what can be computed
exactly.

**R6 · Record** — *what has happened?*
Who · when · what they did, in time order, **with what was said kept verbatim — plus what is
missing.** It records what a PERSON did, never the system's own bookkeeping. **It produces a
SIGNAL and stops**; the engine decides whether that signal is work. Documents have **three**
states: exists · cannot exist yet (**renders nothing**) · should exist by now (says *missing*).
**What is empty does not appear at all.**

**Progress is a VIEW of R2, not a region.**

**Three things are deliberately NOT regions and never may be:** Evidence · Doors · an overall
status.

**L2 — information depth.** Four depths; every region is placed on one; three depth rules cross
regions.

**L3 — states.** **Two states, not five**, and **states are never stored and never reach the
screen.** `Unknown` is an ATTRIBUTE, not a state.

**L4 — the slot contract.** Six slots. **The shell never receives a state.** `DetailShell` has
no `state` prop and never may have — seven constraints are enforced as TYPES, checked by `tsc`,
not by the test runner. **`ProgressSlot` carries no events, actor, timestamp, KPI or actions**,
so *"Progress carries no buttons"* is a type rather than a hope.

**Persistent Facts is RESERVED, not law.** A persistent Outstanding would turn R1 into
Header-Everything, because *"you need it in the first second of a call"* is equally true of four
other facts — convenience is a gradient and gradients do not hold. **It is an independent
concept, not a member of any region**, and its admission test admits no new member today.

**Gap is RESERVED, not built**, with its upgrade trigger written down.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/components/OrderDetailDrawer.tsx`, **7,717 lines** ·
***measured 2026-08-06 — read STRUCTURALLY, not line by line***: its tab union, all 44 panel
titles, its two-column shell, every hook it calls and every endpoint it writes were read; the
individual panel bodies were not. **It is the largest file in the web app and nobody has read
it end to end, including this audit.**

**It renders IN PLACE of the list**, not as an overlay — the sidebar and right rail stay.
`‹ n of m ›` steps through the SAME filtered, sorted list the table shows.

```
FULL-WIDTH BAND    save bar (renders nothing until something is edited)
                   the journey strip · the OPEN ACTION LIST with its C6 checklists
                   the Delay-planning FORM — only while the ladder has that action open
                   the operator's own free-text note

LEFT 280px         ① Identity          CustomerIdentityCard
(collapses to 56)  ② Current Action    CallsPanel        — ALWAYS visible, never hidden
                   ③ Current Issues    CurrentIssuesPanel — renders NOTHING when healthy
                   ④ Progress          JourneyCard (the spine)
                   ⑤ the section rail  Loan · Documents · [Cases] · Activity

RIGHT              the selected tab owns the whole column
```

**EIGHT tabs, and FOUR of them live on the SPINE, not the rail** — `items · delivery ·
balance · storage` are spine steps; `loan · documents · cases · activity` are the rail's
utilities. **`Cases` is the only tab that comes and goes**: an order with no case shows
nothing, because a permanent tab reading `0` on every clean order is the empty box the law
forbids.

**Sub-components measured:** `OrderJourneyHeader` 420 · `OrderDocuments` 303 ·
`DelayPlanningPanel` 132 · `BookingSpine` 69 · `CustomerIdentityCard` · `CallsPanel` ·
`CurrentIssuesPanel` · `JourneyCard` · `MoneyCard` · `StorageCard` · `PaymentForm` ·
`BookingBlock` · `PartnerRulesEditor` · `DeliveryPhotoRow` · `ReceiveLineModal` ·
`LoanSofaModal` · `ActionsMenu`.

### WHAT THE DRAWER WRITES — the full list, and it crosses four modules

| Hook | Endpoint | Whose record |
|---|---|---|
| `useSaveOrderControl` | `PUT /operation/orders/:id/control` | Orders |
| `useUpdateOrder` · change requests | `/orders/:id/...` | Orders |
| `useRecordPayment` · `useVoidPayment` | `/operation/orders/:id/payments` | **Payment** |
| `useConfirmBooking` | `/operation/orders/:id/booking/confirm` | **Delivery** |
| `useIssueDeliveryOrder` | `/operation/orders/:id/delivery-order` | **Delivery** |
| `useUploadDeliveryPhoto` · `useDeliveryPhotos` | delivery photos | **Delivery** |
| `useSetPartnerDeliveryRules` | partner rules | **Delivery / carrier config** |
| `/api/ops/stock/release` · reserve picker | stock register | **Stock** |
| `useLoanSofa` | `/operation/orders/:id/loan-sofa` | **Stock** |
| `useRecheckStockMutation` | re-derives readiness | Stock (read) |

> ✅ **D2, 2026-08-06 — the third receiving door is GONE.** `useReceiveLine` and
> `POST /operation/orders/:id/receive-line` are **deleted**, with the modal and its suite.
> It booked units into the stock register and stamped `line_received` **without opening a
> Receiving Session** — no `warehouse_receipts` row, no `receiving_events` entry, and it never
> moved `purchase_order_lines.received_qty`. **That is a second RECORD of one act, not a second
> door onto it.** Measured before removal: **used zero times** (`line_received` empty on all 65
> control rows, 0 units reserved to an SO) while the Receiving Workspace had posted 3 sessions.
> **The route was deleted rather than left unrendered** — Purchasing's own C1 ruling: *a live
> route with no caller is a bypass one curl away.* The received count STAYS on the Items tab as
> a FACT; the hand-over is the PO row's existing `Check in` link.

**The drawer is NOT migrated to `DetailShell`, and that is a RULING, not a gap.** L4 requires a
4-tuple of persistent facts; on the live drawer those four sit in four different blocks, and the
header carries the ruling *"ZERO order data here — the identity lives in the Customer card
below."* Rendering it through the shell would create a facts strip that does not exist —
a visual change, permanent height, and a reversal of a frozen ruling.

### FROZEN RULES
- **The action engine is the ONLY source of actions.** Everything else produces SIGNALS. An
  action born elsewhere has no due, no owner and no measured completion.
- **A Follow-up is NOT an Action**, and the two may never share a list.
- **"Missing" splits in two:** a human can fix it → an action. Nobody can fix it → a fact, and
  a defect. Never a task.
- **The right panel does not edit.** One editing surface per fact.
- **The drawer's action list is built from the SAME call as the row's pill**, so its first row
  IS that pill structurally, not by careful agreement.

---

# §5 · Goods on an order

### MISSION
Know whether the goods this customer is waiting for are secured, and chase the factory when
they are not.

### WORKFLOW

**`Issue PO to {supplier}`** — **defined ONCE, in
[`../purchasing/MASTER.md`](../purchasing/MASTER.md) §3. Orders DISPLAYS it; it never re-states
it.** Task owner: the PO-duty holder.

**`Call {supplier} — confirm ready date`**
- **Trigger** — ready date missing · due for re-confirmation · passed with no goods in · later
  than the customer's date · changed by the supplier.
- **Checklist** — production status · ready date · ready quantity · any delayed item · record
  the latest ready date · record the outcome.
- **Completion** — the latest ready date AND the outcome are recorded.
- **Due** — red once inside the arrival window. **The window and every number in it are owned
  by [`../purchasing/MASTER.md`](../purchasing/MASTER.md) §2.3.**
  `arrival window = customer date − production working days − order-by buffer`.

**Supplier exception** — goods short, damaged or wrong. One shared vocabulary:

```
Receiving Exception Created → Call {supplier} — confirm what happens next
    → Waiting Supplier Reply → Waiting Goods Arrival → Goods Received → Exception Closed
                             ↘ Supplier Cannot Fulfil → Case Owner Decision Required
```

**`Case Owner Decision Required`** is the one action that is never delegated.
**If either outcome pushes the goods past the promised date it does not invent a second customer
conversation — it opens §6 stage 1.**

### FROZEN RULES
- **A held unit is not "on the way."** A damaged unit becomes `on_hold` and stops counting as
  future supply (0299), or the planner keeps believing goods are coming that never will.
- **Orders never re-states a Purchasing number.** Production days, the buffer and the PO days
  have one home.

### 5.1 · ✅ THE LIST SEES PURCHASING'S PURCHASE ORDERS — fixed by D1, 2026-08-06

**"Has anything been ordered?" has TWO sources and the list now reads both**, through ONE
helper (`orderHasPurchaseOrder`) that the Stock cell and the drawer's journey strip share, so
they can never answer it differently again:

```
order_lines.source_po     the AutoCount importer's PO
po_skus                   the SKUs a REAL purchase order covers, linked the drawer's own
                          way — purchase_orders.so OR so_refs[] — batched over the page
```

**What it was before, and why it is written down rather than forgotten.** The only evidence on
the wire was `source_po`, a column **only the AutoCount importer writes**;
`order_supplier_threads`, the other link the list already selected, holds **ZERO rows**.
Measured on production: **19 of 28 live orders were covered by a real purchase order and 0
carried `source_po`**, so **`SO-1206` · `SO-1213` · `SO-1216` · `SO-1257`** showed a red
*"Stock — no PO raised yet"* dot and an **`Issue PO`** instruction over goods Purchasing had
already bought — while the drawer, which read both sources, disagreed with its own list.

**FROZEN RULES this adds**
- **`po_skus` ABSENT is UNKNOWN, never "no PO."** The three-way discipline `photoOnFile` and
  `deliveryOrderIssued` already follow: a browser on a new build against a pre-D1 Worker
  reproduces the pre-D1 answer exactly rather than accusing an order of something it cannot see.
- **An EMPTY `po_skus` array is a real answer** — no purchase order names this order.
- **ONE consolidated purchase order serves EVERY sales order it names.** The consolidated PO is
  the normal case here, so each SO in `so_refs[]` gets the same SKU set.
- **ONE batched query for the whole page, never one per order** — asserted by a test.

**VERIFIED ON PRODUCTION, and the gap is named rather than papered over.** The app serves the
new bundle with its stylesheet applied (computed font **Inter** — the guard against an unstyled
page reporting a clean pass), `po_skus` greps **0 → 1** on downloaded bundles, and the four
orders are still covered at the database: **SO-1206 → PO-2036 · PO-2037 (7 SKUs)** ·
**SO-1213 → PO-2036 (4)** · **SO-1216 → PO-2036 · PO-2037 (7)** · **SO-1257 → PO-2047 (2)**.
**What was NOT verified with eyes: the authenticated Orders screen.** The browser pane holds no
operator session and entering a password is a red line, so those four rows reading differently
rests on the tests, the two negative controls and the bundle greps.

---

# §6 · Delay planning

### MISSION
Decide what to do about a factory slip **before** anyone talks to the customer.

### WORKFLOW — a state machine with a gate

> **The principle: the customer is the LAST to know.** A supplier saying "12 Aug" is not yet a
> delay — we may have the item in ready stock, or another supplier may cover it. **Only when we
> have tried and failed does anyone reach the customer.**

**The word is `Delay planning`. `Recovery` is banned on screen** — staff say *"this order going
to delay"*, and nothing is being recovered yet.

**Stage 1 — Delay planning**
- **Trigger** — the latest supplier ready date **>** the customer's promised date.
- **Owner** — Operations. **The customer is not contacted in this stage.**
- **Checklist** — confirm the supplier's real ready date · check ready stock or another supplier
  · check available dates with logistics · decide the best delivery date · **decide whether the
  customer needs to be told at all.**
- **Completion** — the delay decision is recorded.
- **Due — 2 WORKING DAYS** from the day the supplier's date first overshoots the promise.
  **That day was stored nowhere**, so 0305 stamps `delay_detected_at` + the supplier date it is
  about (`delay_detected_eta`) **with a database TRIGGER** — `line_etas` has three doors, and a
  stamp written by one route is a stamp two doors walk around. Server-owned, so nobody can move
  their own deadline. **Office calendar.** Two days is not slack: Operations must confirm the
  real date, check ready stock, check another supplier and check dates with logistics before
  there is anything worth saying.

**The gate — can we still make the promised date?**

```
YES → continue the original delivery. The customer is never told.
NO  → Call {logistics} — arrange new delivery date
```

**Stage 2 — Logistics arranges the customer's new date** (opens only on NO)
- **Owner** — Operations. **The CONVERSATION is logistics'; the ACTION in this portal is ours.**
- **Completion** — a customer-confirmed date AND a time slot are recorded.
- **Due — the SAME WORKING DAY the decision was recorded** (`delay_decision_at`, 0304), not the
  supplier's slip. A Friday-afternoon decision is due that Friday and turns late on Monday.

**Why Operations owns it:** eight logistics companies are in use, **only NETS has a login**, and
the partner portal has no appointment screen. A task owned by "Logistics" would be one nobody
can see or close. It moves to them the day that portal covers appointments.

**Stage 3 — the system records it.** No human step.

### FROZEN RULES
- **THE PROMISED DATE NEVER MOVES.** `orders.delivery_date` stays at what was sold, so every
  late/overdue/on-time figure keeps measuring against it and a delay can never be tidied away.
  **The delay flow must never call `set_order_date`** — that RPC exists to correct a date typed
  wrong at the counter, not to rewrite history. **The route never opens the `orders` table at
  all**, so it is unreachable even by accident, and the panel has no date input.
- **NOT the customer's extension fields.** 0196 caps `extension_count` at 1; writing a
  Carres-caused delay there **silently spends the customer's only extension**, so the day they
  genuinely ask to postpone the portal refuses them for our factory's fault.
- **`delay_decision_eta` earns its column.** A decision is about ONE supplier date; if the
  factory slips again the pair stops matching and Delay planning re-opens by itself. Without it
  one answer would close every future delay on that order.
- **Two clocks, and they never overlap.** Operations gets two days to find out whether there is
  really a delay; the moment it decides there is, the customer hears the same day.

---

# §7 · Delivery on an order

> **The delivery PAGE is [`../delivery/MASTER.md`](../delivery/MASTER.md). The ACTIONS are
> defined here, once.** That page renders them and writes nothing.

**`Assign logistics`** — trigger: the order needs delivering and no company is chosen ·
completion: **a company is recorded. Never "they accepted"** — assigning is our decision ·
due: 3 working days before the customer's date.

**`Call {logistics} — confirm delivery date`** — trigger: logistics assigned but the customer
has not confirmed BOTH a date and a slot · completion: **a customer-confirmed date AND slot
exist. A date logistics proposed is a fact, not a confirmation** · due: a settable number of
working days before the date (**1 today**) · the checklist adds driver name, driver phone,
vehicle number and lift/registration requirements **for condominiums**.

**`Issue delivery order`** — trigger: customer-confirmed date **AND** slot **AND** core goods
ready **AND no active Finance payment exception**. Outstanding or a receipt waiting for routine
Finance verification is not an exception and does not block this action. The SYSTEM produces the
document; **nobody writes one by hand**, and the
number is the locked `DO-DDMMYY-NNNN` scheme seeded on the order id, so a reprint matches the
signed original.

**`Deliver today`** — trigger: the confirmed date is today and nothing has been delivered ·
completion: **Delivered**, or a **Delivery Exception carrying its reason** (customer
unreachable · customer rejected the date · driver absent · vehicle breakdown · condominium entry
refused · lift booking not done · delivery failed). **Every module fails the same way: one
Exception plus a Reason, never a family of failure words.**

**`Upload delivery photo`** — trigger: delivered, no photo · due: 1 working day after delivery.

### FROZEN RULES
- **The slot length comes from the BUILDING TYPE** — condominium, apartment and office take a
  half-day; landed and retail take a full day.
- **Grouping:** a bed set (mattress + frame) can never be split · a sofa may travel on a second
  trip only if the customer agreed · accessories never block a delivery. **The default is one
  trip**, and the split question is asked only when the sofa would hold the bed set back.

---

# §8 · Money on an order

> **The collections DESK is [`../payment/MASTER.md`](../payment/MASTER.md). The GATE and the
> arithmetic are here, because they decide whether goods move.**

### THE ONE NUMBER

```
outstanding = Σ order lines + add-ons + chargeable storage fee − orders.paid
```

**ONE rule, `packages/shared/src/order-money.ts`, and FOUR readers** — the ladder's lock, the
row pill, the drawer strip and the collections desk. Before it existed, three surfaces asked
three different questions and each pointed at a column nobody wrote.

**Three facts a chat will get wrong unless it reads them here** (measured live):

- **The payment ledger is empty but NOT unwritten.** Two doors write `order_payments`, and the
  raw-create door writes the SAME deposit into BOTH `orders.paid` and the ledger. **Adding them
  reads a half-paid order as paid in full**, so the ledger must never enter an outstanding
  calculation.
- **`ops_order_control.balance` means what the customer STILL OWES** (0165), not the total.
  Anything that subtracts payments from it subtracts twice.
- **An order whose value is UNKNOWN never holds anything.** A number nobody knows may not stand
  between a customer and their goods — **unknown warns, never blocks.**

### `Collect RM {amount} from {customer}`
Trigger: outstanding > RM 0 · completion: outstanding = RM 0 ·
**survives delivery** — a delivered order that still owes keeps this action and its red dot.

### DELIVERY GATES — different from display order

**A gate REFUSES an action. Display order only decides what is read first.**

**Issuing the delivery order is gated by executable delivery facts**, not by an outstanding
calculation: every core goods line is reserved to this order (accessories pass automatically), the
date is not a Sunday or Malaysian public holiday, and Finance has not explicitly recorded
`payment not received / payment exception`. Operation's uploaded receipt, routine Finance review
and any remaining outstanding amount do not create a hold by themselves.

**Storage money remains owed until Finance waives or settles it, but owing and holding are no
longer synonyms.** Only an explicit Finance payment exception can hold delivery. Waiving money
and clearing a hold are separate Finance records; neither is inferred from Operation activity.

**AGREEING a date is softer than ISSUING.** It WARNS about goods, money and the calendar so
nobody promises a day the goods cannot make, but it refuses only two things:
**Sunday and Malaysian public holidays** (no company runs), and **a missing building type**
(a condominium can only take a half-day, so the date cannot be agreed without it).
Everything else warns: a company's own working days, closed dates, capacity, notice period —
**a phone call beats a calendar.**

---

# §9 · Documents, evidence and messages

### DOCUMENTS
`OrderDocuments.tsx` (303 lines) lists the document KINDS an order carries.
**A missing delivery photo is NOT a health line** — `Upload delivery photo` already says it with
a due date attached, so the health line was the same fact in the voice of a problem. Invoice and
delivery order MUST still be stated as missing, because **nobody can DO a missing one.**

### THE MESSAGE RULES
Most actions are performed by sending a message, so the message is part of the action. The
bodies live in `apps/web/src/lib/wa-templates.ts`; **the rules live here.**

- **A customer message never carries a delivery date.** Logistics agree the date and slot with
  the customer; if a customer asks us, we give them the logistics company's contact. The ONE
  exception is the delivery-eve reminder on an order still owing money, which may say
  `today` / `tomorrow`.
- **No pressure phrasing to a customer** — never *"settle by"*, never *"deliver on time"*.
- **The salutation is never guessed.** Preferred-name field when set, otherwise the customer's
  own name in Title Case. **Never infer `Mr` / `Ms`.**
- **An outside party never sees the SO number.** A supplier message leads with the PO; a
  logistics and a customer message lead with the CR/TCF ref.
- **Every order named in a message carries its own REF** — that is what makes a group reply
  traceable back to one order.
- **One counterparty, one message.** A bulk send produces ONE message per supplier and per
  logistics company, never one per order: a supplier message aggregates by SKU; a logistics
  message keeps each delivery as its own block, because each has a different customer, address
  and day.
- **Two tones per audience** — `Remind` before the date, the firmer `Call {party} — …` once it
  has passed. Not a third vocabulary.

### THE OBSERVATION LAW
**The portal records only what it OBSERVED.** Pressing a channel button records that the
channel was OPENED — a real send or receipt may only be recorded by something that watched it
(an API, a portal, a read receipt). **This binds the RECORD, not only the screen:** a page can be
re-rendered, a written row cannot be un-written.

---

# §9.5 · MODULE OWNERSHIP — where the record and the completion evidence live

**Orders may SHOW and TRIGGER cross-module work. It owns the record only where this table says
so.** Audited 2026-08-06 by tracing every write the list and the drawer make.

| Concern | Orders is | The RECORD lives in | Completion evidence |
|---|---|---|---|
| the customer order · stages · PIC | **THE OWNER** | `orders` · `ops_order_control` | the stage and the assignment stamps |
| the action engine | **THE OWNER** | nothing stored — derived | an action closes when its own outcome is recorded |
| delay planning | **THE OWNER** | `ops_order_control.delay_decision*` (0304/0305) | the decision + the supplier date it was about |
| storage hold and its release | **THE OWNER** | `ops_order_control.storage_*` | `storage_waiver_status` + `storage_fee_override` |
| outstanding money summary | **a SUMMARY / trigger** | Money In — [`../payment/MASTER.md`](../payment/MASTER.md) | Finance-owned payment truth |
| delivery payment exception | **a SUMMARY / gate input** | Money In — [`../payment/MASTER.md`](../payment/MASTER.md) | Finance explicitly opens or clears the exception |
| following outstanding + uploading receipt | **a trigger** | `order_payments` — [`../payment/MASTER.md`](../payment/MASTER.md) | submitted to Finance; Operation does not verify it |
| buying the goods | **a SUMMARY, and a broken one** | `purchase_orders` — [`../purchasing/MASTER.md`](../purchasing/MASTER.md) | the PO exists · `received_qty` |
| receiving the goods | **a SUMMARY** — the count is read, never written (D2) | `warehouse_receipts` · `receiving_events` — Purchasing | a posted Receiving Session |
| reserving / releasing a unit | **a trigger** | `ops_stock_items` — [`../stock/MASTER.md`](../stock/MASTER.md) | the unit's status + `reserved_ref` |
| booking a delivery | **THE OWNER of the record** | `ops_order_control.booking_*` | a customer-confirmed date **and** slot |
| the delivery WORKSPACE | a VIEW | nothing — [`../delivery/MASTER.md`](../delivery/MASTER.md) | — |
| carrier rules | 🟡 **a duplicated editor** | the partner's own config | — |
| a customer complaint | **a link** | `service_cases` — [`../service/MASTER.md`](../service/MASTER.md) | the customer confirmed |
| a supplier claim | **not present** | `supplier_claims` — Purchasing | — |

**Two ownership defects, both reported and neither fixed here:**

✅ **Receiving was genuinely duplicated and is FIXED (D2, 2026-08-06).** The Orders drawer's
write door is deleted; the Items tab reads the count and hands over to the Receiving Workspace.

🟡 **`PartnerRulesEditor` edits carrier configuration from inside one order's drawer.** A
carrier's working days and capacity are not a fact about this customer's order.

---

# §10 · Cross-object decisions

| Decision | Ruling |
|---|---|
| **No overall Order Status** | Facts are stored independently and the view is computed. A single summarising word would be a fifth source of truth. |
| **The engine is the only source of actions** | Everything else produces SIGNALS. An action born elsewhere has no due, no owner, no measured completion. |
| **A second page is a VIEW, never a module** | It renders these actions through the same shared computation. **The same action is never defined twice.** |
| **One rule, many readers** | Money has ONE module and four readers; words have ONE module and every surface. Two implementations that merely agree is the arrangement under which a third, wrong one grows unnoticed. |
| **Widths are MEASURED in a real browser** | jsdom has no widths. A guessed number is never written down. |
| **Imported archive rows are excluded from WORK, never hidden** | And no card may propose a backfill for them. |

---

# §11 · Approved Evolution — decided, deliberately not implemented

| What | Why it is not built |
|---|---|
| **The follow-up action after a FAILED delivery** | `Deliver today` completes on delivered OR a Delivery Exception with its reason, and **nothing yet turns that exception into the next action.** Approved shape: one Exception plus a Reason, then the next action. Belongs to whichever card next touches the delivery day. |
| **Persistent Facts as a real strip** | RESERVED, not law. It needs the four facts to have ONE home first; on today's drawer they sit in four blocks under a frozen *"ZERO order data here"* ruling. **The first page migrated through `DetailShell` is where they get that home.** |
| **Gap** | RESERVED, not built. The upgrade trigger is written into the model. |
| **The drawer through `DetailShell`** | Approved as the destination; blocked because L4's persistent-facts tuple does not exist on the drawer yet. **Not a gap — a ruling.** |
| **The delivery-appointment task moving to Logistics** | Approved the day the partner portal covers appointments. Today only NETS has a login and that portal has no appointment screen. |
| **`order_payments` gaining a real reader** | The Record-payment button writes a ledger nothing reads. The fix is one audited RPC that writes `orders.paid` too — **never by summing the ledger**, because the raw-create door double-writes. |

# §12 · Implementation debt found by the 2026-08-06 audit

**Not architecture. Each one is a build slice, and none of them changes a business rule.**

| # | Defect | Evidence |
|---|---|---|
| ~~**D1**~~ | ✅ **FIXED 2026-08-06** — the list reads both PO sources through one shared helper. See §5.1 |
| ~~**D2**~~ | ✅ **FIXED 2026-08-06** — the door, the hook, the route and its suite are deleted; a guard asserts the route now 404s. See §9.5 |
| **D3** 🟡 | **The drawer computes `stage` a SECOND time** (its own IIFE at line ~1469) instead of importing the list's exported `stageOf`. Two spellings of one derivation, in two files. | read |
| **D4** 🟡 | **The drawer computes money a second way for its own header.** The list hands down `holdAmount` from the shared `orderMoney`, and the drawer separately fetches `order_payments` for `Collected` — the one ledger the shared rule refuses to read. **The drawer's Collected and the row's Outstanding can disagree.** | read |
| **D5** 🟡 | **Carrier rules are edited from one order's drawer.** | §9.5 |
| **D6** 🟡 | **`Issues module coming — needs the ops_issues table`** is a live tooltip on the Actions menu. A promise about the product on an operator's screen. | panel titles |
| **D7** 🟡 | **The `deliver_today` checklist is empty by ruling**, so an operator expanding the day's own action sees nothing. Correct by the rule (*nobody records "goods loaded"*), and worth knowing before somebody calls it a bug. | `order-action-checklist.ts` |
| **D8** ⚪ | **`stockWindowDays` is still a flat 7 / 5** in `orderActionSignalsOf`, while Purchasing's real production numbers are 7 · 7 · **14** and manager-editable. The Orders ladder therefore turns the ready-date call red on a sofa **nine days later** than Purchasing's own window says it should. | read + Purchasing §2.3 |
| ~~**D9**~~ | ✅ **FIXED 2026-08-08** — `lineClass` answers `unknown` where it used to answer `acc`, and `acc` is now earned by an accessory word instead of by elimination. **20 orders that could never fail a stock check → 0**, with **zero** lines re-classified into anything else. Two follow-ups named and left open on purpose: delete the `lineCategory` display fold, and name the sixteen SKUs alongside migration 0148. See the D9 block above |
| **D10** 🟡 | **Two dead surfaces are still compiled into the bundle, and both had live test suites.** `OperationOrders.tsx` (450 lines, the 6-column kanban) is imported by **nothing** — §3 records that the list merged it away — and `OrderCustomerCard` (in the drawer) is exported, rendered nowhere, and superseded by `CustomerIdentityCard` (Jess 2026-07-17 rev 4). **Purchasing's own C1 ruling applies to the second one:** its `startEditRef` door has no caller, so the safe-edit mode is unreachable, **and the `status === 'place'` gate that used to guard it is gone from the component** — whoever re-mounts it inherits an editor with no gate. | `grep` — the only non-test reference to each is its own declaration |
| **D11** ⚪ | **`receive-po-<id>` names TWO different controls** in `ProcurementTabContent` — the primary `Check in` button and the always-available `Direct receive →` escape hatch. A test cannot tell them apart by handle, only by word. | read |
