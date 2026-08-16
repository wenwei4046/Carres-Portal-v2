STATUS: QUEUED
DATE: 2026-08-16
PR: pending
IMPLEMENTATION: APPROVED — owner ruling 2026-08-16, build straight to production

# ORDER ROUTE — NODE MAP CANVAS (design specification card)

This is a DESIGN SPECIFICATION, not an implementation task. No ERP code, no
database, no `apps/`, no `packages/` may change on the strength of this card.
Implementation starts only after the owner writes "implement" and the header
line changes to `IMPLEMENTATION: APPROVED`.

---

## 1 · Design goal

Rebuild the Sales Order `Order Route` tab as ONE node-graph canvas:
white node cards joined by connector lines, routes arranged by hierarchy,
pannable and zoomable, read-only, every node opening its owning module.
Visual reference: owner's sample `_ (15).jpeg` (org-chart canvas) —
**visual structure only; none of its business content.**

## 2 · Explicitly NOT doing

- No stacked cards, no three separate section cards, no table layout.
- No invented Overall Status for the order — three routes, each its own truth.
- No Release / Approve button; no manual gate bypass.
- No manual Owner selector; owners come from the Work Engine only.
- No editing of any business data on the canvas (read-only, doors only).
- No new words outside `docs/COPY-STANDARD.md`; no colours outside the tokens.

CLARIFICATION — "no stacked cards" means: no separate Order Tracks, Goods
Routes and Delivery Release SECTION cards (the #822/#824 layout is what is
forbidden). Node cards INSIDE the single route canvas are REQUIRED and
allowed. The canvas must be one connected map surface.

## 3 · ASCII skeleton (the approved drawing — build exactly this)

Legend: ▣ CURRENT (blue border + owner chip) · ✓ complete (green) ·
○ waiting (grey) · ⚠ exception (amber) · ┊/┄ future path (grey dashed)

State 1 — SO-1319 as it stands:

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

State 2 — after progress (the same map grows; no layout change, nodes fill in):

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
 Refused day line: · Date falls on a Sunday — pick another day
 Finance exception: ⚠ MONEY · Money exception recorded ·
                    Delivery release blocked by Finance
 Conditional LOAN (amber, only when a loan exists), dashed edge into DELIVER
 labelled `collect back`:
   ⚠ LOAN · 1 sofa on loan to customer · Collect back on delivery day · Open Loan →
 Last node when everything is done: ✓ DELIVERY PHOTO · Uploaded by {name} · Mon, 28 Sep
 The last node has NO trailing line.
```

Business structure (fixed):

```
SO
├── Goods            (may fork per goods line and per source/quantity)
├── Delivery / Logistics
├── Money
└── Loan             (rendered ONLY when a loan exists)

