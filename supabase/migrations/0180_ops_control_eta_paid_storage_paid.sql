-- =============================================================================
-- 0180_ops_control_eta_paid_storage_paid.sql (Loo approved in-conversation)
-- =============================================================================
-- Three operator-keyed fields on the ops_order_control overlay for the order-
-- drawer "Master Sheet, live" redesign:
--   logistic_eta  — the logistic's committed delivery date, DISTINCT from
--                   orders.delivery_date (= the customer-requested deadline that
--                   drives the Orders list DEADLINE column).
--   paid_amount   — amount received, keyed by the operator (supports partial
--                   payment); the drawer computes Outstanding = Bill − paid.
--   storage_paid  — manual status for whether the storage fee has been settled.
-- All nullable + additive → zero-downtime. The PUT /:id/control upsert already
-- spreads validated input, so only the SELECT column lists + the zod schema
-- (packages/shared) need to learn the new columns.
-- =============================================================================
alter table public.ops_order_control
  add column if not exists logistic_eta date,
  add column if not exists paid_amount numeric(12, 2),
  add column if not exists storage_paid text;
