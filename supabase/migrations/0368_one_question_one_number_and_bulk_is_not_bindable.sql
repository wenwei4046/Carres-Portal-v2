-- =============================================================================
-- 0368_one_question_one_number_and_bulk_is_not_bindable.sql
-- WAREHOUSE UNIT AUTHORITY — 0366's `available` answered two questions at once.
--
-- FOUND BY REVIEW, measured on production 2026-08-20:
--
--   stock_sku_availability.available                     978 units
--   of which bulk rows (qty > 1)                         893 units in 5 rows
--   actually bindable to a Sales Order                    85 units
--
-- 0366 shipped `ops_stock_items_bulk_never_reserved`, which forbids a qty > 1
-- row from ever reaching reserved / sold / transferred or carrying a
-- reserved_ref. So those 893 pieces cannot be promised to anybody through any
-- governed door — and `available` summed them anyway, while claiming to be
-- "the only number that answers whether goods can be offered". It was actually
-- answering "what is on the floor and is not broken", which is `on_hand`.
-- Two questions, one number: Architecture Law D, inside the card written to
-- remove exactly that.
--
-- THE FIX IS THREE NAMED NUMBERS, NOT ONE OVERLOADED ONE. Law D asks for one
-- arithmetic per fact, not for one number per view:
--
--   available     exact Units a Sales Order can bind RIGHT NOW (qty = 1,
--                 received, complete, unreserved, uncontrolled)
--   bulk_on_hand  anonymous pieces present on the floor in a qty > 1 record —
--                 real goods, sellable in principle, NOT bindable as an exact
--                 Unit while the record stands for N of them
--   sellable      available + bulk_on_hand — what REPLENISHMENT asks: "must we
--                 buy more?" A shelf holding 555 pillows needs no purchase
--                 order, even though no pillow has an identity.
--
-- WHY THE 893 ARE NOT SPLIT INTO 893 UNITS. It was proposed, and it is the
-- wrong change here:
--   · MASTER §3 requires a permanent Unit ID for every SOFA and for every
--     independently saleable or replaceable MODULE. It does not require one per
--     pillow, and the ID is printed by the SUPPLIER on its own label — Carres
--     does not label 555 pillows one at a time. Minting 893 ids would change
--     how Carres operates, which is an owner decision, not a migration.
--   · The card forbids a backfill or repair worklist over imported rows, and
--     every live row is test data (Constitution §6).
-- The real question underneath — should an accessory piece carry an identity,
-- or should accessory demand be satisfied without exact-Unit binding? — is a
-- genuine owner decision. It is recorded in docs/stock/MASTER.md rather than
-- decided here, and nothing in this migration pre-empts either answer.
--
-- ALSO FIXED: the bulk guard was sofa-only. Card §2 is about goods that are
-- independently traceable, and a bedframe and a mattress are (two of the five
-- live bulk rows are `DIVAN ONLY (K)` and `SONIC-L1202S-Q`). The guard now
-- covers sofa, bedframe and mattress. It asks the CATALOG, so a SKU the catalog
-- does not hold cannot be judged and is allowed through — at go-live the
-- catalog is configuration that survives (Constitution §6), so every real SKU
-- has a row; today none of the five does, which is why the sofa-only guard
-- never fired on any of them.
--
-- Asserts NO production row count.
-- =============================================================================

set search_path = public;

-- ─── 1 · Furniture is traced one by one, whatever its category ───────────────
create or replace function public.trg_stock_unit_traceable_is_one()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_cat text;
begin
  if new.qty > 1 then
    v_cat := public.stock_sku_category(new.sku);
    if v_cat in ('sofa', 'bedframe', 'mattress') then
      raise exception
        'a % is traced one by one — % cannot be a bulk row of %',
        v_cat, new.sku, new.qty
        using errcode = 'P0001', detail = 'traceable_unit_not_bulk';
    end if;
  end if;
  return new;
end;
$$;

-- ─── 2 · One question, one number ───────────────────────────────────────────
-- DROP, not CREATE OR REPLACE: the new number sits between `available` and
-- `reserved`, and Postgres will not let a replaced view reorder or insert a
-- column. A plain DROP (never CASCADE) is the safe form — if anything had
-- actually depended on the view, this migration would fail loudly here rather
-- than quietly take that dependency down with it.
drop view if exists public.stock_sku_availability;

create view public.stock_sku_availability
with (security_invoker = true) as
  select v.sku,
         v.warehouse_id,
         -- everything physically present at this Site
         sum(v.qty) filter (where v.availability in ('available','reserved','not_available'))::int as on_hand,
         -- exact Units a Sales Order can bind right now
         sum(v.qty) filter (where v.availability = 'available' and v.qty = 1)::int  as available,
         -- present and unbroken, but standing in a qty > 1 record: real goods
         -- that no exact-Unit promise can name
         sum(v.qty) filter (where v.availability = 'available' and v.qty > 1)::int  as bulk_on_hand,
         -- what replenishment asks. NEVER what a promise asks.
         sum(v.qty) filter (where v.availability = 'available')::int                as sellable,
         sum(v.qty) filter (where v.availability = 'reserved')::int                 as reserved,
         sum(v.qty) filter (where v.availability = 'not_available')::int            as not_available,
         sum(v.qty) filter (where v.availability = 'incoming')::int                 as incoming,
         sum(v.qty) filter (where v.availability = 'in_transit')::int               as in_transit
    from public.stock_unit_availability_v v
   where v.availability <> 'ended'
   group by v.sku, v.warehouse_id;

