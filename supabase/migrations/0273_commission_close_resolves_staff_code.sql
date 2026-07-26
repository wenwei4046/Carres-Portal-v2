-- 0273_commission_close_resolves_staff_code (2026-07-26, HR-P5 follow-up).
-- Tail was 0272_commission_runs; identity args re-checked before CREATE OR REPLACE
-- (identical signature, so no ghost overload).
--
-- WHY: the CSV's `staff_code` column is the join key the payroll service matches on,
-- and 0272 took it from the caller's payload. But `CommissionStaff` - the engine's
-- staff type - carries no staff code, so Hono had nothing to send and every row would
-- have exported blank. The code lives on `salespersons`; this function is SECURITY
-- DEFINER and can simply read it there.
--
-- The payload value is still honoured when present (an hq_user line, or a future
-- caller that does know the code); the lookup is the fallback, not an override.
--
-- The body is IDENTICAL to 0272 apart from the staff_code expression in the INSERT.
-- Kept whole rather than diffed because CREATE OR REPLACE needs the whole function.

create or replace function public.commission_close_month(
  p_year int, p_month int, p_program text, p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
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

  -- THE guard that matters today: a person who sold and earns nothing means no rate
  -- is configured. Freezing that immortalises a mistake and then locks the month.
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
    -- 0273: payload wins when it has one; otherwise read it where it actually lives
    coalesce(
      nullif(l->>'staffCode', ''),
      (select sp.staff_code from salespersons sp where sp.id = (l->>'subjectId')::uuid),
      (select u.staff_code  from app_users   u  where u.id  = (l->>'subjectId')::uuid)),
    coalesce(nullif(l->>'name', ''), '-'),
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
$fn$;

do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'commission_close_month';
  if v_n <> 1 then raise exception 'commission_close_month has % overloads', v_n; end if;
  raise notice 'close now resolves staff_code from salespersons/app_users';
end $$;
