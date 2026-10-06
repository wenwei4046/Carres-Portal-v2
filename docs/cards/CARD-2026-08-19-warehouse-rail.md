STATUS: EXECUTED — shipped in this PR; owner walk owed
DATE: 2026-08-19
PR: this PR
IMPLEMENTATION: APPROVED — the owner directed "follow blueprint to fix side
menu bar" 2026-08-19, applying Warehouse Blueprint item 13 (owner-reviewed
item by item, 2026-08-14) under the same-day SALES-template heading rulings
(heading-not-parent; Settings at the header gear only; Reports central).

# WAREHOUSE GETS ITS OWN SIDEBAR HEADING — one small card

**SCOPE — the portal sidebar's Stock entries and the Stock tab strip ONLY.**
No new page is built; `Coming soon` entries are non-controls. It may not touch
any page's data logic, any API route, or any `?tab=` address.

## 1 · The listing (Warehouse Blueprint item 13 + the 2026-08-19 heading law)

```
WAREHOUSE                 ← its own heading, exactly like SALES — two
  On hand                   layers, no parent row, no umbrella word
  Ready stock
  In & out
  Transfers               Coming soon
  Counts                  Coming soon
```

- The three live rows keep K0's learned order (On hand · Ready stock · In &
  out) — the rail never reshuffles under an operator. When Ready stock folds
  into On hand Views (blueprint item 13.7) its row dies in that card's own PR.
- **NO Report row and NO Settings row.** The blueprint keeps Reports central
  (item 13.9) and Settings central (item 13.8); the owner's 2026-08-19 ruling
  says Settings live at the header gear only.
- `Warehouse` is the module HEADING; the goods pool is still `Stock` on any
  page (COPY-STANDARD) — `Inventory` and `Movements` stay banned.
- The strip died the way Purchasing's did: `StockTabs.tsx` keeps drawing the
  ONE header row (壳画头) in the destination format; the three pages' own
  duplicate kicker/h1 title blocks are deleted and their controls join the
  header's right slot (the Receiving pattern).

## 2 · The MASTERs say what shipped — same PR

`docs/stock/MASTER.md` §1 records the rail; `docs/ui/MASTER.md` §4.2 records
the WAREHOUSE heading beside SALES, PURCHASING and DELIVERY;
`docs/COPY-STANDARD.md` registers `Warehouse` (heading) · `Transfers` ·
`Counts` and keeps the pool-word ban.

## TESTS

- The rendered sidebar contains the heading `WAREHOUSE` and no row labelled
  bare `Stock`; the three live rows keep their exact `?tab=` hrefs.
- `Transfers` and `Counts` render as non-controls printing `Coming soon`.
- No Report or Settings row renders under WAREHOUSE for any role.
- All existing sidebar, stock-page and JumpTo tests pass.

## Acceptance boundary

CI green → merge → automatic deploy → SHA convergence proven. Owner walk:
the WAREHOUSE heading with its pages at the same indent depth as SALES,
screenshots at 1440.
