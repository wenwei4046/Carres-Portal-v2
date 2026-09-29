-- Workspace §4.4, owner-approved 2026-09-29. Additive persistence foundation.
-- No reassignment or attendance finding is enabled by applying this migration.
create table public.workspace_activity_settings (
  id smallint primary key default 1 check (id = 1),
  morning time not null default '10:30' check (morning > time '10:00' and morning < time '13:00' and extract(second from morning) = 0),
  afternoon time not null default '15:00' check (afternoon > time '14:00' and afternoon < time '18:00' and extract(second from afternoon) = 0),
  revision bigint not null default 1,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id)
);
insert into public.workspace_activity_settings(id) values (1);

create table public.workspace_activity_setting_changes (
  id bigint generated always as identity primary key,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.app_users(id)
);
create table public.workspace_activity_events (
  user_id uuid not null references public.app_users(id),
  minute_at timestamptz not null,
  observed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, minute_at)
);
create index workspace_activity_events_time on public.workspace_activity_events(observed_at, user_id);

alter table public.workspace_activity_settings enable row level security;
alter table public.workspace_activity_setting_changes enable row level security;
alter table public.workspace_activity_events enable row level security;
revoke all on public.workspace_activity_settings, public.workspace_activity_setting_changes,
  public.workspace_activity_events from public, anon, authenticated;
grant select on public.workspace_activity_settings to authenticated;
create policy workspace_activity_settings_read on public.workspace_activity_settings
  for select to authenticated using ((select public.app_role()) in ('operation', 'principal'));
-- History/activity have no direct authenticated read or write grant. Dedicated
-- doors retain manager/self scope; the service scheduler reads via service_role.
grant all on public.workspace_activity_settings, public.workspace_activity_setting_changes,
  public.workspace_activity_events to service_role;
grant usage, select on sequence public.workspace_activity_setting_changes_id_seq to service_role;

create function public.workspace_set_activity_times(p_morning time, p_afternoon time, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before public.workspace_activity_settings; v_after public.workspace_activity_settings;
begin
  perform public.workspace_duty_settings_gate();
  if p_morning is null or p_afternoon is null or p_revision is null
     or p_morning <= time '10:00' or p_morning >= time '13:00'
     or p_afternoon <= time '14:00' or p_afternoon >= time '18:00'
     or extract(second from p_morning) <> 0 or extract(second from p_afternoon) <> 0 then
    raise exception 'invalid check times' using errcode = '22023', detail = 'invalid_check_times';
  end if;
  select * into strict v_before from public.workspace_activity_settings where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;
  if v_before.morning = p_morning and v_before.afternoon = p_afternoon then
    return to_jsonb(v_before);
  end if;
  update public.workspace_activity_settings
     set morning = p_morning, afternoon = p_afternoon, revision = revision + 1,
         changed_at = clock_timestamp(), changed_by = auth.uid()
   where id = 1 returning * into v_after;
  insert into public.workspace_activity_setting_changes(previous_values,new_values,changed_by)
    values (to_jsonb(v_before),to_jsonb(v_after),auth.uid());
  return to_jsonb(v_after);
end;
$$;
revoke all on function public.workspace_set_activity_times(time,time,bigint) from public, anon;
grant execute on function public.workspace_set_activity_times(time,time,bigint) to authenticated;

create function public._workspace_record_activity_at(p_now timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz := p_now; v_clock time := timezone('Asia/Kuala_Lumpur',v_now)::time;
begin
  if not exists (select 1 from public.app_users u where u.id = auth.uid()
     and u.status = 'active' and u.is_person and u.role in ('operation','principal')) then
    raise exception 'active Operation person required' using errcode = '42501', detail = 'not_operation_person';
  end if;
  -- Lunch/overnight traffic cannot populate a work-period event.
  if not ((v_clock >= time '09:00' and v_clock < time '13:00')
      or (v_clock >= time '14:00' and v_clock <= time '19:00')) then return; end if;
  insert into public.workspace_activity_events(user_id,minute_at,observed_at)
    values(auth.uid(),date_trunc('minute',v_now),v_now)
    on conflict(user_id,minute_at) do nothing;
end;
$$;
revoke all on function public._workspace_record_activity_at(timestamptz) from public, anon, authenticated;
create function public.workspace_record_activity()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._workspace_record_activity_at(clock_timestamp());
end;
$$;
revoke all on function public.workspace_record_activity() from public, anon;
grant execute on function public.workspace_record_activity() to authenticated;
