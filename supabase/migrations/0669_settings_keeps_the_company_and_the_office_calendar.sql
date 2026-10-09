-- 0669 — Settings → Company and Settings → Office: the one stored company
-- identity and the one stored Office calendar, each with its change record.
--
-- Owner rules (Carres Settings List, confirmed 9 Oct 2026):
--   COM-01  legal identity — CARRES SDN. BHD. · former CARRESS SDN. BHD. ·
--           SSM 202401055306 (1601150-X) · registered address (owner's
--           letterhead screenshot). Values not supplied stay empty, never guessed.
--   COM-02  customer support identity — Carres Support Team · 011-6133 8862.
--   OFF-01  Office working weekdays Monday–Friday (Saturday on-call is a
--           separate Staff & Duties rota and never makes Saturday an Office day).
--   OFF-02  standard hours 9:00 AM–6:00 PM · OFF-03 one-hour flexi ·
--   OFF-04  lunch 13:00–14:00, may shift one hour.
--   OFF-05  Office public holidays — Kuala Lumpur. Until an editor records a
--           year, the built-in list stays in force for that year (the app says
--           so); no Kuala Lumpur date is invented here, so the table starts empty.
--   TEAM-02 / SET-01  Jess, or a person she names for that section (0667),
--           edits; every change keeps who · when · old → new · reason.
--           A reason is optional for Company (a compulsory reason is NOT
--           confirmed) and kept when given.
--
-- Every write goes through the definer doors below, behind settings_can_edit.
-- The company identity is not secret: every signed-in account may read it,
-- because every printed document carries it.

-- ── The one change record for the Settings sections this migration adds ──
create table if not exists public.settings_changes (
  id          bigint generated always as identity primary key,
  section     text not null check (section in ('company', 'office', 'sales_orders')),
  what        text not null,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  actor_id    uuid not null references public.app_users(id),
  changed_at  timestamptz not null default now()
);
create index if not exists settings_changes_section_time
  on public.settings_changes (section, changed_at desc);

-- ── Company (COM-01 · COM-02) ─────────────────────────────────────────────
create table if not exists public.company_profile (
  id                smallint primary key default 1 check (id = 1),
  legal_name        text not null check (btrim(legal_name) <> ''),
  former_name       text,
  registration_no   text not null check (btrim(registration_no) <> ''),
  address_line1     text,
  address_line2     text,
  address_line3     text,
  postcode          text,
  city              text,
  country           text,
  company_phone     text,
  company_email     text,
  support_name      text,
  support_phone     text,
  support_whatsapp  text,
  support_email     text,
  revision          bigint not null default 1,
  changed_at        timestamptz not null default now(),
  changed_by        uuid references public.app_users(id)
);

insert into public.company_profile (
  id, legal_name, former_name, registration_no,
  address_line1, address_line2, address_line3, postcode, city,
  support_name, support_phone
) values (
  1, 'CARRES SDN. BHD.', 'CARRESS SDN. BHD.', '202401055306 (1601150-X)',
  'E-28-02 & E-28-03, MENARA SUEZCAP 2', 'KL GATEWAY, NO. 2, JALAN KERINCHI',
  'GERBANG KERINCHI LESTARI', '59200', 'KUALA LUMPUR',
  'Carres Support Team', '011-6133 8862'
) on conflict (id) do nothing;

