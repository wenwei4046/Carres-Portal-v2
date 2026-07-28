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
- `Call customer (stock delay)` → `Call {logistics} — arrange new delivery date` (Jess 2026-07-27: Carres never phones a customer about a delay — logistics does)
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

## C3 · The Actions column shows the whole truth — ✅ LIVE (PR #479)

**Goal:** the column (renamed `Actions` in C1) renders the top action from Layer 2 plus
`+N` when more are open: `Call Ohana — confirm ready date  +2`. Click opens the drawer's
full list (C2). **Depends on C2.**
**Also in this card (Jess ruled 2026-07-27):** `Confirm delivery with {customer}` stops being
an action. It fires when goods are in, logistics is assigned, the customer's date is
confirmed and that date is still ahead — nothing for a human to do, which is why it was the
only row in the drawer with no button that could close it. It becomes the FACT
`Delivering 27 Jul · 9–11 AM`, quiet tone, never red; `Deliver today` takes over on the day,
and the drawer list shows one fewer row rather than a row nobody can act on.
**Watch for duplication:** the Delivery column already carries that date and slot. If the two
cells would print the same thing, shorten this one — C1 hit the same trap in the delivery
badge and solved it by dropping the verb. You own this column; decide with the real widths in
front of you, and say what you chose.

**Also decide here:** whether the Actions cell truncating `Call NETS — confirm delivery date`
is acceptable with its tooltip (Jess deferred this to C3 rather than tuning one column twice).

**Done when:** a row with one action shows no `+N`; the count always equals C2's row count;
no row in the drawer shows an action with no way to complete it.

