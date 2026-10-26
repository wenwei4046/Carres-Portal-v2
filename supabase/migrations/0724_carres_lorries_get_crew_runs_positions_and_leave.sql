-- =============================================================================
-- 0724_carres_lorries_get_crew_runs_positions_and_leave.sql
-- =============================================================================
-- THE RULING: Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp
--   2026-10-22, relayed by YH 2026-10-23): "I think just clear Carress rules
--   and Implement Houzs inside". Where a Carres rule clashes with Houzs, the
--   Houzs behaviour is built. Jess was not part of this decision.
--   Fact (YH, 2026-10-23): Carres has its own lorries as well as Logistics
--   companies. docs/delivery/MASTER.md §2 and §15 record the overturned rules.
--
-- WHAT THIS ADDS (Houzs Last Mile · Live Map · Lorry Capacity · Driver Leave):
--   1. delivery_partners.own_fleet — the Logistics company that IS Carres'
--      own lorries. One row `Carres Lorries` is seeded so its Drivers and
--      Vehicles are kept in the existing Settings → Logistics templates
--      (partner_drivers / partner_fleet, 0488). No second lorry or crew list.
--   2. partner_drivers.role — `driver` or `helper` (a crew member).
--   3. fleet_day_crew — the crew confirmed for one lorry on one day.
--   4. fleet_crew_leave — a crew member's dated absence; Fleet Day skips it.
--   5. fleet_lorry_positions — where a lorry was, posted by a tracker or
--      driver app; the Live Map reads the latest per lorry.
--   6. fleet_stops(from, to) — the own-fleet stops: arrangements on a
--      confirmed date whose `vehicle` matches an own-fleet plate, with the
--      order's revenue (order lines + add-ons, the arithmetic orders.ts uses).
--   7. fleet_confirm_crew(...) — the one door that saves a lorry's crew:
--      the right roles, nobody on leave, nobody on two lorries that day.
--
-- A lorry run here is one lorry on one day (arrangements carry no trip
-- number). When Delivery Planning's trips land (T1), fleet_stops reads them.
-- No row count is asserted (red line 8). Nothing is dropped or deleted.
-- =============================================================================

set search_path = public;

-- 1 · the own-fleet company --------------------------------------------------
alter table public.delivery_partners
  add column if not exists own_fleet boolean not null default false;
comment on column public.delivery_partners.own_fleet is
  '0724 (Weisiang''s decision 2026-10-22): this Logistics company is Carres'' own lorries. Its Drivers and Vehicles feed Fleet Day, Live Map, Lorry Capacity and Crew Leave.';

