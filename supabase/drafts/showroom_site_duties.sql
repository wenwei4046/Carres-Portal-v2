-- DRAFT: approved Showroom Duty capability; database change awaits exact-file approval.
-- Adds Site scope to the ONE Workspace assignment/cover store. No RLS policy changes,
-- new staff roster, data deletion, assignments, partner grants or operational writes.
-- Existing global RPC signatures delegate to the same scoped implementation.
begin;
alter table public.workspace_duty_assignments add column if not exists site_id uuid references public.warehouses(id);
alter table public.workspace_duty_covers add column if not exists site_id uuid references public.warehouses(id);
create index if not exists workspace_assignment_scope_idx on public.workspace_duty_assignments(duty_key,site_id,effective_from desc,created_at desc);
create index if not exists workspace_cover_scope_idx on public.workspace_duty_covers(duty_key,site_id,starts_on,ends_on);

create or replace function public.workspace_check_duty_scope(p_duty_key text,p_site_id uuid)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $fn$
begin
  if p_duty_key='showroom_duty' then
    if p_site_id is null or not exists(select 1 from warehouses where id=p_site_id and kind='own') then
      raise exception 'Choose a Carres Site for Showroom Duty.' using errcode='22023';
    end if;
  elsif p_site_id is not null then
    raise exception 'Only Showroom Duty uses a Site.' using errcode='22023';
  end if;
