-- 0457_the_warehouse_keeps_a_holiday_policy_a_calendar_and_its_access.sql
--
-- ⭐ WAREHOUSE SETTINGS — CARD B (`Public Holidays · Access`), owner card
--    2026-09-09, continuing 0456. `docs/stock/MASTER.md` §11 places both here:
--    the Warehouse calendar maintains "public/partner closed dates", and
--    `Permissions & approvals` rules that "capability follows role/duty, never
--    a hard-coded email".
--
-- ---- THE HOLIDAY SOURCE, MEASURED AND REFUSED -----------------------------
--
-- The repository DOES already carry Malaysian holiday dates:
-- `packages/shared/src/my-holidays.ts` (2026-07-21), which the working-day
-- engine injects for procurement date maths. Its own header disqualifies it as
-- an authority for Warehouse availability:
--
--     "⚠️ THIS IS A STARTER LIST — VERIFY AGAINST THE OFFICIAL SELANGOR
--      GAZETTE … certain:false = Islamic (Hijri) / lunar / Hindu dates that
--      shift with moon sighting each year — CONFIRM the exact date."
--
-- Eleven of its eighteen 2026 rows are marked unverified. A warehouse that
-- refuses a supplier's lorry needs a date somebody actually checked, so this
-- file builds the BOUNDARY and imports NOTHING:
--
--   · no holiday date is seeded, invented or copied from that starter list;
--   · every imported date belongs to a VERSIONED calendar that names its
--     source, its reference and when it was verified, by whom;
--   · until an authorised person imports one, the page says
--     `Public-holiday policy    Not configured` and the schedule resolver has
--     no holiday to apply. Absence is stated, never filled in.
--
-- ⚠️ THERE IS NO AUTOMATIC OFFICIAL-CALENDAR SYNC IN THIS FILE, and nothing on
--    the screen claims one. `warehouse_import_holiday_calendar` is an
--    authenticated, audited, versioned import a person performs; a scheduled
--    fetch from an official machine-readable Malaysian source is NOT
--    implemented, because no such source has been verified and approved.
--
-- ---- ACCESS ---------------------------------------------------------------
--
--   · the four capabilities are the card's four, verbatim;
--   · a grant may only name an ACTIVE person, so Khor Yee (disabled, 0437) and
--     Samantha (disabled) cannot receive one;
--   · NOBODY is seeded a grant. Yu Jun and Shasha are not assigned anything —
--     `manage_warehouse_settings` merely WIDENS the 0456 manager gate, so the
--     people who could already set Warehouse configuration still can and no
--     new person silently gained anything;
--   · a revoked grant is kept, not deleted: the audit must still say who held
--     what and when.
--
--   §1  warehouse_holiday_policies    — one saved policy per Site, or nothing
--   §2  warehouse_holiday_calendars   — the versioned, sourced import boundary
--   §3  warehouse_holiday_dates       — its dated rows, observed flag included
--   §4  warehouse_capabilities        — the four capability keys
--   §5  warehouse_capability_grants   — active-person-only, revocable, kept
--   §6  the widened settings gate and the doors
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · the public-holiday policy — ABSENT until somebody saves one
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_holiday_policies (
  site_id uuid primary key references public.warehouses(id) on delete cascade,
  follow_public_holidays boolean not null,
  country text not null,
  state text,
  observe_replacement boolean not null default false,
  default_availability text not null check (default_availability in
    ('closed', 'receiving_only', 'collection_only', 'normal', 'special')),
  special_opens_at time,
  special_closes_at time,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  constraint warehouse_holiday_special_needs_times check (
    default_availability <> 'special'
    or (special_opens_at is not null and special_closes_at is not null
        and special_closes_at > special_opens_at)
  ),
  constraint warehouse_holiday_non_special_has_no_times check (
    default_availability = 'special'
    or (special_opens_at is null and special_closes_at is null)
  )
);

comment on table public.warehouse_holiday_policies is
  '0457: the Site''s public-holiday policy (stock/MASTER.md §11 Warehouse calendar). NO ROW = `Not configured`. The Warehouse is never ASSUMED to close on a public holiday — `default_availability` is whatever an authorised person recorded.';

