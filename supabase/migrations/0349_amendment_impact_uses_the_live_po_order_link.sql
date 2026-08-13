-- 0349 · AMENDMENT IMPACT USES THE LIVE PO ORDER LINK
-- Production Purchase Orders link to their Sales Order by `so`. Replace only
-- the two retired `dl` references in 0348's otherwise verified function.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.sales_order_amendment_impact(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition,
    'from purchase_orders where dl = v_o.dl',
    'from purchase_orders where so = v_o.so');
  v_definition := replace(v_definition,
    'where p.dl = v_o.dl',
    'where p.so = v_o.so');
  if v_definition like '% dl = v_o.dl%' or v_definition like '%p.dl = v_o.dl%' then
    raise exception 'The retired Purchase Order dl link remains in amendment impact';
  end if;
  execute v_definition;
end $$;
