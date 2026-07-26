-- 0276_hr_kpi_targets (2026-07-26, HR-P6 — Loo approved the mock + "开工").
--
-- Numbered 0276, not 0275. The tail read 0274 when this was drafted; the re-check
-- immediately before applying (guardrail #8) found the parallel line had taken
-- 0275_rental_makes_a_sales_order during the verification pass. That is exactly
-- the collision the guardrail exists for — re-check the tail, do not trust the
-- number you started with.
--
-- WHAT THIS IS
--   Targets, and the scoreboard that reads them. A target is a number somebody
--   is judged against, so the only hard requirements are (1) it is dated, and
--   (2) changing it never rewrites the month it was already judged on.
--
-- WHAT THE RATIFIED SPEC ASKED FOR, AND WHY THIS IS SMALLER
--   The spec wanted FOUR tables — kpi_definitions, kpi_targets (5-level scope
--   ladder), kpi_bonus_tiers, kpi_manual_actuals. Measured against live data:
--
--   * The scope ladder was person > store > position > department > band. Live
--     there are TWO people with sales, in ONE store. Three of those five rungs
--     can never resolve, and one of them is actively wrong: a department-scoped
--     SALES target is meaningless for Operation / Finance / HR, which have no
--     revenue at all. So scope_kind is person | store, enforced by the CHECK
--     below. Adding a rung later is a CHECK change and zero data migration.
--
--   * kpi_definitions was to be a config table. The spec's OWN risk register
--     (#4) says "closed metric enum, one computed metric added per phase max,
--     no formula builder" — a closed enum living in a config table invites a row
--     the code cannot compute. The metric list is a constant in @carres/shared
--     (KPI_METRICS), mirrored by the kpi_key CHECK here. Same call Loo already
--     ratified for P4's checklists.
--
--   * kpi_bonus_tiers is NOT built. The spec itself marked the money wiring
--     "off by default", live commission rates number ZERO, and the semantics
--     ("highest reached pays") already exist in model_commission_tiers. Building
--     a second money path before the first has a single rate is not caution.
--     Carry-forward: kpi-bonus-tiers-not-built.
--
-- WHY WRITES ARE RPC-ONLY (the P5 lesson, applied at the schema layer)
--   staff_commission_rates has a `for all` RLS policy, so /api/hr/config/staff-rate
--   upserts the table directly. That is exactly why 0272 had to put the
--   back-dated-rate guard in a TRIGGER: a route check would be bypassed by the
--   next writer. These tables get a SELECT-only policy instead, so the audited
--   DEFINER RPC is structurally the only door and its guards can live where they
--   are readable. Do not "helpfully" widen these policies to `for all`.
--
-- SALES ACTUALS ARE NOT STORED, AND ARE NOT READ FROM THE FROZEN RUN
--   The obvious idea — read a closed month's figure from commission_run_lines.basis
--   — is wrong. commission.ts accumulates `basis` ONLY in the percentage branch,
--   so a per-model store freezes basis = 0. That is the same trap O1 hit with
--   report.totalBasis. P6 therefore computes sold from the month's attributed
--   lines through ONE shared function, identically for open and closed months, so
--   O1's SOLD tile and P6's per-person figures agree by construction whatever
--   method a store is on. P6 displays no commission at all, so it structurally
--   cannot contradict a frozen statement.
--
-- SELF-WRITES ARE ALLOWED
--   §4 of the HR spec: Loo overruled preventive segregation of duties in favour
--   of a legible trail. An hr user MAY set a target on themselves; the audit
--   action carries a `SELF - ` prefix so "did anyone set their own target?" is one
--   filter, not a row-by-row read. Audit separators are plain hyphens to match
--   what 0269 actually wrote. Verified live: setting a target on CR001 while
--   signed in as principal produced
--   "SELF - KPI target - person principal - sales_basis - 5000.00 from 2026-07-01".

-- APPLIED 2026-07-26 as 0276_hr_kpi_targets, after 28 assertions passed against
-- live prod in two rolled-back transactions. The second pass existed because the
-- first found two real defects: anon kept EXECUTE (see §J) and the SELF-marker
-- assertions had been reading the wrong audit row — audit_log.occurred_at
-- defaults to now(), which is TRANSACTION start time, so every row written in one
-- transaction shares a timestamp and `order by occurred_at desc` returns an
-- arbitrary one. Read audit rows back by `ref`, never by time, inside a txn.

-- ── A. kpi_targets — dated, correctable, never destructive to history ─────────
-- Scope is two nullable FKs with a CHECK rather than a (scope_kind, scope_id)
-- pair: real referential integrity, and scope_kind cannot drift out of step with
-- the id because it is DERIVED from which column is filled.

create table public.kpi_targets (
  id uuid primary key default gen_random_uuid(),

  -- Must stay in step with KPI_METRICS in @carres/shared (a shared test asserts
  -- the constant's keys). Extending it is one line here + one line there.
  kpi_key text not null
    check (kpi_key in ('sales_basis', 'units_sold', 'orders_count')),

  -- hr_employees is the durable person key (P4). NOT salespersons.id: an employee
  -- row survives a floor-staff member gaining a portal login, which is precisely
  -- the merge O4 route B will perform.
  employee_id uuid references public.hr_employees(id) on delete cascade,
  dealer_id   uuid references public.dealers(id)      on delete cascade,
  constraint kpi_targets_exactly_one_scope check (
    (employee_id is not null)::int + (dealer_id is not null)::int = 1),

  target_value numeric(12,2) not null check (target_value > 0),

  -- The month this number starts applying from. Re-saving the SAME date corrects
  -- a typo; choosing a NEW date makes history. Nothing is ever rewritten.
  effective_from date not null,

  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.kpi_targets is
  'Effective-dated performance targets, scoped to a person (hr_employees) or a '
  'store (dealers). Writes go through hr_set_kpi_target only — the RLS policy is '
  'SELECT-only on purpose so guards cannot be bypassed by a direct upsert.';
comment on column public.kpi_targets.effective_from is
  'Resolution (latest effective_from <= month end) lives in resolveKpiTargets in '
  '@carres/shared, not here — so it is unit-testable and has one implementation.';

-- Partial uniques: a composite unique would not fire, because NULL never
-- conflicts with NULL in Postgres.
create unique index kpi_targets_person_uq
  on public.kpi_targets (kpi_key, employee_id, effective_from)
  where employee_id is not null;
create unique index kpi_targets_store_uq
  on public.kpi_targets (kpi_key, dealer_id, effective_from)
  where dealer_id is not null;

alter table public.kpi_targets enable row level security;
create policy kpi_targets_hr_read on public.kpi_targets
  for select
  using (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── B. kpi_manual_actuals — the escape hatch, deliberately with no live user ──
-- Every metric shipped today is COMPUTED from attribution. This table is the
-- declared home for a future non-sales KPI (the spec's risk #4 protects exactly
-- this hatch) so that adding one is a constant change rather than a migration.
-- No metric is marked `manual` today — carry-forward kpi-manual-metric-none-authored.

create table public.kpi_manual_actuals (
  id uuid primary key default gen_random_uuid(),
  kpi_key text not null
    check (kpi_key in ('sales_basis', 'units_sold', 'orders_count')),
  employee_id uuid references public.hr_employees(id) on delete cascade,
  dealer_id   uuid references public.dealers(id)      on delete cascade,
  constraint kpi_manual_actuals_exactly_one_scope check (
    (employee_id is not null)::int + (dealer_id is not null)::int = 1),
  year  int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  value numeric(12,2) not null check (value >= 0),
  note text,
  entered_by uuid,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index kpi_manual_person_uq
  on public.kpi_manual_actuals (kpi_key, employee_id, year, month)
  where employee_id is not null;
create unique index kpi_manual_store_uq
  on public.kpi_manual_actuals (kpi_key, dealer_id, year, month)
  where dealer_id is not null;

alter table public.kpi_manual_actuals enable row level security;
create policy kpi_manual_actuals_hr_read on public.kpi_manual_actuals
  for select
  using (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── C. dealers.manager_user_id — the unlock for the manager view ─────────────
-- Live measurement that made this necessary: app_users.reports_to_user_id holds
-- exactly ONE edge in the whole company (CR005 -> CR002), and salespersons has no
-- manager column at all. The spec routed floor staff via "the seat holding the
-- Sales-Manager duty over that store" — but there is no sales_manager duty key,
-- and org_position_duties is keyed (duty_key, position_id) with NO store
-- dimension, so that route is not expressible. One column on the store answers
-- the actual question: whose number is this store's number.

alter table public.dealers
  add column manager_user_id uuid references public.app_users(id) on delete set null;

comment on column public.dealers.manager_user_id is
  'Who owns this store''s performance number. HR-P6: the rollup spine for floor '
  'staff, who have no reports_to of their own.';

-- ── D. helpers ───────────────────────────────────────────────────────────────

-- Drives the `SELF - ` audit prefix. Mirrors _hr_is_self (0269) but takes an id,
-- because these RPCs are handed a scope, not an employee row.
create or replace function public._kpi_is_self(p_employee_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from hr_employees e
    where e.id = p_employee_id
      and e.app_user_id is not null
      and e.app_user_id = auth.uid());
$$;

-- A store P6 can score. DERIVED, with no flag to maintain:
--   showroom channel  AND  has at least one CR-coded salesperson.
--
-- This is also what keeps "AutoCount Archive (旧账)" out (Loo: "ignore AutoCount
-- Archive"). That dealers row exists only to own the 37 imported orders — it has
-- zero staff, and 0265 already excludes its orders from hr_commission_source, so
-- its scored sales are structurally RM 0 forever. Deriving the exclusion from
-- staff means a real new showroom appears the moment its first coded person is
-- added, and no future import needs remembering. Same instinct as O1 deriving
-- "legacy" from source_system instead of adding a flag column.
create or replace function public._kpi_store_is_scoreable(p_dealer_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from dealers d
    where d.id = p_dealer_id
      and d.channel = 'showroom'
      and exists (
        select 1 from salespersons sp
        where sp.dealer_id = d.id and sp.staff_code is not null));
$$;

-- ── E. kpi_source() — the one gated read ─────────────────────────────────────
-- Returns targets, the scope registries and manager coverage. It does NOT return
-- actuals: those are computed in @carres/shared from the same month slice the
-- commission report uses, so the two can never disagree (see the header).
--
-- ALL target rows go out, not just the in-force one. Resolution is a pure
-- function in shared — one implementation, unit-testable — and the row count is
-- tiny by construction (one per scope per change).

create or replace function public.kpi_source(p_year integer, p_month integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kpiKey', t.kpi_key,
        'scopeKind', case when t.employee_id is not null then 'person' else 'store' end,
        'employeeId', t.employee_id,
        'dealerId', t.dealer_id,
        'subjectName', coalesce(u.name, sp.name, d.name),
        'staffCode', coalesce(u.staff_code, sp.staff_code),
        'targetValue', t.target_value,
        'effectiveFrom', t.effective_from,
        'note', t.note,
        'setByName', (select a.name from app_users a where a.id = coalesce(t.updated_by, t.created_by)))
        order by t.effective_from desc, coalesce(u.name, sp.name, d.name))
      from kpi_targets t
      left join hr_employees e on e.id = t.employee_id
      left join app_users u    on u.id = e.app_user_id
      left join salespersons sp on sp.id = e.salesperson_id
      left join dealers d      on d.id = t.dealer_id), '[]'::jsonb),

    -- Everyone on the employee spine. `canSell` says whether a SALES metric can
    -- be scored for them; the UI offers sellers for sales targets and everyone
    -- for a future manual metric. staff_role goes out RAW — labelling it here
    -- would fork STAFF_TIER_LABEL, the duplication HR-P2 spent a migration on.
    'people', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x."staffCode" nulls last)
      from (
        select
          e.id            as "employeeId",
          e.app_user_id   as "appUserId",
          e.salesperson_id as "salespersonId",
          u.staff_code    as "staffCode",
          u.name          as name,
          p.name          as "positionName",
          dep.name        as "departmentName",
          d2.id           as "dealerId",
          d2.name         as "storeName",
          sp2.staff_role  as "staffRole",
          -- The sp2/d2 joins are here for the MERGED case (a floor-staff member
          -- who later gains a portal login — O4 route B). Reading canSell off the
          -- floor identity means such a person stays scoreable instead of
          -- silently dropping out of the scoreboard on the day they get an email.
          coalesce(sp2.active and public._kpi_store_is_scoreable(d2.id), false)
                          as "canSell"
        from hr_employees e
        join app_users u on u.id = e.app_user_id
        left join org_positions p on p.id = u.position_id
        left join org_departments dep on dep.id = p.department_id
        left join salespersons sp2 on sp2.id = e.salesperson_id
        left join dealers d2 on d2.id = sp2.dealer_id

        union all

        select
          e.id, e.app_user_id, e.salesperson_id,
          sp.staff_code, sp.name,
          null::text, null::text,
          d.id, d.name, sp.staff_role,
          -- an inactive salesperson keeps their history but cannot be given a
          -- new target: the scoreboard would show a target nobody can hit
          sp.active
        from hr_employees e
        join salespersons sp on sp.id = e.salesperson_id
        join dealers d on d.id = sp.dealer_id
        where e.app_user_id is null
          and public._kpi_store_is_scoreable(d.id)
      ) x), '[]'::jsonb),

    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dealerId', d.id,
        'name', d.name,
        'managerUserId', d.manager_user_id,
        'managerName', (select a.name from app_users a where a.id = d.manager_user_id),
        'staffCount', (select count(*) from salespersons sp
                       where sp.dealer_id = d.id and sp.active))
        order by d.name)
      from dealers d
      where public._kpi_store_is_scoreable(d.id)), '[]'::jsonb),

    'manualActuals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kpiKey', m.kpi_key,
        'employeeId', m.employee_id,
        'dealerId', m.dealer_id,
        'value', m.value,
        'note', m.note))
      from kpi_manual_actuals m
      where m.year = p_year and m.month = p_month), '[]'::jsonb),

    -- The gap card's whole content. Honest counts, so "manager view is off"
    -- comes with the reason and the fix rather than an empty box.
    'managerCoverage', jsonb_build_object(
      'hqTotal', (select count(*) from hr_employees e
                  join app_users u on u.id = e.app_user_id),
      'hqWithManager', (select count(*) from hr_employees e
                        join app_users u on u.id = e.app_user_id
                        where u.reports_to_user_id is not null),
      'storesTotal', (select count(*) from dealers d
                      where public._kpi_store_is_scoreable(d.id)),
      'storesWithManager', (select count(*) from dealers d
                            where public._kpi_store_is_scoreable(d.id)
                              and d.manager_user_id is not null)),

    -- Candidates for the store-owner picker: internal humans with a login.
    -- Deliberately NOT is_internal() — that admits bd, and a BD does not own a
    -- showroom's number (same narrowing 0268 applied to the rental approver).
    'managerCandidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appUserId', u.id, 'name', u.name, 'staffCode', u.staff_code,
        'positionName', p.name)
        order by u.staff_code nulls last)
      from app_users u
      left join org_positions p on p.id = u.position_id
      where u.staff_code is not null
        and u.status::text = 'active'
        and u.role::text in ('principal', 'operation', 'hr', 'finance')), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$$;

