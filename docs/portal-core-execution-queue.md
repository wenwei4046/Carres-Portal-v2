# Portal Core execution queue — ONE CARD PER CHAT (Jess rulings 2026-07-27)

> **How to use (Jess):** new chat, paste:
> "Read `docs/portal-core-execution-queue.md`. Do card C<n> ONLY. Do not touch any other
> card. Do not redesign anything marked ALREADY EXISTS."
>
> **THE ENGINE LAW IS `docs/ACTION-FLOW-STANDARD.md`** (locked with Jess 2026-07-27) —
> two layers (compute every track independently · display picks one), the six things every
> action must carry, the parallel tracks, the display priority, no paper SOP. Read it before
> any C-card. This file says WHAT to build; that file says HOW the model works.
>
> **Source — two rulings by Jess, 2026-07-27 (they supersede every older word law):**
> 1. **Dynamic Checklist** — an order shows ALL open actions at once, not one suggestion.
> 2. **"Chase" is banned** — every action label = verb + named party + measurable object
>    (`Call Ohana — confirm PO-88 ready date`, never `Chase Ohana`).
> The ONE law text lives in `docs/COPY-STANDARD.md` (already rewritten — old versions
> deleted, no transition notes). The C-cards make the CODE match the law.
>
> **Lane rule:** C1-C3 edit the Orders list + drawer — same lane as ① Delivery (T) and
> ② Journey (J): never run alongside a T or J chat. C4 edits Purchase/Payments pages —
> same lane as ④ R-cards. Recommended slot: C1-C3 right after T8, before T9, so
> T9-T11 are born speaking the new words.

## Ground truth (read before ANY card)

- The Next-action ladder is LIVE in `OperationOrdersControl.tsx` (~519-700) and already
  EVALUATES every rung — today it displays only the top one. The Dynamic Checklist is a
  PRESENTATION change over the same signals: no new state, no new engine.
- T7 queues are LIVE and, since C1, speak the new words (step 2 = `Confirm delivery date`);
  T5's progress spine and J1-J2 tabs live in the drawer. COPY-STANDARD is the only word law.
- WhatsApp follow-up presets exist (wa-templates + drawer presets); Payments has
  "Ready-to-chase" queue wording; Purchase panel stages read Send · Chase · Receive.
- Tests assert old strings — renames must update the assertions WITH the strings.

## C1 · Orders + Delivery speak the new words ✅ (PR #461) — ✅ LIVE (PR #461)

**Goal:** every visible label in the Orders list, queues and drawer follows
verb + named party + measurable object, and the word Chase disappears:

**The full rename list is the audit table in `docs/COPY-STANDARD.md` ("The dictionary —
every visible word, audited") — build from that table, not from memory.** In this card:

- `Chase logistic` → queue `Confirm delivery date`; row `Call {carrier} — confirm delivery date`
- `Chase supplier` → `Call {supplier} — confirm ready date`
- `Order PO` → `Send PO to {supplier}`
- `Call customer (stock delay)` → `Call {customer} — agree new delivery date`
- `Collect $` → `Collect RM {amount}` (pill) · `Collect RM {amount} from {customer}` (row)
- `Confirm` (bare) → `Confirm delivery with {customer}`
- delivery column + drawer badges: `need booking` / `Unscheduled` → `{carrier} — confirm delivery date`
- `Pending` filter → **`To book`** (it selects orders past placement whose delivery date the
  customer has not confirmed — read the predicate to confirm before renaming)
- `Scheduled` filter → **`Customer confirmed`** (a logistics-proposed date is not a booking)
- column header `Manage` → **`Actions`** (plural — an order can have several; Jess 2026-07-27)
- the three-dot column → **no header word at all**; each dot gets its own small icon
  (goods · delivery · money) from the portal icon set, never emoji
- facet chip `For Jess` → **`For manager review`** (a product must not hard-code a person)
- `logistic` → **`Logistics`** everywhere (Jess decided it for the team: correct English and
  it reads with the company names they say — `NETS Logistics`)
- keep untouched: `Assign logistic` · `Deliver today` · `Upload delivery photo` · `Done` ·
  `No carrier` · the two confirmed/provisional fact strings
- the party is the REAL name when known (supplier/carrier/customer), role word otherwise

**Also in this card — the T1 leftover (found by the J3 chat, deliberately left for C1):**
`OrderDetailDrawer.tsx` still renders the banned word **`Unscheduled`** in TWO places —
line ~3814 (the header MiniBadge, carrier assigned + no date) and ~3853 (`statusWord` in
the delivery card). T1 banned the word and fixed the LIST; these two survived, and the
live bundle greps 1. **The replacement is NOT T1's `need booking`** — Jess struck that word
on 2026-07-27: it is a to-do hiding inside a fact ("need" = the reader still has to work out
what to do). Both spots — and the LIST column that T1 shipped — become
**`{carrier} — confirm delivery date`** (the carrier name is already in that cell).
Its neighbours in both spots are already correct (`Confirmed` · `not confirmed · carrier
said {date}` · `No carrier`) — change only the two strings, and delete the stale word
"Unscheduled" from the comment block above 3837 so no future chat reads it as intended.
**Add a banned-word guard to the drawer's own test file** (`POD` / `Proof of Delivery` /
`Unscheduled` / `Not booked` / `Chase`) — `OrderDocuments`, `BookingSpine` and
`OrderJourneyHeader` each ship one already, which is precisely why nobody caught the
drawer: every component guarded ITSELF and the badge sat outside all three.

