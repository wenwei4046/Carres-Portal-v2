# Purchasing — the working flow

> ## ⚖️ OWNERSHIP — Purchasing has exactly TWO documents and they are LAYERS, not versions
>
> **These two documents are complementary and non-overlapping.**
> **Business workflow belongs to `docs/PURCHASING-WORKING-FLOW.md`.**
> **Information Architecture belongs to `docs/PURCHASING-INFORMATION-MODEL.md`.**
> **A rule must have only one canonical home and may only be REFERENCED, not duplicated, in
> the other document.**
>
> | | **`PURCHASING-WORKING-FLOW.md`** — this file | **`PURCHASING-INFORMATION-MODEL.md`** |
> |---|---|---|
> | owns | business workflow · business rules · action ownership · trigger · due · completion · status progression · queue behaviour · cross-module workflow boundaries | information architecture · information regions · information hierarchy · information relationships · the facts each region must carry · information excluded from To Order |
>
> **There is no third Purchasing master document and none may be created** — no
> `PURCHASING_MODULE_MASTER.md`, no V2 / FINAL / COPY. **A rule that appears in full in both
> files is a defect**, and the fix is always the same: keep it whole in its canonical file
> above and leave a one-line pointer in the other.

> **THE one file for how purchasing BEHAVES.** A chat working on Purchasing reads this for
> the flow, and [`PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) for how
> To Order's information is organised. It is overwritten in place; there is never a second
> version, never a "v2", never a "superseded" note.
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

**One continuous flow, five tabs, one door.**

```
Purchasing   [ To Order ]  [ Purchase Orders ]  [ Receiving ]  [ Claims ]  [ Settings ]
```

Buying and receiving are one continuous flow on the same PO, and that is why they are five
tabs of one module rather than two menu items. **They are not done by the same people**, and
the rule below turns on exactly that: the PO-duty holder buys, the receiving duty holder
counts, and the two duties are held by different people who rotate. Receiving is still **not**
a separate menu item — warehouse staff reach it through their own login landing page, which
removes the only usability reason for splitting it out. `Settings` is manager-only.

*(This paragraph read "the same job … done by the same people" until 2026-08-05. It was the
plain-language cover under which two of the buyer's actions sat on the warehouse's page for a
week: if it is all one team, it does not matter which tab a thing is on. It does matter, and
Q12 is what it cost to find out.)*

**HOW THE WORK DIVIDES BETWEEN THE TABS — RULED 2026-08-05 by Loo (card Q12). This is the
governing rule, and it is measurable:**

> **ROLE-ANCHOR. Work done by ASKING THE SUPPLIER for something belongs to the buyer.**
> **Work done by HANDLING THE GOODS belongs to Receiving.**

The test is the OBJECT of the work, never its deadline: a phone call takes a fact the factory
holds, and a check-in takes units on a floor. Every action's task owner is written in §3, so
no case has to be argued — the buyer's actions are the PO-duty holder's, Receiving's are the
receiving duty holder's, and **the rule and the owner now say the same thing**.

```
To Order          Issue PO
Purchase Orders   Confirm ready date · Confirm tomorrow's delivery · Confirm balance delivery date
Receiving         Check in
Claims            Confirm what happens next
```

**Every action of the module has exactly one home** — none in two tabs, none in none.

**§1 DECIDES THE BUYER / WAREHOUSE BOUNDARY AND NOTHING ELSE.** Which of the buyer's tabs an
action lives on is a second, different question — *has a purchase order been issued yet?* —
and its home is [`PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) §12.1:
To Order asks *what do we not have yet*, Purchase Orders asks *what did we already ask for,
and where is it*. `Issue PO` is the act that creates the document, so it can only be To Order's.

**WHY THE DEADLINE RULE WAS DROPPED.** From 2026-07-29 to 2026-08-05 this section sorted work
by **where its deadline came from** — a customer commitment sent it to To Order, the movement
or arrival of goods sent it to Receiving — and that put both supplier calls on the warehouse's
page. *(Its wording is deliberately not reproduced here: a retired rule quoted in full reads
like a live one to the next person who greps this file.)* Three things measured on 2026-08-05
defeated it:

- **This file already contradicted it.** §3 has given `Confirm tomorrow's delivery` and
  `Confirm balance delivery date` to the **PO-duty holder** — the buyer — since the day it was
  written, while §1 put them on Receiving. One file, two answers, both frozen.
