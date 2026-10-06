-- =============================================================================
-- 0369_an_empty_bucket_is_zero_and_a_guard_that_cannot_fire_is_not_a_guard.sql
-- WAREHOUSE UNIT AUTHORITY — 0368 emitted NULL where it meant 0, and its own
-- sanity block could never fire.
--
-- FOUND BY REVIEW, measured on production 2026-08-20 across 74 rows of
-- `stock_sku_availability`:
--
--   reserved     NULL on 73 rows        bulk_on_hand NULL on 69
--   incoming     NULL on 50             available    NULL on 29
--   on_hand      NULL on 24             sellable     NULL on 24
--
-- CAUSE. 0366 counted rows (`count(*) filter (...)`), which returns 0 for an
-- empty group. 0368 had to SUM `qty` instead, so that a bulk record contributes
-- its 555 pieces rather than 1 — and `sum(...) filter (...)` returns **NULL**
-- for an empty group, not 0. Every bucket a given (sku, Site) happens not to
-- have came out missing rather than empty.
--
-- WHY THAT IS WORSE THAN UNTIDY:
--
--   ① IT MADE 0368'S OWN SANITY BLOCK VACUOUS. The reconciliation guard was
--      written `where a.sellable <> a.available + a.bulk_on_hand`. With a NULL
--      on either side that predicate is NULL — not TRUE, not FALSE — so the row
--      is not counted and the guard never raises. Measured: the predicate
--      evaluated to NULL on **all 74 rows**. It was not "passing"; it was not
--      testing anything. A test that passes when the thing it guards is broken
--      is worse than no test, because it is believed.
--   ② SILENT NULL ARITHMETIC DOWNSTREAM. Any consumer computing
--      `sellable - reserved` or `available + incoming` gets NULL, not a number
--      and not an error. Eighteen SECURITY DEFINER functions read this area.
--   ③ A NULL COUNT IS NOT A ZERO ON SCREEN. It renders blank or NaN, and every
--      reader forever has to defend against it.
--
-- THE FIX IS ONE `coalesce` PER COLUMN, and a guard rewritten so that it CANNOT
-- pass vacuously again: `is distinct from` is NULL-safe, so a NULL that should
-- be a number now RAISES instead of disappearing.
--
-- ALSO: `anon` still held SELECT on the five objects 0366 created. Not a leak —
-- the views are `security_invoker`, so `is_internal()` denies anon every row —
-- but it is the same root cause 0367 recorded, with only the WRITE half fixed:
-- a new object in `public` does not start clean, and `anon` is the other half
-- of that lesson.
--
-- Asserts NO production row count.
-- =============================================================================

set search_path = public;

-- ─── 1 · An empty bucket is zero, not missing ───────────────────────────────
create or replace view public.stock_sku_availability
with (security_invoker = true) as
  select v.sku,
         v.warehouse_id,
         coalesce(sum(v.qty) filter (where v.availability in ('available','reserved','not_available')), 0)::int as on_hand,
         coalesce(sum(v.qty) filter (where v.availability = 'available' and v.qty = 1), 0)::int  as available,
         coalesce(sum(v.qty) filter (where v.availability = 'available' and v.qty > 1), 0)::int  as bulk_on_hand,
         coalesce(sum(v.qty) filter (where v.availability = 'available'), 0)::int                as sellable,
         coalesce(sum(v.qty) filter (where v.availability = 'reserved'), 0)::int                 as reserved,
         coalesce(sum(v.qty) filter (where v.availability = 'not_available'), 0)::int            as not_available,
         coalesce(sum(v.qty) filter (where v.availability = 'incoming'), 0)::int                 as incoming,
         coalesce(sum(v.qty) filter (where v.availability = 'in_transit'), 0)::int               as in_transit
    from public.stock_unit_availability_v v
   where v.availability <> 'ended'
   group by v.sku, v.warehouse_id;

