-- =============================================================================
-- 0163_ops_order_control_payments.sql
-- BACKFILL (2026-06-14): verbatim copy of the migration applied to staging=prod
-- on 2026-06-12 via Supabase MCP (recorded in schema_migrations as
-- "ops_order_control_payments", version 20260612083122). NOT re-applied.
-- Adds the payment/storage columns onto the 0159 ops_order_control base table.
-- =============================================================================

alter table public.ops_order_control
  add column if not exists balance numeric(12,2),
  add column if not exists storage_from date,
  add column if not exists storage_fee_override numeric(12,2);
