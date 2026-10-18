-- Repair the authenticated Forecast read without exposing a private helper.
-- Keep SECURITY INVOKER, current grants and existing row policies.
CREATE OR REPLACE FUNCTION public.purchasing_po_line_free_units(p_po_line_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when pl.id is null or po.status is distinct from 'open' then 0
    -- A Manual Purchase line buys for that request; only a recorded
    -- `additional_stock` request leaves its goods for anyone.
    when pl.purchase_request_id is not null
         and (select r.fulfilment_intent from purchase_requests r
               where r.id = pl.purchase_request_id) is distinct from 'additional_stock'
      then 0
    when exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
      where d.id=pl.demand_id and r.fulfilment_intent is distinct from 'additional_stock')
      or exists(select 1 from public.po_line_sources s join public.purchase_demands d on d.id=s.purchase_demand_id join public.purchase_requests r on r.id=d.request_id
        where s.po_line_id=pl.id and r.fulfilment_intent is distinct from 'additional_stock') then 0
    when pl.identity_mode='quantity' then greatest(0,pl.qty-(select coalesce(sum((cancelled_line->>'qty')::integer),0)::integer from public.po_goods_cancellation_events cancellation cross join lateral jsonb_array_elements(cancellation.scope) cancelled_line where cancellation.kind='effective' and cancelled_line->>'lineId'=pl.id::text)-coalesce(pl.received_qty,0)-greatest(0,
      coalesce((select sum(s.qty)::integer from public.po_line_sources s where s.po_line_id=pl.id and s.order_id is not null),0)-coalesce(pl.received_qty,0)))
    else greatest(0,
      (select count(*)::int
         from ops_stock_items i
        where i.po_line_id = pl.id
          and i.status = 'incoming'
          and coalesce(i.identity_scope, 'unit') = 'unit'
          and i.reserved_order_line_id is null
          and i.reserved_purchase_demand_id is null)
      -- Customer lineage still waiting: what the line was raised for, less
      -- what has already arrived (a receipt answers its customers first).
      - greatest(0,
          coalesce((select sum(greatest(0, s.qty))::int
                      from po_line_sources s
                     where s.po_line_id = pl.id and s.order_id is not null), 0)
          - coalesce(pl.received_qty, 0)))
  end
  from (select p_po_line_id as id) k
  left join purchase_order_lines pl on pl.id = k.id
  left join purchase_orders po on po.id = pl.po_id;
$function$;