-- ── F. hr_set_kpi_target() — audited upsert on one dated row ─────────────────

create or replace function public.hr_set_kpi_target(
  p_kpi_key text,
  p_employee_id uuid,
  p_dealer_id uuid,
  p_target_value numeric,
  p_effective_from date,
  p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_who text;
  v_scope text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if (p_employee_id is not null)::int + (p_dealer_id is not null)::int <> 1 then
    raise exception 'one_scope_required';
  end if;
  if p_kpi_key is null or p_kpi_key not in ('sales_basis', 'units_sold', 'orders_count') then
    raise exception 'unknown_kpi';
  end if;
  if p_target_value is null or p_target_value <= 0 then
    raise exception 'target_must_be_positive';
  end if;
  if p_effective_from is null then
    raise exception 'effective_from_required';
  end if;

  if p_employee_id is not null then
    select coalesce(u.name, sp.name) into v_who
    from hr_employees e
    left join app_users u on u.id = e.app_user_id
    left join salespersons sp on sp.id = e.salesperson_id
    where e.id = p_employee_id;
    if v_who is null then raise exception 'employee_not_found'; end if;
    v_scope := 'person';
  else
    -- The archive holder is refused HERE too, not only filtered out of the read,
    -- so a stale client cannot create a target that no screen would ever show.
    if not public._kpi_store_is_scoreable(p_dealer_id) then
      raise exception 'store_not_scoreable';
    end if;
    select d.name into v_who from dealers d where d.id = p_dealer_id;
    v_scope := 'store';
  end if;

  -- Explicit update-then-insert rather than ON CONFLICT: the conflict target
  -- differs per scope (two partial indexes), and spelling that out twice is
  -- less readable than this.
  update kpi_targets t set
    target_value = p_target_value,
    note = nullif(p_note, ''),
    updated_at = now(),
    updated_by = auth.uid()
  where t.kpi_key = p_kpi_key
    and t.effective_from = p_effective_from
    and t.employee_id is not distinct from p_employee_id
    and t.dealer_id   is not distinct from p_dealer_id
  returning t.id into v_id;

  if v_id is null then
    insert into kpi_targets
      (kpi_key, employee_id, dealer_id, target_value, effective_from, note,
       created_by, updated_by)
    values
      (p_kpi_key, p_employee_id, p_dealer_id, p_target_value, p_effective_from,
       nullif(p_note, ''), auth.uid(), auth.uid())
    returning id into v_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when p_employee_id is not null and public._kpi_is_self(p_employee_id)
         then 'SELF - ' else '' end
      || format('KPI target - %s %s - %s - %s from %s',
                v_scope, v_who, p_kpi_key,
                to_char(p_target_value, 'FM999999990.00'),
                to_char(p_effective_from, 'YYYY-MM-DD')),
    v_id::text);

  return v_id;
