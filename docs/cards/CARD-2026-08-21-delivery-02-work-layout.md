# DELIVERY — CARD 02 · FIX DELIVERY WORK LAYOUT

**Module:** Delivery · **Sequence:** 02
**Owner ruling:** Jess, 2026-08-21
**Status:** IN DELIVERY — closure stamped at the foot of this file once production
carries the merge SHA

---

## 1 · The decision, in one line

**Delivery Work stops being an action-card wall and becomes the manual planning
workspace: one 200px local rail, one expandable register.**

## 2 · Why — the defect this removes

The shipped page answered *who should be nagged today*. My Work and Team Work
already own that question (`docs/orders/MASTER.md` — Action Owner Engine), and
because the page was built out of action cards it could not answer the one
question the logistics operator actually sits down with:

> Everything going out on Friday — who is carrying it, and is any of it missing
> a date, a partner or its goods?

An action-card wall cannot be scanned by day, cannot be filtered by partner and
by date at once, and cannot be read column by column. This is not a taste
correction; the old shape was structurally unable to hold the job.

## 3 · Removed completely

`Work list` tab · `Calendar` tab · KPI/count preamble · Refresh control ·
action-card wall · permanent detail pane · third working column · generic `Due`
· generic `Next Action` · generic `Priority` · every purchasing queue.

## 4 · The approved shape

```
┌─────────────────────────────────────────────────────────────────────┐
│ Delivery Work                                          🔔 ❓ ⚙ (50px)│
├──────────── 200px ───────────────┬──────────────────────────────────┤
│ DELIVERY DATE                    │ Search                Columns    │
│   No confirmed date        count ├──────────────────────────────────┤
│   Date passed              count │ ▸ SO-1322 · customer · dates …   │
│   Fri, 21 Aug              count │   └ Category · Unit ID · … goods  │
│ LOGISTICS                        │     Where · Who has it · Stock ETA│
│   All · NETS · AL · TEOW · TT …  ├──────────────────────────────────┤
│                                  │ filtered / total scopes          │
└──────────────────────────────────┴──────────────────────────────────┘
```

**Rail.** `DELIVERY DATE`: `No confirmed date` → `Date passed` → actual weekday
+ calendar dates, ascending. Never `Today`, never `Tomorrow`. `LOGISTICS`: `All`
→ NETS · AL · TEOW · TT · EU · SSY · HOUZS (always visible, count or no count) →
any other partner while it is carrying a scope → `No logistics picked` when
scopes have none. The two groups combine; counts are scopes/legs, never orders,
and each group counts over the rows the other has already narrowed.

**Listing.** The Sales Orders register engine, density and toolbar. One parent
row = one Delivery scope or one Journey leg. Columns, in order: `SO / Ref` ·
`Customer` · `Customer Delivery` · `Delivery Location` · `Building` ·
`Logistics Partner` · `Confirmed Delivery` · `Confirmed Time` · `Goods` ·
`DO No` · `Delivery Status`. `SO / Ref` is sticky. No Owner, no avatar, no
action sentence. No `New DO` / `Issue` / `Release` / `Approve`.

**▸.** The shared Goods mini-table, then read-only `Where` · `Who has it` ·
`Stock ETA`, then the Loan block only when a loan is out. No editable field,
no Partner selector, no Save.

## 5 · Files changed

| File | Change |
|---|---|
| `apps/web/src/pages/operation/delivery-work.ts` | **NEW.** The pure arithmetic: scope/leg rows, the one `Confirmed Delivery` rule, both rails, the filters and every visible word |
| `apps/web/src/pages/operation/delivery-work.test.ts` | **NEW.** 17 tests over that arithmetic |
| `apps/web/src/pages/operation/OperationDelivery.tsx` | rewritten — the three-pane page deleted, the rail + register built |
| `apps/web/src/pages/operation/OperationDelivery.test.tsx` | rewritten — holds the removal, the shape, the column order, ▸'s one job and the no-write boundary |
| `apps/web/src/components/register/DataGrid.tsx` | the expand chevron now announces `aria-expanded` — an ENGINE fix, so every register gains it |
| `apps/api/src/routes/operation/orders.ts` | list select gains `delivery_stops`; `/:id/expansion` gains `place` (Where / Who has it) |
| `apps/api/src/routes/operation/order-control.ts` | the loan read joins `unit_code` — a loan block may not print a database key |
| `packages/shared/src/schemas/sofa-loan.ts` | `item_unit_code` on the loan DTO |
| `apps/web/src/lib/queries.ts` | `delivery_stops` on the list row; `place` on the expansion response |
| `apps/web/src/pages/operation/OperationApp.tsx` | `?tab=delivery` added to the GlobalTopBar suppression list — found on the production walk |
| `apps/web/src/pages/operation/OperationApp.test.tsx` | holds that one header, and the rail's URL parameters surviving the mount |
| `docs/delivery/MASTER.md` §8 | the 2026-08-20 Delivery Work paragraph **overwritten** (Law 3) |

