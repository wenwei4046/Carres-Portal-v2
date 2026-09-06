-- ============================================================================
-- 0425 — one shared duty resolver, and the GRN gate that asks it
--        (ERP-ARCHITECTURE Law F.1 · workspace/MASTER.md · owner instruction
--         2026-09-04: only GRN Duty, its dated cover, or an Operations
--         Superuser may post a Receiving)
--
-- Law F.1 (owner-approved 2026-09-01, global model 2026-09-03): no page,
-- module or API reads a rota table or calculates a duty holder for itself.
-- Measured 2026-09-04: no shared assignment store or resolver exists — only
-- the legacy `ops_po_duty` rota (0236) and `purchasing_po_actor()` (0379),
-- both named legacy implementation evidence that must converge.
--
-- This migration builds the MINIMAL shared foundation Receiving needs and the
-- Workspace MASTER approves:
--
--   workspace_duty_assignments   the effective-dated authoritative record
--   workspace_duty_covers        the dated buddy cover
--   workspace_resolve_duty()     the ONE resolver — the effective-dated
--                                assignment answers, or the honest
--                                `not_assigned`. NOTHING ELSE: a rota
--                                recommendation is never silently turned
--                                into an assignment (owner correction
--                                2026-09-04) — an unassigned duty blocks
--                                protected posting and says so.
--   receiving_actor_context()    the one gate the Receiving doors ask
--
-- The `Workspace → Staff & Duties` surface ships in the same card and is the
-- ONE assignment door. No module keeps a second person list.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · the authoritative effective-dated assignment
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_duty_assignments (
  id uuid primary key default gen_random_uuid(),
  duty_key text not null check (duty_key ~ '^[a-z][a-z0-9_]{2,39}$'),
  holder_id uuid not null references public.app_users(id),
  effective_from date not null,
  -- null = open-ended, until a later row supersedes it.
  effective_until date,
  assigned_by uuid references public.app_users(id),
  note text,
  created_at timestamptz not null default now(),
  constraint duty_assignment_window check (
    effective_until is null or effective_until >= effective_from
  )
);

comment on table public.workspace_duty_assignments is
  '0425: the ONE company-wide effective-dated duty assignment record (workspace/MASTER.md). Modules reference a duty key and never keep a person list. Rows are appended, never edited — the newest effective row wins, and history is the audit.';

create index if not exists workspace_duty_assignments_key_idx
  on public.workspace_duty_assignments (duty_key, effective_from desc);

alter table public.workspace_duty_assignments enable row level security;
drop policy if exists workspace_duty_assignments_read on public.workspace_duty_assignments;
create policy workspace_duty_assignments_read on public.workspace_duty_assignments
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.workspace_duty_assignments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2 · the dated buddy cover
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_duty_covers (
  id uuid primary key default gen_random_uuid(),
  duty_key text not null check (duty_key ~ '^[a-z][a-z0-9_]{2,39}$'),
  /** Who normally holds the duty — kept, never overwritten. */
  normal_user_id uuid not null references public.app_users(id),
  /** Who may act during the window. */
  acting_user_id uuid not null references public.app_users(id),
  starts_on date not null,
  ends_on date not null,
  reason text,
  assigned_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint duty_cover_window check (ends_on >= starts_on),
  constraint duty_cover_two_people check (acting_user_id <> normal_user_id)
);

comment on table public.workspace_duty_covers is
  '0425: dated buddy cover for a workspace duty. Cover changes who sees and may do today''s work; it never rewrites the normal owner or historical actors.';

create index if not exists workspace_duty_covers_key_idx
  on public.workspace_duty_covers (duty_key, starts_on, ends_on);

alter table public.workspace_duty_covers enable row level security;
drop policy if exists workspace_duty_covers_read on public.workspace_duty_covers;
create policy workspace_duty_covers_read on public.workspace_duty_covers
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.workspace_duty_covers from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3 · the write doors — manager-gated, audited, append-only
-- ---------------------------------------------------------------------------

/**
 * The same manager authority Purchasing Settings uses (0303): principal, or
 * the `ops_manager` position duty. A staff member cannot assign themself a
 * duty (workspace/MASTER.md §5) — enforced below, not here.
 */
create or replace function public.workspace_duty_settings_gate()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if v_role <> 'principal' then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';
    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'duty assignments are set by the manager';
    end if;
  end if;
  return v_role;
end;
$fn$;

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
  if p_acting_user_id is null or p_acting_user_id = v_normal or not exists (
    select 1 from app_users where id = p_acting_user_id and status = 'active' and role <> 'dealer'
  ) then
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

