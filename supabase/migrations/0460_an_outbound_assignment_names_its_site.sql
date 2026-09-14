-- 0460_an_outbound_assignment_names_its_site.sql
-- 0459 keys ownership by (Delivery Order, Site). Its scoped reader must carry
-- that same Site identity into the typed Work projection.

begin;
set search_path = public, pg_temp;

create or replace function public.warehouse_my_outbound_assignments()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_site uuid := public.app_warehouse_id();
begin
  if public.app_role() is distinct from 'warehouse' or v_site is null then
    raise exception 'warehouse only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'site', (select jsonb_build_object('id', w.id, 'label', w.name)
               from warehouses w where w.id = v_site),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deliveryOrderId', a.delivery_order_id,
        'siteId', a.site_id,
        'userId', a.accepted_by,
        'name', coalesce(u.name, u.email),
        'acceptedAt', a.accepted_at))
        from warehouse_outbound_assignments a
        join app_users u on u.id = a.accepted_by
       where a.site_id = v_site
    ), '[]'::jsonb));
end;
$fn$;

revoke all on function public.warehouse_my_outbound_assignments() from public;
grant execute on function public.warehouse_my_outbound_assignments() to authenticated;

commit;
