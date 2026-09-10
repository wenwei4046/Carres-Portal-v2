-- 0456_the_warehouse_site_states_its_details_hours_and_special_dates.sql
--
-- ⭐ WAREHOUSE SETTINGS — CARD A (`Warehouse Details · Working Hours ·
--    Special Dates`), owner card 2026-09-09. `docs/stock/MASTER.md` §11 names
--    the surface — `Page Header → Settings → Warehouse`, sections `Sites &
--    operators · Warehouse calendar · …` — and §12.13 rules it ADAPT +
--    RESTRICT. Nothing of it was built: the gear's launcher offered Warehouse
--    nothing, and there is no route, no table and no door.
--
-- ---- WHAT WAS MEASURED BEFORE THIS FILE, 2026-09-09 -----------------------
--
--   `warehouses`                 1 row. `Carres Klang`, address
--                                `NETS-managed facility (Klang)`, seeded
--                                2026-05-15. No status, no operator link, no
--                                time zone, no contact.
--   `stock_operating_parties`    15 rows. `nets_warehouse` = `NETS Warehouse`
--                                already exists and is ACTIVE — the operating
--                                organisation is a row, never a hard-code
--                                (Stock MASTER §3: "NETS is not a Site. Site,
--                                operating party and role are separate.").
--   working hours                nothing anywhere. No receiving window, no
--                                collection window, no closure record.
--   `app_users`                  Yu Jun (CR004) and Shasha (CR005) ACTIVE;
--                                Khor Yee (CR003) and Samantha (CR006)
--                                DISABLED (0437 offboarded Khor Yee).
--
-- ---- WHAT THIS FILE REFUSES TO INVENT ------------------------------------
--
--   · No address. The seeded `NETS-managed facility (Klang)` is not an
--     address — it is the OPERATOR, and the operator now has its own column
--     (`operating_party_id`). Carrying the same fact twice is exactly the
--     unowned-record defect `ERP-ARCHITECTURE` Law C exists to stop, so the
--     string is retired from the address column at the moment its real home
--     appears. It is cleared ONLY when it still matches that exact seeded
--     text, so an address a human has since typed is never touched.
--     ⚠️ CONSEQUENCE, stated rather than hidden: `purchasing_destinations`
--     row `Carres Klang` is warehouse-linked and reads its address through
--     this column, so the PO PDF's `Deliver To` prints the site NAME with no
--     address line until an authorised user records the real one in Warehouse
--     Settings. A blank line is honest; an operator description printed as a
--     delivery address is not.
--   · No hours. Not one weekday is seeded, for either activity. Sunday is NOT
--     assumed closed. An unconfigured day has NO ROW and the screen says
--     `Not configured`.
--   · No key contact and no phone number. Carres records no individual NETS
--     Warehouse operator, so the column stays NULL and the screen says
--     `Not assigned`. Yu Jun and Shasha are Carres Operations and are never
--     written here as NETS personnel.
--
--   §1  warehouse_site_profiles  — status · operating organisation · time
--       zone · key contact · contact number, one row per governed Site.
--       Name and address stay on `warehouses`: one record, one owner.
--   §2  warehouse_working_hours  — weekly Receiving and Collection windows,
--       kept apart because they are different acts by different parties.
--   §3  warehouse_special_dates  — a dated exception with a REQUIRED reason.
--       A past Special Date is history and cannot be written.
--   §4  warehouse_setting_changes + the manager gate + the setter doors.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 0 · the governed Site word, and the operator fact leaving the address column
-- ---------------------------------------------------------------------------

-- `Carres Klang Warehouse` is the Stock MASTER §3 `Where` word for this Site.
-- The register, the Monitor and the operator all already say it; only the row
-- said something shorter.
update public.warehouses
   set name = 'Carres Klang Warehouse'
 where id = '00000000-0000-0000-0000-000000000c03'
   and name = 'Carres Klang';

update public.warehouses
   set address = null
 where address = 'NETS-managed facility (Klang)';

-- ---------------------------------------------------------------------------
-- 1 · the Site profile
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_site_profiles (
  site_id uuid primary key references public.warehouses(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed')),
  operating_party_id uuid references public.stock_operating_parties(id),
  time_zone text not null default 'Asia/Kuala_Lumpur',
  key_contact_id uuid references public.app_users(id),
  contact_number text,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

comment on table public.warehouse_site_profiles is
  '0456: the governed Site''s own facts (stock/MASTER.md §11 Sites & operators). `operating_party_id` is an ORGANISATION and `key_contact_id` is a PERSON — separate fields, because Site, operating party and role are separate (§3). Site name and address stay on `warehouses`; this table never duplicates them.';

-- The one existing Site gets its profile with the two facts that ARE verified:
-- it is active, and NETS Warehouse operates it. Everything else stays null.
insert into public.warehouse_site_profiles (site_id, operating_party_id)
select w.id, (select id from public.stock_operating_parties where code = 'nets_warehouse')
  from public.warehouses w
 where not exists (select 1 from public.warehouse_site_profiles p where p.site_id = w.id);

alter table public.warehouse_site_profiles enable row level security;
drop policy if exists warehouse_site_profiles_read on public.warehouse_site_profiles;
create policy warehouse_site_profiles_read on public.warehouse_site_profiles
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_site_profiles from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2 · the weekly working hours
-- ---------------------------------------------------------------------------
-- RECEIVING and COLLECTION are different acts performed by different parties —
-- a supplier or transport bringing goods IN, and an authorised Delivery partner
-- taking goods OUT. One "opening time" cannot answer both, so they are two
-- rows, and either may be closed while the other is open.
--
-- ABSENCE IS THE UNCONFIGURED STATE. No row for (site, weekday, activity) means
-- `Not configured` — never "closed", never "24 hours". `closed = true` is a
-- DECISION somebody recorded and it carries no times.

create table if not exists public.warehouse_working_hours (
  site_id uuid not null references public.warehouses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  activity text not null check (activity in ('receiving', 'collection')),
  closed boolean not null default false,
  opens_at time,
  closes_at time,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  primary key (site_id, weekday, activity),
  constraint warehouse_hours_closed_has_no_times check (
    not closed or (opens_at is null and closes_at is null)
  ),
  constraint warehouse_hours_open_has_both_times check (
    closed or (opens_at is not null and closes_at is not null)
  ),
  constraint warehouse_hours_close_after_open check (
    opens_at is null or closes_at is null or closes_at > opens_at
  )
);

comment on table public.warehouse_working_hours is
  '0456: the weekly Receiving / Collection windows per governed Site (stock/MASTER.md §11 Warehouse calendar). weekday 0=Sunday … 6=Saturday. NO ROW = Not configured; Sunday is not assumed closed. Times are read in the Site''s own time zone.';

alter table public.warehouse_working_hours enable row level security;
drop policy if exists warehouse_working_hours_read on public.warehouse_working_hours;
create policy warehouse_working_hours_read on public.warehouse_working_hours
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_working_hours from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3 · Special Dates
-- ---------------------------------------------------------------------------
-- The word is `Special Dates`, not `Closed Dates` and not `Cut-off`: the record
-- covers a day that differs from the weekly hours in EITHER direction — closed,
-- one activity unavailable, or different hours.

create table if not exists public.warehouse_special_dates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.warehouses(id) on delete cascade,
  on_date date not null,
  kind text not null check (kind in (
    'closed_all_day',
    'receiving_unavailable',
    'collection_unavailable',
    'special_receiving_hours',
    'special_collection_hours'
  )),
  opens_at time,
  closes_at time,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  constraint warehouse_special_hours_need_times check (
    kind not in ('special_receiving_hours', 'special_collection_hours')
    or (opens_at is not null and closes_at is not null and closes_at > opens_at)
  ),
  constraint warehouse_special_unavailable_has_no_times check (
    kind in ('special_receiving_hours', 'special_collection_hours')
    or (opens_at is null and closes_at is null)
  ),
  constraint warehouse_special_date_one_per_kind unique (site_id, on_date, kind)
);

comment on table public.warehouse_special_dates is
  '0456: a dated exception to the weekly hours or the public-holiday policy (stock/MASTER.md §11). Every row carries a REQUIRED reason plus who recorded it and when. A date already past is history: the doors refuse to create or change one.';

create index if not exists warehouse_special_dates_site_date_idx
  on public.warehouse_special_dates (site_id, on_date);

alter table public.warehouse_special_dates enable row level security;
drop policy if exists warehouse_special_dates_read on public.warehouse_special_dates;
create policy warehouse_special_dates_read on public.warehouse_special_dates
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_special_dates from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4 · the change log, the gate and the doors
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_setting_changes (
  id uuid primary key default gen_random_uuid(),
  what text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  actor_id uuid references public.app_users(id),
  changed_at timestamptz not null default now()
);

comment on table public.warehouse_setting_changes is
  '0456: every Warehouse Settings change keeps what changed, the previous value, the new value, the reason where one is required, the actor and the time. Configuration changes are recorded here and never rewrite a completed Inbound, Outbound, Count, Unit history or Month-end record.';

create index if not exists warehouse_setting_changes_what_idx
  on public.warehouse_setting_changes (what, changed_at desc);

alter table public.warehouse_setting_changes enable row level security;
drop policy if exists warehouse_setting_changes_read on public.warehouse_setting_changes;
create policy warehouse_setting_changes_read on public.warehouse_setting_changes
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_setting_changes from authenticated, anon;

/** The same manager authority Purchasing (0303) and Payment (0431) Settings
 *  use: principal, or the `ops_manager` position duty. 0457 WIDENS this with
 *  the explicit `Manage Warehouse Settings` capability — it never narrows it,
 *  so nobody who can set Warehouse configuration today loses it. */
create or replace function public.warehouse_settings_gate()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if v_role = 'principal' then return; end if;
  select coalesce(array_agg(pd.duty_key), '{}'::text[])
    into v_duties
    from app_users u
    join org_position_duties pd on pd.position_id = u.position_id
   where u.id = auth.uid() and u.role <> 'dealer' and u.status = 'active';
  if 'ops_manager' = any(coalesce(v_duties, '{}'::text[])) then return; end if;
  raise exception 'forbidden' using errcode = '42501',
    detail = 'warehouse settings are set by the manager';
end;
$fn$;

/** May the CALLER set Warehouse configuration? The same answer the gate
 *  raises, returned as a fact — so the page never offers a control the server
 *  would refuse. */
create or replace function public.warehouse_can_manage_settings()
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.warehouse_settings_gate();
  return true;
exception when insufficient_privilege then
  return false;
end;
$fn$;

/**
 * `Warehouse Details`. Name and address live on `warehouses`; status,
 * operating organisation, time zone, key contact and contact number live on
 * the profile. One call, because the screen has one `Save changes`.
 *
 * TWO IDENTITY RULES ARE ENFORCED HERE, not merely rendered:
 *   · the operating organisation must be an EXISTING active operating party —
 *     an invented organisation name has nowhere to go;
 *   · a key contact must be an ACTIVE person, and only when it CHANGES. A
 *     contact who is disabled later stays recorded (history is preserved) and
 *     the rest of the page keeps saving; they simply cannot be chosen again.
 */
create or replace function public.warehouse_set_site_details(
  p_site_id uuid,
  p_name text,
  p_address text,
  p_status text,
  p_operating_party_id uuid,
  p_time_zone text,
  p_key_contact_id uuid,
  p_contact_number text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb;
  v_new jsonb;
  v_prev_contact uuid;
begin
  perform public.warehouse_settings_gate();

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'the warehouse site name is required'
      using errcode = '22023', detail = 'site_name_required';
  end if;
  if p_status not in ('active', 'closed') then
    raise exception 'unknown status' using errcode = '22023', detail = 'bad_status';
  end if;
  if nullif(btrim(coalesce(p_time_zone, '')), '') is null then
    raise exception 'the time zone is required'
      using errcode = '22023', detail = 'time_zone_required';
  end if;

  if p_operating_party_id is not null
     and not exists (select 1 from stock_operating_parties
                      where id = p_operating_party_id and active) then
    raise exception 'choose an operating organisation that already exists'
      using errcode = '22023', detail = 'unknown_operating_party';
  end if;

  select key_contact_id into v_prev_contact
    from warehouse_site_profiles where site_id = p_site_id for update;

  if p_key_contact_id is not null
     and p_key_contact_id is distinct from v_prev_contact
     and not exists (select 1 from app_users
                      where id = p_key_contact_id and status = 'active') then
    raise exception 'the key contact must be an active person'
      using errcode = '22023', detail = 'key_contact_not_active';
  end if;

  select jsonb_build_object(
           'name', w.name, 'address', w.address, 'status', p.status,
           'operating_party_id', p.operating_party_id, 'time_zone', p.time_zone,
           'key_contact_id', p.key_contact_id,
           'key_contact_name', (select name from app_users a where a.id = p.key_contact_id),
           'contact_number', p.contact_number)
    into v_old
    from warehouses w
    left join warehouse_site_profiles p on p.site_id = w.id
   where w.id = p_site_id;
  if v_old is null then
    raise exception 'unknown warehouse site' using errcode = '22023', detail = 'unknown_site';
  end if;

  update warehouses
     set name = btrim(p_name),
         address = nullif(btrim(coalesce(p_address, '')), '')
   where id = p_site_id;

  insert into warehouse_site_profiles as p
    (site_id, status, operating_party_id, time_zone, key_contact_id,
     contact_number, updated_by, updated_at)
  values
    (p_site_id, p_status, p_operating_party_id, btrim(p_time_zone), p_key_contact_id,
     nullif(btrim(coalesce(p_contact_number, '')), ''), auth.uid(), now())
  on conflict (site_id) do update
     set status = excluded.status,
         operating_party_id = excluded.operating_party_id,
         time_zone = excluded.time_zone,
         key_contact_id = excluded.key_contact_id,
         contact_number = excluded.contact_number,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at;

  select jsonb_build_object(
           'name', w.name, 'address', w.address, 'status', p.status,
           'operating_party_id', p.operating_party_id, 'time_zone', p.time_zone,
           'key_contact_id', p.key_contact_id,
           'key_contact_name', (select name from app_users a where a.id = p.key_contact_id),
           'contact_number', p.contact_number)
    into v_new
    from warehouses w
    join warehouse_site_profiles p on p.site_id = w.id
   where w.id = p_site_id;

  if v_new is distinct from v_old then
    insert into warehouse_setting_changes (what, old_value, new_value, actor_id)
    values ('site_details:' || p_site_id::text, v_old, v_new, auth.uid());
  end if;
  return v_new;
end;
$fn$;

/**
 * `Working Hours` — the whole week for one Site, replaced in one transaction,
 * because the screen edits a seven-row table under one `Save changes`.
 *
 * `p_rows` is `[{ weekday, activity, closed, opensAt, closesAt }, …]`. A day
 * and activity ABSENT from the payload is cleared — that is how the screen's
 * `Clear` removes a configured window and returns the cell to
 * `Not configured`.
 */
create or replace function public.warehouse_set_working_hours(
  p_site_id uuid,
  p_rows jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb;
  v_new jsonb;
  r record;
begin
  perform public.warehouse_settings_gate();
  if not exists (select 1 from warehouses where id = p_site_id) then
    raise exception 'unknown warehouse site' using errcode = '22023', detail = 'unknown_site';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'the working hours must be a list'
      using errcode = '22023', detail = 'rows_not_a_list';
  end if;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.weekday, h.activity), '[]'::jsonb)
    into v_old from warehouse_working_hours h where h.site_id = p_site_id;

  delete from warehouse_working_hours where site_id = p_site_id;

  for r in
    select (e->>'weekday')::int as weekday,
           e->>'activity' as activity,
           coalesce((e->>'closed')::boolean, false) as closed,
           nullif(e->>'opensAt', '')::time as opens_at,
           nullif(e->>'closesAt', '')::time as closes_at
      from jsonb_array_elements(p_rows) e
  loop
    if r.weekday is null or r.weekday < 0 or r.weekday > 6 then
      raise exception 'unknown day' using errcode = '22023', detail = 'bad_weekday';
    end if;
    if r.activity not in ('receiving', 'collection') then
      raise exception 'unknown activity' using errcode = '22023', detail = 'bad_activity';
    end if;
    if not r.closed and (r.opens_at is null or r.closes_at is null) then
      raise exception 'give both an opening and a closing time'
        using errcode = '22023', detail = 'times_incomplete';
    end if;
    if not r.closed and r.closes_at <= r.opens_at then
      raise exception 'the closing time must be later than the opening time'
        using errcode = '22023', detail = 'closes_before_opens';
    end if;
    insert into warehouse_working_hours
      (site_id, weekday, activity, closed, opens_at, closes_at, updated_by, updated_at)
    values
      (p_site_id, r.weekday, r.activity, r.closed,
       case when r.closed then null else r.opens_at end,
       case when r.closed then null else r.closes_at end,
       auth.uid(), now());
  end loop;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.weekday, h.activity), '[]'::jsonb)
    into v_new from warehouse_working_hours h where h.site_id = p_site_id;

  if v_new is distinct from v_old then
    insert into warehouse_setting_changes (what, old_value, new_value, actor_id)
    values ('working_hours:' || p_site_id::text, v_old, v_new, auth.uid());
  end if;
  return v_new;
