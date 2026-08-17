# PAYMENT — MASTER

> **The only Payment document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **Money arithmetic, receipt verification and any payment exception live here.** Outstanding
> alone never blocks delivery. See [`../orders/MASTER.md`](../orders/MASTER.md) §8 for the
> read-only order summary and the owner ruling that Operation executes unless Finance explicitly
> records `payment not received / payment exception`.

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
ROW        the order, the party, the figure, and when it was last spoken to
EXPAND     record a payment (mints a receipt number) · history ·
           promise-to-pay · Receipt PDF · Invoice PDF
CHASE      a WhatsApp popover with a pre-call brief
```

### API + DATA
Reads the Orders feed and `ops_order_control`. Money truth: **`orders.paid`**.
One shared rule: `packages/shared/src/order-money.ts`. Money spelling:
`packages/shared/src/money-format.ts`.

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
- **The promise-to-pay reuses `balance_due_date`.** No new column.
- **Recording a payment mints a receipt number** from the portal's own
  `PREFIX-DDMMYY-NNNN` scheme, seeded on the order id, so a reprint matches the original.
- **APPROVED / LOCKED RECEIPT + DELIVERY RULE — owner ruling 2026-08-12.** Operation follows
  outstanding money and uploads the customer's receipt. Submission completes Operation's action
  and exposes the record to Finance; Operation does not verify settlement and never changes price.
  Finance verifies receipt/payment truth. Outstanding, pending verification or silence from
  Finance never blocks delivery. Only Finance explicitly recording `payment not received` or a
  governed payment exception creates a delivery hold; Finance also clears that hold.
- **`Chase` is a banned word portal-wide.** The action is `Call {customer} — …`; the stored
  column `last_chased_at` is spelt on screen as **`Message copied {when}`**, and the send path
  copies the message on BOTH branches so the sentence is true of what the portal actually
  watched.

---

# §3 · Approved Evolution

| What | Why it is not built |
|---|---|
| **`order_payments` gaining a real reader** — *re-measured 2026-08-06: still **0 rows**, and the Orders audit found the DRAWER fetches this ledger for its own `Collected` figure while the shared money rule refuses to read it, so the drawer and the row can disagree* | The Record-payment button writes a ledger nothing reads, so it moves nothing. **The fix is one audited RPC that writes `orders.paid` too — never by summing the ledger**, because the raw-create door writes the same deposit into BOTH and adding them reads a half-paid order as settled. |
| **The storage-waiver lever on this desk** | Approved; the manager decision and its two named outcomes already exist on the order. |
| **A collection-velocity figure** | Approved as a review number. Blocked by the same rule the stock review follows: **a figure withholds itself until the records can back it.** |
| **Bulk remind** | Approved, and it must obey the portal's message law: ONE message per counterparty, never one per order. |