end;
$$;

-- ── G. hr_delete_kpi_target() — for a target set on the wrong scope ──────────
-- Without this a fat-fingered scope is permanent and would make somebody look
-- behind forever. History is protected by effective dating, not by refusing
-- deletes, so this is audited rather than blocked.

create or replace function public.hr_delete_kpi_target(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_t kpi_targets%rowtype;
  v_who text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_t from kpi_targets where id = p_id;
  if not found then raise exception 'target_not_found'; end if;

  select coalesce(u.name, sp.name, d.name) into v_who
  from kpi_targets t
  left join hr_employees e on e.id = t.employee_id
  left join app_users u on u.id = e.app_user_id
  left join salespersons sp on sp.id = e.salesperson_id
  left join dealers d on d.id = t.dealer_id
  where t.id = p_id;

  delete from kpi_targets where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when v_t.employee_id is not null and public._kpi_is_self(v_t.employee_id)
         then 'SELF - ' else '' end
      || format('KPI target REMOVED - %s - %s - %s from %s',
                coalesce(v_who, '-'), v_t.kpi_key,
                to_char(v_t.target_value, 'FM999999990.00'),
                to_char(v_t.effective_from, 'YYYY-MM-DD')),
    p_id::text);
end;
$$;

-- ── H. hr_set_manual_actual() — the hatch's write door ───────────────────────

