# PURCHASING — MASTER

> **This is the ONLY Purchasing document.** There is no queue file, no checkpoint, no
> information model, no map, no NEXT. When something is re-ruled, **this file is overwritten**
> — never annotated "superseded", never copied to a v2. **Git history is the archive.**
>
> **You read `CLAUDE.md` (the Constitution) and this file. That is all.**
> Open `COPY-STANDARD.md` only when you need a word, `ACTION-FLOW-STANDARD.md` only when you
> need the engine law, `01/02/03-*.md` only when you need a token.

## How to use this file — go straight to your business object

**Organised by what you are working on, not by document type.** You are not looking for
"the workflow"; you are looking for **Receiving**.

| I am working on | Read |
|---|---|
| anything | **§1 · §2 first — they are short and they bind every tab** |
| To Order / Create Purchase | **§3** |
| Purchase Orders | **§4** |
| Receiving | **§5** |
| Claims | **§6** |
| Report | **§7** |
| Settings | **§8** |
| a decision that crosses tabs | **§9** |
| something already approved and deliberately not built | **§10 Approved Evolution** |

**Every object section has the same six blocks:** `MISSION · WORKFLOW · WHAT IS ON SCREEN
TODAY · API + DATA · FROZEN RULES · APPROVED EVOLUTION`.

**Update law.** Ship something → this file is overwritten in the same PR. The
`WHAT IS ON SCREEN TODAY` block and its `measured` line are what a chat trusts; **a stale one
is the single most expensive defect this document can carry.**

---

# §1 · Overview

**Purchasing buys what customers have already ordered, and what the warehouse needs on the
shelf.** It is the buyer's module. It does not own goods movement (that is Receiving's
warehouse half and Stock) and it does not own money (that is Finance).

**Six tabs, one chain:**

```
Create Purchase ─▶ To Order ─▶ Purchase Orders ─▶ Receiving ─▶ Claims
                                                       │
                       Report (read-only)   ·   Settings (manager-only)
```

**Before you change any tab, answer both:** does what upstream sends still get in, and can
downstream still catch it?

**Live scale, measured 2026-08-05.** Every row is TEST data — at go-live the database starts
clean. These numbers are evidence about whether CODE WORKS, never about business volume.

```
purchase_demands   2      purchase_orders   24  (22 open · 16 with no arrival date)
purchase_order_lines 38   units ordered     47
received / damaged / wrong    4 / 1 / 0
warehouse_receipts 3      receiving_events   3      supplier_claims 1     units on_hold 0
suppliers 10  —  5 have no WhatsApp group, 0 of 10 have a phone
```

---

# §2 · What crosses every tab

## 2.1 · The shell

ONE white 44px header row (`PurchasingTabs.tsx`). **Pages draw no header of their own** — no
breadcrumb, no `<h1>`, no page-level icons. A page structurally cannot forget the header
because it never draws one.

**One Workspace template**: 200px navigation rail → kit `DataTable` listing (for FINDING —
sort, filter, search) → 400px workspace pane (where the WORK happens). Receiving, Purchase
Orders and Report all run it. To Order runs the same shell with a launcher rail.

## 2.2 · Shared machinery — one home each, and a second copy is a defect

| Concern | The ONE home |
|---|---|
| action words (queue · line · button · done · empty) | `packages/shared/src/order-action-words.ts` — `PurchasingActionKey`, six keys |
| the supplier calls and their due dates | `packages/shared/src/purchasing-supplier-calls.ts` |
| the receiving ladder (4 rungs; the ORDER is the rule) | `packages/shared/src/po-receiving.ts` |
| PO risk order | `comparePoRisk`, `packages/shared/src/po-workspace.ts` |
| claim lifecycle, asks, answers, close gates | `packages/shared/src/supplier-claim.ts` |
| quarantine outcomes + status mapping | `packages/shared/src/stock-hold.ts` |
| the engine's numbers | `packages/shared/src/purchasing-settings.ts` + `purchasing_settings` |
| who is on PO duty this month | `ops_po_duty` → `GET /operation/po-duty` → `useOperationPoDuty()` |
| the rail recipe · the facet row | `components/rail/workspace-rail.tsx` · `components/FacetRow.tsx` |

> **`org_duties` does NOT hold the PO-duty holder.** Its six keys are `ops_manager` ·
> `po_duty_editor` · `account_creator` · `finance_approver` · `roster_editor` ·
> `stock_planner`; `po_duty_editor` is *the person who edits the rota*. The rota is
> **`ops_po_duty`** (month → user). Live: Jul = Shasha · Aug = **Yu Jun (CR004)** · Sep = Khor Yee.

## 2.3 · The numbers the engine reads

Seven, all manager-editable on **Settings**, all audited (who · when · what it was before).
**A supplier × category with no number is NOT defaulted to 7** — it reads `Set a number`, gets
no order-by date at all, and To Order names the pair out loud. Migration 0303.

```
production working days   mattress 7 · bedframe 7 · sofa 14
order-by buffer           7 today → 10 at go-live
PO days                   Mon · Wed · Fri
supplier work week        per supplier (Ohana works Saturday)
```

## 2.4 · Words

**A word not in `COPY-STANDARD.md` may not appear on screen. Stop and ask Loo.**
Seven portal verbs: `Assign · Call · Issue · Upload · Close · Return · Check`.
Retired and permanently banned from reuse: `Chase` · `Send` (as an action) · `Contact` ·
`Prepare` · `Draft PO`.

