# Purchasing — the working flow

> **THE one file for how purchasing behaves.** A chat working on Purchasing reads this and
> nothing else for the flow. It is overwritten in place; there is never a second version,
> never a "v2", never a "superseded" note.
>
> This file says WHAT the Purchasing module does. It does not repeat:
> the action MODEL → `docs/ACTION-FLOW-STANDARD.md` · the WORDS → `docs/COPY-STANDARD.md`
> · the SHELL and the click behaviour → `docs/UI-KIT.md` · progress →
> `docs/execution-queues-index.md`.
>
> **This file replaced seven documents** (`purchase-procurement-plan.md`,
> `purchasing-3panels-proposal.md`, `purchase-cockpit-handoff.md`,
> `CHECKPOINT-purchase-cockpit-2026-07-23.md`, `CHECKPOINT-purchase-v2-2026-07-24.md`,
> `2026-07-19-combined-ref-split-by-lead.md`, `whatsapp-chase-templates.md`) — 1,222 lines
> that each specified a different purchasing module. **They are deleted, not archived.**
> Seven half-specs with no owner is why every attempt at this module built something
> different.

## 1 · What the module is

**One continuous flow, four tabs, one door.**

```
Purchasing   [ To Order ]  [ Purchase Orders ]  [ Receiving ]  [ Claims ]  [ Settings ]
```

Buying and receiving are the same job on the same PO, done by the same people. Receiving is
**not** a separate menu item: warehouse staff reach it through their own login landing page,
which removes the only usability reason for splitting it out. `Settings` is manager-only.

**Receiving here means goods coming IN from a supplier.** Goods going OUT to a customer are
Delivery. The two never share a word.

**There is no single overall PO status that a human types.** What the screen shows is
computed from stored quantities and dates at read time (§9). A PO can be part-received,
part-claimed and still open — one word could never say that.

**One PO can carry several customer orders, and one customer order can need several POs.**
Neither is the unit of work. The unit of work is the **PO line** (§9).

## 2 · What the flow reads

Every signal names the real column. A chat that cannot find its column here has found a gap
and must report it, not invent a store.

| Signal | Where it lives |
|---|---|
| what a customer ordered | `order_lines` for the order |
| a line excluded from planning | `order_lines.excluded_from_plan` · `exclude_from_plan_until` (0243) |
| a supplier paused | `purchase_snoozes` (0243) |
| the customer's promised date | `orders.delivery_date` (+ `delivery_date_tbd`) |
| the PO itself | `purchase_orders` (`id`, `supplier_id`, `warehouse_id`, `status`, `expected_ready_date`, `eta_date`, `placed_at`) |
| what is on the PO | `purchase_order_lines` (`sku`, `qty`, `received_qty`, `damaged_qty`, `wrong_item_qty`, `cost`) |
| the supplier's ready date | `purchase_orders.expected_ready_date` · per customer line `ops_order_control.line_etas` |
| goods physically in | `ops_stock_items` (one row per unit; `status` free / reserved / on_hold …) |
| a receiving problem | `supplier_claims` (`po_id`, `po_line_id`, `sku`, `qty`, `claim_type`, `do_number`, `photos`, `supplier_response`, `closed_at`) |
| held units | `ops_stock_items.status='on_hold'` + `hold_claim_id` (0299) |
| who owns purchasing today | `org_duties` — the PO-duty holder |
| working days | `packages/shared/working-days.ts` + `my-holidays.ts` — **the ONE calendar every module uses.** Purchasing never computes its own |

**The engine already exists.** `buildPurchaseTodayReport` (`packages/shared/purchase-report.ts`)
computes the net requirement, the order-by date and the urgency buckets, and
`apps/api/src/routes/operation/purchase.ts` already reads a per-category lead time, a
per-supplier work week, an arrival buffer and a Mon/Wed/Fri cadence. **Purchasing is not a
new engine — it is those numbers becoming settings, plus the two missing supplier calls.**

### The numbers — and who edits them

**Every number below is a business setting, not a constant.** They live on the
**Purchasing → Settings** tab, manager-only. Each edit records who changed it, when, and what
it was before.

