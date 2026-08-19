STATUS: QUEUED
DATE: 2026-08-19
PR: pending
IMPLEMENTATION: APPROVED — Jess ruled all seven corrections with the architect 2026-08-19, on production screenshots

# PURCHASING RAIL + MANUAL PURCHASE CORRECTIONS — seven defects, one card

**SCOPE — the portal sidebar's purchasing group and the Manual Purchase page ONLY.**
This card corrects what the sidebar card and the Manual Purchase card shipped; it
adds no feature. It may not touch SO Batch Purchase, Receiving, Claims, the PO
register, or any API route except where a correction below names one.

Read `CLAUDE.md`, `docs/ui/MASTER.md` (§4.2 · §5 · the Register Template),
`docs/purchasing/MASTER.md` §1, `docs/COPY-STANDARD.md` on the LATEST
`origin/main`. Execute as CONTINUOUS BUILD: implement → tests → release gate →
PR → CI → merge → deploy → prove SHA → overwrite the owning MASTERs in the same
PRs. **If code structure conflicts with this card, STOP and report — do not
choose.**

## 1 · The sidebar follows the SALES template — heading, not parent row

Production today (measured on Jess's screenshot, 2026-08-19):

```
SUPPLY CHAIN            ← wrong word
  Purchasing            ← a parent row the SALES group does not have
    SO Batch Purchase
    ...
```

SALES is the template and it has TWO layers, not three: a group heading, then the
pages. **Purchasing gets exactly that:**

```
PURCHASING
  SO Batch Purchase
  Manual Purchase
  Purchase Orders
  Receiving
  Supplier Claims
  Purchase Returns        Coming soon
  Repair Orders           Coming soon
  Display Requests        Coming soon
  Consignment Orders      Coming soon
  Consignment Receipts    Coming soon
  Consignment Returns     Coming soon
  ─────────────────────
  Report
  Settings
```

- The heading `SUPPLY CHAIN` is DELETED and replaced by `PURCHASING`. A module is
  a HEADING, never a parent row — the day Stock or Delivery restructures, each
  gets its own heading, not a shared umbrella word no operator uses.
- The `Purchasing` parent row is deleted. Whatever it carried (icon, active
  logic) dies with it; the pages are the doors.
- Everything already ruled in the sidebar card HOLDS unchanged: `Coming soon`
  entries are non-controls, order never reshuffles, counts are work waiting,
  zero prints nothing, Settings server-gated, Report/Settings below the hairline.

## 2 · Manual Purchase draws ONE header

Production shows two header rows on `?tab=manual-purchase` — two bells, both
reading 54, two gear clusters. The shell law (壳画头, Loo 2026-08-02): the shell
draws the header and a page draws NO header of its own. **Delete the extra bar;
the page renders exactly one `Purchasing · Manual Purchase` row, identical in
structure to SO Batch Purchase's one row.**

## 3 · The rail moves to the LEFT, 200px, like every other purchasing page

The module's measured pages all carry a LEFT 200px rail —
`purchasing/MASTER.md:501` (SO Batch, PO SCHEDULE), `:961` (Receiving, QUEUES),
`:1164` (Claims, QUEUES). Manual Purchase shipped its QUEUES + NEED FOR on the
RIGHT — the side `ui/MASTER.md` §5 reserves for the supervision widgets
(Calendar · Team · Tasks · Activity). **Move QUEUES and NEED FOR to a left 200px
rail. Same tiles, same counts, same behaviour — only the side changes.**

## 4 · `+ New request` joins the control band

The button floats alone on an otherwise empty band above the grid — a whole row
spent on one control. The Register Template has a control band (search · columns
· export). **`+ New request` joins that band as the primary action and the empty
band is deleted.**

## 5 · No column is clipped

`Status` is cut at the right edge under the rail. Register law: content sizes
every column, nothing truncates at 1280. After the rail moves left (§3),
re-measure in a real browser at 1280 / 1440 / ~1920 and prove every column
header and every pill renders whole.

## 6 · The empty state joins the dictionary

`No requests yet — press + New request to raise the first one.` is on screen and
absent from `docs/COPY-STANDARD.md`. No word on screen may be outside the
dictionary. **Add it to the PURCHASING five-string table as the Manual Purchase
register's empty state** — the sentence itself is approved; only its missing
registration is the defect.

## 7 · The MASTERs say what shipped

In the same PRs, under the MASTER OVERWRITE LAW: `ui/MASTER.md` §4.2 gains the
SALES-template correction (heading, not parent row — overwrite the "expands in
place" wording, which shipped and was overruled by the owner on sight);
`purchasing/MASTER.md` §1's page list notes the Manual Purchase rail is LEFT like
its siblings; `COPY-STANDARD.md` gains §6's row.

## STILL LOCKED — do not touch

The thirteen entries, their order and their words · `Coming soon` non-control
behaviour · every route and `?tab=` value · the Manual Purchase form, approval,
issue flow and its three migrations (0359–0361) · SO Batch Purchase, Receiving,
Claims pages · the Settings gate · the collapse behaviour and its storage key.

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- The rendered sidebar contains the heading `PURCHASING` and no row labelled
  bare `Purchasing`; `SUPPLY CHAIN` appears nowhere.
- The purchasing pages sit at the same indent depth as `Sales Orders` under
  `SALES` — assert equal structure, not pixel numbers.
- All sidebar-card tests still pass unchanged (non-controls, order, counts,
  Settings gate).
- `?tab=manual-purchase` renders exactly ONE header row — assert exactly one
  bell icon, one settings icon, one `Jump to`.
- The Manual Purchase rail renders LEFT of the grid at 200px; QUEUES and NEED
  FOR tiles keep their behaviour and counts.
- `+ New request` sits in the control band; no empty band renders above the grid.
- At 1280, 1440 and ~1920 no column header is clipped — measured in a real
  browser, numbers written down.
- The empty-state sentence matches `COPY-STANDARD.md` byte for byte.

## Acceptance boundary

Authenticated production verification: the PURCHASING heading with pages directly
under it exactly like SALES, one header on Manual Purchase, the rail on the left
at 200px, the button in the control band, no clipped column at any of the three
widths, and the empty state in the dictionary. Screenshots at 1440 and ~1920
attached to the PR. MASTERs overwritten in the same PRs.