## 2.5 · A measurement trap that has cost this module real time

> **`apps/web/src/pages/operation/OperationSupplierClaims.tsx:240` holds a NUL byte** (a
> deliberate sort-key separator). **Shell `grep` treats the whole file as binary and returns
> NOTHING without `-a`.** Node's `readFileSync(…, "utf8")` is unaffected, so the repo's own
> test guards are safe — a chat measuring by hand is not.

**And the general form of it:** `grep` answers *"is the word I already thought of present?"*.
It cannot tell you about a button you have not imagined. **Read the file.**

---

# §3 · To Order

### MISSION
Decide which customer orders become purchase orders **today**. Purchase Orders MANAGES the
documents once they exist.

### WORKFLOW
The engine computes a plan per PO day and pre-selects exactly its own plan (`orderBy ≤ today`).
Rows in later buckets start unticked and a human ticks them — **human ticks are DELTAS a
refetch cannot overturn.** `Issue` posts one call per supplier × category group.

**Ready stock is SUGGESTED, never consumed** (Jess, 2026-07-21). The engine allocates the free
pool earliest-deadline-first and shows the operator a number and the records behind it; a human
presses `Reserve`. Whole records only — a bulk record that would over-reserve is skipped, never
split. Every draw records a reason on K4's dated ledger.

### WHAT IS ON SCREEN TODAY
`OperationToOrder.tsx`, 1,965 lines · route `/operation?tab=purchase` · *measured 2026-08-05
from its docblock and its named controls; not read line by line.*

```
LEFT 200px    PO SCHEDULE  rolling calendar of configured PO days, red OVERDUE row above it
                           which the next run may never swallow
              CATEGORY     All · Mattress · Bedframe · Sofa, with UNIT counts (bare numbers)
              + Create Purchase        the manual entrance — may never be missing

RIGHT         toolbar  pill search · selection state · Issue pill (exists ONLY while
                       something is selected) · quiet `Updated hh:mm`, never a Refresh
              grid     SIX frozen columns · header-click sort · per-column ▼ filter
                       the PO filter speaks business: `Not Ordered` / `Ordered`
              footer   units per category
```

**Controls** `to-order-create-purchase` · `to-order-issue` · `to-order-retry` ·
`to-order-cancel-dialog`/`-qty`/`-submit` · `to-order-clear-filters` · `to-order-footer-clear`

**Create Purchase** is a multi-line dialog (`+ Add line` / `Remove`, 600px wide). One POST per
line; a created line can never post twice because the loop walks only rows that are not
`created`; a failed line keeps the server's own sentence and `Create` retries exactly those.

### API + DATA
`GET /operation/purchase/to-order` · `GET …/demand/pick-items` · `POST …/demand` ·
`POST …/demand/:id/cancel` · `POST …/issue` · `POST …/take-stock`
Tables: `purchase_demands` (**2 rows**) — one row per SKU; `issued_qty` is writable only
through `purchasing_demand_record_issue` and `remaining_qty` is GENERATED (0320), so two stored
numbers can never disagree. A cancel stamps `cancelled_at` and lets the remainder FREEZE (0321)
— **no cancelled-quantity column exists, deliberately.**

### FROZEN RULES
- **`Order By` never reaches the screen.** Each row carries it only to know its time bucket;
  the operator sees the CUSTOMER's date.
- **Issue = zero popups, zero toasts.** Rows update in place; a partial failure stays with
  `Retry` until it succeeds.
- **No Status pills, no Sort By, no Group By** — two filter doors for one fact is the Excel sin.
- **The engine owns the schedule; operators own the PO.** `Hold` / `Skip` / `Next-Run` /
  `Postpone` are banned forever. The two exceptions are `Change Required Date` and
  `Cancel Purchase`.
- **A sofa line with no modules carries its own quantity**; a group of more than one line is a
  build and collapses to 1.
- `resize` and `reorder` are **REFUSED here in writing** (Q6) and a test asserts their absence:
  nothing truncates at any viewport from 1024 up, and there are four columns, not nine.