**No migration. Copy + label maps + tests.**
**Done when:** grep of the web bundle for visible `Chase` = 0 on Orders/Delivery
surfaces AND `Unscheduled` = 0; every renamed label carries a named party.

**SHIPPED (PR #461).** The words live in ONE module — `packages/shared/src/order-action-words.ts`
— and every surface asks it, so a queue and a row structurally cannot spell one action two
ways. Each action carries **two** strings, and that split is the whole design: a **queue word**
(party-free, because a queue holds many suppliers) and a **row line** (`Call Ohana — confirm
ready date`). `nextActionOf` gained a stable `key`, so the queue counts, the `?tab`-style
filter state and `data-next-action` keep keying on a word that never moves while the visible
line names a real company. `delivery-queue.ts` now takes its four labels from that module.
Three findings are recorded under **What C1 found** below — read them before C2/C3.

### What C1 found — three things a later card has to decide (reported, not fixed)

1. **There is no three-dot column to rename.** The card asks for "the three-dot column →
   no header word at all; each dot gets its own small icon". `rowDotsOf()` computes the
   three dots and **nothing renders it** — it is exported, used by no component and by no
   test. What the list actually has is a `Status` column (internal key `dots`) showing the
   pipeline stage as a pill. C1 therefore renamed that column's misleading tooltip (it
   described the three dots, and used the banned words "in progress") and left the header
   word `Status`, which is correct for a stage pill. **Building the three dots is a
   feature, not a rename** — it needs Jess, and ACTION-FLOW Law 6 already specifies it.
2. **`To book` is slightly wider than its own predicate.** The `pending` tab selects
   in-pipeline orders where NOT (stock ready AND the customer confirmed), so an order whose
   customer HAS confirmed but whose goods are not in also lands in `To book` — and for that
   row the word is wrong. Live today it cannot happen: **0 of 55 control rows carry a
   confirmed booking**, so every in-pipeline order genuinely has no date. The honest fix is
   a predicate change (split the two conditions into two facts), not a word change, so C1
   shipped the word Jess ruled and left the predicate alone.
3. **The drawer keeps its own `Scheduled`, deliberately.** `PIPELINE_LABEL.scheduled` reads
   `operation_stage = dispatched | ready_to_dispatch` — it is NOT the customer-confirmed
   booking the list's tab now names, so renaming it to `Customer confirmed` would have made
   two different states share one word. Its banned neighbour WAS renamed (`Pending` →
   `Goods not in`). One word for two states is the worse error; this needs Jess's call.

## C2 · Split the ladder into TWO LAYERS + the drawer's action list — ✅ LIVE (PR #466)

**This is the structural card. Read `docs/ACTION-FLOW-STANDARD.md` first.**