| Setting | Today (hard-coded) | What it must become |
|---|---|---|
| Production time, per supplier × category | mattress 7 · bedframe 7 · **sofa 10** working days, one number for all suppliers | per supplier × category, editable. **Sofa is 14** (Jess 2026-07-27, corrects the 10) |
| Peak-season change | none | edited **one supplier at a time**; **a PO already sent is never re-computed** |
| Order-by buffer | 7 working days | one editable number. **10 at go-live** — Sales fixes a 1-month customer window and a delay inside it cannot be absorbed |
| Earliest date a store may sell | mattress/bedframe 14 · sofa 21 **calendar** days (`DELIVERY_LEAD_DAYS`) | one editable number, **30 days** at go-live |
| Days before the delivery date the logistics call is raised | 1 working day | editable; Jess may set 5 |
| PO days | Mon · Wed · Fri | editable. **A late line never waits for a PO day** |
| Supplier work week | mattress 5-day · bedframe/sofa 6-day, keyed by CATEGORY | keyed by **supplier**. Nice Future works 5 days; Ohana works Saturday |

**The order-by date is one formula and it lives in one place:**

```
order-by date = customer's promised date
              − production working days (that supplier, that category)
              − order-by buffer
```

## 3 · The actions

Every action carries the six things (`docs/ACTION-FLOW-STANDARD.md` Law 2), plus two things
purchasing needs and Orders did not: **what it is counted per**, and **what makes the system
re-check it**. Without those two, a queue count and its list disagree, and a finished action
stays on screen.

**The exact wording of every action** — queue tile, row line, button, done message, empty
state — lives in the dictionary in `docs/COPY-STANDARD.md`. This file never spells a label a
second time.

`{supplier}` is the real company name. The party is resolved from the PO's supplier —
**except collection, where the party is the logistics company, not the maker** (Nice Future's
goods are collected by NETS; the row says `Call NETS — collect from Nice Future`, never
`Call Nice Future`).

### `Send PO to {supplier}`

- **Trigger** — a customer line needs goods, no PO covers it, and today is a PO day **or**
  the line's order-by date has passed
- **Checklist** — supplier · items · quantity · purchase price · where the goods go · send ·
  record the PO number · record the supplier's ready date
