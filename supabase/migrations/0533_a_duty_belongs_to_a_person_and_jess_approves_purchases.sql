-- ═══════════════════════════════════════════════════════════════════════════
-- 0533 · A DUTY BELONGS TO A PERSON — AND JESS APPROVES PURCHASES
--        (【WORKSPACE】 S2-D · owner rulings, Jess, 2026-09-18)
--
-- THE WRONG FACTS, measured on production 2026-09-18 (read-only):
--   · `jess@carres.com` signs in with a token that says `principal`
--     (auth.users.raw_app_meta_data.role) while her database row says
--     `operation` — so the API treated her as the owner and every SQL door
--     (`app_role()`) treated her as Operation staff. Two answers to one person.
--   · The shared login `principal@carres.com` passed every duty door by ROLE:
--     it may assign duties (it assigned all 28 live rows), it decides any
--     Manual Purchase (`purchasing_approver_gate` returned early for the
--     principal role) and it bypasses the Payment/Finance/Storage-waiver
--     approver duties. A shared password is not a person.
--   · Nothing marked a person apart from a shared login: `staff_code` cannot
--     (the shared account is CR001) and `hr_employees` cannot (the shared
--     account has an HR row too).
--   · `purchasing_approver` had zero assignments, so Manual Purchase decisions
--     ran on the `ops_manager` position rung and, in the API, an email list.
--   · A Manual Purchase could be decided by the person who raised it.
--
-- OWNER RULINGS (Jess, COO, 2026-09-18):
--   1 jess@carres.com is a personal management identity, role `principal`.
--   2 principal@carres.com may never hold, cover, assign or execute any duty.
--   3 This migration bootstraps Jess once as the first Purchasing Approver.
--   4 Nobody approves a Manual Purchase they raised.
--   5 Shasha and Yu Jun can never hold or cover Purchasing Approver.
--   6 With no eligible cover, approvals wait while Jess is absent — never
--     downgraded to Operation.
--   7 No email fallback. "You cannot assign a duty to yourself" is the daily
--     control for EVERY role (the principal exception is removed).
--
-- ORDER (every step idempotent; re-running this file changes nothing):
--   a · `app_users.is_person` — the governed person marker, guarded so no
--       signed-in caller can mark an account a person or unmark one.
--   b · Jess becomes `principal` in the database (and her token claim is
--       confirmed), with an audit row citing the ruling.
--   c · The duty rules: holder · cover · assigner · executor must be an active
--       person; no self-assignment or self-cover for anyone; Purchasing
--       Approver holder/cover must be an active PRINCIPAL person; the approver
--       gate admits only today's resolved actor — no role rung, no
--       `ops_manager` rung, `Nobody holds Purchasing Approver.` when unheld;
--       the other approver duties' principal rung needs a person too; the
--       principal role no longer raises a Manual Purchase; the Operations
--       Superuser is the governed flag or a principal PERSON, never the shared
--       owner login.
--   d · Bootstrap (a DO block, no permanent function): Jess holds
--       `purchasing_approver` from 2026-09-18, `assigned_by` NULL, only if the
--       duty has no assignment history at all.
--   e · `purchasing_decide_request` refuses the requester (`own_request`).
--
-- Out of scope: other duties' holders (Delivery Duty etc.). The flagged
-- Operations Superuser (`operation@carres.com`) keeps its PO/GRN doors, and
-- Jess keeps hers as a principal person (Purchasing MASTER §5.3).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── a · THE PERSON MARKER ─────────────────────────────────────────────────
alter table public.app_users
  add column if not exists is_person boolean not null default false;

comment on column public.app_users.is_person is
  'True when this login belongs to ONE named person (0533, owner ruling 2026-09-18). A shared or generic login (principal@, operation@, test accounts) stays false and may never hold, cover, assign or execute a duty. Set by People/HR account creation or a governed migration; no signed-in caller may change it.';

-- The three named people of the ruling. The shared owner login is not one.
update public.app_users set is_person = true
 where email in ('jess@carres.com', 'shasha@carres.com', 'yujun@carres.com')
   and not is_person;
