-- 0272_commission_runs (2026-07-26, HR-P5 — Loo approved the mock, then "直接开工").
-- Numbered at apply: remote tracker tail was 0271_guarantee_sofa_height_scope
-- (list_migrations checked — guardrail #8). Re-check before applying.
--
-- WHAT THIS IS
--   The month close. HR closes a month, the figures stop moving, each person gets a
--   statement that still reads the same in three years, and one CSV goes to whoever
--   pays people.
--
-- THE ONE THING THAT IS NOT IN HERE, ON PURPOSE: THE MATH
--   `computeCommission` is a pure function in @carres/shared and `/api/hr/report`
--   ALREADY runs it server-side (apps/api/src/routes/hr.ts). Close reuses that exact
--   code path and hands the computed lines to `commission_close_month`, which only
--   persists and guards. Re-implementing the calculation in SQL would be the "second
--   engine" the spec explicitly forbids, and it would drift the first time somebody
--   changed a tier rule in TypeScript.
--
-- WHY ADJUSTMENTS ARE NOT KEYED TO A RUN (the one data-model change vs the spec)
--   The spec has `commission_run_adjustments.run_id`. A refund discovered in September
--   for an order paid in July would then attach to JULY's run — mutating the very
--   statement the freeze exists to protect. Here an adjustment belongs to the TARGET
--   month (the open one), and carries `origin_year`/`origin_month` + `ref_order_id` so
--   it is traceable both ways. It is swept onto a run only when that month closes.
--
-- WHAT THE LOCK ACTUALLY COVERS, AND WHY THAT IS ENOUGH
--   Only `staff_commission_rates` is effective-dated; model rates / tiers / milestones /
--   scheme method are NOT (verified live 2026-07-26). Editing those retroactively cannot
--   change a CLOSED month, because closing snapshots the computed lines — the freeze is
--   the protection. What it can do is make a live "preview" of a closed month disagree
--   with the frozen statement, so every surface must read the frozen lines for a closed
--   month and never recompute. Carry-forward `commission-config-not-effective-dated`.
--
--   The two things that CAN still rewrite a closed month's money are guarded here:
--     * attribution   — moves a sale from one person to another (function guard)
--     * staff rates   — an effective_from landing inside a locked month (trigger)
--   A trigger, not a route check: rate writes are direct table upserts through RLS
--   (`/api/hr/config/staff-rate`), so only a trigger covers every door by construction.
--
-- STATUS FLOW
--   draft → approved → paid;  void from any;  reopen: approved → draft (never paid).
--   The month LOCKS at `approved`. Draft deliberately stays fluid — risk register #1
--   says the lock must not fight a workflow where corrections happen when noticed.

-- ── A. commission_runs ───────────────────────────────────────────────────────

create table public.commission_runs (
  id uuid primary key default gen_random_uuid(),
  year  int not null,
  month int not null check (month between 1 and 12),
  program text not null check (program in ('staff', 'bd')),
  status  text not null default 'draft'
    check (status in ('draft', 'approved', 'paid', 'void')),

  -- who did what, when
  closed_by uuid, closed_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz,
  paid_by uuid, paid_at timestamptz,
  voided_by uuid, voided_at timestamptz,
  note text,

  -- a corrected re-issue points back at what it replaced
  superseded_by_run_id uuid references public.commission_runs(id) on delete set null,

  -- totals frozen at close so a list never has to re-add the lines
  total_commission numeric(12,2) not null default 0,
  total_adjustments numeric(12,2) not null default 0,
  total_payable numeric(12,2) not null default 0,
  people_count int not null default 0,

  created_at timestamptz not null default now()
);

-- one LIVE run per month per programme; voided ones step aside so a corrected
-- re-issue is possible without deleting history.
create unique index commission_runs_one_live
  on public.commission_runs (year, month, program)
  where status <> 'void';

create index commission_runs_period_idx on public.commission_runs (year desc, month desc);

alter table public.commission_runs enable row level security;
create policy commission_runs_hr_rw on public.commission_runs
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── B. commission_run_lines — the statement, frozen ──────────────────────────
-- Text snapshots of name/code/store on purpose: a person can be renamed, moved
-- between stores or offboarded, and last July's statement must not change under them.

create table public.commission_run_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.commission_runs(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('salesperson', 'hq_user')),
  subject_id uuid not null,

  staff_code text,
  name text not null,
  store_name text,

  order_count int not null default 0,
  basis numeric(12,2) not null default 0,
  rate_pct numeric(6,3),
  direct numeric(12,2) not null default 0,
  override numeric(12,2) not null default 0,
  per_model numeric(12,2) not null default 0,
  milestone numeric(12,2) not null default 0,
  kpi_bonus numeric(12,2) not null default 0,   -- always 0 until HR-P6
  adjustments numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,

  -- renders the statement forever, including the rates that were in force
  breakdown jsonb not null default '{}'::jsonb,

  unique (run_id, subject_kind, subject_id)
);
create index commission_run_lines_run_idx on public.commission_run_lines (run_id);
create index commission_run_lines_subject_idx
  on public.commission_run_lines (subject_kind, subject_id);

