# Delivery Card 26 · Expanded-row clipping, services separation and logistics completeness

| | |
|---|---|
| Module | Delivery |
| Sequence | 26 |
| Owner authority | `docs/delivery/MASTER.md` §8.5 (the six binding corrections) · owner rulings 2026-09-14 |
| Build reference | the approved prototype, §5 expanded row |
| Depends on | **Card 24** — the leg strip prints the leg facts Card 24 puts on the row |
| Blocks | nothing — this is the last Card |
| Migration | **none.** Presentation and grouping only. |

## What this Card owns

**The delivery brief: everything needed to act on one delivery without leaving the row.**
The four approved panels and their inline write doors are **preserved**, not redesigned.

## The work

1. **The brief never clips.** It is laid out clear of the register's horizontal scroll. Measured
   at 1440px on production, the panel values are cut at the right edge — `Customer` renders as
   `M`, `Phone` as `019-37872`. A field wraps; it is never truncated to a single letter.

2. **The leg strip.** The expansion opens with `Leg {n} of {m}`, the leg's own `{from} → {to}`
   printed in full and never truncated, and that leg's own partner, date and window — for every
   leg, with the open one marked. Panel 4 shows only the items travelling on THAT leg.
   Grep confirms no `Leg n of m` string exists anywhere in the codebase today.

3. **`Delivery fee` leaves Panel 4.** It is money, not goods, and it belongs to Payment.
   Production renders it as a stock row with three em-dashes.

4. **Services get their own subsection.** `DeliveryBrief.tsx` flattens items, accessories,
   services, stair-carry and loans into one `briefLines` array, so a service renders `—` in the
   Source, Status and Location cells. Split into `Items` (Item · Qty · Source · Status ·
   Location) and `Services` (description · qty only, **no stock columns at all**).

5. **`Access not recorded` becomes an actionable alert** — the orange problem treatment with the
   panel's existing `Open Sales Order to change` door, matching the `Building type not recorded`
   treatment §8.3 already rules. It is currently the neutral grey absence word.

6. **`Logistics details incomplete`.** When a delivery is confirmed and driver, vehicle plate,
   pickup or ETA is missing, Panel 3 states the verdict once, above the facts. The individual
   `Not recorded` lines stay. The string exists nowhere in the codebase today.

7. **The emergency contact prints name, relationship and phone** as three distinct facts.
   Production joins them into one run-on line.

## Explicitly NOT in this Card

- The four panels, their order, their inline doors (`Open Sales Order to change`,
  `Update date and time`, `Change logistics`) and the §8.6 edit states are **unchanged**.
- The conditional Loan line (Card 15, migration `0492`) is already correct and is not touched.
- No checklist panel is added — MASTER §8.3 forbids one and none exists.

## Acceptance

- At 1440px, 1100px and 390px every panel value is fully readable with no horizontal scrolling
  inside the brief.
- Expanding SO-1282 leg 1 shows `Leg 1 of 2`, the full Klang→JB route, and NOT the Chini address
  as its destination.
- `Delivery fee` appears nowhere in Panel 4.
- No `—` cell appears in the services subsection, because those columns do not exist there.
- A confirmed delivery missing driver, vehicle, pickup and ETA shows `Logistics details incomplete`.
- `Access not recorded` is orange and offers its door.

## Tests

- `DeliveryBrief` tests — the two subsections; the fee's absence; the completeness verdict's
  presence and absence; the leg strip; the emergency contact's three facts.
- Full `apps/web` suite green before the PR is opened.