create or replace function public.hr_set_manual_actual(
  p_kpi_key text,
  p_employee_id uuid,
  p_dealer_id uuid,
  p_year integer,
  p_month integer,
  p_value numeric,
  p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_who text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if (p_employee_id is not null)::int + (p_dealer_id is not null)::int <> 1 then
    raise exception 'one_scope_required';
  end if;
  if p_kpi_key is null or p_kpi_key not in ('sales_basis', 'units_sold', 'orders_count') then
    raise exception 'unknown_kpi';
  end if;
  if p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'bad_month';
  end if;
  if p_value is null or p_value < 0 then
    raise exception 'value_must_not_be_negative';
  end if;

  if p_employee_id is not null then
    select coalesce(u.name, sp.name) into v_who
    from hr_employees e
    left join app_users u on u.id = e.app_user_id
    left join salespersons sp on sp.id = e.salesperson_id
    where e.id = p_employee_id;
    if v_who is null then raise exception 'employee_not_found'; end if;
  else
    if not public._kpi_store_is_scoreable(p_dealer_id) then
      raise exception 'store_not_scoreable';
    end if;
    select d.name into v_who from dealers d where d.id = p_dealer_id;
  end if;

  update kpi_manual_actuals m set
    value = p_value,
    note = nullif(p_note, ''),
    updated_at = now(),
    updated_by = auth.uid()
  where m.kpi_key = p_kpi_key
    and m.year = p_year and m.month = p_month
    and m.employee_id is not distinct from p_employee_id
    and m.dealer_id   is not distinct from p_dealer_id
  returning m.id into v_id;

  if v_id is null then
    insert into kpi_manual_actuals
      (kpi_key, employee_id, dealer_id, year, month, value, note,
       entered_by, updated_by)
    values
      (p_kpi_key, p_employee_id, p_dealer_id, p_year, p_month, p_value,
       nullif(p_note, ''), auth.uid(), auth.uid())
    returning id into v_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when p_employee_id is not null and public._kpi_is_self(p_employee_id)
         then 'SELF - ' else '' end
      || format('KPI actual - %s - %s - %s/%s - %s',
                coalesce(v_who, '-'), p_kpi_key, p_year, p_month,
                to_char(p_value, 'FM999999990.00')),
    v_id::text);

  return v_id;
