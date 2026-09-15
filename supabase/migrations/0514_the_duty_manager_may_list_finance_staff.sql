-- =============================================================================
-- 0514_the_duty_manager_may_list_finance_staff.sql
-- =============================================================================
-- WHAT WAS WRONG
--   Workspace -> Staff & Duties lists the Finance Approver duty (0508). Its
--   holder and cover pickers must offer Finance users, because
--   has_finance_approver (0508) says yes only to the principal or to an active
--   Finance user who is today's finance_approver actor. But the pickers read
--   app_users with the caller's own login, and an operation login may read
--   only operation rows (app_users_operation_peers_read, 0235). The duty
--   manager (an operation account holding ops_manager) therefore cannot see a
--   single Finance user, and assigning an operation person instead leaves
--   nobody but the principal able to approve.
--
-- WHAT THIS CHANGES
--   One new read function, workspace_duty_staff(p_roles text[]). It returns
--   (id, name, email) of ACTIVE accounts whose role is in p_roles, and:
--     - only to a caller who may assign duties: the same
--       workspace_duty_settings_gate (0500) the assign and cover doors use,
--       so the principal or an ops_manager. Anyone else is refused (42501).
--     - only for roles a duty holder may have (principal, operation,
--       finance, bd -- 0511). Any other role in p_roles returns nothing.
--   Which roles a duty's pickers offer lives in the shared catalogue
--   (packages/shared/src/workspace-duties-catalogue.ts); the API passes them.
--   No table policy changes: an operation login still reads only operation
--   rows of app_users directly. Grants: revoked from public and anon, granted
--   to authenticated.
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.workspace_duty_staff(p_roles text[])
returns table (id uuid, name text, email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.workspace_duty_settings_gate();
  return query
    select u.id, u.name::text, u.email::text
      from public.app_users u
     where u.status = 'active'
       and u.role::text = any(coalesce(p_roles, '{}'::text[]))
       and u.role::text in ('principal', 'operation', 'finance', 'bd')
     order by u.email;
end;
$fn$;

comment on function public.workspace_duty_staff(text[]) is
  'Active accounts of the given roles (holder roles only) for the Staff & '
  'Duties holder and cover pickers. Only to a caller who may assign duties. '
  '0514.';

revoke all on function public.workspace_duty_staff(text[]) from public, anon;
grant execute on function public.workspace_duty_staff(text[]) to authenticated;

commit;

-- ── VERIFY (run by hand; asserts no row count, red line 8) ───────────────────
--   As the principal or an ops_manager:
--     select * from public.workspace_duty_staff(array['finance']);
--   lists the active Finance users. As any other login it raises 42501.
