# DELIVERY — CARD 21 · Retire the legacy warehouse pick application doors

BUILD/DELIVERY continuation · 2026-09-13.

Authority: the owner’s Delivery convergence request; Delivery MASTER Card 14 outstanding warehouse-pick defect; Stock MASTER exact Unit ownership; Orders MASTER SO Batch Purchase Ready Stock. Cards 19 and 20 are already owned by the parallel Delivery workspaces and are not duplicated here.

The legacy `warehouse` and `transfer-ready` API routes call `operation_warehouse_pick`, which can call `_operation_reserve_order` and attempts to write derived stock totals. Close both application doors with 410 and remove the drawer’s Transfer to ready act. Reservation remains with the governed Ready Stock journey and its exact Unit selection. No Unit, warehouse, order stage or stock total is changed by this retirement.

- [x] API refusal tests including permission and no database calls
- [x] Remove the obsolete drawer act
- [x] Green CI, merge, exact-SHA deploy and authenticated refusal proof
- [ ] Database RPC retirement: separate reviewed SQL; not complete until tracker/all-branch maximum, rolled-back positive/negative probes and production application are verified

Migration: no database change in the application retirement PR. The existing RPC remains a separate outstanding database boundary; do not claim it is retired by HTTP refusal alone.


## Part B · Database retirement — migration 0501 (the outstanding boundary above)

> Authored in the Delivery final-convergence chat on the same day, on top of Part A. Part A closed
> the application doors (410, the drawer act); Part B retires the WRITERS in the database and keeps
> them from returning. Migration numbered **0501** from the MAX of the tracker, the repository and
> every branch at the moment of writing (`0499` Payment on `main`, `0500` on
> `fix/role-gates-refuse-no-role`).

**Goal:** No writer may store a second stock quantity truth. The legacy warehouse-pick door and
its helper still write `stock_balances.reserved` by hand; they are retired through the governed
migration path, their API routes and UI door removed, and a negative regression keeps a
hand-written stock total from returning.

**Measured (2026-09-13, production `36c98830`, `pg_proc` read live):**
- `operation_warehouse_pick(p_order_id uuid, p_warehouse_id uuid)` (0129) — granted to
  `authenticated`, `anon` and `PUBLIC`, gated only by `is_operation()` inside. It rewrites
  `orders.warehouse_id`, cascades `order_supplier_threads.warehouse_id`, and when
  `operation_calc_shortages` finds nothing short it calls `_operation_reserve_order`, which
  runs `update stock_balances set reserved = reserved + qty` per line — the hand-written total
  0366's `stock_balances_derived_only` trigger refuses (`stock_total_is_derived`). The
  shortage branch still succeeds, rewriting `operation_stage` to `awaiting_operation_action`
  and writing History — a live legacy writer on a retired model.
- `_operation_reserve_order(p_order_id uuid)` (0125) — the hand-written total itself. Callers:
  `operation_warehouse_pick` and `operation_receive_po_line` only.
- `operation_receive_po_line(p_po_id text, p_sku text, p_received_qty integer)` — the Orders-side
  receive door D2 already removed from every surface (`docs/ERP-ARCHITECTURE.md` §0); no `apps/`
  caller; `service_role` grant only; it too calls `_operation_reserve_order`.
- Reachable doors: `POST /api/operation/orders/:id/warehouse` (`warehousePickInput`) and
  `POST /api/operation/orders/:id/transfer-ready` (`transferReadyInputSchema`), the latter
  behind the Old Orders drawer's `Transfer to ready` menu item (`OrderDetailDrawer.tsx:7054`,
  `TransferReadyDialog.tsx`). Neither is on any approved Card surface; Stock MASTER (0366,
  0471/0472) makes `ops_stock_pool_draw` / `so_batch_reserve_ready_units` the one reservation
  door and the Unit register the one availability authority.

**Authority:** `docs/ERP-ARCHITECTURE.md` Law A · Law D · §3.5 (*the register is the authority; a
rollup is not*) · §3.5.1 (*modules never copy quantities into parallel ledgers*) ·
`docs/delivery/MASTER.md` §1.1 (*no independent quantity truth*), §16 note (3) ·
`docs/stock/MASTER.md` (0366: a stock total is derived from the unit register, never written) ·
`CLAUDE.md` red line 6 (a new migration, never an edit).

**Dependencies:** none (Cards 19 and 20 are independent).

**Runtime readers and writers affected:** Writers retired: the three SQL functions above;
`POST /:id/warehouse`; `POST /:id/transfer-ready`; `useWarehousePickMutation`;
`useTransferReady`; `TransferReadyDialog`; the drawer's `Transfer to ready` item;
`warehousePickInput` / `transferReadyInputSchema`. Readers: none change.
`operation_pick_warehouse` and `operation_calc_shortages` (the read-only `recheck-stock`
door) stay.

