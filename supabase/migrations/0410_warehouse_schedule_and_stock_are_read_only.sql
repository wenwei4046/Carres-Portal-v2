-- =============================================================================
-- 0410 — Warehouse Schedule and Stock are read-only owner projections
--
-- DEPENDS ON the Purchasing convergence's 0407 supplier-promise evidence and
-- 0408 formal GRN / exact Receiving outcomes. This migration must be rebased
-- after that branch merges; it must never be applied ahead of those authorities.
-- It creates no PO, Receiving, Stock, Delivery, Transfer, Count or Work writer.
-- =============================================================================

begin;

-- Production P0: the API asks these governed display names, but 0373 omitted
-- them. Existing view columns keep their order; the read-only fields append.
create or replace view public.stock_unit_register_v
with (security_invoker = true) as
  select
    v.*,
    e.last_event_at,
    e.last_event,
    w.name as site_name,
    p.name as holder_name,
    case
      when v.hold_reason is not null or v.needs_repair or v.condition = 'damaged'
        or v.status = 'on_hold' then 'problem_block'
      when v.status = 'incoming' and po.id is not null then 'supplier_arrival'
      when v.status = 'incoming' then null
      when v.status = 'reserved' and delivery.id is not null then 'customer_delivery'
      when v.status = 'transferred' then null
      else 'none'
    end as next_movement_kind,
    case when v.status = 'incoming' and po.id is not null then w.name else null end
      as next_movement_location,
    case
      when v.status = 'incoming' and po.id is not null then v.po_no
      when v.status = 'reserved' and delivery.id is not null then delivery.do_number
      else null
    end as next_movement_ref,
    case
      when v.status = 'incoming' and po.id is not null then po.eta_date
      when v.status = 'reserved' and delivery.id is not null then delivery.delivery_date
      else null
    end as move_date
  from public.stock_unit_availability_v v
  left join public.warehouses w on w.id = v.warehouse_id
  left join public.stock_operating_parties p on p.id = v.holder_party_id
  left join public.purchase_orders po on po.id = v.po_no
  left join lateral (
    select d.id, d.do_number, d.delivery_date
      from public.ops_delivery_orders d
     where d.order_id = v.sold_order_id and d.voided_at is null
     order by d.issued_at desc, d.id desc
     limit 1
  ) delivery on true
  left join lateral (
    select ev.event_at as last_event_at, ev.event as last_event
      from public.stock_unit_events ev
     where ev.unit_id = v.id
     order by ev.seq desc
     limit 1
  ) e on true;

comment on view public.stock_unit_register_v is
  '0410 — the one read-only Stock Register. Availability remains owned by '
  'stock_unit_availability_v. Site and holder names come from governed rows. '
  'Next movement reads only an active DO, source PO arrival or Unit problem; '
  'Transfer stays NULL until its governed source exists. This view writes nothing.';

revoke all on public.stock_unit_register_v from authenticated, anon;
grant select on public.stock_unit_register_v to authenticated;

