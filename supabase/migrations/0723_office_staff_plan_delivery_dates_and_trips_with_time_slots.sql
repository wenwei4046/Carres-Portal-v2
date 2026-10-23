-- =============================================================================
-- 0723_office_staff_plan_delivery_dates_and_trips_with_time_slots.sql
--
-- WEISIANG'S DECISION (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed by
-- YH 2026-10-23): "I think just clear Carress rules and Implement Houzs inside".
-- Jess was not part of this decision. Office staff plan deliveries the Houzs
-- way (Houzs DeliveryPlanning, DeliveryResidenceRules, DpOrders, AutoSchedule,
-- Trips):
--
--   1 · Regions: an editable state -> region list, each region with how many
--       deliveries it takes a day (Auto-schedule's capacity).
--   2 · Residence rules: one note per building type (Condo, Landed, ...).
--   3 · The arrangement (0386, one row per order + leg) carries the plan:
--       `planned_date`, `stop_seq` and `time_slot`. NO second trip table: a trip
--       is every arrangement on one day with one carrier (a Logistics company,
--       or Carres's own lorry = no company, lorry named in the existing free
--       text `vehicle`). Lorry master lists belong to a later slice.
--   4 · Three doors. `delivery_plan_date` writes a day (Auto-schedule, DP Orders
--       create). Own lorry: the day is Carres's to give, so it is also the
--       scheduled `confirmed_date`. A Logistics company: only `planned_date` is
--       written; the company may still change the day, and its own scheduled
--       date wins. `delivery_plan_stop` sets the stop order and its time slot
--       (Trips). `delivery_plan_cancel` takes a job off its trip with a reason.
--
-- Overturns Jess's Delivery MASTER §8 (no Trips / Regions / Schedule
-- destination), §14.3 (no automatic allocation, ordered stops or dispatch run),
-- §15 (no New DO / dispatch runs) and the §10 research line rejecting mandatory
-- time slots. Unchanged: changing an EXISTING company still goes through
-- `Change logistics` on Monitor with a reason, and a day the company has
-- already agreed is changed on Monitor, never silently here.
-- =============================================================================

set search_path = public;

-- ── 1 · Regions ──────────────────────────────────────────────────────────────

