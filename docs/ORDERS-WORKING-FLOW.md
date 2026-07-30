# Orders — the working flow

> **THE one file for how an order behaves.** A chat working on Orders reads this and
> nothing else for the flow. It is overwritten in place; there is never a second version,
> never a "v2", never a "superseded" note.
>
> This file says WHAT the Orders module does. It does not repeat:
> the action MODEL → `docs/ACTION-FLOW-STANDARD.md` · the WORDS → `docs/COPY-STANDARD.md`
> · the SHELL → `docs/UI-KIT.md` · progress → `docs/execution-queues-index.md`.

## 1 · What the module is

One table. One row = one customer order.

**There is no single overall Order Status.** Business facts, actions, module stages and
exceptions are stored independently — `booking_stage`, `line_received`, `delivery_photos`
each record their own thing. The Order view is COMPUTED from those records at read time;
no row carries one word that claims to summarise it.

An order can have **several open actions at once**. They are computed independently — one
action never hides another. The row shows the highest-priority one plus `+N`; the drawer
shows them all.

**The Delivery page is a VIEW of this file's delivery track, not a module of its own.**
It has its own sidebar item (T11) because operators live there all day, but it owns no
records and raises no actions — it renders §3's delivery actions for the orders that carry
them, through the same shared computation the Orders list runs. **There is no
`DELIVERY-WORKING-FLOW.md` and there must never be one:** a second file would mean the same
action described in two places, which Law 0A forbids. Same rule for any future page that
re-cuts these orders by another angle.

## 2 · What the flow reads

| Signal | Where it lives |
|---|---|
| customer's promised date | `orders.delivery_date` (+ `delivery_date_tbd`) |
| goods ordered / not | `purchase_orders` for this order |
| supplier's ready date | `ops_order_control.line_etas` |
| goods physically in | `ops_stock_items` reserved to this order · `line_received` |
| logistics chosen | `orders.delivery_partners` / `ops_assigned_logistic` |
| booking | `ops_order_control.booking_stage` + `confirmed_date` + `confirmed_time_slot` |
| delivery photos | `ops_order_control.delivery_photos` |
| the building we deliver to | `orders.entry_data → fields.building_type` — the POS asks it (`Landed · Condo · Apartment · Office · Retail · Other`). **It decides half-day vs full-day.** 40 of 56 live orders have it blank |
| **money** | **`orders.paid`** — the money truth (`top_up_order`, Stripe and the AutoCount import all write it). One shared rule: `packages/shared/order-money.ts`. |