comment on view public.stock_sku_availability is
  '0368 — THE availability authority, three named numbers. `available` = exact '
  'Units a Sales Order can BIND. `sellable` = available + bulk_on_hand, what '
  'REPLENISHMENT asks. `on_hand` = everything physically here. Never compute '
  'on_hand − reserved, and never use `available` to decide whether to buy.';

grant select on public.stock_sku_availability to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.stock_sku_availability from authenticated, anon;

-- ─── 3 · The legacy cache keeps the meaning it has always had ───────────────
-- `stock_balances.qty` has meant free + reserved since 0137. It must NOT follow
-- the narrowed `available` — the eighteen legacy RPCs that read it would each
-- silently lose 893 pieces. It tracks `sellable + reserved`, which is exactly
-- free + reserved, now summing qty instead of counting rows.
create or replace function public.ops_rollup_stock_balances(p_wh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('carres.stock_rollup', '1', true);

  insert into public.stock_balances (sku, warehouse_id, qty, reserved)
  select a.sku, a.warehouse_id, (a.sellable + a.reserved), a.reserved
    from public.stock_sku_availability a
   where a.warehouse_id = p_wh
     and (a.sellable + a.reserved) > 0
  on conflict (sku, warehouse_id)
    do update set
      qty        = excluded.qty,
      reserved   = excluded.reserved,
      updated_at = now();

  update public.stock_balances sb
     set qty = 0, reserved = 0, updated_at = now()
   where sb.warehouse_id = p_wh
     and not exists (
       select 1 from public.stock_sku_availability a
        where a.warehouse_id = p_wh
          and a.sku          = sb.sku
          and (a.sellable + a.reserved) > 0
     );

  perform set_config('carres.stock_rollup', '0', true);
end;
$$;

-- ─── 4 · The reorder alert asks REPLENISHMENT's question ────────────────────
-- A shelf holding 555 pillows is not short of pillows, however many of them
-- carry an identity.
create or replace function public.operation_stock_alerts()
returns table(sku text, warehouse_id uuid, qty integer, reserved integer,
              effective integer, low_threshold integer, shortage integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  v_role := public.app_role();

  if v_role not in ('operation', 'principal') then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
    select sb.sku,
           sb.warehouse_id,
           coalesce(a.on_hand, 0)                                as qty,
           coalesce(a.reserved, 0)                               as reserved,
           coalesce(a.sellable, 0)                               as effective,
           sb.low_threshold,
           (sb.low_threshold - coalesce(a.sellable, 0))::int      as shortage
      from public.stock_balances sb
      left join public.stock_sku_availability a
        on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
     where sb.low_threshold is not null
       and coalesce(a.sellable, 0) < sb.low_threshold
     order by (sb.low_threshold - coalesce(a.sellable, 0)) desc,
              sb.sku asc;
end;
$$;

-- ─── 5 · SANITY ─────────────────────────────────────────────────────────────
do $$
declare
  v_bad int;
begin
  -- `available` counts ONLY what a governed door could actually bind.
  select count(*) into v_bad
    from public.stock_sku_availability a
   where a.available <> (
     select coalesce(sum(v.qty), 0) from public.stock_unit_availability_v v
      where v.sku = a.sku and v.warehouse_id = a.warehouse_id
        and v.availability = 'available' and v.qty = 1);
  if v_bad > 0 then
    raise exception '0368 sanity: % rows where available is not the bindable count', v_bad;
  end if;

  -- Nothing bulk is hidden: the three numbers reconcile, always.
  select count(*) into v_bad
    from public.stock_sku_availability a
   where a.sellable <> a.available + a.bulk_on_hand;
  if v_bad > 0 then
    raise exception '0368 sanity: % rows where sellable does not reconcile', v_bad;
  end if;

  -- A bulk row can never be bound, so it can never appear in `available`.
  if exists (
    select 1 from public.stock_unit_availability_v v
     where v.qty > 1 and v.availability = 'reserved') then
    raise exception '0368 sanity: a bulk record carries a reservation';
  end if;

  -- The legacy cache did NOT move.
  select count(*) into v_bad
    from public.stock_balances sb
    left join public.stock_sku_availability a
      on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
   where sb.qty is distinct from coalesce(a.sellable + a.reserved, 0);
  if v_bad > 0 then
    raise exception '0368 sanity: % cached totals moved when they should not have', v_bad;
  end if;

  raise notice '0368 OK: available binds, sellable buys, on_hand describes';
end $$;
