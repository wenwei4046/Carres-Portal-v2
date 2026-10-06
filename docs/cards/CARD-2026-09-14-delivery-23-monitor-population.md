# Delivery Card 23 · Monitor population, cancelled-order exclusion and urgency sorting

| | |
|---|---|
| Module | Delivery |
| Sequence | 23 |
| Owner authority | `docs/delivery/MASTER.md` §8.2 (`Order details incomplete` rail row) · §8.3 (entry rule, the work order) · owner rulings 2026-09-14 |
| Build reference | the approved Delivery Monitor prototype, §1 and §2 |
| Depends on | nothing — this is the first Card and it owns the row POPULATION |
| Blocks | Cards 24, 25, 26 — every later Card presents rows this Card decides |
| Migration | **none.** No schema change; every fact already exists. |

## What this Card owns

**Which rows reach Monitor, and in what order.** It does not touch the card, the calendar, the
schedule tab or the expanded row.

## Why it is first

Cards 24–26 all present rows. If the population is wrong, they present the wrong thing correctly.
Fixing the population first means every later Card is verified against a truthful list.

## The work

1. **A cancelled order never reaches Monitor.**
   `isOpenDeliveryScope` (`apps/web/src/pages/operation/delivery-work.ts`) tests only
   `status !== "delivered" && !delivered_at`. MASTER §8.3's entry rule has always named cancelled
   orders; the predicate never enforced it. Add the cancelled test.
   *Measured on production 2026-09-14:* 3 cancelled orders are on Monitor, one of them a two-leg
   Journey contributing 2 rows.

2. **`All delivery work` sorts by urgency**, per MASTER §8.3 "THE WORK ORDER":
   `overdue` → due today → nearest action deadline → the rest, then the existing customer-name +
   row-id tie-break. `matchesView` case `"all"` currently returns `true` with no sort, so
   production orders roughly by descending SO number and the one overdue row sits ninth.

3. **`Order details incomplete` never hides `Overdue`.** Those rows sort into their own band
   beneath live work. The §8.4 status rung is unchanged — only the ORDER changes.

4. **An eighth `WORK TO DO` rail row — `Order details incomplete`** — with its live count,
   computed like every other queue over the rows the other groups already narrowed (Law D).

## Explicitly NOT in this Card

- No data cleanup, repair worklist or backfill. Constitution §6: every incomplete row today is
  imported test data that go-live discards. The rail row is a door, not a project.
- No change to the twelve columns, their order or their two-line grammar (owner ruling 6).
- No change to any status word (Card 24 owns vocabulary).

## Acceptance

- A cancelled order appears nowhere on Monitor — not in `All delivery work`, not in any queue,
  not in a count, not on the schedule.
- A delivered scope stays absent; a delivered row still owing proof remains, and leaves when the
  proof is accepted.
- With an overdue row and a nearer-deadline row present, the overdue row is first.
- A row reading `Order details incomplete` never sorts above a row reading `Overdue`.
- The rail shows eight `WORK TO DO` rows, the eighth carrying a real count.
- Production walk: `All delivery work` drops from 91 to 88; `Order details incomplete` reads 50.

## Tests

- `delivery-work.test.ts` — `isOpenDeliveryScope` refuses a cancelled order; a delivered-with-proof-
  owing scope survives.
- `delivery-monitor.test.ts` — the urgency comparator; the incomplete band; the eighth rail row's
  count.
- Full `apps/web` suite green before the PR is opened.