alter table public.commission_run_lines enable row level security;
create policy commission_run_lines_hr_rw on public.commission_run_lines
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── C. commission_adjustments — keyed to the OPEN month, not to a run ────────

create table public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  -- the month this is PAID IN (must be open when entered)
  year int not null,
  month int not null check (month between 1 and 12),
  program text not null check (program in ('staff', 'bd')),

  subject_kind text not null check (subject_kind in ('salesperson', 'hq_user')),
  subject_id uuid not null,

  amount numeric(12,2) not null check (amount <> 0),
  reason text not null
    check (reason in ('clawback', 'refund', 'correction', 'rental_share', 'other')),

  -- where it CAME from, so a September clawback still points at July
  origin_year int,
  origin_month int check (origin_month is null or origin_month between 1 and 12),
  ref_order_id uuid references public.orders(id) on delete set null,
  note text,

  entered_by uuid,
  entered_at timestamptz not null default now(),

  -- filled when the target month closes; from then on it is frozen into that run
  run_id uuid references public.commission_runs(id) on delete set null
);
create index commission_adjustments_period_idx
  on public.commission_adjustments (year, month, program) where run_id is null;
create index commission_adjustments_subject_idx
  on public.commission_adjustments (subject_kind, subject_id);

alter table public.commission_adjustments enable row level security;
create policy commission_adjustments_hr_rw on public.commission_adjustments
  for all
  using      (coalesce((select public.app_role())::text, '') in ('hr', 'principal'))
  with check (coalesce((select public.app_role())::text, '') in ('hr', 'principal'));

-- ── D. the lock ──────────────────────────────────────────────────────────────

create or replace function public._commission_month_locked(
  p_year int, p_month int, p_program text default 'staff')
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.commission_runs
    where year = p_year and month = p_month and program = p_program
      and status in ('approved', 'paid'));
$$;

comment on function public._commission_month_locked(int, int, text) is
  'A month is locked once its run is approved or paid. Draft stays fluid on purpose.';

-- A staff rate may not be back-dated into a locked month. A TRIGGER, not a route
-- check: `/api/hr/config/staff-rate` upserts the table directly through RLS, so a
-- route guard would be bypassed by the next writer who forgets it.
create or replace function public._commission_guard_rate_write()
returns trigger
language plpgsql
as $$
begin
  if public._commission_month_locked(
       extract(year from new.effective_from)::int,
       extract(month from new.effective_from)::int, 'staff') then
    raise exception 'commission_month_locked'
      using detail = to_char(new.effective_from, 'Month YYYY')
                     || ' is approved — reopen the run before changing rates in it.';
  end if;
  return new;
end;
$$;

create trigger staff_commission_rates_month_lock
  before insert or update on public.staff_commission_rates
  for each row execute function public._commission_guard_rate_write();

-- ── E. readiness — the DB half only ──────────────────────────────────────────
-- Deliberately NOT the whole pre-flight. "Does everyone have a working rate?" is a
-- question only the real engine can answer, and the engine is TypeScript — Hono asks
-- it there and combines the two. This function answers only what SQL owns.

