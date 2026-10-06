-- =============================================================================
-- 0514_finance_approver_is_given_to_a_finance_user.sql
-- =============================================================================
-- WHAT WAS WRONG
--   Workspace -> Staff & Duties lists the Finance Approver duty (0508). Since
--   0508, has_finance_approver says yes only to the principal or to an active
--   Finance user who is today's finance_approver actor (holder or cover).
--   1. The pickers could not offer a Finance user. They read app_users with
--      the caller's own login, and an operation login may read only operation
--      rows (app_users_operation_peers_read, 0235). The duty manager is an
--      operation login (ops_manager), so no Finance user ever appeared.
--   2. The doors let any active internal staff hold it. workspace_assign_duty
--      and workspace_cover_duty (0511) accept principal, operation, finance
--      and bd for every duty. An operation, principal or bd holder of
--      finance_approver can never approve, yet the assignment still switches
--      off the HR tick fallback, so only the principal could approve.
--
-- WHAT THIS CHANGES
--   a. workspace_duty_staff(p_roles text[]), a new read. It returns (id, name,
--      email) of ACTIVE accounts whose role is in p_roles and is a holder role
--      (principal, operation, finance, bd -- 0511), and only to a caller who
--      may assign duties (workspace_duty_settings_gate, 0500). Anyone else is
--      refused (42501). The API passes the roles from the shared catalogue
--      (packages/shared/src/workspace-duties-catalogue.ts).
--   b. workspace_duty_holder_roles(p_duty_key), the one place in SQL that
--      says which roles may hold or cover a duty beyond 0511's rule:
--      '{finance}' for finance_approver, NULL (any active internal staff) for
--      every other duty. The next duty that needs a role is one line here.
--   c. workspace_assign_duty and workspace_cover_duty, bodies from 0511 with
--      one check added each: when workspace_duty_holder_roles gives a list,
--      the holder or cover must be an active account with one of those roles.
--      Refused with 22023 and the existing detail (invalid_holder,
--      invalid_cover). The check is `exists (...)`, true or false and never
--      NULL, so a NULL id or a missing account is refused. Every other duty
--      behaves exactly as under 0511.
--   No table policy changes. Rows already written are not touched; the owner
--   check lists any finance_approver holder or cover who is not Finance.
--   Grants on the two doors are unchanged and restated below.
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set search_path = public, pg_temp;

-- ── a · the pickers' list ───────────────────────────────────────────────────

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

-- ── b · which roles may hold a duty ─────────────────────────────────────────

/** The roles that may hold or cover this duty, on top of 0511's "active
 *  internal staff". NULL means no extra rule. */