Goods + Logistics + Delivery Date  →  DELIVERY ORDER (gate)  →  DELIVER  →  DELIVERY PHOTO
```

## 4 · Node types

| Node | Route | Fact line | Auto-completes when |
|---|---|---|---|
| SALES ORDER | root | SO No · Ordered date | always complete |
| PURCHASING | goods | `No Purchase Order yet` / `PO-nnnn · issued` | PO exists |
| SUPPLIER | goods | `Ready date not confirmed` / ready date | ready date written |
| RECEIVING | goods | `Not received yet` / GRN fact | GRN posted |
| STOCK | goods | `{n} of {m} Units ready` (+ Unit IDs when allocated) | all units ready |
| LOGISTICS | delivery | `No logistics chosen yet` + `Due: {date}` | logistics recorded |
| DELIVERY DATE | delivery | customer-requested date · confirmed date+slot or not | date AND slot customer-confirmed |
| MONEY | money | Paid · `RM {n} still to collect` | balance = 0 |
| DELIVERY ORDER | gate | `NOT READY FOR DELIVERY · {k} of {n} requirements met` + missing list / `DO-DDMMYY-NNNN` | system issues DO |
| DELIVER | after gate | `Not scheduled / Scheduled / In transit / Delivered` + date + driver | Delivered (from Delivery module) |
| DELIVERY PHOTO | after gate, LAST | `No delivery photo yet` / uploader + time | photo uploaded |
| LOAN | conditional | `{n} {item} on loan to customer` · `Collect back on delivery day` | loan collected back |

All facts are DERIVED from the owning modules. The canvas computes nothing of
its own and stores nothing.

## 5 · Node states

| State | Look (map to Carres tokens; invent no colours) |
|---|---|
| complete | green |
| current | BLUE BORDER + owner initials chip/avatar — one per route, up to three at once |
| waiting | grey |
| blocked / exception | amber |
| future (not reached) | grey DASHED box + dashed connector |

## 6 · Connector rules

- SO is the ONLY start node. Goods, Delivery, Money leave it simultaneously.
- Goods forks per goods line and per source quantity; each fork is its own line.
- LOAN appears only when a loan exists; dashed edge into DELIVER labelled
  `collect back`.
- MONEY joins the gate with a dashed edge labelled
  `only blocks if Finance records an exception`.
- DELIVERY ORDER is the single convergence gate; DELIVER and DELIVERY PHOTO
  hang below it in a straight line.
- The final node has no trailing line. Completed segments solid; future dashed.
- Edge facts (e.g. `waiting`, `collect back`) sit ON the line, small grey label.

## 7 · Owner display rules

- Owner = Work Engine roster output (buddy cover applies). Never hand-picked,
  never stored by the canvas, never hard-coded in the UI.
- Node shows initials chip only; Team Work shows full names; the action sentence
  never repeats the name.
- Trigger→owner table (already law): No PO → PO Duty · Supplier date missing →
  PO Duty · Not received → GRN Duty · Unit not allocated → Stock rule ·
  No logistics → Delivery ownership · Delivery date missing → Responsible
  salesperson · Balance owed → Payment ownership · Finance exception → Finance
  owner · Photo missing → Delivery owner · Loan not collected → Delivery owner.

## 8 · Loan rules

- Rendered ONLY when a loan item is out (no empty box on clean orders).
- Amber while out; after delivery, if uncollected:
  `Loan sofa not collected back · [Owner] Collect the loan sofa`.
- Never blocks the DO. Never blocks Delivery completion. (Owner ruling 2026-08-16.)

## 9 · Delivery Order gate rules

- Requirements listed in plain sentences, GitHub-checks style, with the met count:
  `Goods not ready (0 of 1)` · `No logistics chosen` · `Date + slot not confirmed`,
  plus, when the confirmed date lands on a refused day:
  `Date falls on a Sunday — pick another day` (Malaysian public holidays same
  pattern).
- Outstanding money is NEVER a requirement by itself. Only a Finance-recorded
  payment exception blocks; then the gate adds `Delivery release blocked by
  Finance` and MONEY turns amber with `Money exception recorded`.
- When all requirements are met the SYSTEM issues the DO (`DO-DDMMYY-NNNN`).
  No Release button, no Approve button, no manual bypass. The gate node then
  shows the DO number and turns green.

## 10 · Empty-state copy

Every empty state answers: what is missing · why · who does what next.
Example: `No Purchase Order yet` + `[YJ] Raise the Purchase Order`.
BANNED words: `No data` · `No results` · `Not available`.
All new strings go through `docs/COPY-STANDARD.md` in the same PR.

## 11 · Responsive behaviour

- The canvas is pan/zoom, so it never reflows: on load it FITS the whole map to
  the viewport (`⛶` = fit again). Controls `− + ⛶` bottom-left, always visible.
- At ~920 px and down the same canvas simply fits smaller; nodes keep their
  anatomy (no dropped lines), users pan/zoom to read. No stacked fallback.
- Header/tabs of the object page stay fixed; only the canvas is the moving surface.

## 12 · Accessibility

- Every node is a focusable element with an aria-label reading its lines in
  order (`PURCHASING — No Purchase Order yet — YJ: Raise the Purchase Order`).
- Tab order = reading order (SO → goods → delivery → money → gate → tail);
  Enter/Space opens the node's door. Zoom controls keyboard-operable.
- State is never colour-only: CURRENT also carries the chip, complete carries ✓,
  future carries the dashed border, exception carries ⚠ + words.
- Focus ring per tokens; respects `prefers-reduced-motion` (no animated panning).
- Contrast per Carres tokens (AA).

## 13 · Test / acceptance checklist

Automated tests must cover nodes AND connectors:
- [ ] one continuous canvas — zero stacked-card/table containers
- [ ] SO is the only root; Goods, Delivery, Money edges leave it simultaneously
- [ ] goods forks per line/source; each fork drawn
- [ ] LOAN absent on clean orders, present + amber on loan orders
- [ ] up to three CURRENT nodes, one per route, never a fourth
- [ ] gate lists missing requirements with met-count; refused-day line appears
      when the confirmed date is a Sunday/public holiday
- [ ] no Release/Approve control rendered in any state
- [ ] money absent from requirements unless a Finance exception exists
- [ ] DELIVER and DELIVERY PHOTO render after the gate; last node has no tail
- [ ] every node's door navigates to the owning module
- [ ] read-only: no mutation call originates from the canvas
- [ ] keyboard: tab order, Enter opens door; aria-labels present
Production acceptance: authenticated walk at 1440×900 and ~920 px on a real SO
against every line above.

## 14 · Files to change (implementation step — verify against origin/main first)

- The Order Route tab component + its tests (shipped in PR #822/#824; the
   2026-08-11 checkout predates them, so the implementer MUST list the actual
 file paths from `origin/main` in its plan BEFORE coding; if the structure
  conflicts with this card, STOP and report — do not choose).
- `docs/orders/MASTER.md` (route law overwrite)
- `docs/ui/MASTER.md` (only if an ERP-wide visual rule is added)
- `docs/COPY-STANDARD.md` (new strings)
- `docs/cards/CARD-2026-08-16-order-route-node-map.md` (STATUS updates)

## 15 · Business boundaries that MUST NOT change

- Owner Engine / Work Engine rules and roster
- Data sources: all facts read from Orders/Purchasing/Stock/Delivery/Payments
- Write logic of Payments, Stock, Delivery, Purchasing (canvas writes nothing)
- Database schema and migrations
- Other module pages; the Object page (Order tab) shipped in #822
- §7 delivery actions and §8 gate law (this card RENDERS them, changes nothing)
- Date format `Wed, 12 Aug` · capitalize-up names · Inter 13 / 13-11 · capsule
  pills · COPY-STANDARD dictionary

## Before any code (implementation step, after approval)

The implementer must first output: files to change · per-file change list ·
node/edge data structure · test plan · untouched business boundaries — and wait
for conflicts to be ruled if any are found.