end;
$fn$;

/**
 * One `Special Date`. `p_id` null creates; a `p_id` updates — and only while
 * the date is still ahead. A Special Date whose day has passed is what the
 * Warehouse actually did; it is read-only history, and so is a change that
 * would move a record ONTO a past date.
 */
create or replace function public.warehouse_save_special_date(
  p_id uuid,
  p_site_id uuid,
  p_on_date date,
  p_kind text,
  p_opens_at time,
  p_closes_at time,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old public.warehouse_special_dates;
  v_new public.warehouse_special_dates;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  perform public.warehouse_settings_gate();

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'say why this date is different'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if p_on_date is null or p_on_date < v_today then
    raise exception 'a Special Date that has passed is history and cannot be changed'
      using errcode = '22023', detail = 'special_date_in_the_past';
  end if;
  if p_kind not in ('closed_all_day', 'receiving_unavailable', 'collection_unavailable',
                    'special_receiving_hours', 'special_collection_hours') then
    raise exception 'unknown kind of Special Date'
      using errcode = '22023', detail = 'bad_kind';
  end if;
  if p_kind in ('special_receiving_hours', 'special_collection_hours') then
    if p_opens_at is null or p_closes_at is null then
      raise exception 'give both an opening and a closing time'
        using errcode = '22023', detail = 'times_incomplete';
    end if;
    if p_closes_at <= p_opens_at then
      raise exception 'the closing time must be later than the opening time'
        using errcode = '22023', detail = 'closes_before_opens';
    end if;
  end if;
  if not exists (select 1 from warehouses where id = p_site_id) then
    raise exception 'unknown warehouse site' using errcode = '22023', detail = 'unknown_site';
  end if;

  if p_id is not null then
    select * into v_old from warehouse_special_dates where id = p_id for update;
    if not found then
      raise exception 'that Special Date is not on record'
        using errcode = '22023', detail = 'unknown_special_date';
    end if;
    if v_old.on_date < v_today then
      raise exception 'a Special Date that has passed is history and cannot be changed'
        using errcode = '22023', detail = 'special_date_in_the_past';
    end if;
    update warehouse_special_dates
       set site_id = p_site_id, on_date = p_on_date, kind = p_kind,
           opens_at = case when p_kind in ('special_receiving_hours', 'special_collection_hours')
                           then p_opens_at else null end,
           closes_at = case when p_kind in ('special_receiving_hours', 'special_collection_hours')
                            then p_closes_at else null end,
           reason = btrim(p_reason), updated_by = auth.uid(), updated_at = now()
     where id = p_id
     returning * into v_new;
  else
    insert into warehouse_special_dates
      (site_id, on_date, kind, opens_at, closes_at, reason, created_by, updated_by)
    values
      (p_site_id, p_on_date, p_kind,
       case when p_kind in ('special_receiving_hours', 'special_collection_hours')
            then p_opens_at else null end,
       case when p_kind in ('special_receiving_hours', 'special_collection_hours')
            then p_closes_at else null end,
       btrim(p_reason), auth.uid(), auth.uid())
    returning * into v_new;
  end if;

  insert into warehouse_setting_changes (what, old_value, new_value, reason, actor_id)
  values ('special_date:' || v_new.id::text, to_jsonb(v_old), to_jsonb(v_new),
          btrim(p_reason), auth.uid());
  return to_jsonb(v_new);
end;
$fn$;

grant execute on function public.warehouse_can_manage_settings() to authenticated;
grant execute on function public.warehouse_set_site_details(uuid, text, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function public.warehouse_set_working_hours(uuid, jsonb) to authenticated;
grant execute on function public.warehouse_save_special_date(uuid, uuid, date, text, time, time, text) to authenticated;

-- ---------------------------------------------------------------------------
-- sanity — this file OWNS schema. It asserts no production row count.
-- ---------------------------------------------------------------------------
do $sanity$
declare
  v_n int;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'warehouse_site_profiles') then
    raise exception '0456 sanity: warehouse_site_profiles is missing';
  end if;

  -- every governed Site has exactly one profile
  select count(*) into v_n
    from public.warehouses w
   where not exists (select 1 from public.warehouse_site_profiles p where p.site_id = w.id);
  if v_n > 0 then
    raise exception '0456 sanity: % site(s) have no profile row', v_n;
  end if;

  -- NOT ONE working hour is seeded: Sunday is not assumed closed
  select count(*) into v_n from public.warehouse_working_hours;
  if v_n > 0 then
    raise exception '0456 sanity: % working-hour row(s) were seeded; none may be', v_n;
  end if;

  -- the writers are gated, never open through PostgREST
  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('warehouse_site_profiles', 'warehouse_working_hours',
                        'warehouse_special_dates', 'warehouse_setting_changes')
     and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_n > 0 then
    raise exception '0456 sanity: % direct write grant(s) survive on the settings tables', v_n;
  end if;

  raise notice '0456 OK — the Site states its own details, the week is empty until somebody configures it, and every writer is gated.';
end
$sanity$;

commit;
