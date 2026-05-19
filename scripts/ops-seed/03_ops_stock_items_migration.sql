-- 03_ops_stock_items_migration.sql  Per-item ops stock register (Jess 2026-05-19)
-- COMBINED model: per-unit condition + status + reserved_ref + ref_history
-- (old ref preserved & searchable — warehouse label reconciliation) +
-- needs_repair (Exhibition/Old → Repair queue, out of Ready Stock).
-- wenwei's stock_balances stays aggregate; a rollup keeps it in sync.

create table if not exists ops_stock_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null,
  warehouse_id  uuid not null references warehouses(id),
  condition     text not null default 'new'  check (condition in ('new','exhibition','old','damaged')),
  status        text not null default 'free' check (status in ('free','reserved','sold','transferred')),
  reserved_ref  text,                        -- current customer ref (newest)
  ref_history   text[] not null default '{}',-- every PREVIOUS ref, kept forever
  needs_repair  boolean not null default false, -- true → Repair queue, excluded from Ready
  supplier      text,
  po_no         text,
  source_ref    text,
  date_in       date default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ops_stock_items_sku_idx       on ops_stock_items(sku);
create index if not exists ops_stock_items_wh_idx        on ops_stock_items(warehouse_id);
create index if not exists ops_stock_items_status_idx    on ops_stock_items(status);
create index if not exists ops_stock_items_condition_idx on ops_stock_items(condition);
create index if not exists ops_stock_items_repair_idx    on ops_stock_items(needs_repair);
-- GIN index so "search by old ref still finds it" stays fast.
create index if not exists ops_stock_items_refhist_idx   on ops_stock_items using gin (ref_history);

alter table ops_stock_items enable row level security;
create policy ops_stock_items_read_internal  on ops_stock_items for select using ((select is_internal()));
create policy ops_stock_items_write_internal on ops_stock_items for all using ((select is_internal())) with check ((select is_internal()));

-- Rollup: rebuild wenwei's stock_balances for a warehouse from physically-
-- present units (free + reserved; sold/transferred have left the building).
create or replace function ops_rollup_stock_balances(p_wh uuid) returns void
language sql security definer as $$
  insert into stock_balances (sku, warehouse_id, qty)
  select sku, warehouse_id, count(*)::int
  from ops_stock_items
  where warehouse_id = p_wh and status in ('free','reserved')
  group by sku, warehouse_id
  on conflict (sku, warehouse_id) do update set qty = excluded.qty, updated_at = now();

  update stock_balances sb set qty = 0, updated_at = now()
  where sb.warehouse_id = p_wh
    and not exists (
      select 1 from ops_stock_items i
      where i.warehouse_id = p_wh and i.sku = sb.sku and i.status in ('free','reserved')
    );
$$;