No migration. No RLS change. No other module's page, register or navigation.

## 6 · Deliberate deviations from the card, for owner review

1. **`No logistics picked` was added to the LOGISTICS rail** (last row, and only
   when the count is above zero). The card lists nine rail entries and this is
   not one of them. Measured on production 2026-08-21: **37 of 90 open orders
   carry no Logistics Partner at all.** Without this row those scopes are
   reachable only through `All`, and *who is carrying this?* is the workspace's
   first question. The word is the one already governed elsewhere in the portal.
   **Falsifier:** Jess says the rail must hold exactly the nine — then delete the
   row; nothing else moves.
2. **`Phone` and `Delivery address` ship in the chooser, off by default.** The
   card fixes the eleven DEFAULT columns and does not forbid hidden ones. A
   planner arranging a day phones the customer and tells a driver where to go.
   They cost nothing until switched on.
3. **`Delivery Status` reuses `No delivery order yet` rather than minting a
   status word.** Constitution §2 forbids a word `docs/COPY-STANDARD.md` has not
   approved, and until the system issues a document `which document` and `what
   state` are the same fact. If Jess wants a distinct status word for the
   pre-issuance state, that is one string and one line to change.
4. **`No time agreed` is a NEW absence**, written in the portal's established
   absence form (`No <the exact thing>` — `No delivery date`, `No delivery order
   yet`, `No price yet`). Recorded here rather than presented as pre-approved.

## 7 · Measured before building (production, 2026-08-21 — all TEST data)

```
90  open delivery scopes
 0  carry a multi-leg Delivery Journey  → every live row is a single scope today
 0  carry a formal delivery_partner_id
53  carry a triage Logistics Partner (ops_assigned_logistic) → the rail reads BOTH
 2  carry a confirmed date and time slot
 2  carry a Delivery Order
79  carry a Customer Delivery promise
31  carry a city · 30 carry a building type
 0  Units carry holder_party_id  → `Who has it` honestly reads `Not recorded`
```

The Journey-leg path therefore ships **unexercised by live data** and is held by
tests instead. That is stated rather than hidden: §6 of the Constitution says
every live row is test data, so a count of zero here is evidence about the code,
never about the business.

## 7.1 · Found on the production walk — FIXED

🔴 **Two headers on Delivery Work.** `?tab=delivery` was missing from the
`GlobalTopBar` suppression list in `OperationApp.tsx`, so the page's own 50px
Destination Header — which embeds `TopBarIcons` — sat beneath a slim bar
carrying a second `Jump to`, a second bell reading `59`, a second Help and a
second gear. `Delivery Orders` never showed it because it is a real route and
was suppressed already, which is why one Delivery page looked right and its
sibling did not. **This is the identical defect Manual Purchase shipped with in
August** (`OperationApp.test.tsx` — "one header on Manual Purchase"), and it is
now held by the same shape of test. It predates this card; the card's acceptance
line *"exactly one 50px Destination Header"* is what caught it.

## 8 · Found in passing — NOT fixed here

🔴 **The Stock Register is broken on `main`.**
`apps/api/src/routes/ops/stock.ts` selects `site_name` and `holder_name` from
`stock_unit_register_v`; **neither column exists** on that view or on
`stock_unit_availability_v` beneath it, and no migration in the repository or on
any branch defines them. PostgREST returns 42703, so the page cannot load. The
names live in `warehouses(name)` and `stock_operating_parties(name)` — the fix is
a view migration, which is Stock's to own and would collide with this PR's lane.
Handed over as its own task.

---

**CLOSURE.** Stamped when the merge SHA is live on every canonical surface. Not
before: a SHA proof expires the moment the tip moves.
