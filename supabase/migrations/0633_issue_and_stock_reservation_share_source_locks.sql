-- Existing source consumers share Order → exact line → PO line / Unit lock order.
-- This adds no reservation or eligibility rule and no new write entrance.
create or replace function public.so_lock_source_lines(p_lines uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp
as $lock$
begin
  perform 1 from orders o where o.id in (select order_id from order_lines where id=any(p_lines))
    order by o.id for no key update;
  perform 1 from order_lines l where l.id=any(p_lines) order by l.id for no key update;
end;
$lock$;
revoke all on function public.so_lock_source_lines(uuid[]) from public,anon,authenticated;

do $patch$
declare r record; d text;
begin
  for r in select * from (values
    ('public.ops_stock_pool_draw(text,text,text,uuid,text,text,uuid,uuid,uuid)',
     '  if v_line_id is not null then',
     '  if v_line_id is not null then' || chr(10) || '    perform public.so_lock_source_lines(array[v_line_id]);'),
    ('public.so_batch_use_po_units(text,text,text,uuid,uuid,text)',
     '  -- LOCK ORDER: the PO''s lines first (the draw door''s and Receiving''s order).',
     '  perform public.so_lock_source_lines(array[p_line]);' || chr(10) || '  -- Source first, then PO lines and Units.'),
    ('public.so_batch_save_ready_units(text,text,text,uuid,uuid,jsonb)',
     '  -- ── 1 · GIVE BACK WHAT THE REPLACEMENT DROPS',
     '  perform public.so_lock_source_lines(array[p_line]);' || chr(10) || '  -- ── 1 · GIVE BACK WHAT THE REPLACEMENT DROPS'),
    ('public.so_batch_reserve_ready_units(text,text,text,jsonb)',
     '  for v_pick in select * from jsonb_array_elements(p_picks) loop',
     '  perform public.so_lock_source_lines(array(select (p->>''orderLineId'')::uuid from jsonb_array_elements(p_picks) p));' || chr(10) || '  for v_pick in select * from jsonb_array_elements(p_picks) loop'),
    ('public.ops_stock_release(uuid)',
     '  UPDATE ops_stock_items',
     '  perform public.so_lock_source_lines(array(select reserved_order_line_id from ops_stock_items where id=p_item_id));' || chr(10) || '  UPDATE ops_stock_items')
  ) as changes(signature,needle,replacement)
  loop
    select pg_get_functiondef(r.signature::regprocedure) into d;
    if position(r.needle in d)=0 or position('so_lock_source_lines' in d)>0 then
      raise exception 'Unexpected source consumer body: %',r.signature;
    end if;
    execute replace(d,r.needle,r.replacement);
  end loop;
end;
$patch$;