-- Warehouse landing Register. Each UNION arm reads the object that owns the
-- fact, retains its source link and never infers a physical state from a future
-- booking. Claims/Returns, Transfers and Counts join this projection only when
-- those owners gain a governed physical event date; no sample row stands in.
create or replace view public.warehouse_schedule_v
with (security_invoker = true) as
with latest_promises as (
  select distinct on (pr.po_id, coalesce(pr.po_line_id::text, 'po'))
         pr.id, pr.po_id, pr.po_line_id,
         coalesce(pr.new_date, pr.about_date) as event_date,
         pr.evidence
    from public.po_supplier_promises pr
   where coalesce(pr.new_date, pr.about_date) is not null
   order by pr.po_id, coalesce(pr.po_line_id::text, 'po'),
            pr.supplier_answered_at desc nulls last, pr.recorded_at desc, pr.id desc
), promise_rows as (
  select pr.id,
         pr.event_date,
         po.id as po_id,
         s.name as supplier_name,
         d.name as destination_name,
         coalesce(units.unit_codes, array[]::text[]) as unit_codes,
         coalesce(units.units_count, 0)::integer as units_count,
         case when pr.evidence is not null then 'Supplier evidence on file'
              else 'No supplier evidence on file' end as evidence_label
    from latest_promises pr
    join public.purchase_orders po on po.id = pr.po_id
    join public.suppliers s on s.id = po.supplier_id
    left join public.purchase_order_lines line on line.id = pr.po_line_id
    left join public.purchasing_destinations d
      on d.id = coalesce(line.destination_id, po.destination_id)
    left join lateral (
      select coalesce(array_agg(i.unit_code order by i.unit_code)
               filter (where i.qty = 1), array[]::text[]) as unit_codes,
             coalesce(sum(i.qty), 0)::integer as units_count
        from public.ops_stock_items i
       where i.po_no = po.id
         and (pr.po_line_id is null or i.po_line_id = pr.po_line_id)
    ) units on true
)
select 'supplier-promise:' || p.id::text as id,
       p.event_date,
       'Supplier promise'::text as event_label,
       p.unit_codes,
       p.units_count,
       p.supplier_name::text as from_location,
       p.destination_name::text as to_location,
       p.supplier_name::text as company,
       p.po_id::text as source_ref,
       ('/operation/procurement?po=' || p.po_id)::text as source_path,
       ('Expected · ' || p.event_date::text)::text as timing_label,
       p.evidence_label
  from promise_rows p

union all

select 'receiving-expected:' || p.id::text,
       p.event_date,
       'Receiving expected'::text,
       p.unit_codes,
       p.units_count,
       p.supplier_name,
       p.destination_name,
       p.supplier_name,
       p.po_id,
       ('/operation/procurement?po=' || p.po_id)::text,
       ('Expected · ' || p.event_date::text)::text,
       p.evidence_label
  from promise_rows p

union all

select 'receiving:' || wr.id::text,
       (wr.goods_received_timestamp at time zone 'Asia/Kuala_Lumpur')::date,
       'Receiving'::text,
       coalesce(outcomes.unit_codes, array[]::text[]),
       coalesce(outcomes.units_count, 0)::integer,
       nullif(wr.supplier_snapshot->>'name', '')::text,
       nullif(wr.destination_snapshot->>'name', '')::text,
       nullif(wr.supplier_snapshot->>'name', '')::text,
       coalesce(wr.grn_number, wr.do_number)::text,
       ('/operation?tab=receiving&receipt=' || wr.id::text)::text,
       ('Actual · ' || to_char(
         wr.goods_received_timestamp at time zone 'Asia/Kuala_Lumpur',
         'HH24:MI'
       ))::text,
       case when nullif(wr.do_file_path, '') is not null then 'Receiving evidence on file'
            else 'No receiving evidence on file' end::text
  from public.warehouse_receipts wr
  left join lateral (
    select coalesce(array_agg(o.unit_code order by o.unit_code)
             filter (where o.outcome <> 'extra'), array[]::text[]) as unit_codes,
           count(*)::integer as units_count
      from public.receiving_session_unit_outcomes o
     where o.receipt_id = wr.id
  ) outcomes on true
 where wr.status in ('posted', 'amended')
   and wr.goods_received_timestamp is not null

union all

