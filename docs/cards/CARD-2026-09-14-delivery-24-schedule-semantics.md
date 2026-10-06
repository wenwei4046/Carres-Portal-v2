# Delivery Card 24 · Delivery Schedule semantics, customer versus transfer counting and leg locations

| | |
|---|---|
| Module | Delivery |
| Sequence | 24 |
| Owner authority | `docs/delivery/MASTER.md` §8.2 (`Delivery schedule`, two kinds one place) · §8.4 (the two ladders) · `docs/COPY-STANDARD.md` · owner rulings 2026-09-14 |
| Build reference | the approved prototype, §0 vocabulary and §2 tab subtitle |
| Depends on | **Card 23** — it counts the rows Card 23 decides |
| Blocks | Cards 25, 26 |
| Migration | **none.** `intermediateLeg` is already computed in `delivery-work.ts`. |

## What this Card owns

**The meaning of the schedule: what a row IS, where it is going, and what it may be counted as.**
This is the correctness core of the whole correction.

## The defect it closes

Card 20 renamed the intermediate leg's result to `Arrived` and taught Reports to count customer
legs only. **It never touched the Monitor scheduling arithmetic.**
`filterMonitorCalendarCards` and `monthDayCounts` key on `confirmedDate !== null` and nothing
else; a grep for `intermediate|customerLeg` in `delivery-monitor.ts` returns zero.
*Measured 2026-09-14:* the audited week showed two cards, **both warehouse transfers**, each
printing the CUSTOMER's home town (`Mei Emi · Chini, Pahang`) as the destination of a
Klang→JB run, and the tab claimed 4 confirmed deliveries.

## The work

1. **The card carries its own kind.** `DeliveryMonitorCard` gains the leg facts it lacks —
   whether this row is a customer leg or an intermediate transfer, and the leg's own route and
   stop. The source is `delivery-work.ts`'s existing `intermediateLeg` and `legRoute`; **no new
   arithmetic is invented** (Law D).

2. **A leg names its own destination.** `delivery-work.ts` sets `location` once on `base` from the
   customer's city/state and every leg inherits it. A Journey leg's location becomes its own
   `to_loc`; the customer's town moves to the expansion. This also settles the existing Law D
   disagreement with `regionBucketOf`, which already classifies a leg by its destination.

3. **Tab rename and the split count.** `Confirmed deliveries` → **`Delivery schedule`**, with the
   subtitle `{c} customer deliveries · {t} transfers`. **The split follows the selected range and
   every active filter**, and an old total is never preserved: a range with no customer delivery
   and two transfers reads exactly `0 customer deliveries · 2 transfers`. Retired URL spellings
   still resolve.

4. **A transfer is never a customer delivery** — not in the tab count, the day or month counts,
   the rail marks, Logistics Partner Performance, Commitment, First Delivery or any report, and
   it can never produce a `Delivered to customer` result.

5. **The two status ladders**, per the rewritten §8.4 table:
   `Confirmed` / `Transfer confirmed` · `Collected by {partner}` / `Collected for transfer` ·
   `On the way to customer` / `In transit to {stop}` · `Delivered to customer` / `Arrived at {stop}` ·
   `Failed Delivery` / `Transfer failed`. `Waiting for {partner} pickup` is kept.
   One arithmetic serves the column, the `DELIVERY STATUS` dropdown, the card and every report.

6. **`Arrived at customer` is not implemented** and may not be inferred from a time, an ETA or a
   location. No such fact is recorded anywhere in the schema.

## Acceptance

- On the week of Mon 14 Sep 2026 the schedule reads `0 customer deliveries · 2 transfers`.
- Both 15 Sep cards read `Carres Klang Warehouse → JB transit warehouse`; neither says
  `Chini, Pahang` or `Sungai Buloh, Selangor`.
- No surface anywhere prints `Scheduled`, `Transfer scheduled`, `Delivery failed`,
  `Arrived at customer` or `Out for delivery`.
- A transfer leg can never reach `Delivered to customer`.
- Changing a partner or state filter changes both halves of the split.

## Tests

- `delivery-monitor.test.ts` — the split count under a filter and an empty range; a transfer is
  excluded from customer totals; a leg's own location.
- `delivery-work-status.test.ts` (`packages/shared`) — both ladders, rung by rung; no transfer
  input can produce `Delivered to customer`.
- `delivery-report.test.ts` — customer-leg-only counting still holds.
- A retired-word sweep asserting the five dead spellings appear in no rendered string.