end;
$fn$;
create or replace function public.workspace_resolve_scoped_duty(
  p_duty_key text,
  p_on date default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_normal uuid;
  v_assignment uuid;
  v_source text := 'assignment';
  v_cover_id uuid;
  v_acting uuid;
begin
  perform public.workspace_check_duty_scope(p_duty_key, p_site_id);
  select holder_id, id into v_normal, v_assignment
    from workspace_duty_assignments
   where duty_key = p_duty_key
     and site_id is not distinct from p_site_id
     and effective_from <= v_on
     and (effective_until is null or effective_until >= v_on)
   order by effective_from desc, created_at desc
   limit 1;

  if v_normal is not null and not exists (
    select 1 from app_users where id=v_normal and status='active'
  ) then v_normal := null; end if;
  if v_normal is null then
    return jsonb_build_object(
      'duty_key', p_duty_key, 'on_date', v_on, 'site_id', p_site_id,
      'normal_user_id', null, 'acting_user_id', null, 'actor_user_id', null,
      'is_cover', false, 'cover_id', null, 'source', 'not_assigned', 'assignment_id', null);
  end if;

  select id, acting_user_id into v_cover_id, v_acting
    from workspace_duty_covers
   where duty_key = p_duty_key
     and site_id is not distinct from p_site_id
     and v_on between starts_on and ends_on
     and normal_user_id = v_normal
   order by created_at desc
   limit 1;

  if v_acting is not null and not exists (
    select 1 from app_users where id=v_acting and status='active'
  ) then v_acting := null; v_cover_id := null; end if;
  return jsonb_build_object(
    'duty_key', p_duty_key, 'on_date', v_on, 'site_id', p_site_id,
    'normal_user_id', v_normal,
    'acting_user_id', v_acting,
    'actor_user_id', coalesce(v_acting, v_normal),
    'is_cover', v_acting is not null,
    'cover_id', v_cover_id,
    'source', v_source, 'assignment_id', v_assignment);
end;
$fn$;

create or replace function public.workspace_assign_scoped_duty(
  p_duty_key text,
  p_holder_id uuid,
  p_effective_from date,
  p_effective_until date default null,
  p_note text default null,
  p_site_id uuid default null
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
  perform public.workspace_check_duty_scope(p_duty_key,p_site_id);
  if p_duty_key is null or p_duty_key !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'a duty key is required' using errcode = '22023', detail = 'invalid_duty_key';
  end if;
  if p_holder_id is null or not exists (
    select 1 from app_users where id = p_holder_id and status = 'active' and role <> 'dealer'
  ) then
    raise exception 'the holder must be an active internal staff member'
      using errcode = '22023', detail = 'invalid_holder';
  end if;
  -- A staff member cannot assign themself a duty (workspace/MASTER.md §5).
  -- Principal is the governed exception: Jess assigns, including to herself.
  if p_holder_id = v_uid and (select public.app_role()) <> 'principal' then
    raise exception 'you cannot assign a duty to yourself'
      using errcode = '42501', detail = 'self_assignment_refused';
  end if;
  if p_effective_from is null then
    raise exception 'an effective date is required' using errcode = '22023', detail = 'invalid_dates';
  end if;
  insert into workspace_duty_assignments
    (duty_key, holder_id, effective_from, effective_until, assigned_by, note, site_id)
  values
    (p_duty_key, p_holder_id, p_effective_from, p_effective_until, v_uid,
     nullif(btrim(coalesce(p_note, '')), ''), p_site_id)
  returning id into v_id;
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          coalesce((select name from app_users where id = v_uid), 'Manager'),
          format('Assigned %s to %s from %s%s', p_duty_key,
                 coalesce((select name from app_users where id = p_holder_id), 'staff'),
                 to_char(p_effective_from, 'DD Mon YYYY'),
                 case when p_effective_until is null then ''
                      else ' until ' || to_char(p_effective_until, 'DD Mon YYYY') end),
          concat_ws(':',p_duty_key,p_site_id));
  return jsonb_build_object('id', v_id, 'duty_key', p_duty_key, 'holder_id', p_holder_id, 'site_id', p_site_id);
end;
$fn$;

create or replace function public.workspace_cover_scoped_duty(
  p_duty_key text,
  p_acting_user_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null,
  p_site_id uuid default null
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
  perform public.workspace_check_duty_scope(p_duty_key,p_site_id);
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'the cover needs a valid date window' using errcode = '22023', detail = 'invalid_dates';
  end if;
  v_normal := (public.workspace_resolve_scoped_duty(p_duty_key, p_starts_on, p_site_id)->>'normal_user_id')::uuid;
  if v_normal is null then
    raise exception 'no one holds % on % — assign the duty first', p_duty_key, p_starts_on
      using errcode = '22023', detail = 'no_duty_holder';
  end if;
  if p_acting_user_id is null or p_acting_user_id = v_normal or not exists (
    select 1 from app_users where id = p_acting_user_id and status = 'active' and role <> 'dealer'
  ) then
    raise exception 'the cover must be a different active internal staff member'
      using errcode = '22023', detail = 'invalid_cover';
  end if;
  insert into workspace_duty_covers
    (duty_key, normal_user_id, acting_user_id, starts_on, ends_on, reason, assigned_by, site_id)
  values
    (p_duty_key, v_normal, p_acting_user_id, p_starts_on, p_ends_on,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid, p_site_id)
  returning id into v_id;
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          coalesce((select name from app_users where id = v_uid), 'Manager'),
          format('Cover for %s: %s acts %s to %s', p_duty_key,
                 coalesce((select name from app_users where id = p_acting_user_id), 'staff'),
                 to_char(p_starts_on, 'DD Mon YYYY'), to_char(p_ends_on, 'DD Mon YYYY')),
          concat_ws(':',p_duty_key,p_site_id));
  return jsonb_build_object('id', v_id, 'duty_key', p_duty_key,
                            'normal_user_id', v_normal, 'acting_user_id', p_acting_user_id, 'site_id', p_site_id);
end;
$fn$;

create or replace function public.workspace_resolve_duty(p_duty_key text,p_on date default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $fn$
select public.workspace_resolve_scoped_duty(p_duty_key,p_on,null);
$fn$;

create or replace function public.workspace_assign_duty(p_duty_key text,p_holder_id uuid,p_effective_from date,p_effective_until date default null,p_note text default null)
returns jsonb language sql security definer set search_path=public,pg_temp as $fn$
select public.workspace_assign_scoped_duty(p_duty_key,p_holder_id,p_effective_from,p_effective_until,p_note,null);
$fn$;

create or replace function public.workspace_cover_duty(p_duty_key text,p_acting_user_id uuid,p_starts_on date,p_ends_on date,p_reason text default null)
returns jsonb language sql security definer set search_path=public,pg_temp as $fn$
select public.workspace_cover_scoped_duty(p_duty_key,p_acting_user_id,p_starts_on,p_ends_on,p_reason,null);
$fn$;

revoke all on function public.workspace_check_duty_scope(text,uuid) from public,anon;
grant execute on function public.workspace_check_duty_scope(text,uuid) to authenticated;

revoke all on function public.workspace_resolve_scoped_duty(text,date,uuid) from public,anon;
grant execute on function public.workspace_resolve_scoped_duty(text,date,uuid) to authenticated;

revoke all on function public.workspace_assign_scoped_duty(text,uuid,date,date,text,uuid) from public,anon;
grant execute on function public.workspace_assign_scoped_duty(text,uuid,date,date,text,uuid) to authenticated;

revoke all on function public.workspace_cover_scoped_duty(text,uuid,date,date,text,uuid) from public,anon;
grant execute on function public.workspace_cover_scoped_duty(text,uuid,date,date,text,uuid) to authenticated;
commit;
