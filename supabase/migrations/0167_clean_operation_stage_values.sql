-- =============================================================================
-- 0167_clean_operation_stage_values.sql — Phase 11.2 (middle path)
-- 2026-06-14 (Loo authorised "go with your recommended" — the lower-risk
-- middle path: keep orders.status as the stable business anchor, only clean up
-- operation_stage's value set).
--
-- WHY this is LOW RISK: orders.status is UNTOUCHED, so every guard that uses
-- status='proceed_order' as the "in active fulfilment" anchor keeps working.
-- We only remap operation_stage VALUE LITERALS (mechanical, 0121-pattern). No
-- guard-semantic rewrites, no axis collapse.
--
-- VALUE CHANGES (7 -> 6):
--   placed                    -> confirmed         (retired; folds into confirmed)
--   proceed_request           -> confirmed
--   awaiting_operation_action -> in_production
--   ready_to_dispatch         -> ready_to_dispatch (unchanged)
--   waiting                   -> waiting           (KEPT — relocated-WH edge case)
--   dispatched                -> dispatched        (unchanged)
--   delivered                 -> delivered         (unchanged)
--
-- Self-adaptive: snapshots whatever operation_stage functions exist on the
-- TARGET db, remaps the 3 changed literals, swaps the enum type, recreates.
-- Applied to a Supabase test branch for syntax/structure validation; prod apply
-- happens in a coordinated window alongside the api+web deploy.
-- =============================================================================

do $migration$
declare
  r record;
  v_def text;
begin
  -- ---- PASS A: snapshot every function whose body references operation_stage
  create temporary table _op_fn_snapshot on commit drop as
  select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ilike '%operation_stage%';

  -- ---- PASS B: drop the 3 sync triggers (depend on the trigger functions)
  drop trigger if exists orders_rollup_stage_after_thread_change on order_supplier_threads;
  drop trigger if exists orders_auto_status_delivered_trg on orders;
  drop trigger if exists orders_auto_issue_on_dispatched_trg on orders;

  -- ---- PASS C: drop all snapshotted functions. NO cascade — plpgsql
  --             function-to-function calls are late-bound (not catalog deps),
  --             so plain drops succeed and we never over-drop a non-snapshot
  --             function. All signature/return users of the type ARE in the
  --             snapshot (the type name shows up in pg_get_functiondef).
  for r in select sig from _op_fn_snapshot loop
    execute format('drop function if exists %s', r.sig);
  end loop;

  -- ---- PASS D: swap the enum type (rename old, create clean new, migrate
  --             columns with the value mapping, drop old)
  alter type public.operation_stage rename to operation_stage_old;

  create type public.operation_stage as enum (
    'confirmed',
    'in_production',
    'ready_to_dispatch',
    'waiting',
    'dispatched',
    'delivered'
  );

  alter table public.orders
    alter column operation_stage type public.operation_stage
    using (
      case operation_stage::text
        when 'placed'                    then 'confirmed'
        when 'proceed_request'           then 'confirmed'
        when 'awaiting_operation_action' then 'in_production'
        else operation_stage::text
      end::public.operation_stage
    );

  alter table public.order_supplier_threads
    alter column operation_stage type public.operation_stage
    using (
      case operation_stage::text
        when 'placed'                    then 'confirmed'
        when 'proceed_request'           then 'confirmed'
        when 'awaiting_operation_action' then 'in_production'
        else operation_stage::text
      end::public.operation_stage
    );

  drop type public.operation_stage_old;

  -- ---- PASS E: recreate every snapshotted function with the 3 changed literals
  --             remapped. `replace` on the fully-quoted token is safe: column
  --             refs (operation_stage, placed_at) are unquoted and text like
  --             "awaiting logistics" never contains the quoted token 'placed' /
  --             'proceed_request' / 'awaiting_operation_action'.
  for r in select def from _op_fn_snapshot loop
    v_def := r.def;
    v_def := replace(v_def, '''placed''',                    '''confirmed''');
    v_def := replace(v_def, '''proceed_request''',           '''confirmed''');
    v_def := replace(v_def, '''awaiting_operation_action''', '''in_production''');
    execute v_def;
  end loop;

  -- ---- PASS F: recreate the 3 sync triggers
  create trigger orders_rollup_stage_after_thread_change
    after insert or update or delete on order_supplier_threads
    for each row execute function public.orders_rollup_stage_trigger();

  create trigger orders_auto_status_delivered_trg
    before update on orders
    for each row execute function public.orders_auto_status_delivered();

  create trigger orders_auto_issue_on_dispatched_trg
    before update on orders
    for each row execute function public.orders_auto_issue_on_dispatched();

  -- ---- PASS G: sanity — no function body may still reference a retired value
  for r in
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and ( pg_get_functiondef(p.oid) like '%''placed''%'
         or pg_get_functiondef(p.oid) like '%''proceed_request''%'
         or pg_get_functiondef(p.oid) like '%''awaiting_operation_action''%' )
  loop
    raise exception 'PASS G: function % still references a retired operation_stage value', r.proname;
  end loop;
end
$migration$;