create or replace function public.commission_run_state(
  p_year int, p_month int, p_program text default 'staff')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_run commission_runs%rowtype;
  v_unattributed int;
  v_pending numeric(12,2);
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_run from commission_runs
  where year = p_year and month = p_month and program = p_program and status <> 'void';

  -- same slice hr_commission_source uses: native orders only. An imported archive
  -- row has nobody to pay, so it can never block a close (0265).
  select count(*) into v_unattributed
  from orders o
  where o.salesperson_id is null
    and coalesce(o.source_system, '') <> 'autocount'
    and extract(year from o.placed_at)::int = p_year
    and extract(month from o.placed_at)::int = p_month;

  select coalesce(sum(amount), 0) into v_pending
  from commission_adjustments
  where year = p_year and month = p_month and program = p_program and run_id is null;

  return jsonb_build_object(
    'run', case when v_run.id is null then null else jsonb_build_object(
      'id', v_run.id, 'year', v_run.year, 'month', v_run.month,
      'program', v_run.program, 'status', v_run.status, 'note', v_run.note,
      'closedAt', v_run.closed_at, 'approvedAt', v_run.approved_at,
      'paidAt', v_run.paid_at,
      'closedByName',   (select name from app_users a where a.id = v_run.closed_by),
      'approvedByName', (select name from app_users a where a.id = v_run.approved_by),
      'totalCommission', v_run.total_commission,
      'totalAdjustments', v_run.total_adjustments,
      'totalPayable', v_run.total_payable,
      'peopleCount', v_run.people_count) end,
    'unattributed', v_unattributed,
    'pendingAdjustments', v_pending,
    'locked', public._commission_month_locked(p_year, p_month, p_program));
end;
$$;

-- ── F. close — persist what Hono computed ────────────────────────────────────
-- p_lines is the engine's output, mapped 1:1. This function does NOT calculate; it
-- validates, persists, sweeps adjustments and audits.

create or replace function public.commission_close_month(
  p_year int, p_month int, p_program text, p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_l jsonb;
  v_zero int := 0;
  v_unattributed int;
  v_people int := 0;
  v_commission numeric(12,2) := 0;
  v_adj numeric(12,2) := 0;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_program is null or p_program not in ('staff', 'bd') then
    raise exception 'invalid_program';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_lines';
  end if;

  if exists (select 1 from commission_runs
             where year = p_year and month = p_month and program = p_program
               and status <> 'void') then
    raise exception 'run_already_exists';
  end if;

  -- Guard 1: nobody unattributed. Money would silently go to nobody.
  select count(*) into v_unattributed
  from orders o
  where o.salesperson_id is null
    and coalesce(o.source_system, '') <> 'autocount'
    and extract(year from o.placed_at)::int = p_year
    and extract(month from o.placed_at)::int = p_month;
  if v_unattributed > 0 then
    raise exception 'unattributed_orders'
      using detail = v_unattributed || ' order(s) have no salesperson.';
  end if;

  -- Guard 2: THE one that matters today. A person who sold and earns nothing means
  -- no rate is configured — freezing that would immortalise a mistake and then lock
  -- the month against fixing it. Refuse; the pre-flight says the same thing in words.
  for v_l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((v_l->>'basis')::numeric, 0) > 0
       and coalesce((v_l->>'total')::numeric, 0) = 0 then
      v_zero := v_zero + 1;
    end if;
  end loop;
  if v_zero > 0 then
    raise exception 'zero_rate_sellers'
      using detail = v_zero || ' person(s) sold this month but would be paid RM 0.';
  end if;

  insert into commission_runs (year, month, program, status, closed_by, note)
  values (p_year, p_month, p_program, 'draft', auth.uid(), nullif(p_note, ''))
  returning id into v_run_id;

  insert into commission_run_lines (
    run_id, subject_kind, subject_id, staff_code, name, store_name,
    order_count, basis, rate_pct, direct, override, per_model, milestone,
    kpi_bonus, adjustments, total, breakdown)
  select
    v_run_id,
    coalesce(l->>'subjectKind', 'salesperson'),
    (l->>'subjectId')::uuid,
    nullif(l->>'staffCode', ''),
    coalesce(nullif(l->>'name', ''), '—'),
    nullif(l->>'storeName', ''),
    coalesce((l->>'orderCount')::int, 0),
    coalesce((l->>'basis')::numeric, 0),
    nullif(l->>'ratePct', '')::numeric,
    coalesce((l->>'direct')::numeric, 0),
    coalesce((l->>'override')::numeric, 0),
    coalesce((l->>'perModel')::numeric, 0),
    coalesce((l->>'milestone')::numeric, 0),
    0,
    0,
    coalesce((l->>'total')::numeric, 0),
    coalesce(l->'breakdown', '{}'::jsonb)
  from jsonb_array_elements(p_lines) l;

  -- sweep the month's pending adjustments onto this run, then fold them into totals
  update commission_adjustments
     set run_id = v_run_id
   where year = p_year and month = p_month and program = p_program and run_id is null;

  update commission_run_lines rl
     set adjustments = a.sum_amt,
         total = rl.total + a.sum_amt
    from (select subject_kind, subject_id, sum(amount) as sum_amt
            from commission_adjustments where run_id = v_run_id
           group by 1, 2) a
   where rl.run_id = v_run_id
     and rl.subject_kind = a.subject_kind and rl.subject_id = a.subject_id;

  select count(*), coalesce(sum(direct + override + per_model + milestone), 0),
         coalesce(sum(adjustments), 0)
    into v_people, v_commission, v_adj
  from commission_run_lines where run_id = v_run_id;

  update commission_runs
     set people_count = v_people,
         total_commission = v_commission,
         total_adjustments = v_adj,
         total_payable = v_commission + v_adj
   where id = v_run_id;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('Commission month closed - %s %s/%s - %s people, RM %s',
                 p_program, p_month, p_year, v_people, v_commission + v_adj),
          v_run_id::text);

  return v_run_id;
