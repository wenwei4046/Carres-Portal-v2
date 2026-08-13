# DELIVERY — MASTER

> **The only Delivery document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

> ## ⚠️ READ THIS BEFORE ANYTHING ELSE
>
> **Delivery is a VIEW, not a module that owns records.** The page writes NOTHING, raises NO
> actions and stores NO state of its own. It renders the delivery track of
> [`../orders/MASTER.md`](../orders/MASTER.md) §7 through the same shared computation the
> Orders list runs.
>
> **The delivery ACTIONS — `Assign logistics` · `Call {logistics} — confirm delivery date` ·
> `Issue delivery order` · `Deliver today` · `Upload delivery photo` — are defined ONCE, in
> the Orders MASTER. This file must never restate them.** A second definition would be the
> same action described in two places, and it is the one thing this module's own law forbids.
>
> **This file owns the PAGE**: its panes, its ranking, its calendar, its carrier rules.

| I am working on | Read |
|---|---|
| the delivery page itself | **§2** |
| how rows are ordered | **§3** |
| the calendar | **§4** |
| carriers and their limits | **§5** |
| an ACTION | **[`../orders/MASTER.md`](../orders/MASTER.md) §7 — not here** |

---

# §1 · Overview

### MISSION
One place an operator lives all day to see **what goes out, when, and what is stopping it** —
without opening thirty orders.

### WHY IT EXISTS AS A PAGE
Operators spend the whole day on delivery, and the Orders list ranks by risk to the PROMISE,
not by risk to the TRUCK. Those are different orders of the same rows, which is why the page
earns a sidebar item while owning no data.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/OperationDelivery.tsx`, **1,126 lines** ·
route `/operation?tab=delivery` · *measured 2026-08-05 from its size, its route and the shared
modules it imports; **not read line by line.***

```
LEFT     the delivery QUEUES — the four lifecycle queues, each with its own deadline
CENTRE   the orders in the picked queue, ranked by DELIVERY risk
RIGHT    the picked order's delivery facts, READ-ONLY
         `Open order` hands back to the drawer, where every gate lives
