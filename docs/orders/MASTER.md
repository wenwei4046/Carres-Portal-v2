# ORDERS — MASTER

> ## ⛔ ORDERS V1 IS FROZEN — the reference implementation (Loo, 2026-08-06)
>
> **It has completed its purpose.** It is the only place in the business where the whole
> customer journey was built end to end, and its measured record is the evidence base for
> [`../ERP-ARCHITECTURE.md`](../ERP-ARCHITECTURE.md).
>
> **Do not spend engineering time polishing V1.** The bar is a **production-critical defect** —
> D1 (the list telling an operator to buy goods already bought, on 4 named orders) and D2 (a
> receive written with no record) cleared it; **D3 · D4 · D5 · D8 · D9 do not.**
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
- **Everyone sees every order.** No per-owner row filter; anyone may open any order. The PIC
  says who is answerable, not who is allowed.
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
`apps/web/src/pages/operation/OperationOrdersControl.tsx`, **5,121 lines** ·
route `/operation/orders` · ***measured 2026-08-06 — every line of logic read end to end;
the JSX read structurally.*** It merges three legacy surfaces — the 6-column kanban, the
AutoCount triage Inbox and the flat read-only feed — into one table.

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
manager session. A non-manager is defaulted to their own PIC filter on first load, once.

```
FACET RAIL     QUEUES (the module's open actions, danger group first) ·
               DEADLINE (Overdue · Due ≤3d · This week · Next week) ·
               TEAM (per PIC) · LOGISTICS · CATEGORY · FIX DATA · Owing
TABLE          Status(pill + 3 dots) · Order · Customer · Deadline · Stock ·
               Delivery · PIC · Actions(verb-led line + `+N`)
               rows 40px · default order = risk to the promise
FOOTER         the count band
```

**Measured on production 2026-08-05 at 1440×900:** table 1012px in 951px available, 32 clipped
cells of 300 (all `Actions`, which needs 249px on every row and gets 208.5), 16 fully visible
rows. **The residual truncation is ACCEPTED** — the verb and the party are visible, the full
text is in the `title` and in the drawer.

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
ready **AND** the payment condition passed — **all four. The action appears only when it can
actually be done.** The SYSTEM produces the document; **nobody writes one by hand**, and the
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

### THE GATES — different from display order

**A gate REFUSES an action. Display order only decides what is read first.**

**Issuing the delivery order is the HARD gate**, not agreeing a date: a date can be agreed while
the goods and the money are still coming. Issuing is refused unless every goods line is reserved
to this order (accessories pass automatically), **the money is collected**, and the date is not
a Sunday or a Malaysian public holiday.

**An unpaid storage fee is part of the money, and there is no softer rule for it.**
`orderMoney` returns `holding` beside `outstanding` and `holds` beside `owing`, because
**a release must lift the HOLD without forgiving the MONEY.**

**The emergency override — the only way past it.** **The manager approves it, nobody else.**
Two outcomes, and the approver picks one out loud:
- **released, fee still owed** — the goods go, the money action stays open. **This is the
  default; an override must never quietly forgive money.**
- **released and waived** — written off with a reason. `storage_fee_override = 0` already means
  *owes no storage fee*, so `approved` means RELEASED, not FORGIVEN, and the figure written off
  stays on the record.

**Operations is told by the work itself** — the moment the override is granted, the order's top
action changes from collecting to delivering. **No separate alert engine.**

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
| the money GATE and the arithmetic | **THE OWNER** | `orders.paid` | `outstanding = 0` |
| collecting the money | **a trigger** | `order_payments` — [`../payment/MASTER.md`](../payment/MASTER.md) | **0 rows: the ledger has no reader; `orders.paid` is the truth** |
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