alter table public.warehouse_holiday_policies enable row level security;
drop policy if exists warehouse_holiday_policies_read on public.warehouse_holiday_policies;
create policy warehouse_holiday_policies_read on public.warehouse_holiday_policies
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_holiday_policies from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2 · the versioned holiday-calendar boundary
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  state text,
  version int not null,
  source_name text not null check (length(btrim(source_name)) > 0),
  source_reference text not null check (length(btrim(source_reference)) > 0),
  verified_at timestamptz not null,
  imported_by uuid references public.app_users(id),
  imported_at timestamptz not null default now(),
  active boolean not null default true
);

comment on table public.warehouse_holiday_calendars is
  '0457: one imported holiday calendar version for a country (and state). It names its SOURCE, its REFERENCE and when it was VERIFIED, so a date on a screen can always be traced to a document a person checked. Imports are stored locally — Warehouse availability never makes a live external request.';

create unique index if not exists warehouse_holiday_calendar_version_idx
  on public.warehouse_holiday_calendars (country, coalesce(state, ''), version);
create index if not exists warehouse_holiday_calendar_active_idx
  on public.warehouse_holiday_calendars (country, coalesce(state, ''), active, version desc);

alter table public.warehouse_holiday_calendars enable row level security;
drop policy if exists warehouse_holiday_calendars_read on public.warehouse_holiday_calendars;
create policy warehouse_holiday_calendars_read on public.warehouse_holiday_calendars
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_holiday_calendars from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3 · its dates. NOT ONE ROW IS SEEDED.
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_holiday_dates (
  calendar_id uuid not null references public.warehouse_holiday_calendars(id) on delete cascade,
  on_date date not null,
  name text not null check (length(btrim(name)) > 0),
  observed boolean not null default false,
  primary key (calendar_id, on_date, name)
);

comment on table public.warehouse_holiday_dates is
  '0457: the dates of one imported calendar version. `observed` marks a replacement/observed day (a holiday falling on a rest day and moved). Ships EMPTY — no date is invented, and the starter list in packages/shared/src/my-holidays.ts is deliberately NOT copied in, because its own header says eleven of its rows are unverified.';

alter table public.warehouse_holiday_dates enable row level security;
drop policy if exists warehouse_holiday_dates_read on public.warehouse_holiday_dates;
create policy warehouse_holiday_dates_read on public.warehouse_holiday_dates
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_holiday_dates from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4 · the capability catalogue — the card's four, verbatim
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_capabilities (
  key text primary key,
  label text not null,
  helper text not null,
  sort int not null
);

comment on table public.warehouse_capabilities is
  '0457: the Warehouse capabilities Access grants (stock/MASTER.md §11 Permissions & approvals). Nothing here grants Delivery ETA, route or customer-delivery editing — those are Delivery''s and no Warehouse capability reaches them.';

insert into public.warehouse_capabilities (key, label, helper, sort) values
  ('manage_warehouse_settings', 'Manage Warehouse Settings',
   'Change Warehouse configuration.', 1),
  ('confirm_inbound_receipt', 'Confirm inbound receipt',
   'Confirm that the Warehouse physically received the listed goods.', 2),
  ('confirm_collection_from_warehouse', 'Confirm collection from Warehouse',
   'Confirm that the listed goods physically left the Warehouse with the collector.', 3),
  ('perform_stock_count', 'Perform stock count',
   'Enter and submit a physical stock-count result.', 4)
on conflict (key) do update
   set label = excluded.label, helper = excluded.helper, sort = excluded.sort;

alter table public.warehouse_capabilities enable row level security;
drop policy if exists warehouse_capabilities_read on public.warehouse_capabilities;
create policy warehouse_capabilities_read on public.warehouse_capabilities
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_capabilities from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5 · the grants
-- ---------------------------------------------------------------------------