- **The tab the work belongs to did not exist in its present form when the work was assigned
  away from it.** On 2026-07-29 the `Purchase Orders` tab rendered a per-supplier kanban
  (Nice Future Mattress · Ohana Sofa · Ohana Bed Frame). The Supplier Execution Register — the
  promise ledger, the date door, `Print PDF` and the whole Communication band — was created on
  **2026-08-03**, five days after the boundary was frozen.
- **One supplier date had already grown TWO doors on TWO tabs**, both writing
  `POST /api/operation/pos/:id/tomorrow-delivery`. The boundary was unclear enough that the
  same fact grew a second editing surface without either lane noticing — and the richer of the
  two, the one carrying the reason, the remarks and the shift, is the one on Purchase Orders.
  The business had already moved the work; the document had not.

**A deadline is a property of the CLOCK; a tab is a place a person works.** The old rule sorted
work by when it turns late, and people are not organised that way.

**`Confirm ready date` — RULED BY LOO, 2026-08-05. It belongs to Purchase Orders.**

> *"Move `Confirm ready date` to Purchase Orders too — same ruling. §5.3 already says a
> requirement leaves To Order the moment a PO exists, and the only door that closes this
> action is on the Purchase Orders expand. Queue and door in one place. Delete the To Order
> assignment whole."*

**The queue lives where the door is. Both are Purchase Orders. The To Order assignment is
deleted, not deprecated** — no "moved, see below", no second version kept for reference.

**The code was already there and only these documents were not, measured 2026-08-05.**
`OperationToOrder.tsx` and `to-order.ts` mention `Confirm ready date` **zero times**; the
Purchase Orders expand carries the field AND the RPC behind it — `purchasing_record_ready_date`
(migration **0318**, an append-only `po_supplier_promises` ledger plus the current answer on
`purchase_orders.expected_ready_date`), reached through `apps/api/src/routes/operation/pos.ts`.

**That also RETIRES P7's gap G6**, which reads *"`Confirm ready date` cannot be closed — no
route in the portal writes `expected_ready_date`; the queue can only grow."* True when it was
written and false since 0318. **A gap that has been closed and left on the list is a chat-day
spent rebuilding something that exists** — the same trap the PO print renderer set.

**Live effect today: none. 0 of 21 purchase orders carry a ready date**, so no row moves
either way. This is a document correction, and the reason it still matters is the one the
Claims chat paid for hours earlier: a document that says the wrong place is worse than no
document, because a chat believes it.

**To Order is the PLANNING WORKSPACE and it stores no work-in-progress object of its own**
(Loo, 2026-07-30 — the Purchasing clean restart). How its information is organised — the six
regions and what may never be silently discarded — is
[`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md), frozen 2026-07-29.
That file is read before any To Order work.

**Receiving here means goods coming IN from a supplier.** Goods going OUT to a customer are
Delivery. The two never share a word.

**There is no single overall PO status that a human types.** What the screen shows is
computed from stored quantities and dates at read time (§9). A PO can be part-received,
part-claimed and still open — one word could never say that.

**One PO can carry several customer orders, and one customer order can need several POs.**
Neither is the unit of work. The unit of work is the **PO line** (§9).

**A PO NUMBER IS ONE SUPPLIER DOCUMENT, NEVER ONE ITEM** (Loo, 2026-07-28). The supplier
receives ONE PDF holding MANY items; each item is a PO line:

```
PO-0001   Nice Future
          Customer A · Queen mattress
          Customer A · King mattress
          Customer B · Single mattress
```

The To Order queue works at **PO-line** level; the system **groups** those lines into one
purchase order at the moment the PO is generated. Nothing about that grouping is typed by a
human, and a PO number is never minted per item.

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
| working days | `packages/shared/working-days.ts` + `my-holidays.ts` — the ONE engine; purchasing never writes its own. **Purchasing counts on the OFFICE calendar, Mon–Fri** (`docs/ACTION-FLOW-STANDARD.md` Law 2A). Receiving counts on the WAREHOUSE calendar, Mon–Sat — the two legs of one PO are not on the same week |

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
| Order-by buffer | 7 working days | one editable number. **10 at go-live** — Sales fixes a 1-month customer window and a delay inside it cannot be absorbed |
| Earliest date a store may sell | mattress/bedframe 14 · sofa 21 **calendar** days (`DELIVERY_LEAD_DAYS`) | one editable number, **30 days** at go-live |
| Days before the delivery date the logistics call is raised | 1 working day | editable; Jess may set 5 |
| PO days | Mon · Wed · Fri | editable. **A late line never waits for a PO day** |
| Supplier work week | mattress 5-day · bedframe/sofa 6-day, keyed by CATEGORY | keyed by **supplier**. Nice Future works 5 days; Ohana works Saturday |

**A SUPPLIER × CATEGORY WITH NO NUMBER IS NOT DEFAULTED TO 7** (Jess, 2026-07-28 — shipped
with P1 / migration 0303). The resolver returns nothing, the line is **held out of the plan
entirely**, and the To Order tab names the pair. **There is deliberately no per-category
default column to fall back on**, and a sanity block in the migration fails if one is ever
added. A fallback is how a setting silently stops mattering, and a quiet screen must mean
*watched and fine*, never *nobody looked*. **How that held-out demand is presented** — which
region carries it, beside what, and what it must state — is
[`PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) §3 · E.

