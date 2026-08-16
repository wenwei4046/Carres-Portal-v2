STATUS: QUEUED
DATE: 2026-08-16
PR: #827
IMPLEMENTATION: NOT APPROVED

# ORDER ROUTE — IMPLEMENTATION PLAN (six slices)

> **NO CODE IS WRITTEN UNTIL THE OWNER WRITES `IMPLEMENT`.** Every slice below is a boundary, not a
> task in progress. This card plans; it does not authorise.
>
> **Migration numbers must be re-derived at build time** from the MAX of the tracker tail, the
> repository tail **and every branch** (`CLAUDE.md` red line 7). The repository tail was `0354` when
> this plan was written; do not take that number on faith.

**Governing authority** — `CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` · `docs/orders/MASTER.md` ·
`docs/delivery/MASTER.md` · `docs/payment/MASTER.md` · `docs/ui/MASTER.md`.

**The approved design this plan serves:**

| Card | Status | Role |
|---|---|---|
| [`CARD-2026-08-16-order-route-node-map.md`](CARD-2026-08-16-order-route-node-map.md) | **EXECUTED / APPROVED** (PR #825) | the shipped node map — historical truth, **never overwritten** |
| [`CARD-2026-08-16-money-gate-correction.md`](CARD-2026-08-16-money-gate-correction.md) | QUEUED / NOT APPROVED | the correction this plan implements |
| **this card** | QUEUED / NOT APPROVED | how the remaining work lands |

---

## 0 · Current-state verification — the eight items already built

Measured on `main` @ `557f3ba9`. **These are verified, not re-planned.** No slice below touches them
except where a slice explicitly names one.

| # | Item | State | Evidence |
|---|---|---|---|
| 2 | Work Engine owner mapping | ✅ **fixed** | `StationOwnerKey` carries six slots — `purchasing · receiving · stock · delivery · sales · payment`; `SalesOrderRoute.tsx:106-116` maps each one. The earlier defect (a `stock` action resolving to the Purchasing duty holder) is gone |
| 3 | Route data contract | ✅ **rewritten** | `RouteNode` · `RouteEdge` · `RoutePoint` · `SalesOrderRouteMap` in `packages/shared/src/sales-order-route.ts` (1,149 lines) |
| 4 | One Node Map Canvas | ✅ **built** | real SVG (`SalesOrderRoute.tsx:273`) with pan/zoom and fit-on-load; `RouteBranchKey = root \| goods \| delivery \| money \| loan \| gate \| tail` |
| 5 | Goods branching and convergence | ✅ **built** | `joins: "gate" \| "deliver" \| "none"`; edges generated as `RouteEdge`, branches genuinely converge on the gate |
| 6 | Delivery Order gate | 🟡 **built, one rule wrong** | `GateRequirement` + counted requirements exist; **`GateRequirementId` still includes `"money"`** — the defect Slice 3 corrects |
| 8 | Deliver | ✅ | `RouteNodeKind` includes `"deliver"` |
| 9 | Delivery Photo | ✅ | `RouteNodeKind` includes `"delivery-photo"` |
| 10 | Loan linked work | ✅ **matches the ruling exactly** | conditional render, amber, dashed `collect back` edge into DELIVER, **never joins the gate**, reads `Loan not collected back` after delivery, and Card 8's completion reads the open obligation. **No change required** |

**Only item 6 carries a defect, and that defect is Slice 3's entire subject.**

---

## SLICE 1 · Finance exception — record, fields, RLS, Finance-only create and clear

**GOAL** — build the explicit Finance-owned record the owner defined. It is the thing that must
exist before money may leave the gate.

**FILES TO CHANGE**

```
supabase/migrations/03XX_*.sql             NEW — table, constraints, RLS, create/clear RPCs
packages/shared/src/finance-exception.ts   NEW — the ONE predicate: is this SO blocked?
packages/shared/src/index.ts               export it
apps/api/src/routes/operation/…            NEW routes behind requireFinance
apps/api/src/lib/auth-guards.ts            REUSE `requireFinance` — already exists, do not fork it
```

**DATA SOURCE** — Finance staff type it. **Nothing is derived.** No balance, no `orderMoney` field,
no payment row and no clock value may feed it.

**MUST NOT CHANGE**

- **Only Finance creates; only Finance clears** — enforced in **RLS and at the API boundary**, never
  only in the UI. Reuse the established pattern
  `if app_role() not in ('finance','principal') then raise '42501'`.
- **`app_role` already carries `'finance'`** (`supabase/migrations/0001_init.sql:17`). **Do not add a
  role.** `requireFinance` already exists in `apps/api/src/lib/auth-guards.ts` — do not write a second.
- Fields are `creator · reason · status · timestamps · clear evidence`, with **`clear evidence`
  required on the clear path**. A block liftable without a reason is the hand-keyed `payment_status`
  defect this repository already retired once.
- **One record, one owner (Law A).** Sales Orders and Delivery READ it; neither writes it. **No
  second door (Law C).**
- **Never derivable.** No code path computes an exception from a balance.
- A migration may never assert a production row count (`CLAUDE.md` red line 8), and a committed
  migration is never altered (red line 6).

**DONE WHEN** — a Finance user can open and clear one; an `operation` user is refused **by the
database**, not by the screen; a cleared exception keeps its full history.

**HOW TO TEST** — RLS probes inside a rolled-back transaction as the real `operation` / `finance` /
`principal` users: create refused for operation (`42501`) · create allowed for finance · clear
without evidence refused · clear allowed with evidence · the row survives, stamped with who and why.

**GAP vs APPROVED BLUEPRINT** — **100%. Nothing exists.** No table, RPC, route, permission or UI.
Only the role enum and `requireFinance` are reusable.

---

## SLICE 2 · Automatic DO issuance

**GOAL** — the system issues the Delivery Order when every requirement is met. No Release button, no
Approve button, no manual bypass in any state.

**FILES TO CHANGE**

```
apps/api/src/routes/operation/order-control.ts   the issue endpoint (~line 840)
packages/shared/src/work-engine.ts               the `issue_delivery_order` rule
packages/shared/src/order-actions.ts             the action that currently asks a person
```

**DATA SOURCE** — the gate's own requirement facts. **No new stored fact.**

**MUST NOT CHANGE**

- **Idempotence survives.** `order-control.ts` already returns the existing `do_number` instead of
  minting a second — *"a second number would be a second document for one trip."* Automation must
  not break that.
- The document numbering scheme is locked: `docNumber`, `DO-DDMMYY-NNNN`, seeded on the order id,
  date = the day it is issued. **A reprint must still match the original.**
- `docs/delivery/MASTER.md`: issue still **rechecks permitted goods, split, Warehouse, address and
  applicable hold rules atomically** and snapshots the scope. Automation changes **who triggers the
  act**, never **what the act verifies**.
- Delivery remains the document's writer. Sales Orders gains no writer.
- `Release` stays a banned employee-UI word (`delivery/MASTER.md` §15).

**DONE WHEN** — a qualifying order receives its DO with no human press, and `work-engine.ts` no
longer names the PIC as the action owner of a step nobody performs.

**HOW TO TEST** — an order meeting every requirement issues automatically · pressing twice yields
one number · a non-qualifying order issues nothing and states which requirement is still open ·
reprint matches.

**GAP** — **documented, not built.** `docs/orders/MASTER.md` already states the system issues it,
but `work-engine.ts` still sets `owner: "the order's PIC"` with a trigger including
*"money passed"*, and the endpoint is a manual POST.

---

## SLICE 3 · ⭐ Money gate correction — gate + action engine + canvas land in ONE slice

**GOAL** — money leaves the DO gate; an OPEN Finance exception takes its place.

**⛔ DEPENDS ON SLICE 1 AND MAY NOT SHIP BEFORE IT.** A gate with no blocker at all is not an
acceptable intermediate state: it would ship an ungated DO, which nobody approved.

**FILES TO CHANGE — all together, or none**

```
packages/shared/src/delivery-order.ts            drop `balanceReady`; read the exception
packages/shared/src/order-actions.ts             `deliveryHeldOnMoney` (~line 275) — money → exception
packages/shared/src/sales-order-route.ts         `GateRequirementId` "money" → the exception
apps/api/src/routes/operation/order-control.ts   the gate call site (~line 840)
packages/shared/src/sales-order-route.test.ts    the Law-D guard — see the warning below
```

**MUST NOT CHANGE — this is Architecture Law D and it is the whole point**

- **Screen and server move together.** If the canvas stops counting money while
  `deliveryOrderIssueGate` and `deliveryHeldOnMoney` still refuse, the operator reads *all
  requirements met* on a DO the server will not issue. **That is the identical defect PR #825
  refused to ship, pointing the other way.**
- **One predicate, read by all three surfaces** — not three implementations that currently agree.
- **A release never forgives money.** `orderMoney` keeps `holding` beside `outstanding`; the collect
  action still survives delivery and keeps its red dot.
- **The waiver is untouched** — manager-gated, owned by Money In, with amount, reason, actor, time.
- **The T−1 collection clock is unchanged.** Only its justification retired; the arithmetic does not
  move. Collection runs independently of the delivery.
- **Unknown price still warns, never blocks.**

> ### ⚠️ A TEST WAS WRITTEN SPECIFICALLY TO LOCK DECISION B, AND IT WILL FAIL — CORRECTLY
>
> `packages/shared/src/sales-order-route.test.ts` —
> *"⭐ keeps MONEY a requirement — the map may not say releasable while the engine refuses"*
> (around line 314).
>
> **Do not delete it. Rewrite it to assert the same law against the new predicate:** the map may not
> say releasable while the engine refuses. **The law survives; only the predicate changes.** A
> silently deleted guard is exactly how decision B comes back.

**DONE WHEN** — an order owing RM 5,000 with no exception issues its DO; the same order with an OPEN
exception does not, and says why; clearing the exception releases it. Collection work stays open
throughout.

**HOW TO TEST** — the rewritten Law-D guard above, plus: outstanding alone never refuses at any
amount · an uncollected storage fee alone never refuses · OPEN refuses · CLEARED does not · gate,
action engine and canvas return the same answer for the same order.

**GAP** — the shipped gate counts money in all three places (`GateRequirementId`,
`deliveryOrderIssueGate`, `deliveryHeldOnMoney`).

---

## SLICE 4 · Accessibility verification and fixes

**GOAL** — prove the canvas is usable without a mouse and without colour.

**RUNS IN PARALLEL.** It depends on no other slice and blocks none.

**FILES TO CHANGE**

```
apps/web/src/pages/operation/SalesOrderRoute.tsx
apps/web/src/pages/operation/SalesOrderRoute.test.tsx
```

**DATA SOURCE** — none. Presentation only; no fact changes.

**MUST NOT CHANGE**

- The 13/11 two-line grammar's contrast floor (`docs/ui/MASTER.md`): `text-base-600` measures 8.6:1
  on white. **Do not substitute a lighter token to solve a layout problem.**
- Kit tokens only. No page-local component, no inline colour.

**ALREADY TRUE — verify, do not rebuild**

```
✅ nodes are tabbable (tabIndex={0}) with onKeyDown
✅ role="link" / "group", aria-label, aria-current="step"
✅ zoom controls carry aria-labels (Zoom in · Zoom out · Fit the whole route)
✅ decorative SVG marked aria-hidden
✅ an accessibility describe block already exists in SalesOrderRoute.test.tsx
```

**GENUINELY UNVERIFIED — this is the slice's real scope**

- tab ORDER across a pan/zoom canvas: does focus follow the route, or DOM order?
- is a focused node scrolled into view when the canvas is zoomed away from it?
- does edge meaning survive without colour (dashed `collect back`, blocked amber)?
- is reduced-motion honoured on the zoom transition (`motion-safe:` is present — confirm)?
- screen-reader reading order for a graph rather than a list.

**DONE WHEN** — the whole route is reachable and comprehensible by keyboard alone, and every
blocking fact is legible without colour.

**HOW TO TEST** — extend the existing accessibility block: assert focus-visible, tab order, and that
a blocked node's reason appears in its accessible name.

---

## SLICE 5 · Full automated test coverage

**GOAL** — every rule in Slices 1–4 has a test that fails when the rule is broken.

**FILES TO CHANGE** — the test file beside each changed source file. **Tests land inside their own
slice, never in a later one.**

**CURRENT STATE** — 40 shared + 23 web = **63 route tests**. Coverage of the shipped map is genuinely
good; the gaps are the three unbuilt things.

**MUST ADD**

```
Finance exception RLS + role refusal          (Slice 1)
money out of the gate, in all three surfaces  (Slice 3)
the rewritten Law-D guard                     (Slice 3)
automatic issuance + idempotence              (Slice 2)
the accessibility assertions                  (Slice 4)
```

**MUST NOT CHANGE** — the authoritative repository gate (`ci:migrations` · lint · typecheck · the
full suite · build) must pass **on the exact source before merge**. **Never a subset**, and never a
merge on a green partial run.

**DONE WHEN** — reverting any single rule from Slices 1–4 turns a test red.

---

## SLICE 6 · Authenticated production acceptance

**GOAL** — someone signs in and looks.

**🔴 OWNER-ONLY. A BUILD CHAT CANNOT DO THIS.** It is login-gated. **A green pipeline may never be
promoted to `PRODUCTION-VERIFIED`** (`docs/orders/MASTER.md`). Only after the walk may the owning
MASTER be closed and the money-gate correction card move off `QUEUED`.

**FILES TO CHANGE** — none. This slice writes only the production record into the owning MASTER,
after the walk.

**THE WALK LIST**

```
an order owing money issues its DO
an order with an OPEN Finance exception does not, and names it
Finance opens and clears one; Operation cannot
the DO appears with no button pressed
Deliver and Delivery Photo follow it
Loan renders only when a loan exists, and reads `Loan not collected back` after delivery
collection work is open on a delivered, still-owing order
the whole canvas by keyboard, at 1440×900 and ~920px
```

**DONE WHEN** — the owner has walked every line above in authenticated production and the result is
recorded in the owning MASTER with its exact SHA and deploy run.

---

## DEPENDENCY ORDER

```
SLICE 1  Finance exception              ← FIRST. Nothing else may proceed without it.
   └─ SLICE 3  money gate correction    ← gate + action engine + canvas, ONE slice
         └─ SLICE 2  automatic DO issuance

SLICE 4  accessibility                  ← PARALLEL. Depends on nothing, blocks nothing.
SLICE 5  tests                          ← lands INSIDE each slice, never after
SLICE 6  authenticated acceptance       ← OWNER ONLY. Last.
```

**SLICE 3 MAY NOT PRECEDE SLICE 1.** Removing money from the gate before the Finance exception
exists ships an ungated Delivery Order.

---

## BOUNDARY — what this card forbids

```
✗ any change under apps/ or packages/ before the owner writes IMPLEMENT
✗ any database migration before the owner writes IMPLEMENT
✗ editing, downgrading or re-dating CARD-2026-08-16-order-route-node-map.md (EXECUTED)
✗ marking any card EXECUTED from this plan
✗ shipping the money removal and the Finance exception in separate slices
✗ deleting the Law-D guard test instead of rewriting it
✗ describing the Finance exception, automatic DO issuance or the correction as implemented
```
