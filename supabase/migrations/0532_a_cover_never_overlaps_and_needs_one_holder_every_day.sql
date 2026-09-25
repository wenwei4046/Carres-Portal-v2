-- =============================================================================
-- 0532_a_cover_never_overlaps_and_needs_one_holder_every_day.sql
-- =============================================================================
-- WHAT WAS WRONG (measured on 0514's bodies)
--   1. workspace_cover_duty never refused an overlapping cover. Two covers for
--      one duty on one day were both written, and workspace_resolve_duty (0425)
--      silently picked the newest -- the page could not tell which one acted.
--      workspace/MASTER.md §4.4: "Overlapping active covers for one Duty are
--      refused".
--   2. The door checked the normal holder only on p_starts_on. A cover that ran
--      past the holder's last day, or into another holder's term, was written;
--      from that day the resolver ignored it (its normal_user_id no longer
--      matched), so the recorded cover quietly stopped covering.
--      §4.4: "available only when the Duty has a normal holder for the complete
--      selected period".
--   3. The resolver never asked whether the people it answers are still staff.
--      A disabled holder (Khor Yee, departed) or a disabled cover would still be
--      today's actor. §4: a departed person "is never a current/future Duty
--      holder, cover, acting person".
--   4. A cover naming the normal holder and a cover naming an ineligible person
--      shared one detail (invalid_cover), so the page could not print the two
--      different §4.4.1 sentences.
--
-- WHAT THIS CHANGES
--   a. workspace_duty_normal_on(duty, date) -- the ONE arithmetic for "who
--      normally holds this duty on this day": the newest effective assignment,
--      and NULL when its holder is not active internal staff (0511's test).
--      A disabled holder is Not assigned; an older, superseded assignment is
--      never silently revived.
--   b. workspace_resolve_duty reads (a) and takes only a cover whose acting
--      person is still active internal staff and allowed for the duty (0514's
--      workspace_duty_holder_roles). Its JSON shape is unchanged.
--   c. workspace_cover_duty, body from 0514 with:
--        - one transaction-scoped advisory lock per duty, so two managers
--          saving at once cannot both pass the overlap check;
--        - the holder checked for EVERY day of the cover: one and the same
--          normal holder, else 22023 no_duty_holder;
--        - the normal holder as their own cover refused as 22023
--          cover_is_holder (was invalid_cover);
--        - an overlap with a cover of the same duty whose acting person is
--          still active refused as 22023 cover_overlap. A cover by a departed
--          person resolves to nobody, so it is not an active cover and does not
--          block the dates.
--      The response adds nothing; the API names the returned normal_user_id.
--   No table, policy or row changes. Production had zero cover rows when this
--   was written, so no existing overlap needs a decision (clean-start law).
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set search_path = public, pg_temp;

-- ── a · who normally holds the duty on a day ────────────────────────────────

create or replace function public.workspace_duty_normal_on(p_duty_key text, p_on date)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_holder uuid;
begin
  select holder_id into v_holder
    from workspace_duty_assignments
   where duty_key = p_duty_key
     and effective_from <= p_on
     and (effective_until is null or effective_until >= p_on)
   order by effective_from desc, created_at desc
   limit 1;
  if v_holder is null or not public.workspace_is_internal_staff(v_holder) then
    return null;
  end if;
  return v_holder;
end;
$fn$;

comment on function public.workspace_duty_normal_on(text, date) is
  'The normal holder of a duty on one day: the newest effective assignment, '
  'NULL when none or when its holder is no longer active internal staff. The '
  'one arithmetic the resolver and the cover door share. 0532.';

-- ── b · the Shared Duty Resolver ────────────────────────────────────────────

-- Body from 0425; the holder comes from (a) and a cover counts only while its
-- acting person may still act.
create or replace function public.workspace_resolve_duty(
  p_duty_key text,
  p_on date default null
)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_normal uuid;
  v_source text := 'assignment';
  v_cover_id uuid;
  v_acting uuid;
begin
  v_normal := public.workspace_duty_normal_on(p_duty_key, v_on);

  if v_normal is null then
    return jsonb_build_object(
      'duty_key', p_duty_key, 'on_date', v_on,
      'normal_user_id', null, 'acting_user_id', null, 'actor_user_id', null,
      'is_cover', false, 'cover_id', null, 'source', 'not_assigned');
  end if;

  select c.id, c.acting_user_id into v_cover_id, v_acting
    from workspace_duty_covers c
   where c.duty_key = p_duty_key
     and v_on between c.starts_on and c.ends_on
     and c.normal_user_id = v_normal
     and public.workspace_is_internal_staff(c.acting_user_id)
     and (public.workspace_duty_holder_roles(p_duty_key) is null
          or exists (select 1 from app_users u
                      where u.id = c.acting_user_id
                        and u.role::text = any(public.workspace_duty_holder_roles(p_duty_key))))
   order by c.created_at desc
   limit 1;

  return jsonb_build_object(
    'duty_key', p_duty_key, 'on_date', v_on,
    'normal_user_id', v_normal,
    'acting_user_id', v_acting,
    'actor_user_id', coalesce(v_acting, v_normal),
    'is_cover', v_acting is not null,
    'cover_id', v_cover_id,
    'source', v_source);
end;
$fn$;

-- ── c · the cover door ──────────────────────────────────────────────────────

-- Body from 0514; the lock, the whole-period holder check, cover_is_holder and
-- the overlap refusal are added.
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
  -- One writer per duty at a time: the overlap check below and the insert are
  -- one decision.
  perform pg_advisory_xact_lock(hashtext('workspace_duty_cover:' || coalesce(p_duty_key, '')));

  v_normal := public.workspace_duty_normal_on(p_duty_key, p_starts_on);
  if v_normal is null
     or exists (select 1
                  from generate_series(p_starts_on::timestamp, p_ends_on::timestamp, interval '1 day') g
                 where public.workspace_duty_normal_on(p_duty_key, g::date) is distinct from v_normal) then
    raise exception '% has no one normal holder for every day from % to %', p_duty_key, p_starts_on, p_ends_on
      using errcode = '22023', detail = 'no_duty_holder';
  end if;
  if p_acting_user_id is not null and p_acting_user_id = v_normal then
    raise exception 'the normal holder cannot cover their own duty'
      using errcode = '22023', detail = 'cover_is_holder';
  end if;
  if p_acting_user_id is null or not public.workspace_is_internal_staff(p_acting_user_id) then
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
  if exists (select 1 from workspace_duty_covers c
              where c.duty_key = p_duty_key
                and c.starts_on <= p_ends_on
                and c.ends_on >= p_starts_on
                and public.workspace_is_internal_staff(c.acting_user_id)) then
    raise exception '% already has cover between % and %', p_duty_key, p_starts_on, p_ends_on
      using errcode = '22023', detail = 'cover_overlap';
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

-- Only the resolver and the door call it (as their owner).
revoke all on function public.workspace_duty_normal_on(text, date) from public, anon, authenticated;
-- Unchanged from 0425 / 0514.
revoke all on function public.workspace_resolve_duty(text, date) from public, anon;
grant execute on function public.workspace_resolve_duty(text, date) to authenticated;
revoke all on function public.workspace_cover_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_cover_duty(text, uuid, date, date, text) to authenticated;

-- ── sanity (schema only; asserts no row count, red line 8) ──────────────────

do $$
begin
  if to_regprocedure('public.workspace_duty_normal_on(text, date)') is null then
    raise exception '0532 sanity: workspace_duty_normal_on is missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('workspace_resolve_duty', 'workspace_cover_duty')
         and p.prosrc like '%workspace_duty_normal_on(p_duty_key%') <> 2 then
    raise exception '0532 sanity: the resolver and the cover door must share workspace_duty_normal_on';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'workspace_cover_duty'
                    and p.prosrc like '%cover_overlap%'
                    and p.prosrc like '%pg_advisory_xact_lock%'
                    and p.prosrc like '%workspace_duty_holder_roles(p_duty_key)%') then
    raise exception '0532 sanity: the cover door must lock, refuse overlap and keep the 0514 role rule';
  end if;
end $$;

commit;

-- ── VERIFY (run by hand) ────────────────────────────────────────────────────
--   As the principal, with a holder assigned for 01–30 Sep:
--     a cover 10–12 Sep                      → ok
--     a second cover 12–14 Sep               → 22023 cover_overlap
--     a cover 28 Sep – 02 Oct (holder ends)  → 22023 no_duty_holder
--     the holder as their own cover          → 22023 cover_is_holder
--   Disabling the holder makes workspace_resolve_duty answer not_assigned.
