# DELIVERY — CARD 02 · FIX DELIVERY WORK LAYOUT

**Module:** Delivery · **Sequence:** 02
**Owner ruling:** Jess, 2026-08-21 · **CORRECTED by Jess, 2026-08-24**
**Status:** CARD 02 executed (PR #887 `d1fc2d2a` + #888 `875c008d`).
**CARD 02-A — the correction — IN PROGRESS.**

---

## 0 · THE 2026-08-24 CORRECTION — what the first build got wrong

The owner checked production and `origin/main` and found the layout right and the
**behaviour wrong**. This section OVERWRITES anything below it that disagrees;
the superseded text is kept only where it still describes what shipped, and every
superseded ruling is struck rather than left standing beside its replacement.

| 🔴 | What was wrong | The correction |
|---|---|---|
| 1 | `onRowDoubleClick={openOrder}` → double-click opened the **Sales Order**, throwing a logistics operator into a commercial document mid-plan | Double-click opens **Edit Delivery** |
| 2 | No selection, no bulk act — the workspace could plan nothing | ☐ column, in-place selection toolbar, `Assign logistics` + `Edit Delivery` |
| 3 | The claim *"Delivery Work writes nothing"* | **Delivery Work owns the Delivery arrangement.** Sales keeps the commercial promise |
| 4 | Carrier lived on `orders.delivery_partner_id` — a Sales column, one carrier for a two-leg Journey, no history, two writers | `ops_delivery_arrangements` keyed `(order_id, leg)`, migration **0379** |
| 5 | The disclosure was a 12px **red** triangle — danger ink spent on "there is more here" | Neutral grey chevron, 32px gutter, `Show delivery items`, correct `aria-expanded` |
| 6 | `Delivery Status` printed the DOCUMENT's `Created` | Seven **operational** rungs; `Created` stays in the Register |
| 7 | Rail said `Date passed`; only days already holding work appeared | **`Overdue`**; the near-term operating window shows even at zero |
| 8 | Every incomplete Sales Order was dumped in — **59 of 90 rows had no location at all** | The **entry rule**: location + building facts + goods, else it stays Sales work |
| 9 | Column order put the dates before the place facts | The owner's corrected order, date and time separate |

### 0.1 · The interaction contract (LAW)

```
Click SO No          →  open the Sales Order
Click DO No          →  open the Delivery Order
Click ▸              →  expand and inspect this scope's goods — READ-ONLY
Double-click a row   →  open Edit Delivery          (NEVER the Sales Order)
Select one row       →  Assign logistics + Edit Delivery
Select many rows     →  Assign logistics only
```

### 0.2 · What the correction deliberately did NOT change

§3's ruling stands: **the SYSTEM issues the Delivery Order.** There is no `Issue`,
no `Release`, no `Approve` and no `New DO` on the workspace, in the Assign dialog
or on Edit Delivery. `Save Delivery` records an arrangement; issuance reads it.

### 0.3 · One judgment call, stated rather than hidden

The owner's toolbar sketch lists `Clear`, `Assign logistics` and `Edit Delivery`.
`Export Excel (N)` is the register ENGINE's own selection output and was KEPT: it
is read-only, it is on every other register's selection bar, and removing it would
make Delivery Work the one place an operator cannot export what they just picked.
🟡 **Say so and it goes** — it is one prop (`hideSelectionExport`).

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
| `apps/web/src/pages/operation/components/GoodsMiniTable.tsx` | `goodsCategoryOf` extracted — the box now owns the `Category` string, so two pages cannot answer it differently |
| `apps/web/src/pages/operation/SalesOrdersRegister.tsx` | its local `categoryOf` deleted in favour of the shared one |
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

🔴 **`Category` read `Other goods` on all 90 rows.** Delivery Work carried its
own copy of the mini-table's category logic and stopped one step short of
`lineClass` — the only one of the three sources that can read an AutoCount SKU
like `H1401F-K`. So this page printed `Other goods` while the Sales Orders
register, reading the identical line, printed `Mattress`. The box is written
once precisely so two mini-tables cannot almost agree; the STRING in its first
column had exactly the same problem. `goodsCategoryOf` now lives in
`GoodsMiniTable.tsx`, both pages call it, and five tests pin the three sources
in falling order of authority.

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

**CLOSURE — production-verified 2026-08-21 on `875c008d`.**

Walked authenticated at `erp.carresofficial.com/operation?tab=delivery` as
`operation@carres.com`, at 1280 · 1440 · 1920. Recorded as what was ASSERTED,
not as a screenshot claim:

```
Destination Header        computed height 50px · ONE Jump to · ONE bell
Local rail                computed width 200px
Columns                   the eleven, in the approved order, no Owner column
Rail counts               No confirmed date 88 · Date passed 2
                          All 90 · NETS 46 · AL 7 · TEOW/TT/EU/SSY/HOUZS 0
                          No logistics picked 37      (= the pre-build SQL)
Footer                    "90 delivery scopes"
Filters combine           AL → 7 rows, all AL, footer "7 of 90",
                          DATE rail recounted to 7 / 0, URL ?logistics=AL
Sticky identity           SO / Ref held left:473 through a 1067px scroll;
                          last column reachable, body never overflows
Expansion                 2 open → 2 aligned mini-tables, 6 correct headers,
                          each scoped to its own order
aria-expanded             false → true
No second form            0 inputs, selects or buttons inside a disclosure
Category                  H1401F-K reads `Mattress`  (read `Other goods` on
                          d1fc2d2a — see §7.1)
Documents                 DO-170826-5050 `Created` ·
                          DO-180826-3035 `Out for delivery`
                          — agrees with the Delivery Orders register
```

A SHA proof expires when the tip moves: this one is against `875c008d`, and the
tip was `875c008d` when it was taken.
