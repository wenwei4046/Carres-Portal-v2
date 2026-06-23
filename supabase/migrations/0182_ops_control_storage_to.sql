-- =============================================================================
-- 0182_ops_control_storage_to.sql (Loo approved in-conversation)
-- =============================================================================
-- Storage-fee END date for the order-drawer Payments panel (Jess 2026-06-22):
-- storage now accrues over a FROM→TO window instead of FROM→today.
--   storage_from (0165) — manual start (when goods went into storage).
--   storage_to   (this) — end of the storage window. NULL = still in storage
--                  (the UI falls back to the logistic ETA, else today). Editable,
--                  so operation can freeze the fee on the actual collection date.
-- Additive + nullable → zero-downtime.
-- =============================================================================
alter table public.ops_order_control
  add column if not exists storage_to date;