**Layer 1 — compute.** `nextActionOf` today is `first matching rule wins`, which HIDES real
work (no PO + RM 2,000 owing + no logistics shows only `Order PO`). Replace it with a
function that returns **every open action** — each track evaluated independently, no track
suppressing another. Same signals, no new state, no new engine.

**Layer 2 — display.** A separate pure function picks which one goes first, using the
priority in the standard (broken commitment / today → customer must be told → goods →
delivery preparation → money). The old ladder's ordering is INPUT here, not law.

**Also fix the `To book` filter here** (C1 found it): the predicate selects
`NOT(goods in AND customer confirmed)`, so an order whose customer HAS confirmed but whose
goods are not in falls into `To book` — where the word is wrong. C1 correctly changed the
word and left the predicate, because the fix is a behaviour change and this card owns the
computation. Live it cannot happen yet (0 of 55 control rows carry a confirmed booking), so
it is a correctness fix, not a visible bug.

**Drawer:** the full list, one row per open action, each ticking itself when its signal
clears. Staff never add, reorder or tick.
**Keep:** T5's booking spine (progress ≠ actions) and the money LOCK on confirming a
delivery — display order is not gating.
**No migration expected.**
**Done when:** an order with three open actions shows three rows; no action can be hidden
by another; the drawer and the row can never disagree.

