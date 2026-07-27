# Orders — the working flow

> **THE one file for how an order behaves.** A chat working on Orders reads this and
> nothing else for the flow. It is overwritten in place; there is never a second version,
> never a "v2", never a "superseded" note.
>
> This file says WHAT the Orders module does. It does not repeat:
> the action MODEL → `docs/ACTION-FLOW-STANDARD.md` · the WORDS → `docs/COPY-STANDARD.md`
> · the SHELL → `docs/UI-KIT.md` · progress → `docs/execution-queues-index.md`.

## 1 · What the module is

One table. One row = one customer order. Nothing is stored as a "status": every signal is
computed at read time from orders, order lines, purchase orders, stock, and the operations
overlay (`ops_order_control`).

An order can have **several open actions at once**. They are computed independently — one
action never hides another. The row shows the highest-priority one plus `+N`; the drawer
shows them all.

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

### Purchasing

**`Send PO to {supplier}`**
- Trigger: a goods line needs buying and no PO covers it
- Checklist: supplier · items · quantity · purchase price · send · record PO number · record supplier ready date
- Completion: PO number exists AND supplier ready date exists
- Due: the customer's date minus the supplier's lead time minus the internal buffer
- Owner: the PO-duty holder (`org_duties`)

**`Call {supplier} — confirm ready date`**
- Trigger: ready date missing · due for re-confirmation · passed with no goods in · later than the customer's date · changed by the supplier
- Checklist: production status · ready date · ready quantity · any delayed item · record the latest ready date · record the outcome
- Completion: latest ready date recorded AND outcome recorded
- Due: red once inside the arrival window
- Owner: the order's PIC

### Recovery (opens only when the promise is already lost)

**`Confirm recovery plan`** — internal, nobody phones the customer yet
- Trigger: latest supplier ready date is LATER than the customer's promised date
- Checklist: confirm the real ready date with the supplier · check available dates with logistics · decide the date or window to propose · name who calls the customer
- Completion: a proposed date exists AND a communication owner is named
- Owner: the order's PIC

**`Call {customer} — agree new delivery date`**
- Trigger: a recovery plan exists and the original date still cannot be met
- Checklist: explain the confirmed delay · give the proposed date or window · record the response · confirm the agreed new date · record who and when
- Completion: the customer accepted a new date AND the outcome is recorded
- Owner: the communication owner named in the plan

### Payment

**`Collect RM {amount} from {customer}`**
- Trigger: outstanding > RM 0, where outstanding = Σ order lines + add-ons + chargeable storage − `orders.paid`
- Checklist: confirm the amount · contact the customer · state the amount and the deadline · record the response · verify the payment
- Completion: outstanding = RM 0
- Owner: the order's PIC
- **Survives delivery.** A delivered order that still owes money keeps this action and its red money dot.

### Delivery

**`Assign logistics`**
- Trigger: the order needs delivering and no logistics company is chosen
- Checklist: select the company · record it · record who assigned · record when
- Completion: a logistics company is recorded. **Never "they accepted"** — assigning is our decision
- Due: 3 working days before the customer's date
- Owner: the order's PIC

**`Call {logistics} — confirm delivery date`**
- Trigger: logistics assigned but the customer has not confirmed BOTH a date and a slot
- Checklist: logistics contacted the customer · proposed date · customer-confirmed date · customer-confirmed slot · the response · the reason if unresolved · (for condominiums) driver name · driver phone · vehicle number · lift or registration requirement
- Completion: a customer-confirmed date AND slot exist. **A date logistics proposed is a fact, not a confirmation**
- Due: 1 working day before the customer's date
- Owner: the order's PIC

**`Issue delivery order`**
- Trigger: the customer-confirmed date exists
- Checklist: core goods ready · confirmed date · confirmed slot · payment condition passed · issue
- Completion: the delivery order document exists for this trip
- **The system produces it; nobody writes one by hand.** Today the number is stamped at
  dispatch, which is too late to hand to logistics the day before — card C7 moves it to
  confirmation time

**`Deliver today`**
- Trigger: the customer-confirmed date is today and nothing has been delivered
- Completion: delivered, OR one specific named problem recorded (customer unreachable · customer rejected the date · driver absent · vehicle breakdown · condominium entry refused · lift booking not done · delivery failed). **Never a generic "exception"** — use the shared reason list, never a second one
- Owner: the order's PIC

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

Confirming a delivery booking is refused unless: every goods line is reserved to this
order (accessories pass automatically) · the balance is collected · the date is not a
Sunday. A bed set (mattress + frame) can never be split; a sofa may travel on a second trip
only if the customer agreed; accessories never block a delivery. A logistics company's own
working days, closed dates, capacity and notice period **warn but never block** — a phone
call beats a calendar.

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
| goods | all in | waiting arrival | no PO raised, or the supplier's date is late against the deadline |
| delivery | the CUSTOMER confirmed | logistics gave a date, customer has not confirmed | past the deadline and still unconfirmed |
| money | settled | — | still owing (stays red after delivery) |

A delivered order never alarms on goods or delivery. Delivered is not paid.

## 8 · What is deliberately NOT an action here

- Anything a trigger already does by itself (a number stamped by the database).
- Any step nobody records: "goods loaded", "driver departed".
- Any tick-box that would only record "I say I did it".
