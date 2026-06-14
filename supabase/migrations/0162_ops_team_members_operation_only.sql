-- =============================================================================
-- 0162_ops_team_members_operation_only.sql
-- BACKFILL (2026-06-14): verbatim copy of the migration applied to staging=prod
-- on 2026-06-12 via Supabase MCP (recorded in schema_migrations as
-- "ops_team_members_operation_only", version 20260612073902). NOT re-applied.
-- =============================================================================

-- 0164_ops_team_members_operation_only.sql
-- Tasks assign-to dropdown: operation-role only (drop principal) + drop the
-- "· Carres HQ" tail on the shared operation login → reads "Operations".

create or replace function public.ops_team_members()
  returns table(id uuid, name text, email text, role text)
  language sql
  stable security definer
  set search_path to 'public'
as $function$
  select id, name, email, role::text from app_users
  where role = 'operation'
    and (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal')
  order by name;
$function$;

update app_users
   set name = 'Operations'
 where id = '22222222-2222-2222-2222-000000000002'
   and name = 'Operations · Carres HQ';