-- ---------------------------------------------------------------------------
-- 4 · the ONE resolver
-- ---------------------------------------------------------------------------

/**
 * workspace_resolve_duty — the effective-dated assignment, or the honest gap.
 *
 *   source = 'assignment'    an effective-dated Staff & Duties record answered
 *   source = 'not_assigned'  nobody holds it — the callers name the
 *                            configuration gap and protected posting blocks;
 *                            nothing falls back to a rota, an email or an
 *                            arbitrary manager (owner correction 2026-09-04:
 *                            a recommendation is never silently an
 *                            assignment)
 */
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
  select holder_id into v_normal
    from workspace_duty_assignments
   where duty_key = p_duty_key
     and effective_from <= v_on
     and (effective_until is null or effective_until >= v_on)
   order by effective_from desc, created_at desc
   limit 1;

  if v_normal is null then
    return jsonb_build_object(
      'duty_key', p_duty_key, 'on_date', v_on,
      'normal_user_id', null, 'acting_user_id', null, 'actor_user_id', null,
      'is_cover', false, 'cover_id', null, 'source', 'not_assigned');
  end if;

  select id, acting_user_id into v_cover_id, v_acting
    from workspace_duty_covers
   where duty_key = p_duty_key
     and v_on between starts_on and ends_on
     and normal_user_id = v_normal
   order by created_at desc
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

comment on function public.workspace_resolve_duty(text, date) is
  '0425: the ONE Shared Duty Resolver (ERP-ARCHITECTURE Law F.1). The effective-dated Staff & Duties assignment answers, or the honest not_assigned — never a rota recommendation, an email or an arbitrary manager. No page or module resolves a duty any other way.';

/**
 * The Staff & Duties page's own fact: may THIS person assign? The same gate
 * the write doors raise, answered as a boolean so the page never offers a
 * control the server would refuse.
 */
create or replace function public.workspace_can_assign_duties()
returns boolean
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.workspace_duty_settings_gate();
  return true;
exception when others then
  return false;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5 · the Receiving gate — who may review/post a Receiving today
-- ---------------------------------------------------------------------------

/**
 * The evidence trio every posting stores: normal GRN Duty, today's dated
 * cover, and the actual authenticated actor — three facts, never one
 * overwritten name (owner ruling 2026-09-03).
 *
 *   allowed = actor is the resolved GRN duty actor today,
 *             OR an Operations Superuser (0403 — Jess, operation@).
 */
create or replace function public.receiving_actor_context()
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('grn_duty', null);
  v_super boolean := public.is_operations_superuser(v_uid);
  v_actor uuid := nullif(v_duty->>'actor_user_id', '')::uuid;
begin
  return v_duty || jsonb_build_object(
    'uid', v_uid,
    'is_superuser', v_super,
    'allowed', v_uid is not null and (v_super or v_actor = v_uid));
end;
$fn$;

comment on function public.receiving_actor_context() is
  '0425: the one authority the Receiving doors ask. GRN Duty holder, dated cover, or Operations Superuser may act; the trio (normal, cover, actual actor) is returned for evidence, never collapsed.';

-- ---------------------------------------------------------------------------
-- 6 · grants
-- ---------------------------------------------------------------------------

revoke all on function public.workspace_duty_settings_gate() from public, anon;
grant execute on function public.workspace_duty_settings_gate() to authenticated;
revoke all on function public.workspace_assign_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_assign_duty(text, uuid, date, date, text) to authenticated;
revoke all on function public.workspace_cover_duty(text, uuid, date, date, text) from public, anon;
grant execute on function public.workspace_cover_duty(text, uuid, date, date, text) to authenticated;
revoke all on function public.workspace_resolve_duty(text, date) from public, anon;
grant execute on function public.workspace_resolve_duty(text, date) to authenticated;
revoke all on function public.workspace_can_assign_duties() from public, anon;
grant execute on function public.workspace_can_assign_duties() to authenticated;
revoke all on function public.receiving_actor_context() from public, anon;
grant execute on function public.receiving_actor_context() to authenticated;

-- ---------------------------------------------------------------------------
-- 7 · sanity
-- ---------------------------------------------------------------------------

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'workspace_resolve_duty';
  if v <> 1 then raise exception 'sanity: % copies of workspace_resolve_duty', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'receiving_actor_context';
  if v <> 1 then raise exception 'sanity: % copies of receiving_actor_context', v; end if;
  -- Tables are RPC-only for app roles.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_name = 'workspace_duty_assignments'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'sanity: workspace_duty_assignments must be RPC-only';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_name = 'workspace_duty_covers'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'sanity: workspace_duty_covers must be RPC-only';
  end if;
end $$;

commit;
