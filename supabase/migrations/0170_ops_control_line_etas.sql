-- =============================================================================
-- 0170_ops_control_line_etas.sql (Loo approved in-conversation)
-- =============================================================================
-- Per-line stock ETA for the order drawer (Jess 2026-06-22): products on one
-- order don't all arrive on the same date, so each item carries its OWN ETA
-- instead of a single order-level "Stock ETA".
--   line_etas  — jsonb { "<sku>": "yyyy-mm-dd" }, keyed by line SKU (mirrors
--                line_locations from 0168; duplicate-SKU lines share an ETA).
-- Replaces the order-level ops_order_control.stock_eta in the UI (the column
-- stays for back-compat but is no longer edited). Additive + nullable → zero-
-- downtime.
-- =============================================================================
alter table public.ops_order_control
  add column if not exists line_etas jsonb;