**Migrations required:** one — `0501_the_warehouse_pick_writer_is_retired.sql` (numbered from
the MAX of the tracker, the repository and every branch at the moment of writing; `0498` is
Payment's on `main`, `0493` sits on `build/receiving-grn-redesign`). It DROPS the three
functions and asserts that `stock_balances_derived_only` (0366) is still armed. It writes no
row, changes no RLS policy and touches no data.

**Production acceptance surface:** After apply, `pg_proc` holds none of the three names; a
rolled-back probe proves a hand-written `stock_balances.reserved` is still refused
(`stock_total_is_derived`); `POST /api/operation/orders/{id}/warehouse` and `…/transfer-ready`
answer 404; the Old Orders drawer offers no `Transfer to ready`; the Unit register and every
Delivery/Outbound door are untouched.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Migration 0501: drop the three functions; assert the 0366 trigger is armed; rolled-back production probe with the negative control (a hand-written `reserved` still refused)
- [ ] API: remove `POST /:id/warehouse` and `POST /:id/transfer-ready`, their schemas and imports; route test proves both answer 404 and no route names `operation_warehouse_pick`
- [ ] Web: remove `useWarehousePickMutation`, `useTransferReady`, `TransferReadyDialog` and the drawer's `Transfer to ready` item and prop chain
- [ ] Negative regression: a test over `supabase/migrations/` that no migration after 0366 re-creates the three names or writes `stock_balances.qty` / `.reserved` outside the `carres.stock_rollup` guard; a source test that no `apps/` file names the retired RPC
- [ ] Typecheck ×3, design guard, `pnpm ci:migrations`
- [ ] PR → CI → merge → apply 0501 through the governed path → deploy → production verification (functions absent, trigger armed, routes 404) → Delivery MASTER §16 closure

## Supplemental convergence verification · 2026-09-14

- PR #1288 merged a38d77c8e0bbf6dafcbb2222b3fcf62ece09e7c5 after full CI (shared 3,297 + API 3,229 + web 4,620 = 11,146 tests), all other required checks green. It returns HTTP 410 warehouse_pick_retired from both obsolete application doors before a DB call, and removes Transfer to ready from the drawer.
- Card 19 PR #1291 merged 334c3720a4d7396f7f53048834559207db5acfd1 after green CI; Card 21 database PR #1292 merged a5646d2d961dab852f44c2cd8dcfc19a5e0483a1 after green CI.
- At 00:30 MYT, authenticated production SQL read found no public functions named operation_warehouse_pick, _operation_reserve_order or operation_receive_po_line; stock_balances_derived_only has tgenabled O. Tracker records 0501_the_warehouse_pick_writer_is_retired at version 20260913162841. The existing database workstream applied this migration; this acceptance work adds no competing SQL.
- Post-0501 negative control at 00:34 MYT: with carres.stock_rollup=off and statement/lock timeouts, an attempted reserved+1 for JAGER-SS / warehouse 00000000-0000-0000-0000-000000000c03 raised P0001 detail stock_total_is_derived. The guarded probe would fail if no refusal or a different detail occurred. The transaction rolled back and re-read remained qty 4 / reserved 2.
- Existing Journey Unit id-dtd627907 is UUID b384b3bf-70df-4956-a174-c4eae677c989, JAGER-SS, sold, same warehouse c03, reserved_ref SO-1362, sold_order_id db9c939a-ebb7-4836-a2b8-866770728822. Its page retains NETS→AL handover and reserved→sold history.
- Before deployment, Operation SO-1340 Monitor smoke showed all four governed sections; draft date change cancelled back to unconfirmed; logistics edit cancelled. No order, date or logistics facts saved.

Exact-SHA application convergence and final authenticated UI/API observations remain pending.

At 00:36 MYT all five surfaces converged exactly to 9dd3945b8d451e142d223752bbe91f243357bd0e (deploy run 34767793794 success). Authenticated Operation API calls to both obsolete endpoints returned HTTP 410 warehouse_pick_retired. SO-1362 allocation JSON and order id/so/status/operation_stage/warehouse_id/delivered_at/do_number were identical before/after; order remains delivered. Intermediate DO-130926-0842 now shows Arrived in the header, Delivery history, Evidence and current attempt in History; source warehouse Carres Klang Warehouse; no customer proof attach/review actions. Borrowed sibling signed-file display remains visibly pending Card 22.

On 9dd3945b, final DO-130926-3223 remains Delivered and its Warehouse is JB transit warehouse. Register shows DO-0842 Arrived / JB transit warehouse and DO-3223 Delivered. Reports for Sep 2026: Delivery Commitment Performance and First Delivery Success each contain only DO-3223 (one customer delivery); Logistics Partner Performance contains AL 1 trip / 1 delivered / 0 failed and no NETS customer delivery. Warehouse Performance retains both leg handovers separately. Delivery Proof Control contains only final DO-3223. All ten report sections rendered.