**SHIPPED (PR #479).** The `+N` **replaces the secondary `Collect RM …` pill**, and that
is the one thing on screen this card takes away: a cell may have exactly ONE way of saying
"there is more", and the `+N` covers all three tracks where the money pill covered one — the
one Law 4 displays LAST. The figure is not lost: the `+N` tooltip names every hidden action
in full (`Also open: Collect RM 2,455 from John Tan`), the drawer lists them, the Owing facet
still reads `Owing · 18 · RM 56,859` and the Payments desk is unchanged. **Live effect: 18
rows** — the ones C5 gave a money pill the day before — now read `Send PO to {supplier}  +2`
instead of carrying a second pill.

**`Confirm delivery` is DELETED, not left unused.** The key came out of `OrderActionKey`, so
the type checker found every surface that spelt it (the journey strip's stage map, its owner
map, four test fixtures) instead of leaving a word alive that nothing can emit. The FACT
`delivering` takes its place beside `done` — both are words the ladder returns and neither is
ever an action, so neither can be a queue: an arranged order now sits in **no queue at all**,
which is correct, because it has no work.

**The money LOCK survives, and it moved onto the action that CLEARS it.**
`deliveryHeldOnMoney` is ONE predicate the delivery track and the money track both ask, so
the delivery track can never fall silent while the money track forgets to say why. A held
order reads `🔒 Collect RM 2,455 from John Tan` where it read `🔒 Confirm delivery with John
Tan` — better named, and the PayHold behaviour is byte-identical: it still carries no
delivery queue and still never reaches the Delivery board (asserted).

**The two decisions the card handed to this chat, made with the widths in front of me:**

1. **Duplication — the row prints the SHORT form.** The Delivery cell one column to the left
   already prints `27 Jul · 12pm–3pm`, so the full sentence would say the same thing twice in
   adjacent columns. The row (and the Delivery module's detail pane, for the same reason)
   prints `Delivering`, quiet grey, **not a pill** — a pill in that column is a button and
   there is nothing to press — with the day in its tooltip. The full
   `Delivering 27 Jul · 12pm–3pm` ships in the drawer's journey strip, where nothing else on
   screen says it. This is C1's queue-word/row-line split doing the work, not a second
   spelling: the queue word IS the short form.
2. **Truncation — accepted, with 2 more units.** Actions goes 14 → 16, taken from `order` and
   `stock` (the two neighbours with real slack; `dots` was left alone because C1 pinned it at
   11 so `Customer confirmed` never clips). The longest lines still clip with their tooltip,
   and that is the right trade: a row of eight columns cannot hold
   `Call NETS Logistics — confirm delivery date` whole without starving a neighbour, the
   visible half is the half that acts (verb + party), and since C2 the full text has a proper
   home one click away.

### What C3 found — read before C6 and C7

1. **`COPY-STANDARD.md` contradicts itself about `Confirm`.** Its audit table carries BOTH
   `| Confirm | bare verb — worst offender | Confirm delivery with {customer} |` and
   `| Delivering {date} · {slot} | ✅ the quiet fact that replaces the old Confirm action |`.
   The first row is now dead — C3 retired that action on Jess's own ruling. **A PLAN chat
   should delete it**, or the next build chat re-introduces the word from the table.
2. **`COPY-STANDARD.md` says both YES and NO on `Issue delivery order`, in one file.** The
   delivery-queue section: "**`Issue delivery order` IS an action** (Jess 2026-07-27) … Card
   C7 builds it." The verb dictionary, further down: "**'Issue delivery order' is not an
   action in this portal**" because the number is trigger-stamped. **C7 cannot be built until
   one of those is deleted** — they are not two readings of one rule, they are two rules.
3. **The drawer's kebab menu still says `Confirm delivery`** (`OrderDetailDrawer.tsx` ~7056,
   shown on `pipelineStatus === 'scheduled'`, opens the delivery-order dialog). C3 did not
   touch it: it is a form door, not a worklist action, and renaming it is C7's job — under
   the verb dictionary it is `Issue delivery order`. Reported so it is not read as a survivor.
4. **Law 4 rung 1 still names "the failed-delivery follow-up" and no such action exists**
   (C2 found this; unchanged).
5. **No action has a Task Owner** (C2's finding #5, unchanged). Law 2 requires one; the portal
   stores `assigned_staff` per ORDER. **C6 needs it and it is still not built.**

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

## C6 · Every action opens its checklist — ✅ LIVE (PR #486)

**Concept:** clicking an action in C2's Dynamic Checklist expands it into the steps that
close it, and the action ticks itself when a **system-measurable** condition is true.
Staff never tick anything that only means "I say I did it".

**Build only the actions whose completion the system can already measure** (verified live):

| Action | Completion rule | Signal that exists today |
|---|---|---|
| `Send PO to {supplier}` | PO exists AND supplier ETA recorded | `purchase_orders` + its eta |
| `Call {supplier} — confirm ready date` | latest ETA updated | `ops_order_control.line_etas` |
| `Collect RM {amount} from {customer}` | outstanding = RM 0 | **C5's shared helper — build C5 first** |
| `Assign logistics` | logistics company set — **not** "they accepted" (Jess 2026-07-27: Assign is an internal decision; acceptance is the later `Call` action) | `ops_assigned_logistic` |
| `Call {logistics} — confirm delivery date` | customer date + slot confirmed | `booking_stage='confirmed'` (0277) |
| `Call {logistics} — arrange new delivery date` | new date recorded with a reason | 0196 extension + T4 reasons |
| `Upload delivery photo` | at least one photo | `delivery_photos` (0280) |

**The flow is an ORDER OF EVENTS, not a gate chain — and not the display order.** The
lifecycle reads Send PO → Call supplier → Collect payment → Assign logistics → Call
logistics → (call LOGISTICS, never the customer, only on stock delay) → Deliver today →
Upload delivery photo. That is
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
**No action has a Task Owner today** (C2 found it). Law 2 requires one on every action; the
portal has only a per-ORDER `assigned_staff`. C6 needs it to say who a checklist step is
waiting on — decide here whether the order's PIC is the task owner for every action of that
order (cheapest, and true today) or whether a step can be handed to someone else.

**Depends on C2 (the action list) and C5 (the money rule). No migration** unless a step must
be ownable separately from its order.
**Done when:** every built action closes itself from a real signal; no tick-box in the
portal records only an assertion.

### What shipped (PR #486, 2026-07-28 — **no migration**)

**The shape, in one sentence:** *a checklist is [the measured step before it, when there is
one] + [the outcome THIS action records]* — and **every step is one of the portal's own
actions**, so its label is that action's BUTTON word from the dictionary. A step cannot
carry a verb somebody invented for a tick-list, because a step is not allowed to be
anything but an action the portal already has.

| Action | Its checklist | The signal each measured step reads |
|---|---|---|
| `Send PO to {supplier}` | ○ `Send PO` | — |
| `Call {supplier} — confirm ready date` | `Send PO` · ○ `Record ready date` | something has been ordered |
| `Call … — agree new delivery date` | `Record ready date` · ○ `Record new date` | a supplier date is on file |
| `Assign logistics` | ○ `Assign logistics` | — |
| `Call {logistics} — confirm delivery date` | `Assign logistics` · ○ `Confirm booking` | a logistics company is picked |
| `Deliver today` | **none — ruled** | — |
| `Upload delivery photo` | `Mark delivered` · ○ `Upload delivery photo` | the order reached the customer |
| `Collect RM … from {customer}` | ○ `Record payment` | — |

**The last step is never ticked, and that is a structural claim rather than a fudge.** The
drawer renders a checklist only for an action that is OPEN, so the outcome that action
records has by definition not been recorded. Deriving it a second time here would be
re-running the trigger, and the only thing a second derivation can do is disagree with the
first (the J3/C2 law: this layer renders, it never re-derives). **One invariant holds the
whole feature honest** — *an open action always has at least one un-ticked step* — asserted
over 2⁶ × 3 × 3 signal combinations run through Layer 1 and then through their own
checklists, with a negative control: make one closing step read a signal instead and the
invariant fails on the spot. A fully-ticked list beside a live action is the only way this
feature could lie, and it now cannot.

**The no-decorative-checkbox law became structure, not a comment.** There is no tick, no
checkbox and no writer anywhere in the module or its renderer; a step's state is READ from
the same `OrderActionSignals` object the ladder just read, passed in once so a step can
never be measured against a different reading of the order than the action above it. The
only control in the component is a DISCLOSURE, and a test asserts that expanding an action
adds no `input`, no checkbox and no button inside any step.

**Two words were added to the code and none to the screen.** COPY-STANDARD locks FIVE
strings per action and `order-action-words.ts` mirrored only TWO (queue + row line); C6
needed the third — the **Button** — and took it verbatim from the dictionary table, so the
mirror is now 3 of 5. Nothing here invents vocabulary: every step on screen is
`Send PO` · `Record ready date` · `Record new date` · `Assign logistics` ·
`Confirm booking` · `Mark delivered` · `Upload delivery photo` · `Record payment`, which is
also COPY-STANDARD's "What to do" step template exactly — verb first, ≤ 8 words, ≤ 4 steps
(asserted).

**TASK OWNER — the decision the card asked for, and it needs no store.** *The order's PIC
(`ops_order_control.assigned_staff`) is the task owner of every action of that order.* It is
true today, it is what Law 2 asks for, and it means an action carries no owner FIELD:
printing the same name once per open action would spend height (§1.3) repeating what the
owner chip beside the order already says. A step that can be handed to a different person
than the order is a second store and a hand-off screen nobody has asked for; when a real
case appears it is a card, not an assumption. **This closes C2 finding #5 / C3 finding #5 by
ruling, not by building.**

**Collapsed by default** — §1.3 is a height budget and the row's line already says what to
do; the click is the affordance the card asks for, so C6 adds ZERO permanent pixels to the
drawer.

**NOT BUILT, and it is the half of the card that needs Jess: the driver / vehicle / condo
migration.** The card carries "ONE small additive migration — the call-outcome fields on
`ops_order_control`" and, in its own last line, "**No migration** unless a step must be
ownable separately from its order". Those two sentences disagree. Guardrail #8 settles what
a build chat may do about it: **draft SQL may not be written into `supabase/migrations/`
before Jess approves**, so the draft is in the PR body and nothing was applied. It is also
not needed by the Done-when — every built action closes from a signal that exists today.
The draft, for her ruling:

```sql
-- DRAFT — NOT APPLIED. C6, the carrier call's recorded outcome.
alter table public.ops_order_control
  add column if not exists driver_name        text,
  add column if not exists driver_phone       text,
  add column if not exists vehicle_no         text,
  add column if not exists condo_registered_at timestamptz;
```

All nullable, none of them a gate, none of them a tick — they are what the call FILLS IN,
which is category (b) of the no-decorative-checkbox law. They need a form on the
confirm-booking surface (the form IS the checklist) before they mean anything, which is why
they are one decision and not a spare column.

### What C6 found — reported, not fixed (Law 0)

1. **The card contradicts itself about the migration** (above). One of the two sentences has
   to go, or the next chat to read this card builds a different thing again.
2. **`ACTION-FLOW-STANDARD.md` Law 6 still ends with "NOT BUILT YET — this is a
   specification, not a description of the screen … Card C10 builds it."** C10 shipped on
   2026-07-27 and the law's own heading already says ✅ BUILT. The paragraph also repeats the
   retired ruling that the dots REPLACE the stage pill — Jess re-ruled *side by side*. A chat
   reading the bottom of that section builds the screen C10 deliberately did not build. It is
   the same stale-paragraph failure T2 met one day earlier, in the law rather than in a
   comment.
3. **Two different blocks in the order drawer are both labelled `Actions`** — the left rail's
   counterparty panel (renamed from `Chase now` by C1) and C2's dynamic checklist in the
   full-width band. COPY-STANDARD rule 8 is "same word app-wide", and this is the same word
   for two different lists on one screen. C6 did not rename either: both words were ruled,
   and picking one is a wording decision.
4. **The dictionary's `Arrange new delivery date` and the code's `Agree new delivery date`
   still disagree, and so do their parties** (`{logistics}` vs `{customer}`) — C2 finding #3,
   unchanged; **C8 owns it.** C6's button word (`Record new date`) is party-free, so it is
   correct under either ruling.
5. **A checklist step names the button but cannot press it.** "Where a form already collects
   the inputs, the form IS the checklist" was read as *do not duplicate the form as ticks* —
   it does not ask for navigation, and C2's list is deliberately control-free. The operator
   reads `Confirm booking` and still has to find that button in the drawer. Wiring each step
   to the panel that owns it is a real improvement and a real risk in a 7,000-line file; it
   belongs to whoever next opens the drawer for its own reason.
6. **`send_po`'s completion rule in this card is "PO exists AND supplier ETA recorded", and
   the engine does not work that way** — the moment a PO exists the action becomes
   `Call {supplier} — confirm ready date`, which is what records the date. Built as the
   engine behaves (one step), because the card's own "ORDER OF EVENTS, not a gate chain"
   rule says the two must not be collapsed into one action.

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

**C9 left two things here** (reported, not fixed): the money gate is on CONFIRMATION today
while `ORDERS-WORKING-FLOW.md` §5 puts it on ISSUING — **moving it is this card's job**. And
"the manager" who releases a storage hold is currently the `principal` ROLE; HR-P2 built duty
keys for exactly this shape, and this is a money decision — decide here whether it becomes a
duty key rather than a role.

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

## C9 · Storage fee holds the delivery, and only the manager can release it — ✅ LIVE (PR #472)

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

### What shipped (PR #472, 2026-07-27 — **no migration**)

**The two outcomes ride the existing columns, so there is no migration.** Checked, as the
card asked. `storage_waiver_status` has four values and the outcomes need five states — but
only if the write-off has to live in that column. It does not: `storage_fee_override = 0`
already means "this order owes no storage fee", is already honoured by every storage reader,
and is a DIFFERENT column from the Master-imported `storage_fee_msbf` / `_sof`, so the figure
that was written off stays on the record instead of vanishing.

| The manager's decision | `storage_waiver_status` | `storage_fee_override` |
|---|---|---|
| `Release, fee still owed` (default) | `approved` | untouched — the fee stays owed |
| `Release and waive the fee` | `approved` | `0` — written off, with the reason |
| `Reject` | `rejected` | untouched |

So **`approved` now means RELEASED, not forgiven** — the one meaning change, and it is what
makes "a release never quietly forgives money" true rather than aspirational.

**The split that makes it work is in the shared rule, not in a screen.** `orderMoney` gained
`holding` beside `outstanding`, and `holds` beside `owing`: **what is OWED and what still
BLOCKS are two questions**, and a release is the one thing that parts them. The 🔒 and the
booking gate read `holds`; the money ACTION and the Owing facet read `owing`. That is one
line of arithmetic and it is why a released order books while `Collect RM …` stays on its row.

**Finding the card did not predict: the storage fee was read THREE different ways** — the
same drift C5 found for the goods balance, one card later and one column over.

| Reader | What it read | What it missed |
|---|---|---|
| the Orders ladder's 🔒 | `storage_fee_msbf + _sof` | **`storage_fee_override`** — an order the operator marked "No storage" still showed its fee |
| the dispatch gate (`storageBlock`) | override + computed | **the Master-imported columns** — an order carrying Jess's own keyed fee and no `storage_from` dispatched with the money unpaid |
| the drawer | all three, correctly | — |

`packages/shared/storage-hold.ts` is now the ONE ladder (override, including 0 → Master
figure → computed) with four readers: the ladder, the booking gate, the dispatch gate and the
decide route's audit line. The list API had to start selecting `storage_from` and
`storage_fee_override` — without them the row cannot honour an override, and "one rule" would
have been one rule the row could not ask.

**"UNKNOWN never holds" survives, and it needed a decision.** Rule 4 of the card is about the
order VALUE, so `goodsOwing` stays 0 on the 37 unpriced imports and holds nothing. A storage
fee is the opposite case — a figure a human typed — so it DOES hold an unpriced order.
Written as two tests that state the distinction, because the two readings look alike in the
card's one sentence.

**The audit is a sentence, not a column.** The 0211 activity trigger does not watch
`storage_fee_override`, so a waive would otherwise be a silent zero. The decide route reads
the fee through the shared rule BEFORE it writes and appends
`Delivery released by manager — RM 150 storage fee still owed` / `… written off` through the
same fail-soft annotation door `/storage/extend` uses. An audit line may never undo a decision
the manager already made.

**`approved` is still accepted on the wire** and reads as `waived` — that is exactly what the
single old outcome did — so a browser left open across the deploy keeps working instead of
422-ing on a word it was built with.

**No alert engine, as ruled**: the release flips the row's own headline (the 🔒 comes off
`Confirm delivery`) and the collection stays in the queue it was already in.

Tests +34 (shared 25 · api 7 · web 2 net). Suites at baseline (shared 1788/1788 · api 3
pre-existing · web 16 pre-existing); typecheck 0 new, build + v4 guard + lint clean.

### What C9 found — reported, not fixed (Law 0)

1. **§5 of the working flow puts the money gate on ISSUING the delivery order, and the code
   puts it on CONFIRMING the date.** §5: "Issuing the delivery order is the hard gate, not
   agreeing a date… Agreeing the date still WARNS about the same three." Live, the ONLY money
   gate is `bookingConfirmGate`, which REFUSES a confirmation — C5 fixed it there and this
   card widened it there, because moving a gate is not a bug-fix card's business. **C7 owns
   this**: it builds `Issue delivery order`, and it must decide whether the confirm gate
   drops to a warning when it does. Until then the card's own "cannot issue its delivery
   order" is satisfied one step earlier than the flow describes.
2. **Nothing was measured live.** The Supabase MCP refused every call this session
   (`You do not have permission to perform this action`), so the card's "ZERO live orders
   carry a storage fee today (measured 2026-07-27)" could not be re-checked, and no migration
   could have been applied even if one had been needed. Every behaviour change here is
   invisible on an order with no storage fee, so a stale measurement changes nothing about
   what ships — but the figure in this doc is the card's, not this chat's.
3. **"The manager" is the `principal` role, and that is an assumption the card let stand.**
   HR-P2 built duty keys (`org_duties`) precisely so a permission can follow a POSITION
   instead of a role, and Jess's word is "manager", not "principal". The card said "reuse the
   existing approval channel", so the gate was left alone — but the release is now a MONEY
   decision, and the only person who can make it is whoever holds the principal login.
4. **The release has no expiry and no scope.** Once released, the order is released forever
   and for every trip — including a second trip booked weeks later under a fee that has kept
   accruing. Nothing in the ruling says otherwise, and there is no live case, but a release is
   currently a permanent property of the order rather than of a delivery.
5. **A rejected release cannot be re-asked without an operator noticing.** `rejected` is
   sticky: the request button reappears, but nothing tells the operator the fee has grown
   since the refusal. Small, and it belongs to whoever next touches the Storage panel.

## C10 · The three dots become real (found by C1) — ✅ LIVE (PR #471)

**`rowDotsOf()` computes goods · delivery · money, is unit tested, and NOTHING RENDERS IT.**
The list's `Status` column shows a stage pill; its tooltip was even describing the three
dots that were never there (C1 fixed the tooltip). So Law 6 of the engine standard —
Jess's own design, no header word, one small icon per dot — describes a screen that does
not exist.

**Build:** render the three dots in that column, each with its own icon from the portal icon
set (goods · delivery · money — never emoji), no header word. Red/amber/green per
`docs/ORDERS-WORKING-FLOW.md` §7. A delivered order never alarms on goods or delivery and
may still show red money.

**RULED (Jess 2026-07-27): side by side — the stage pill stays untouched.** The two answer
different questions and neither replaces the other:

```
Status column
  ┌──────────────┬─────────────┐
  │ Proceed      │  📦 🚚 $     │
  │ stage pill   │  the checks  │
  │ WHERE this   │  WHICH part  │
  │ order is     │  has trouble │
  └──────────────┴─────────────┘
```

The **stage pill is the order's overall progress summary** (Placed → Proceed → … →
Delivered) — Jess: "dont change". The **three dots are three independent facts** and never
merge into one word. The dots need no header of their own; each carries its own icon from
the portal icon set (never emoji). The column is 9 units wide today and will need more —
take it from the widest neighbour, not from the Actions column, which C3 is about to grow.