### APPROVED EVOLUTION
- **The Planning Workspace** — the frozen information architecture made true on this tab.
  Six measured gaps carry it: **G1** demand whose supplier cannot be resolved is silently
  discarded · **G2** supplier resolution runs by TWO different rules in one module (planning
  by the item's own supplier; PO creation also by category coverage) · **G3** intentionally
  held demand produces no output at all — it must state what · who · why · until when ·
  **G5** `Check in` must leave To Order and **Receiving must gain PO · supplier · customer name
  · SO number · warehouse · ETA · quantity-still-to-receive FIRST**, or information is deleted ·
  **G8** the group header's bare date carries TWO facts under NO word (a customer's
  `Customer Delivery` and a typed demand's `Required By`) · **G10** the `PO No.` cell holds a
  status word and an action button in one column, which §9's own rule forbids.
- **The September switch** — Nice Future stops supplying; a new mattress supplier takes over on
  the subscription model. Sofa and bedframe unchanged.

---

# §4 · Purchase Orders

### MISSION
Pick today's purchase order → update supplier progress → talk to the supplier → hand over to
Receiving.

### WORKFLOW
A PO is ISSUED as one act (there is no draft). The portal then asks the supplier three
questions in order, and each one closes only while the answer still names the CURRENT facts:

```
Confirm ready date              when will it be finished?
Confirm tomorrow's delivery     is the van going tomorrow?
Confirm balance delivery date   per PO LINE, after a short delivery
```

**Every promise is kept, never overwritten** — `po_supplier_promises` is append-only and each
row names what it was made ABOUT, so a factory that slips again re-opens the call by itself.

> **⚠️ ONLY TWO OF THE THREE ARE ACTUALLY ASKED.** Measured 2026-08-05:
> `purchasingSupplierCallsOf` (`packages/shared/src/purchasing-supplier-calls.ts:55`) has
> exactly two keys — `confirm_tomorrows_delivery` · `confirm_balance_delivery_date`.
> **`confirm_ready_date` is not in the purchasing engine at all**; it exists only in the ORDERS
> ladder (`order-action-words.ts:148`), which is a different screen. So this tab has the DOOR
> (the `Supplier Ready Date` field on the expand, and `purchasing_record_ready_date`,
> migration 0318) and **no queue, no trigger, no due, no count and no way to turn late.**
> Loo ruled the action onto this tab on 2026-08-05 — *"queue and door in one place"* — and the
> queue never followed. **1 of 24 POs carries a ready date.** Building it is in
> APPROVED EVOLUTION below; nothing about it is undecided.

### WHAT IS ON SCREEN TODAY
`OperationPurchaseOrders.tsx`, 3,167 lines · route `/operation/procurement` · *measured
2026-08-05 from its docblock and its 44 named controls; not read line by line.*

```
LEFT 200px   CALLS        Overdue · Today · Tomorrow
             WORK STATUS  Need Supplier Confirmation · Waiting Goods · Ready to Receive · Completed

CENTRE       NINE frozen columns, ONE fixed set:
             PO Issued · Supplier · PO No. · SO No. · Items · Destination ·
             Customer Delivery · Expected Arrival · Current Action
             widths 96 · 88 · 83 · 95 · 136 · 135 · 140 · 206 · 192, min-width 1208
             default order = RISK TO THE CUSTOMER'S PROMISE

RIGHT 400px  WORKING HEADER → REFERENCE LAYER → SUPPLIER FOLLOW-UP →
             RECEIVING SUMMARY → ACTIVITY
```

**Controls** `po-date-open`/`-form`/`-input`/`-save`/`-reason`/`-remarks`/`-extend` ·
`po-ready-date-open`/`-input` · `po-print-pdf` · `po-open-whatsapp` · `po-open-email` ·
`po-copy-message` · `po-wa-toggle` · `po-save-template` · `po-history` · `po-activity` ·
`po-panel-items` · `po-panel-close` · `po-overdue` · `po-arrival-gap`

### API + DATA
`GET /operation/pos` · `/:id/print-data` · `/:id/receiving` · `/:id/source-orders` ·
`/:id/units` · `/awaiting-stock-shortage` · `/report` · `POST /` · `/batch` · `/:id/ready-date`
· `/:id/tomorrow-delivery` · `/:id/sends` · `/:id/cancel` · `/:id/office-receive` ·
`/:id/assign-pickup-partner` · `/:id/reassign-warehouse` · `/:id/chase-event` ·
`POST /lines/:lineId/balance-date` · `/destination` · `/ops-remark` · `/split` ·
`PUT /message-template`

Tables: `purchase_orders` **24** · `purchase_order_lines` **38** · `po_history` **23** ·
`po_sends` **3** · `po_revisions` **2** · `po_supplier_promises` **6**

### FROZEN RULES
- **The nine columns NEVER change because the panel opened.** No compact variant. When they do
  not fit, the LISTING REGION scrolls sideways — deleting a business column to avoid a
  scrollbar is forbidden. `resize` and `reorder` are how an operator rebalances.
- **ONE purchase order, ONE way of looking at it.** State is `{ poId, mode }`: row click opens
  the panel · the ⌄ expands the row and CLOSES the panel · collapsing brings it back on the
  same PO. Two POs on one screen are structurally unrepresentable.
- **PO-line quantities are RPC-only** (0316). No client may PATCH `received_qty`.
- **A sent PO is never edited.** More items means a NEW PO; stopping means cancelling the whole
  PO. There are no revisions to keep.
- **The portal never claims it sent anything.** Pressing a channel button records
  `{Channel} opened · Snapshot N` — a click is all the system observed. Print writes no history,
  moves no status, mints no revision and has no limit.
- **Communication is not part of the PO lifecycle** — never a status, never a stage.
- **Row order is risk to the customer's promise**, and clearing a header sort returns to it.
- **Red is reserved for a date the factory GAVE.** Our own estimate warns amber. **⚠️ The code
  can no longer tell the two apart — see APPROVED EVOLUTION. The rule stands; its test is
  broken.**
- **One editing surface per fact.** The expand is the working area; the right panel is Activity.

### APPROVED EVOLUTION
- **The page must stop calling our own arithmetic a supplier's word** (Loo, 2026-08-05).
  Provenance is decided by a NULL TEST — `OperationPurchaseOrders.tsx:519`,
  `if (po.eta_date) { confirmed: true }`. That was correct until **2026-08-03**, when commit
  `1ddfce7e` *"a purchase order is born with its expected arrival"* made the To Order issue
  path stamp **our own estimate** into `eta_date`. A null test can no longer tell a promise
  from a guess. **Measured on production 2026-08-05: FIVE POs carry an arrival date with ZERO
  supplier answers behind it** — `PO-2050` · `2051` · `2052` · `2053` · `2054`, and it was two
  that morning; the arithmetic reproduces exactly (`issued + production on the supplier's week
  + transit on the office week`). Each renders **black, no tooltip**, `Current Action` `—`, and
  is counted in `Waiting Goods` — four signals saying the factory has spoken when nobody has
  asked it anything. **`PO-2052` is the sharpest: it holds a REAL ready date (12 Aug) beside a
  self-computed arrival (14 Aug), both in black.** **It grows and it eats a rule that shipped
  the day before**: every PO born from 3 Aug carries a date, so `Need Supplier Confirmation`
  becomes unreachable for new purchase orders. **Fix, and no migration is needed:**
  `po_supplier_promises` is append-only and already holds every arrival a supplier has ever
  given (`kind='tomorrow_delivery'`; a `ready_date` row is fact ① and must NOT count), and
  `pos.ts:163` already reads it — so `confirmed` becomes *"is there a recorded supplier
  answer"*, and `poWorkStateOf` reads provenance rather than the raw date. **Do NOT stop the
  issue path stamping `eta_date`** — 0306 refuses to open on a NULL arrival and a shipped
  supplier call would go dark — and **do NOT gate the tomorrow call on provenance**: firing on
  our own estimate is exactly the phone call that gets the first real date, and the RPC's
  `v_first` branch was built for it.
- **ONE arithmetic for the expected arrival, not two.** `to-order.ts:1116-1124` computes
  `production` on the FACTORY's week then `transit` on the OFFICE week (Law 2A);
  `OperationPurchaseOrders.tsx:533` computes `placed_at + production` and **never adds
  transit**. Both live suppliers carry `transit_days = 1`. Recomputed over the 16 dateless POs
  (Malaysian public holidays checked — none between 1 and 19 Aug 2026) **the missing day bites
  three rows**: `PO-2036` is silent where it should read `same day`; `PO-2049` and `PO-2042`
  read amber `same day` where the truth is red `1d late`. **One page under-warns by exactly the
  day it forgot.** Extract one exported function and make both callers use it — a second copy
  is the disease this repository keeps paying for.
- **`Confirm ready date` needs the queue to go with its door** (Loo, 2026-08-05 — see the
  ⚠️ under WORKFLOW). A third key in `purchasingSupplierCallsOf` on the same rules as the two
  beside it: **no anchor, no call**, and an answer closes it only while it still names the
  current facts. **Nothing here is a new decision** — the trigger, checklist, completion,
  due (`customer date − production working days − buffer`), owner (the PO-duty holder) and
  count (one PO) are ruled, and COPY-STANDARD already carries the five strings. No migration
  (0318 shipped the database half); no new word; no second door — the expand's field is the
  one. **A supplier × category with no production number gets NO due rather than a default:
  P1 deleted exactly that habit.**
- **A ready date the factory gives MOVES the expected arrival — and never overwrites it**
  (Loo, 2026-08-06). Today it does not, and `PO-2052` is the cost: the factory's real
  `Ready Date` of 12 Aug sits beside a self-computed `Expected Arrival` of 14 Aug, when
  12 Aug + Ohana's 1 transit day is 13 Aug. **The rule: recording a ready date writes a new
  expected arrival of `ready date + transit working days on the OFFICE week` (Law 2A), and the
  new date becomes the one the register shows.** A supplier × category with no transit number
  gets NO new arrival rather than a guessed one — P1's habit, unchanged.
  **His condition is the important half — the old date is kept and stays visible:**
  *"it should NOT overwrite — show original and new date; obvious is the new day, the original
  hidden but you can still see this is updated."*
  **Nothing new is built for that and that was measured before he chose it.** The ledger is
  already append-only, so no date is ever destroyed; the cell already prints the `(revised)`
  marker (`OperationPurchaseOrders.tsx:1194`, fed by `eta_revised` at `pos.ts:408`), and the
  expand already prints the numbered history (`poDateHistoryOf`). **The column does not grow:**
  the cell's own docblock already names `25 Aug 26  8d late (revised)` as the widest string it
  holds. **He was shown the two alternatives and rejected both** — printing both dates inline
  (`13 Aug 1̶4̶ ̶A̶u̶g̶`) needs roughly 70px more in a column frozen at 206px, which would take
  pixels from one of his own nine widths; hover-only is invisible on a tablet.
  **Deliberately still separate: `expected_ready_date` and `eta_date` remain two columns and
  two facts.** This links them at the moment of recording; it does not merge them.
- **Prove it with a real PO, end to end** — the line has never run. Two gates have no home yet
  (a PO cannot be issued twice for the same customer line and quantity; a check-in cannot be
  posted twice for the same supplier DO number), and **whoever is on an action must show on
  it** — a lightweight claim `(action identity) → claimed by → claimed at`, expiring on
  `ACTION_CLAIM_TIMEOUT_MS` (already exported from `packages/shared/order-actions.ts` — import
  it, never retype the number), read ONLY through the open-action list. **`ops_tasks` has
  `claimed_by`/`claimed_at` and is still the WRONG home**: minting a task row per engine action
  turns the ladder back into a manual to-do list.
- **Fulfilment ≠ received.** A PO whose goods never touch a Carres floor must still be able to
  finish. **Two paths, per LINE** (*"本来就是一项一項"*): into a Carres warehouse → the
  Receiving Session IS the confirmation, **no button**; never touching a Carres floor →
  Operation confirms explicitly, and **customer self-collection is that second path, not a
  third**. Fulfilment carries its own record — who · when · which path — and may **never** be
  expressed by writing `received_qty`. **Measured: PO-2032 carries two lines to an
  address-only destination, so it can never reach `Completed` today.**

---

# §5 · Receiving

### MISSION
Book in what physically arrived, through ONE door that leaves a record.

### WORKFLOW
`Read Mode → Start Receiving → Receiving Mode → Save → Posted`. An Office receive opens a
Receiving Session and writes ONE `posted` event, through the same validator and the same
receive engine the warehouse uses. **A `submitted` event is deliberately NOT written for the
Office path** — two people and two acts is the Warehouse; one operator pressing Save once is
the Office, and an event records what happened in the BUSINESS world, not the steps the system
walked.

Damaged or wrong units become `on_hold` at the moment of receipt and stop counting as future
supply (0299), and a claim is raised automatically (0288's trigger).

### WHAT IS ON SCREEN TODAY
`OperationReceiving.tsx`, 983 lines · route `/operation?tab=receiving` · *measured 2026-08-05:
docblock, rail definition and `actionWordOf` read; not read line by line.*

```
LEFT 200px   RECEIVING PROGRESS  Receiving issue (danger) · Partially received ·
                                 In transit · Fully received
             SUPPLIER            per factory
             SOURCE              last

CENTRE       SEVEN columns: PO Issued · Supplier · PO No. · Items · Goods Arrival ·
             Received · Current Action.  Default order = PO Issued OLDEST first.

RIGHT 400px  ONE PO's Receiving Session. Receiving Mode takes the stage rather than
             opening an overlay — five lines with three numbers each do not fit in 400px.
```

**Controls** `receiving-rail` · `receiving-listing` · `receiving-workspace-toggle`/`-pane`/
`-page` · `receiving-clear-filters`

### API + DATA
`POST /operation/pos/:id/office-receive` (→ `office_receive_post`, 0315) ·
`GET /operation/warehouse-receipts` · `POST /:id/check-in` · `POST /:id/send-back`
Tables: `warehouse_receipts` **3** · `receiving_events` **3**

### THE INFORMATION MODEL — frozen

**ONE physical delivery (one truck) = ONE Receiving Session.**

- A missed line on the same truck is an **Amend** on the same Session — never a second one.
- A genuinely second truck is a NEW Session (a normal partial delivery).
- A wrong record (wrong qty / PO / DO) is a **Void** plus a correct new Session.
  **History is never overwritten and never edited in place.**
- **Duplicate guard: same Supplier + same PO + same DO number cannot create a second live
  Session.** One DO number MAY span several POs — one van, two POs is legal, and each PO gets
  its own Session.
- **A field's owner is the module that CREATES it.** Foreign fields display read-only with a
  jump to their owner. The Session owns: session id · PO ref · **the warehouse SNAPSHOT**
  (never re-derived after a PO relocation) · supplier DO number · lines (received-this-time as
  a DELTA · damaged · wrong · photos) · the internal note, **which is never mixed with
  supplier-facing text.**

**THREE TIMES, never one `created_at`:**

| Time | Set by | Editable | Means |
|---|---|---|---|
| **Goods Received At** | human | ✅ default today; never future; never before the PO date | when the goods PHYSICALLY arrived |
| **Submitted At** | system | ❌ | when it entered the system |
| **Posted At** | system | ❌ | when it hit the books |

**Friday's truck keyed in on Monday reads: Received Friday · Submitted Monday.** Reports use
the business date, audit keeps the system dates, **and both are true.**

**THE EVENT LEDGER IS THE ONE HISTORY.** `receiving_events` is append-only; the Activity
timeline reads it **and nothing else.** A single status column loses *"was once returned"* the
moment it resubmits, and a second return overwrites the first reason.

**Event names are business facts and the list is CLOSED:**
`submitted · returned · resubmitted · posted · voided · amended`
(**`resubmitted` is a first-class event — never `submitted` with a flag.**)

**The payload dictionary is closed too, and a new key enters the table before it enters any
payload:** `do_number` · `goods_received_at` · `units_counted` · `entry_source`
(`office | warehouse`) · `reason` · `claims_linked` · `changes`.
**Both doors write the same five keys on `posted`**, so a report over the ledger reads the same
regardless of which desk keyed the count — which is why the Office's single act **widened the
payload rather than manufacturing a `submitted` event nobody performed.**

### FROZEN RULES
- **The Supplier DO number is THEIRS.** No default, no suggestion — a number we invent is a
  reference the supplier never issued, and it defeats the duplicate guard that reads it.
- **`Received` is PRINTED, never left as `5 − 3`.** An operator should never subtract to learn
  what is still owed.
- **The Save button NAMES the gap** (`Save — add a DO number`). A grey button that will not say
  why is a puzzle.
- **No `GRN` tab, ever.** GRN is a document OF Receiving, not a module.
- **The receiving ladder is FOUR rungs and the ORDER is the rule:** `fully_received` →
  `receiving_issue` → `partially_received` → `in_transit`. **Live consequence today: PO-2054 is
  3 received of 3 with 1 damaged, so it reads `Fully received` and the damaged unit is
  invisible on the rail.** That is the published precedence working as ruled.

### THINGS A CHAT GETS WRONG HERE
- **The rail is a PROGRESS rail, not an action queue.** There is no `Check in` queue tile.
- **`Current Action` is NOT limited to `Check in`** — `callsById` is still computed and can
  render either supplier call. Today's data reaches only `Check in`; that is a DATA fact.
- **`OperationReceiving.tsx` says `claim` exactly ONCE in 983 lines.** Receiving is blind to
  what it produces.

### APPROVED EVOLUTION
- **The rail becomes a QUEUE model** (`To Receive` / `Received`), ruled by Jess 2026-08-03.
- **Receiving sees its own Claims** — `Claims · n open · n closed` without switching tabs.
- **⚠️ Both are the RECEIVING workstream's**, on its own worktree. Jess, 2026-08-03: *"Do not
  modify the Receiving module in this Purchase Orders workstream."*
  **UNRESOLVED:** Q14, a Purchase Orders card, edited this file on 2026-08-05. Either her
  ruling is narrower than it reads (the RAIL only), or Q14 crossed it. **Somebody must say
  which, or the next card guesses.**

---

# §6 · Claims

### MISSION
Resolve the exception a receiving produced — and Claims owns the defective item's whole life.

### WORKFLOW
A claim is BORN from a PO line (0288's trigger). **There is no create button and there never
will be** — this is SAP QM's Quality Notification, not a Zendesk ticket, and the reference
object (`PO · SKU · Supplier · DO`) is carried forever.

```
we ask the supplier  →  the supplier answers  →  Carres decides  →  Carres executes
```

A recorded side becomes READ-ONLY prose: the ask FREEZES the moment an answer lands, which is
what makes *"what we wanted vs what we got"* worth reading later. Close is refused, in the UI
and server-side, unless both sides are on file.

### WHAT IS ON SCREEN TODAY
`OperationSupplierClaims.tsx` 854 lines + `SupplierClaimPanel.tsx` 504 lines ·
route `/operation?tab=claims` · ***measured 2026-08-05: the panel was read END TO END, all 504
lines.***

```
LEFT 200px   QUEUES    Confirm what happens next        ← the only queue tile
             SUPPLIER · PROBLEM
CENTRE       kit DataTable, eight measured widths 150 · 111 · 181 · 154 · 147 · 194 · 368 · 134
             status picker Open / Closed / All — a STAGE, one is always on
RIGHT        NOTHING. There is no right panel on this tab.
```

**The expanded row** — a 2-column grid, and the whole 504-line panel lives inside the kit
table's `expansion`:

```
LEFT                                     RIGHT
  Evidence          photos, or             What we asked      ask buttons → [ Send to {supplier} ]
                    "No photo — a late                          or [ Save what we asked ] · [ Copy ]
                     delivery has nothing                        once recorded → read-only prose
                     to photograph."
  The goods         "{n} unit on hold"     What {supplier} answered
                    ○ Put back in stock      ○ Replacement · Deliver remaining · Repair ·
                    ○ Returned to supplier     Return & replace · Reject · Other agreement
                    ○ Write off              note REQUIRED for reject / other agreement
                    note REQUIRED for        [ Save {supplier}'s answer ]
                      write off
                    [ Save what happened ]  Settle it          note (optional) · [ Close claim ]
  Closed            date + close note
```

> **THE FACT MOST CHATS GET WRONG.** The item-outcome picker **already exists and Claims is its
> only home**: `STOCK_HOLD_OUTCOMES` (`packages/shared/src/stock-hold.ts`) is imported by
> **exactly one file in the repository** — `SupplierClaimPanel.tsx` — and its endpoint lives
> under Claims. **Removing it leaves quarantined goods with no way out of quarantine.**
> Shipped by migration **0299**, 2026-07-27.

### API + DATA
`GET /operation/supplier-claims` · `GET /:id/photos` · `POST /:id/request` · `/:id/response` ·
`/:id/hold-resolve` · `/:id/close`
`supplier_claims` — **28 columns, not one is money**; **1 live row**.

**`SC-1014`**, a full end-to-end test on 2026-08-05: `PO-2054 · JAGER-SS · damaged · qty 1 ·
DO-P5-0001 · 1 photo`, reported → requested `replace` → responded `replacement` → closed, **all
four timestamps present** — real data for a timeline to render against.

### FROZEN RULES — the claim model, ruled by Loo 2026-08-05

**The four layers, and they may never be collapsed:**

```
Customer Problem → Supplier Response → Carres Resolution → Carres Execution
                                                     → Stock · Finance · Demand
```

**The test that keeps them apart:** *can both be true at the same time?* **If yes, they are two
fields, not one list.**

**TWO decisions, because they answer two different questions:**

| | Asks | Options |
|---|---|---|
| **Customer Resolution** | what are we doing for the CUSTOMER? | `Replace` · `Repair` · `Accept As-Is` · `No Replacement Required` |
| **Item Outcome** | what happened to THIS item? | `Put Back in Stock` · `Return to Supplier` · `Write Off` |

**The worked case, and it is why the split exists.** The customer cancelled AND the mattress is
destroyed. Under one list the operator must choose which truth to record — **must lie**. Under
two, both are recorded.

**Removed from the resolution list, and do not put them back:**

| Removed | Reason |
|---|---|
| `Return to Supplier` | **it loops back** — "send it back and wait for their next word" resolves nothing. It is an EXECUTION move |
| `Write Off` | answers what happened to the ITEM. It lives in Item Outcome, where it already is |
| `Cancel Outstanding` | replaced by `No Replacement Required`. **`SC-1014` is 3 ordered / 3 received, so outstanding = 0 and `Cancel Outstanding` could not be pressed at all** — the rename changed what the option DOES |
| `Reject` · `Deliver Remaining` · `Replacement` · `Return and Replace` | all SUPPLIER answers, not Carres decisions. `Return and Replace` is two concepts in one option |

**`Refund` is NOT built and NOT deleted.** Supplier credit note? cash? offset against future
purchases? **The business meaning is not frozen and nobody may guess it.**

**Carres Execution — frozen, NOT built:** `Return to Supplier · Collect Defective Item ·
Replace First · Collect First · Exchange on Collection`. No option here may be folded into a
resolution list.

**Five business laws:**

1. **`Replace` = a NEW item.** How the defective item is collected is an EXECUTION decision.
2. **`Repair` = the SAME item**, returning to the SAME customer — unless Carres decides the
   customer cannot wait, in which case the customer gets a replacement first and the repaired
   item goes to warehouse stock. **Carres' decision, not the supplier's.**
3. **Default policy — recover the defective item whenever practical.** Repair for resale,
   reduce losses, preserve asset value. **Not because the supplier asks; because the item is
   still worth money to Carres.** Replacement-first is the exception.
4. **When the supplier refuses, the screen states the fact and stops.**
   `Supplier Response: Rejected` → a waiting state → `Next Action: Select Resolution`.
   **Stock, Finance and Demand are NOT derived until a resolution is chosen** — nothing is yet
   known about any of them, and a screen may only show what is true right now.
5. **Consequences are `f(Resolution, Execution)`, never `f(Resolution)`.** Law 2 is the proof.

**A claim's owner:** the PO-duty holder **of the month it was OPENED in, forever** — it never
changes when the month rolls over, because the person who spoke to the factory is the person
who knows the case. **DERIVED from `ops_po_duty`, never an `assigned_to` column.**

**Where a claim can be born:** ONE engine, and the long-term architecture is two entrances
(Receiving · Service Cases), which is how SAP, Oracle and Dynamics all do it. **TODAY only
Receiving exists**, and that is a ruling with a stated price: 0299's guard allows
`incoming → on_hold` and no other entry, so **a fault found a week after receiving has no
supplier-claim route at all** — it is a service case. **If that changes, the entry rule and the
refurbish door must be settled in the SAME change**, or the refurbish path hands a held unit
back to the pool with no claim ever answered.

### THE PANEL LOO FROZE, 2026-08-05

```
The Item              what this claim is about        (today: `The goods`)
Customer Resolution   what are we doing for the customer?     ← NEW, the whole V1 gap
Item Outcome          what happened to this item?             ← EXISTS, rename only
Evidence              photos
Supplier Response     what did the supplier say?
Decision Guide        live guidance under the selected option
```

**Words still owed to `COPY-STANDARD.md`** — measured 2026-08-05, all zero today:
`Customer Resolution` · `Item Outcome` · `The Item` · `Accept As-Is` · `No Replacement
Required` · `Supplier Response` · `Next Action` · `Resolution` · `Typical examples` ·
`What happens next` · `Refund`.

**Two collisions to settle before they reach a screen.** The dictionary already locked
**`Case owner decision required`** (2026-07-27) for the state Loo spelt
`Waiting Internal Resolution` — same meaning, one must die, and **the locked one has never
appeared on any screen** (grep returns 0). And **`Return`** is a locked VERB meaning *a record
goes back to the party that produced it*; `Return to Supplier` is about GOODS.

### APPROVED EVOLUTION
- **The Workspace layer.** §12.7.5's two-tier split, the un-collapsible `PO · SKU · Supplier ·
  DO` header, a Timeline off the four existing timestamps (**no migration**), the Consequences
  region with its mapping, and the Owner. **⚠️ There is no right panel today** — `w-[400px]`
  greps 0 in that page — so this CREATES the second tier rather than moving things between two.
- **One claim, ONE outcome, and a button that splits it.** Loo ruled option A on AutoCount's own
  evidence (`Cancel Purchase Order` / `Goods Return` / `Purchase Return` are three documents and
  none holds two outcomes). Three binding conditions: **R5 counts problem PO LINES, never claim
  documents** (`ScorecardClaim` carries `po_id` and not `po_line_id`, and `claimRate` keys on a
  Set of distinct POs — the claim STATS move with it or the fix is half done) · **the split is a
  BUTTON**, never *"go and open a second claim"* · **the A→B upgrade path is written down while
  it is free** (every claim becomes one child row: outcome copied, quantity equal to the whole).
  A claim with a NULL `po_line_id` is counted BY NAME, never dropped.
- **Item Outcome wired to the resolution** — pure WIRING: 0299 already ships
  `returned_to_supplier` · `written_off` · `back_to_stock`, and `Replace` is the receive engine.
  `Repaired` and `Disposed` are NOT built: 0299's guard admits exactly three destinations, so
  adding them is a migration.
- **The money, and a Finance queue.** `supplier_claims` has 28 columns and not one is money; the
  cost sits in `purchase_order_lines.cost`. **A Finance Action completes on an EXTERNAL EVIDENCE
  reference** — the supplier's credit-note or debit-note number — never a tick-box, which is why
  §8's ban on self-declaration does not kill the queue. *2990s is the worked example of getting
  it wrong: its `purchase_returns.credit_note_ref` has exactly two readers in that whole
  repository, a PDF and a detail page.* **Operations never sees AP; Finance never sees photos.**
  Jess's locked rule stands and does not block this: hers is the credit note **Carres issues to
  a customer**; this queue records the one **a supplier issues to Carres**.
- **The facet rail filters a table holding 0–5 rows** for the foreseeable future. Law vs
  reality; reported, not changed.

---

# §7 · Report

### MISSION
How many did we buy this month — and every number is a door.

### WHAT IS ON SCREEN TODAY
`OperationPurchasingReport.tsx`, 327 lines · *measured 2026-08-05 from its docblock.*
200px rail (`Month` · `Supplier` · `Category`, all three toggle) → grouped table → `Total`.
No Refresh button — a report recomputes itself and states when it did.

### API + DATA
`GET /operation/pos/report`. **Stores nothing** — no table, no RPC, no cached figure.

### FROZEN RULES
- **It stores nothing**, and `buildPoReport` computes at read time from the same
  `purchase_order_lines` the register reads.
- **Every number is a DOOR** — a row unfolds into exactly the purchase orders its count was made
  of, and each is a link into the register at that document. *This is what AutoCount cannot do:
  its answer to every analysis is export to Excel, and a number in Excel has left the system.*
- **Cancelled purchase orders are excluded, and the exclusion is stated on screen.** A silent
  filter is how two people get two answers from one report.
- **NO MONEY**, structurally: the wire has no cost field, so the page could not print one.
- **An `All` row prints the number its OWN click produces**, never the filtered total.
- **Six words and no seventh:** `Report` (singular — Loo's spelling and AutoCount's own menu
  word; `Reports` and `Reporting` are both wrong) · `POs` · `Ordered` · `Received` ·
  `Outstanding` · `Total`.

---

# §8 · Settings

### MISSION
Every number the ordering engine reads, on one manager-only screen.

### WHAT IS ON SCREEN TODAY
`OperationPurchasingSettings.tsx`, 561 lines · *measured 2026-08-05 from its docblock.*
The seven numbers, server-gated to a manager. The supplier × category matrix is derived from
the catalog, so only factories that actually own a SKU appear — nobody reads a 10 × 3 grid of
blanks. Every row carries **who changed it, when, and what it was before**.

### API + DATA
`GET /operation/purchasing/settings` · `PUT /number` · `/po-days` · `/production-days` ·
`/work-week` · table `purchasing_settings` (**1 row**) · migration 0303.

### FROZEN RULES
- **A supplier × category with no number says `Set a number`** and gets no order-by date at all.
  It is never quietly planned on a 7 — a quiet screen must mean *watched and fine*, never
  *nobody looked*.
- **Nothing here has a default parameter.** A fallback is how one file's constant read
  `Mon + Thu` for months after the engine had moved to `Mon/Wed/Fri`.

---

# §9 · Architecture decisions that cross tabs

| Decision | Ruling |
|---|---|
| **Where an action lives** | The tab that owns the WORK owns the door AND its queue. `Confirm tomorrow's delivery` currently has a door on Purchase Orders and **no queue tile anywhere** — §1/§7 of the old flow file still assign it to Receiving. **Open.** |
| **Two status axes, never merged** | `purchase_orders.status` is a 3-value stored enum. The 5-word Operation Status is derived and never stored. A reader who confuses them will "fix" one to match the other. |
| **A quantity means exactly one thing** | No column is ever reused for a second meaning — that is how `ops_order_control.balance` became a lock reading a column nobody wrote. |
| **Deliberately not stored** | `in_transit_qty` · `ready_for_collection_qty` · `supplier_confirmed_qty`. **A column nobody writes is worse than a missing one.** |
| **No cancelled quantity anywhere** | Stopping is the whole PO. A per-line cancelled quantity would put a policy decision into an arithmetic column. |
| **A held unit is not "on the way"** | `on_hold` stops counting as future supply (0299), or the planner keeps believing goods are coming that never will. |
| **Widths are MEASURED in a real browser** | jsdom has no widths, so a page test structurally cannot catch a truncated cell. **A guessed number may never be written down.** |
| **The map must not go stale** | A guard that FAILS when a PR changes a Purchasing page file and does not change this document's `WHAT IS ON SCREEN TODAY`. **A rule in a document gets skipped; a failing test does not.** Not built. |

---

# §10 · Approved Evolution — decided, deliberately not implemented

> **This is architecture, not a to-do list.** Everything here has been ruled; none of it is
> waiting for a decision. **Who builds it and when belongs to GitHub Issues, not to this file.**

| What | Status |
|---|---|
| **`Refund` as a claim resolution** | **Approved as a concept, blocked on business meaning** — supplier credit note? cash? AP offset? Hidden until Loo rules it. **Do not guess and do not delete it.** |
| **`Repaired` · `Disposed` as item outcomes** | Approved. Needs a migration: 0299's transition guard admits exactly three destinations. |
| **Carres Execution as a real field** | Frozen (five options, §6). Not built. |
| **A second claim entrance from Service Cases** | Approved as the long-term architecture. **The entry rule and the refurbish door must be settled in the SAME change.** |
| **`DecisionGuideCard`** | Approved as a **portal-wide kit component**, not a Claims feature. One card under the selector, updating live: title → 1–2 sentences → max 3 `Typical examples` → max 3 `What happens next`. **Never a hover tooltip for business guidance** (users do not discover them; mobile cannot hover; staff stop reading after the first week). **Content from a configuration object, never hard-coded in the component.** Next homes: `Deliver To` · `Receiving Method` · `Purpose` · `Delivery Status` · `Payment Result`. |
| **The September supplier switch** | Approved. Nice Future stops; a subscription-model mattress supplier takes over. |
| **PO revisions** | **RULED OUT, not deferred.** A sent PO is never edited. |