end;
$$;

-- ── I. hr_set_store_manager() — turns the manager view on ────────────────────

create or replace function public.hr_set_store_manager(
  p_dealer_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_store text;
  v_mgr text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not public._kpi_store_is_scoreable(p_dealer_id) then
    raise exception 'store_not_scoreable';
  end if;
  select d.name into v_store from dealers d where d.id = p_dealer_id;

  -- null clears the owner. Anything else must be an ACTIVE internal human with a
  -- CR code — same narrowing as managerCandidates above, and it keeps a disabled
  -- account from silently owning a store's number (the 0266/0267 lesson).
  if p_user_id is not null then
    select u.name into v_mgr from app_users u
    where u.id = p_user_id
      and u.staff_code is not null
      and u.status::text = 'active'
      and u.role::text in ('principal', 'operation', 'hr', 'finance');
    if v_mgr is null then raise exception 'not_a_valid_manager'; end if;
  end if;

  update dealers set manager_user_id = p_user_id where id = p_dealer_id;

  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    format('Store owner - %s - %s', coalesce(v_store, '-'),
           coalesce(v_mgr, '(cleared)')),
    p_dealer_id::text);
end;
$$;

-- ── J. grants ────────────────────────────────────────────────────────────────
-- The in-function gate is the real boundary and is fail-closed (a disabled or
-- anonymous caller gets app_role() NULL -> coalesce '' -> not in the list -> 42501).
-- These grants are defence in depth on top of it.
--
-- MEASURED, not assumed. The first pass here said only `revoke ... from anon` and
-- prod verification reported anon STILL holding EXECUTE on all five functions:
-- a new function is created with EXECUTE granted to PUBLIC, and anon inherits it,
-- so revoking the named role changes nothing while the PUBLIC grant stands.
-- 0268 recorded the mirror-image trap ("REVOKE FROM public does not drop anon" —
-- true when anon ALSO holds an explicit grant). The pair is what works, and
-- `authenticated` must then be re-granted or every Hono user-client call dies
-- with permission denied. Verified in the same rolled-back transaction:
-- anon 0 of 5, authenticated 5 of 5, and a live kpi_source() call as
-- authenticated still succeeded.

