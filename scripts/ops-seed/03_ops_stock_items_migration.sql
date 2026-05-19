-- 0XX_ops_stock_items.sql  Per-item ops stock register (Jess 2026-05-19)
-- wenwei's stock_balances is aggregate-only; ops needs per-unit condition +
-- reserved status. This is the ops source-of-truth; a rollup keeps
-- stock_balances (wenwei's dispatch math) in sync.
create table if not exists ops_stock_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null,
  warehouse_id  uuid not null references warehouses(id),
  condition     text not null default 'new'  check (condition in ('new','exhibition','old','damaged')),
  status        text not null default 'free' check (status in ('free','reserved','sold','transferred')),
  reserved_ref  text,
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
alter table ops_stock_items enable row level security;
create policy ops_stock_items_read_internal  on ops_stock_items for select using ((select is_internal()));
create policy ops_stock_items_write_internal on ops_stock_items for all using ((select is_internal())) with check ((select is_internal()));

-- Rollup helper: rebuild wenwei's stock_balances for Carres Klang from
-- ops_stock_items (physically-present = free+reserved).
create or replace function ops_rollup_stock_balances(p_wh uuid) returns void
language sql security definer as $$
  insert into stock_balances (sku, warehouse_id, qty)
  select sku, warehouse_id, count(*)::int
  from ops_stock_items
  where warehouse_id = p_wh and status in ('free','reserved')
  group by sku, warehouse_id
  on conflict (sku, warehouse_id) do update set qty = excluded.qty, updated_at = now();
$$;