select 'delivery-pickup:' || delivery.id::text,
       coalesce(
         (handover.recorded_at at time zone 'Asia/Kuala_Lumpur')::date,
         delivery.delivery_date
       ),
       'Customer delivery pickup'::text,
       coalesce(stock.unit_codes, array[]::text[]),
       case when handover.id is not null then coalesce(handover.units_count, 0)
            else coalesce(stock.units_count, 0) end::integer,
       stock.from_location::text,
       'To customer'::text,
       coalesce(handover.counterparty, delivery.logistics_partner)::text,
       delivery.do_number::text,
       ('/operation/delivery-orders/' || delivery.do_number)::text,
       case when handover.id is not null then
              ('Collected · ' || to_char(
                handover.recorded_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'
              ))::text
            else ('Expected · ' || coalesce(nullif(delivery.time_slot, ''), delivery.delivery_date::text))::text
       end,
       case when handover.proof_path is not null then 'Evidence on file'
            else 'No collection evidence yet' end::text
  from public.ops_delivery_orders delivery
  left join lateral (
    select e.id, e.counterparty, e.proof_path, e.recorded_at,
           coalesce(sum(
             case when (goods.value->>'qty') ~ '^[0-9]+$'
                  then (goods.value->>'qty')::integer else 0 end
           ), 0)::integer as units_count
      from public.delivery_handover_events e
      left join lateral jsonb_array_elements(coalesce(e.goods, '[]'::jsonb)) goods(value)
        on true
     where e.delivery_order_id = delivery.id and e.kind = 'handed_over'
     group by e.id, e.counterparty, e.proof_path, e.recorded_at
     order by e.recorded_at desc
     limit 1
  ) handover on true
  left join lateral (
    select coalesce(array_agg(i.unit_code order by i.unit_code)
             filter (where i.qty = 1), array[]::text[]) as unit_codes,
           coalesce(sum(i.qty), 0)::integer as units_count,
           string_agg(distinct w.name, ', ' order by w.name) as from_location
      from public.ops_stock_items i
      left join public.warehouses w on w.id = i.warehouse_id
     where i.sold_order_id = delivery.order_id
  ) stock on true
 where delivery.voided_at is null
   and coalesce(
         (handover.recorded_at at time zone 'Asia/Kuala_Lumpur')::date,
         delivery.delivery_date
       ) is not null

union all

select 'customer-handover:' || attempt.id::text,
       coalesce(attempt.scheduled_date,
                (attempt.recorded_at at time zone 'Asia/Kuala_Lumpur')::date),
       'Customer handover'::text,
       coalesce(units.unit_codes, array[]::text[]),
       coalesce(units.units_count, 0)::integer,
       attempt.logistics_name::text,
       orders.customer_name::text,
       attempt.logistics_name::text,
       coalesce(attempt.do_number, 'SO-' || orders.so::text)::text,
       case when attempt.do_number is not null
              then ('/operation/delivery-orders/' || attempt.do_number)::text
            else ('/operation/orders/' || orders.id::text)::text end,
       ('Actual · ' || to_char(
         attempt.recorded_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'
       ))::text,
       'Delivery result on file'::text
  from public.delivery_attempts attempt
  join public.orders orders on orders.id = attempt.order_id
  left join lateral (
    select coalesce(array_agg(i.unit_code order by i.unit_code), array[]::text[]) as unit_codes,
           count(*)::integer as units_count
      from public.delivery_attempt_units au
      join public.ops_stock_items i on i.id = au.item_id
     where au.attempt_id = attempt.id
  ) units on true;

comment on view public.warehouse_schedule_v is
  '0410 — Warehouse Monday–Saturday landing projection. Supplier promises, '
  'Receiving/GRN, DO collection appointments/evidence and customer handovers '
  'remain owned by their source records. Future DO bookings stay Expected; '
  'Collected appears only after handed_over evidence. This view writes nothing.';

revoke all on public.warehouse_schedule_v from authenticated, anon;
grant select on public.warehouse_schedule_v to authenticated;

-- Schema-only sanity. Never assert production row counts in a migration.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'stock_unit_register_v'
       and column_name = 'site_name'
  ) then raise exception '0410: stock_unit_register_v is missing site_name'; end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'stock_unit_register_v'
       and column_name = 'holder_name'
  ) then raise exception '0410: stock_unit_register_v is missing holder_name'; end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'warehouse_schedule_v'
       and column_name = 'event_date'
  ) then raise exception '0410: warehouse_schedule_v is missing event_date'; end if;
end;
$$;

commit;
