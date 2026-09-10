-- 0458_a_warehouse_is_operated_by_a_warehouse_operator.sql
--
-- ⭐ THE WAREHOUSE SETTINGS PRODUCTION WALK, 2026-09-09. 0456/0457 shipped and
--    deployed on `05b36bd8`; the authenticated read against REAL production
--    data — not the test fixture — showed two things the fixture could not.
--
-- ---- 🔴 1 · `Operated by` OFFERED TWELVE DELIVERY PARTNERS ------------------
--
-- `warehouse_set_site_details` accepted ANY active `stock_operating_parties`
-- row. Measured on production: 15 active parties — 12 `delivery_operator`
-- (AL · EU · HOUZS · NETS Delivery · SSY · TEOW · TSDD · TT and four E2E
-- fixtures), 1 `showroom`, and only 2 `warehouse_operator`. So the field that
-- names WHO RUNS THE WAREHOUSE would have accepted `E2E LP-B`.
--
-- Stock MASTER §3 is explicit: "NETS is not a Site. Site, operating party and
-- role are separate." NETS Delivery is a real organisation with a real role —
-- it is simply not the one that operates a warehouse. The door now says so,
-- and it says it in SQL, because a picker that offers the right two is a
-- convenience and a door that refuses the other thirteen is the rule.
--
-- ---- 🔴 2 · THE KEY CONTACT OFFERED FOUR NON-PEOPLE -----------------------
--
-- Measured on production, active internal accounts:
--
--   CR001 principal · CR002 Jess · CR004 Yu Jun · CR005 Shasha · CR007 Herng
--     ↑ five real individuals, each with a staff code AND an hr_employees row
--
--   `Business Development · Carres HQ` (BD@carres.com)   no staff code
--   `Finance · Carres HQ` (finance@carres.com)           no staff code
--   `Operations` (operation@carres.com)                  no staff code
--   `E2E Test · operation` (operation-test@x.com)        no staff code
--     ↑ four role mailboxes and a test login — NOT individuals
--
-- The card's rule is `Key contact` "represents a real individual and must use
-- People", and where none exists the screen says `Not assigned`. **The ERP's
-- own definition of a People record is the CRnnn staff code** — people appear
-- because a code was minted for them at the Team door (`hr-people.ts`). So
-- that is the test, rather than a hand-kept list of email addresses that would
-- rot the day someone adds `warehouse@carres.com`.
--
-- Stock MASTER §11 already forbids the same thing from the other side:
-- "Shared company credentials are invalid."
--
-- This file changes NO data. It tightens two guards inside two doors.
-- ============================================================================

begin;

set search_path = public, pg_temp;

/** Is `p_user` a real Carres PERSON — not a role mailbox, not a shared login,
 *  not a test account? The ERP's own answer: a People record has a staff code.
 *  Kept as its own function so the rule has one home and one spelling. */
create or replace function public.warehouse_is_person(p_user uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from app_users u
     where u.id = p_user
       and u.status = 'active'
       and nullif(btrim(coalesce(u.staff_code, '')), '') is not null
  );
$fn$;

comment on function public.warehouse_is_person(uuid) is
  '0458: a real individual, by the ERP''s own People definition — an active account carrying a CRnnn staff code. Role mailboxes (BD@ · finance@ · operation@) and test logins carry none and are therefore not people.';

/**
 * 0456's Warehouse Details door, with the two guards the production walk
 * showed were missing.
 *
 *   · the operating organisation must be an active `warehouse_operator` — a
 *     delivery partner is a real organisation performing a different role;
 *   · a NEW key contact must be a real individual, not a shared or role
 *     account. An existing contact is untouched, so history is preserved and
 *     the rest of the page keeps saving.
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

  -- 0458 · a warehouse is operated by a WAREHOUSE operator
  if p_operating_party_id is not null
     and not exists (select 1 from stock_operating_parties
                      where id = p_operating_party_id
                        and active and kind = 'warehouse_operator') then
    raise exception 'that organisation does not operate a warehouse'
      using errcode = '22023', detail = 'not_a_warehouse_operator';
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

  -- 0458 · and the key contact must be a PERSON
  if p_key_contact_id is not null
     and p_key_contact_id is distinct from v_prev_contact
     and not public.warehouse_is_person(p_key_contact_id) then
    raise exception 'the key contact must be a person, not a shared account'
      using errcode = '22023', detail = 'key_contact_not_a_person';
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

/** 0457's grant door, with the same PERSON rule. Access is given to people. */
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
  if not public.warehouse_is_person(p_user_id) then
    raise exception 'access is given to a person, not to a shared account'
      using errcode = '22023', detail = 'not_a_person';
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

grant execute on function public.warehouse_is_person(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sanity — no data changes; the guards are the subject
-- ---------------------------------------------------------------------------
do $sanity$
declare
  v_n int;
begin
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'warehouse_set_site_details')
     !~ 'not_a_warehouse_operator' then
    raise exception '0458 sanity: Warehouse Details still accepts a non-warehouse operator';
  end if;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'warehouse_grant_capability')
     !~ 'warehouse_is_person' then
    raise exception '0458 sanity: access can still be granted to a shared account';
  end if;

  -- the two guards must not have emptied the pickers they narrow
  select count(*) into v_n
    from stock_operating_parties where active and kind = 'warehouse_operator';
  if v_n = 0 then
    raise exception '0458 sanity: no active warehouse operator exists — Operated by would offer nothing';
  end if;
  select count(*) into v_n
    from app_users u
   where u.status = 'active' and nullif(btrim(coalesce(u.staff_code, '')), '') is not null;
  if v_n = 0 then
    raise exception '0458 sanity: no active person carries a staff code — Key contact would offer nobody';
  end if;

  raise notice '0458 OK — a warehouse is operated by a warehouse operator, and access is given to people.';
end
$sanity$;

commit;