```

### API + DATA
**None of its own** — except **one READ**, `GET /api/operation/orders/:id/booking-brief`
(Card 3), which owns no record and writes nothing: it composes Card 1's commitment, Card 2's
allocation and the overlay's dates into the facts the T−3 customer call needs. It reads the
Orders feed and `ops_order_control`. Shared engines:
`packages/shared/src/delivery-queue.ts` · `delivery-board.ts` · `delivery-calendar.ts` ·
`delivery-groups.ts` · `delivery-order.ts` · `delivery-reasons.ts` · `delivery-fee.ts`.

---

# §2 · The workspace

### FROZEN RULES
- **The page writes nothing.** A second confirm button would mean a second set of gates to
  keep in step with the server's. The detail pane states FACTS; `Open order` opens the drawer.
- **Scope is the ENGINE'S DELIVERY TRACK, not a status column and not the Orders row's
  headline** *(re-ruled by SO V2 Card 3, owner ruling 2026-08-13 — this rule previously read
  "the same `nextActionOf` the Orders list uses")*. The page imports the same two-layer engine
  and takes **Layer 1 filtered to `track === "delivery"`**, so the two pages still structurally
  cannot name a step differently — they simply answer two different questions, which is what §3
  below has always said this page is for.
  - **Why it moved.** `nextActionOf` is Layer 2: the ONE action that leads a row across all
    three tracks. `ACTION-FLOW-STANDARD` Law 4 ranks goods work above delivery preparation, so
    every order whose goods were not yet in had a goods headline and never reached this board —
    hiding `Assign logistics` and the customer booking call from the operator whose whole job
    they are. Measured 2026-08-13: 51 live orders with logistics assigned, **zero** customer
    appointments ever confirmed. **Law 4 is unchanged** — it governs the Sales Order ROW, and
    it was never the rule for who is delivery WORK.
  - **A money-held order is still absent without any rule saying so**: its delivery track is
    silent by `deliveryHeldOnMoney`, so the PayHold law survives by construction, not by a
    filter written here.
  - **`Assign logistics` waits on the fulfilment route, never on the goods.** An open
    `Issue PO` means neither a ready-stock route nor a purchase order exists, so there is
    nothing to plan capacity around and the step stays off the board. Card 3's Rule 1 forbids
    waiting for the goods to be READY, not for them to be BOUGHT.
- **Queue-less orders are still built**, because the calendar shows every booked truck and
  clicking a held one must not open a blank. **They keep the ORDER's headline** (`nextActionOf`),
  so a held order reads `Collect RM … 🔒` here exactly as it does on the Orders list.
- **No word is invented here.** The queue labels come from the shared constant; inventing
  `Assign logistics` locally would be the same action spelt twice with its own menu item.
- **The detail pane carries the booking brief** (Card 3): the promised deadline, the expected
  arrival, and what is / is not expected in — served by `GET /:id/booking-brief`, computed by
  `packages/shared/src/booking-brief.ts`, and **rendered whether or not the goods are in**.
  The pane computes none of it and still writes nothing.
- **A confirmed booking names the company it was AGREED WITH** (`confirmed_partner_id`, 0346),
  never the one assigned right now. When they differ the pane says so and names the fix.

---

# §3 · Ranking — the page's one real invention

**The Orders list sorts by the order's overall slack**, which puts an unordered mattress above
a confirmed delivery going out tomorrow. **This page sorts by DELIVERY risk:**

```
late  →  nearest deadline  →  nearest truck day
```

**A row with no anchor sorts LAST** — *a step that cannot be late is not urgent.*

# §4 · The calendar

### FROZEN RULES
- **The calendar reads the BOOKING, not the promise.** `bookingDayOf` is the ONE rule, and the
  Orders list's Delivery column delegates to it, so two surfaces cannot put one order on two
  different days. Before this, the lens bucketed by `orders.delivery_date` — the day we
  PROMISED, which is not the day a truck moves, and the two diverge the moment anything is
  rescheduled.
- **A promised date with no booking is its own block**, `Promised this day, needs a date`,
  carrying `Call {customer} — book delivery date`. **It is never counted as a delivery.**
  *(Measured: the database held 0 bookings and 52 promised dates, so reading only the booking
  would have emptied the calendar and read as broken.)*
- **`This week` means the REST of the week**, ending Saturday.
- **Only CONFIRMED bookings fill a carrier's limit.** A provisional date is not a promise.

# §5 · Carriers

### FROZEN RULES
- **Two-stage booking.** Provisional = the carrier's date. **Confirmed = the CUSTOMER's date
  AND slot, with evidence.** The gate is server-side; a date logistics proposed is a fact, not
  a confirmation.
- **Sunday is refused for every carrier**, and it is refused **without naming a carrier rule** —
  all eight carriers hold the default `off_days [0]`, so voicing it would blame them for a rule
  none of them set.
- **A carrier's own working days, closed dates, capacity and notice period only WARN.**
  A phone call beats a calendar.
- **Carrier geography is real and it drives staging, not just the drive.** Three patterns:
  Klang collection · Sungai Buloh / Balakong (those carriers will not come to Klang) · push to
  a partner warehouse for Singapore. `docs/master-sheet-operating-model.md` §4 is the source.

---

# §6 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The follow-up after a FAILED delivery** | Owned by [`../orders/MASTER.md`](../orders/MASTER.md) §11 — the exception records its reason and nothing yet turns it into the next action. |
| **The appointment task moving to Logistics** | Approved for the day the partner portal covers appointments. Only NETS has a login today and that portal has no appointment screen. |
| **D2–D6 of the frozen delivery spec** | The two-stage booking (D1) shipped; the remaining phases of `Carres_Delivery_Module_Build_Prompt.md` are approved and deliberately untouched. |