**Peak season is NOT a setting** (Jess + Loo, 2026-07-28). There is no peak-season mode,
no second set of numbers, no "is it peak season today" state and no effective-from date.
Peak season is a manager opening this tab and raising ONE supplier's production time —
sofa 14 → 20 — and lowering it again afterwards. **A PO already sent is never re-computed**:
its dates were true when it was sent, and moving them would rewrite a promise the supplier
already made. A mode with two sets of numbers is a second source of truth that nobody
remembers to switch off.

**Sofa was 10 and is now 14.** Loo's own note reads "sofa 10 normal, peak up to 14 or 20";
Jess ruled 14 as the standing number the same day, and 14 stands — a production time written
too LONG only makes the portal order earlier, never later. The old 10 is retired, not kept as
an "actual" second column.

**The seven settings are four shapes, not one.** Production time is per supplier × category ·
supplier work week is per supplier · PO days is a set of weekdays · the rest are single
numbers. A chat that reads "six single values" builds the wrong table.

**The supplier work week is a FOURTH calendar and is meant to be.** Law 2A's three calendars
are ours; a factory's week is theirs, and it is neither (Ohana works Saturday, Nice Future
does not). The make-and-deliver leg counts on the SUPPLIER's week; the arrival buffer and the
urgency buckets count on the **Office** calendar, because arranging a delivery is office work.
*(That second one used to look like a hard-coded `[0,6]` contradicting the old
"Mon–Sat everywhere" rule. It was the Office calendar the whole time — ruled 2026-07-28.)*

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

**Each one also names its TAB** (Q12, 2026-08-05). It is written per action rather than left
to §1's rule because that is what makes the rule checkable: an action naming no tab, or two,
is the defect the rule exists to stop.

**The exact wording of every action** — queue tile, row line, button, done message, empty
state — lives in the dictionary in `docs/COPY-STANDARD.md`. This file never spells a label a
second time.

`{supplier}` is the real company name. The party is resolved from the PO's supplier —
**except collection, where the party is the logistics company, not the maker** (Nice Future's
goods are collected by NETS; the row says `Call NETS — collect from Nice Future`, never
`Call Nice Future`).

### `Issue PO to {supplier}`

**Raising a purchase order is ONE action, never two** (Loo, 2026-07-30 — the Purchasing clean
restart). It is **the only business action that creates a formal Purchase Order**: there is
no preparation stage and no stored work-in-progress object between the demand and the
document.

- **Trigger** — a customer line needs goods, no PO covers it, and today is a PO day **or**
  the line's order-by date has passed
- **Checklist** — supplier · items · quantity · purchase price · where the goods go ·
  issue the PO
- **Completion** — **a PO exists for the line.** **The ready date is NOT part of this** — it
  is the outcome of the NEXT action, and the moment a PO exists the row reads
  `Call {supplier} — confirm ready date`. Folding the two together would leave `Issue PO`
  open with nothing left to issue, which is the one thing an action may never do