end;
$$;

-- ── G. approve / reopen / void / mark paid ───────────────────────────────────
-- Approve is PRINCIPAL-only: it is the act that locks the month and releases money.
-- P2 trust model — a duty key may narrow this later, never replace the role check.

create or replace function public.commission_approve_run(p_run_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_run commission_runs%rowtype;
begin
  if coalesce((select public.app_role())::text, '') <> 'principal' then
    raise exception 'principal_only' using errcode = '42501';
  end if;
  select * into v_run from commission_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'draft' then raise exception 'not_draft'; end if;

  update commission_runs
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_run_id;

  insert into audit_log (role, actor_text, action, ref)
  values ('principal', (select name from app_users where id = auth.uid()),
          format('Commission month APPROVED - %s %s/%s - RM %s',
                 v_run.program, v_run.month, v_run.year, v_run.total_payable),
          p_run_id::text);
end;
$$;

-- Reopen is the one door back into a frozen month, and it closes for good once the
-- month is PAID: after money has left, the only honest correction is an adjustment
-- on the next open month.
create or replace function public.commission_reopen_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_run commission_runs%rowtype;
begin
  if coalesce((select public.app_role())::text, '') <> 'principal' then
    raise exception 'principal_only' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;

  select * into v_run from commission_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'paid' then raise exception 'already_paid'; end if;
  if v_run.status <> 'approved' then raise exception 'not_approved'; end if;

  update commission_runs
     set status = 'draft', approved_by = null, approved_at = null
   where id = p_run_id;

  insert into audit_log (role, actor_text, action, ref)
  values ('principal', (select name from app_users where id = auth.uid()),
          format('Commission month REOPENED - %s %s/%s - %s',
                 v_run.program, v_run.month, v_run.year, btrim(p_reason)),
          p_run_id::text);
end;
$$;

-- Discarding a DRAFT: the lines go, the pending adjustments are released back to the
-- month so nothing is lost, and the unique index frees the period for a fresh close.
create or replace function public.commission_void_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_run commission_runs%rowtype;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_run from commission_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'draft' then
    -- an approved or paid month is reopened, not voided
    raise exception 'only_draft_can_be_voided';
  end if;

  update commission_adjustments set run_id = null where run_id = p_run_id;
  delete from commission_run_lines where run_id = p_run_id;
  update commission_runs
     set status = 'void', voided_by = auth.uid(), voided_at = now(),
         note = coalesce(nullif(p_reason, ''), note)
   where id = p_run_id;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()), (select name from app_users where id = auth.uid()),
          format('Commission draft discarded - %s %s/%s - %s',
                 v_run.program, v_run.month, v_run.year, coalesce(p_reason, '-')),
          p_run_id::text);
