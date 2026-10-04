-- Approved whole-round Ready Stock: one persisted priority, one manager door.
alter table public.purchasing_settings
  add column ready_stock_priority text not null default 'customer_delivery'
  check (ready_stock_priority in ('customer_delivery', 'proceed_date'));

create or replace function public.purchasing_set_ready_stock_priority(p_priority text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old text;
begin
  if p_priority is null or p_priority not in ('customer_delivery', 'proceed_date') then
    raise exception 'Choose a Ready Stock priority.' using errcode = '22023';
  end if;
  select ready_stock_priority into strict v_old from purchasing_settings where id = 1 for update;
  if v_old = p_priority then return; end if;
  update purchasing_settings set ready_stock_priority = p_priority,
    updated_by = auth.uid(), updated_at = now() where id = 1;
  perform purchasing_record_change(v_role, 'ready_stock_priority', null, null,
    v_old, p_priority, 'Purchasing setting · Ready Stock priority');
end;
$fn$;
revoke all on function public.purchasing_set_ready_stock_priority(text) from public, anon;
grant execute on function public.purchasing_set_ready_stock_priority(text) to authenticated;