- **Due** — the order-by date (§2's formula). Red once it has passed
- **Tab** — **To Order.** It is the buyer's, and no purchase order exists yet for a register
  of issued purchase orders to hold
- **Task owner** — the PO-duty holder (`org_duties`)
- **Counted per** — one row per **supplier**, showing how many lines it holds. The queue
  count and the visible rows both count suppliers, and each row states its line count
- **Re-checked when** — a customer line is added, changed, held or resumed · a PO is issued ·
  the promised date moves · a setting in §2 changes

**Only `Issue PO` mints the PO number, produces the external document, and opens the
communication channels.**

**The system suggests; a human issues.** The portal never issues a PO by itself. Today the PO
leaves by WhatsApp; a supplier portal is a later phase and changes nothing here.

**Consolidation is across CUSTOMER ORDERS, not across categories.** Every non-sofa line
waiting on the same supplier merges into **one PO** — ten customers' bed frames from Ohana is
one PO, not ten. **Sofa is one PO per customer order** — fabric, size and configuration make a
merged sofa PO dangerous. *(Across categories is impossible and the rule must not imply it:
measured live 2026-07-28, Nice Future supplies mattresses only and Ohana supplies bed frames
and sofas, so no supplier carries two procurable categories.)*

**Where the goods go** is chosen on the PO and printed on it:

| Supplier | The choice |
|---|---|
| Nice Future | **fixed: collected by NETS → Carres Klang.** Nice Future does not deliver |
| every other supplier | `Carres Klang` (default) · `AL Sungai Buloh` · `HOUZS Balakong` |

Sending goods straight to AL or HOUZS saves a transfer for an outstation order. Moving goods
we already own between locations is a **stock transfer, not purchasing** — it is not in this
module.

**AL and HOUZS are DELIVERY ADDRESSES, never warehouses** (Loo, 2026-07-28). No warehouse
record is created for either. Carres has exactly one warehouse, `Carres Klang`; the moment AL
became a warehouse entity every stock rollup would start counting goods we do not hold and do
not count.

**Items are ADDED to a sent PO by raising a NEW PO, never by editing the old one**
(Loo, 2026-07-28). The document the supplier already has stays exactly as they received it.

### What the supplier's PO shows

The purchase price is stored and used internally — costing, the To Order card's Σ, finance's
invoice match. **The supplier-facing PDF prints NO RM value of any kind** (Loo, 2026-07-28).
It prints exactly:

```
PO number · supplier · items · quantity · delivery address · delivery instructions · dates
```

### `Call {supplier} — confirm ready date`

- **Trigger** — the ready date is missing · has passed with no goods in · is later than the
  customer's promised date · the supplier changed it
- **Checklist** — production status · ready date · ready quantity · any delayed item ·
  record the latest ready date · record the outcome
- **Completion** — the latest ready date **and** the outcome are recorded
- **Due** — inside the arrival window: `customer date − production working days − buffer`
- **Tab** — **To Order today, and it is §1's one OPEN case.** It is the buyer's work either
  way; what is unsettled is which of the buyer's two tabs, and that is Loo's (§1)
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
- **Tab** — **Purchase Orders** (moved there from Receiving by §1's role-anchor ruling,
  2026-08-05). It asks the factory for a fact; nothing has arrived for anybody to handle
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
- **Tab** — **Receiving.** It is the ONLY action of the module that handles goods, and after
  the 2026-08-05 ruling it is the only action that tab carries
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
- **Tab** — **Purchase Orders** (moved there from Receiving by §1's role-anchor ruling,
  2026-08-05). **A count DISCOVERS it and a phone call CLOSES it**, and the tab follows the
  work, not the discovery — the shortfall is goods that have not arrived
- **Task owner** — the PO-duty holder
- **Counted per** — one row per **PO line**
- **Re-checked when** — goods are received · the PO is stopped by Operations

### `Call {supplier} — confirm what happens next` (damaged / wrong goods)

**Already built** — the claim lifecycle (R2 · R3 · R4, `supplier_claims`). It is named here
because it belongs to the purchasing flow, not because it is work: this file must not
describe it a second way. See `docs/receiving-claim-execution-queue.md`.

- **Tab** — **Claims.** It is the buyer's work under §1 and it has its own tab, so the
  role-anchor ruling of 2026-08-05 moved nothing here.

**The verb is `Call`, not `Contact`** (Loo, 2026-07-28). The portal has exactly five verbs and
`Contact` was a sixth for behaviour `Call` already covers: reach the outside party · get an
answer · record the outcome. The screens R2/R3 shipped still say `Contact` — that rename is
scheduled in the ④ R lane, and no P-card touches it.

**Held units are not "on the way".** A damaged unit becomes `on_hold` and stops counting as
future supply (0299) — otherwise the planner keeps believing goods are coming that never will.

## 4 · Which one shows first

```
1  Today's run
     Check in from {supplier} · Call {supplier} — confirm tomorrow's delivery
2  A promise is already broken
     Call {supplier} — confirm ready date (the date has passed, or it beats the customer's)
3  Goods are not secured
     Issue PO to {supplier}
4  Cleaning up a part-delivery
     Call {supplier} — confirm balance delivery date
5  Claims
     Call {supplier} — confirm what happens next
```

Display order is not a gate chain. **A PO can carry several open actions at once**, and one
never hides another (Law 1).

**This is a RANKING, not a screen.** Since the 2026-08-05 ruling the five actions do not all
appear on one tab — rung 1 pairs `Check in` (Receiving) with a call that is now Purchase
Orders' — so each surface ranks the actions it carries, by this order. Which tab carries which
is §1's, and is not restated here.

## 5 · Gates

A gate REFUSES an action. Display order only decides what is read first.

- **A PO cannot be sent without a supplier, a quantity and a destination.** The destination
  is fixed for Nice Future and defaults to Carres Klang for everyone else.
- **A PO cannot be sent twice.** One active PO allocation per customer line and quantity. A
  double-click, a retry or a second browser tab must not produce a second PO.
- **A check-in cannot record more than was ordered** on a line, and cannot be posted twice
  for the same supplier delivery order number.
- **Nothing about money gates purchasing.** Paying the supplier is Finance's flow.

**Two people will open the same action** — everybody can see everybody's work, by design. So an
action shows who is on it (`Yu Jun is handling this · started 10:14`) and stays visible to
everyone. It is never hidden; a second person is TOLD and has to take it over deliberately,
and the handover is recorded.

**How that is stored — and what it may never become** (Loo, 2026-07-28):

```
(action identity) → claimed by → claimed at
```

- **Action identity** is the action's own key plus the record it is about (the PO, or the PO
  line for a per-line action). Nothing else.
