STATUS: IN PROGRESS — 3 of 6 finish items done; BLOCKED on three owner rulings (see BUILD RECORD)
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

## BUILD RECORD — foundations landed on `claude/so-batch-hierarchy` (2026-08-19, planner chat)

**DONE on this branch, gates state:**
- `packages/shared/src/to-order.ts` — the whole hierarchy projection: `buildHierarchy`
  (item groups; sofa by SO via `isOnePoPerOrder`), `leafCoverage` (`ordered · po ·
  stock · short`), `leafToBuy` (PRINTED, engine's own net — Law D), `leafNeed`,
  `selectableKeysOf` (sofa whole-set), the new words (`Qty Needed · Stock · To Buy ·
  Coverage · SHORT · stock`). **17 unit tests, shared suite 2448 GREEN.** Exported
  from `index.ts`.
- `apps/web/src/components/kit/DataTable.tsx` — ADDITIVE `group.parent` outer band
  (aligned cells + optional selection) and `group.cells` may return `null` to skip
  the inner band (the single-variant collapse). No live page changes behaviour
  unless it passes `parent`.
- `apps/web/src/pages/operation/OperationToOrder.tsx` — the page surgery: GridRow
  carries `spec`; `effViewSet` opens where the work is (Overdue first — Jess's
  2026-08-19 defect); hierarchy flatten + band builders (`parentCells` /
  `variantCells`); new column set (tree · Customer · Customer Delivery · Qty
  Needed · Stock · On PO · To Buy · Coverage · Supplier · PO No.); selection =
  shortage-only, sofa set spreads via `toggleLeaf`. **`tsc` CLEAN.**

## BUILD RECORD — slice 2 landed (2026-08-19, build chat) · `3dae5b6b`

**DONE, gates stated:**
4. **Sort keys.** `need` · `stock` · `onpo` · `tobuy` were declared `sortable`
   and fell through to `return 0` — four dead headers. Each now compares through
   the SAME helper its cell prints (`leafNeed` / `leafToBuy`, plus the new
   `stockShown` / `onPoShown` for the two the projection does not own). `leafOf`
   moved above the sort so both sides share one arithmetic (Law D).
2. **The `Queues` rail** — heading + `Issue PO`, counted under the portal's facet
   law so the row's number IS what its click leaves on screen. It appends BELOW
   the calendar and the categories: Jess pointed at that rail on 2026-08-19 and
   ruled it stays exactly as it is, so nothing she approved moves down the page.
5. **P16 widths, re-measured in Chrome** at the app's own tokens (cell `400 13px
   Inter`, band `600 13px`, header `500 11px`), method unchanged. **The method was
   proved before the numbers were trusted: re-measuring `Supplier`, whose content
   this card does not touch, reproduced its shipped `111px` exactly.**
   `so 175→151 · need 111→99 · stock 71→66 · onpo 71→70 · tobuy 75→73 ·
   coverage 140→74 · po 175→121`. `customer` (181) and `delivery` (163) KEEP their
   shipped numbers — this card changes neither column's content, and today's rows
   are TEST data (`CLAUDE.md` §6), so they are no evidence for narrowing a column
   measured on live data.
   COPY-STANDARD gained the grid's whole vocabulary in the same commit.
1. **Tests, PARTLY.** The card's own mandatory cases are written and GREEN: three
   levels render · a single-variant item collapses to two · the sofa band is the
   SALES ORDER and its lines drop the identity it states · `To Buy` printed and
   with no input on the cell · a `To Buy = 0` line offers no checkbox · the
   coverage tags · one sofa tick takes the whole same-SO set while a bedframe tick
   does not. **66 pass · 42 still assert the flat grid** — and most of those 42 are
   blocked by the three rulings below, not by test mechanics.

---

## 🔴 BLOCKED — three owner decisions this card cannot make for her

### B1 · §4's destination derivation contradicts a LOCKED ruling, and has no source

§4: *"Each PO line's destination and delivery date derive from the source SO line."*

**MEASURED, 2026-08-19, production:**
- There is **no destination column on `orders` or `order_items`** — the only ones in
  the schema belong to Purchasing (`purchase_orders` · `purchase_order_lines` ·
  `purchase_demands` · `purchasing_supplier_settings`).
- `orders.warehouse_id`, the nearest thing, is **NULL on 93 of 93 orders**.
- `ToOrderLine.destinationName` is **read** (`to-order.ts:573`) and **never written**
  anywhere in the API — it is always `undefined`.
- Issue posts `destinationId: defaultDest.id` — the registry default — for every PO
  (`OperationToOrder.tsx:1233`).

**And `purchasing/MASTER.md` §"Deliver To — owner-locked operating rule (2026-08-14)"
rules the opposite of §4:** *"`Deliver To` is Purchasing's authoritative instruction, at
PO level with a PO-line override… **must not be copied onto Sales Orders**"*, default
`Carres Klang`, with Operations free to change it in Batch Purchase before Issue.

So the half of §4 that says the issue form must ASK nothing is **satisfied and verified**
— there is no destination or date question anywhere in it, and the dates already derive
through the locked engine. The half that says destination derives from the SO **cannot be
built**: the fact does not exist, and the standing ruling forbids creating it.

**RECOMMENDATION:** keep the 2026-08-14 Deliver To rule as written and strike §4's
derivation sentence. What §4 was really reaching for is already licensed by that rule —
an inline `Deliver To` cell on this grid, editable before Issue, with the split staying on
one supplier PO. That is a buildable card; it needs a `Deliver To` column, which the card's
own §2 column list does not include. **The stock-transfer consequence line (§4's last
bullet) waits on the same decision.**

### B2 · `Check the supplier` cannot be a row on this rail

**MEASURED:** the wire's `unresolved` demand never becomes a grid row. The engine drops it
at `to-order.ts:384` (`continue`) because a SKU with no supplier has no production days and
so no raise-by date. A queue row filtering THIS grid by it would always show an empty sheet.
Its action (`Save the supplier`) has no door anywhere in the portal — it is catalog work,
and this card may not touch those files.

The count is not lost: it stays on the amber band, which already names the affected items.

**RECOMMENDATION:** card it against the catalog, where the supplier is actually mapped.
`Check the SKU` is a separate matter and correctly absent — its queue already lives on
Manual Purchase's rail, and a second door for one act is what Law C forbids.

### B3 · The card's column list silently drops `Proceed date` (P18)

The ten columns in §2 have no `Proceed date`, and the foundations commit removed it. **P18
is an approved, shipped, tested feature** — it exists precisely because that fact was
*"homeless"*, and eight tests assert it. The card never says to remove it.

It also does not survive the hierarchy unchanged: it is an ORDER fact, and an ITEM band
spans many orders, so its old home (the order line) is gone. On a sofa band it still fits;
on a leaf it fits.

**RECOMMENDATION:** put `Proceed date` back, on the LEAF, where one row is one SO line —
the fact keeps a home and the eight tests keep their meaning. **Do not delete an approved
feature on the strength of a column sketch that also omits `PO No.` and kept it.** Jess's
word decides; until it comes, the tests stay red rather than being deleted, because deleting
them is the silent overturn Law 4 exists to stop.

---

**STILL OPEN after the three above are ruled:** finish the remaining flat-grid tests ·
overwrite `purchasing/MASTER.md` §3 WHAT IS ON SCREEN TODAY · release · SHA proof · flip
this card EXECUTED. **It is NOT executed and must not be recorded as such.**
