-- ============================================================================
-- cleanup-autocount-orders.sql  ·  START CLEAN: remove imported AutoCount TEST
-- orders from the portal.  (Jess 2026-07-21 — EXECUTED, 184 orders removed.)
--
-- SCOPE:  ONLY orders with source_system = 'autocount' + their dependent rows.
--   Real records still live in AutoCount, so after-sales via a Service Case is
--   unaffected.
--
-- 🔴 NEVER TOUCHED:  ops_stock_items (the real warehouse units — only their
--   RESERVATION is released, the unit is kept), product_skus / product_models
--   (the catalog), portal-native orders (source_system IS NULL), config.
--
-- RUN ORDER in the Supabase SQL editor:  PART 1 (look) → PART 2 (backup) →
--   PART 3 (delete).  Each PART is one Run.
-- ============================================================================


-- ============================================================================
-- PART 1 · DIAGNOSTICS  (SELECT-only — run first, review)
-- ============================================================================

-- 1a. EVERY table with a FK to orders + its ON DELETE rule + which orders
--     column it references. c=cascade(auto), n=set null, a/r=restrict(blocker).
--     Referenced column matters: orders.id is uuid, orders.so is int.
select
  con.conrelid::regclass  as child_table,
  att.attname             as child_column,
  ratt.attname            as references_orders_col,
  con.confdeltype         as on_delete
from pg_constraint con
join unnest(con.conkey)  with ordinality as k(attnum, ord)  on true
join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
join pg_attribute att  on att.attrelid  = con.conrelid  and att.attnum  = k.attnum
join pg_attribute ratt on ratt.attrelid = con.confrelid and ratt.attnum = fk.attnum
where con.contype = 'f' and con.confrelid = 'public.orders'::regclass
order by con.confdeltype, child_table;

-- 1b. Target scope (native orders MUST stay untouched).
select
  count(*) filter (where source_system = 'autocount') as autocount_orders,
  count(*) filter (where source_system is null)       as native_orders_total
from orders;

-- 1c. Stock reservations pointing at these orders — these UNITS are FREED, kept.
with tgt as (select so from orders where source_system = 'autocount')
select count(*) as reserved_units_to_free
from ops_stock_items s
join tgt t on s.reserved_ref = 'SO-' || t.so::text
where s.status = 'reserved';


-- ============================================================================
-- PART 2 · BACKUP  (reversible copies — run once)
-- ============================================================================
create schema if not exists _archive;
create table if not exists _archive.orders_autocount_20260721 as
  select * from orders where source_system = 'autocount';
create table if not exists _archive.order_lines_autocount_20260721 as
  select l.* from order_lines l join orders o on o.id = l.order_id
  where o.source_system = 'autocount';


-- ============================================================================
-- PART 3 · DELETE  (FK-aware, one block).  Loops every non-cascade FK to
--   orders from the catalog, picks the target array by the REFERENCED column
--   (uuid id vs int so — purchase_orders references orders.so, not id),
--   SET-NULLs nullable / DELETEs not-null children, then deletes the orders.
--   Cascade FKs (order_lines/addons/history/threads/annotations/control) go
--   automatically.  Only ever touches source_system='autocount' rows.
-- ============================================================================
do $$
declare
  r   record;
  ids uuid[];
  sos int[];
begin
  select array_agg(id), array_agg(so) into ids, sos
    from orders where source_system = 'autocount';

  -- release stock reservations (keep the physical unit)
  update ops_stock_items s
     set status = 'free', reserved_ref = null, reserve_reason = null, updated_at = now()
    from orders o
   where s.reserved_ref = 'SO-' || o.so::text
     and o.source_system = 'autocount' and s.status = 'reserved';

  for r in
    select con.conrelid::regclass::text as tbl,
           att.attname   as col,
           att.attnotnull as notnull,
           ratt.attname  as refcol
    from pg_constraint con
    join unnest(con.conkey)  with ordinality as k(attnum, ord)  on true
    join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
    join pg_attribute att  on att.attrelid  = con.conrelid  and att.attnum  = k.attnum
    join pg_attribute ratt on ratt.attrelid = con.confrelid and ratt.attnum = fk.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.orders'::regclass
      and con.confdeltype <> 'c'
  loop
    if r.refcol = 'id' then
      if r.notnull then execute format('delete from %s where %I = any($1)', r.tbl, r.col) using ids;
      else execute format('update %s set %I=null where %I = any($1)', r.tbl, r.col, r.col) using ids; end if;
    elsif r.refcol = 'so' then
      if r.notnull then execute format('delete from %s where %I = any($1)', r.tbl, r.col) using sos;
      else execute format('update %s set %I=null where %I = any($1)', r.tbl, r.col, r.col) using sos; end if;
    end if;
  end loop;

  delete from orders where source_system = 'autocount';
end $$;

-- Verify — must return 0.
select count(*) as autocount_orders_remaining
from orders where source_system = 'autocount';
