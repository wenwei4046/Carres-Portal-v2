-- 0164_ops_team_members_operation_only.sql
--
-- Jess (COO) on the Tasks assign-to dropdown: "remove principal, Operation only
-- (remove HQ)". The dropdown was listing principal + a generic "Operations ·
-- Carres HQ" shared account alongside the real operators (Samantha, Shasha).
--
--   PART A — ops_team_members now returns role='operation' ONLY (drops principal
--            from the assignable list). The CALLER guard still allows principal
--            so the COO can open the dropdown and assign work; it's only the
--            returned MEMBERS that are narrowed to the operation team.
--   PART B — drop the "· Carres HQ" tail on the shared operation login so the
--            dropdown (and every task created_by / claimed_by label) reads just
--            "Operations". Tightly scoped to that one row by id + exact name so
--            re-running is a no-op.
--
-- Read-only function + a 1-row cosmetic rename. No schema change, no data loss.

-- ── PART A ──────────────────────────────────────────────────────────────────
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

-- ── PART B ──────────────────────────────────────────────────────────────────
update app_users
   set name = 'Operations'
 where id = '22222222-2222-2222-2222-000000000002'
   and name = 'Operations · Carres HQ';
