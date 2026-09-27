-- =============================================================================
-- 0592_a_shared_login_is_not_a_person.sql
-- Orders MASTER §0.1 · WHO ACTED IS DECIDED ONCE, ON THE SERVER, AND A SHARED
-- LOGIN IS NOT A PERSON (owner ruling 2026-09-26, Jess).
--
-- MEASURED ON PRODUCTION 2026-09-25: SO-1365 printed `principal · Principal`
-- and `Recorded by principal`; SO-1319 printed `Operations · Operation`. The
-- History and Revisions reader asks `actor_display_names` (0390), which
-- returns (id, name) and so cannot tell a person from a shared role login:
-- `principal@carres.com` carries a name and `app_users.is_person = false`
-- (0533).
--
-- WHAT THIS ADDS: one read-only definer door beside 0390, returning the two
-- facts the ruling needs — the account's role and its governed person marker.
-- 0390 is left exactly as it is: its callers and its return type do not move.
--
-- SAME GUARD AS 0390: internal-staff rows only, to operation / principal
-- readers only. NO TABLE POLICY CHANGES (no RLS change), no write, and NO ROW
-- COUNT IS ASSERTED (CLAUDE.md §5.8).
--
-- IDEMPOTENT: `create or replace`. Safe to re-run.
-- =============================================================================

begin;
set search_path = public, pg_temp;

create or replace function public.actor_identities(p_ids uuid[])
returns table (id uuid, name text, role text, is_person boolean)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.name, u.role::text, u.is_person
  from public.app_users u
  where u.id = any(coalesce(p_ids, '{}'))
    and u.role in ('principal','operation','finance','bd','hr','warehouse')
    and (select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal')
$$;

comment on function public.actor_identities(uuid[]) is
  'Resolves internal-staff actor ids to (id, name, role, is_person) for the '
  'History/Revisions record grammar: an account with is_person = false is a '
  'shared login, a robot or a test account and is never printed as a person. '
  'Internal-staff rows only, operation/principal readers only. 0592.';

revoke execute on function public.actor_identities(uuid[]) from anon, public;
grant execute on function public.actor_identities(uuid[]) to authenticated;

commit;

-- ── VERIFY (run by hand; this file asserts no row count — red line 8) ────────
--
--   select * from public.actor_identities(
--     array['11111111-1111-1111-1111-000000000001']::uuid[]);
--
-- Under an operation or principal JWT a shared login answers is_person = false;
-- under any other role the function returns no row.