**SHIPPED (PR #466).** Both layers live in `packages/shared/src/order-actions.ts`, pure,
with the clock handed in. THREE tracks — goods · delivery · money — one action each at most,
because the rungs inside a track are states of the same question, not parallel work.
Layer 2 gives every key its own rank inside its Law 4 rung, so the sort is **total** (two
actions can never tie and flip between renders), and **a broken commitment jumps every
rung** — the one thing a rank table cannot express, because "broken" is a fact about the
order, not about the kind of action.

**The row is unchanged, and it is PROVED rather than asserted.** `nextActionOf` kept its
signature and became Layer 2 over Layer 1, so its entire existing suite is the parity
oracle — Loo's freeze gate, the T3 delay radar, T7's date split, C5's money hold and every
tone, 103 assertions, all green across the split. The drawer's `OrderActionList` is built
from the SAME call that produced the row's pill, so its first row IS that pill.

### What C2 found — read before C3 and C6

1. **`COPY-STANDARD.md`'s delivery-queue table states a TRIGGER and contradicts the working
   flow.** Step 1 `Assign logistics` is described as holding "Stock in, no logistics company
   picked"; `ORDERS-WORKING-FLOW.md` §3 gives it "the order needs delivering and no logistics
   company is chosen" — no stock condition — and Law 1 forbids one track gating another.
   COPY-STANDARD's own header says it defines WORDING only, so the working flow won and the
   stock condition is gone. **Jess: that "It holds" clause needs to move or go**, or the next
   chat re-derives the old behaviour from it.
2. **`Confirm delivery with {customer}` is ranked by nothing and listed by nobody.** Law 4
   does not rank it, §3 does not list it as an action, and `Confirm` is not one of the five
   verbs — yet it ships as the ladder's terminal word. C2 ranked it under delivery
   preparation and changed nothing else. It is arguably a FACT ("everything is arranged")
   wearing an action's clothes, and it is the one row in the drawer's list that **no button
   in the portal closes**. Needs Jess.
3. **Law 4 rung 2 and §4 rung 2 name different parties for the same rung** —
   `Call {logistics} — arrange new delivery date` vs `Call {customer} — agree new delivery
   date`. The shipped key is the customer one. **C8 owns this**; C2 changed nothing there.
4. **Law 4 rung 1 lists "the failed-delivery follow-up" and no such action exists.**
5. **No action has a Task Owner.** Law 2 requires one on every action; the portal stores
   `assigned_staff` per ORDER, not per action. **C6 needs this and it is not built.**
6. **Money now survives delivery, which is the one row headline C2 changes**: a delivered
   order that still owes used to read `Done` with an empty cell and now reads
   `Collect RM … from {customer}` (§3: "A delivered order that still owes money keeps this
   action"). Live there are 0 delivered orders, so no row moved on the day it shipped.

**Not built here, on purpose:** the `+N` (C3's), per-action checklists (C6's), and any
ticked/done rows — the journey strip directly above already renders ✓ per stage, so a second
ticked list would say the same thing twice. The list holds what is OPEN, and its empty state
teaches that a new action appears by itself.

## C3 · The Actions column shows the whole truth

**Goal:** the column (renamed `Actions` in C1) renders the top action from Layer 2 plus
`+N` when more are open: `Call Ohana — confirm ready date  +2`. Click opens the drawer's
full list (C2). **Depends on C2.**
**Done when:** a row with one action shows no `+N`; the count always equals C2's row count.

## C4 · Purchase + Payments sweep

**Goal:** the remaining Chase surfaces: Purchase stages `Send · Chase · Receive` →
`Send · Confirm ready date · Receive`; Payments `Ready-to-chase` → `Call to collect`
(row line `Call {customer} — collect balance RM X`); WhatsApp preset texts keep their
message bodies but their BUTTON labels follow the law.
**Lane:** shares ④'s pages — not alongside an R-chat.
**Done when:** visible `Chase` greps 0 across the whole web bundle.

## C5 · The money gate reads the number that exists — ✅ SHIPPED (PR #447)

**Verified against prod 2026-07-27 (every figure below is a live count, not an estimate):**

| The three money numbers | Live state |
|---|---|
| `ops_order_control.balance` — what the ladder's 🔒 reads | **NULL on all 55 control rows** |
| `orders.paid` — a column on `orders` | **the only written number**: `top_up_order` and `record_stripe_checkout_payment` both write it |
| `order_payments` / `payments` — the "ledger" | **0 rows, both tables. No payment RPC writes them.** |

**The bug is worse than a dead lock.** `bookingConfirmGate` (D1/T-series) computes
`collected` from `order_payments` — an empty table — so outstanding = the FULL order value
for every priced order. Concrete live case: **SO-1209, value RM 7,248, `orders.paid`
RM 7,248 — paid in full — and the confirm gate refuses its booking for money.** The lock
that never fires and the gate that always fires are the SAME root cause: two readers each
pointed at a column nobody writes.

**Real outstanding, computed from the number that exists** (Σ lines + add-ons − `orders.paid`,
clamped per order): **18 orders, RM 56,859** (RM 52,209 counting order lines only).

**Decided (unless Jess redirects):** `orders.paid` is the money truth. Do NOT wire anything
to `order_payments` in this card — a table with no writer cannot become a source of truth by
being read. Build:
1. `bookingConfirmGate`'s `collected` comes from `orders.paid` (one call site: the API
   route that feeds it — `order-control.ts` ~267 currently selects from `order_payments`).
2. The ladder's money rung computes outstanding the same way, with
   `ops_order_control.balance` as a FALLBACK for imported rows that carry no line prices.
3. Payments' "Ready to chase" queue (C4 renames it) reads the same computation — one
   helper in `packages/shared`, three consumers, so they cannot drift.
4. A test pinning SO-1209's shape: fully-paid order ⇒ gate passes.

**Not in this card:** starting to WRITE the ledger (a real migration + a rewrite of
`top_up_order`; it belongs to a Payments card, and until then the ledger stays empty by
fact, not by accident).
**Lane:** Orders list + drawer + API — the C/T/J lane. **No migration.**
**Done when:** SO-1209 can be confirmed; the 18 genuinely-owing orders show 🔒; no reader
of money touches `order_payments`.

### What shipped (PR #447, 2026-07-27 — no migration)

`packages/shared/order-money.ts` is the ONE rule, asked by **FOUR** readers, not three:
the row's 🔒, the server's `bookingConfirmGate`, the collections desk — **and the order
drawer**, which the card did not list and which is the surface an operator actually reads.
It computed Outstanding from the same empty ledger, so SO-1209 showed
`RM 7,248 outstanding · HOLD DELIVERY` while `orders.paid` said it was paid in full.
Leaving it would have made the drawer contradict its own row.

**Three corrections to the card's premises, each measured against prod, not assumed:**

1. **`order_payments` is not writer-less — it is empty.** Two doors write it: the drawer's
   Record-payment form (`POST /orders/:id/payments`) and the raw-create door, which posts
   the at-creation deposit into **both** `orders.paid` and the ledger. That double-write is
   the reason the two stores may never be summed — it would report a half-paid order as
   settled, the dangerous direction. It also means the card's "the ledger stays empty by
   fact" holds only while nobody presses Record payment; see the new carry-forward.
2. **`ops_order_control.balance` means what the customer STILL OWES** (0165), not the order
   total — and the booking gate was reading it as a total and subtracting collected from
   it. In the fallback branch `paid` is therefore never netted against it a second time.
3. **The 18 owing orders do NOT leave the Delivery board** (the index's "Expect after C5"
   note). All 55 control rows are `booking_stage='none'`, so the ladder returns
   `Confirm delivery date` and never reaches the money rung — no row changes its action word
   today. What changes: the **Owing facet row appears for the first time** (`Owing · 18 ·
   RM 56,859` — it renders only when the count is above zero, and the count was always
   zero), the `Collect RM …` pill finds those 18, the Payments collections queue fills with
   real figures, the drawer stops telling an operator that a paid-in-full order owes its
   whole value, and the booking gate's money answer is right.
4. **`rowDotsOf` is dead code** — it is exported and unit-tested but nothing renders it
   (the Status column shows a stage-word pill; the three-dot design was replaced). Its
   money branch was updated for consistency and it changes nothing on screen. Caught by
   grepping the shipped bundle for its strings: zero hits. Filed as a carry-forward
   rather than deleted — removing an exported function is Jess's call, not a build
   chat's.

**SO-1209's money gate passes — its booking is still refused for GOODS** (0 units reserved,
`line_received` NULL). That is the goods half doing its job, and it is a separate question.