end;
$$;

create or replace function public.commission_mark_paid(p_run_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_run commission_runs%rowtype;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_run from commission_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'approved' then raise exception 'not_approved'; end if;

  update commission_runs set status = 'paid', paid_by = auth.uid(), paid_at = now()
   where id = p_run_id;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()), (select name from app_users where id = auth.uid()),
          format('Commission month marked PAID - %s %s/%s - RM %s',
                 v_run.program, v_run.month, v_run.year, v_run.total_payable),
          p_run_id::text);
end;
$$;

-- ── H. add an adjustment (to the OPEN month) ─────────────────────────────────

create or replace function public.commission_add_adjustment(
  p_year int, p_month int, p_program text,
  p_subject_kind text, p_subject_id uuid,
  p_amount numeric, p_reason text,
  p_origin_year int default null, p_origin_month int default null,
  p_ref_order_id uuid default null, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid; v_who text;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then raise exception 'amount_required'; end if;
  if p_reason is null or p_reason not in
     ('clawback', 'refund', 'correction', 'rental_share', 'other') then
    raise exception 'invalid_reason';
  end if;
  if p_subject_kind is null or p_subject_kind not in ('salesperson', 'hq_user') then
    raise exception 'invalid_subject_kind';
  end if;

  -- the whole point: it must land on a month that is still open
  if public._commission_month_locked(p_year, p_month, p_program) then
    raise exception 'commission_month_locked'
      using detail = 'That month is already approved. Put the adjustment on an open month.';
  end if;

  insert into commission_adjustments (
    year, month, program, subject_kind, subject_id, amount, reason,
    origin_year, origin_month, ref_order_id, note, entered_by)
  values (p_year, p_month, p_program, p_subject_kind, p_subject_id, p_amount, p_reason,
          p_origin_year, p_origin_month, p_ref_order_id, nullif(p_note, ''), auth.uid())
  returning id into v_id;

  select coalesce(sp.name, u.name) into v_who
  from (select 1) x
  left join salespersons sp on p_subject_kind = 'salesperson' and sp.id = p_subject_id
  left join app_users  u  on p_subject_kind = 'hq_user'     and u.id  = p_subject_id;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()), (select name from app_users where id = auth.uid()),
          format('Commission adjustment - %s - RM %s (%s) on %s/%s',
                 coalesce(v_who, '-'), p_amount, p_reason, p_month, p_year),
          v_id::text);

  return v_id;
end;
$$;

-- ── I. the frozen statement read ─────────────────────────────────────────────

