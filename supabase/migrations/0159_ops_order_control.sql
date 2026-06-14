-- 0159_ops_order_control.sql
-- P1 of the Orders control-grid build (memory: project-orders-control-spec, Jess 2026-06-09).
--
-- Additive 1:1 overlay on `orders`. Holds the operational "Master Sheet, live" control
-- fields edited in the order drawer (docs/operation-portal-redesign.md §1). Core `orders`
-- is intentionally NOT touched:
--   * delivery_date + ops_assigned_logistic / delivery_partner_id already live on `orders`
--     -> the drawer edits those directly.
--   * the Before-7-Days flag is COMPUTED from delivery_date, never stored.
--
-- One row per order, created lazily on first edit (no backfill — absent row == all-default).

create table public.ops_order_control (
  order_id            uuid primary key references public.orders(id) on delete cascade,
  -- stock readiness location(s); multi-value per Q2=A: 'Carres Klang' / 'Balakong' / 'at-supplier' ...
  stock_location      text[]      not null default '{}',
  stock_eta           date,
  -- four operator remark fields from the drawer mockup
  customer_request    text,
  action_for_logistic text,
  carres_remark       text,
  warehouse_remark    text,
  -- payment follow-up state shown in the drawer (free text: 'Follow Up' / 'Paid' / 'Partial' ...)
  payment_status      text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid        -- app_user id; no FK (matches repo actor-column convention)
);

comment on table public.ops_order_control is
  'P1 Orders control-grid overlay (1:1 with orders). Operational fields edited in the order drawer; does not duplicate delivery_date / logistic which live on orders. Row created on first edit.';

-- auto-bump updated_at on every UPDATE (reuse the repo-standard trigger fn)
create trigger ops_order_control_set_updated_at
  before update on public.ops_order_control
  for each row execute function public.set_updated_at();

-- RLS (§8: InitPlan-wrapped, JWT-claim based, STABLE helper).
-- Read: any internal HQ role (operation/principal/finance/bd) — mirrors ops_stock_items.
-- Write: operation + principal only — mirrors service_notes write gate.
alter table public.ops_order_control enable row level security;

create policy ooc_read_internal on public.ops_order_control
  for select
  using ( (select public.is_internal()) );

create policy ooc_write_op_principal on public.ops_order_control
  for all
  using      ( (select (auth.jwt() -> 'app_metadata' ->> 'role')) = any (array['operation','principal']) )
  with check ( (select (auth.jwt() -> 'app_metadata' ->> 'role')) = any (array['operation','principal']) );