**Three facts about money that a chat will get wrong unless it reads them here** (measured
live 2026-07-27, and they corrected this file's earlier wording):

- **The payment ledger is empty but it is NOT unwritten.** Two doors write `order_payments`,
  and the raw-create door writes the SAME deposit into BOTH `orders.paid` and the ledger.
  Adding them would read a half-paid order as paid in full. **The ledger must never enter an
  outstanding calculation** — not because nobody writes it, but because adding it
  double-counts.
- **`ops_order_control.balance` means "what the customer still owes"**, not the order total
  (0165). Anything that subtracts payments from it is subtracting twice.
- **An order whose value is UNKNOWN never holds anything.** 37 live orders carry no line
  prices and no keyed balance. A number nobody knows may not stand between a customer and
  their goods — unknown warns, never blocks. (Same principle the booking gate already used
  for "total not set".)

## 3 · The actions

Every action carries six things (the model file explains why). `{party}` is the real name
when the system knows it, the role word only when it does not.

**Ownership is two different things, and NEITHER is stored on an action:**
**Task Owner** = the order's PIC. C6 ruled that the PIC owns every action of that order, so an
action carries no owner field. **Case Owner** = the one person responsible for this customer's
case from start to finish; it never changes and is never repeated on an action.

**How the PIC is decided — the whole rule** (LIVE, migrations 0232 + 0235;
`ops_order_control.assigned_staff / assigned_by / assigned_at` + `ops_staff_settings`):

- **One order, one owner, decided when the order arrives.** The system never moves an order
  off a person mid-flight on its own.
- **Opening an account is joining; disabling it is leaving.** An operation account joins the
  pool on its FIRST login and is dealt a share on that same page load. Creating the account is
  the only manual step; there is no "add to team" click and nobody is removed by hand. A
  generic, non-person account never joins. Managers are never dealt orders.
- **Everyone sees every order.** There is no per-owner row filter, and anyone may open any
  order. The PIC says who is answerable, not who is allowed.
- **Only a manager may assign by hand** (`ops_manager`; the web hides the control and the API
  answers 403). Staff read the pool, never write it.
- **The sweep only re-spreads what the SYSTEM handed out.** Unowned orders and orders the
  system assigned (`assigned_by` NULL) are re-split evenly across whoever is in;
  **an order a human assigned never moves.** The split is deterministic, so two operators
  triggering it at the same moment produce the same plan.
- **Absence needs no click.** The portal stamps a heartbeat while an operator has it open.
  Before **10:00 MYT** everybody keeps their share — late is not absent. From 10:00, a member
  with no heartbeat today counts as out and their system-assigned orders flow to whoever is
  in; they log in later and the share flows straight back. The `away` flag is only for a
  known long absence.

### Purchasing

**`Issue PO to {supplier}`**

> **`Send PO to {supplier}` is RETIRED (Loo, 2026-07-29), and `Prepare PO` with the Draft PO
> it produced is RETIRED too (Loo, 2026-07-30 — the Purchasing clean restart).** Raising a
> purchase order is ONE act: `Issue PO` creates the formal Purchase Order, and nothing is
> stored before it. **No act is called `Send PO`, and the verb `Send` is retired with it.**

- **This action is DEFINED ONCE, in `docs/PURCHASING-WORKING-FLOW.md` §3** — trigger,
  checklist, completion, due, task owner, counted per, re-checked when. **Orders DISPLAYS
  them; it never re-states them**, the same discipline this file already applies to the
  arrival window below.
- Task Owner: the Purchasing task owner (today the PO-duty holder, `org_duties`)

**`Call {supplier} — confirm ready date`**
- Trigger: ready date missing · due for re-confirmation · passed with no goods in · later than the customer's date · changed by the supplier
- Checklist: production status · ready date · ready quantity · any delayed item · record the latest ready date · record the outcome
- Completion: latest ready date recorded AND outcome recorded
- Due: red once inside the arrival window. **The window and every number in it are owned by
  `docs/PURCHASING-WORKING-FLOW.md` §2 — Orders reads them, never re-states them.**
  `arrival window = customer date − production working days − order-by buffer`.
- Task Owner: the module assigns it

### Delay planning — a state machine, with a gate before the customer

**The principle (Jess, 2026-07-27): the customer is the LAST to know.** A supplier saying
"12 Aug" is not yet a delay — we may have the item in ready stock, or another supplier may
cover it. Only when we have tried and failed does anyone reach the customer.

**The word is `Delay planning`.** `Recovery` is banned on screen: staff say "this order
going to delay", never "this order is in recovery". Nothing is being recovered yet — a
decision is being planned.

**Stage 1 — Delay planning**
- Trigger: latest supplier ready date **>** the customer's promised date
- Owner: **Operations**
- Checklist: confirm the supplier's real ready date · check ready stock or another supplier
  · check available dates with logistics · decide the best delivery date · **decide whether
  the customer needs to be told at all**
- Completion: the delay decision is recorded
- **Due: 2 WORKING DAYS** from the day the supplier's date first overshoots the promised date
  (Loo, 2026-07-28; built by C8b, which found that day was stored nowhere and Loo ruled the
  stamp — `delay_detected_at` + the supplier date it is about, `delay_detected_eta`, 0305,
  maintained by the database itself so no door can forget it and nobody can move their own
  deadline). Office calendar — this is office work (Law 2A). Two days is deliberate
  and it is not slack: Operations has to confirm the supplier's real date, check ready stock,
  check another supplier and check dates with logistics before there is anything worth saying.
- **The customer is not contacted in this stage.**

> **There is a second clock and it belongs to stage 2, not to this one** (Loo, 2026-07-28) —
> the customer must hear the SAME WORKING DAY the decision is recorded. It cannot start
> earlier without breaking this stage's whole point, so it does not. See stage 2.

**The gate — can we still make the promised date?**

```
Stock delay detected
        ↓
   Delay planning
        ↓
Can we still make the promised date?
   ┌────┴────┐
  YES        NO
   │          ↓
   │     Call {logistics} — arrange new delivery date
   │          ↓
   │     logistics agrees a new date with the customer
   │          ↓
   │     the system records the new booking
   ↓
Continue the original delivery — the customer is never told
```

**Stage 2 — Logistics arranges the customer's new date** (opens only on NO)
- Trigger: the delay decision says the promised date cannot be met
- Owner: **Operations** — the CONVERSATION is logistics', the ACTION in this portal is ours
- Action: `Call {logistics} — arrange new delivery date`
- Checklist: give logistics the decided date · logistics contacts the customer · record the
  date the customer agreed · record the time slot · record the response
- Completion: a customer-confirmed date AND a time slot are recorded
- **Due: the SAME WORKING DAY the decision was recorded** (Loo, 2026-07-28) — the clock starts
  at `delay_decision_at`, not at the supplier's slip. Office calendar (Law 2A). A decision
  recorded on a Friday afternoon is due that Friday; it turns late on the next working day.

**This is the customer-communication SLA, and it is the whole of it.** Loo ruled TWO clocks —
2 working days for the plan, same working day for telling the customer — and ruled the second
one to start **when Operations records that the promised date cannot be met.** So the two
never overlap: Operations gets its two days to find out whether there is really a delay, and
the moment it decides there is, the customer hears the same day.

**Nothing about Jess's rule changes, and that is why this reading was chosen.** The customer
is still the LAST to know · still not contacted in stage 1 · still never told before the ready
date is known. **No new action, no new workflow, no migration** — `delay_decision_at` (0304)
already stamps the moment the clock starts. What was missing was a Due on an action that had
none, which is exactly what Law 2 requires and what C8 reported.

> **Why Operations owns it.** Eight logistics companies are in use; **only NETS has a
> login**, and the partner portal has no screen for arranging an appointment. A task owned
> by "Logistics" would be one nobody can see or close. It moves to them the day the partner
> portal covers appointments — that is a card, not an assumption.

**Stage 3 — The system records it** (no human step)
- The new date and slot go to the **booking** (`confirmed_date` + `confirmed_time_slot`).
- **THE PROMISED DATE NEVER MOVES.** `orders.delivery_date` stays at what was sold. Every
  "late / overdue / on-time" figure keeps measuring against it, so a delay can never be
  tidied away by pushing the date. The live code already behaves this way — the extension
  path records a requested new date and deliberately does not touch `orders.delivery_date`.
  The delay flow must never call the RPC that does (`set_order_date`); that RPC exists to
  correct a date typed wrong at the counter, not to rewrite history.
- What IS recorded: the decision · the reason (from the shared reason list) · the new date,
  which goes to the **booking**.
- **NOT in the extension fields — that instruction was wrong and is deleted** (corrected
  2026-07-28, found by C8 and it declined to follow it). This line used to say "those are the
  existing extension fields — no new store". Those fields are the **customer's** one-time
  storage extension (0196: `extension_count` is capped at 1, and a second needs the principal).
  Writing a CARRES-CAUSED delay into them **silently spends the customer's only extension** —
  so the day they genuinely ask to postpone, the portal refuses them for a delay that was our
  factory's fault. Two different events, two different stores; "no new store" is a good
  instinct and it is not a licence to reuse a counter that means something else.
  C8 added `delay_decision_eta` (0304) instead, and the column earns itself: a decision is
  about **one** supplier date, so if the factory slips again the pair stops matching and Delay
  planning re-opens by itself. Without it, one decision would close every future delay on that
  order — `ops_order_control.balance`'s disease one column over.

**Who may move it on**

| Stage | Owner | Next |
|---|---|---|
| Stock delay detected | System | Delay planning |
| Delay planning | Operations | Continue original delivery **or** Logistics arranges the date |
| Logistics arranges the date | Operations (logistics performs the call) | System records it |
| System records it | System | Normal delivery flow |

### Supplier exception (goods short, damaged or wrong)

One shared vocabulary, used by every module that waits on a supplier:

```
Receiving Exception Created
        ↓
Contact Supplier  →  Waiting Supplier Reply  →  Waiting Goods Arrival
        ↓                                              ↓
Supplier Cannot Fulfil                          Goods Received
        ↓                                              ↓
Case Owner Decision Required                    Exception Closed
```

**`Contact {supplier} — confirm what happens next`**
- Trigger: goods arrived short / damaged / wrong
- Checklist: state the problem · agree what the supplier will do · record the reply · record the new arrival date
- Completion: a supplier reply is recorded AND either a new arrival date exists or the supplier has said it cannot fulfil
- Task Owner: the module assigns it

**`Case Owner Decision Required`**
- Trigger: the supplier cannot fulfil
- Completion: the case owner has chosen what happens to this order
- Owner: the **Case Owner** — the one action that is never delegated

If either outcome pushes the goods past the customer's promised date, it does not invent a
second customer conversation: it opens **Stage 1** of the delay recovery above.

### Payment

**`Collect RM {amount} from {customer}`**
- Trigger: outstanding > RM 0, where outstanding = Σ order lines + add-ons + chargeable storage − `orders.paid`
- Checklist: confirm the amount · contact the customer · state the amount and the deadline · record the response · verify the payment
- Completion: outstanding = RM 0
- Task Owner: the module assigns it
- **Survives delivery.** A delivered order that still owes money keeps this action and its red money dot.

### Delivery

**`Assign logistics`**
- Trigger: the order needs delivering and no logistics company is chosen
- Checklist: select the company · record it · record who assigned · record when
- Completion: a logistics company is recorded. **Never "they accepted"** — assigning is our decision
- Due: 3 working days before the customer's date
- Task Owner: the module assigns it

**`Call {logistics} — confirm delivery date`**
- Trigger: logistics assigned but the customer has not confirmed BOTH a date and a slot
- Checklist: logistics contacted the customer · proposed date · customer-confirmed date · customer-confirmed slot · the response · the reason if unresolved · (for condominiums) driver name · driver phone · vehicle number · lift or registration requirement
- Completion: a customer-confirmed date AND slot exist. **A date logistics proposed is a fact, not a confirmation**
- **The slot length comes from the building type** — a condominium, apartment or office takes a half-day; landed and retail take a full day (`docs/COPY-STANDARD.md`)
- Due: a settable number of working days before the customer's date — **1 today, Jess may set 5** (`docs/PURCHASING-WORKING-FLOW.md` §2 holds every settable number)
- Task Owner: the module assigns it

**`Issue delivery order`**
- Trigger: customer-confirmed date **AND** customer-confirmed time slot **AND** core goods ready **AND** the payment condition passed — all four. The action appears only when it can actually be done
- Checklist: issue
- Completion: the delivery order document exists for this trip
- **The system produces it; nobody writes one by hand.** Today the number is stamped at
  dispatch, which is too late to hand to logistics the day before — card C7 moves it to
  confirmation time

**`Deliver today`**
- Trigger: the customer-confirmed date is today and nothing has been delivered
- Completion: **Delivered**, or a **Delivery Exception Created** carrying its reason
  (customer unreachable · customer rejected the date · driver absent · vehicle breakdown ·
  condominium entry refused · lift booking not done · delivery failed). Every module fails
  the same way: one Exception plus a Reason — never a family of different failure words
- Task Owner: the module assigns it

**`Upload delivery photo`**
- Trigger: delivered, no photo attached
- Checklist: upload · verify it opens · record who · record when
- Completion: at least one photo exists
- Due: 1 working day after the delivery

### What we send — the message rules

Most of these actions are performed by sending a message, so the message is part of the
action. The literal bodies live in `apps/web/src/lib/wa-templates.ts`; the rules that shape
them live here.

- **A customer message never carries a delivery date.** Logistics agree the date and the slot
  with the customer (Delivery, above); if a customer asks us, we give them the logistics
  company's contact. The ONE exception is the delivery-eve reminder on an order still owing
  money, which may say `today` / `tomorrow`.
- **No pressure phrasing to a customer** — never "settle by", never "deliver on time".
- **The salutation is never guessed.** Use the preferred-name field when it is set, otherwise
  the customer's own name in Title Case. Never infer `Mr` / `Ms`.
- **An outside party never sees the SO number.** A supplier message leads with the PO; a
  logistics message and a customer message lead with the CR/TCF ref. They do not speak SO.
- **Every order named in a message carries its own REF, and a question about an order is never
  posted without one** — that is what makes a group reply traceable back to a single order.
- **One counterparty, one message.** A bulk send produces ONE message per supplier and per
  logistics company, never one per order: a supplier message aggregates by SKU (the same SKU
  across orders becomes one line), a logistics message keeps each delivery as its own block,
  because each has a different customer, address and day.
- **Two tones per audience** — `Remind` before the date, and the firmer `Call {party} — …`
  once it has passed. They are the two tones the actions above already carry, not a third
  vocabulary.

## 4 · Which one shows first

```
1  Broken commitment or today's run
     Deliver today · Upload delivery photo
     (the follow-up after a FAILED delivery is not built — see below)
2  The customer must be told something — THROUGH LOGISTICS, never by us
     Call {logistics} — arrange new delivery date
3  Goods are not secured
     Call {supplier} — confirm ready date · Issue PO
4  Delivery preparation
     Assign logistics · Call {logistics} — confirm delivery date · Issue delivery order
5  Money
     Collect RM {amount} from {customer}
```

**Not built yet, and named so nobody reads this list as a description of the screen:** the
follow-up action after a failed delivery. `Deliver today` completes on delivered OR a
Delivery Exception with its reason, but nothing yet turns that exception into the next
action. It belongs to whichever card next touches the delivery day.

Money shows last and this is not a demotion — you do not chase payment for goods you
cannot deliver. It never disappears: it is always in the drawer list and the Owing filter.

## 5 · Gates — different from display order

A gate REFUSES an action. Display order only decides what is read first.

**TODAY the money gate sits on CONFIRMING the date, not on issuing** — `bookingConfirmGate`
is the only live money gate. **C7 moves it** to where this section says it belongs. Until
C7 ships, read the paragraph below as the target, not the screen.

**Issuing the delivery order is the hard gate**, not agreeing a date: a date can be agreed
with a customer while the goods and the money are still coming. Issuing is refused unless
every goods line is reserved to this order (accessories pass automatically), **the money is
collected**, and the date is not a Sunday or a Malaysian public holiday.

**"The money" is ONE number, and an unpaid storage fee is part of it** (Jess, 2026-07-27):
`outstanding = Σ lines + add-ons + chargeable storage fee − orders.paid`. A storage fee
that has not been collected holds the delivery exactly as an unpaid balance does — there is
no second, softer rule for it.

**The emergency override — the only way past it.** When goods must go out before the money
is in, **the manager approves it, nobody else** (Jess, 2026-07-27). The request and the
decision both live on the order and reuse the approval channel that already exists; the
decision records who asked, who decided, when, and why. Two outcomes, and the approver
picks one out loud:
- **released, fee still owed** — the goods go, the money action stays open. This is the
  default; an override must never quietly forgive money.
- **released and waived** — the fee is written off with a reason.

**Operations is told by the work itself.** The moment the override is granted the order's
top action changes from collecting to delivering, so it surfaces in the operator's queue by
itself — the same way every other action in this portal arrives. No separate alert engine.

**AGREEING a date is softer than ISSUING the document.** Agreeing still WARNS about goods,
money and the calendar, so nobody promises a day the goods cannot make — but it does not
refuse. What is refused at agreement time:

- **Sunday and Malaysian public holidays** — the two hard blocks. No logistics company runs.
- **A missing building type.** A condominium can only take a half-day delivery, so the date
  cannot be agreed until the building type is filled in
  (`docs/COPY-STANDARD.md`, the delivery window words). Measured 2026-07-27: 40 of 56 live
  orders have it blank, so without this refusal the half-day rule would never apply.

What only WARNS: a logistics company's own working days, closed dates, capacity and notice
period — a phone call beats a calendar.

**Grouping rules, unchanged:** a bed set (mattress + frame) can never be split; a sofa may
travel on a second trip only if the customer agreed; accessories never block a delivery.
**The default is one trip** — with a one-month selling window both usually make it — and the
split question is only asked when the sofa would hold the bed set back.

## 6 · Row order

Primary: risk to the promise — overdue → due today → due next working day → commitment
broken → stock will miss the window → action due soon → normal.
Secondary: the customer's promised date.
Tertiary: order value, high to low — a tie-breaker only. A large order weeks away never
outranks a small one going out tomorrow.

## 7 · The three dots

Three independent facts. Each dot carries its own small icon, so the dots need no header of
their own; the column's `Status` header belongs to the stage pill beside them.

| | green | amber | red |
|---|---|---|---|
| goods | all in | Waiting Goods Arrival | no PO raised, or the supplier's date is late against the deadline |
| delivery | the CUSTOMER confirmed | logistics gave a date, customer has not confirmed | past the deadline and still unconfirmed |
| money | settled | still owing, and the money is not late yet | still owing AND late — the balance due date has passed, or the goods have been delivered |

A delivered order never alarms on goods or delivery. Delivered is not paid — and once the
goods are out, owing money is always RED: there is nothing left to wait for.

**The money dot had no amber until C10 reported it** — every other track has three tones, so
"owing but not due yet" could not read differently from "owing and late", and the loudest
colour was spent on both. The rule above uses the balance due date the system already keeps.

## 8 · What is deliberately NOT an action here

- Anything a trigger already does by itself (a number stamped by the database).
- Any step nobody records: "goods loaded", "driver departed".
- Any tick-box that would only record "I say I did it".
- **Waiting states are not actions.** `Waiting Supplier Reply` · `Waiting Goods Arrival` are
  monitoring states: nobody does anything while they are true. They become an action only
  when the wait EXPIRES or a human decision is required.
- **"Everything is ready, the day has not come" is not an action either** (Jess ruled
  2026-07-27). Goods in · logistics assigned · the customer's date confirmed · that date
  still ahead — there is nothing for a human to do, which is exactly why the old
  `Confirm delivery with {customer}` was the one row in the drawer with no button that
  could close it. A row with no button teaches a new hire that they have missed something.
  It becomes a FACT — `Delivering 27 Jul · 9–11 AM`, quiet tone, never red — and
  `Deliver today` takes over on the day.