**Verified live before building** (all figures re-counted, not taken from the card): 55
control rows / `balance` NULL ×55 · `order_payments` 0 · `payments` 0 · 18 orders owing
RM 56,859 · SO-1209 = RM 6,998 lines + RM 250 add-ons vs `orders.paid` RM 7,248.
Suites at baseline (shared 1623/1623 incl. +14 · api 3 pre-existing · web 16 pre-existing);
typecheck 0 new, build + v4 guard + lint clean, `SERVICE_ROLE` 0 in the bundle.

## C6 · Every action opens its checklist (from Jess's ChatGPT ACTION FLOW, 2026-07-27)

**Concept:** clicking an action in C2's Dynamic Checklist expands it into the steps that
close it, and the action ticks itself when a **system-measurable** condition is true.
Staff never tick anything that only means "I say I did it".

**Build only the actions whose completion the system can already measure** (verified live):

| Action | Completion rule | Signal that exists today |
|---|---|---|
| `Send PO to {supplier}` | PO exists AND supplier ETA recorded | `purchase_orders` + its eta |
| `Call {supplier} — confirm ready date` | latest ETA updated | `ops_order_control.line_etas` |
| `Collect RM {amount} from {customer}` | outstanding = RM 0 | **C5's shared helper — build C5 first** |
| `Assign logistic` | carrier set — **not** "carrier accepted" (Jess 2026-07-27: Assign is an internal decision; acceptance is the later `Call` action) | `ops_assigned_logistic` |
| `Call {carrier} — confirm delivery date` | customer date + slot confirmed | `booking_stage='confirmed'` (0277) |
| `Call {customer} — agree new delivery date` | new date recorded with a reason | 0196 extension + T4 reasons |
| `Upload delivery photo` | at least one photo | `delivery_photos` (0280) |

**The flow is an ORDER OF EVENTS, not a gate chain — and not the display order.** The
lifecycle reads Send PO → Call supplier → Collect payment → Assign logistic → Call carrier
→ (Call customer, only on stock delay) → Deliver today → Upload delivery photo. That is
what happens WHEN. It does **not** mean an action is hidden until the one before it closes
(Rule 1: an order shows ALL its open actions at once), and it does **not** reorder the
ladder: **money still displays first** (PayHold is a live, deliberate rule). Lifecycle
order and display priority are two different things — do not collapse them.