revoke execute on function public.kpi_source(integer, integer) from public, anon;
revoke execute on function public.hr_set_kpi_target(text, uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.hr_delete_kpi_target(uuid) from public, anon;
revoke execute on function public.hr_set_manual_actual(text, uuid, uuid, integer, integer, numeric, text) from public, anon;
revoke execute on function public.hr_set_store_manager(uuid, uuid) from public, anon;

grant execute on function public.kpi_source(integer, integer) to authenticated, service_role;
grant execute on function public.hr_set_kpi_target(text, uuid, uuid, numeric, date, text) to authenticated, service_role;
grant execute on function public.hr_delete_kpi_target(uuid) to authenticated, service_role;
grant execute on function public.hr_set_manual_actual(text, uuid, uuid, integer, integer, numeric, text) to authenticated, service_role;
grant execute on function public.hr_set_store_manager(uuid, uuid) to authenticated, service_role;

-- ── K. sanity ────────────────────────────────────────────────────────────────

do $$
declare
  v_scoreable int;
  v_archive   int;
  v_overloads int;
  v_anon      int;
  v_auth      int;
begin
  -- Exactly the real showrooms are scoreable, and the archive holder is not.
  select count(*) into v_scoreable
  from dealers d where public._kpi_store_is_scoreable(d.id);

  select count(*) into v_archive
  from dealers d
  where d.channel = 'showroom'
    and not public._kpi_store_is_scoreable(d.id);

  if v_scoreable < 1 then
    raise exception 'no scoreable store — the derivation is wrong';
  end if;
  raise notice 'scoreable stores: % (excluded showroom-channel rows: %)',
    v_scoreable, v_archive;

  -- No ghost overloads (the 0153/0154 lesson).
  select count(*) into v_overloads from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('kpi_source', 'hr_set_kpi_target', 'hr_delete_kpi_target',
                      'hr_set_manual_actual', 'hr_set_store_manager');
  if v_overloads <> 5 then
    raise exception 'expected 5 kpi functions, found % — overload minted', v_overloads;
  end if;

  -- The grants, asserted rather than trusted — the first draft of §J looked
  -- correct and left anon holding EXECUTE on all five.
  select count(*) into v_anon from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('kpi_source', 'hr_set_kpi_target', 'hr_delete_kpi_target',
                      'hr_set_manual_actual', 'hr_set_store_manager')
    and has_function_privilege('anon', p.oid, 'execute');
  if v_anon <> 0 then
    raise exception 'anon can still execute % kpi functions', v_anon;
  end if;

  select count(*) into v_auth from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('kpi_source', 'hr_set_kpi_target', 'hr_delete_kpi_target',
                      'hr_set_manual_actual', 'hr_set_store_manager')
    and has_function_privilege('authenticated', p.oid, 'execute');
  if v_auth <> 5 then
    raise exception 'authenticated lost EXECUTE on % of 5 — the app would 500', 5 - v_auth;
  end if;

  raise notice 'HR-P6 kpi tables + 5 functions in place (anon 0, authenticated 5)';
end $$;