- **Completion** — a PO exists for the line **and** it carries a ready date
- **Due** — the order-by date (§2's formula). Red once it has passed
- **Task owner** — the PO-duty holder (`org_duties`)
- **Counted per** — one row per **supplier**, showing how many lines it holds. The queue
  count and the visible rows both count suppliers, and each row states its line count
- **Re-checked when** — a customer line is added, changed, cancelled, skipped or snoozed ·
  a PO is created · the promised date moves · a setting in §2 changes

**The system suggests; a human sends.** The portal never sends a PO by itself. Today the PO
leaves by WhatsApp; a supplier portal is a later phase and changes nothing here.

**Consolidation:** mattress and bed frame for the same supplier merge into **one PO**.
**Sofa is one PO per customer order** — fabric, size and configuration make a merged sofa PO
dangerous.

**Where the goods go** is chosen on the PO and printed on it:

| Supplier | The choice |
|---|---|
| Nice Future | **fixed: collected by NETS → Carres Klang.** Nice Future does not deliver |
| every other supplier | `Carres Klang` (default) · `AL Sungai Buloh` · `HOUZS Balakong` |

Sending goods straight to AL or HOUZS saves a transfer for an outstation order. Moving goods
we already own between locations is a **stock transfer, not purchasing** — it is not in this
module.

### `Call {supplier} — confirm ready date`

- **Trigger** — the ready date is missing · has passed with no goods in · is later than the
  customer's promised date · the supplier changed it
- **Checklist** — production status · ready date · ready quantity · any delayed item ·
  record the latest ready date · record the outcome
- **Completion** — the latest ready date **and** the outcome are recorded
- **Due** — inside the arrival window: `customer date − production working days − buffer`
- **Task owner** — the PO-duty holder
- **Counted per** — one row per **PO**
- **Re-checked when** — a ready date is saved · goods are received · the promised date moves

**Every promise is kept, not overwritten.** When a supplier moves a ready date, the previous
date, the new date, who changed it, when, and the reason are all stored. A single "latest
date" column can never answer *"how often does this supplier move the date?"* — and that
question is the whole point of the supplier scorecard (R5).

### `Call {supplier} — confirm tomorrow's delivery`

The action the portal is missing today.

- **Trigger** — the goods are expected the **next working day** and nothing has been received
- **Checklist** — ask whether it ships tomorrow · ask for the delivery order · record the
  answer · record the quantity they will send
- **Completion** — an answer is recorded: **shipping**, or **delayed with a new date**
- **Due** — the day it appears. It is a one-day action
- **Task owner** — the PO-duty holder
- **Counted per** — one row per **PO**
- **Re-checked when** — the expected date moves · goods are received

**When the answer is "delayed", the portal opens Delay planning** — the Orders flow's
stage 1, unchanged (`docs/ORDERS-WORKING-FLOW.md` §3). Purchasing does not invent a second
delay conversation, and it never opens a call to the customer.

### `Check in from {supplier}`

- **Trigger** — goods arrive against a PO
- **Checklist** — count what came · record short, damaged or wrong quantities · record the
  supplier's delivery order number · photos
- **Completion** — the received quantity is recorded for each line
- **Due** — the day the goods arrive
- **Task owner** — the receiving duty holder
- **Counted per** — one row per **arrival**, not per PO. A PO that arrives in three
  deliveries is three check-ins
- **Re-checked when** — goods are received · a claim is raised

**Partial receiving is normal, not an exception** (Jess 2026-07-27). Receiving 8 of 10 is
recorded as 8 received and 2 still owed. **The shortfall stays on the SAME PO** — a second PO
for the balance turns one purchase into two and nothing reconciles afterwards.

**A PO is finished by QUANTITY, never by the existence of a receiving record.**

### `Call {supplier} — confirm balance delivery date`

- **Trigger** — a PO line has been part-received and the balance has no date
- **Checklist** — state what is short · ask when the balance ships · record the date ·
  record the reason
- **Completion** — a date for the balance is recorded
- **Due** — the working day after the short delivery
- **Task owner** — the PO-duty holder
- **Counted per** — one row per **PO line**
- **Re-checked when** — goods are received · the balance quantity is cancelled

### `Contact {supplier} — confirm what happens next` (damaged / wrong goods)

**Already built** — the claim lifecycle (R2 · R3 · R4, `supplier_claims`). It is named here
because it belongs to the purchasing flow, not because it is work: this file must not
describe it a second way. See `docs/receiving-claim-execution-queue.md`.

**Held units are not "on the way".** A damaged unit becomes `on_hold` and stops counting as
future supply (0299) — otherwise the planner keeps believing goods are coming that never will.

## 4 · Which one shows first

```
1  Today's run
     Check in from {supplier} · Call {supplier} — confirm tomorrow's delivery
2  A promise is already broken
     Call {supplier} — confirm ready date (the date has passed, or it beats the customer's)
3  Goods are not secured
     Send PO to {supplier}
4  Cleaning up a part-delivery
     Call {supplier} — confirm balance delivery date
5  Claims
     Contact {supplier} — confirm what happens next
```

Display order is not a gate chain. **A PO can carry several open actions at once**, and one
never hides another (Law 1).

## 5 · Gates

A gate REFUSES an action. Display order only decides what is read first.

- **A PO cannot be sent without a supplier, a quantity and a destination.** The destination
  is fixed for Nice Future and defaults to Carres Klang for everyone else.
- **A PO cannot be sent twice.** One active PO allocation per customer line and quantity. A
  double-click, a retry or a second browser tab must not produce a second PO.
- **A check-in cannot record more than was ordered** on a line, and cannot be posted twice
  for the same supplier delivery order number.
- **Nothing about money gates purchasing.** Paying the supplier is Finance's flow.

**Two people will open the same task** — everybody can see everybody's work, by design. So a
task shows who is on it (`Yu Jun is handling this · started 10:14`) and stays visible to
everyone. It is never hidden, and a manager can take it back with a record of the handover.

## 6 · Row order

Primary: risk to the customer's promise — order-by date passed → due today → due next
working day → supplier's date beats the customer's → normal.
Secondary: the customer's promised date.
Tertiary: how many lines the row holds — a tie-breaker only.

**There is no `Priority` column.** Row order IS the priority. A word column saying
high/medium/low would be a second, contradicting priority, and nothing would say whether a
human or the system wrote it.

## 7 · What is on screen

The frame — header, toolbar, bulk bar, facet panel, 44px table rows, footer — is
`docs/UI-KIT.md` §A9, and the canonical example is the Orders list. **Purchasing copies it;
it does not invent a layout.** Clicking a queue tile filters the table; clearing returns
every row; clicking a row opens the drawer — one behaviour for every module, also UI-KIT.

**The queue tiles** (each is a count of open actions, and its name IS the action):

```
Send PO · Confirm ready date · Confirm tomorrow's delivery · Check in ·
Confirm balance delivery date · Claims
```

**The table columns:**

```
Supplier · PO · Customer orders · Items · Ready date · Actions · Due · PIC
```

`Actions` is plural — a PO can carry several (Jess 2026-07-27). It shows the top one from §4
plus `+N`.

**The facts, and their colour:**

| | green | amber | red |
|---|---|---|---|
| the PO | fully received | part received | not sent, or the order-by date has passed |
| the supplier's date | on or before the arrival window | inside the window | past the window, or later than the customer's date |
| quality | nothing held | a claim is open | goods held and no supplier answer |

Facts state what is true. **A fact may state an absence (`No ready date`), and may never
contain a to-do word** (`need`, `pending`, `TBD`) — `docs/COPY-STANDARD.md`.

## 8 · What is deliberately NOT an action

- **Sending the PO automatically.** The system suggests; a human sends.
- **A daily "check on the supplier" task.** The expected date is computed from the production
  days — nobody chases anything while a promise is still good. The only supplier calls are
  the ones named in §3, each with its own trigger.
- **A tick-box that only records "I say I did it."** Where a form already collects the
  inputs, that form IS the checklist.
- **Waiting states.** `Waiting supplier reply` · `Waiting goods arrival` are states, not
  actions: nobody acts while one is true. They become actions when the wait expires.
- **Moving goods we already own** between Klang, AL and HOUZS. That is a stock transfer and
  belongs to the Stock line.
- **The September supplier switch.** Nice Future stops supplying in September and a new
  mattress supplier takes over on the subscription model; sofa and bed frame are unchanged.
  Recorded here so it is not rediscovered late — it is not built in this phase.

## 9 · What the system believes is true

**No human types a purchasing status.** Every state below is DERIVED from stored quantities,
so two screens can never disagree and no repair job is ever needed.

The unit is the **PO line**. Per line, the system stores only what somebody actually records:

```
required_qty     what the customer ordered           order_lines
po_qty           what we ordered from the supplier   purchase_order_lines.qty
received_qty     what physically arrived good        purchase_order_lines.received_qty
damaged_qty      arrived broken                      purchase_order_lines.damaged_qty
wrong_item_qty   arrived, but the wrong thing        purchase_order_lines.wrong_item_qty
cancelled_qty    we or the supplier dropped it       NOT STORED TODAY — the one real gap
```

Everything on screen is computed from those:

```
To order          required_qty > po_qty + cancelled_qty
Ordered           po_qty > 0
Part received     0 < received_qty < po_qty − cancelled_qty
Fully received    received_qty >= po_qty − cancelled_qty
Balance owed      po_qty − cancelled_qty − received_qty
```

**A quantity means exactly one thing.** No column is ever reused to mean a second thing —
that is how a number quietly stops being true, and how a lock ends up reading a column
nobody writes.

**Deliberately not stored yet:** the finer quantities an ERP eventually grows
(`in_transit_qty`, `ready_for_collection_qty`, `supplier_confirmed_qty`) and **PO revisions**
— a sent PO that is changed is overwritten today, with no history of what the supplier
actually agreed to. Both are real gaps and both are recorded here rather than built, because
**zero purchase orders exist in the system today**: a column nobody writes is worse than a
missing one. They are built when the first real PO needs them.
