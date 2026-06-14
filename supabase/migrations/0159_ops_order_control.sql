-- =============================================================================
-- 0159_ops_order_control.sql — Operation "Order Control" panel base table
-- BACKFILL (2026-06-14): documents live staging=prod state that was applied via
-- a non-file-tracked path (NOT recorded in supabase_migrations.schema_migrations)
-- sometime around 2026-06-05..12. The repo had no file for it even though the
-- app code (apps/api + apps/web operation order-control panel) is on main and the
-- table is live. This file restores the migration chain so the repo can rebuild
-- the DB. NOT re-applied — the table already exists on staging=prod.
--
-- Reconstructed from live catalog (columns + PK/FK + RLS policies). The 3 payment
-- columns (balance / storage_from / storage_fee_override) are NOT here — they are
-- added by the later 0163_ops_order_control_payments.sql (kept separate to mirror
-- the real apply order).
-- =============================================================================

create table if not exists public.ops_order_control (
  order_id            uuid        primary key references orders(id) on delete cascade,
  stock_location      text[]      not null default '{}'::text[],
  stock_eta           date,
  customer_request    text,
  action_for_logistic text,
  carres_remark       text,
  warehouse_remark    text,
  payment_status      text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  delivery_time_slot  text
);

alter table public.ops_order_control enable row level security;

drop policy if exists ooc_read_internal on public.ops_order_control;
create policy ooc_read_internal on public.ops_order_control
  for select
  using ((select is_internal()));

drop policy if exists ooc_write_op_principal on public.ops_order_control;
create policy ooc_write_op_principal on public.ops_order_control
  for all
  using ((select auth.jwt()->'app_metadata'->>'role') = any(array['operation','principal']))
  with check ((select auth.jwt()->'app_metadata'->>'role') = any(array['operation','principal']));
