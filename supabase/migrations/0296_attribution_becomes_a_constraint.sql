-- 0296 — attribution stops being a worklist and becomes a rule.
--
-- Loo, 2026-07-27: "all order will be compulsory have sales man, cause is all
-- from pos system order; those no sales man is testimony import from our
-- previous system, which will delete later on."
--
-- Measured against live prod before writing this: of 56 orders, the 19 native
-- ones ALL carry a salesperson and the 37 without one are `source_system =
-- 'autocount'` archive rows. Of the four functions that INSERT INTO orders,
-- three (create_order, order_create, create_rental_agreement) stamp
-- salesperson_id in the INSERT itself; only _import_autocount_order does not.
--
-- PR #435 deleted the app-side repair screen. This makes the rule real where it
-- belongs -- at write time -- and removes the two DB remnants that outlived it:
--
--   1. hr_assign_salesperson: the repair RPC. Nothing calls it any more.
--   2. commission_close_month's blocking close gate, whose remedy screen is
--      gone. With (3) in force it could only ever pass.
--   3. orders_salesperson_required: the guarantee itself.
--
-- The CHECK uses coalesce(), NOT a bare `=`. With both columns NULL the bare
-- form `source_system = 'autocount'` evaluates to NULL, `false OR NULL` is
-- NULL, and a CHECK ACCEPTS NULL -- the constraint would have guarded nothing.
-- The dry run caught exactly that before this was applied.
--
-- The exemption is `= 'autocount'` and not `IS NOT NULL` on purpose:
-- create_rental_agreement writes `source_system = 'rental'`, so the loose form
-- would have exempted every rental order -- the one path whose p_salesperson_id
-- parameter DEFAULTs to NULL, i.e. precisely where the hole was. A future
-- importer must be added to this list deliberately; that is the point.

-- ── 1. the repair RPC goes ───────────────────────────────────────────────────
drop function if exists public.hr_assign_salesperson(uuid, uuid);

-- ── 2. the guarantee ─────────────────────────────────────────────────────────
alter table public.orders
  add constraint orders_salesperson_required
  check (salesperson_id is not null or coalesce(source_system, '') = 'autocount');

comment on constraint orders_salesperson_required on public.orders is
  'Every order the portal writes names who sold it (Loo 2026-07-27). Only imported archive rows (source_system = ''autocount'') may lack a salesperson -- they predate the portal. A new importer must be added here deliberately.';

-- ── 3. the close-month gate that no longer has a remedy ──────────────────────
CREATE OR REPLACE FUNCTION public.commission_close_month(p_year integer, p_month integer, p_program text, p_lines jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_l jsonb;
  v_zero int := 0;
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

  -- 0296: the old "every sale has a salesperson" gate is GONE. Attribution was
  -- retired whole (Loo 2026-07-27) and `orders_salesperson_required` now
  -- refuses a native order with no salesperson at INSERT time, so this could
  -- only ever pass -- and the screen that used to clear it no longer exists.

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
$function$;

-- ── sanity, asserted by the migration itself ─────────────────────────────────
-- NOTE: the gate assertion matches the RAISE form, not the bare word. A first
-- attempt matched the bare word and caught this file's own comment about the
-- gate, aborting a migration that was otherwise correct.
do $sanity$
declare v_src text; v_n int;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'hr_assign_salesperson') then
    raise exception 'SANITY: hr_assign_salesperson survived the drop';
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'orders_salesperson_required'
                   and conrelid = 'public.orders'::regclass and convalidated) then
    raise exception 'SANITY: orders_salesperson_required missing or NOT VALID';
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commission_close_month';
  if v_n <> 1 then raise exception 'SANITY: % copies of commission_close_month', v_n; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commission_close_month';
  if position('raise exception ''unattributed_orders''' in v_src) > 0 then
    raise exception 'SANITY: the close gate is still raised';
  end if;
  if position('zero_rate_sellers' in v_src) = 0
     or position('run_already_exists' in v_src) = 0
     or position('42501' in v_src) = 0 then
    raise exception 'SANITY: a guard that must survive was lost in the rewrite';
  end if;
end $sanity$;