create or replace function public.workspace_duty_holder_roles(p_duty_key text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case p_duty_key
           when 'finance_approver' then array['finance']
         end
$fn$;

-- ── c · the two doors ───────────────────────────────────────────────────────

-- Body from 0511; only the duty's own role check is added.
create or replace function public.workspace_assign_duty(
  p_duty_key text,
  p_holder_id uuid,
  p_effective_from date,
  p_effective_until date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform public.workspace_duty_settings_gate();
  if p_duty_key is null or p_duty_key !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'a duty key is required' using errcode = '22023', detail = 'invalid_duty_key';
  end if;
  if not public.workspace_is_internal_staff(p_holder_id) then
    raise exception 'the holder must be an active internal staff member'
      using errcode = '22023', detail = 'invalid_holder';
  end if;
  if public.workspace_duty_holder_roles(p_duty_key) is not null
     and not exists (select 1 from public.app_users
                      where id = p_holder_id and status = 'active'
                        and role::text = any(public.workspace_duty_holder_roles(p_duty_key))) then
    raise exception 'the Finance Approver must be an active Finance user'
      using errcode = '22023', detail = 'invalid_holder';
  end if;
  -- A staff member cannot assign themself a duty (workspace/MASTER.md §5).
  -- Principal is the governed exception: Jess assigns, including to herself.
  if p_holder_id = v_uid and ((select public.app_role()) is null or (select public.app_role()) <> 'principal') then
    raise exception 'you cannot assign a duty to yourself'
      using errcode = '42501', detail = 'self_assignment_refused';
  end if;
  if p_effective_from is null then
    raise exception 'an effective date is required' using errcode = '22023', detail = 'invalid_dates';
  end if;
  insert into workspace_duty_assignments
    (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
  values
    (p_duty_key, p_holder_id, p_effective_from, p_effective_until, v_uid,
     nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          coalesce((select name from app_users where id = v_uid), 'Manager'),
          format('Assigned %s to %s from %s%s', p_duty_key,
                 coalesce((select name from app_users where id = p_holder_id), 'staff'),
                 to_char(p_effective_from, 'DD Mon YYYY'),
                 case when p_effective_until is null then ''
                      else ' until ' || to_char(p_effective_until, 'DD Mon YYYY') end),
          p_duty_key);
  return jsonb_build_object('id', v_id, 'duty_key', p_duty_key, 'holder_id', p_holder_id);
end;
$fn$;

-- Body from 0511; only the duty's own role check is added.
create or replace function public.workspace_cover_duty(
  p_duty_key text,
  p_acting_user_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_normal uuid;
  v_id uuid;
begin
  perform public.workspace_duty_settings_gate();
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'the cover needs a valid date window' using errcode = '22023', detail = 'invalid_dates';
  end if;
  v_normal := (public.workspace_resolve_duty(p_duty_key, p_starts_on)->>'normal_user_id')::uuid;
  if v_normal is null then
    raise exception 'no one holds % on % — assign the duty first', p_duty_key, p_starts_on
      using errcode = '22023', detail = 'no_duty_holder';
  end if;
  if p_acting_user_id is null or p_acting_user_id = v_normal
     or not public.workspace_is_internal_staff(p_acting_user_id) then
    raise exception 'the cover must be a different active internal staff member'
      using errcode = '22023', detail = 'invalid_cover';
  end if;
  if public.workspace_duty_holder_roles(p_duty_key) is not null
     and not exists (select 1 from public.app_users
                      where id = p_acting_user_id and status = 'active'
                        and role::text = any(public.workspace_duty_holder_roles(p_duty_key))) then
    raise exception 'the Finance Approver must be an active Finance user'
      using errcode = '22023', detail = 'invalid_cover';
  end if;
  insert into workspace_duty_covers
    (duty_key, normal_user_id, acting_user_id, starts_on, ends_on, reason, assigned_by)
  values
    (p_duty_key, v_normal, p_acting_user_id, p_starts_on, p_ends_on,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid)
  returning id into v_id;
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          coalesce((select name from app_users where id = v_uid), 'Manager'),
          format('Cover for %s: %s acts %s to %s', p_duty_key,
                 coalesce((select name from app_users where id = p_acting_user_id), 'staff'),
                 to_char(p_starts_on, 'DD Mon YYYY'), to_char(p_ends_on, 'DD Mon YYYY')),
          p_duty_key);
  return jsonb_build_object('id', v_id, 'duty_key', p_duty_key,
                            'normal_user_id', v_normal, 'acting_user_id', p_acting_user_id);
end;
$fn$;

-- ── grants ──────────────────────────────────────────────────────────────────

revoke all on function public.workspace_duty_staff(text[]) from public, anon;
grant execute on function public.workspace_duty_staff(text[]) to authenticated;
-- Only the two doors call it (as their owner), like workspace_is_internal_staff.
revoke all on function public.workspace_duty_holder_roles(text) from public, anon, authenticated;
-- The doors' grants, unchanged from 0511.
revoke all on function public.workspace_assign_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_assign_duty(text, uuid, date, date, text) to authenticated;
revoke all on function public.workspace_cover_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_cover_duty(text, uuid, date, date, text) to authenticated;

-- ── sanity (schema only; asserts no row count, red line 8) ──────────────────

do $$
begin
  if public.workspace_duty_holder_roles('finance_approver') is distinct from array['finance'] then
    raise exception '0514 sanity: finance_approver must be held by a Finance user';
  end if;
  if public.workspace_duty_holder_roles('grn_duty') is not null
     or public.workspace_duty_holder_roles(null) is not null then
    raise exception '0514 sanity: every other duty keeps the 0511 rule';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('workspace_assign_duty', 'workspace_cover_duty')
         and p.prosrc like '%workspace_duty_holder_roles(p_duty_key)%') <> 2 then
    raise exception '0514 sanity: both doors must read workspace_duty_holder_roles';
  end if;
  if to_regprocedure('public.workspace_duty_staff(text[])') is null then
    raise exception '0514 sanity: workspace_duty_staff is missing';
  end if;
end $$;

commit;

-- ── VERIFY (run by hand) ────────────────────────────────────────────────────
--   As the principal or an ops_manager:
--     select * from public.workspace_duty_staff(array['finance']);
--   lists the active Finance users. As any other login it raises 42501.
--   Assigning finance_approver to an operation account raises 22023
--   invalid_holder; a cover who is not Finance raises 22023 invalid_cover.
