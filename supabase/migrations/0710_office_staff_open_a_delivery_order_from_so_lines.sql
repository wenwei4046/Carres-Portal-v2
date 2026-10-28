-- =============================================================================
-- 0710_office_staff_open_a_delivery_order_from_so_lines.sql
-- =============================================================================
-- THE RULING (Weisiang, Mr Lim "Houzs Weisiang.00", WhatsApp 2026-10-22 6:29 PM,
--   relayed by YH 2026-10-23): "just clear Carress rules and Implement Houzs
--   inside, as long as they can open SO PO DO. right now they cant open".
--   Office staff may open a Delivery Order from a Sales Order's lines, the
--   Houzs way. This overturns Jess's earlier rule that only the system issues
--   a DO (docs/delivery/MASTER.md §3 and §15; docs/orders/MASTER.md "Delivery
--   Order — the system creates the document"). Jess was not part of it.
--   Follows Houzs-ERP backend/src/scm/routes/delivery-orders-mfg.ts:3930
--   (POST /from-sos) per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
--
-- WHAT THIS CHANGES
--   One new door, delivery_office_document_mint(order, groups, number): the
--   office DO's insert. It is a sibling of 0542's split-trip mint, called by
--   the ONE issuing path (`delivery-order-issue.ts`) after its gate (goods,
--   money, Finance exception), never a second gate. The scope is the caller's
--   pick: NULL = the whole order (trip 0), else the picked delivery groups
--   (the next free trip 1..3). The number comes from 0575's allocator.
--
-- WHAT IT REFUSES (never ship twice)
--   · goods already on a live DO of the order: a live whole-order DO, any
--     overlap with a live trip's groups, or the whole order while any DO lives
--   · a Delivery Journey order (a live leg document): its legs issue their own
--   · a blank number, an empty or unknown group list, a caller who is not
--     Operation or principal (NULL-safe)
--   The 0362/0441 money trigger still binds the insert: no DO while money is
--   owed without an APPROVED Delivery Payment Approval.
--
-- UNCHANGED: the system's own issue (orders.do_number + 0356 materialiser),
-- 0542's trip mint and 0491's leg mint are not touched.
-- =============================================================================

set search_path = public;

create or replace function public.delivery_office_document_mint(
  p_order_id uuid, p_groups text[], p_do_number text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_ctl ops_order_control;
  v_trip int;
  v_row ops_delivery_orders;
begin
  if not coalesce((select public.is_operation()), false) then
    raise exception 'Only operation or principal may open a Delivery Order' using errcode = '42501', detail = 'forbidden';
  end if;
  if nullif(btrim(coalesce(p_do_number, '')), '') is null then
    raise exception 'a document carries its number' using errcode = '22023', detail = 'do_number_required';
  end if;
  if p_groups is not null and (
       cardinality(p_groups) = 0
       or exists (select 1 from unnest(p_groups) g where g is null or g not in ('bed', 'sofa'))
       or cardinality(p_groups) <> (select count(distinct g) from unnest(p_groups) g)) then
    raise exception 'pick the goods for this Delivery Order' using errcode = '22023', detail = 'invalid_groups';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from ops_delivery_orders d
              where d.order_id = p_order_id and d.voided_at is null and d.leg > 0) then
    raise exception 'this order travels on a Delivery Journey; each leg issues its own Delivery Order'
      using errcode = '22023', detail = 'journey_order';
  end if;
  if exists (select 1 from ops_delivery_orders d
              where d.order_id = p_order_id and d.voided_at is null and d.leg = 0
                and (p_groups is null or d.trip_groups is null or cardinality(d.trip_groups) = 0
                     or d.trip_groups && p_groups)) then
    raise exception 'these goods are already on a Delivery Order'
      using errcode = '22023', detail = 'already_on_a_delivery_order';
  end if;

  if p_groups is null then
    v_trip := 0;
  else
    select min(t) into v_trip from generate_series(1, 3) t
     where not exists (select 1 from ops_delivery_orders d
                        where d.order_id = p_order_id and d.leg = 0 and d.trip = t and d.voided_at is null);
    if v_trip is null then
      raise exception 'an order goes out on three trips at most'
        using errcode = '22023', detail = 'three_trips_at_most';
    end if;
  end if;

  select * into v_ctl from ops_order_control where order_id = p_order_id;
  insert into ops_delivery_orders (order_id, do_number, leg, trip, trip_groups, delivery_date, time_slot, logistics_partner, issued_by)
  values (p_order_id, upper(btrim(p_do_number)), 0, v_trip, p_groups, v_ctl.confirmed_date, v_ctl.confirmed_time_slot,
          (select p.name from delivery_partners p
            where p.id = coalesce(v_ctl.confirmed_partner_id, v_order.ops_assigned_logistic, v_order.delivery_partner_id)),
          auth.uid())
  returning * into v_row;
  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          format('%s opened by the office · %s', v_row.do_number,
                 coalesce(array_to_string(v_row.trip_groups, ', '), 'whole order')),
          (select public.app_role()));
  -- Legacy readers see the newest number (0356's rule); the materialiser
  -- finds the row already there and inserts nothing.
  update orders set do_number = v_row.do_number where id = p_order_id;
  return to_jsonb(v_row);
end;
$fn$;
comment on function public.delivery_office_document_mint(uuid, text[], text) is
  '0710 (Weisiang 2026-10-22): office staff open a Delivery Order from SO lines. Scope NULL = whole order, else delivery groups; refuses goods already on a live DO and Journey orders. Called by the one issuing path after its gate; the 0362 money trigger still binds.';
revoke all on function public.delivery_office_document_mint(uuid, text[], text) from public, anon;
grant execute on function public.delivery_office_document_mint(uuid, text[], text) to authenticated;

-- The booking confirmed later FILLS IN an undated DO's date; the DO keeps its
-- number. Houzs does this (a DO's delivery date is a header edit on the same
-- document: Houzs-ERP backend/src/scm/routes/delivery-orders-mfg.ts PATCH
-- /:id). A DO that already had a date and is rebooked is still voided and
-- reissued by the booking door (order-control.ts), unchanged.
create or replace function public.delivery_document_date_fill(
  p_do_id uuid, p_date date, p_time_slot text
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce((select public.is_operation()), false) then
    raise exception 'Only operation or principal may date a Delivery Order' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_date is null then
    raise exception 'a date is required' using errcode = '22023', detail = 'date_required';
  end if;
  update ops_delivery_orders
     set delivery_date = p_date,
         time_slot = nullif(btrim(coalesce(p_time_slot, '')), '')
   where id = p_do_id and voided_at is null and delivery_date is null;
end;
$fn$;
revoke all on function public.delivery_document_date_fill(uuid, date, text) from public, anon;
grant execute on function public.delivery_document_date_fill(uuid, date, text) to authenticated;

-- =============================================================================
-- REVERSAL (run by hand only if 0710 must be withdrawn; nothing else depends
-- on it but the New Delivery Order door, which then answers 500):
--
--   drop function if exists public.delivery_office_document_mint(uuid, text[], text);
--   drop function if exists public.delivery_document_date_fill(uuid, date, text);
--
-- Documents it already minted stay: they are ordinary ops_delivery_orders
-- rows and a DO is never deleted (0356).
-- =============================================================================