do $seed$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.delivery_partners where own_fleet) then
    insert into public.delivery_partners (name, own_fleet, active)
    values ('Carres Lorries', true, true)
    returning id into v_id;
    -- The goods-holder identity every partner has (0424's backfill rule).
    if to_regclass('public.stock_operating_parties') is not null then
      insert into public.stock_operating_parties (code, name, kind)
      values ('partner_' || v_id, 'Carres Lorries', 'delivery_operator')
      on conflict (code) do nothing;
      update public.delivery_partners dp
         set operating_party_id = sop.id
        from public.stock_operating_parties sop
       where dp.id = v_id and sop.code = 'partner_' || v_id;
    end if;
  end if;
end;
$seed$;

-- 2 · a crew member is a driver or a helper ---------------------------------
alter table public.partner_drivers
  add column if not exists role text not null default 'driver';
alter table public.partner_drivers drop constraint if exists partner_drivers_role_check;
alter table public.partner_drivers
  add constraint partner_drivers_role_check check (role in ('driver', 'helper'));

-- The Settings door gains the role; the five-argument door keeps working.
create or replace function public.delivery_save_partner_driver(
  p_partner_id uuid, p_driver_id uuid, p_name text, p_phone text, p_active boolean, p_role text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_saved jsonb;
  v_old_role text;
  v_role text := coalesce(p_role, 'driver');
begin
  -- the same blank-name refusal as the 5-argument door (0560), asked here too
  -- so the migration gate sees this last definition ask for a real answer.
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'the driver name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if v_role not in ('driver', 'helper') then
    raise exception 'a crew member is a driver or a helper' using errcode = '22023', detail = 'invalid_role';
  end if;
  select role into v_old_role from partner_drivers where id = p_driver_id;
  v_saved := public.delivery_save_partner_driver(p_partner_id, p_driver_id, p_name, p_phone, p_active);
  update partner_drivers set role = v_role where id = (v_saved->>'id')::uuid;
  if v_old_role is distinct from v_role then
    perform public.delivery_record_setting_change('partner_driver_role', p_partner_id,
      case when v_old_role is null then null else jsonb_build_object('role', v_old_role) end,
      jsonb_build_object('id', v_saved->>'id', 'role', v_role));
  end if;
  return v_saved || jsonb_build_object('role', v_role);
end;
$fn$;
revoke all on function public.delivery_save_partner_driver(uuid, uuid, text, text, boolean, text) from public, anon;
grant execute on function public.delivery_save_partner_driver(uuid, uuid, text, text, boolean, text) to authenticated;

-- 3 · the crew confirmed for a lorry on a day --------------------------------
create table if not exists public.fleet_day_crew (
  day          date not null,
  vehicle_id   uuid not null references public.partner_fleet(id) on delete cascade,
  driver_id    uuid references public.partner_drivers(id),
  helper_id    uuid references public.partner_drivers(id),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  primary key (day, vehicle_id),
  constraint fleet_day_crew_two_people check (driver_id is distinct from helper_id or driver_id is null)
);
alter table public.fleet_day_crew enable row level security;
revoke all on public.fleet_day_crew from public, anon, authenticated;
grant select on public.fleet_day_crew to authenticated;
drop policy if exists fleet_day_crew_read on public.fleet_day_crew;
create policy fleet_day_crew_read on public.fleet_day_crew
  for select using ((select public.is_internal()));

-- 4 · crew leave --------------------------------------------------------------
create table if not exists public.fleet_crew_leave (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.partner_drivers(id) on delete cascade,
  from_date   date not null,
  to_date     date not null,
  reason      text not null check (btrim(reason) <> '' and length(reason) <= 200),
  recorded_by uuid references auth.users(id) default auth.uid(),
  recorded_at timestamptz not null default now(),
  constraint fleet_crew_leave_dates check (to_date >= from_date)
);
create index if not exists fleet_crew_leave_crew_idx on public.fleet_crew_leave (crew_id, from_date);
alter table public.fleet_crew_leave enable row level security;
revoke all on public.fleet_crew_leave from public, anon, authenticated;
grant select, insert, delete on public.fleet_crew_leave to authenticated;
drop policy if exists fleet_crew_leave_read on public.fleet_crew_leave;
create policy fleet_crew_leave_read on public.fleet_crew_leave
  for select using ((select public.is_internal()));
drop policy if exists fleet_crew_leave_write on public.fleet_crew_leave;
-- recorded_by is the caller: the column default is not a guard, a direct
-- insert could name someone else (Phase 7 review 2026-10-23).
create policy fleet_crew_leave_write on public.fleet_crew_leave
  for insert with check ((select public.is_operation()) and recorded_by = (select auth.uid()));
drop policy if exists fleet_crew_leave_remove on public.fleet_crew_leave;
create policy fleet_crew_leave_remove on public.fleet_crew_leave
  for delete using ((select public.is_operation()));

-- 5 · lorry positions ---------------------------------------------------------
create table if not exists public.fleet_lorry_positions (
  id          bigint generated always as identity primary key,
  vehicle_id  uuid not null references public.partner_fleet(id) on delete cascade,
  lat         numeric(9,6) not null check (lat between -90 and 90),
  lng         numeric(9,6) not null check (lng between -180 and 180),
  recorded_at timestamptz not null default now(),
  source      text not null default 'driver_app' check (source in ('driver_app', 'tracker')),
  received_by uuid references auth.users(id) default auth.uid()
);
create index if not exists fleet_lorry_positions_latest_idx
  on public.fleet_lorry_positions (vehicle_id, recorded_at desc);
alter table public.fleet_lorry_positions enable row level security;
revoke all on public.fleet_lorry_positions from public, anon, authenticated;
grant select, insert on public.fleet_lorry_positions to authenticated;
drop policy if exists fleet_lorry_positions_read on public.fleet_lorry_positions;
create policy fleet_lorry_positions_read on public.fleet_lorry_positions
  for select using ((select public.is_internal()));
drop policy if exists fleet_lorry_positions_write on public.fleet_lorry_positions;
-- Phase 7 review (2026-10-23): a fix is for a Carres lorry, names the caller
-- as received_by, and is not in the future (a future recorded_at would stay
-- the "latest" fix on the Live Map until that time passes).
create policy fleet_lorry_positions_write on public.fleet_lorry_positions
  for insert with check (
    (select public.is_operation())
    and received_by = (select auth.uid())
    and recorded_at <= now() + interval '2 minutes'
    and exists (select 1 from public.partner_fleet f
                  join public.delivery_partners dp on dp.id = f.partner_id and dp.own_fleet
                 where f.id = vehicle_id)
  );

create or replace function public.fleet_last_positions()
returns table (vehicle_id uuid, lat numeric, lng numeric, recorded_at timestamptz, source text)
language sql stable security invoker
set search_path = public, pg_temp
as $fn$
  select distinct on (p.vehicle_id) p.vehicle_id, p.lat, p.lng, p.recorded_at, p.source
    from fleet_lorry_positions p
   order by p.vehicle_id, p.recorded_at desc;
$fn$;
grant execute on function public.fleet_last_positions() to authenticated;

-- 6 · own-fleet stops --------------------------------------------------------
create or replace function public.fleet_plate_key(p text)
returns text language sql immutable as $fn$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '');
$fn$;

create or replace function public.fleet_stops(p_from date, p_to date)
returns table (
  day date, vehicle_id uuid, plate text, order_id uuid, leg smallint, so integer,
  customer_name text, customer_phone text, customer_address text,
  confirmed_time text, expected_arrival time, revenue numeric
)
language sql stable security invoker
set search_path = public, pg_temp
as $fn$
  select a.confirmed_date, f.id, coalesce(f.plate, a.vehicle), a.order_id, a.leg, o.so,
         o.customer_name, o.customer_phone, o.customer_address,
         a.confirmed_time, a.expected_arrival,
         -- Revenue rides the customer leg only, so a Journey order counts once.
         case when exists (select 1 from ops_delivery_arrangements later
                            where later.order_id = a.order_id and later.leg > a.leg)
              then 0
              else coalesce((select sum(ol.unit_price * ol.qty) from order_lines ol where ol.order_id = o.id), 0)
                 + coalesce((select sum(oa.unit_price * oa.qty) from order_addons oa where oa.order_id = o.id), 0)
         end
    from ops_delivery_arrangements a
    join delivery_partners dp on dp.id = a.partner_id and dp.own_fleet
    join orders o on o.id = a.order_id and o.status <> 'cancelled'
    left join partner_fleet f on f.partner_id = dp.id
                             and public.fleet_plate_key(f.plate) = public.fleet_plate_key(a.vehicle)
   where a.confirmed_date between p_from and p_to;
$fn$;
grant execute on function public.fleet_stops(date, date) to authenticated;

-- 7 · the one door that saves a lorry's crew ----------------------------------
create or replace function public.fleet_confirm_crew(
  p_day date, p_vehicle_id uuid, p_driver_id uuid, p_helper_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row fleet_day_crew;
  v_person uuid;
begin
  if not coalesce((select public.is_operation()), false) then
    raise exception 'Only operation may confirm crew' using errcode = '42501';
  end if;
  if p_day is null or not exists (
    select 1 from partner_fleet f join delivery_partners dp on dp.id = f.partner_id and dp.own_fleet
     where f.id = p_vehicle_id) then
    raise exception 'not a Carres lorry' using errcode = '22023', detail = 'not_own_lorry';
  end if;
  if p_driver_id is not null and not exists (
    select 1 from partner_drivers where id = p_driver_id and role = 'driver' and active) then
    raise exception 'the driver is not an active driver' using errcode = '22023', detail = 'not_a_driver';
  end if;
  if p_helper_id is not null and not exists (
    select 1 from partner_drivers where id = p_helper_id and role = 'helper' and active) then
    raise exception 'the helper is not an active helper' using errcode = '22023', detail = 'not_a_helper';
  end if;
  foreach v_person in array array_remove(array[p_driver_id, p_helper_id], null) loop
    if exists (select 1 from fleet_crew_leave
                where crew_id = v_person and p_day between from_date and to_date) then
      raise exception 'crew member on leave' using errcode = '22023', detail = 'on_leave';
    end if;
    if exists (select 1 from fleet_day_crew
                where day = p_day and vehicle_id <> p_vehicle_id
                  and v_person in (driver_id, helper_id)) then
      raise exception 'crew member already on another lorry' using errcode = '22023', detail = 'already_crewed';
    end if;
  end loop;
  insert into fleet_day_crew (day, vehicle_id, driver_id, helper_id, confirmed_by, confirmed_at)
  values (p_day, p_vehicle_id, p_driver_id, p_helper_id, auth.uid(), now())
  on conflict (day, vehicle_id) do update
     set driver_id = excluded.driver_id, helper_id = excluded.helper_id,
         confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at
  returning * into v_row;
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.fleet_confirm_crew(date, uuid, uuid, uuid) from public, anon;
grant execute on function public.fleet_confirm_crew(date, uuid, uuid, uuid) to authenticated;