create table if not exists public.delivery_regions (
  state      text primary key check (length(btrim(state)) > 0),
  region     text not null check (length(btrim(region)) > 0),
  per_day    smallint not null default 10 check (per_day between 1 and 500),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

comment on table public.delivery_regions is
  '0723 (Weisiang 2026-10-22, Houzs way): state -> delivery region, and how many deliveries the region takes a day. Office-editable.';

insert into public.delivery_regions (state, region) values
  ('Kuala Lumpur', 'Klang Valley'), ('Selangor', 'Klang Valley'), ('Putrajaya', 'Klang Valley'),
  ('Penang', 'Northern'), ('Perak', 'Northern'), ('Kedah', 'Northern'), ('Perlis', 'Northern'),
  ('Johor', 'Southern'), ('Melaka', 'Southern'), ('Negeri Sembilan', 'Southern'),
  ('Pahang', 'East Coast'), ('Terengganu', 'East Coast'), ('Kelantan', 'East Coast'),
  ('Sabah', 'East Malaysia'), ('Sarawak', 'East Malaysia'), ('Labuan', 'East Malaysia'),
  ('Singapore', 'Singapore')
on conflict (state) do nothing;

-- ── 2 · Residence rules ──────────────────────────────────────────────────────

create table if not exists public.delivery_residence_rules (
  building_type text primary key check (length(btrim(building_type)) > 0),
  note          text not null default '',
  updated_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now()
);

comment on table public.delivery_residence_rules is
  '0723 (Weisiang 2026-10-22, Houzs way): one delivery note per building type, shown on the Delivery Planning board.';

insert into public.delivery_residence_rules (building_type, note) values
  ('Landed', ''),
  ('Condo', 'Half-day slot only. Register driver and lorry with management before the day.'),
  ('Apartment', ''),
  ('Office', ''),
  ('Retail', ''),
  ('Other', '')
on conflict (building_type) do nothing;

-- Internal staff read both; Operation edits them directly.
do $$
declare t text;
begin
  foreach t in array array['delivery_regions', 'delivery_residence_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_internal', t);
    execute format('create policy %I on public.%I for select using ((select public.is_internal()))',
                   t || '_read_internal', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_operation', t);
    execute format('create policy %I on public.%I for all using ((select public.is_operation())) with check ((select public.is_operation()))',
                   t || '_write_operation', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── 3 · The plan rides the arrangement ───────────────────────────────────────

alter table public.ops_delivery_arrangements
  add column if not exists planned_date date,
  add column if not exists stop_seq     smallint,
  add column if not exists time_slot    text;
alter table public.ops_delivery_arrangements
  drop constraint if exists ops_delivery_arrangements_stop_seq_range;
alter table public.ops_delivery_arrangements
  add constraint ops_delivery_arrangements_stop_seq_range check (stop_seq is null or stop_seq between 1 and 999);

comment on column public.ops_delivery_arrangements.planned_date is
  '0723 (Weisiang 2026-10-22): the day office planning gave this delivery. For a Logistics company the company may still change it; its confirmed_date wins.';
comment on column public.ops_delivery_arrangements.stop_seq is
  '0723: this delivery''s place on its trip (trip = one day + one carrier).';
comment on column public.ops_delivery_arrangements.time_slot is
  '0723 (Weisiang 2026-10-22, Houzs way): the trip stop''s time slot, e.g. 09:00-11:00.';

alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_event_check;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_event_check
    check (event in ('assigned', 'changed', 'cleared', 'message_prepared', 'cannot_deliver',
                     'arrangement_saved', 'another_date_requested', 'planned', 'job_cancelled'));

-- The trip day: the scheduled day when there is one, else the planned day.
create or replace function public.delivery_trip_day(a public.ops_delivery_arrangements)
returns date language sql immutable as $$ select coalesce(a.confirmed_date, a.planned_date) $$;

-- ── 4 · The doors ────────────────────────────────────────────────────────────

create or replace function public._delivery_plan_open_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if not exists (select 1 from public.orders o
                  where o.id = p_order_id and o.status in ('place', 'proceed_order')) then
    raise exception 'That order is not waiting for delivery' using errcode = 'P0001', detail = 'order_not_open';
  end if;
end;
$$;
revoke all on function public._delivery_plan_open_order(uuid) from public, anon, authenticated;

create or replace function public.delivery_plan_date(
  p_order_id uuid, p_leg smallint, p_date date,
  p_partner_id uuid default null, p_vehicle text default null, p_time_slot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a        public.ops_delivery_arrangements;
  v_vehicle text := nullif(btrim(coalesce(p_vehicle, '')), '');
  v_slot    text := nullif(btrim(coalesce(p_time_slot, '')), '');
  v_seq     smallint;
begin
  perform public._delivery_plan_open_order(p_order_id);
  if p_date is null then
    raise exception 'Pick a delivery date' using errcode = 'P0001', detail = 'date_required';
  end if;
  if extract(isodow from p_date) = 7 then
    raise exception 'Sunday is not a delivery day' using errcode = 'P0001', detail = 'not_a_delivery_day';
  end if;

  insert into public.ops_delivery_arrangements (order_id, leg) values (p_order_id, coalesce(p_leg, 0))
  on conflict (order_id, leg) do nothing;
  select * into a from public.ops_delivery_arrangements
   where order_id = p_order_id and leg = coalesce(p_leg, 0) for update;

  -- Changing an EXISTING company stays on Monitor (`Change logistics`, with a reason).
  if a.partner_id is not null and p_partner_id is not null and a.partner_id <> p_partner_id then
    raise exception 'This delivery already has a Logistics company. Use Change logistics on Monitor.'
      using errcode = 'P0001', detail = 'change_logistics_on_monitor';
  end if;
  -- A day the company has agreed is changed on Monitor, never silently here.
  if a.partner_id is not null and a.confirmed_date is not null and a.confirmed_date <> p_date then
    raise exception 'The Logistics company has agreed % for this delivery. Change it on Monitor.', a.confirmed_date
      using errcode = 'P0001', detail = 'company_date_agreed';
  end if;

  if a.partner_id is null and p_partner_id is not null then
    insert into public.ops_delivery_arrangement_events
      (arrangement_id, order_id, leg, event, from_partner_id, to_partner_id, recorded_by, source)
    values (a.id, a.order_id, a.leg, 'assigned', null, p_partner_id, auth.uid(), 'operation');
    a.partner_id := p_partner_id;
  end if;

  -- Joining a trip puts the stop last on it.
  if a.stop_seq is null or public.delivery_trip_day(a) is distinct from p_date then
    select coalesce(max(x.stop_seq), 0) + 1 into v_seq
      from public.ops_delivery_arrangements x
     where public.delivery_trip_day(x) = p_date
       and x.id <> a.id
       and x.partner_id is not distinct from a.partner_id
       and (a.partner_id is not null or lower(coalesce(x.vehicle, '')) = lower(coalesce(v_vehicle, a.vehicle, '')));
  else
    v_seq := a.stop_seq;
  end if;

  update public.ops_delivery_arrangements
     set partner_id     = a.partner_id,
         planned_date   = p_date,
         -- Own lorry: Carres gives the day, so it is the scheduled day too.
         confirmed_date = case when a.partner_id is null then p_date else confirmed_date end,
         vehicle        = coalesce(v_vehicle, vehicle),
         time_slot      = coalesce(v_slot, time_slot),
         stop_seq       = v_seq,
         updated_at     = now(),
         updated_by     = auth.uid(),
         updated_via    = 'operation'
   where id = a.id;

  insert into public.ops_delivery_arrangement_events
    (arrangement_id, order_id, leg, event, from_partner_id, note, recorded_by, source)
  values (a.id, a.order_id, a.leg, 'planned', a.partner_id,
          concat_ws(' · ', 'Planned ' || to_char(p_date, 'YYYY-MM-DD'), v_slot, v_vehicle), auth.uid(), 'operation');

  return jsonb_build_object('orderId', a.order_id, 'leg', a.leg, 'date', p_date,
                            'ownLorry', a.partner_id is null, 'stop', v_seq);
end;
$$;

create or replace function public.delivery_plan_stop(
  p_order_id uuid, p_leg smallint, p_seq smallint, p_time_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a      public.ops_delivery_arrangements;
  v_slot text := nullif(btrim(coalesce(p_time_slot, '')), '');
begin
  perform public._delivery_plan_open_order(p_order_id);
  -- Houzs way: every stop on a trip has a time slot.
  if v_slot is null then
    raise exception 'Every stop needs a time slot' using errcode = 'P0001', detail = 'time_slot_required';
  end if;
  if p_seq is null or p_seq < 1 or p_seq > 999 then
    raise exception 'Stop number must be 1 to 999' using errcode = 'P0001', detail = 'bad_stop';
  end if;
  select * into a from public.ops_delivery_arrangements
   where order_id = p_order_id and leg = coalesce(p_leg, 0) for update;
  if not found or public.delivery_trip_day(a) is null then
    raise exception 'This delivery is not on a trip yet. Give it a date first.'
      using errcode = 'P0001', detail = 'not_on_trip';
  end if;
  update public.ops_delivery_arrangements
     set stop_seq = p_seq, time_slot = v_slot,
         updated_at = now(), updated_by = auth.uid(), updated_via = 'operation'
   where id = a.id;
  if a.time_slot is distinct from v_slot then
    insert into public.ops_delivery_arrangement_events
      (arrangement_id, order_id, leg, event, from_partner_id, note, recorded_by, source)
    values (a.id, a.order_id, a.leg, 'planned', a.partner_id,
            concat_ws(' · ', 'Time slot ' || v_slot, 'stop ' || p_seq), auth.uid(), 'operation');
  end if;
  return jsonb_build_object('orderId', a.order_id, 'leg', a.leg, 'stop', p_seq, 'timeSlot', v_slot);
end;
$$;

create or replace function public.delivery_plan_cancel(p_order_id uuid, p_leg smallint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.ops_delivery_arrangements;
  v_day date;
begin
  perform public._delivery_plan_open_order(p_order_id);
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Write the reason' using errcode = 'P0001', detail = 'reason_required';
  end if;
  select * into a from public.ops_delivery_arrangements
   where order_id = p_order_id and leg = coalesce(p_leg, 0) for update;
  v_day := case when found then public.delivery_trip_day(a) end;
  if v_day is null then
    raise exception 'This delivery has no delivery job to cancel' using errcode = 'P0001', detail = 'no_job';
  end if;
  update public.ops_delivery_arrangements
     set confirmed_date = null, confirmed_time = null, planned_date = null,
         stop_seq = null, time_slot = null,
         updated_at = now(), updated_by = auth.uid(), updated_via = 'operation'
   where id = a.id;
  insert into public.ops_delivery_arrangement_events
    (arrangement_id, order_id, leg, event, from_partner_id, note, recorded_by, source)
  values (a.id, a.order_id, a.leg, 'job_cancelled', a.partner_id,
          concat_ws(' · ', to_char(v_day, 'YYYY-MM-DD'), a.time_slot, btrim(p_reason)), auth.uid(), 'operation');
  return jsonb_build_object('orderId', a.order_id, 'leg', a.leg, 'cancelledDay', v_day);
end;
$$;

revoke all on function public.delivery_plan_date(uuid, smallint, date, uuid, text, text) from public, anon;
revoke all on function public.delivery_plan_stop(uuid, smallint, smallint, text) from public, anon;
revoke all on function public.delivery_plan_cancel(uuid, smallint, text) from public, anon;
grant execute on function public.delivery_plan_date(uuid, smallint, date, uuid, text, text) to authenticated;
grant execute on function public.delivery_plan_stop(uuid, smallint, smallint, text) to authenticated;
grant execute on function public.delivery_plan_cancel(uuid, smallint, text) to authenticated;
