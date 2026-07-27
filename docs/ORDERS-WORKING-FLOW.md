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
| **money** | **`orders.paid`** — the only money figure with a writer (`top_up_order`, Stripe). `ops_order_control.balance` is NULL on every live row and the payment ledger tables hold zero rows with no writer. **Never read the ledger.** |

## 3 · The actions

Every action carries six things (the model file explains why). `{party}` is the real name
when the system knows it, the role word only when it does not.

**Ownership is two different things, and only the Task Owner is written per action:**
**Task Owner** = assigned automatically by the module that raised the action; it may change
hands. **Case Owner** = the one person responsible for this customer's case from start to
finish; it never changes and is never repeated on an action.

### Purchasing

**`Send PO to {supplier}`**
- Trigger: a goods line needs buying and no PO covers it
- Checklist: supplier · items · quantity · purchase price · send · record PO number · record supplier ready date
- Completion: PO number exists AND supplier ready date exists
- Due: the customer's date minus the supplier's lead time minus the internal buffer
- Task Owner: the Purchasing task owner (today the PO-duty holder, `org_duties`)

**`Call {supplier} — confirm ready date`**
- Trigger: ready date missing · due for re-confirmation · passed with no goods in · later than the customer's date · changed by the supplier
- Checklist: production status · ready date · ready quantity · any delayed item · record the latest ready date · record the outcome
- Completion: latest ready date recorded AND outcome recorded
- Due: red once inside the arrival window. **Today that window is a flat 7 days (mattress /
  bed frame) and 5 days (sofa), which is wrong — a sofa takes longer to make and gets the
  shorter warning.** The fix is frozen but not buildable here: the supplier master must
  carry production time as a NUMBER (`Standard production working days`), not the free text
  it holds today (8 of 10 suppliers are empty). Then the rule becomes
  `customer date − production working days − internal buffer`. **That change belongs to the
  Purchasing line**, and this window reads it once it exists.
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
- **The customer is not contacted in this stage.**

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
- What IS recorded: the customer accepted the delay · the reason (from the shared reason
  list) · the delay history. Those are the existing extension fields — no new store.

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
- Due: 1 working day before the customer's date
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

## 4 · Which one shows first

```
1  Broken commitment or today's run
     Deliver today · the failed-delivery follow-up · Upload delivery photo
2  The customer must be told something
     Call {customer} — agree new delivery date
3  Goods are not secured
     Send PO to {supplier} · Call {supplier} — confirm ready date
4  Delivery preparation
     Assign logistics · Call {logistics} — confirm delivery date · Issue delivery order
5  Money
     Collect RM {amount} from {customer}
```

Money shows last and this is not a demotion — you do not chase payment for goods you
cannot deliver. It never disappears: it is always in the drawer list and the Owing filter.

## 5 · Gates — different from display order

A gate REFUSES an action. Display order only decides what is read first.

**Issuing the delivery order is the hard gate**, not agreeing a date: a date can be agreed
with a customer while the goods and the money are still coming. Issuing is refused unless
every goods line is reserved to this order (accessories pass automatically), the balance is
collected, and the date is not a Sunday or a Malaysian public holiday. Agreeing the date
still WARNS about the same three, so nobody promises a day the goods cannot make. A bed set (mattress + frame) can never be split; a sofa may travel on a second trip
only if the customer agreed; accessories never block a delivery. A logistics company's own
working days, closed dates, capacity and notice period **warn but never block** — a phone
call beats a calendar. **Two exceptions that DO block: Sunday and Malaysian public
holidays.**

**The money gate is broken today** and must be fixed before it can be trusted: it reads the
empty ledger, so it refuses bookings for customers who have already paid. Card C5.

## 6 · Row order

Primary: risk to the promise — overdue → due today → due next working day → commitment
broken → stock will miss the window → action due soon → normal.
Secondary: the customer's promised date.
Tertiary: order value, high to low — a tie-breaker only. A large order weeks away never
outranks a small one going out tomorrow.

## 7 · The three dots

Three independent facts, so the column has no header; each dot carries its own small icon.

| | green | amber | red |
|---|---|---|---|
| goods | all in | Waiting Goods Arrival | no PO raised, or the supplier's date is late against the deadline |
| delivery | the CUSTOMER confirmed | logistics gave a date, customer has not confirmed | past the deadline and still unconfirmed |
| money | settled | — | still owing (stays red after delivery) |

A delivered order never alarms on goods or delivery. Delivered is not paid.

## 8 · What is deliberately NOT an action here

- Anything a trigger already does by itself (a number stamped by the database).
- Any step nobody records: "goods loaded", "driver departed".
- Any tick-box that would only record "I say I did it".
- **Waiting states are not actions.** `Waiting Supplier Reply` · `Waiting Goods Arrival` are
  monitoring states: nobody does anything while they are true. They become an action only
  when the wait EXPIRES or a human decision is required.
