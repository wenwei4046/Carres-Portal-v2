-- 0278_hr_staff_comp (2026-07-26, HR-P7 — Loo approved the mock, then
-- "separate, don't merge — go").
--
-- Numbered against a tracker tail of 0277_delivery_booking_two_stage. RE-CHECK the
-- tail immediately before applying (guardrail #8): three separate lines took
-- 0275/0276/0277 in a single day, and 0276 had to be renumbered mid-flight.
--
-- WHAT THIS IS
--   What the team costs, per month. The Chairman's question, answered on the cost
--   side only — this is deliberately NOT a P&L (the spec's own words:
--   "cost-visibility, not a fake P&L", and this migration takes that literally).
--
-- LOO'S RULING THAT SHAPES THE WHOLE PHASE (2026-07-26)
--   "separate, don't merge" — commission is NEVER added into the people-cost
--   figure. The spec's formula was `loaded cost = (base+allowance)×(1+burden) +
--   run totals`. Rejected: commission is a VARIABLE cost that tracks revenue, so
--   folding it into fixed salary makes "average cost per person" meaningless and
--   makes a good sales month look like cost inflation.
--
--   Made STRUCTURAL rather than visual: the shared engine exposes `fixedCost` and
--   `commissionCost` as two fields and **there is no field that sums them**. A
--   screen that wants a combined number has to add them itself and think about why.
--   Same technique as `rental-cart.ts` holding the "rent and outright can't share an
--   order" law in one module. Do not add a `totalCost` convenience field here or in
--   @carres/shared — that is the whole guard.
--
-- THE OTHER LAW, CARRIED FROM P6
--   Never divide a number to make a screen look complete.
--     * HQ salary is NOT allocated across stores. Splitting head-office cost over
--       one showroom would invent a figure and then judge the store against it.
--       Overhead is reported as overhead. No allocation function exists.
--     * The cost/revenue RATIO is not printed while the month is still running.
--       Live measurement that forced this: every order in the database sits between
--       2026-07-21 and 2026-07-26 — SIX DAYS. A full month of salary over six days
--       of sales reads as a business in collapse. `monthInProgress` (pure, in
--       @carres/shared) gates it, and `coverage` below reports the days on file so
--       the operator can judge. Both resolve themselves with time; nothing to
--       switch on later.
--
-- STATUTORY LINE (unmoved, permanent — §6 of the HR spec)
--   `employer_burden_pct` is ONE number a human types as an estimate, so the cost
--   figure is not misleadingly low. Carres never computes EPF / SOCSO / EIS / PCB,
--   never issues a payslip, never generates a bank or e-filing file. Adding a
--   statutory table here would reopen a door Loo closed twice.
--
-- PDPA / MASKING — a deliberate DIFFERENCE from 0269
--   IC and bank account are masked and released one value at a time through
--   `hr_reveal_employee_field`, which audits in the same transaction. Salary is
--   NOT masked, on purpose: the only two roles that can read it (hr, principal)
--   are the two that administer it, the screen's entire job is comparing nine
--   figures side by side, and a reveal-per-row register would be unusable. So the
--   control here is the WRITE trail, not read-gating. Per-person figures never
--   leave the hr/principal RPC.
--
-- SELF-WRITES ALLOWED (§4, and D3's retracted clause)
--   An hr user MAY record their own salary; the audit action carries a `SELF - `
--   prefix so "did anyone set their own pay?" is one filter. D3's row used to say
--   the opposite — that clause was retracted in the same session that shipped P6,
--   because §4 is the later ruling and explicitly covers this phase.

-- APPLIED 2026-07-26 as 0278_hr_staff_comp. 18 assertions passed against live prod
-- in ONE rolled-back transaction (no second pass needed — 0276's two lessons were
-- applied up front: the grant PAIR `from public, anon` + explicit re-grant, and
-- audit rows read back by `ref` rather than by `occurred_at`).
--
-- The assertion worth keeping: a direct `insert into staff_comp` as `authenticated`
-- was refused 42501, so "the RPC is the only write door" is measured, not claimed.
-- Also measured at apply time — `coverage` for 2026-07 returned
-- {orderCount 19, daysWithOrders 6, daysInMonth 31, 21..26 Jul}, which is precisely
-- why the ratio is gated.

-- ── A. staff_comp — effective-dated, correctable, never destructive ──────────

create table public.staff_comp (
  id uuid primary key default gen_random_uuid(),

  -- hr_employees is the durable person key (P4). One row per person per start
  -- date; a raise is a NEW row, so last month's cost stays what it actually was.
  employee_id uuid not null references public.hr_employees(id) on delete cascade,

  base_monthly    numeric(12,2) not null check (base_monthly >= 0),
  fixed_allowance numeric(12,2) not null default 0 check (fixed_allowance >= 0),

  -- An ESTIMATE a human types. Not a statutory calculation — see the header.
  -- Capped at 100 so a typo cannot triple the company's reported cost.
  employer_burden_pct numeric(5,2) not null default 0
    check (employer_burden_pct >= 0 and employer_burden_pct <= 100),

  effective_from date not null,
  note text,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,

  -- Re-saving the same start date CORRECTS that row; a new date makes history.
  unique (employee_id, effective_from)
);

comment on table public.staff_comp is
  'Effective-dated salary register, one row per person per start date. Commission is '
  'NEVER added into these figures (Loo 2026-07-26 "separate, don''t merge") — the '
  'shared engine deliberately exposes no field that sums fixed cost and commission.';
comment on column public.staff_comp.employer_burden_pct is
  'A typed-in ESTIMATE of employer on-cost so the loaded figure is not misleadingly '
  'low. Carres never computes EPF/SOCSO/EIS/PCB — see §6 of the HR spec.';

create index staff_comp_employee_idx
  on public.staff_comp (employee_id, effective_from desc);

-- SELECT-only, exactly like 0276's kpi tables. staff_commission_rates has a
-- `for all` policy and is upserted directly, which is precisely why 0272's
-- back-dated-rate guard had to be a TRIGGER. Money writes belong in the audited
-- DEFINER RPC (guardrail #4), so the RPC is structurally the only door here.
-- Do NOT widen this to `for all`.
alter table public.staff_comp enable row level security;
create policy staff_comp_hr_read on public.staff_comp
  for select
  using (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── B. helpers ───────────────────────────────────────────────────────────────

-- Drives the `SELF - ` audit prefix, mirroring _kpi_is_self (0276).
create or replace function public._comp_is_self(p_employee_id uuid)
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

-- ── C. staff_comp_source() — the one gated read ──────────────────────────────
-- Returns comp rows + the people to group them by + how much of the month the
-- sales data actually covers. It does NOT return revenue or commission: those come
-- from the SAME shared computations the Performance tab and the commission report
-- use, assembled in apps/api/src/lib/comp-month.ts, so the screens cannot quote
-- three different numbers for one month.
--
-- ALL comp rows go out, not just the one in force. Resolution is a pure function in
-- @carres/shared (unit-testable, one implementation) and the row count is tiny by
-- construction — one per person per change.

create or replace function public.staff_comp_source(p_year integer, p_month integer)
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
    'comp', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'employeeId', c.employee_id,
        'baseMonthly', c.base_monthly,
        'fixedAllowance', c.fixed_allowance,
        'employerBurdenPct', c.employer_burden_pct,
        'effectiveFrom', c.effective_from,
        'note', c.note,
        'setByName', (select a.name from app_users a
                      where a.id = coalesce(c.updated_by, c.created_by)))
        order by c.effective_from desc)
      from staff_comp c), '[]'::jsonb),

    -- Everyone on the employee spine, with what they need to be grouped by.
    -- `groupKey` is NOT decided here: the engine decides, so "Management =
    -- department-less" lives in one place instead of being half in SQL.
    -- staff_role goes out RAW — labelling it here would fork STAFF_TIER_LABEL.
    'people', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x."staffCode" nulls last)
      from (
        select
          e.id           as "employeeId",
          e.app_user_id  as "appUserId",
          u.staff_code   as "staffCode",
          u.name         as name,
          'hq'           as kind,
          p.name         as "positionName",
          dep.name       as "departmentName",
          d2.id          as "dealerId",
          d2.name        as "storeName",
          sp2.staff_role as "staffRole",
          u.status::text = 'active' as "accessActive"
        from hr_employees e
        join app_users u on u.id = e.app_user_id
        left join org_positions p on p.id = u.position_id
        left join org_departments dep on dep.id = p.department_id
        left join salespersons sp2 on sp2.id = e.salesperson_id
        left join dealers d2 on d2.id = sp2.dealer_id

        union all

        select
          e.id, e.app_user_id, sp.staff_code, sp.name,
          'floor', null::text, null::text,
          d.id, d.name, sp.staff_role, sp.active
        from hr_employees e
        join salespersons sp on sp.id = e.salesperson_id
        join dealers d on d.id = sp.dealer_id
        where e.app_user_id is null
      ) x), '[]'::jsonb),

    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dealerId', d.id, 'name', d.name,
        'managerUserId', d.manager_user_id,
        'managerName', (select a.name from app_users a where a.id = d.manager_user_id))
        order by d.name)
      from dealers d
      where public._kpi_store_is_scoreable(d.id)), '[]'::jsonb),

    -- How much of the month the sales data actually covers. THE reason the ratio
    -- is gated: every order in the database sits in 2026-07-21..26, so a full
    -- month of salary over six days of sales would read as a collapse. Same slice
    -- predicate as commission_run_state / hr_commission_source (0265: native only).
    'coverage', (
      select jsonb_build_object(
        'firstOrderDate', min(o.placed_at)::date,
        'lastOrderDate',  max(o.placed_at)::date,
        'daysWithOrders', count(distinct o.placed_at::date),
        'orderCount',     count(*),
        'daysInMonth', extract(day from
          (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int)
      from orders o
      where coalesce(o.source_system, '') <> 'autocount'
        and extract(year  from o.placed_at)::int = p_year
        and extract(month from o.placed_at)::int = p_month))
  into v_result;

  return v_result;
end;
$$;

-- ── D. hr_set_staff_comp() — audited upsert on one dated row ─────────────────

create or replace function public.hr_set_staff_comp(
  p_employee_id uuid,
  p_base_monthly numeric,
  p_fixed_allowance numeric,
  p_employer_burden_pct numeric,
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
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_employee_id is null then raise exception 'employee_required'; end if;
  if p_effective_from is null then raise exception 'effective_from_required'; end if;
  if p_base_monthly is null or p_base_monthly < 0 then
    raise exception 'base_must_not_be_negative';
  end if;
  if coalesce(p_fixed_allowance, 0) < 0 then
    raise exception 'allowance_must_not_be_negative';
  end if;
  if coalesce(p_employer_burden_pct, 0) < 0 or coalesce(p_employer_burden_pct, 0) > 100 then
    raise exception 'burden_out_of_range';
  end if;

  select coalesce(u.name, sp.name) into v_who
  from hr_employees e
  left join app_users u on u.id = e.app_user_id
  left join salespersons sp on sp.id = e.salesperson_id
  where e.id = p_employee_id;
  if v_who is null then raise exception 'employee_not_found'; end if;

  update staff_comp c set
    base_monthly        = p_base_monthly,
    fixed_allowance     = coalesce(p_fixed_allowance, 0),
    employer_burden_pct = coalesce(p_employer_burden_pct, 0),
    note                = nullif(p_note, ''),
    updated_at = now(),
    updated_by = auth.uid()
  where c.employee_id = p_employee_id
    and c.effective_from = p_effective_from
  returning c.id into v_id;

  if v_id is null then
    insert into staff_comp
      (employee_id, base_monthly, fixed_allowance, employer_burden_pct,
       effective_from, note, created_by, updated_by)
    values
      (p_employee_id, p_base_monthly, coalesce(p_fixed_allowance, 0),
       coalesce(p_employer_burden_pct, 0), p_effective_from,
       nullif(p_note, ''), auth.uid(), auth.uid())
    returning id into v_id;
  end if;

  -- The FIGURES go in the trail on purpose — unlike an IC number, a salary change
  -- is exactly what an audit of "who changed pay" needs to show.
  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when public._comp_is_self(p_employee_id) then 'SELF - ' else '' end
      || format('Salary - %s - base %s + allowance %s + burden %s%% from %s',
                v_who,
                to_char(p_base_monthly, 'FM999999990.00'),
                to_char(coalesce(p_fixed_allowance, 0), 'FM999999990.00'),
                to_char(coalesce(p_employer_burden_pct, 0), 'FM990.00'),
                to_char(p_effective_from, 'YYYY-MM-DD')),
    v_id::text);

  return v_id;
end;
$$;

-- ── E. hr_delete_staff_comp() — for a row entered against the wrong person ───
-- History is protected by effective dating, not by refusing deletes. Audited.

create or replace function public.hr_delete_staff_comp(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_c staff_comp%rowtype;
  v_who text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_c from staff_comp where id = p_id;
  if not found then raise exception 'comp_not_found'; end if;

  select coalesce(u.name, sp.name) into v_who
  from hr_employees e
  left join app_users u on u.id = e.app_user_id
  left join salespersons sp on sp.id = e.salesperson_id
  where e.id = v_c.employee_id;

  delete from staff_comp where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (
    (select public.app_role()),
    (select name from app_users where id = auth.uid()),
    case when public._comp_is_self(v_c.employee_id) then 'SELF - ' else '' end
      || format('Salary REMOVED - %s - base %s from %s',
                coalesce(v_who, '-'),
                to_char(v_c.base_monthly, 'FM999999990.00'),
                to_char(v_c.effective_from, 'YYYY-MM-DD')),
    p_id::text);
end;
$$;

-- ── F. grants ────────────────────────────────────────────────────────────────
-- The in-function gate is the real boundary and is fail-closed. These grants are
-- defence in depth.
--
-- `from public, anon` is the PAIR that works — 0276 measured that revoking only
-- the named role changes nothing, because a new function is created with EXECUTE
-- granted to PUBLIC and anon inherits it. `authenticated` must then be re-granted
-- explicitly or every Hono user-client call dies with permission denied.

revoke execute on function public.staff_comp_source(integer, integer) from public, anon;
revoke execute on function public.hr_set_staff_comp(uuid, numeric, numeric, numeric, date, text) from public, anon;
revoke execute on function public.hr_delete_staff_comp(uuid) from public, anon;

grant execute on function public.staff_comp_source(integer, integer) to authenticated, service_role;
grant execute on function public.hr_set_staff_comp(uuid, numeric, numeric, numeric, date, text) to authenticated, service_role;
grant execute on function public.hr_delete_staff_comp(uuid) to authenticated, service_role;

-- ── G. sanity ────────────────────────────────────────────────────────────────

do $$
declare
  v_fns  int;
  v_anon int;
  v_auth int;
  v_pols int;
begin
  select count(*) into v_fns from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('staff_comp_source', 'hr_set_staff_comp', 'hr_delete_staff_comp');
  if v_fns <> 3 then
    raise exception 'expected 3 comp functions, found % — overload minted', v_fns;
  end if;

  -- Asserted, not trusted: 0276's first draft of this block looked correct and
  -- left anon holding EXECUTE on every function.
  select count(*) into v_anon from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('staff_comp_source', 'hr_set_staff_comp', 'hr_delete_staff_comp')
    and has_function_privilege('anon', p.oid, 'execute');
  if v_anon <> 0 then raise exception 'anon can still execute % comp functions', v_anon; end if;

  select count(*) into v_auth from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('staff_comp_source', 'hr_set_staff_comp', 'hr_delete_staff_comp')
    and has_function_privilege('authenticated', p.oid, 'execute');
  if v_auth <> 3 then
    raise exception 'authenticated lost EXECUTE on % of 3 — the app would 500', 3 - v_auth;
  end if;

  -- SELECT-only: exactly one policy, and it must not be a write policy.
  select count(*) into v_pols from pg_policies
  where schemaname = 'public' and tablename = 'staff_comp';
  if v_pols <> 1 then raise exception 'staff_comp should have exactly 1 policy, found %', v_pols; end if;
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'staff_comp' and cmd <> 'SELECT') then
    raise exception 'staff_comp has a non-SELECT policy — writes must go through the RPC';
  end if;

  raise notice 'HR-P7 staff_comp + 3 functions in place (anon 0, authenticated 3, 1 SELECT policy)';
end $$;
