-- Owner-approved 2026-10-02: a committed SO uses the governed amendment flow.
-- Keep the existing role/dealer gate and shared source lock before inspecting facts.
create or replace function public.unproceed_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  perform public._sales_order_lock_for_edit(p_order_id);
  if exists(select 1 from public.po_line_sources s where s.order_id=p_order_id)
     or exists(select 1 from public.purchase_orders p join public.orders o on o.id=p_order_id where o.so=any(p.so_refs))
     or exists(select 1 from public.ops_stock_items i where
       i.reserved_order_line_id in (select id from public.order_lines where order_id=p_order_id)
       or i.sold_order_id=p_order_id
       or (i.reserved_ref=(select 'SO-'||so::text from public.orders where id=p_order_id)
           and i.status in ('incoming','reserved','sold'))) then
    raise exception 'HQ operation has already started on this order'
      using errcode='22023', detail='wrong_stage';
  end if;
  return public._unproceed_order_0391_locked_impl(p_order_id);
end;
$function$;
