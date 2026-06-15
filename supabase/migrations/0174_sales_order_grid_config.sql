-- 0174_sales_order_grid_config.sql
-- ===========================================================================
-- Sales Order Maintenance (2026-06-16) — shared, persisted column config for
-- the AutoCount-style SO grid.
--
-- Single-row table: one shared config for all internal users ("link for all
-- amendment"). Stores per-column overrides (visible/order/width/label) +
-- curated option lists. The column *universe* lives in code
-- (packages/shared SO_GRID_COLUMNS); this table only layers overrides.
--
-- Safety: additive only. Touches no existing table, no orders data, no frozen
-- migration. Follows the 0083_user_nav_seen RLS pattern + CLAUDE.md §8 rules
-- (Fix 1: read JWT-backed app_role(); Fix 2: ( select … ) InitPlan wrap;
-- Fix 3: STABLE helpers).
-- ===========================================================================

BEGIN;

-- 1. Singleton config table. `id boolean PK default true CHECK (id)` allows at
--    most one row (true), so the config is genuinely global/shared.
create table if not exists public.sales_order_grid_config (
  id         boolean primary key default true check (id),
  columns    jsonb not null default '[]'::jsonb,
  options    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Seed the singleton (empty overrides → the app merges with catalog defaults).
insert into public.sales_order_grid_config (id, columns, options)
values (true, '[]'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- 2. RLS — internal roles (operation / principal) may read the shared config.
alter table public.sales_order_grid_config enable row level security;

drop policy if exists sales_order_grid_config_internal_read on public.sales_order_grid_config;
create policy sales_order_grid_config_internal_read on public.sales_order_grid_config
  for select
  to authenticated
  using ( ( select public.app_role() )::text in ('operation', 'principal') );

-- 3. No direct writes — all mutation goes through the SECURITY DEFINER RPC so
--    the role gate + updated_by stamp can't be bypassed by a crafted PostgREST
--    upsert.
revoke insert, update, delete on public.sales_order_grid_config from authenticated;

-- 4. Write RPC. Volatile (writes) so NOT marked stable; runs as definer with a
--    pinned search_path. Role-checks inside, stamps updated_by, returns the
--    fresh row so the API can echo it back without a second read.
create or replace function public.set_sales_order_grid_config(
  p_columns jsonb,
  p_options jsonb
)
returns public.sales_order_grid_config
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.sales_order_grid_config;
begin
  if ( select public.app_role() )::text not in ('operation', 'principal') then
    raise exception 'forbidden: operation or principal only'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_columns) is distinct from 'array' then
    raise exception 'columns must be a json array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) is distinct from 'object' then
    raise exception 'options must be a json object' using errcode = '22023';
  end if;

  insert into public.sales_order_grid_config (id, columns, options, updated_at, updated_by)
  values (true, p_columns, p_options, now(), ( select auth.uid() ))
  on conflict (id) do update
    set columns    = excluded.columns,
        options    = excluded.options,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_sales_order_grid_config(jsonb, jsonb) from public;
grant execute on function public.set_sales_order_grid_config(jsonb, jsonb) to authenticated;

COMMIT;
