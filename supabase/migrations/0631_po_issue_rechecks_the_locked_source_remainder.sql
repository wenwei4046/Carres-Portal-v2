-- Purchasing placement acceptance: the locked source remainder is checked before numbering.
-- Existing authorisation, number allocation, approval and Unit writers remain unchanged.
create or replace function public.so_line_remaining_requirement(
  p_order_line_id uuid, p_exclude_item uuid default null
) returns int language sql stable set search_path to 'public'
as $function$
  with coverage as (
    select coalesce(i.po_line_id::text, 'unit:' || i.id::text) as binding,
           sum(coalesce(i.qty, 1))::int as units, 0::int as lineage
      from ops_stock_items i
     where i.reserved_order_line_id = p_order_line_id
       and i.status in ('reserved', 'sold', 'incoming')
       and (p_exclude_item is null or i.id <> p_exclude_item)
     group by 1
    union all
    select coalesce(s.po_line_id::text, 'legacy:' || s.po_id || ':' || s.sku),
           0::int, sum(greatest(0, s.qty))::int
      from po_line_sources s join purchase_orders p on p.id = s.po_id
     where s.order_line_id = p_order_line_id and p.status <> 'cancelled'
     group by 1
  ), bound as (
    select binding, greatest(sum(units), sum(lineage)) as qty from coverage group by binding
  )
  select greatest(0, coalesce((select qty from order_lines where id=p_order_line_id),0)
    - coalesce((select sum(qty)::int from bound),0));
$function$;
comment on function public.so_line_remaining_requirement(uuid,uuid) is
  'One SO line remainder: current quantity less effective exact source coverage and explicit Unit reservations. A reserved Unit on that same linked PO line covers once. Unsent and pending-cancellation POs still cover; unrelated anonymous incoming goods do not.';

-- Guarded replacement preserves the current governed issue implementation.
do $patch$
declare d text; needle text := $needle$  perform pg_advisory_xact_lock(hashtext('purchasing_issue_pos_batch'));$needle$;
begin
  select pg_get_functiondef('public.purchasing_issue_pos_batch(jsonb)'::regprocedure) into d;
  if position(needle in d)=0 or position('source_requirement_changed' in d)>0 then
    raise exception 'Unexpected purchasing issue body';
  end if;
  d := replace(d, needle, needle || $guard$

  -- The owning Order cannot be withdrawn/amended between this read and issue.
  perform 1 from public.orders o where o.id in (
    select (src->>'order_id')::uuid from jsonb_array_elements(p_pos) po
    cross join lateral jsonb_array_elements(po->'lines') ln
    cross join lateral jsonb_array_elements(coalesce(ln->'sources','[]'::jsonb)) src
  ) order by o.id for update;
  -- Lock exact source lines in stable order. The complete batch is checked,
  -- so repeating one source across documents cannot evade its aggregate cap.
  perform 1 from public.order_lines l
   where l.id in (
     select nullif(src->>'order_line_id','')::uuid
       from jsonb_array_elements(p_pos) po
       cross join lateral jsonb_array_elements(po->'lines') ln
       cross join lateral jsonb_array_elements(coalesce(ln->'sources','[]'::jsonb)) src
   ) order by l.id for update;
  if exists (
    select 1
      from (
        select (src->>'order_line_id')::uuid as line_id,
               (src->>'order_id')::uuid as order_id,
               sum((src->>'qty')::int) as qty
          from jsonb_array_elements(p_pos) po
          cross join lateral jsonb_array_elements(po->'lines') ln
          cross join lateral jsonb_array_elements(coalesce(ln->'sources','[]'::jsonb)) src
         group by 1,2
      ) asked
      left join public.order_lines l on l.id=asked.line_id and l.order_id=asked.order_id
      left join public.orders o on o.id=l.order_id
     where l.id is null or o.status <> 'proceed_order'
        or asked.qty <= 0
        or asked.qty > public.so_line_remaining_requirement(l.id)
  ) then
    raise exception 'Source requirement changed; refresh before issuing'
      using errcode='P0001', detail='unknown_demand';
  end if;
$guard$);
  execute d;
end;
$patch$;
