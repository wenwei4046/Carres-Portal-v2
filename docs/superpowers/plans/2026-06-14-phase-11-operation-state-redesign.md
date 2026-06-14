# Phase 11 — Operation state redesign + sales-entered Proceed Date

> Started 2026-06-14. Branch `phase/11-operation-state-redesign`.
> Reference model: **2990's Portal** (`C:\Users\User\2990s`) — sister POS project, same stack.
> Authorised by Loo in-conversation 2026-06-14 ("go whole things") — covers enum/schema/migration/RLS red lines (§14).

## Goal (two asks, locked with Loo)

1. **Delete the current `operation_stage` state machine and redo it**, modeled on 2990s' live SO-status machine — single clean axis, gate only the dangerous transition (cancel). **Decision: collapse the two axes (`status` × `operation_stage`) into ONE.** Keep the threads / PO / supplier two-leg plumbing (scope = "只重做状态机", NOT flatten threads).
2. **Add a salesperson-entered Proceed Date** (planned production-start date) alongside the existing Delivery Date. Both keyed in at order creation. Modeled on 2990s `internal_expected_dd` ("Process date / factory start"). **NOT** the system-stamped `proceeded_at` — sales-entered only, no auto-stamp.

## Reference findings (2990s)

- 2990s live order = `mfg_sales_orders`. Status: CONFIRMED → IN_PRODUCTION → READY_TO_SHIP → SHIPPED → DELIVERED → INVOICED → CLOSED (+ ON_HOLD, CANCELLED). Single axis. Only CANCELLED is gated (block if downstream docs).
- Per-line sub-state = `mfg_sales_order_items.stock_status` (PENDING→READY) with auto-rollup of header to READY_TO_SHIP. (Carres keeps its threads; same idea.)
- Dual dates entered by salesperson at POS handover (`TargetDateStep.tsx`): `customer_delivery_date` + `internal_expected_dd`. Rules: both-or-neither, process ≤ delivery, no past, delivery floored by lead time. `proceeded_at` is a SEPARATE system stamp — do not conflate.

## New Carres state machine (single `operation status`)

Collapse `orders.status` (place/proceed_order/delivered/cancelled) + `orders.operation_stage` (7 vals) into ONE order status enum. Threads carry the same enum; order = rollup (slowest line).

| New status | 2990s analog | Replaces |
|---|---|---|
| `draft` | (cart) | status=place / stage=NULL |
| `confirmed` | CONFIRMED | proceed_order + proceed_request |
| `in_production` | IN_PRODUCTION | awaiting_operation_action |
| `ready_to_dispatch` | READY_TO_SHIP | ready_to_dispatch + waiting |
| `dispatched` | SHIPPED | dispatched |
| `delivered` | DELIVERED | status=delivered + stage=delivered |
| `on_hold` | ON_HOLD | (new, optional) |
| `cancelled` | CANCELLED | status=cancelled |

Gate only `cancelled` (block if downstream PO/invoice). Keep the existing 50%-paid gate on draft→confirmed (the "proceed" action). Allow backward reverts like 2990s.

**Blast radius (live DB, measured 2026-06-14):** 30 functions reference `operation_stage`, 29 reference `order_supplier_threads`, 3 sync triggers (`orders_rollup_stage`, `orders_auto_status_delivered`, `orders_auto_issue_on_dispatched`). **0 RLS policies filter on stage value** → RLS untouched. Mirror the 0121 rename playbook (snapshot → migrate enum → recreate functions → code sweep → test).

Functions touching operation_stage: _operation_auto_dispatch_if_ready, lp_reject_order, operation_abandon_order, operation_assign_partner, operation_attach_do_and_deliver, operation_confirm_proceed_request_v3, operation_dashboard_summary, operation_dispatch_customer_leg, operation_issue_pos_for_order, operation_partner_accept_rfd, operation_receive_po_line, operation_receive_po_with_do, operation_receive_threads, operation_resume_dispatch_from_waiting, operation_revert_order_dispatched_to_ready, operation_revert_order_proceed_to_placed, operation_warehouse_pick, ops_bulk_complete_orders, order_dispatch, order_partner_advance, order_proceed, orders_auto_issue_on_dispatched, orders_auto_status_delivered, orders_rollup_stage, orders_rollup_stage_trigger, partner_attach_pod, partner_confirm_receive, partner_pickup_threads, partner_threads_to_deliver, proceed_order.

## Proceed Date spec (11.1)

- New column `orders.proceed_date date null` (mirrors `delivery_date`). Reuse `delivery_date_tbd` as the single TBD toggle for the pair (2990s "For further notice").
- Lives in the `delivery` object across domain/schemas/draft as `proceedDate`.
- Validation (zod superRefine + draft step gate + server): when !dateTbd → both `date` and `proceedDate` required; `proceedDate ≤ date`; neither in the past (delivery already lead-time gated; proceed floored at today).
- UI: second date picker in `Step3Delivery.tsx` ("Proceed date · production start", min today, max delivery). ASAP pill sets proceedDate = today.
- Paths to touch: migration 0155, db-types `OrderRow`, domain/schema `delivery`, adapters (read + create payload), `create_order` RPC, `set_order_date` RPC + schema (confirm-later pairs both), `update_order` RPC + schema (edit), Step3Delivery + draft + DealerNewOrder, order detail display, tests.
- **No auto-stamp.** Proceed date is a planned date only; it does NOT drive the proceed action (that stays manual + 50% gate).

## Sequencing

- **11.1 Proceed Date** (additive, low-risk) — ship first. Migration 0155.
- **11.2 State machine rewrite** — new enum, rewrite 30 fns + 3 triggers (migrations 0156+), UI kanban relabel sweep, shared `operationStageSchema`/`orderStatusSchema` collapse, adapters, db-types, tests. Mirror 0121.
- **11.3 Verify + deploy** — full test suite (api/web/shared), smoke, CF deploy (web .env.production, api wrangler).

## Migration discipline

New files 0155+, never edit frozen ones. Enum change = create new type + swap column type + drop old (0121 pattern); ~0 live orders so data migration is trivial. Snapshot function defs into a TEMP table before DROP/CREATE.

## Status log

- 2026-06-14: branch created, plan written.
- 2026-06-14: **migration backfill** — discovered repo↔DB drift; 0155-0158 (local) were applied to prod but unrecorded in schema_migrations; 5 ops_* migrations (notes/tasks, team members, order-control payments, bulk-complete) were applied to prod (6/12) + code merged to main but had NO repo files. Backfilled them as 0159-0164 (file-only, not re-applied). Commit `c42f2eb`.
- 2026-06-14: **11.1 Proceed Date DONE** — migration 0165 applied to prod; shared+api+web wired; tests green (shared 186/186, api 708 pass /3 pre-existing fail, web 476 pass /5 pre-existing fail); live guard smoke confirmed (proceed>delivery → 22023 proceed_after_delivery). Commit `18360a8`.
  - ⚠️ **PROD CONSISTENCY**: 0165 DROPped set_order_date(uuid,date) 2-arg; deployed (old) API still calls 2-arg → confirm-date flow 404s on prod until api redeploy. MUST deploy api+web (or add a temp 2-arg shim) before 11.2 drags on.
- NEXT: 11.2 state-machine collapse (single axis, 30 fns + 3 triggers, UI sweep).
