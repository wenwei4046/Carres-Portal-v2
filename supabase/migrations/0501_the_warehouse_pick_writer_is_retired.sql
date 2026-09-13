-- 0499 · The warehouse-pick writer is retired
-- 【DELIVERY】 CARD 21 (2026-09-13) — closes Delivery MASTER §16 note (3).
--
-- WHY. Since 0366 a stock total is DERIVED from the unit register and never
-- written by hand: `stock_balances_derived_only` refuses any hand-written
-- `qty` / `reserved` with `stock_total_is_derived`. Three legacy doors still
-- wrote that total (measured live in pg_proc on 2026-09-13):
--
--   _operation_reserve_order(uuid)                 0125 · update stock_balances
--                                                  set reserved = reserved + qty
--   operation_warehouse_pick(uuid, uuid)           0129 · rewrites orders.warehouse_id
--                                                  and the threads, then calls the
--                                                  helper when nothing is short —
--                                                  granted to authenticated / anon /
--                                                  PUBLIC, i.e. reachable by any
--                                                  signed-in client through PostgREST
--   operation_receive_po_line(text, text, integer) the Orders-side receive door D2
--                                                  removed from every surface; no
--                                                  apps/ caller; calls the helper
--
-- The one reservation door is `ops_stock_pool_draw` / `so_batch_reserve_ready_units`
-- (0471/0472) on exact Units; the one receive door is Receiving. A writer that
-- cannot succeed is not harmless: the pick door's shortage branch still rewrote
-- `operation_stage` and History on a retired model. Nothing calls these three
-- from `apps/` (the two API routes are removed in the same PR), and nothing in
-- pg_proc calls them except one another.
--
-- WHAT. Drops the three functions. Writes no row. Changes no policy. The
-- derived-total guard from 0366 is asserted armed so this file cannot be
-- applied onto a database that lost it.
--
-- Rolled-back production probe (before merge): the three names present →
-- dropped → absent; a hand-written `update stock_balances set reserved =
-- reserved + 1` still refused with detail `stock_total_is_derived`.

begin;

drop function if exists public.operation_warehouse_pick(uuid, uuid);
drop function if exists public.operation_receive_po_line(text, text, integer);
drop function if exists public._operation_reserve_order(uuid);

do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'stock_balances'
       and t.tgname = 'stock_balances_derived_only'
       and not t.tgisinternal
  ) then
    raise exception '0499 sanity FAILED — stock_balances_derived_only (0366) is not armed';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('operation_warehouse_pick', 'operation_receive_po_line', '_operation_reserve_order')
  ) then
    raise exception '0499 sanity FAILED — a retired stock-total writer is still present';
  end if;
end;
$$;

commit;
