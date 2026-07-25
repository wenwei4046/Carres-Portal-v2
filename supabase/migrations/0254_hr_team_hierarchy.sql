-- 0254_hr_team_hierarchy (2026-07-25, Loo: "Phase 1 — HR Team hierarchy").
-- Numbered at apply: remote tracker tail was 0253 (list_migrations checked;
-- Loo approved the draft in-conversation same day — guardrail #8 honoured).
--
-- Scope (Loo, 2026-07-25):
--   * ONE position registry (band: c_level | manager | executive) — the single
--     vocabulary for every Carres position; replaces nothing yet (staff_role /
--     bd_profiles.position stay authoritative for commission — Phase 2 topic).
--   * Staff codes CRnnn — one company-wide sequence shared by HQ logins
--     (app_users) and OUR showroom floor staff (salespersons under
--     channel='showroom'). Dealer-side staff are NOT Carres staff — no code.
--   * reports_to on app_users — first real reporting line (HQ only).
--   * org_position_history — every position change is remembered (职位更替).
--   * hr_team_source / hr_set_* RPCs — HR stays a keyhole role (0244 law:
--     is_internal() NOT widened; all reach via gated SECURITY DEFINER RPCs).
--
-- Additive + dormant-safe: no existing table/RPC is redefined; all new columns
-- nullable; zero behaviour change for POS / commission / orders.

-- ── A. org_positions — the position registry ─────────────────────────────────

create table public.org_positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  band text not null check (band in ('c_level', 'manager', 'executive')),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.org_positions enable row level security;
create policy org_positions_hr_rw on public.org_positions
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

-- Seed ladder (Loo 2026-07-25: "Executive / Manager / C-level (management team)").
-- HR can rename / add / retire from the Team page — this is a starting set.
insert into public.org_positions (name, band, sort) values
  ('Chairman',           'c_level',   0),
  ('COO',                'c_level',   1),
  ('CFO',                'c_level',   2),
  ('CBO',                'c_level',   3),
  ('Sales Manager',      'manager',  10),
  ('Operation Manager',  'manager',  11),
  ('HR Manager',         'manager',  12),
  ('Sales Executive',    'executive', 20),
  ('BD Executive',       'executive', 21),
  ('Admin Assistant',    'executive', 22),
  ('Finance Executive',  'executive', 23),
  ('HR Executive',       'executive', 24);

-- ── B. staff identity columns ────────────────────────────────────────────────

alter table public.app_users add column staff_code text unique;
alter table public.app_users add column position_id uuid references public.org_positions(id) on delete set null;
alter table public.app_users add column reports_to_user_id uuid references public.app_users(id) on delete set null;

alter table public.salespersons add column staff_code text unique;

-- ── C. CRnnn sequence + cross-table uniqueness ───────────────────────────────
-- ONE company-wide sequence: CR001, CR002… (lpad 3, grows to CR1000 naturally).
-- next_staff_code() skips values already taken in EITHER table (manual edits
-- may have claimed a number). EXECUTE: service_role only — minting happens
-- server-side (Hono adminClient) or inside the DEFINER RPCs below.

create sequence public.org_staff_code_seq start 1;

create or replace function public.next_staff_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := 'CR' || lpad(nextval('org_staff_code_seq')::text, 3, '0');
    exit when not exists (select 1 from app_users where staff_code = v_code)
      and not exists (select 1 from salespersons where staff_code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.next_staff_code() from public, anon, authenticated;
grant execute on function public.next_staff_code() to service_role;

-- staff_code must be unique ACROSS app_users + salespersons (one namespace).
create or replace function public._staff_code_cross_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_code is null then return new; end if;
  if tg_table_name = 'app_users' then
    if exists (select 1 from salespersons where staff_code = new.staff_code) then
      raise exception 'staff_code_taken';
    end if;
  else
    if exists (select 1 from app_users where staff_code = new.staff_code) then
      raise exception 'staff_code_taken';
    end if;
  end if;
  return new;
end;
$$;
create trigger app_users_staff_code_cross before insert or update of staff_code
  on public.app_users for each row execute function public._staff_code_cross_check();
create trigger salespersons_staff_code_cross before insert or update of staff_code
  on public.salespersons for each row execute function public._staff_code_cross_check();

-- ── D. org_position_history — 职位更替 log (append-only) ─────────────────────

create table public.org_position_history (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('hq_user', 'showroom_staff')),
  subject_id uuid not null,
  subject_name text not null,
  prev_position text,
  new_position text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index org_position_history_subject_idx
  on public.org_position_history (subject_id, changed_at desc);

alter table public.org_position_history enable row level security;
create policy org_position_history_hr_rw on public.org_position_history
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

-- ── E. hr_team_source() — the one gated read ─────────────────────────────────
-- Everything the Team page shows, one keyhole. Dealer accounts + dealer-side
-- staff are EXCLUDED (Loo: dealers are independent entities; their staff are
-- not our staff). Showroom store logins (role='showroom') ARE listed — they
-- are Carres' own store credentials.

create or replace function public.hr_team_source()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', u.name, 'role', u.role,
        'title', u.title, 'status', u.status,
        'staffCode', u.staff_code,
        'positionId', u.position_id, 'positionName', p.name, 'band', p.band,
        'reportsToUserId', u.reports_to_user_id,
        'lastSeenAt', u.last_seen_at, 'createdAt', u.created_at,
        'orgName', coalesce(s.name, dp.name, d.name))
        order by u.created_at)
      from app_users u
      left join org_positions p on p.id = u.position_id
      left join suppliers s on s.id = u.supplier_id
      left join delivery_partners dp on dp.id = u.partner_id
      left join dealers d on d.id = u.dealer_id
      where u.role <> 'dealer'), '[]'::jsonb),
    'showroomStores', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
      from dealers d where d.channel = 'showroom'), '[]'::jsonb),
    'showroomStaff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'name', sp.name, 'staffRole', sp.staff_role,
        'staffCode', sp.staff_code, 'active', sp.active,
        'email', sp.email, 'phone', sp.phone,
        'dealerId', sp.dealer_id, 'storeName', d.name,
        'outletId', sp.outlet_id, 'outletName', o.name,
        'hasPin', exists (select 1 from salesperson_pins pin
                          where pin.salesperson_id = sp.id))
        order by d.name, o.name nulls first, sp.name)
      from salespersons sp
      join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
      left join outlets o on o.id = sp.outlet_id), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', op.id, 'name', op.name, 'band', op.band,
        'sort', op.sort, 'active', op.active)
        order by case op.band when 'c_level' then 0 when 'manager' then 1 else 2 end,
                 op.sort, op.name)
      from org_positions op), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'subjectKind', h.subject_kind, 'subjectId', h.subject_id,
        'subjectName', h.subject_name, 'prevPosition', h.prev_position,
        'newPosition', h.new_position, 'changedAt', h.changed_at,
        'changedBy', (select name from app_users a where a.id = h.changed_by))
        order by h.changed_at desc)
      from (select * from org_position_history
            order by changed_at desc limit 100) h), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$$;