**Two of the proposal's nine actions are deliberately NOT built:**
- **`Issue Delivery Order`** — nobody issues one. `orders.do_number` is stamped by a DB
  trigger on the dispatch transition (0098), so the action would have no human in it
  (already ruled in T7; the ruling stands).
- **`Deliver today`'s sub-steps** (`Goods loaded` · `Driver departed`) — nobody records
  either, and neither is information we ask anyone for. They stay unbuilt: `Deliver today`
  keeps its own completion (delivered) and no sub-list.

**The carrier call's driver / vehicle / condo items ARE buildable — as INPUTS, not ticks.**
Under the verb rule, a `Call` completes when the information is obtained **and recorded**,
so these are category (b) of the no-decorative-checkbox law: fields the call fills in.
Verified live: `partner_fleet` carries driver/vehicle columns but holds **1 row**, and
`ops_order_control` has **no per-order driver column** — so there is nowhere to record them
today. C6 therefore carries ONE small additive migration: the call-outcome fields on
`ops_order_control` (driver name · driver phone · vehicle no · condo registration done),
all nullable, none of them gates. **Draft the migration to Jess first (guardrail #8), and
check the remote tracker tail immediately before applying.** Each field is optional on the
form — "if required" in the checklist means the field may stay empty, never that a tick
lies.

**Where a form already collects the inputs, the form IS the checklist** — the PO form and
the confirm-booking form are not to be duplicated as tick lists beside themselves.

**ONE output only: the screen.** No printable action cards, no wall chart, no SOP document
(Jess 2026-07-27: "我就是要用 system … portal lead to do"). The registry feeds the UI and
nothing else; a staff member who needs paper means the screen failed.
**Depends on C2 (the action list) and C5 (the money rule). No migration.**
**Done when:** every built action closes itself from a real signal; no tick-box in the
portal records only an assertion.

## C7 · The delivery order prints itself (Jess ruling 2026-07-27)

**Today, by hand:** logistics phones to say they are delivering tomorrow, and an operator
has to produce a delivery order and send it to them. Jess: the system should do that —
**once the customer-confirmed date exists, a button issues the DO; nobody creates one.**

**Verb law fit:** `Issue` = the SYSTEM produces the document. So the action is real, and the
human part is one press, not authoring.

**ALREADY EXISTS:** `orders.do_number` and a printable delivery-order PDF the drawer can
already render. **The one real change — read carefully:** the number is stamped by a DB
trigger on the DISPATCH transition (0098), i.e. it is born too LATE to hand to logistics the
day before. C7 must mint it (or issue the document against it) **at customer confirmation**
instead, without breaking dispatch for orders that never take this path. Touching an
existing trigger = draft the migration to Jess first (guardrail #8) and dry-run it in a
rolled-back transaction on prod before applying.

**Trigger:** `booking_stage='confirmed'` with a date · **Completion:** the delivery order
document exists for this trip (and, once logistics have their own portal, has been sent).
**Done when:** an operator never types a DO again; the document is available the moment the
customer's date is confirmed.

## C8 · Delay planning + the gate before the customer (Jess rulings 2026-07-27)

**Build the stages exactly as `docs/ORDERS-WORKING-FLOW.md` §3 states them.** That file is
the specification; this card is the work. The word on screen is **`Delay planning`** —
`Recovery` is banned (staff say "this order going to delay").

**The gate is the point of this card.** A supplier saying a later date is not yet a delay:
we may have ready stock, or another supplier may cover it. `Delay planning` completes with
a DECISION — *can we still make the promised date?* Only NO opens the logistics call.
**The customer is the last to know, and only when we have tried and failed.**

**Three invariants a build chat must not soften:**
1. **The promised date never moves.** `orders.delivery_date` stays at what was sold — every
   late/on-time figure measures against it. The delay flow must never call `set_order_date`
   (that RPC exists to correct a date typed wrong, not to rewrite history). The live
   extension path already records a requested date without touching the promise; reuse those
   fields for "customer accepted the delay", the reason and the history — no new store.
2. **No surface may open a customer call about a delay.** Logistics carries that call.
3. **Stage 2 cannot open before the decision is recorded**, and never opens at all when the
   answer is YES.

**Stage 2's owner is Operations, not logistics** — eight companies are in use, only NETS has
a login, and the partner portal has no appointment screen. Do not create a task nobody can
see.

**Small additive migration** for the decision + the named person — draft to Jess first,
check the tracker tail immediately before applying. **Depends on C2.**
**Done when:** an order whose delay we solve internally never reaches the customer and never
loses its original promised date; one that cannot be solved opens exactly one logistics
action.

## C9 · Storage fee holds the delivery, and only the manager can release it (Jess 2026-07-27)

**The ruling:** an uncollected storage fee is the same as an unpaid balance — the goods do
not go. If something must go out anyway, **the manager approves it and nobody else**, and
operations learns of it through the work.

**Not urgent, and say so in the PR: ZERO live orders carry a storage fee today** (measured
2026-07-27). This card decides the behaviour before the first one appears, rather than
improvising when it does.

**Today's split, which this card removes:** the ladder's 🔒 counts an uncollected storage
fee; the booking gate does not. C5 deliberately did not widen the gate — a bug-fix card must
not loosen or tighten a gate on the way past — so the split is still there.

**Build:**
1. The shared money rule (`packages/shared/order-money.ts`) already carries the storage fee
   as its own field. The gate reads the ONE number: lines + add-ons + chargeable storage −
   `orders.paid`. No second rule, no softer path for storage.
2. **The override.** Request and decision live on the order and reuse the existing approval
   channel and the existing columns (`storage_waiver_*` carry requester, decider, time and
   reason). Two outcomes the approver picks explicitly:
   `released, fee still owed` (default — an override never silently forgives money) and
   `released and waived`.
3. **No alert engine.** Approval flips the order's top action from collecting to delivering,
   so it arrives in the operator's queue the way every action does.
4. `UNKNOWN order value never holds` still wins over all of this — a number nobody knows may
   not stand between a customer and their goods.

**Migration only if the two outcomes cannot ride the existing waiver columns** — check
first; draft to Jess before applying. **Depends on C5** (shipped).
**Done when:** an order with an uncollected storage fee cannot issue its delivery order; the
manager can release it; a release that does not waive leaves the money action open.

## C10 · The three dots become real (found by C1)

**`rowDotsOf()` computes goods · delivery · money, is unit tested, and NOTHING RENDERS IT.**
The list's `Status` column shows a stage pill; its tooltip was even describing the three
dots that were never there (C1 fixed the tooltip). So Law 6 of the engine standard —
Jess's own design, no header word, one small icon per dot — describes a screen that does
not exist.

**Build:** render the three dots in that column, each with its own icon from the portal icon
set (goods · delivery · money — never emoji), no header word. Red/amber/green per
`docs/ORDERS-WORKING-FLOW.md` §7. A delivered order never alarms on goods or delivery and
may still show red money.

**Decide first (Jess):** the column currently shows the STAGE PILL. Do the dots REPLACE it,
or sit beside it? Replacing loses the stage word from the list; keeping both spends width on
a column that is 9 units wide today.

**No migration. Web-only.** **Done when:** `rowDotsOf` has a renderer, or is deleted.

## Status

| Card | Status | PR |
|---|---|---|
| C1 | ✅ LIVE 2026-07-27 | #461 |
| C2 | ✅ **LIVE** 2026-07-27 — two layers; the drawer lists every open action | #466 |
| C3 | ⬜ **next** — the `+N` on the Actions column (C2 shipped its list) | — |
| C4 | ⬜ any time, not alongside R | — |
| C5 | ✅ **LIVE** 2026-07-27 — the money gate reads `orders.paid` | #447 |
| C6 | ⬜ after C2 + C5 · action checklists | — |
| C7 | ⬜ after C6 · DO issues itself (migration) | — |
| C8 | ⬜ after C2 · delay planning + the gate (migration) | — |
| C9 | ⬜ storage fee holds delivery · manager override | — |
| C10 | ⬜ the three dots become real (needs one Jess call) | — |