-- ── Office (OFF-01 … OFF-04) ──────────────────────────────────────────────
create table if not exists public.office_calendar (
  id                   smallint primary key default 1 check (id = 1),
  work_days            smallint[] not null default '{1,2,3,4,5}'
                         check (cardinality(work_days) between 1 and 7
                                and work_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  start_time           time not null default '09:00',
  end_time             time not null default '18:00',
  flexi_minutes        integer not null default 60 check (flexi_minutes between 0 and 180),
  lunch_start          time not null default '13:00',
  lunch_end            time not null default '14:00',
  lunch_shift_minutes  integer not null default 60 check (lunch_shift_minutes between 0 and 120),
  holiday_region       text not null default 'Kuala Lumpur' check (btrim(holiday_region) <> ''),
  revision             bigint not null default 1,
  changed_at           timestamptz not null default now(),
  changed_by           uuid references public.app_users(id),
  constraint office_calendar_hours check (start_time < end_time),
  constraint office_calendar_lunch check (lunch_start < lunch_end
    and lunch_start >= start_time and lunch_end <= end_time)
);
insert into public.office_calendar (id) values (1) on conflict (id) do nothing;

-- ── Office public holidays (OFF-05) ───────────────────────────────────────
create table if not exists public.office_holidays (
  holiday_date  date primary key,
  name          text not null check (btrim(name) <> ''),
  added_by      uuid not null references public.app_users(id),
  added_at      timestamptz not null default now()
);

-- ── Read access ────────────────────────────────────────────────────────────
alter table public.settings_changes enable row level security;
alter table public.company_profile  enable row level security;
alter table public.office_calendar  enable row level security;
alter table public.office_holidays  enable row level security;

revoke all on public.settings_changes, public.company_profile,
  public.office_calendar, public.office_holidays from public, anon, authenticated;
grant select on public.company_profile, public.office_calendar,
  public.office_holidays, public.settings_changes to authenticated;
grant all on public.settings_changes, public.company_profile,
  public.office_calendar, public.office_holidays to service_role;

drop policy if exists company_profile_read on public.company_profile;
create policy company_profile_read on public.company_profile
  for select to authenticated using (true);
drop policy if exists office_calendar_read on public.office_calendar;
create policy office_calendar_read on public.office_calendar
  for select to authenticated using ((select public.is_internal()));
drop policy if exists office_holidays_read on public.office_holidays;
create policy office_holidays_read on public.office_holidays
  for select to authenticated using ((select public.is_internal()));
drop policy if exists settings_changes_read on public.settings_changes;
create policy settings_changes_read on public.settings_changes
  for select to authenticated using ((select public.is_internal()));

-- ── The gate every door below calls ───────────────────────────────────────
create or replace function public._settings_require_editor(p_section text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.settings_can_edit(p_section), false) then
    raise exception 'only Jess or a person she names may change these settings'
      using errcode = '42501', detail = 'not_settings_editor';
  end if;
end;
$fn$;
revoke all on function public._settings_require_editor(text) from public, anon, authenticated;

-- ── Company door ───────────────────────────────────────────────────────────
-- p_values carries every field the page shows; a blank optional field is
-- stored as null (Not recorded). Only the fields that changed reach history.
create or replace function public.settings_save_company_profile(
  p_values jsonb, p_revision bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before public.company_profile;
  v_after  public.company_profile;
  v_fields text[] := array['legal_name','former_name','registration_no','address_line1',
    'address_line2','address_line3','postcode','city','country','company_phone',
    'company_email','support_name','support_phone','support_whatsapp','support_email'];
  v_field  text;
  v_old    jsonb := '{}'::jsonb;
  v_new    jsonb := '{}'::jsonb;
  v_next   jsonb;
begin
  perform public._settings_require_editor('company');
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_revision is null then
    raise exception 'company values are required' using errcode = '22023', detail = 'invalid_company';
  end if;
  select * into strict v_before from public.company_profile where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;

  v_next := to_jsonb(v_before);
  foreach v_field in array v_fields loop
    if p_values ? v_field then
      v_next := jsonb_set(v_next, array[v_field],
        coalesce(to_jsonb(nullif(btrim(p_values ->> v_field), '')), 'null'::jsonb));
    end if;
    if (v_next -> v_field) is distinct from (to_jsonb(v_before) -> v_field) then
      v_old := v_old || jsonb_build_object(v_field, to_jsonb(v_before) -> v_field);
      v_new := v_new || jsonb_build_object(v_field, v_next -> v_field);
    end if;
  end loop;

  if coalesce(v_next ->> 'legal_name', '') = '' then
    raise exception 'the legal company name is required' using errcode = '22023', detail = 'legal_name_required';
  end if;
  if coalesce(v_next ->> 'registration_no', '') = '' then
    raise exception 'the SSM registration number is required' using errcode = '22023', detail = 'registration_no_required';
  end if;
  if v_new = '{}'::jsonb then
    return to_jsonb(v_before);
  end if;

  update public.company_profile set
    legal_name       = v_next ->> 'legal_name',
    former_name      = v_next ->> 'former_name',
    registration_no  = v_next ->> 'registration_no',
    address_line1    = v_next ->> 'address_line1',
    address_line2    = v_next ->> 'address_line2',
    address_line3    = v_next ->> 'address_line3',
    postcode         = v_next ->> 'postcode',
    city             = v_next ->> 'city',
    country          = v_next ->> 'country',
    company_phone    = v_next ->> 'company_phone',
    company_email    = v_next ->> 'company_email',
    support_name     = v_next ->> 'support_name',
    support_phone    = v_next ->> 'support_phone',
    support_whatsapp = v_next ->> 'support_whatsapp',
    support_email    = v_next ->> 'support_email',
    revision         = revision + 1,
    changed_at       = clock_timestamp(),
    changed_by       = auth.uid()
  where id = 1
  returning * into v_after;

  insert into public.settings_changes (section, what, old_value, new_value, reason, actor_id)
  values ('company', 'company_profile', v_old, v_new, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
  return to_jsonb(v_after);
end;
$fn$;

-- ── Office calendar door (OFF-01 … OFF-04) ────────────────────────────────
create or replace function public.settings_save_office_calendar(
  p_values jsonb, p_revision bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before public.office_calendar;
  v_next   public.office_calendar;
  v_after  public.office_calendar;
  v_old    jsonb := '{}'::jsonb;
  v_new    jsonb := '{}'::jsonb;
  v_field  text;
begin
  perform public._settings_require_editor('office');
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_revision is null then
    raise exception 'office values are required' using errcode = '22023', detail = 'invalid_office';
  end if;
  select * into strict v_before from public.office_calendar where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;

  v_next := v_before;
  begin
    if p_values ? 'work_days' then
      select coalesce(array_agg(distinct d::smallint order by d::smallint), '{}')
        into v_next.work_days
        from jsonb_array_elements_text(p_values -> 'work_days') d;
    end if;
    v_next.start_time          := coalesce((p_values ->> 'start_time')::time, v_before.start_time);
    v_next.end_time            := coalesce((p_values ->> 'end_time')::time, v_before.end_time);
    v_next.flexi_minutes       := coalesce((p_values ->> 'flexi_minutes')::integer, v_before.flexi_minutes);
    v_next.lunch_start         := coalesce((p_values ->> 'lunch_start')::time, v_before.lunch_start);
    v_next.lunch_end           := coalesce((p_values ->> 'lunch_end')::time, v_before.lunch_end);
    v_next.lunch_shift_minutes := coalesce((p_values ->> 'lunch_shift_minutes')::integer, v_before.lunch_shift_minutes);
    v_next.holiday_region      := coalesce(nullif(btrim(p_values ->> 'holiday_region'), ''), v_before.holiday_region);
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation
                 or numeric_value_out_of_range then
    raise exception 'these office hours are not readable' using errcode = '22023', detail = 'invalid_office';
  end;

  foreach v_field in array array['work_days','start_time','end_time','flexi_minutes',
      'lunch_start','lunch_end','lunch_shift_minutes','holiday_region'] loop
    if (to_jsonb(v_next) -> v_field) is distinct from (to_jsonb(v_before) -> v_field) then
      v_old := v_old || jsonb_build_object(v_field, to_jsonb(v_before) -> v_field);
      v_new := v_new || jsonb_build_object(v_field, to_jsonb(v_next) -> v_field);
    end if;
  end loop;
  if v_new = '{}'::jsonb then
    return to_jsonb(v_before);
  end if;

  begin
    update public.office_calendar set
      work_days           = v_next.work_days,
      start_time          = v_next.start_time,
      end_time            = v_next.end_time,
      flexi_minutes       = v_next.flexi_minutes,
      lunch_start         = v_next.lunch_start,
      lunch_end           = v_next.lunch_end,
      lunch_shift_minutes = v_next.lunch_shift_minutes,
      holiday_region      = v_next.holiday_region,
      revision            = revision + 1,
      changed_at          = clock_timestamp(),
      changed_by          = auth.uid()
    where id = 1
    returning * into v_after;
  exception when check_violation then
    raise exception 'these office hours do not fit together' using errcode = '22023', detail = 'invalid_office';
  end;

  insert into public.settings_changes (section, what, old_value, new_value, reason, actor_id)
  values ('office', 'office_calendar', v_old, v_new, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
  return to_jsonb(v_after);
end;
$fn$;

-- ── Office holidays door (OFF-05): one year's list replaces that year ──────
-- p_holidays = [{ "date": "YYYY-MM-DD", "name": "…" }, …], every date inside
-- p_year. Recording an empty list for a year returns that year to the
-- built-in list (the app shows which list is in force).
create or replace function public.settings_save_office_holidays(
  p_year integer, p_holidays jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rows jsonb;
  v_old  jsonb;
  v_new  jsonb;
  v_bad  integer;
begin
  perform public._settings_require_editor('office');
  if p_year is null or p_year < 2024 or p_year > 2100
     or p_holidays is null or jsonb_typeof(p_holidays) <> 'array' then
    raise exception 'a year and its holidays are required' using errcode = '22023', detail = 'invalid_holidays';
  end if;

  -- Every element must carry a real date inside p_year and a name.
  begin
    select coalesce(jsonb_agg(jsonb_build_object('date', d, 'name', n) order by d), '[]'::jsonb),
           count(*) filter (where d is null or n is null or n = '' or extract(year from d) <> p_year)
      into v_rows, v_bad
      from (select (h ->> 'date')::date as d, btrim(h ->> 'name') as n
              from jsonb_array_elements(p_holidays) h) x;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    raise exception 'a holiday date is not a real date' using errcode = '22023', detail = 'invalid_holidays';
  end;
  if v_bad > 0 then
    raise exception 'every holiday needs a date in % and a name', p_year
      using errcode = '22023', detail = 'invalid_holidays';
  end if;
  if (select count(*) from jsonb_array_elements(v_rows))
     <> (select count(distinct e ->> 'date') from jsonb_array_elements(v_rows) e) then
    raise exception 'a date is listed twice' using errcode = '22023', detail = 'duplicate_holiday';
  end if;
  v_new := v_rows;

  select coalesce(jsonb_agg(jsonb_build_object('date', holiday_date, 'name', name) order by holiday_date), '[]'::jsonb)
    into v_old
    from public.office_holidays
   where extract(year from holiday_date) = p_year;

  if v_old = v_new then
    return jsonb_build_object('year', p_year, 'holidays', v_new);
  end if;

  delete from public.office_holidays where extract(year from holiday_date) = p_year;
  insert into public.office_holidays (holiday_date, name, added_by)
  select (e ->> 'date')::date, e ->> 'name', auth.uid() from jsonb_array_elements(v_new) e;

  insert into public.settings_changes (section, what, old_value, new_value, reason, actor_id)
  values ('office', 'office_holidays:' || p_year, v_old, v_new,
          nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
  return jsonb_build_object('year', p_year, 'holidays', v_new);
end;
$fn$;

revoke all on function public.settings_save_company_profile(jsonb, bigint, text) from public, anon;
revoke all on function public.settings_save_office_calendar(jsonb, bigint, text) from public, anon;
revoke all on function public.settings_save_office_holidays(integer, jsonb, text) from public, anon;
grant execute on function public.settings_save_company_profile(jsonb, bigint, text) to authenticated;
grant execute on function public.settings_save_office_calendar(jsonb, bigint, text) to authenticated;
grant execute on function public.settings_save_office_holidays(integer, jsonb, text) to authenticated;
