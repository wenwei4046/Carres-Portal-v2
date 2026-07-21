-- ============================================================================
-- cleanup-autocount-orders.sql  ·  START CLEAN: remove imported AutoCount TEST
-- orders from the portal.  (Jess 2026-07-21, for a clean team demo.)
--
-- SCOPE (what this touches):  ONLY orders with source_system = 'autocount'
--   + their dependent rows.  Real records still live in AutoCount itself, so
--   after-sales via a Service Case is unaffected.
--
-- 🔴 NEVER TOUCHED (do not add these):  ops_stock_items (the real warehouse
--   units — only their RESERVATION is released, the unit is kept), product_skus
--   / product_models (the catalog), portal-native orders (source_system IS
--   NULL), ops_notes / ops_tasks content, any config.
--
-- HOW TO RUN (in the Supabase SQL editor, in order):
--   1) Run PART 1 (diagnostics, SELECT-only) — review the numbers.
--   2) If PART 1 shows any RESTRICT-blocker (POs / payments / invoices /
--      refunds / service_notes) tied to autocount orders, STOP and send the
--      output back before deleting — those are not plain test data.
--   3) Run PART 2 (backup) — makes reversible copies.
--   4) Run PART 3 (the delete) — it is one transaction; read the final NOTICE,
--      then COMMIT (or ROLLBACK to abort). Nothing is permanent until COMMIT.
-- ============================================================================


-- ============================================================================
-- PART 1 · DIAGNOSTICS  (SELECT-only, safe — run first, review)
-- ============================================================================

-- 1a. Every table that has a FK to orders + its ON DELETE rule (so nothing is
--     missed regardless of migration coverage). c=cascade, n=set null,
--     a/r = no action / restrict = a BLOCKER.
select
  con.conrelid::regclass  as child_table,
  att.attname             as child_column,
  con.confdeltype         as on_delete  -- 'c'=cascade 'n'=set null 'a'=no-action 'r'=restrict 'd'=default
from pg_constraint con
join unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
where con.contype = 'f'
  and con.confrelid = 'public.orders'::regclass
order by con.confdeltype, child_table;

-- 1b. Target scope: how many autocount orders vs native (native MUST stay 0 in scope).
select
  count(*) filter (where source_system = 'autocount')            as autocount_orders,
  count(*) filter (where source_system is null)                  as native_orders_total,
  count(*) filter (where source_system is not null
                     and source_system <> 'autocount')           as other_source_orders
from orders;

-- 1c. RESTRICT blockers tied to the autocount orders (if any of these > 0, STOP).
with tgt as (select id, so from orders where source_system = 'autocount')
select
  (select count(*) from purchase_orders p join tgt t on p.so = t.so)      as pos_linked,
  (select count(*) from payments  x join tgt t on x.order_id = t.id)      as payments_linked,
  (select count(*) from invoices  x join tgt t on x.order_id = t.id)      as invoices_linked,
  (select count(*) from refunds   x join tgt t on x.order_id = t.id)      as refunds_linked,
  (select count(*) from service_notes x join tgt t on x.order_id = t.id)  as service_notes_linked;

-- 1d. Stock reservations pointing at these orders — these UNITS are FREED (kept),
--     never deleted. (reserved_ref = 'SO-' || so.)
with tgt as (select so from orders where source_system = 'autocount')
select count(*) as reserved_units_to_free
from ops_stock_items s
join tgt t on s.reserved_ref = 'SO-' || t.so::text
where s.status = 'reserved';


-- ============================================================================
-- PART 2 · BACKUP  (reversible copies before deleting — run once)
-- ============================================================================
create schema if not exists _archive;

create table if not exists _archive.orders_autocount_20260721 as
  select * from orders where source_system = 'autocount';

create table if not exists _archive.order_lines_autocount_20260721 as
  select l.* from order_lines l
  join orders o on o.id = l.order_id
  where o.source_system = 'autocount';

-- (add more child snapshots here if PART 1 shows finance/PO rows worth keeping)


-- ============================================================================
-- PART 3 · DELETE  (one transaction — nothing permanent until COMMIT)
--   Only run after PART 1 looks clean (blocker counts = 0, native_in_scope = 0).
-- ============================================================================
begin;

-- 3a. Free the stock reservations of these orders — KEEP the unit, just release it.
update ops_stock_items s
   set status = 'free', reserved_ref = null, reserve_reason = null, updated_at = now()
  from orders o
 where s.reserved_ref = 'SO-' || o.so::text
   and o.source_system = 'autocount'
   and s.status = 'reserved';

-- 3b. Guard: if any autocount order still has a RESTRICT blocker, abort loudly
--     (delete finance/PO rows here explicitly ONLY after reviewing PART 1c).
do $$
declare
  n int;
begin
  select
    (select count(*) from purchase_orders p join orders o on p.so = o.so
       where o.source_system='autocount')
  + (select count(*) from payments  x join orders o on x.order_id = o.id
       where o.source_system='autocount')
  + (select count(*) from invoices  x join orders o on x.order_id = o.id
       where o.source_system='autocount')
  + (select count(*) from refunds   x join orders o on x.order_id = o.id
       where o.source_system='autocount')
    into n;
  if n > 0 then
    raise exception 'RESTRICT blockers present (%). Review PART 1c and handle them explicitly before deleting.', n;
  end if;
end $$;

-- 3c. Unlink (keep) any service note that references a target order.
update service_notes s
   set order_id = null
  from orders o
 where s.order_id = o.id
   and o.source_system = 'autocount';

-- 3d. Delete the orders. CASCADE removes order_lines / order_addons /
--     order_history / order_supplier_threads / order_annotations /
--     ops_order_control automatically; ops_tasks + global-feed links go NULL.
delete from orders where source_system = 'autocount';

-- 3e. Verify — must return 0.
select count(*) as autocount_orders_remaining
from orders where source_system = 'autocount';

-- If the number above is 0 and nothing errored:  COMMIT;
-- To abort and change nothing:                    ROLLBACK;
-- (left open on purpose — you decide.)
