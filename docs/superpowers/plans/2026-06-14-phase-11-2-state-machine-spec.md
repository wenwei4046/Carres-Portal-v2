# Phase 11.2 — State-machine collapse (single axis) — SPEC

> Worktree `phase/11.2-state-machine` (off 11.1). Isolates CODE only — the live DB
> is shared with another active session, so the enum migration is authored here
> but applied to prod ONLY in a coordinated window (don't crash the other session).

## The collapse

Today: TWO axes kept in sync by triggers.
- `orders.status` (`order_status`): place · proceed_order · delivered · cancelled
- `orders.operation_stage` (`operation_stage`, nullable): placed · proceed_request · awaiting_operation_action · ready_to_dispatch · dispatched · waiting · delivered
- `order_supplier_threads.operation_stage` (`operation_stage`): per-line; order stage = rollup of thread stages.

Target: ONE axis. New enum `order_state` on `orders.status`; **DROP `orders.operation_stage`**; threads keep a per-line stage column (`order_state`) that the rollup aggregates into `orders.status`.

## New enum `order_state` (ordered)

| value | meaning | replaces (status / operation_stage) |
|---|---|---|
| `draft` | dealer building, not handed to ops | status=place / stage=NULL |
| `confirmed` | dealer proceeded (≥50% paid), in ops queue | status=proceed_order + stage=proceed_request |
| `in_production` | ops accepted, buying/producing | stage=awaiting_operation_action |
| `ready_to_dispatch` | goods at WH, ready for customer leg | stage=ready_to_dispatch (+ waiting folds here) |
| `dispatched` | out for customer delivery | stage=dispatched |
| `delivered` | e-signed, done | status=delivered + stage=delivered |
| `on_hold` | paused (credit/customer) | (new) |
| `cancelled` | cancelled | status=cancelled |

Thread stages use only: `in_production` (initial), `ready_to_dispatch`, `dispatched`, `delivered`, `on_hold`. (draft/confirmed are order-level pre-thread.)

## Value mapping (for mechanical literal swaps in function bodies)

orders.status literals: `'place'`→`'draft'` · `'proceed_order'`→`'confirmed'` · `'delivered'`→`'delivered'` · `'cancelled'`→`'cancelled'`
operation_stage literals (when the fn was writing orders.operation_stage OR thread.operation_stage): `'placed'`→`'draft'` · `'proceed_request'`→`'confirmed'` · `'awaiting_operation_action'`→`'in_production'` · `'ready_to_dispatch'`→`'ready_to_dispatch'` · `'dispatched'`→`'dispatched'` · `'waiting'`→`'ready_to_dispatch'` · `'delivered'`→`'delivered'`

## Structural changes (NOT mechanical — per-function care)

1. **orders.operation_stage column DROPPED.** Every function that wrote `orders.operation_stage = X` now writes `orders.status = map(X)`. Functions that wrote BOTH `orders.status` and `orders.operation_stage` collapse to a single `orders.status` write.
2. **`orders_rollup_stage(uuid)`** now returns/writes `orders.status` (was operation_stage). Rollup rule unchanged in spirit: all threads delivered→delivered; all dispatched/delivered→dispatched; all ready/dispatched/delivered→ready_to_dispatch; no threads→(leave order-level draft/confirmed); else→in_production. MUST NOT clobber draft/confirmed/cancelled/on_hold order-level states when threads don't exist or order is terminal.
3. **`orders_auto_status_delivered` trigger + fn → DROPPED.** Redundant under single axis (rollup sets status='delivered' directly). Removing it is the whole point.
4. **`orders_auto_issue_on_dispatched`** keys on `NEW.status = 'dispatched'` (was operation_stage). Still auto-issues invoice + DO# on the dispatch transition.
5. **`proceed_order`** (the 50%-gate): `status` place→`'confirmed'` in one write (drops the separate operation_stage='proceed_request').
6. **`operation_confirm_proceed_request_v3`**: validates `status='confirmed'` (was status=proceed_order + stage=proceed_request); threads start `in_production`; buffer auto-skip → order+threads `ready_to_dispatch`.
7. **`_operation_auto_dispatch_if_ready`**, assign/reselect/dispatch, receive (`operation_receive_*`, `partner_pickup_threads`), deliver (`partner_attach_pod`, `operation_attach_do_and_deliver`), revert/abandon/bulk-complete, reads (`operation_dashboard_summary`, `finance_ar_aging`, `partner_threads_to_deliver`): swap column + value literals per mapping; gate `cancelled` only.

## Function blast radius (30, from live DB 2026-06-14)

_operation_auto_dispatch_if_ready, lp_reject_order, operation_abandon_order, operation_assign_partner, operation_attach_do_and_deliver, operation_confirm_proceed_request_v3, operation_dashboard_summary, operation_dispatch_customer_leg, operation_issue_pos_for_order, operation_partner_accept_rfd, operation_receive_po_line, operation_receive_po_with_do, operation_receive_threads, operation_resume_dispatch_from_waiting, operation_revert_order_dispatched_to_ready, operation_revert_order_proceed_to_placed, operation_warehouse_pick, ops_bulk_complete_orders, order_dispatch, order_partner_advance, order_proceed, orders_auto_issue_on_dispatched, orders_auto_status_delivered (DROP), orders_rollup_stage, orders_rollup_stage_trigger, partner_attach_pod, partner_confirm_receive, partner_pickup_threads, partner_threads_to_deliver, proceed_order.

Plus `create_order` (default) + `set_order_date`/`update_order` (only touch status indirectly).

## TS / UI sweep

- `packages/shared/src/schemas/orders.ts`: collapse `orderStatusSchema` + `operationStageSchema` into one `orderStateSchema`; `orderSchema.status` = new enum; drop `operationStage` field (or keep as deprecated alias mapped from status during transition — decide).
- `db-types.ts`: `OrderStatus`/`OperationStage` → `OrderState`; OrderRow.status; drop operation_stage.
- `adapters.ts`: orderFromRow status mapping; drop operationStage.
- UI: kanban columns + badges + filters across dealer/operation/partner/supplier/finance keyed on status/operationStage → new enum. (OperationOrders, DealerOrders/Dashboard, partner/supplier kanbans, badges.ts, finance.)

## Migration strategy (mirror 0121)

Migration 0167 (NOT applied here — coordinated prod window):
1. Snapshot all 30 fn defs into a TEMP table.
2. DROP triggers + dependent functions.
3. `CREATE TYPE order_state`; add new values; `ALTER TABLE orders ALTER status TYPE order_state USING map(...)`; `ALTER TABLE orders DROP COLUMN operation_stage`; `ALTER TABLE order_supplier_threads ALTER operation_stage TYPE order_state USING map(...)` (rename to `stage`?).
4. Recreate 30 fns from snapshot with column+value transforms; DROP orders_auto_status_delivered.
5. Backfill: existing orders.status remap (place→draft etc.); thread stages remap.
6. Sanity asserts.

⚠️ Apply requires: (a) other session clear, (b) api+web deploy in the SAME window (the deployed code must match the new enum — a mismatch breaks the live order flow). This is why 11.2 ships as one coordinated cut, not piecemeal.

## ⚠️ KEY FINDING (2026-06-14, from snapshotting spine fns)

The collapse is DEEPER than a value-remap. Today `orders.status` is a STABLE ANCHOR
during fulfilment — it sits at `proceed_order` the whole time while `operation_stage`
moves. Many of the 30 functions use `status='proceed_order'` to mean "this order is in
active fulfilment (not cancelled/delivered)". Examples found:
- `_operation_auto_dispatch_if_ready`: `IF v_order.status <> 'proceed_order' ... RETURN false`
- `orders_auto_status_delivered`: guarded on `status = 'proceed_order'` (this trigger gets DROPPED)
- rollup trigger writes operation_stage freely (separate column) — under single axis it must
  NOT clobber draft/confirmed (no-threads) or cancelled/on_hold (terminal/paused).

Under single axis, status MOVES (confirmed→in_production→ready_to_dispatch→dispatched→delivered),
so every "status='proceed_order'" anchor must be rewritten to a set-membership guard
(e.g. `status NOT IN ('cancelled','delivered','on_hold')` or `status IN ('in_production','ready_to_dispatch')`).
This is PER-FUNCTION SEMANTIC judgement, not mechanical. Higher risk than 0121; needs the
coordinated-prod-window runtime smoke to fully validate (branch only validates syntax/structure
because it's ~30 migrations behind prod due to the drift and can't be cheaply mirrored).

### New rollup design (single axis)
`orders_rollup_stage(uuid) RETURNS order_state`: returns NULL when no threads (→ trigger leaves
status untouched); else all-delivered→delivered / all dispatched|delivered→dispatched /
all ready|dispatched|delivered→ready_to_dispatch / else→in_production. Trigger writes
`orders.status = rollup` only when rollup IS NOT NULL **and** `status NOT IN ('cancelled','on_hold')`.
DROP `orders_auto_status_delivered` (rollup now sets delivered directly).

## Status

- 2026-06-14: spec + KEY FINDING written. Branch `kilsjjaaenbobiiuqkfh` MIGRATIONS_FAILED (drift)
  but DB ACTIVE_HEALTHY → usable for syntax/structure validation.

## DECISION: MIDDLE PATH (Loo "go with your recommended", 2026-06-14)

Keep `orders.status` as the stable business anchor (UNTOUCHED → all guard semantics safe).
Only clean `operation_stage` values 7→6 (mechanical, 0121-pattern):
`placed`+`proceed_request`→`confirmed` · `awaiting_operation_action`→`in_production` ·
`waiting` KEPT (relocated-WH edge) · `ready_to_dispatch`/`dispatched`/`delivered` unchanged.

### DB migration 0167 — AUTHORED + VALIDATED ✅
`supabase/migrations/0167_clean_operation_stage_values.sql` — self-adaptive in-SQL
snapshot→drop triggers→drop fns (plain, no CASCADE — plpgsql calls are late-bound)→swap enum
type→migrate columns (USING value map)→recreate fns (replace 3 quoted literals)→recreate
triggers→PASS G sanity. **Applied to branch `kilsjjaaenbobiiuqkfh` SUCCESS**: enum =
`confirmed,in_production,ready_to_dispatch,waiting,dispatched,delivered`; old type dropped;
28 fns recreated (none lost); 0 fns reference retired values; 3 triggers back.

### REMAINING (atomic TS sweep + coordinated cut)
1. **TS sweep (ATOMIC — 7→6 breaks typecheck chain-wide)**: db-types OperationStage, domain,
   schemas/orders `operationStageSchema`, schemas/operation stage filter, sops.ts
   `OperationStageV3` + SOP stage arrays, queries.ts union types, + UI/tests value literals.
   ⚠️ SUBTLETY: OperationOrders kanban has a SYNTHETIC `placed` column derived from
   `status='place'` (draft orders), NOT from operation_stage. Don't blind-merge it — the draft
   bucket stays status-derived; only the operation_stage `proceed_request`/`awaiting_operation_action`
   columns rename to `confirmed`/`in_production`. Needs per-file judgement (OperationOrders.tsx
   stageOf + column defs, OperationDashboard StageCards, BDDealerDetail, badges.ts, dashboard.ts).
2. **Coordinated prod window**: apply 0167 to prod + deploy api+web atomically (other session
   paused) + runtime lifecycle smoke (the value MAPPING on real data — branch couldn't, no data/drift).
3. Delete test branch `kilsjjaaenbobiiuqkfh` ($0.013/hr).