create table if not exists public.warehouse_capability_grants (
  id uuid primary key default gen_random_uuid(),
  capability text not null references public.warehouse_capabilities(key),
  user_id uuid not null references public.app_users(id),
  granted_by uuid references public.app_users(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.app_users(id),
  revoked_at timestamptz
);

comment on table public.warehouse_capability_grants is
  '0457: who holds a Warehouse capability. A grant is never deleted — revoking stamps `revoked_at`, so the history still says who held what and when. Only an ACTIVE person can be granted; a person who is later disabled keeps the record and loses the effect.';

create unique index if not exists warehouse_capability_grant_live_idx
  on public.warehouse_capability_grants (capability, user_id)
  where revoked_at is null;

alter table public.warehouse_capability_grants enable row level security;
drop policy if exists warehouse_capability_grants_read on public.warehouse_capability_grants;
create policy warehouse_capability_grants_read on public.warehouse_capability_grants
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.warehouse_capability_grants from authenticated, anon;

/** Does `p_user` hold `p_capability` RIGHT NOW? A live grant to an ACTIVE
 *  person — a disabled account holds nothing, whatever its record says. */
create or replace function public.warehouse_holds_capability(
  p_capability text,
  p_user uuid
) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from warehouse_capability_grants g
      join app_users u on u.id = g.user_id
     where g.capability = p_capability
       and g.user_id = p_user
       and g.revoked_at is null
       and u.status = 'active'
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 6 · the WIDENED gate, and the doors
-- ---------------------------------------------------------------------------

/** 0456's gate, plus the explicit `Manage Warehouse Settings` capability.
 *  ADDITIVE on purpose: principal and `ops_manager` keep exactly what they
 *  had, so turning Access on cannot lock the manager out of her own page. */
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
  if public.warehouse_holds_capability('manage_warehouse_settings', auth.uid()) then return; end if;
  raise exception 'forbidden' using errcode = '42501',
    detail = 'warehouse settings are set by the manager';
end;
$fn$;

/** The Site's public-holiday policy. Saving it is what makes it configured;
 *  there is no default row and no silent enablement. */
create or replace function public.warehouse_set_holiday_policy(
  p_site_id uuid,
  p_follow boolean,
  p_country text,
  p_state text,
  p_observe_replacement boolean,
  p_default_availability text,
  p_opens_at time,
  p_closes_at time
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb;
  v_new jsonb;
begin
  perform public.warehouse_settings_gate();
  if not exists (select 1 from warehouses where id = p_site_id) then
    raise exception 'unknown warehouse site' using errcode = '22023', detail = 'unknown_site';
  end if;
  if nullif(btrim(coalesce(p_country, '')), '') is null then
    raise exception 'choose the country' using errcode = '22023', detail = 'country_required';
  end if;
  if p_default_availability not in
     ('closed', 'receiving_only', 'collection_only', 'normal', 'special') then
    raise exception 'unknown public-holiday availability'
      using errcode = '22023', detail = 'bad_availability';
  end if;
  if p_default_availability = 'special' then
    if p_opens_at is null or p_closes_at is null then
      raise exception 'give both an opening and a closing time'
        using errcode = '22023', detail = 'times_incomplete';
    end if;
    if p_closes_at <= p_opens_at then
      raise exception 'the closing time must be later than the opening time'
        using errcode = '22023', detail = 'closes_before_opens';
    end if;
  end if;

  select to_jsonb(p) into v_old from warehouse_holiday_policies p where p.site_id = p_site_id;

  insert into warehouse_holiday_policies as p
    (site_id, follow_public_holidays, country, state, observe_replacement,
     default_availability, special_opens_at, special_closes_at, updated_by, updated_at)
  values
    (p_site_id, coalesce(p_follow, false), btrim(p_country),
     nullif(btrim(coalesce(p_state, '')), ''), coalesce(p_observe_replacement, false),
     p_default_availability,
     case when p_default_availability = 'special' then p_opens_at end,
     case when p_default_availability = 'special' then p_closes_at end,
     auth.uid(), now())
  on conflict (site_id) do update
     set follow_public_holidays = excluded.follow_public_holidays,
         country = excluded.country,
         state = excluded.state,
         observe_replacement = excluded.observe_replacement,
         default_availability = excluded.default_availability,
         special_opens_at = excluded.special_opens_at,
         special_closes_at = excluded.special_closes_at,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at
  returning to_jsonb(p) into v_new;

  if v_new is distinct from v_old then
    insert into warehouse_setting_changes (what, old_value, new_value, actor_id)
    values ('holiday_policy:' || p_site_id::text, v_old, v_new, auth.uid());
  end if;
  return v_new;
end;
$fn$;

/**
 * Import ONE verified holiday calendar version.
 *
 * It refuses to exist without a source name, a source reference and the date
 * that source was verified — the three facts that separate a checked calendar
 * from a guess. The new version supersedes the previous ACTIVE one for the
 * same country/state; the old version is kept, so a date a schedule once
 * applied can still be explained.
 *
 * `p_dates` is `[{ date, name, observed }, …]`. An empty list is refused: an
 * import that carries no date is not a calendar.
 */
create or replace function public.warehouse_import_holiday_calendar(
  p_country text,
  p_state text,
  p_source_name text,
  p_source_reference text,
  p_verified_at timestamptz,
  p_dates jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_version int;
  v_cal warehouse_holiday_calendars;
  v_count int;
begin
  perform public.warehouse_settings_gate();

  if v_country is null then
    raise exception 'name the country this calendar covers'
      using errcode = '22023', detail = 'country_required';
  end if;
  if nullif(btrim(coalesce(p_source_name, '')), '') is null then
    raise exception 'name the source this calendar came from'
      using errcode = '22023', detail = 'source_name_required';
  end if;
  if nullif(btrim(coalesce(p_source_reference, '')), '') is null then
    raise exception 'give the source reference'
      using errcode = '22023', detail = 'source_reference_required';
  end if;
  if p_verified_at is null then
    raise exception 'say when this calendar was verified'
      using errcode = '22023', detail = 'verified_at_required';
  end if;
  if p_dates is null or jsonb_typeof(p_dates) <> 'array'
     or jsonb_array_length(p_dates) = 0 then
    raise exception 'an import with no date is not a calendar'
      using errcode = '22023', detail = 'no_dates';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from warehouse_holiday_calendars
   where country = v_country and coalesce(state, '') = coalesce(v_state, '');

  update warehouse_holiday_calendars
     set active = false
   where country = v_country and coalesce(state, '') = coalesce(v_state, '') and active;

  insert into warehouse_holiday_calendars
    (country, state, version, source_name, source_reference, verified_at, imported_by)
  values
    (v_country, v_state, v_version, btrim(p_source_name), btrim(p_source_reference),
     p_verified_at, auth.uid())
  returning * into v_cal;

  insert into warehouse_holiday_dates (calendar_id, on_date, name, observed)
  select v_cal.id,
         (e->>'date')::date,
         btrim(e->>'name'),
         coalesce((e->>'observed')::boolean, false)
    from jsonb_array_elements(p_dates) e
   where nullif(btrim(coalesce(e->>'name', '')), '') is not null
     and nullif(e->>'date', '') is not null
  on conflict (calendar_id, on_date, name) do nothing;

  select count(*) into v_count from warehouse_holiday_dates where calendar_id = v_cal.id;
  if v_count = 0 then
    raise exception 'every row needs a date and a name'
      using errcode = '22023', detail = 'no_usable_dates';
  end if;

  insert into warehouse_setting_changes (what, old_value, new_value, reason, actor_id)
  values ('holiday_calendar:' || v_country || coalesce('/' || v_state, ''),
          null,
          to_jsonb(v_cal) || jsonb_build_object('dates', v_count),
          btrim(p_source_name) || ' · ' || btrim(p_source_reference),
          auth.uid());

  return to_jsonb(v_cal) || jsonb_build_object('dates', v_count);
end;
$fn$;

/** Grant one capability to one ACTIVE person. */
create or replace function public.warehouse_grant_capability(
  p_capability text,
  p_user_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row warehouse_capability_grants;
begin
  perform public.warehouse_settings_gate();
  if not exists (select 1 from warehouse_capabilities where key = p_capability) then
    raise exception 'unknown Warehouse capability'
      using errcode = '22023', detail = 'unknown_capability';
  end if;
  if not exists (select 1 from app_users where id = p_user_id and status = 'active') then
    raise exception 'access can only be given to an active person'
      using errcode = '22023', detail = 'person_not_active';
  end if;
  if public.warehouse_holds_capability(p_capability, p_user_id) then
    raise exception 'that person already has this access'
      using errcode = '22023', detail = 'already_granted';
  end if;

  insert into warehouse_capability_grants (capability, user_id, granted_by)
  values (p_capability, p_user_id, auth.uid())
  returning * into v_row;

  insert into warehouse_setting_changes (what, old_value, new_value, actor_id)
  values ('access:' || p_capability,
          null,
          jsonb_build_object('user_id', p_user_id,
                             'person', (select name from app_users where id = p_user_id),
                             'held', true),
          auth.uid());
  return to_jsonb(v_row);
end;
$fn$;

/** Take it back. The row survives, stamped — the audit must still answer
 *  "who held this in June?". */
create or replace function public.warehouse_revoke_capability(
  p_capability text,
  p_user_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row warehouse_capability_grants;
begin
  perform public.warehouse_settings_gate();
  update warehouse_capability_grants
     set revoked_by = auth.uid(), revoked_at = now()
   where capability = p_capability and user_id = p_user_id and revoked_at is null
   returning * into v_row;
  if not found then
    raise exception 'that person does not have this access'
      using errcode = '22023', detail = 'not_granted';
  end if;
  insert into warehouse_setting_changes (what, old_value, new_value, actor_id)
  values ('access:' || p_capability,
          jsonb_build_object('user_id', p_user_id,
                             'person', (select name from app_users where id = p_user_id),
                             'held', true),
          jsonb_build_object('user_id', p_user_id,
                             'person', (select name from app_users where id = p_user_id),
                             'held', false),
          auth.uid());
  return to_jsonb(v_row);
end;
$fn$;

grant execute on function public.warehouse_holds_capability(text, uuid) to authenticated;
grant execute on function public.warehouse_set_holiday_policy(uuid, boolean, text, text, boolean, text, time, time) to authenticated;
grant execute on function public.warehouse_import_holiday_calendar(text, text, text, text, timestamptz, jsonb) to authenticated;
grant execute on function public.warehouse_grant_capability(text, uuid) to authenticated;
grant execute on function public.warehouse_revoke_capability(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sanity
-- ---------------------------------------------------------------------------
do $sanity$
declare
  v_n int;
begin
  -- the boundary exists and is EMPTY: no invented holiday reached a screen
  select count(*) into v_n from public.warehouse_holiday_dates;
  if v_n > 0 then
    raise exception '0457 sanity: % holiday date(s) were seeded; none may be', v_n;
  end if;
  select count(*) into v_n from public.warehouse_holiday_calendars;
  if v_n > 0 then
    raise exception '0457 sanity: % holiday calendar(s) were seeded; none may be', v_n;
  end if;
  select count(*) into v_n from public.warehouse_holiday_policies;
  if v_n > 0 then
    raise exception '0457 sanity: % holiday policy row(s) were seeded; the policy is Not configured until saved', v_n;
  end if;

  -- nobody was silently given Warehouse access
  select count(*) into v_n from public.warehouse_capability_grants;
  if v_n > 0 then
    raise exception '0457 sanity: % capability grant(s) were seeded; none may be', v_n;
  end if;

  -- the four capabilities are present
  select count(*) into v_n from public.warehouse_capabilities;
  if v_n <> 4 then
    raise exception '0457 sanity: expected 4 Warehouse capabilities, found %', v_n;
  end if;

  -- the gate still lets the manager through, and now reads the capability too
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'warehouse_settings_gate')
     !~ 'warehouse_holds_capability' then
    raise exception '0457 sanity: the settings gate does not read the capability grant';
  end if;

  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('warehouse_holiday_policies', 'warehouse_holiday_calendars',
                        'warehouse_holiday_dates', 'warehouse_capabilities',
                        'warehouse_capability_grants')
     and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_n > 0 then
    raise exception '0457 sanity: % direct write grant(s) survive on the Card B tables', v_n;
  end if;

  raise notice '0457 OK — the holiday boundary is built and empty, the four capabilities exist, and nobody was granted anything.';
end
$sanity$;

commit;
