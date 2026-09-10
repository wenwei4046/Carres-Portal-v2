-- 0414_a_stamped_fee_remembers_the_rate_that_made_it.sql
--
-- THE RULING THIS SERVES, and it is already law — YH, 2026-08-28,
-- `docs/orders/MASTER.md` §405-410, APPROVED / LOCKED:
--
--     The fee must be STAMPED at the order, not re-derived. A charge the
--     customer signed for may not move because a rate changed afterwards.
--
-- `0393` wrote the row. `0394` re-stamps it when an input moves. Neither
-- recorded WHAT RATE produced the number — so every re-stamp re-prices the
-- order at whatever `floor_config` says TODAY, and the ruling above is broken
-- by the very mechanism written to serve it.
--
-- ---- THE FAILURE, ORDINARY OPERATOR, ORDINARY DAY --------------------------
--
-- A principal raises `per_floor_per_item` from RM 50 to RM 60. Weeks later an
-- operator corrects a phone number on an order delivered in July. The save
-- re-stamps, the fee recomputes at RM 60, and the customer is billed a
-- stair-carry figure they never agreed to. Nothing failed and nothing warned.
--
-- ---- WHAT THIS ADDS -------------------------------------------------------
--
-- Two columns on `orders`: the rate and the free band that priced this order's
-- fee. Once written they are the order's own facts, and re-pricing reads them
-- instead of the live singleton. A rate change then cannot reach a single
-- existing order, which is the whole ruling in one sentence.
--
-- ⛔ NULLABLE, AND NO DEFAULT. Both are deliberate.
--
-- NULL means "born before 0414" — it is the honest state for an order stamped
-- before the pin existed, and the reader falls back to the live config for it
-- exactly as today. It is not an error and it is not backfilled: CLAUDE.md §6
-- forbids repairing imported rows, and there is no record anywhere of what the
-- rate WAS when those orders were priced. Inventing one would be worse than
-- admitting we do not know.
--
-- AND NO DEFAULT, because a default here is a silent backfill of the whole
-- book. PostgreSQL 11+ evaluates a non-volatile `ADD COLUMN … DEFAULT` ONCE at
-- ALTER time and stores the result as the attribute's missing-value for EVERY
-- existing row — so `default (select per_floor_per_item from floor_config)`
-- would stamp today's rate onto every order ever taken, in one statement, and
-- destroy the `NULL = we do not know` invariant this file rests on. The bare
-- `ADD COLUMN` below is the difference between a schema change and a data
-- change wearing its clothes.
--
-- ---- AND THE STAMP DOOR IS WRAPPED, NOT REWRITTEN --------------------------
--
-- `order_stamp_stair_carry(uuid, numeric)` is mature and correct: it validates
-- the fee, deletes then inserts, and treats 0 as "remove the row". It is left
-- byte-for-byte alone. Adding defaulted parameters to it would create an
-- ambiguous overload and break every existing 2-argument call, so the pin gets
-- its own door which records the rate and then delegates.
--
-- The pin is written ONCE. A second stamp on the same order leaves the first
-- rate standing — that is what "the rate the customer agreed to" means, and it
-- is why the write is `where stair_rate_per_floor_per_item is null`.

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. The two facts an order keeps about its own fee
-- ---------------------------------------------------------------------

alter table public.orders
  add column if not exists stair_rate_per_floor_per_item numeric(12,2);

alter table public.orders
  add column if not exists stair_rate_free_up_to_floor int;

comment on column public.orders.stair_rate_per_floor_per_item is
  '0414: the floor_config rate this order''s stair fee was priced at. NULL = stamped before 0414, so the reader falls back to the live config. Never backfilled — nothing records what the rate was on the day.';
comment on column public.orders.stair_rate_free_up_to_floor is
  '0414: the free-floor band this order''s stair fee was priced against. NULL with the rate above, and read as a pair.';

-- ---------------------------------------------------------------------
-- 2. The door that stamps a fee AND remembers what made it
-- ---------------------------------------------------------------------

create or replace function public.order_stamp_stair_carry_pinned(
  p_order_id   uuid,
  p_fee        numeric,
  p_rate       numeric,
  p_free_up_to int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- THE PIN IS WRITTEN ONCE. A later re-stamp prices at the rate already
  -- recorded, so this may never overwrite one — that is the ruling.
  if p_rate is not null and p_free_up_to is not null then
    update public.orders
       set stair_rate_per_floor_per_item = p_rate,
           stair_rate_free_up_to_floor    = p_free_up_to
     where id = p_order_id
       and stair_rate_per_floor_per_item is null;
  end if;

  -- 0394 unchanged: it validates the fee, deletes, re-inserts, and treats 0 as
  -- "remove the row". Nothing about that is re-implemented here.
  perform public.order_stamp_stair_carry(p_order_id, p_fee);
end;
$fn$;

revoke all on function
  public.order_stamp_stair_carry_pinned(uuid, numeric, numeric, int) from public, anon;
grant execute on function
  public.order_stamp_stair_carry_pinned(uuid, numeric, numeric, int) to authenticated;

comment on function public.order_stamp_stair_carry_pinned(uuid, numeric, numeric, int) is
  '0414: stamps the stair fee through 0394''s door and records the rate that produced it, once. A re-stamp reads the recorded rate instead of the live floor_config, so a rate change cannot move a fee the customer already signed for (YH, 2026-08-28, orders/MASTER.md 405-410).';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders'
--      and column_name like 'stair_rate%'
--    order by 1;
--   -- EXPECT: stair_rate_free_up_to_floor, stair_rate_per_floor_per_item
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'order_stamp_stair_carry_pinned';
--   -- EXPECT: one row. Absent = this migration never ran.
--
--   -- ⭐ THE ONE THAT MATTERS — no existing order was touched. A DEFAULT on
--   -- either column would have materialised today's rate onto every row here:
--   select count(*) filter (where stair_rate_per_floor_per_item is not null)
--            as pinned,
--          count(*) filter (where stair_rate_per_floor_per_item is null)
--            as not_pinned
--     from public.orders;
--   -- EXPECT immediately after apply: pinned = 0. Every order is NOT pinned
--   -- until it is next stamped. Any other answer means a default crept in.
--
--   -- NEGATIVE CONTROL — the pin is written once and never moved:
--   --   begin;
--   --   select order_stamp_stair_carry_pinned('<a test order>', 150, 50, 2);
--   --   select order_stamp_stair_carry_pinned('<the same order>', 180, 60, 2);
--   --   select stair_rate_per_floor_per_item from orders where id = '<id>';
--   --   -- EXPECT: 50. The second call re-stamps the FEE and leaves the RATE.
--   --   rollback;