update public.app_users set is_person = false
 where email = 'principal@carres.com'
   and is_person;

-- Jess must already be an active personal staff identity (CR002 on
-- production). A fresh database without her skips; a broken one stops here.
do $$
declare
  v record;
begin
  select id, status, staff_code into v from public.app_users where email = 'jess@carres.com';
  if found and (v.status <> 'active' or v.staff_code is null) then
    raise exception '0533: jess@carres.com is not an active personal staff identity (status %, staff_code %)',
      v.status, v.staff_code;
  end if;
end $$;

-- Nobody signed in may mark or unmark a person: a shared login flipping its
-- own marker would undo ruling 2. People/HR creates accounts through the
-- service role; migrations run with no JWT at all.
create or replace function public._app_users_person_marker_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.is_person then
      raise exception 'only People/HR marks an account as a person'
        using errcode = '42501', detail = 'person_marker_governed';
    end if;
    if tg_op = 'UPDATE' and new.is_person is distinct from old.is_person then
      raise exception 'only People/HR marks an account as a person'
        using errcode = '42501', detail = 'person_marker_governed';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public._app_users_person_marker_guard() from public, anon, authenticated;

drop trigger if exists app_users_person_marker_guard on public.app_users;
create trigger app_users_person_marker_guard
  before insert or update of is_person on public.app_users
  for each row execute function public._app_users_person_marker_guard();

-- ── b · JESS IS THE PRINCIPAL, IN THE DATABASE TOO ────────────────────────
with changed as (
  update public.app_users
     set role = 'principal'
   where email = 'jess@carres.com'
     and role <> 'principal'
  returning id, name
)
insert into public.audit_log (role, actor_text, action, ref)
select 'principal'::public.app_role,
       'migration 0533_a_duty_belongs_to_a_person_and_jess_approves_purchases',
       format('%s role changed from operation to principal — owner ruling 2026-09-18 (personal management identity)', name),
       id::text
  from changed;

-- Her token already says principal on production; make it true everywhere.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"principal"}'::jsonb
 where email = 'jess@carres.com'
   and coalesce(raw_app_meta_data ->> 'role', '') <> 'principal';

-- ── c · THE DUTY RULES ─────────────────────────────────────────────────────

-- c1 · One question, one answer: is this an active person?
create or replace function public.workspace_is_person(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.app_users
     where id = p_user_id
       and status = 'active'
       and is_person
  )
$function$;

revoke all on function public.workspace_is_person(uuid) from public, anon;
grant execute on function public.workspace_is_person(uuid) to authenticated, service_role;

comment on function public.workspace_is_person(uuid) is
  'Active account that belongs to one named person (app_users.is_person, 0533). Every duty holder, cover, assigner and executor must pass this.';

-- c2 · A duty holder or cover is an active internal PERSON. Every duty door
--      and the resolver already ask this one function.
create or replace function public.workspace_is_internal_staff(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.app_users
     where id = p_user_id
       and status = 'active'
       and is_person
       and role in ('principal', 'operation', 'finance', 'bd')
  )
$function$;

-- c3 · Purchasing Approver is held and covered by a Principal person only.
create or replace function public.workspace_duty_holder_roles(p_duty_key text)
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case p_duty_key
           when 'finance_approver' then array['finance']
           when 'purchasing_approver' then array['principal']
         end
$function$;