create or replace function public.commission_run_detail(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_run commission_runs%rowtype; v_out jsonb;
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_run from commission_runs where id = p_run_id;
  if not found then raise exception 'run_not_found'; end if;

  select jsonb_build_object(
    'id', v_run.id, 'year', v_run.year, 'month', v_run.month,
    'program', v_run.program, 'status', v_run.status, 'note', v_run.note,
    'closedAt', v_run.closed_at, 'approvedAt', v_run.approved_at, 'paidAt', v_run.paid_at,
    'closedByName',   (select name from app_users a where a.id = v_run.closed_by),
    'approvedByName', (select name from app_users a where a.id = v_run.approved_by),
    'totalCommission', v_run.total_commission,
    'totalAdjustments', v_run.total_adjustments,
    'totalPayable', v_run.total_payable,
    'peopleCount', v_run.people_count,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subjectKind', rl.subject_kind, 'subjectId', rl.subject_id,
        'staffCode', rl.staff_code, 'name', rl.name, 'storeName', rl.store_name,
        'orderCount', rl.order_count, 'basis', rl.basis, 'ratePct', rl.rate_pct,
        'direct', rl.direct, 'override', rl.override, 'perModel', rl.per_model,
        'milestone', rl.milestone, 'kpiBonus', rl.kpi_bonus,
        'adjustments', rl.adjustments, 'total', rl.total, 'breakdown', rl.breakdown)
        order by rl.total desc, rl.name)
      from commission_run_lines rl where rl.run_id = p_run_id), '[]'::jsonb),
    'adjustmentRows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id, 'subjectKind', ca.subject_kind, 'subjectId', ca.subject_id,
        'amount', ca.amount, 'reason', ca.reason, 'note', ca.note,
        'originYear', ca.origin_year, 'originMonth', ca.origin_month,
        'refOrderId', ca.ref_order_id,
        'refSo', (select o.so from orders o where o.id = ca.ref_order_id))
        order by ca.entered_at)
      from commission_adjustments ca where ca.run_id = p_run_id), '[]'::jsonb))
  into v_out;

  return v_out;
end;
$$;

create or replace function public.commission_runs_list(p_limit int default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'year', r.year, 'month', r.month, 'program', r.program,
      'status', r.status, 'peopleCount', r.people_count,
      'totalPayable', r.total_payable,
      'closedAt', r.closed_at, 'approvedAt', r.approved_at, 'paidAt', r.paid_at,
      'closedByName',   (select name from app_users a where a.id = r.closed_by),
      'approvedByName', (select name from app_users a where a.id = r.approved_by))
      order by r.year desc, r.month desc, r.program)
    from (select * from commission_runs
           order by year desc, month desc limit greatest(p_limit, 1)) r), '[]'::jsonb);
end;
$$;

-- ── J. the attribution lock ──────────────────────────────────────────────────
-- Rewritten PROGRAMMATICALLY rather than by retyping the body: hr_assign_salesperson
-- is live and large, and a stray edit while copying it is exactly how a gate gets
-- broken. Same technique 0266 used for the eight hr_* gates. Signature verified as a
-- single overload before touching it (memory rule: no CREATE OR REPLACE blind).

create or replace function public._commission_assert_order_month_open(p_order_id uuid)
returns void
language plpgsql
stable
as $$
declare v_placed timestamptz;
begin
  select placed_at into v_placed from public.orders where id = p_order_id;
  if v_placed is null then return; end if;
  if public._commission_month_locked(
       extract(year from v_placed)::int, extract(month from v_placed)::int, 'staff') then
    raise exception 'commission_month_locked'
      using detail = to_char(v_placed, 'Month YYYY')
        || ' is approved — reopen the run before changing who gets credit for it.';
  end if;
end;
$$;

do $$
declare
  v_def text;
  v_new text;
  v_anchor text := '    raise exception ''forbidden'' using errcode = ''42501'';
  end if;
';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hr_assign_salesperson';

  if v_def is null then raise exception 'hr_assign_salesperson not found'; end if;

  if position('_commission_assert_order_month_open' in v_def) > 0 then
    raise notice 'attribution guard already present — nothing to do';
    return;
  end if;

  -- the anchor must be unambiguous or we are editing the wrong place
  v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'expected exactly 1 gate anchor in hr_assign_salesperson, found %', v_hits;
  end if;

  v_new := replace(v_def, v_anchor,
    v_anchor || '
  perform public._commission_assert_order_month_open(p_order_id);
');
  execute v_new;
end $$;

-- ── K. sanity ────────────────────────────────────────────────────────────────

do $$
declare v_n int;
begin
  -- the guard landed
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hr_assign_salesperson'
    and position('_commission_assert_order_month_open' in pg_get_functiondef(p.oid)) > 0;
  if v_n <> 1 then raise exception 'attribution guard not installed (% matches)', v_n; end if;

  -- and we did not accidentally mint an overload
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hr_assign_salesperson';
  if v_n <> 1 then raise exception 'hr_assign_salesperson has % overloads', v_n; end if;

  raise notice 'commission runs installed; attribution + rate month-lock armed';
end $$;
