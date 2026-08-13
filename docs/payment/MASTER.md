# PAYMENT — MASTER

> **The only Payment document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **The money ARITHMETIC and the delivery GATE live in
> [`../orders/MASTER.md`](../orders/MASTER.md) §8, because they decide whether goods move.**
> This file owns the **collections DESK** — the screen where somebody chases the money.

---

# §1 · Overview

### MISSION
**Do not chase money for goods you cannot deliver.** The desk answers *who do I call today, and
what do I say* — stock-aware, in the order that will actually collect.

### THE RULE THE WHOLE DESK IS BUILT ON
**催钱前先看货.** An order whose goods are not ready is not a collection call; it is a waiting
row, and it is separated on screen rather than mixed in.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/OperationPayments.tsx`, **1,568 lines** ·
route `/operation?tab=payments` · *measured 2026-08-05 from its size, route and the shared
modules it imports; **not read line by line.***

```
QUEUES     Collect · Waiting stock · Stock late · Storage running
FACET      the MONEY state — Overdue · Unpaid · Partial · Paid · No price yet,
           DERIVED, never keyed (0347)
ROW        the order, the party, the figure, the balance-due date, and when it
           was last spoken to
EXPAND     record a payment (mints a receipt number) · history ·
           promise-to-pay · Receipt PDF · Invoice PDF
CHASE      a WhatsApp popover with a pre-call brief
```

### API + DATA
Reads the Orders feed and `ops_order_control`. Money truth: **`orders.paid`**.
One shared rule: `packages/shared/src/order-money.ts`. Money spelling:
`packages/shared/src/money-format.ts`. The collection clock (T−3 · T−2 · T−1):
`packages/shared/src/collection-clock.ts`. Ledger validity:
`isLivePayment` — the ONE predicate.

---

# §2 · Frozen rules

- **ONE money rule, four readers** — the ladder's lock, the row pill, the drawer strip and this
  desk. Before it existed, three surfaces asked three different questions and each pointed at a
  column nobody wrote: the ladder read a NULL, the gate summed an empty ledger and refused a
  fully-paid order, and this desk computed RM 0 owing for everybody.
- **ONE money spelling, asserted by IDENTITY.** `rm` re-exports `fmtMoney`; the test asserts
  they are the same function, not that they agree. **Two implementations that merely agree is
  the arrangement under which a third, rounding one grows unnoticed** — which is exactly how
  `Collect RM RM 11,246.00` reached 28 live rows and how `RM 1,251` printed for a ledger holding
  RM 1,250.50.
- **`null` and zero are different answers.** An unpriced order names no figure; an order owing
  nothing says `RM 0.00`.
- **ONE PAYMENT WRITER** — `payment_record` (0343). The ledger row and the `orders.paid` move
  are one transaction, so the figure every gate reads moves the moment the desk records the
  money. The direct PostgREST write door is closed; a raw-create deposit is recorded as a
  MIRROR (`counted_in_paid = false`) because it is already inside `orders.paid`.
- **A VOID IS A STAMP** — principal only, never a delete, and it reverses exactly the
  contribution the record made. **A voided row is therefore not money** (0347): every reader
  asks `isLivePayment`, and `summarizePayments` — the ONE roll-up — skips it. The row stays on
  screen, struck through and labelled `Voided`, with no receipt to print.
- **THE MONEY STATE IS DERIVED, NEVER KEYED** (0347). `Overdue · Unpaid · Partial · Paid ·
  No price yet` come from `orderMoney` and the collection clock. The hand-typed
  `payment_status` dropdown is retired: measured on production, ONE row of 88 carried the
  column while 25 orders had money in, and a typed `Paid` on an order owing RM 5,000 was one
  click from lying to the desk. The column keeps its data and loses its authority.
- **The collection clock is ONE arithmetic** — due = delivery − 1 working day (Mon–Sat + MY
  holidays), anchored on the customer's confirmed day, else the promised date, silent with no
  anchor. `t3`/`t2` are attention; **`t1` is the deadline**, because logistics ask for the DO
  the evening before and the DO door refuses while money holds. The Work engine consumes the
  same module — two consumers, never two clocks.
- **The promise-to-pay reuses `balance_due_date`.** No new column. It is the CUSTOMER's word;
  the clock above is the BUSINESS deadline. Both print, and they are not the same fact.
- **Recording a payment mints a receipt number** from the portal's own
  `PREFIX-DDMMYY-NNNN` scheme (`RC-…`), seeded on `{orderId}:{seq}` so a reprint matches the
  original. **It is unique in the database** (0347) and the route retries on collision — the
  seed is `count + 1`, so two payments recorded in one instant would otherwise mint one number.
- **Money leaves a trace on the ORDER** — `payment.received` / `payment.voided` in the order's
  own activity, written inside the same transaction as the money, carrying the figure.
- **`Chase` is a banned word portal-wide.** The action is `Call {customer} — …`; the stored
  column `last_chased_at` is spelt on screen as **`Message copied {when}`**, and the send path
  copies the message on BOTH branches so the sentence is true of what the portal actually
  watched.

---

# §3 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The storage-waiver lever on this desk** | Approved; the manager decision and its two named outcomes already exist on the order. |
| **A collection-velocity figure** | Approved as a review number. Blocked by the same rule the stock review follows: **a figure withholds itself until the records can back it.** |
| **Bulk remind** | Approved, and it must obey the portal's message law: ONE message per counterparty, never one per order. |