-- c5 · Only a PERSON sets duties. The shared owner login keeps reading.
create or replace function public.workspace_duty_settings_gate()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if not public.workspace_is_person(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'duty assignments are set by the manager';
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
$function$;

-- c6 · The duty pickers list people only.
create or replace function public.workspace_duty_staff(p_roles text[])
returns table(id uuid, name text, email text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.workspace_duty_settings_gate();
  return query
    select u.id, u.name::text, u.email::text
      from public.app_users u
     where u.status = 'active'
       and u.is_person
       and u.role::text = any(coalesce(p_roles, '{}'::text[]))
       and u.role::text in ('principal', 'operation', 'finance', 'bd')
     order by u.email;
end;
$function$;

-- c7 · Assign: nobody assigns themself — the principal exception is gone.
create or replace function public.workspace_assign_duty(
  p_duty_key text,
  p_holder_id uuid,
  p_effective_from date,
  p_effective_until date default null::date,
  p_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform public.workspace_duty_settings_gate();
  if p_duty_key is null or p_duty_key !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'a duty key is required' using errcode = '22023', detail = 'invalid_duty_key';
  end if;
  if not public.workspace_is_internal_staff(p_holder_id) then
    raise exception 'the holder must be an active internal staff person'
      using errcode = '22023', detail = 'invalid_holder';
  end if;
  if public.workspace_duty_holder_roles(p_duty_key) is not null
     and not exists (select 1 from public.app_users
                      where id = p_holder_id and status = 'active'
                        and role::text = any(public.workspace_duty_holder_roles(p_duty_key))) then
    raise exception '% must be held by an active % person', p_duty_key,
      array_to_string(public.workspace_duty_holder_roles(p_duty_key), ' or ')
      using errcode = '22023', detail = 'invalid_holder';
  end if;
  -- Nobody assigns a duty to themself (workspace/MASTER.md §5; owner ruling
  -- 2026-09-18 removed the principal exception).
  if p_holder_id = v_uid then
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
$function$;

-- c8 · Cover: nobody names themself as cover either.
create or replace function public.workspace_cover_duty(
  p_duty_key text,
  p_acting_user_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  if p_acting_user_id is not null and p_acting_user_id = v_uid then
    raise exception 'you cannot assign a duty to yourself'
      using errcode = '42501', detail = 'self_assignment_refused';
  end if;
  if p_acting_user_id is null or not public.workspace_is_internal_staff(p_acting_user_id) then
    raise exception 'the cover must be a different active internal staff person'
      using errcode = '22023', detail = 'invalid_cover';
  end if;
  if public.workspace_duty_holder_roles(p_duty_key) is not null
     and not exists (select 1 from public.app_users
                      where id = p_acting_user_id and status = 'active'
                        and role::text = any(public.workspace_duty_holder_roles(p_duty_key))) then
    raise exception '% must be covered by an active % person', p_duty_key,
      array_to_string(public.workspace_duty_holder_roles(p_duty_key), ' or ')
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
$function$;

-- c9 · Deciding a Manual Purchase is EXECUTING the Purchasing Approver duty:
--      only today's resolved actor (holder, or their dated Principal cover).
--      No role rung, no `ops_manager` rung, no email list. Unheld is its own
--      governed refusal; a holder who is away with no cover means WAIT.
create or replace function public.purchasing_approver_gate()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role  text := (select public.app_role());
  v_actor uuid;
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  v_actor := nullif(
    public.workspace_resolve_duty('purchasing_approver')->>'actor_user_id', ''
  )::uuid;

  if v_actor is null then
    raise exception 'Nobody holds Purchasing Approver.' using errcode = '42501',
      detail = 'no_purchase_approver';
  end if;

  -- The actor must still be what the duty requires: an active Principal
  -- person (a holder later moved off `principal` stops deciding; the
  -- approval waits instead of passing to whoever else is signed in).
  if v_actor is distinct from auth.uid()
     or v_role <> 'principal'
     or not public.workspace_is_person(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'not_purchase_approver';
  end if;

  return v_role;
end;
$function$;

revoke all on function public.purchasing_approver_gate() from public;
revoke all on function public.purchasing_approver_gate() from anon;
grant execute on function public.purchasing_approver_gate() to authenticated;

comment on function public.purchasing_approver_gate() is
  'Who may decide a Manual Purchase (0533). Only whoever workspace_resolve_duty(''purchasing_approver'') names as today''s actor — the holder, or their dated cover — and that actor must be an active principal person. No role rung, no ops_manager rung, no email list. Unheld: ''Nobody holds Purchasing Approver.'' (no_purchase_approver).';

-- c10 · The other approver duties' "principal decides anything" rung now
--       needs the principal to be a PERSON (ruling 2: the shared owner login
--       executes no duty). Each live body carries the rung exactly once; the
--       substitution is asserted, so a drifted body stops this migration
--       instead of being silently skipped.
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_from text;
  v_to text;
begin
  for r in
    select * from (values
      ('payment_correct_allocation',
       'coalesce(public.app_role() = ''principal'', false)',
       'coalesce(public.app_role() = ''principal'' and public.workspace_is_person(auth.uid()), false)'),
      ('payment_invoice_void_replace',
       'coalesce(public.app_role() = ''principal'', false)',
       'coalesce(public.app_role() = ''principal'' and public.workspace_is_person(auth.uid()), false)'),
      ('payment_record',
       'coalesce(public.app_role() = ''principal'', false)',
       'coalesce(public.app_role() = ''principal'' and public.workspace_is_person(auth.uid()), false)'),
      ('payment_storage_extra_free',
       'coalesce(public.app_role() = ''principal'', false)',
       'coalesce(public.app_role() = ''principal'' and public.workspace_is_person(auth.uid()), false)'),
      ('payment_void',
       'coalesce(public.app_role() = ''principal'', false)',
       'coalesce(public.app_role() = ''principal'' and public.workspace_is_person(auth.uid()), false)'),
      ('has_finance_approver',
       '(select role from me) = ''principal''',
       '((select role from me) = ''principal'' and public.workspace_is_person(p_user_id))'),
      -- c11 · The approver does not raise the purchases she approves: the
      --       principal role no longer raises, adds lines to or re-sends a
      --       Manual Purchase. Operation raises; the Purchasing Approver decides.
      ('purchasing_create_request',
       'v_role not in (''operation'', ''principal'')',
       'v_role not in (''operation'')'),
      ('purchasing_create_demand',
       'v_role not in (''operation'', ''principal'')',
       'v_role not in (''operation'')'),
      ('purchasing_resubmit_request',
       'v_role not in (''operation'', ''principal'')',
       'v_role not in (''operation'')')
    ) as t(fn, from_text, to_text)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if v_def is null then
      raise exception '0533: function % not found', r.fn;
    end if;
    v_from := r.from_text;
    v_to := r.to_text;
    -- Already converted: re-running this file is a no-op.
    if position(v_to in v_def) > 0 then
      continue;
    end if;
    if (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1 then
      raise exception '0533: % does not carry its rung exactly once', r.fn;
    end if;
    v_new := replace(v_def, v_from, v_to);
    execute v_new;
  end loop;
end $$;

-- c12 · The Operations Superuser is the governed flag, or a Principal PERSON.
--       0403 admitted every principal, so the shared owner login could issue
--       a PO, record a supplier reply, post a GRN and close a duty's Issue
--       action by role. Ruling 2: the shared login executes no duty.
--       Purchasing MASTER §5.3 keeps Jess an Operations Superuser "through
--       Principal authority" — that now means a principal person.
create or replace function public.is_operations_superuser(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((
    select u.operations_superuser or (u.role = 'principal' and u.is_person)
      from public.app_users u
     where u.id = p_user
  ), false);
$function$;

-- ── e · NOBODY DECIDES A PURCHASE THEY RAISED ─────────────────────────────
-- Byte-identical to the live 0522 body except the `own_request` refusal.
create or replace function public.purchasing_decide_request(
  p_id uuid,
  p_decision text,
  p_reason text default null::text,
  p_cuts jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := (select public.purchasing_approver_gate());
  v_req  purchase_requests%rowtype;
  v_cut  jsonb;
  v_line purchase_demands%rowtype;
  v_qty  int;
begin
  if p_decision is null or p_decision not in ('approve', 'refuse', 'send_back') then
    raise exception 'decision must be approve, refuse or send_back'
      using errcode = '22023', detail = 'invalid_decision';
  end if;

  -- THE ONE ROW EVERY DECISION QUEUES ON (see 0522 header: lock order).
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  if v_req.sent_back_at is not null then
    raise exception 'request is back with the requester'
      using errcode = '22023', detail = 'request_sent_back';
  end if;
  -- Owner ruling 2026-09-18: nobody approves a Manual Purchase they raised.
  -- The requester withdraws instead; a decision is somebody else's.
  if v_req.created_by is not distinct from auth.uid() then
    raise exception 'you cannot decide a purchase you raised'
      using errcode = '42501', detail = 'own_request';
  end if;

  if p_decision in ('refuse', 'send_back') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'a decision reason is required'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_cuts is not null then
      raise exception 'only an approval carries cuts'
        using errcode = '22023', detail = 'cuts_on_refusal';
    end if;
  end if;

  if p_decision = 'refuse' then
    update purchase_requests
       set refused_at = now(), refused_by = auth.uid(),
           refuse_reason = btrim(p_reason)
     where id = p_id;

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase refused: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'refused');
  end if;

  if p_decision = 'send_back' then
    update purchase_requests
       set sent_back_at = now(), sent_back_by = auth.uid(),
           sent_back_reason = btrim(p_reason)
     where id = p_id;

    insert into purchase_request_events (request_id, round, kind, actor_id, reason)
    values (p_id, v_req.round, 'sent_back', auth.uid(), btrim(p_reason));

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase sent back for changes: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'sent_back');
  end if;

  -- APPROVE. Cuts first, so a bad cut refuses the whole act atomically.
  if p_cuts is not null then
    if jsonb_typeof(p_cuts) <> 'array' then
      raise exception 'cuts must be an array'
        using errcode = '22023', detail = 'invalid_cuts';
    end if;
    for v_cut in select * from jsonb_array_elements(p_cuts) loop
      select * into v_line from purchase_demands
       where id = (v_cut ->> 'id')::uuid and request_id = p_id
       for update;
      if not found then
        raise exception 'cut names a line this request does not have'
          using errcode = '22023', detail = 'unknown_line';
      end if;
      v_qty := (v_cut ->> 'qty')::int;
      if v_qty is null or v_qty < 0 or v_qty > v_line.qty then
        raise exception 'cut for % must be between 0 and %', v_line.sku, v_line.qty
          using errcode = '22023', detail = 'invalid_cut_qty';
      end if;
      update purchase_demands set approved_qty = v_qty where id = v_line.id;
    end loop;
  end if;

  update purchase_requests
     set approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          'Purchase approved',
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'approved');
end;
$function$;

-- ── d · BOOTSTRAP — Jess, once, as the first Purchasing Approver ──────────
-- Runs after a–c, so the row it writes satisfies every rule above. Ruling 7
-- forbids self-assignment and ruling 2 forbids the shared login assigning, so
-- no door could ever name the first holder: the owner's ruling is the
-- assigner, `assigned_by` is NULL (never an invented user id), and the audit
-- row names this migration. No history → insert; any history → no-op.
do $$
declare
  v_jess uuid;
begin
  if exists (select 1 from public.workspace_duty_assignments
              where duty_key = 'purchasing_approver') then
    return;
  end if;
  select id into v_jess from public.app_users
   where email = 'jess@carres.com'
     and status = 'active' and role = 'principal' and is_person;
  if v_jess is null then
    return; -- a database without Jess (a fresh replay) has nobody to bootstrap
  end if;
  insert into public.workspace_duty_assignments
    (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
  values
    ('purchasing_approver', v_jess, date '2026-09-18', null, null,
     'Bootstrap — owner ruling 2026-09-18 (no second Principal person)');
  insert into public.audit_log (role, actor_text, action, ref)
  values ('principal'::public.app_role,
          'migration 0533_a_duty_belongs_to_a_person_and_jess_approves_purchases',
          'Assigned purchasing_approver to Jess from 18 Sep 2026 — bootstrap, owner ruling 2026-09-18 (no second Principal person)',
          'purchasing_approver');
end $$;

commit;