comment on view public.stock_sku_availability is
  '0369 — THE availability authority, three named numbers, and every bucket is '
  'a NUMBER: an empty one is 0, never NULL. `available` = exact Units a Sales '
  'Order can BIND. `sellable` = available + bulk_on_hand, what REPLENISHMENT '
  'asks. `on_hand` = everything physically here. Never compute on_hand - '
  'reserved, and never use `available` to decide whether to buy.';

grant select on public.stock_sku_availability to authenticated;
revoke all on public.stock_sku_availability from anon;

-- ─── 2 · `anon` has no business here either ─────────────────────────────────
do $$
declare v_obj text;
begin
  foreach v_obj in array array[
    'public.stock_operating_parties',
    'public.stock_unit_ids',
    'public.stock_unit_events',
    'public.stock_unit_availability_v',
    'public.stock_sku_availability',
    'public.ops_stock_items',
    'public.stock_balances'
  ] loop
    execute format('revoke all on %s from anon', v_obj);
  end loop;
end $$;

-- ─── 3 · SANITY — written so it CANNOT pass vacuously ───────────────────────
-- Every comparison below is NULL-safe (`is distinct from`, `is not null`), so a
-- NULL where a number belongs RAISES instead of vanishing. That is the whole
-- point of this migration.
do $$
declare
  v_bad int;
  v_col text;
begin
  -- ① No bucket is ever missing. This is the check 0368 needed and did not have.
  foreach v_col in array array['on_hand','available','bulk_on_hand','sellable',
                               'reserved','not_available','incoming','in_transit'] loop
    execute format(
      'select count(*) from public.stock_sku_availability where %I is null', v_col)
      into v_bad;
    if v_bad > 0 then
      raise exception '0369 sanity: % is NULL on % rows — an empty bucket must be 0', v_col, v_bad;
    end if;
  end loop;

  -- ② The three numbers reconcile. NULL-safe, so it can actually fail now.
  select count(*) into v_bad
    from public.stock_sku_availability a
   where a.sellable is distinct from (a.available + a.bulk_on_hand);
  if v_bad > 0 then
    raise exception '0369 sanity: % rows where sellable does not reconcile', v_bad;
  end if;

  -- ③ NEGATIVE CONTROL for ② — prove the guard fires on a value that is wrong.
  --    0368's version could not have caught this, which is why it is written
  --    down here rather than trusted.
  select count(*) into v_bad
    from public.stock_sku_availability a
   where a.sellable is distinct from (a.available + a.bulk_on_hand + 1);
  if v_bad = 0 then
    raise exception '0369 sanity: the reconciliation guard cannot fail — it is not a guard';
  end if;

  -- ④ `available` still counts only what a governed door could bind.
  select count(*) into v_bad
    from public.stock_sku_availability a
   where a.available is distinct from (
     select coalesce(sum(v.qty), 0) from public.stock_unit_availability_v v
      where v.sku = a.sku and v.warehouse_id = a.warehouse_id
        and v.availability = 'available' and v.qty = 1);
  if v_bad > 0 then
    raise exception '0369 sanity: % rows where available is not the bindable count', v_bad;
  end if;

  -- ⑤ Nothing anonymous can reach the unit authority.
  if exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public'
       and table_name in ('ops_stock_items','stock_balances','stock_operating_parties',
                          'stock_unit_ids','stock_unit_events',
                          'stock_unit_availability_v','stock_sku_availability')
  ) then
    raise exception '0369 sanity: anon still holds a grant on the unit authority';
  end if;

  -- ⑥ And the internal role kept every read it needs.
  if (select count(distinct table_name)
        from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public'
         and privilege_type = 'SELECT'
         and table_name in ('ops_stock_items','stock_balances','stock_operating_parties',
                            'stock_unit_ids','stock_unit_events',
                            'stock_unit_availability_v','stock_sku_availability')) <> 7 then
    raise exception '0369 sanity: a Warehouse read surface lost its SELECT grant';
  end if;

  raise notice '0369 OK: every bucket is a number, and the guard can fail';
end $$;