-- ── F. audited write RPCs ────────────────────────────────────────────────────

-- Position change — the 职位更替 record is never silent.
create or replace function public.hr_set_position(p_user_id uuid, p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_prev text;
  v_new text;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from app_users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user.role = 'dealer' then raise exception 'dealer_not_in_hierarchy'; end if;

  select name into v_prev from org_positions where id = v_user.position_id;
  if p_position_id is not null then
    select name into v_new from org_positions where id = p_position_id and active;
    if v_new is null then raise exception 'position_not_found'; end if;
  end if;

  update app_users set position_id = p_position_id where id = p_user_id;

  if coalesce(v_prev, '') <> coalesce(v_new, '') then
    insert into org_position_history
      (subject_kind, subject_id, subject_name, prev_position, new_position, changed_by)
    values ('hq_user', p_user_id, v_user.name, v_prev, v_new, auth.uid());

    insert into audit_log (role, actor_text, action, ref)
    values ((select public.app_role()),
            (select name from app_users where id = auth.uid()),
            format('Position change · %s: %s → %s',
                   v_user.name, coalesce(v_prev, '—'), coalesce(v_new, '—')),
            p_user_id::text);
  end if;
end;
$$;

-- Reporting line — self/cycle-guarded, HQ only.
create or replace function public.hr_set_reports_to(p_user_id uuid, p_manager_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_walk uuid;
  v_hops int := 0;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from app_users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user.role = 'dealer' then raise exception 'dealer_not_in_hierarchy'; end if;

  if p_manager_id is not null then
    if p_manager_id = p_user_id then raise exception 'reports_to_self'; end if;
    if not exists (select 1 from app_users
                   where id = p_manager_id and role <> 'dealer') then
      raise exception 'manager_not_found';
    end if;
    -- cycle guard: walking up from the manager must never reach the subject
    v_walk := p_manager_id;
    while v_walk is not null and v_hops < 20 loop
      select reports_to_user_id into v_walk from app_users where id = v_walk;
      if v_walk = p_user_id then raise exception 'reporting_cycle'; end if;
      v_hops := v_hops + 1;
    end loop;
  end if;

  update app_users set reports_to_user_id = p_manager_id where id = p_user_id;
end;
$$;

-- Staff code edit — format + cross-table uniqueness enforced, audited.
create or replace function public.hr_set_staff_code(
  p_kind text, p_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('hq_user', 'showroom_staff') then
    raise exception 'invalid_kind';
  end if;

  v_code := nullif(upper(trim(p_code)), '');
  if v_code is not null and v_code !~ '^[A-Z]{1,5}[0-9]{2,6}$' then
    raise exception 'invalid_staff_code';
  end if;

  if p_kind = 'hq_user' then
    select name into v_name from app_users where id = p_id and role <> 'dealer';
    if v_name is null then raise exception 'user_not_found'; end if;
    update app_users set staff_code = v_code where id = p_id;
  else
    select sp.name into v_name
    from salespersons sp
    join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
    where sp.id = p_id;
    if v_name is null then raise exception 'staff_not_found'; end if;
    update salespersons set staff_code = v_code where id = p_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('Staff code · %s → %s', v_name, coalesce(v_code, '—')),
          p_id::text);
end;
$$;

-- ── G. backfill — codes in hierarchy order + obvious positions ───────────────
-- Person accounts only. Generic logins (operation@ / finance@ / BD@) and
-- external accounts (supplier / partner / store credentials) get NO code.

update app_users set staff_code = 'CR001' where email = 'principal@carres.com';
update app_users set staff_code = 'CR002' where email = 'jess@carres.com';
update app_users set staff_code = 'CR003' where email = 'khoryee@carres.com';
update app_users set staff_code = 'CR004' where email = 'yujun@carres.com';
update app_users set staff_code = 'CR005' where email = 'shasha@carres.com';
update app_users set staff_code = 'CR006' where email = 'samantha@carres.com';
update app_users set staff_code = 'CR007' where email = 'hugo@carresofficial.com';

update salespersons sp set staff_code = 'CR008'
  from dealers d where d.id = sp.dealer_id and d.channel = 'showroom' and sp.name = 'Mayson';
update salespersons sp set staff_code = 'CR009'
  from dealers d where d.id = sp.dealer_id and d.channel = 'showroom' and sp.name = 'kaan';

select setval('org_staff_code_seq', 9, true);

-- Obvious position backfill (titles already on app_users; HR refines in UI):
update app_users set position_id = (select id from org_positions where name = 'Chairman')
  where email = 'principal@carres.com';
update app_users set position_id = (select id from org_positions where name = 'COO')
  where email = 'jess@carres.com';
update app_users set position_id = (select id from org_positions where name = 'Admin Assistant')
  where email in ('khoryee@carres.com', 'yujun@carres.com');
update app_users set position_id = (select id from org_positions where name = 'BD Executive')
  where email = 'hugo@carresofficial.com';

-- ── H. sanity ────────────────────────────────────────────────────────────────
do $$
declare v_dupes int;
begin
  select count(*) into v_dupes from (
    select staff_code from app_users where staff_code is not null
    intersect
    select staff_code from salespersons where staff_code is not null) x;
  if v_dupes > 0 then raise exception 'staff_code cross-table collision'; end if;
end $$;