- **Engine actions stay engine-generated.** A claim may NEVER be implemented by minting a
  task row per action. The moment an action becomes a row somebody maintains, the portal is a
  manual to-do list again and the engine stops being the single source of truth.
- **Action claims automatically expire after the system-defined timeout**, and when the
  action completes. **This file names no number**: the timeout is a technical constant
  (`ACTION_CLAIM_TIMEOUT_MS`), not a business setting — nobody negotiates it, nobody tunes it
  per supplier, and it never appears on the Settings tab. Changing it is a one-line code
  change, not a document edit.
- **If the action disappears, the claim disappears with it.** This is structural, not a
  cleanup job: a claim is only ever READ through the list of currently-open actions, so an
  action that is finished, recomputed away or no longer valid has nothing that can look its
  claim up. The timeout exists for the other case — somebody opened it at 10:14 and went home.

## 6 · Row order

Primary: risk to the customer's promise — order-by date passed → due today → due next
working day → supplier's date beats the customer's → normal.
Secondary: the customer's promised date.
Tertiary: how many lines the row holds — a tie-breaker only.

**There is no `Priority` column.** Row order IS the priority. A word column saying
high/medium/low would be a second, contradicting priority, and nothing would say whether a
human or the system wrote it.

## 7 · What is on screen

The frame — title, toolbar, filter chips, table header, footer — is `docs/UI-KIT.md` **§8.3**
(module-tab law: a tabbed page renders no breadcrumb and no big title, because the tab IS the
title) with the **§1.3** height budget, and the canonical example is the Orders list.
**Purchasing copies it; it does not invent a layout.** **This file states no pixel** — the row
height, the band heights and the budget all live in UI-KIT, and the one number this paragraph
used to carry was already wrong (it said 44px; the Orders list ships 40px, measured by C10).
The click behaviour is **§8.2**: a queue tile filters, clicking it again clears, a row opens
the drawer on its FIRST tab, and closing keeps the filter and the scroll — one behaviour for
every module.

**The queue tiles** (each is a count of open actions, and its name IS the action). **They are
not one set on one screen — each lives on exactly ONE tab**, decided by §1's role-anchor rule.
A chat that reads this as a single list will build a tile for an action the tab cannot count:

```
To Order          Issue PO
Purchase Orders   Confirm ready date  ·  Confirm tomorrow's delivery  ·  Confirm balance delivery date
Receiving         Check in
Claims            Confirm what happens next
```

**To Order now carries ONE tile, `Issue PO`** — Loo moved `Confirm ready date` to Purchase
Orders on 2026-08-05 (the ruling is at the head of this file). The ranking question it used to
raise is gone with it: one tile has nothing to rank against.

**On Purchase Orders the three rank `Confirm ready date` first**
(`docs/ACTION-FLOW-STANDARD.md` Law 4 rung 3): a broken supplier commitment outranks the two
delivery calls. **All three words are ruled** and their five strings live in
`docs/COPY-STANDARD.md`, the canonical home. *(This paragraph twice said something that had
stopped being true: first "the three rank in that order" printed in reverse, a leftover from
when the rung held `Send PO` — corrected by Q12 on 2026-08-05; then the two-tile version it was
corrected INTO, which Loo's ruling retired hours later. Both are recorded rather than quietly
replaced, because this paragraph is the one that keeps going stale.)*

