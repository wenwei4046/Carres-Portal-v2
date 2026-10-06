STATUS: VOID — superseded by CARD-2026-08-16-order-route-node-map.md (never executed, no PR)
DATE: 2026-08-16
PR: pending

# ORDER ROUTE — CANVAS REBUILD (one card)

Copy everything below this line into ONE build chat.

---

Order Route Canvas Rebuild — CONTINUOUS BUILD, DOCUMENTATION FIRST.

Read `CLAUDE.md`, `docs/orders/MASTER.md` (route sections), `docs/delivery/MASTER.md`,
`docs/orders/MASTER.md` §7/§8 (delivery actions + gates), `docs/ui/MASTER.md`,
`docs/COPY-STANDARD.md`, `docs/01/02/03-*` as governing authority. Inspect current
`origin/main` first. The owner approved the final ASCII and the full checklist below
on 2026-08-16.

## STEP 0 — DOCUMENTATION PR FIRST (owner protocol 2026-08-16)

1. Commit THIS card file verbatim to `docs/cards/CARD-2026-08-16-order-route-canvas.md`
   (it may already exist in the owner's working copy — same content, keep it).
2. Write the DESIGN RULES below into `docs/orders/MASTER.md` (route law) and any
   ERP-wide visual rules into `docs/ui/MASTER.md`, under the MASTER OVERWRITE LAW.
3. Open a DOCUMENTATION-ONLY PR with the card + MASTER overwrites. Report repo paths,
   git diff, commit SHA, PR number.
4. DO NOT change ERP code in this PR. Implementation is a separate step that starts
   only when the owner says "implement".
5. After merge, update this card header to `STATUS: EXECUTED · PR: #nnn` and commit.
6. Finish with `git status` clean.
7. `docs/cards/` is HISTORY, not a second rulebook. MASTER outranks cards, chats,
   screenshots and temp files.

## A · THE CANVAS — one map, not cards

- The Order Route tab renders ONE continuous canvas: nodes joined by lines, forks
  spreading naturally, pan + zoom (`− + ⛶`). Read-only: nothing on the canvas edits
  business data; every node carries an `Open {document} →` door to the owning module.
- The current card/section layout (shipped in #822 and #824) is a transitional state
  and is REPLACED by this canvas.
- No overall order status exists anywhere on the canvas.

## B · THREE ROUTES, SIMULTANEOUS

- The SO node fans into THREE routes the moment the order exists: GOODS ·
  DELIVERY/LOGISTICS · MONEY. No route waits for another. Delivery starts at SO
  creation, never after purchasing.
- Each route carries its OWN `CURRENT` station — up to three CURRENT nodes at once.
- Goods may fork: one sub-chain per goods line / per source; quantities from
  different sources get their own drawn lines.

## C · NODE ANATOMY (max five lines)

```
MODULE NAME
one plain fact (doc no / count / amount / date)
[Owner initials] next action sentence
Open {target} →
```

- Completed nodes shrink: name + document number + door; the action line disappears.
- Owner initials chip comes from the Work Engine roster (buddy cover applies);
  staff never hand-pick owners; action sentences never repeat the name.
- Colours (map to Carres design tokens, invent nothing): CURRENT = blue border +
  owner avatar/initials chip · done = green · waiting = grey · exception = amber ·
  not-yet-reached steps = grey DASHED ghost boxes, so the whole road is visible.

## D · ROUTE CHAINS — the exact stations

GOODS route (per goods line / per source):
- `PURCHASING` — fact `No Purchase Order yet` → action `Raise the Purchase Order`
  (PO Duty owner). Completion fact: PO exists → node becomes `PO-nnnn · issued`.
- `SUPPLIER` — fact `Ready date not confirmed` → action `Confirm the ready date`
  (PO Duty). Auto-completes when the date is written. Never a manual Complete.
- `RECEIVING` — fact `Not received yet` → `Open GRN →` (GRN Duty). Auto-completes
  on GRN. Route page never edits a GRN.
- `STOCK` — fact `{n} of {m} Units ready`; shows Unit IDs once allocated; plain
  reason when none (`Waiting for purchase`).

DELIVERY route (starts at SO creation):
- `LOGISTICS` — fact `No logistics chosen yet` + `Due: {date}` (3 working days
  before the customer date, per §7) → action `Assign logistics` (Delivery
  ownership rule).
- `DELIVERY DATE` — facts: customer-promised date, whether date AND slot are
  customer-confirmed (a date logistics proposed is a fact, not a confirmation).
  Actions while open: `Ask customer for a delivery slot` / `Save the agreed date`
  (Responsible salesperson).

MONEY route:
- `MONEY` — Total · Paid · `RM {n} still to collect` (one arithmetic,
  `order-money.ts`) + Payment owner + `Open Payments →`. Read from Payments only.

THE GATE — `DELIVERY ORDER`:
- Read-only convergence node listing what is missing, GitHub-checks style:
  `NOT READY FOR DELIVERY · {k} of {n} requirements met` with plain sentences:
  `Goods not ready (0 of 1)` · `No logistics chosen` · `Date + slot not confirmed` ·
  and when the confirmed date lands on a refused day:
  `Date falls on a Sunday — pick another day` (public holidays same pattern).
- When every requirement is met the SYSTEM issues the DO (`DO-DDMMYY-NNNN`).
  NO Release button, NO Approve button, no manual bypass, ever.
- MONEY LAW (owner final ruling): outstanding balance NEVER blocks the DO by
  itself. Only a Finance-recorded payment exception blocks; then MONEY turns amber
  with `Money exception recorded` and the gate adds
  `Delivery release blocked by Finance`.

AFTER THE GATE:
- `DELIVER` — statuses `Not scheduled / Scheduled / In transit / Delivered`,
  delivery date + driver/logistics person; facts come from the Delivery module;
  never marked done by hand on this page.
- `DELIVERY PHOTO` — final node. `No delivery photo yet` +
  `[Owner] Upload the delivery photo`; on upload shows uploader + time,
  auto-completes.

CONDITIONAL — `LOAN` (exists only when a loan item is out; no empty box):
- Amber node: `{n} sofa on loan to customer` · `Collect back on delivery day` ·
  `Open Loan →`; dashed edge into `DELIVER` labelled `collect back`.
- After delivery, an uncollected loan stays amber:
  `Loan sofa not collected back · [Owner] Collect the loan sofa`.
- A loan never blocks the DO and never blocks delivery completion (owner default
  2026-08-16).

## E · OWNER ENGINE (facts → owner rule)

| Trigger fact | Owner rule |
|---|---|
| No Purchase Order | PO Duty |
| Supplier date missing | PO Duty |
| Goods not received | GRN Duty |
| Unit not allocated | Stock rule |
| No logistics chosen | Delivery ownership |
| Delivery date missing | Responsible salesperson |
| Balance owed | Payment ownership |
| Finance exception | Finance owner |
| Delivery photo missing | Delivery owner |
| Loan not collected | Delivery owner |

Rules live in the Work Engine, never hard-coded in the UI. Route shows initials
chips; Team Work shows full names.

## F · EMPTY STATES

Every empty state answers three questions: what is missing · why · who does what
next. Example: `No Purchase Order yet` + `[YJ] Raise the Purchase Order`.
BANNED: `No data` · `No results` · `Not available`.

## G · THE APPROVED DRAWING (the spec — build exactly this)

State 1 — SO-1319 as it stands (legend: ▣ CURRENT blue · ✓ done green ·
○ waiting grey · ⚠ exception amber · ┄ dashed = not reached yet):

```
                          ┌───────────────────┐
                          │ ✓ SALES ORDER     │
                          │ SO-1319           │
                          │ Ordered: Wed,     │
                          │ 12 Aug            │
                          │ Open SO-1319 →    │
                          └─────────┬─────────┘
        ┌─────────────────────────┬─┴─────────────────────┬──────────────┐
      goods                     goods                  delivery        money
  B1201S · King · Qty 1     (same line)                   │              │
   1 to buy from factory        │                         │              │
        │                       │                         │              │
 ┌──────┴──────────┐   ┌────────┴────────┐   ┌────────────┴───┐  ┌───────┴────────┐
 │ ▣ PURCHASING    │   │ ○ STOCK         │   │ ▣ LOGISTICS    │  │ ▣ MONEY        │
 │ No Purchase     │   │ 0 of 1 Units    │   │ No logistics   │  │ RM 1,250 paid  │
 │ Order yet       │   │ ready           │   │ chosen yet     │  │ RM 1,249 still │
 │ [YJ] Raise the  │   │ Waiting for     │   │ Due: Mon, 21   │  │ to collect     │
 │ Purchase Order  │   │ purchase        │   │ Sep            │  │ [KA] Collect   │
 │ Open            │   │ Open Stock →    │   │ [OP] Assign    │  │ RM 1,249       │
 │ Purchasing →    │   └────────┬────────┘   │ logistics      │  │ Open           │
 └──────┬──────────┘            ┆            │ Open Delivery →│  │ Payments →     │
        ┆                       ┆            └────────┬───────┘  └───────┬────────┘
 ┌──────┴──────────┐            ┆                     ┆                  ┆
 ┊ ○ SUPPLIER      ┊            ┆            ┌────────┴───────┐          ┆
 ┊ Ready date not  ┊            ┆            ┊ ○ DELIVERY     ┊          ┆
 ┊ confirmed       ┊            ┆            ┊   DATE         ┊          ┆
 └──────┬──────────┘            ┆            ┊ Date + slot    ┊          ┆
        ┆                       ┆            ┊ not confirmed  ┊          ┆
 ┌──────┴──────────┐            ┆            ┊ Customer       ┊          ┆
 ┊ ○ RECEIVING     ┊            ┆            ┊ requested:     ┊          ┆
 ┊ Not received    ┊            ┆            ┊ Thu, 24 Sep    ┊          ┆
 ┊ yet             ┊            ┆            └────────┬───────┘          ┆
 └──────┬──────────┘            ┆                     ┆    ┌─────────────┘
        └───────────────────────┴──────────┬──────────┘    ┆ only blocks if
                                           │               ┆ Finance records
                                           │               ┆ an exception
                              ┌────────────┴────────────┐  ┆
                              │ 🚦 DELIVERY ORDER       │◀┄┘
                              │ NOT READY FOR DELIVERY  │
                              │ 0 of 3 requirements met │
                              │ · Goods not ready       │
                              │   (0 of 1)              │
                              │ · No logistics chosen   │
                              │ · Date + slot not       │
                              │   confirmed             │
                              │ (system issues the DO — │
                              │ no Release button)      │
                              └────────────┬────────────┘
                                           ┆
                              ┌────────────┴────────────┐
                              ┊ ○ DELIVER               ┊
                              ┊ Not delivered yet       ┊
                              └────────────┬────────────┘
                                           ┆
                              ┌────────────┴────────────┐
                              ┊ ○ DELIVERY PHOTO        ┊
                              ┊ No photo yet            ┊
                              └─────────────────────────┘
```

State 2 — after progress (the same map grows):

```
 ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
 │ ✓ PURCHASING    │──────│ ▣ SUPPLIER      │──────┊ ○ RECEIVING     ┊
 │ PO-2048 issued  │      │ Ready date not  │      ┊ Not received    ┊
 │ Open PO-2048 →  │      │ confirmed       │      ┊ yet             ┊
 └─────────────────┘      │ [YJ] Confirm    │      └─────────────────┘
                          │ the ready date  │
                          │ Open PO →       │
                          └─────────────────┘

 Gate: 🚦 2 of 3 requirements met · Goods not ready (0 of 1)
 Refused day: · Date falls on a Sunday — pick another day
 Finance exception: ⚠ MONEY · Money exception recorded ·
                    Delivery release blocked by Finance
 All done, last node: ✓ DELIVERY PHOTO · Uploaded by {name} · Mon, 28 Sep
```

## STILL LOCKED — not reopened

The three-route law and per-route CURRENT · goods six-fact truth · amendment
machinery · §7 delivery actions and §8 gates (this card RENDERS them, changes
nothing) · date format `Wed, 12 Aug` · capitalize-up names · Inter 13 / 13-11 ·
pills capsule · the Object page (Order tab) shipped in #822 · Work Engine
ownership rules.

## Acceptance boundary (for the LATER implementation step, not the doc PR)

Authenticated production verification at 1440×900 and ~920px on a real SO:
one canvas with pan/zoom · three routes visible simultaneously with up to three
CURRENT nodes · node anatomy and colours as ruled · ghost path visible to the
end · gate lists missing requirements in plain sentences and shows the refused-day
line when applicable · no Release/Approve control anywhere · money never listed
as a gate requirement without a Finance exception · LOAN node only on orders
with a loan · DELIVER and DELIVERY PHOTO present · every door lands on the owning
module. Overwrite the owning MASTERs in the same PR under the MASTER OVERWRITE
LAW. GitHub CI must pass before merge; merge deploys and must prove the exact SHA
on every canonical surface.
