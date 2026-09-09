-- 0459_outbound_work_starts_in_the_site_queue.sql
-- One Outbound obligation starts at its governed Site. A warehouse user's
-- first explicit acceptance or first prep scan resolves it to that person.
-- Completion remains the accepted exact-Unit handover facts from 0424/0440.

begin;
set search_path = public, pg_temp;

create table if not exists public.warehouse_outbound_assignments (
  delivery_order_id uuid not null references public.ops_delivery_orders(id) on delete restrict,
  site_id uuid not null references public.warehouses(id) on delete restrict,
  accepted_by uuid not null references public.app_users(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  primary key (delivery_order_id, site_id)
);

comment on table public.warehouse_outbound_assignments is
  '0459: durable owner evidence for one open Outbound scope. Absence means the authorised Site queue; acceptance names a personal warehouse login. Handover events, not this row, close Work.';

alter table public.warehouse_outbound_assignments enable row level security;
revoke all on public.warehouse_outbound_assignments from authenticated, anon;

create or replace function public.warehouse_accept_outbound_work(p_do_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_site uuid := public.app_warehouse_id();
  v_existing warehouse_outbound_assignments;
begin
  if public.app_role() is distinct from 'warehouse' or v_site is null then
    raise exception 'only a personally signed-in warehouse operator can accept this work'
      using errcode = '42501', detail = 'warehouse_person_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_do_id::text, 0));
  if not exists (
    select 1 from app_users
     where id = v_uid and role = 'warehouse' and status = 'active' and warehouse_id = v_site
  ) then
    raise exception 'this warehouse operator is not active at this Site'
      using errcode = '42501', detail = 'warehouse_person_inactive';
  end if;
  if not exists (
    select 1
      from delivery_order_units u
      join ops_stock_items i on i.id = u.item_id
     where u.delivery_order_id = p_do_id
       and i.warehouse_id = v_site
       and not exists (
         select 1 from delivery_handover_event_units e
          where e.delivery_order_id = p_do_id and e.item_id = i.id
            and e.recorded_side = 'warehouse')
  ) then
    raise exception 'this delivery order has no unfinished Units at your Site'
      using errcode = '42501', detail = 'outbound_not_in_site_queue';
  end if;

  select * into v_existing from warehouse_outbound_assignments
   where delivery_order_id = p_do_id and site_id = v_site for update;
  if v_existing.delivery_order_id is not null then
    if v_existing.accepted_by <> v_uid then
      raise exception 'this work is already accepted by another operator'
        using errcode = 'P0001', detail = 'outbound_already_accepted';
    end if;
    return jsonb_build_object('deliveryOrderId', p_do_id, 'siteId', v_site,
      'acceptedBy', v_uid, 'acceptedAt', v_existing.accepted_at);
  end if;

  insert into warehouse_outbound_assignments(delivery_order_id, site_id, accepted_by)
  values (p_do_id, v_site, v_uid)
  returning * into v_existing;
  return jsonb_build_object('deliveryOrderId', p_do_id, 'siteId', v_site,
    'acceptedBy', v_uid, 'acceptedAt', v_existing.accepted_at);
end;
$fn$;

create or replace function public.warehouse_claim_outbound_on_first_prep()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.app_role() = 'warehouse' then
    perform public.warehouse_accept_outbound_work(new.delivery_order_id);
  end if;
  return new;
end;
$fn$;

drop trigger if exists delivery_unit_prep_claims_outbound on public.delivery_unit_prep;
create trigger delivery_unit_prep_claims_outbound
  before insert on public.delivery_unit_prep
  for each row execute function public.warehouse_claim_outbound_on_first_prep();

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

revoke all on function public.warehouse_accept_outbound_work(uuid) from public;
revoke all on function public.warehouse_my_outbound_assignments() from public;
grant execute on function public.warehouse_accept_outbound_work(uuid) to authenticated;
grant execute on function public.warehouse_my_outbound_assignments() to authenticated;

commit;