**The last tile is `Confirm what happens next`, not `Claims`.** A tile's name IS its action
(COPY-STANDARD); `Claims` is the TAB, which is a place, and a place and an action may not
share one word.

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

**This section is written against the code, and the code is the authority** (card R10,
2026-08-05). What stood here before published a two-rung ladder the portal has never run, and
it misled two chats in this lane — the second while it was reading this very section in order
to write something else. The functions named below are the ones the screens actually render
from; if this text and they ever disagree again, they win and this text is the defect.

### What is stored

**The unit of work, and of storage, is the PO line.** Per line, the system stores only what
somebody actually records:

```
qty              what we ordered from the supplier   purchase_order_lines.qty
received_qty     what physically arrived good        purchase_order_lines.received_qty
damaged_qty      arrived broken                      purchase_order_lines.damaged_qty
wrong_item_qty   arrived, but the wrong thing        purchase_order_lines.wrong_item_qty
```

Demand — what somebody still wants — is stored in two other places, and To Order reads both:

```
qty              what the customer ordered           order_lines.qty
remaining_qty    what a typed demand still needs     purchase_demands.remaining_qty
                 (GENERATED: qty − issued_qty, 0320)
```

**There is no `required_qty` column and there never was one** — the name this section
published greps to zero across the whole repository. Typed demand, the second row above, is
not in the old table at all, and it has been feeding To Order since 0319/0320.

### What is derived, and over which lines

**The unit of the derived STATE is not the line — it is whatever SET of lines the screen is
showing.** `poReceivingProgress` (`packages/shared/src/po-receiving.ts`) is the one place
these quantities become words. It sums the lines it is handed and returns ONE state for that
set:

| Screen | Lines handed in | So the state is |
|---|---|---|
| Purchase Orders row · Receiving row · Warehouse Incoming | every line of the PO | per PO |
| the balance-delivery-date modal | one line | per line |

Same function, same rule, different scope. Reading a per-line formula as the thing that
drives a per-PO pill is exactly the mistake this section used to invite.

Summed over whichever set is in scope:

```
ordered          Σ qty
received         Σ min(qty, received_qty)
issueQty         Σ damaged_qty  +  Σ wrong_item_qty
pendingDelivery  Σ ( qty − min(qty, received_qty) )
```

### The receiving ladder — FOUR rungs, and the ORDER is the rule

**The first rung that matches wins.** The order is not a tidy listing, it IS the rule, and
reading these four conditions as independent tests is how the wrong formula got published.

```
1  Fully received       ordered > 0  AND  received >= ordered
2  Receiving issue      issueQty > 0
3  Partially received   received > 0        → prints `Partially received (8/10)`
4  In transit           otherwise
```

Read downwards, each rung is a business decision:

- **`Fully received` outranks damage on purpose.** Damaged units that have since been
  replaced leave their counters behind; the state describes TODAY. Without this rung first,
  a PO that was made good would stay red forever with no button to clear it.
- **`Receiving issue` outranks `Partially received`**, and it is a state this section did
  not have at all. 5 of 10 in with 1 damaged reads `Receiving issue` on screen — never
  `Partially received` — because it is the row a human must act on.
- Only rung 3 carries a count in its word.

### The balance number, and why it is clamped

`received_qty` is clamped to `qty` **per line, before summing**. `qty − received_qty` on its
own can go negative, and a stray over-receipt — a data repair, a legacy import — would then
make a PO read as more received than was ordered. Clamped, `pendingDelivery` can never be
negative and `Fully received` can never be overshot into.

