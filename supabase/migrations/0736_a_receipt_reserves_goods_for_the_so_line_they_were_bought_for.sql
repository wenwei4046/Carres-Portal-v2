-- =============================================================================
-- 0736_a_receipt_reserves_goods_for_the_so_line_they_were_bought_for.sql
-- =============================================================================
-- Stock MASTER §4 / Purchasing MASTER §7.3 · owner ruling (Jess) 2026-10-05,
-- APPROVED / NOT BUILT until now: goods bought for an explicit Sales Order
-- line (`po_line_sources`) are reserved to that line when Receiving posts
-- them; staff do not allocate them again.
--
-- WHAT WAS WRONG (production, 2026-10-30): PO261030-7839 was raised for
-- SO-1375 (REGAL-Q x1). GRN-20261030-9277 checked Unit U1-000-335 in as
-- `free`, unbound. The SO, Delivery Monitor and the DO gate read Units by
-- `reserved_order_line_id`, so the line read "Not allocated"; and
-- `Reserve stock` refused it as `line_already_covered`, because
-- `so_line_remaining_requirement` (0631) still counts the PO lineage. Nobody
-- could tie the goods to the customer they were bought for.
--
-- WHAT THIS FILE DOES
--   1 `_stock_source_line_for_receipt(po_line, unit)` — the SO line a received
--     Unit answers: the oldest source row of that PO line whose order is live
--     (`place` / `proceed_order`), whose source qty is not yet met by Units of
--     this PO line, and whose SO line still has room. None → null, the Unit
--     stays free stock (over-received, cancelled order, line already whole).
--   2 The 0600 arrival trigger (body as 0698 left it) gains that case: an
--     unbound Unit going incoming → free becomes `reserved` for that line, in
--     every receiving path. A Unit bound by `Use this PO` keeps 0600's rule.
--   3 One backfill of Units already received free under the same rule, so
--     SO-1375's U1-000-335 is reserved. It reports how many it reserved.
--
-- 0631's coverage counts a reserved Unit and the lineage of its own PO line
-- once (greatest per binding), so nothing reads as covered twice.
-- shortcut: quantity-counted goods (identity_scope <> 'unit') are not
-- auto-reserved; extend the trigger if quantity lines need it.
-- =============================================================================

set search_path = public;

-- ── 1 · the SO line a received Unit answers ──────────────────────────────────
-- VOLATILE on purpose: a GRN that posts several Units in one UPDATE must see
-- the Units already reserved earlier in that statement.
create or replace function public._stock_source_line_for_receipt(p_po_line_id uuid, p_item_id uuid)
returns table (order_line_id uuid, ref text)
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with src as (
    select s.order_line_id, sum(s.qty)::int as qty, min(s.created_at) as first_at
      from po_line_sources s
     where s.po_line_id = p_po_line_id
       and s.order_line_id is not null
     group by s.order_line_id
  )
  select l.id, 'SO-' || o.so::text
    from src
    join order_lines l on l.id = src.order_line_id
    join orders o on o.id = l.order_id
   where o.status in ('place', 'proceed_order')
     and src.qty > (select coalesce(sum(coalesce(i.qty, 1)), 0)
                      from ops_stock_items i
                     where i.po_line_id = p_po_line_id
                       and i.reserved_order_line_id = l.id
                       and i.status in ('reserved', 'sold', 'incoming')
                       and i.id <> p_item_id)
     and l.qty > (select coalesce(sum(coalesce(i.qty, 1)), 0)
                    from ops_stock_items i
                   where i.reserved_order_line_id = l.id
                     and i.status in ('reserved', 'sold', 'incoming')
                     and i.id <> p_item_id)
   order by src.first_at, l.id
   limit 1;
$fn$;
revoke all on function public._stock_source_line_for_receipt(uuid, uuid) from public, anon, authenticated;

-- ── 2 · Receiving honours the lineage, in every posting path ─────────────────
-- 0698's body, plus the lineage case. SECURITY DEFINER so the receiver need not
-- read order lines or execute the private helper.
create or replace function public.ops_stock_bound_incoming_arrives()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_line uuid;
  v_ref  text;
begin
  -- 0736 · goods bought for an SO line arrive reserved for it.
  if old.status = 'incoming'
     and new.status = 'free'
     and old.reserved_order_line_id is null
     and old.reserved_purchase_demand_id is null
     and new.po_line_id is not null
     and coalesce(new.identity_scope, 'unit') = 'unit'
     and not coalesce(new.needs_repair, false) then
    select f.order_line_id, f.ref into v_line, v_ref
      from public._stock_source_line_for_receipt(new.po_line_id, new.id) f;
    if v_line is not null then
      new.status := 'reserved';
      new.reserved_ref := v_ref;
      new.reserved_order_line_id := v_line;
    end if;
    return new;
  end if;

  if old.status = 'incoming'
     and new.status is distinct from old.status
     and (old.reserved_order_line_id is not null or old.reserved_purchase_demand_id is not null) then
    if new.status = 'free' then
      -- The goods arrived for the customer who reserved them on the PO.
      new.status := 'reserved';
    elsif new.status <> 'reserved' then
      -- Damaged/wrong on arrival, voided by a revision or cancel: the Unit no
      -- longer answers the line, and the requirement returns to SO Batch.
      new.ref_history := case when old.reserved_ref is not null
                              then array_append(old.ref_history, old.reserved_ref)
                              else old.ref_history end;
      new.reserved_ref := null;
      new.reserved_order_line_id := null;
      new.reserved_purchase_demand_id := null;
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.ops_stock_bound_incoming_arrives() from public, anon, authenticated;

drop trigger if exists ops_stock_bound_incoming_arrives on public.ops_stock_items;
create trigger ops_stock_bound_incoming_arrives
  before update of status on public.ops_stock_items
  for each row execute function public.ops_stock_bound_incoming_arrives();

-- ── 3 · Units already received free before this file ─────────────────────────
create or replace function public._stock_reserve_received_for_source_lines()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_unit record;
  v_line uuid;
  v_ref  text;
  v_n    int := 0;
begin
  for v_unit in
    select i.id, i.po_line_id
      from ops_stock_items i
     where i.status = 'free'
       and i.po_line_id is not null
       and i.reserved_order_line_id is null
       and i.reserved_purchase_demand_id is null
       and coalesce(i.identity_scope, 'unit') = 'unit'
       and not coalesce(i.needs_repair, false)
     order by i.unit_code
       for update
  loop
    select f.order_line_id, f.ref into v_line, v_ref
      from public._stock_source_line_for_receipt(v_unit.po_line_id, v_unit.id) f;
    continue when v_line is null;
    update ops_stock_items
       set status = 'reserved', reserved_ref = v_ref, reserved_order_line_id = v_line, updated_at = now()
     where id = v_unit.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function public._stock_reserve_received_for_source_lines() from public, anon, authenticated;

do $backfill$
begin
  raise notice '0736: % received Unit(s) reserved to the SO line they were bought for',
    public._stock_reserve_received_for_source_lines();
end;
$backfill$;
