-- SO V2 Card 2: one physical Unit identity and an immutable movement timeline.
-- RLS impact: the ledger is internal-read only; writes are trigger-only.

create table public.stock_unit_events (
  id bigint generated always as identity primary key,
  unit_id uuid not null references public.ops_stock_items(id),
  event text not null check (event in (
    'born','received','reserved','released','reassigned','status_changed',
    'location_changed','condition_changed'
  )),
  from_status text,
  to_status text,
  from_ref text,
  to_ref text,
  warehouse_id uuid references public.warehouses(id),
  condition text,
  actor_id uuid,
  happened_at timestamptz not null default now()
);

create index stock_unit_events_unit_time_idx
  on public.stock_unit_events(unit_id, happened_at desc, id desc);

alter table public.stock_unit_events enable row level security;
create policy stock_unit_events_read_internal on public.stock_unit_events
  for select using ((select public.is_internal()));

create or replace function public.record_stock_unit_event()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'born';
  elsif old.warehouse_id is distinct from new.warehouse_id then
    v_event := 'location_changed';
  elsif old.condition is distinct from new.condition then
    v_event := 'condition_changed';
  elsif old.status is distinct from new.status then
    v_event := case
      when old.status = 'incoming' and new.status = 'free' then 'received'
      when new.status = 'reserved' then 'reserved'
      when old.status = 'reserved' and new.status = 'free' then 'released'
      else 'status_changed'
    end;
  elsif old.reserved_ref is distinct from new.reserved_ref then
    v_event := 'reassigned';
  else
    return new;
  end if;

  insert into public.stock_unit_events(
    unit_id,event,from_status,to_status,from_ref,to_ref,warehouse_id,condition,actor_id
  ) values (
    new.id,v_event,case when tg_op='UPDATE' then old.status end,new.status,
    case when tg_op='UPDATE' then old.reserved_ref end,new.reserved_ref,
    new.warehouse_id,new.condition,auth.uid()
  );
  return new;
end $$;

revoke all on function public.record_stock_unit_event() from public, anon, authenticated;
create trigger stock_unit_event_after_change
after insert or update of status, reserved_ref, warehouse_id, condition
on public.ops_stock_items for each row execute function public.record_stock_unit_event();

-- 0153 already mints own-warehouse Units inside the single PO creation
-- authority. Card 2 closes the other half: a PO line headed to any configured
-- non-own warehouse also gets its Unit IDs at placement, before receiving.
create or replace function public.mint_non_own_po_units()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_po public.purchase_orders; v_supplier text;
begin
  select * into v_po from public.purchase_orders where id=new.po_id;
  if v_po.warehouse_id is null or exists (
    select 1 from public.warehouses where id=v_po.warehouse_id and kind='own'
  ) then return new; end if;
  select name into v_supplier from public.suppliers where id=v_po.supplier_id;
  insert into public.ops_stock_items(
    unit_code,sku,warehouse_id,status,supplier,po_no,source_ref,date_in
  ) select public.gen_unit_code(),new.sku,v_po.warehouse_id,'incoming',
    v_supplier,new.po_id,'po_mint',current_date
    from generate_series(1,new.qty);
  return new;
end $$;

revoke all on function public.mint_non_own_po_units() from public,anon,authenticated;
create trigger purchase_order_line_mints_non_own_units
after insert on public.purchase_order_lines for each row
execute function public.mint_non_own_po_units();

-- Existing units get one opening observation. It does not pretend to recreate
-- history that the former schema never recorded.
insert into public.stock_unit_events(
  unit_id,event,to_status,to_ref,warehouse_id,condition,happened_at
)
select id,'born',status,reserved_ref,warehouse_id,condition,created_at
from public.ops_stock_items;

create or replace function public.sales_order_unit_bundle(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_so integer;
begin
  if not public.is_internal() then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select so into v_so from public.orders where id=p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode='42P01', detail='order_not_found';
  end if;
  return jsonb_build_object(
    'so',v_so,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('sku',sku,'qty',qty))
      from public.order_lines where order_id=p_order_id),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(to_jsonb(i) order by i.unit_code)
      from public.ops_stock_items i
      where i.reserved_ref='SO-'||v_so::text
         or (i.status='free' and not i.needs_repair and exists (
           select 1 from public.order_lines l where l.order_id=p_order_id
             and regexp_replace(lower(l.sku),'[^a-z0-9]','','g') =
                 regexp_replace(lower(i.sku),'[^a-z0-9]','','g')
         ))),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.happened_at desc,e.id desc)
      from public.stock_unit_events e join public.ops_stock_items i on i.id=e.unit_id
      where i.reserved_ref='SO-'||v_so::text or ('SO-'||v_so::text)=any(i.ref_history)),'[]'::jsonb)
  );
end $$;

revoke all on function public.sales_order_unit_bundle(uuid) from public, anon;
grant execute on function public.sales_order_unit_bundle(uuid) to authenticated;

create or replace function public.sales_order_allocate_unit(p_order_id uuid, p_unit_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_so integer; v_id uuid;
begin
  if public.app_role() not in ('operation','principal') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select so into v_so from public.orders where id=p_order_id for update;
  if v_so is null then raise exception 'order not found' using errcode='42P01'; end if;
  update public.ops_stock_items i set
    status='reserved', reserved_ref='SO-'||v_so::text, updated_at=now()
  where i.id=p_unit_id and i.status='free' and not i.needs_repair
    and exists (
      select 1 from public.order_lines l where l.order_id=p_order_id
      and regexp_replace(lower(l.sku),'[^a-z0-9]','','g') =
          regexp_replace(lower(i.sku),'[^a-z0-9]','','g')
    )
  returning i.id into v_id;
  if v_id is null then
    raise exception 'unit is not suitable or no longer available'
      using errcode='P0001', detail='unit_not_available';
  end if;
  insert into public.ops_activity_log(order_id,action,actor_id,detail)
  values(p_order_id,'stock_reserve',auth.uid(),jsonb_build_object('item_id',v_id,'ref','SO-'||v_so::text));
  return v_id;
end $$;

create or replace function public.sales_order_release_unit(p_order_id uuid, p_unit_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_so integer; v_id uuid;
begin
  if public.app_role() not in ('operation','principal') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select so into v_so from public.orders where id=p_order_id for update;
  update public.ops_stock_items i set status='free', reserved_ref=null,
    ref_history=array_append(i.ref_history,i.reserved_ref), updated_at=now()
  where i.id=p_unit_id and i.status='reserved' and i.reserved_ref='SO-'||v_so::text
  returning i.id into v_id;
  if v_id is null then
    raise exception 'unit is not reserved to this order'
      using errcode='P0001', detail='unit_not_reserved_here';
  end if;
  insert into public.ops_activity_log(order_id,action,actor_id,detail)
  values(p_order_id,'stock_release',auth.uid(),jsonb_build_object('item_id',v_id,'ref','SO-'||v_so::text));
  return v_id;
end $$;

revoke all on function public.sales_order_allocate_unit(uuid,uuid) from public,anon;
revoke all on function public.sales_order_release_unit(uuid,uuid) from public,anon;
grant execute on function public.sales_order_allocate_unit(uuid,uuid) to authenticated;
grant execute on function public.sales_order_release_unit(uuid,uuid) to authenticated;