**Its word is `Pending delivery`** (R1's locked vocabulary law), and the reason is business
rather than style: the goods are not lost, the supplier simply has not sent them yet.
Nothing may call this number Missing, Short, Lost — **or `Balance owed`, which is what this
section used to call it.**

**A damaged unit counts as pending delivery, not as received.** It physically arrived, but
the supplier still owes a good one. That is also why `received_qty` never absorbs damaged or
wrong-item units: the stock ledger may only ever gain sellable goods.

### The register's rail runs a DIFFERENT ladder, and that is deliberate

The Purchase Orders register's left rail does not run the receiving ladder. `poWorkStateOf`
(`packages/shared/src/po-workspace.ts`) reads the PO's own status, the same clamped
quantities and the supplier's date — and deliberately **not** damaged or wrong item, because
this ladder answers *where are the goods?*, not *did they arrive clean?*

```
1  Cancelled              purchase_orders.status = 'cancelled'
2  Completed              status is not 'open'  OR  ordered > 0 AND received >= ordered
3  Ready to Receive       received > 0            ← something checked in
4  Waiting Supplier Date  no supplier date on the PO
5  Waiting for Goods      otherwise
```

**`Overdue` is not a rung here.** The supplier's date passing is a sub-state of
`Waiting for Goods` and raises an ACTION; it never becomes a progress word of its own
(Jess's state machine, 2026-08-02).

**`purchase_orders.status` is a three-value enum** — `open` · `received` · `cancelled`
(`po_status`, 0001) — and it is a stored column, not a screen word. It is not the five-word
Operation Status axis below, and the rule that `Open` may never appear in the UI is about
the word on screen, not about this formula.

**Two ladders, two questions, and they are never merged.** A screen may show both.

### Supplier fulfilment ≠ goods received — FROZEN by Loo, 2026-08-05

**Three things were being answered by one number, and they are three:**

```
PO Complete   ←  supplier fulfilment confirmed
GRN           ←  the Receiving Session, and nothing else
Inventory     ←  Receiving, and nothing else
```

`Completed` is a statement about the **SUPPLIER**: they finished the job. Everything above
it on this page derives that statement from `received_qty`, which is a statement about a
**Carres floor**. The two agree only when the goods were coming to us in the first place.

**Fulfilment is confirmed PER LINE.** *"本来就是一项一项"* (Loo, 2026-08-05). A line is
fulfilled by its own path and a purchase order is finished when all of its lines are, so a
**MIXED** purchase order is normal, not an error — PO-2032 is one today. Nothing may ask
*"which path is this PO on?"*: that question has no answer for a mixed document, and
answering it would mean refusing at issue something the business does every week.

**Who confirms it, by path — and the warehouse path gains NO button:**

| Path | Who confirms fulfilment |
|---|---|
| goods come into a Carres warehouse | **nobody presses anything** — posting the Receiving Session IS the confirmation, and a second press over the same goods is the second data-entry step Receiving exists to remove |
| the goods never touch a Carres floor — **a carrier takes them to the customer, OR the customer collects at the factory** | **Operation confirms it explicitly** — no Receiving Session can ever exist for those goods |

**TWO PATHS, NOT THREE — and *"顾客自己去厂里拿"* is the second one.** Loo raised it on
2026-08-05 and asked what it belongs to. **Fulfilment asks one question: did the supplier
hand the goods over?** Customer-collects and carrier-delivers answer it identically, so they
are one path. **Who carries the goods is a DELIVERY fact**, which already has its own home;
opening a second fulfilment path because the carrier changed would keep two mechanisms alive
to answer one question. The only real difference is EVIDENCE — a carrier reports back, a
self-collection is reported by the factory — and that rides the record's note, never a new
path. What self-collection DOES change is on the Orders side (no delivery arranged, no DO, no
delivery fee), and that is the Delivery module's, not Purchasing's.

**Fulfilment carries its OWN record — who · when · which path.** It may never be expressed
by writing `received_qty`, and never by reusing a Receiving status. That is this section's
own rule one paragraph down — *a quantity means exactly one thing* — applied to the one
place it was about to be broken: `received_qty` means units physically received into a
Carres warehouse, and a purchase order made to look finished by moving it would put goods
on a floor they were never on, in the ledger the next order is sold against.

**MEASURED ON LIVE PRODUCTION, 2026-08-05 — this is not hypothetical and it is already
stuck.** A destination is either linked to a warehouse or carries a plain address (0307's
own constraint), so the path is readable today with no new column:

```
Carres Klang       warehouse-linked      24 POs
AL Sungai Buloh    address only           2 PO LINES   ← never reaches a Carres floor
HOUZS              address only           0
```

Both lines sit on **PO-2032**, a three-line purchase order — 0311's own worked example word
for word (*"one of them to AL Sungai Buloh because AL collects it and takes it straight to
the customer"*). No Receiving Session can ever exist for them, so `received >= ordered` can
never become true, so **PO-2032 can never reach `Completed` under the rail ladder above.**

**The rule is frozen; the fulfilment record is NOT built.** It is the buyer's, never a
Receiving screen (§1's role-anchor rule), and it has its own card. Until it ships, a
direct-to-customer line simply has no way to be finished, and **nothing may close the gap
by writing a receipt that did not happen.**

Model detail — the fields, the two paths and what Receiving may never own:
[`RECEIVING-INFORMATION-MODEL.md`](RECEIVING-INFORMATION-MODEL.md) §1.1 · §1.2.

### What "still to buy" really asks

**It is not `required_qty > po_qty`.** That test was published here, it is wrong in two ways
that both change what gets bought, and neither of its two names is a real column — the second
is `purchase_order_lines.qty` and is written `qty` below. What To Order computes
(`apps/api/src/routes/operation/to-order.ts` → `netRequirements` in
`packages/shared/src/net-requirements.ts`) is a greedy allocation of demand against supply:

```
demand    order_lines.qty                     customer orders
        + purchase_demands.remaining_qty      typed demand, > 0 and not cancelled

supply    Σ ( qty − received_qty )            purchase_order_lines
                                              where purchase_orders.status = 'open'
                                              and that remainder is above zero

to order  demand − supply, allocated earliest deadline first
```

- **A part-received line still supplies its balance.** A PO of 10 with 6 received covers 4
  of the demand, not 10 and not 0. The ordered quantity alone would count all 10 and under-buy.
- **A cancelled PO supplies nothing at all.** `purchase_orders.status = 'open'` is the filter,
  so the requirement returns to To Order the moment a PO is cancelled. The ordered quantity
  alone would count it forever and never re-buy.

**Free ready stock is a supply pool too, and it is deliberately not consumed automatically**
(`consumeFreeStock` defaults off — goods are labelled per order). The engine computes the
offer and a human decides whether to take it (card P10).

**There is no generic `Ordered` state on screen** (Jess, 2026-08-01, final). A row whose item
has no purchase order says `Yet to Order`; a row that has one shows the purchase order's
number, and the list of numbers is itself the ordered set. The only order-level word is
`Partly ordered` — some items bought, some still to buy — which is a fact about the ORDER and
could never be said on a row.

**TWO INDEPENDENT STATUS AXES — FROZEN 2026-07-29 by Loo. They are never merged:**

| Axis | What it is | Who moves it |
|---|---|---|
| **Operation Status** | Carres' own workflow: `Issued` · `In Production` · `Receiving` · `Completed` · `Cancelled` | Carres |
| **Supplier Status** | what the factory and the logistics partner report | the supplier portal and the partner portal |

A screen may show both. **Neither is ever collapsed into the other**, and the supplier axis is
not a Purchasing decision to redefine — two external roles run their whole lifecycle on it.

**`Open` may not appear in the UI as an Operation Status. The word is `Issued`.**

**THERE IS NO `Draft` OPERATION STATUS** (Loo, 2026-07-30 — the Purchasing clean restart).
A purchase order exists only once it has been issued, so there is no state before `Issued`
and no stored object that could occupy one.
See [`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) §2–§3.

**DEMAND THAT NEVER REACHED THE PLAN IS ALSO NOT IN THE ARITHMETIC ABOVE.** A demand quantity
only reaches "still to buy" for a line the plan could read. Two kinds of demand cannot be
described by any formula above and **may never be silently discarded**:

- **the configuration is missing** — the supplier cannot be resolved, or production working
  days are not set for that supplier × category (§2)
- **a human held it** — excluded, time-boxed or snoozed

They are two different business facts and neither may be dropped. **How each is presented —
which region carries it, what it must state, and why the two may never share a voice — is
[`PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) §3 · §6.7.**

**There is no cancelled quantity, and purchasing does not model a cancellation**
(Loo, 2026-07-28). A customer may not cancel an order in the normal course; a cancellation
needs management approval and normally happens because Carres made a mistake, so it is ruled
by the Orders cancellation policy — not here. **Purchasing keeps processing a valid PO until
Operations explicitly says to stop**, and stopping is the whole PO
(`purchase_orders.status = 'cancelled'`, which already exists), never a quantity typed onto a
line. A per-line cancelled quantity would be a second way to say the same thing and would put
a policy decision into an arithmetic column.

**A quantity means exactly one thing.** No column is ever reused to mean a second thing —
that is how a number quietly stops being true, and how a lock ends up reading a column
nobody writes.

**Deliberately not stored:** the finer quantities an ERP eventually grows
(`in_transit_qty`, `ready_for_collection_qty`, `supplier_confirmed_qty`). **Zero purchase
orders exist in the system today** and a column nobody writes is worse than a missing one;
they are built when a real PO needs them.

**PO revisions are not a gap any more — they are ruled out.** A sent PO is never edited: more
items means a NEW PO (§3), and stopping one means cancelling the whole PO. So there is no
version of a sent PO to keep, and the question "what did the supplier actually agree to?" is
answered by the document they were sent, which never changes.