**No migration. Web-only.** **Done when:** `rowDotsOf` has a renderer, the stage pill is
byte-identical to today, and a delivered order still never alarms on goods or delivery
while it may show red money.

**SHIPPED (PR #471).** All three done-whens met. The dots render beside the stage pill in
the Status column, each as **its own icon** from the UI-KIT §A4 canonical mapping — goods
`package` · delivery `truck` · money `wallet`, 14px, never emoji. The icon is what labels
the dot, which is exactly why the dots need no header of their own.

**The proof that dead code became a screen is measured, not asserted.** The four dot
tooltips and the `row-dot-` testid grep **0 in the previous live bundle** (`index-BYggEOBr.js`,
C2's — they were tree-shaken, which is what "rendered nowhere" really meant) and **1 in the
new one** (`index-CToiHJof.js`). Both directions, on the downloaded file.

**`rowDotsOf` now returns the STATE, not a hex** — the hue is the renderer's business, so the
tests pin the meaning and the paint stays in the one existing `DOT_HEX` map (no new hex
literal; the ratchet holds at 43). **The dot ORDER flipped to the law's** goods · delivery ·
money; the §14 note of 2026-07-18 had money first, the 2026-07-27 laws re-ruled it, and since
nothing had ever rendered these dots, no screen changed when it flipped.

**Widths were measured against the app's own stylesheet**, in a real 1448px `table-fixed`:
the widest pill is 137px and three icons 50px, so Status went **11 → 14** and both fit intact
with 15px spare, the pill untruncated — and **the row stays exactly 40px, it does not grow**.
The 3 points came from the two neighbours with real slack (deadline 13 → 12, needs 142 of
174; stock 11 → 9, needs 119 of 130), **never from Actions**, which C3 is about to grow. On a
narrower screen the pill truncates and the dots stay whole (`shrink-0`) — the stage word has
a tooltip and a five-word vocabulary; a half-drawn signal would not.

### What C10 found — read before C3

1. **`rowDotsOf` had NO tests.** Both the C5 note above and this card state it is "unit
   tested"; the repo-wide grep returns the definition and nothing else. C10 wrote the first
   cover its truth table has ever had — 11 tests, with a negative control (reverse the dot
   order → 8 fail). **The lesson is about the claim, not the gap**: "computed and tested but
   not rendered" reads as *two thirds done*, and it was one third.
2. **Law 6 still says "the column carries no header word", and that sentence is now wrong —
   Jess needs to strike it.** It was written when the dots were to OWN that column. Her own
   later ruling put the stage pill beside them, and a column holding a stage pill needs a
   word for it. This card's own text resolves it ("the dots need no header **of their own**"),
   which is what shipped: `Status` heads the pill, the dots are labelled by their icons.
   **A future chat reading only Law 6's older sentence would strip the header and leave the
   pill unlabelled.**
3. **The card's stated width was stale** — it says the column "is 9 units wide today"; C1 had
   already widened it to 11. The instruction behind it (take from the widest neighbour, never
   from Actions) was followed, but split across the two columns that actually had measured
   slack rather than gutting one.
4. **§7 gives the money dot no amber** — green, red or grey only, while goods and delivery
   each have three tones. If "owing but not yet due" should ever read differently from "owing
   and late", that rung does not exist. Not invented here.
5. **The Stock and Delivery cells were already written for this card.** Their comments have
   said "the 货 dot carries the colour" since the §14 rebuild, and they render facts in
   ink/grey. C10 changed neither — the colour channel they were waiting for finally exists.

## Status

| Card | Status | PR |
|---|---|---|
| C1 | ✅ LIVE 2026-07-27 | #461 |
| C2 | ✅ **LIVE** 2026-07-27 — two layers; the drawer lists every open action | #466 |
| C3 | ✅ **LIVE** 2026-07-27 — the `+N`, and `Confirm delivery` becomes a fact | #479 |
| C4 | ⬜ any time, not alongside R | — |
| C5 | ✅ **LIVE** 2026-07-27 — the money gate reads `orders.paid` | #447 |
| C6 | ✅ **LIVE** 2026-07-28 — every action opens the steps that close it; the order's PIC is the task owner | #486 |
| C7 | ⬜ after C6 · DO issues itself (migration) | — |
| C8 | ⬜ after C2 · delay planning + the gate (migration) | — |
| C9 | ✅ **LIVE** 2026-07-27 — storage holds the delivery; the manager releases it, in two named outcomes | #472 |
| C10 | ✅ **LIVE** 2026-07-27 — the three dots render beside the stage pill | #471 |
