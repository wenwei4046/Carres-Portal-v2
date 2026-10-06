-- ============================================================================
-- 0511 — a duty holder or cover is active internal staff
--
-- The two doors that write Staff & Duties, workspace_assign_duty and
-- workspace_cover_duty (0425; assign last rewritten by 0500), refused only a
-- `dealer`. Their error says "internal staff", and the web picker offers only
-- operation accounts, but a direct /rpc call with a manager's own token could
-- make a showroom, partner, supplier, warehouse or hr login a duty holder or
-- a cover. Finance approval now resolves through Staff & Duties (0508), so
-- that would make an outside login an approver.
--
-- "Internal staff" is is_internal()'s list (0266:103): principal, operation,
-- finance, bd. hr stays out on purpose: 0244 keeps HR away from order data,
-- and every duty here acts on order, purchasing or money records.
-- is_internal() asks about the caller, so the doors ask the same question of
-- the holder through workspace_is_internal_staff() below.
--
-- The check is `exists (...)`, which is true or false and never NULL, so a
-- NULL id or a missing account is refused, not let through.
--
-- Rows already written are not touched. scripts/check-0511-duty-holders.sql lists any effective
-- holder or cover who would fail this rule today.
-- ============================================================================

begin;

set search_path = public, pg_temp;

/** Is this person an active principal, operation, finance or bd account?
 *  The holder-side twin of is_internal(). False for NULL or an unknown id. */
create or replace function public.workspace_is_internal_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.app_users
     where id = p_user_id
       and status = 'active'
       and role in ('principal', 'operation', 'finance', 'bd')
  )
$fn$;

-- Body from 0500 (the null-safe self-assignment test); only the holder check changes.
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

-- Body from 0425; only the cover check changes.
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

-- Only the two doors call it (as their owner), so no app role needs it: a
-- signed-in user could otherwise ask it about any account id.
revoke all on function public.workspace_is_internal_staff(uuid) from public, anon, authenticated;
revoke all on function public.workspace_assign_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_assign_duty(text, uuid, date, date, text) to authenticated;
revoke all on function public.workspace_cover_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_cover_duty(text, uuid, date, date, text) to authenticated;

commit;
