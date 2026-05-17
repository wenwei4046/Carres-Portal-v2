-- Migration 0121: rename role "logistics" → "operation" across the schema.
--
-- Authorised in conversation 2026-05-17 by Loo (per CLAUDE.md §8 #4 RLS change
-- + §7 schema change + §14 #2 explicit single-instance approval). User picked
-- "rename everything (incl. column + function names)" after seeing the trade-offs.
--
-- Scope of the rename:
--   - app_role               enum value: 'logistics'                  → 'operation'
--   - warehouse_kind         enum value: 'logistics_partner'          → 'operation_partner'
--   - logistics_stage        enum value: 'awaiting_logistics_action'  → 'awaiting_operation_action'
--   - logistics_stage        TYPE itself                              → operation_stage
--   - orders.logistics_stage column                                   → orders.operation_stage
--   - order_supplier_threads.logistics_stage column                   → order_supplier_threads.operation_stage
--   - orders_logistics_idx                                            → orders_operation_idx
--   - 32 function names with logistics_*/is_logistics prefix          → operation_*/is_operation
--   - 58 function bodies + 15 policy expressions (text replace)       → updated to new names/literals
--
-- Approach: snapshot all dependent functions + policies BEFORE renaming structures,
-- drop them, perform structure renames (atomic via ALTER TYPE/COLUMN), then recreate
-- functions + policies with text-replaced bodies referring to the new names.
--
-- KEPT (noun usage, not the role — consistent with supplier_kind.own_logistics):
--   - supplier_kind.own_logistics (supplier handles their own shipping)
--   - There are no further `logistics_*` enum/column names beyond those listed above.
--
-- One-shot migration; not idempotent. Wrapped in a single transaction by apply_migration.

-- ============================================================
-- Phase A: Snapshot policies + functions BEFORE any rename
-- (text deparse reflects current names; we text-replace these snapshots below)
-- ============================================================

create temp table _func_snap on commit drop as
select n.nspname                                       as schema_name,
       p.proname                                       as func_name,
       pg_get_function_identity_arguments(p.oid)       as args,
       pg_get_functiondef(p.oid)                       as def_text,
       (p.proname ~ '^_?logistics_' or p.proname = 'is_logistics') as rename_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f'
  and p.prolang in (select oid from pg_language where lanname in ('sql','plpgsql'))
  and n.nspname in ('public','app','auth','storage')
  and (pg_get_functiondef(p.oid) ~ 'logistic' or p.proname ~ 'logistic');

create temp table _policy_snap on commit drop as
select schemaname, tablename, policyname,
       permissive, roles, cmd,
       qual, with_check
from pg_policies
where qual ~ 'logistic' or with_check ~ 'logistic';

-- ============================================================
-- Phase B: Drop policies (they reference logistics_stage column / 'logistics' literal)
-- ============================================================
do $$
declare r record;
begin
  for r in select * from _policy_snap loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ============================================================
-- Phase C: Drop the 32 functions whose NAME starts with logistics_/is_logistics
-- (we'll recreate with new operation_* names; body-only updates use CREATE OR REPLACE)
-- ============================================================
do $$
declare r record;
begin
  for r in select * from _func_snap where rename_name loop
    execute format('drop function if exists %I.%I(%s)',
                   r.schema_name, r.func_name, r.args);
  end loop;
end $$;

-- ============================================================
-- Phase D: Rename DB structures (fast, atomic via catalog)
-- Order matters: columns → enum type → enum values → indexes
-- ============================================================

alter table public.orders                  rename column logistics_stage to operation_stage;
alter table public.order_supplier_threads  rename column logistics_stage to operation_stage;

alter type public.logistics_stage rename to operation_stage;

alter type public.app_role         rename value 'logistics'                  to 'operation';
alter type public.operation_stage  rename value 'awaiting_logistics_action'  to 'awaiting_operation_action';
alter type public.warehouse_kind   rename value 'logistics_partner'          to 'operation_partner';

alter index public.orders_logistics_idx rename to orders_operation_idx;

-- ============================================================
-- Phase E: Recreate functions with text-replaced bodies
-- Replacement pipeline (order matters — most-specific first):
--   1. compound literals: 'awaiting_logistics_action', 'logistics_partner'
--   2. column/type identifier `logistics_stage` (word-boundary)
--   3. plain role literal: 'logistics' → 'operation'
--   4. helper rename: is_logistics → is_operation
--   5. private helpers: _logistics_X → _operation_X
--   6. public funcs:   logistics_X  → operation_X
-- ============================================================
do $$
declare
  r       record;
  new_def text;
begin
  for r in select * from _func_snap loop
    new_def := r.def_text;
    new_def := replace(new_def, '''awaiting_logistics_action''', '''awaiting_operation_action''');
    new_def := replace(new_def, '''logistics_partner''',         '''operation_partner''');
    new_def := regexp_replace(new_def, '\mlogistics_stage\M',    'operation_stage', 'g');
    new_def := replace(new_def, '''logistics''',                 '''operation''');
    new_def := regexp_replace(new_def, '\mis_logistics\M',       'is_operation',    'g');
    new_def := regexp_replace(new_def, '\m_logistics_',          '_operation_',     'g');
    new_def := regexp_replace(new_def, '\mlogistics_',           'operation_',      'g');

    -- Try CREATE OR REPLACE; if signature changed (RETURN TABLE column rename) PG raises 42P13.
    -- Fall back to DROP + CREATE in that case. CASCADE handles dependent objects on the way out;
    -- triggers based on these functions are body-only (no signature change), so they hit the
    -- happy path and never reach this fallback.
    begin
      execute new_def;
    exception when sqlstate '42P13' then
      execute format('drop function if exists %I.%I(%s) cascade',
                     r.schema_name, r.func_name, r.args);
      execute new_def;
    end;
  end loop;
end $$;

-- ============================================================
-- Phase F: Recreate policies with text-replaced expressions
-- Reconstruct CREATE POLICY from pg_policies snapshot columns
-- ============================================================
do $$
declare
  r              record;
  new_qual       text;
  new_check      text;
  new_pol_name   text;
  cmd_text       text;
  roles_text     text;
  policy_sql     text;
begin
  for r in select * from _policy_snap loop
    new_qual  := r.qual;
    new_check := r.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, '''awaiting_logistics_action''', '''awaiting_operation_action''');
      new_qual := replace(new_qual, '''logistics_partner''',         '''operation_partner''');
      new_qual := regexp_replace(new_qual, '\mlogistics_stage\M',    'operation_stage', 'g');
      new_qual := replace(new_qual, '''logistics''',                 '''operation''');
      new_qual := regexp_replace(new_qual, '\mis_logistics\M',       'is_operation',    'g');
      new_qual := regexp_replace(new_qual, '\m_logistics_',          '_operation_',     'g');
      new_qual := regexp_replace(new_qual, '\mlogistics_',           'operation_',      'g');
    end if;

    if new_check is not null then
      new_check := replace(new_check, '''awaiting_logistics_action''', '''awaiting_operation_action''');
      new_check := replace(new_check, '''logistics_partner''',         '''operation_partner''');
      new_check := regexp_replace(new_check, '\mlogistics_stage\M',    'operation_stage', 'g');
      new_check := replace(new_check, '''logistics''',                 '''operation''');
      new_check := regexp_replace(new_check, '\mis_logistics\M',       'is_operation',    'g');
      new_check := regexp_replace(new_check, '\m_logistics_',          '_operation_',     'g');
      new_check := regexp_replace(new_check, '\mlogistics_',           'operation_',      'g');
    end if;

    new_pol_name := replace(r.policyname, 'logistics', 'operation');

    cmd_text := case r.cmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      when '*' then 'all'
      else r.cmd
    end;

    select string_agg(quote_ident(rn), ', ') into roles_text from unnest(r.roles) rn;
    if roles_text is null or roles_text = '' then roles_text := 'public'; end if;

    policy_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      new_pol_name, r.schemaname, r.tablename,
      r.permissive, cmd_text, roles_text
    );
    if new_qual  is not null then policy_sql := policy_sql || ' using ('      || new_qual  || ')'; end if;
    if new_check is not null then policy_sql := policy_sql || ' with check (' || new_check || ')'; end if;

    execute policy_sql;
  end loop;
end $$;

-- ============================================================
-- Phase G: Rename the user-facing name "Logistics · Carres HQ" → "Operations · Carres HQ"
-- (auth.users email rename happens OUT-OF-BAND via execute_sql post-migration —
--  keeps the schema migration boundary clean and avoids cross-schema permission risks)
-- ============================================================
update public.app_users
   set name = replace(name, 'Logistics', 'Operations')
 where role = 'operation' and name like '%Logistics%';
