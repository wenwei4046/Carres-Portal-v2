STATUS: QUEUED
DATE: 2026-08-18
PR: pending
IMPLEMENTATION: APPROVED — owner ruled every section with the architect 2026-08-18, build straight to production

# SO BATCH PURCHASE — the buying grid becomes a hierarchy (one card)

**TAB — `To Order` → renamed `SO Batch Purchase`.** This card owns that ONE tab.
It may not touch Receiving, Claims, Report or Settings files (the §5 boundary
dispute of 2026-08-06 is still open and this card does not resolve it).

Read `CLAUDE.md`, `docs/purchasing/MASTER.md` (§1 · §2 · §3 · §4's arrival law),
`docs/ERP-ARCHITECTURE.md`, `docs/ui/MASTER.md` (§4 · §4.1 · §6.4),
`docs/COPY-STANDARD.md` (the PURCHASING five-string table, the nine verbs) on the
LATEST `origin/main`. Execute as CONTINUOUS BUILD: implement in your own slice
order → tests → release gate → PR → CI → merge → deploy → prove SHA → overwrite
the owning MASTERs in the same PRs. **If code structure conflicts with this card,
STOP and report — do not choose.**

## 1 · The rename, and what does NOT move yet

`To Order` becomes **`SO Batch Purchase`**. The tab word, the route and the page
title move together.

**`+ Create Purchase` STAYS ON THIS RAIL until the Manual Purchase card ships.**
The approved end state moves it (`purchasing/MASTER.md` §1/§3), but a manual
entrance that exists nowhere is worse than one in the wrong place — the law says
it *"may never be missing"*. Removing it is the Manual Purchase card's first act,
not this card's.

## 2 · The grid becomes three levels

Today one row per SO line, flat. Four customers wanting the same beige
three-seater are four rows and the buyer adds them up in their head. **Carres buys
from a factory, not from a sales order**, and MOQ, pack and lorry-fill are all per
item.

```
Item · Description        Qty Needed · Stock · On PO · To Buy
  └─ variant (fabric / colour)
       └─ SO No · Customer · Customer Delivery · Qty · Coverage · Supplier
```

- **`To Buy` is PRINTED**, never left as `11 − 3 − 2`. Same law Receiving carries
  for `Outstanding`.
- **The buyer may not edit `To Buy`.** Wanting extra for the shelf is a Manual
  Purchase and goes through approval; typing it onto a customer's line hides a
  spend behind a customer's authority.
- **Shortage floats to the top. Only a shortage line is selectable.**
- **`Coverage` per SO line** — `stock` · `PO-2041 · 22 Aug` · `SHORT`. The buyer
  sees at a glance which promises have nothing behind them.

Reference: 2990s runs this shape in production —
`apps/backend/src/pages/Mrp.tsx` (Item Code → variant → SO lines; only SHORTAGE
lines orderable, `:184`; shortage models float, `:212`).

## 3 · Sofa groups by SALES ORDER, everything else by item

A sofa is sold as a colour-matched SET and two customers' sofas may not merge onto
one PO line — the fabric batch must match inside the set. **Selecting any piece
selects the whole same-SO set.**

```
Mattress · Bedframe · Pillow · Protector    group by ITEM
Sofa                                        group by SALES ORDER
```

2990s states the reason in its own header — `Mrp.tsx:15-17`: *"A sofa is one PO
per SO, so selecting any sofa variant selects the whole same-SO set together."*

**One page, two groupings, chosen by category.** The complexity is in the
business; refusing it moves it into a buyer's head every morning.

## 4 · Destination and date are DERIVED — never asked

The customer's order already says where the goods go and when they are wanted.

- **Each PO line's destination and delivery date derive from the source SO line.**
- **The header rolls UP from the lines.** It is not asked.
- A buyer may still change a line. That is an **inline cell**, never a queue
  action, and it carries a reason.
- **A changed destination raises its consequence at the moment of the change** —
  goods landing at `AL` for an order shipping from `Carres` need a stock transfer
  before the delivery date, and the screen says so rather than letting the
  warehouse find out on the morning of the run.

2990s shipped a "PO Defaults" card asking these two and DELETED it —
`PurchaseOrderFromSo.tsx:6-9`.

## 5 · Grouping at Issue belongs to the SERVER

`PurchaseOrderFromSo.tsx:17` — *"Server groups by main supplier and emits one PO
per supplier."* Dynamics 365 states the same floor for requisition consolidation:
differ on legal entity, vendor or currency and a separate order is created.

**The buyer picks WHAT to buy; the system decides how it splits.** No Combined /
Per-SO choice is offered.

`Issue` keeps its current behaviour: **zero popups, zero toasts**; rows update in
place; a partial failure stays with `Retry` until it succeeds and never silently
takes the others with it.

## 6 · The rail

`PO SCHEDULE` (rolling calendar, `Overdue` above the days, every row
`Fri 7 Aug`, zero-count days still render) and `CATEGORY` are unchanged.

> **Jess, 2026-08-19, pointing at this rail in production: it stays EXACTLY
> as it is** — weekday-first day rows (`Wed, 19 Aug`), `Overdue` red on top,
> the 200px left column. *"Stop creating new"*: the rebuild reuses this rail,
> it does not redraw it.

**`Queues` joins them**, and it is the ruled heading (`COPY-STANDARD.md`) — the
module's open actions, each row's name IS its action:

```
Queues
  Issue PO
  Check the supplier
  Check the SKU
```

No `STATUS` heading is added: status is the pill on the row, and a facet
filtering by it competes with the queue rows for the same job.

## 7 · Copy

Every string comes from the PURCHASING five-string table in
`docs/COPY-STANDARD.md`. **No new word is invented in code.** The two that this
page raises:

```
Check the supplier   →  Check the supplier for {model}   →  Save the supplier
Check the SKU        →  Check the SKU with {supplier}    →  Publish the SKU
```

Two-line rows are `[fact] / [owner chip] [action]`; the owner is a chip, never
sentence text; dates print through `fmtDate()`.

## STILL LOCKED — do not touch

The engine numbers and `expectedArrivalOf` · the arrival-provenance colour law
(red only for a date the factory GAVE) · `Ready stock is SUGGESTED, never
consumed` · the PO-day plan pre-selection and human ticks as DELTAS · the single
`purchasing_issue_pos_batch` authority · Receiving, Claims, Report and Settings
files · the nine measured column widths of the Purchase Orders register.

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- Three levels render; a single-variant item collapses to two.
- Sofa selection takes the whole same-SO set; a non-sofa item does not.
- `To Buy` is printed and is not editable.
- A line with `To Buy = 0` is not selectable.
- Destination and delivery date are absent from the issue form and present on the
  issued PO lines, derived from the source SO line.
- Changing a line's destination raises the stock-transfer consequence.
- Issue emits one PO per supplier; a partial failure leaves the others issued and
  the failed group retryable.
- No string on the page is absent from `COPY-STANDARD.md`.
- Widths re-measured in a real browser; no guessed number is written down.

## Acceptance boundary

Authenticated production verification at 1440×900 and ~1920 on real demand: the
hierarchy, the sofa exception, `To Buy` printed and locked, `Coverage` on every SO
line, shortages at the top, no destination question at issue, one PO per supplier,
and the `Queues` rail filtering the grid. Overwrite `docs/purchasing/MASTER.md`
§3's WHAT IS ON SCREEN TODAY in the same PR under the MASTER OVERWRITE LAW.
