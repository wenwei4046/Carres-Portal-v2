-- 0542 · A split delivery has one document per trip
-- (Delivery MASTER §3.1, §15.1 "the split-trip DO's own issuing door")
--
-- One sales order can go out on two or three trips in the same scope (the
-- whole order, or one Journey leg). Each trip carries its own delivery groups
-- (`ops_order_control.booking_groups`, 0282) and gets its own document, and
-- every document keeps its SO through `order_id` (the print already shows it).
--
-- Until now 0491's index allowed ONE live document per (order, leg): a first
-- split trip that ran (delivered or partial — never voided) blocked the
-- second trip's paper. The index gains a trip key:
--
--   ops_delivery_orders.trip    0 = the unsplit trip (every document so far);
--                               1..3 = one trip of a split delivery.
--
-- delivery_trip_document_mint is the split trip's insert, a copy of 0491's
-- leg mint. It is called by the ONE issuing path (`delivery-order-issue.ts`)
-- after its gate — never a second gate. It reads the trip's scope, date, slot
-- and partner from the booking itself, never from the caller, and mirrors the
-- number onto orders.do_number for the legacy readers (0356's own rule).
-- service_role is accepted because the finance exception door issues the
-- document through the system client (exceptions.ts:126), the same as 0499/0504.

set search_path = public;

alter table public.ops_delivery_orders
  add column if not exists trip smallint not null default 0;
alter table public.ops_delivery_orders drop constraint if exists ops_delivery_orders_trip_range;
alter table public.ops_delivery_orders
  add constraint ops_delivery_orders_trip_range check (trip >= 0 and trip <= 3);
comment on column public.ops_delivery_orders.trip is
  '0542: 0 = the unsplit trip; 1..3 = one trip of a split delivery in the same scope. One live document per (order, leg, trip).';

-- Every existing row is trip 0, so the wider key holds whatever 0491's held.
drop index if exists public.ops_delivery_orders_one_live_per_scope;
create unique index ops_delivery_orders_one_live_per_scope
  on public.ops_delivery_orders (order_id, leg, trip) where voided_at is null;

create or replace function public.delivery_trip_document_mint(
  p_order_id uuid, p_do_number text
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
  if not (coalesce(auth.role() = 'service_role', false) or coalesce((select public.is_operation()), false)) then
    raise exception 'Only operation or principal may issue a Delivery Order' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_do_number, '')), '') is null then
    raise exception 'a document carries its number' using errcode = '22023', detail = 'do_number_required';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  select * into v_ctl from ops_order_control where order_id = p_order_id;
  if v_ctl.booking_groups is null or v_ctl.booking_stage is distinct from 'confirmed' or v_ctl.confirmed_date is null then
    raise exception 'a split trip needs its confirmed booking and its delivery groups before a document issues'
      using errcode = '22023', detail = 'trip_not_booked';
  end if;
  -- The order already carries this trip's number: the same paper back.
  if v_order.do_number is not null then
    select * into v_row from ops_delivery_orders where do_number = v_order.do_number;
    return to_jsonb(v_row);
  end if;
  -- The same trip, still live: the same paper back.
  select * into v_row from ops_delivery_orders
   where order_id = p_order_id and leg = 0 and voided_at is null
     and trip_groups is not distinct from v_ctl.booking_groups
   order by issued_at desc limit 1;
  if not found then
    select min(t) into v_trip from generate_series(1, 3) t
     where not exists (select 1 from ops_delivery_orders d
                        where d.order_id = p_order_id and d.leg = 0 and d.trip = t and d.voided_at is null);
    if v_trip is null then
      raise exception 'an order goes out on three trips at most'
        using errcode = '22023', detail = 'three_trips_at_most';
    end if;
    insert into ops_delivery_orders (order_id, do_number, leg, trip, trip_groups, delivery_date, time_slot, logistics_partner, issued_by)
    values (p_order_id, upper(btrim(p_do_number)), 0, v_trip, v_ctl.booking_groups, v_ctl.confirmed_date, v_ctl.confirmed_time_slot,
            (select p.name from delivery_partners p
              where p.id = coalesce(v_ctl.confirmed_partner_id, v_order.ops_assigned_logistic, v_order.delivery_partner_id)),
            auth.uid())
    returning * into v_row;
    insert into order_history (order_id, text, by_role)
    values (p_order_id, format('%s issued for trip %s · %s', v_row.do_number, v_trip, array_to_string(v_row.trip_groups, ', ')), (select public.app_role()));
  end if;
  -- The materialiser (0356) sees the row already exists and inserts nothing.
  update orders set do_number = v_row.do_number where id = p_order_id;
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.delivery_trip_document_mint(uuid, text) from public, anon;
grant execute on function public.delivery_trip_document_mint(uuid, text) to authenticated, service_role;
