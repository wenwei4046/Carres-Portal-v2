-- =============================================================================
-- 0534_finance_reads_refuse_a_signed_in_caller_with_no_role.sql
-- =============================================================================
-- WHAT WAS WRONG, MEASURED
--   app_role() is NULL for a signed-in account with no active role, for
--   example a disabled one (0266). A gate written
--       if public.app_role() not in ('finance','principal') then raise ...
--   never raises for that caller: NULL not in (...) is NULL. The API refuses
--   the caller (requireFinance); the database let them through.
--   0503 fixed the finance gates only where the live body still matched the
--   repo text by md5. On production finance_dashboard_summary and
--   finance_monthly_pl had drifted (earlier sweeps such as 0123/0125/0126
--   rewrote bodies in place), so 0503 left them untouched and NULL-blind
--   (docs/carry-forwards.md, null-role-gates-left-untouched-by-the-0500-
--   and-0503-guards, measured 17 Sep 2026).
--
-- WHAT THIS CHANGES
--   For every SECURITY DEFINER function public.finance_*:
--     - The role gate is rewritten IN PLACE on the live definition, the same
--       way 0123/0126 rewrote bodies: only the NULL-blind gate text changes.
--           app_role() not in (...)   ->  (app_role() is null or app_role() not in (...))
--           app_role() <> '...'       ->  (app_role() is null or app_role() <> '...')
--       (also for the (select public.app_role()) spelling). A gate that is
--       already null-safe is preceded by "is null or " and is skipped, so a
--       function 0481/0503 already fixed is not recreated.
--       Why in place and not a pasted body: the repo's latest body for the
--       two drifted functions (0503) is not what production runs; recreating
--       from it would silently revert the sweeps that changed them. Rewriting
--       only the gate is the one change that is the same on every copy.
--     - EXECUTE is taken from public and anon; authenticated keeps EXECUTE
--       exactly where it had it before (no function gains a grant).
--   Nothing is dropped. The API stopped calling some of these in #1414; they
--   stay on purpose.
--   A caller who has a role is tested exactly as before; the only new
--   outcome is 42501 'forbidden' for a caller with no role.
--
-- PROOF (final block, rolls the whole migration back on failure)
--   - no public.finance_* definer body still carries a NULL-blind gate;
--   - anon holds EXECUTE on none of them;
--   - authenticated lost EXECUTE on none it had.
--
-- RLS: none. DR/CR: none. Running it twice is harmless (second run rewrites
-- nothing).
-- =============================================================================

begin;

create temp table _auth_before_0534 (fn regprocedure primary key) on commit drop;
insert into _auth_before_0534
  select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'finance\_%' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');

do $g0534$
declare
  r record;
  -- the role expression, in either spelling used in this repo
  x constant text := '(\(select public\.app_role\(\)\)|(?:public\.)?app_role\(\))';
  b text;
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'finance\_%' and p.prosecdef
  loop
    b := regexp_replace(r.def,
           '(?<!is null or )(?<![a-z0-9_.])' || x || '\s+not\s+in\s*\(([^()]*)\)',
           '(\1 is null or \1 not in (\2))', 'gi');
    b := regexp_replace(b,
           '(?<!is null or )(?<![a-z0-9_.])' || x || '\s*<>\s*(''[a-z_]+'')',
           '(\1 is null or \1 <> \2)', 'gi');
    if b <> r.def then
      execute b;
      raise notice '0534: gate made null-safe on %', r.oid::regprocedure;
    end if;

    execute format('revoke all on function %s from public, anon', r.oid::regprocedure);
    if exists (select 1 from _auth_before_0534 a where a.fn = r.oid) then
      execute format('grant execute on function %s to authenticated', r.oid::regprocedure);
    end if;
  end loop;
end
$g0534$;

do $proof0534$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'finance\_%' and p.prosecdef
     and p.prosrc ~* '(?<!is null or )(?<![a-z0-9_.])(\(select public\.app_role\(\)\)|(?:public\.)?app_role\(\))\s*(not\s+in\s*\(|<>)';
  if bad is not null then
    raise exception '0534: still NULL-blind: %', bad;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'finance\_%' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if bad is not null then
    raise exception '0534: anon can still execute: %', bad;
  end if;

  select string_agg(a.fn::text, ', ') into bad
    from _auth_before_0534 a
   where not has_function_privilege('authenticated', a.fn, 'execute');
  if bad is not null then
    raise exception '0534: authenticated lost execute on: %', bad;
  end if;
end
$proof0534$;

commit;
