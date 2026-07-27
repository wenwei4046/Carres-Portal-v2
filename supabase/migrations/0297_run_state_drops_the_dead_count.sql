-- 0297 — the last thing still counting orders nobody has to assign.
--
-- 0296 made "every order names who sold it" a constraint, and PR #435 deleted
-- the screen that used to repair the exceptions. `commission_run_state` was
-- still computing an `unattributed` count on every pre-flight read and shipping
-- it in the payload: nothing in the app has read it since #435, the zod schema
-- no longer describes it, and with `orders_salesperson_required` in force the
-- number it returns is provably 0 for every native showroom order.
--
-- Only that key changes. `run`, `pendingAdjustments` and `locked` are
-- byte-identical, the hr/principal gate is untouched, and the STABLE marker is
-- kept (CLAUDE.md §8 fix 3 — dropping it defeats the planner's caching).
--
-- NOT touched, deliberately: `hr_commission_source` still builds an
-- `unattributed` ARRAY. Its `legacyUnattributed` sibling is still read (the
-- Overview archive footnote), the array now resolves to '[]' by construction,
-- and rewriting a 6.6k-character function that feeds every HR screen to delete
-- a key that costs nothing is a worse trade than leaving it. The API stopped
-- forwarding it, so nothing carries it past the Worker.

CREATE OR REPLACE FUNCTION public.commission_run_state(p_year integer, p_month integer, p_program text DEFAULT 'staff'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run commission_runs%rowtype;
  v_pending numeric(12,2);
begin
  if coalesce((select public.app_role())::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_run from commission_runs
  where year = p_year and month = p_month and program = p_program and status <> 'void';

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
    'pendingAdjustments', v_pending,
    'locked', public._commission_month_locked(p_year, p_month, p_program));
end;
$function$;

-- ── sanity, asserted by the migration itself ─────────────────────────────────
-- The dead-key assertion matches the QUOTED json key, not the bare word, so it
-- cannot match this file's own commentary about the key (0296 lesson 9).
do $sanity$
declare v_src text; v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commission_run_state';
  if v_n <> 1 then raise exception 'SANITY: % copies of commission_run_state', v_n; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commission_run_state';

  if position('''unattributed''' in v_src) > 0 then
    raise exception 'SANITY: the dead key is still built';
  end if;
  if position('pendingAdjustments' in v_src) = 0
     or position('''locked''' in v_src) = 0
     or position('peopleCount' in v_src) = 0
     or position('42501' in v_src) = 0 then
    raise exception 'SANITY: a key or the role gate was lost in the rewrite';
  end if;
  if position('STABLE' in v_src) = 0 then
    raise exception 'SANITY: lost the STABLE marker (CLAUDE.md 8, fix 3)';
  end if;
end $sanity$;
