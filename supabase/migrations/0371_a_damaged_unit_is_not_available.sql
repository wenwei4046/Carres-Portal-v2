-- =============================================================================
-- 0371_a_damaged_unit_is_not_available.sql
-- WAREHOUSE UNIT AUTHORITY — the one arithmetic ignored CONDITION.
--
-- FOUND BY REVIEW, 2026-08-20, comparing `unit_availability()` against the
-- oldest surviving free-stock reader in the repository.
--
-- `readFreeStock` in the To Order engine has excluded damaged goods since
-- 2026-08-04, and its own comment says exactly why:
--
--     "R4 releases a quarantined unit back to `free`, so the day a DAMAGED one
--      is released this page would otherwise offer it to a customer's order.
--      Live exposure today is zero — which is exactly why it is closed now
--      rather than after the first release."
--
-- 0366's `unit_availability(status, needs_repair, hold_reason)` never asked
-- about condition. So the two disagree, and they disagree about the one case
-- that matters: a unit released from quarantine back to `free` with
-- `condition = 'damaged'` and `needs_repair = false` reads **available** in the
-- authority and is refused by every reader that predates it. Two arithmetics
-- that do not agree — inside the card written to leave exactly one.
--
-- Live exposure is zero TODAY (measured: 0 damaged units, live conditions are
-- `new` and `exhibition` only), which is the same reason To Order gave for
-- closing it early rather than after the first release. This is not a repair of
-- existing rows; it is closing the path before it has a row to be wrong about.
--
-- WHY CONDITION IS A REQUIRED ARGUMENT AND NOT A DEFAULTED ONE. A fourth
-- parameter with a default would leave the old three-argument call resolvable,
-- and a caller that forgets condition would silently get the wrong answer —
-- which is how this defect existed in the first place. The three-argument form
-- is DROPPED so there is one arithmetic and no way to call a lesser one.
--
-- Stock MASTER §4: "received, inspected, complete, unreserved and uncontrolled
-- → Available"; "issue, inspection, repair, missing component or other control
-- → Not available". Damaged is a condition control, so it is Not available.
-- The other four conditions (`new`, `exhibition`, `old`, `refurbished`) are all
-- sellable and stay so — that list is To Order's, verbatim.
--
-- Asserts NO production row count.
-- =============================================================================

set search_path = public;

-- ─── 1 · The arithmetic, now asking every fact that controls a Unit ─────────
create or replace function public.unit_availability(
  p_status       text,
  p_needs_repair boolean,
  p_hold_reason  text,
  p_condition    text
)
returns text
language sql
immutable
as $$
  select case
    when p_status in ('sold','voided','returned_to_supplier','written_off') then 'ended'
    when p_status = 'transferred' then 'in_transit'
    when p_status = 'incoming'    then 'incoming'
    when p_status = 'reserved'    then 'reserved'
    when p_status = 'on_hold'     then 'not_available'
    when p_status = 'free' and coalesce(p_needs_repair, false) then 'not_available'
    -- A unit released from quarantine keeps the condition it was released with.
    when p_status = 'free' and p_condition = 'damaged' then 'not_available'
    when p_status = 'free'        then 'available'
    else 'not_available'
  end;
$$;

comment on function public.unit_availability(text, boolean, text, text) is
  '0371 — THE availability arithmetic. Reads status, repair flag, protection '
  'reason AND condition: a damaged unit released back to `free` is controlled, '
  'not sellable. Nothing may re-derive this from a status alone.';

-- ─── 2 · The view moves to it, so the old form has no caller ───────────────
create or replace view public.stock_unit_availability_v
with (security_invoker = true) as
  select i.id,
         i.unit_code,
         i.sku,
         public.stock_sku_category(i.sku)                                as category,
         i.warehouse_id,
         i.holder_party_id,
         i.ownership,
         i.supplier,
         i.po_no,
         i.status,
         i.condition,
         i.needs_repair,
         i.hold_reason,
         i.reserved_ref,
         i.sold_order_id,
         i.qty,
         i.date_in,
         i.sold_at,
         i.last_verified_at,
         public.unit_availability(i.status, i.needs_repair, i.hold_reason, i.condition) as availability,
         public.unit_lifecycle_outcome(i.status)                                        as lifecycle_outcome
    from public.ops_stock_items i;

grant select on public.stock_unit_availability_v to authenticated;
revoke all on public.stock_unit_availability_v from anon;

-- ─── 3 · One arithmetic means one signature ────────────────────────────────
drop function if exists public.unit_availability(text, boolean, text);

revoke all on function public.unit_availability(text, boolean, text, text) from public, anon;
grant execute on function public.unit_availability(text, boolean, text, text) to authenticated;

-- ─── 4 · SANITY ────────────────────────────────────────────────────────────
do $$
declare v_bad int;
begin
  -- The case this migration exists for.
  if public.unit_availability('free', false, null, 'damaged') <> 'not_available' then
    raise exception '0371 sanity: a damaged unit is still offered';
  end if;

  -- And every condition that IS sellable still is.
  if public.unit_availability('free', false, null, 'new')          <> 'available'
     or public.unit_availability('free', false, null, 'exhibition') <> 'available'
     or public.unit_availability('free', false, null, 'old')        <> 'available'
     or public.unit_availability('free', false, null, 'refurbished')<> 'available' then
    raise exception '0371 sanity: a sellable condition stopped being available';
  end if;

  -- The six words are otherwise unchanged.
  if public.unit_availability('free', true, null, 'new')            <> 'not_available'
     or public.unit_availability('incoming', false, null, 'new')     <> 'incoming'
     or public.unit_availability('transferred', false, null, 'new')  <> 'in_transit'
     or public.unit_availability('reserved', false, null, 'new')     <> 'reserved'
     or public.unit_availability('on_hold', false, 'damaged', 'new') <> 'not_available'
     or public.unit_availability('sold', false, null, 'new')         <> 'ended' then
    raise exception '0371 sanity: unit_availability changed an answer it should not have';
  end if;

  -- There is exactly ONE arithmetic — the lesser signature is gone.
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'unit_availability';
  if v_bad <> 1 then
    raise exception '0371 sanity: % versions of unit_availability exist', v_bad;
  end if;

  -- The cache still agrees with the register after the change.
  select count(*) into v_bad
    from public.stock_balances sb
    left join public.stock_sku_availability a
      on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
   where sb.qty is distinct from coalesce(a.sellable + a.reserved, 0);
  if v_bad > 0 then
    raise exception '0371 sanity: % cached totals disagree after the change', v_bad;
  end if;

  raise notice '0371 OK: a damaged unit is controlled, and one signature remains';
end $$;
