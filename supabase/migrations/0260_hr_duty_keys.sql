-- =====================================================================
-- 0260 — HR-P2: hierarchy-driven permissions (duty keys)
-- =====================================================================
-- APPLIED to prod 2026-07-26. Tail re-checked immediately before apply
-- (0259_org_departments) — no collision with the parallel lines that
-- took 0255/0257/0258 the day before.
--
-- Spec: docs/hr-system-full-spec.md §3 "HR-P2".
-- Laws honoured: 0244 keyhole (is_internal() never widens for hr;
-- config tables deny-all except hr/principal, InitPlan-wrapped) ·
-- dealer exclusion · audited DEFINER RPCs for writes · duties gate
-- WORKFLOW only, never security (RLS stays the security boundary).
--
-- Signature pre-check done against LIVE (memory rule — no ghost
-- overloads): hr_set_reports_to(p_user_id uuid, p_manager_id uuid)
-- is the ONLY overload; CREATE OR REPLACE below matches it exactly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The duty catalogue (5 keys — a 15-person company, not a matrix)
-- ---------------------------------------------------------------------
create table if not exists public.org_duties (
  key         text primary key,
  name        text not null,
  description text not null default '',
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.org_duties (key, name, description, sort) values
  ('ops_manager',     'Operations manager',
   'Assign / reassign order PIC and manage the assignment pool.', 10),
  ('po_duty_editor',  'PO duty roster editor',
   'Edit the monthly PO-raising rotation.', 20),
  ('account_creator', 'Account creator',
   'Create internal accounts from the Team tab.', 30),
  ('finance_approver','Finance approver',
   'Narrows money approvals. NEVER replaces the principal/hr role gate.', 40),
  ('roster_editor',   'Roster editor',
   'Edit the showroom shift roster (HR-P8 — dormant until that phase).', 50)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. position -> duty grants
-- ---------------------------------------------------------------------
create table if not exists public.org_position_duties (
  position_id uuid not null references public.org_positions(id) on delete cascade,
  duty_key    text not null references public.org_duties(key)   on delete cascade,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  primary key (position_id, duty_key)
);

create index if not exists org_position_duties_duty_idx
  on public.org_position_duties (duty_key);

-- ---------------------------------------------------------------------
-- 3. SEED FROM LIVE HOLDERS, NOT FROM POSITION NAMES
-- ---------------------------------------------------------------------
-- WHY THIS MATTERS (verified against prod 2026-07-26):
--   Jess (jess@carres.com) holds position **COO**, not "Operation
--   Manager". The "Operation Manager" seat has ZERO holders. The
--   original P2 sketch said "PO-duty editor = the Operation Manager
--   seat" — seeding that literally would have stripped Jess of PO-duty
--   edit on switch day. Seed the seat she ACTUALLY holds, and grant the
--   empty Operation Manager seat the same duties so a future hire
--   inherits them automatically.
insert into public.org_position_duties (position_id, duty_key)
select p.id, d.key
from public.org_positions p
cross join lateral (values
    ('ops_manager'), ('po_duty_editor'), ('account_creator'), ('finance_approver')
  ) as d(key)
where p.name = 'COO'
on conflict do nothing;

insert into public.org_position_duties (position_id, duty_key)
select p.id, d.key
from public.org_positions p
cross join lateral (values ('ops_manager'), ('po_duty_editor')) as d(key)
where p.name = 'Operation Manager'
on conflict do nothing;

insert into public.org_position_duties (position_id, duty_key)
select p.id, d.key
from public.org_positions p
cross join lateral (values ('account_creator'), ('roster_editor')) as d(key)
where p.name = 'HR Manager'
on conflict do nothing;

insert into public.org_position_duties (position_id, duty_key)
select p.id, 'finance_approver'
from public.org_positions p
where p.name in ('CFO')
on conflict do nothing;

-- NOTE: Chairman deliberately gets NO grants — `principal` passes every
-- gate by role check already. Granting duties to the Chairman seat would
-- imply the duty is what authorises him, which is false and would muddy
-- the audit trail.

-- ---------------------------------------------------------------------
-- 4. RLS — 0244 keyhole law: deny-all except hr/principal
-- ---------------------------------------------------------------------
alter table public.org_duties          enable row level security;
alter table public.org_position_duties enable row level security;

drop policy if exists org_duties_hr_all on public.org_duties;
create policy org_duties_hr_all on public.org_duties
  for all to authenticated
  using      ((select public.app_role()) in ('hr','principal'))
  with check ((select public.app_role()) in ('hr','principal'));

drop policy if exists org_position_duties_hr_all on public.org_position_duties;
create policy org_position_duties_hr_all on public.org_position_duties
  for all to authenticated
  using      ((select public.app_role()) in ('hr','principal'))
  with check ((select public.app_role()) in ('hr','principal'));

-- Everyone else reaches duties ONLY through the two DEFINER fns below.

-- ---------------------------------------------------------------------
-- 5. my_org_duties() — self-only, the "can I do X?" read
-- ---------------------------------------------------------------------
create or replace function public.my_org_duties()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(pd.duty_key order by pd.duty_key), '{}'::text[])
  from app_users u
  join org_position_duties pd on pd.position_id = u.position_id
  where u.id = auth.uid()
    and u.role <> 'dealer'          -- dealer-exclusion law
    and u.status = 'active';        -- disabled/invited account carries no duty
$$;
-- Deliberate asymmetry vs org_duty_holders() below: the SELF check is
-- about "may I act right now" (status matters), the LIST read is about
-- "what does this seat mean" (status does not) — a disabled manager must
-- still render as a manager in the roster, just unable to act.

revoke all on function public.my_org_duties() from public;
grant execute on function public.my_org_duties() to authenticated;

-- ---------------------------------------------------------------------
-- 6. org_duty_holders() — the LIST read (self-only can't answer this)
-- ---------------------------------------------------------------------
-- WHY: the ops Team rail and OperationOrdersControl filter the
-- assignment pool with isOpsManager(role, OTHER-PERSON's email) — a
-- per-row question about OTHER people. my_org_duties() is self-only and
-- structurally cannot answer it. One internal-gated payload answers both
-- "am I a manager?" and "which of these people are managers?".
create or replace function public.org_duty_holders()
returns table (user_id uuid, duties text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id,
         coalesce(array_agg(pd.duty_key order by pd.duty_key)
                    filter (where pd.duty_key is not null), '{}'::text[])
  from app_users u
  left join org_position_duties pd on pd.position_id = u.position_id
  -- is_internal() is principal/operation/finance/bd ONLY — the 0244
  -- keyhole law deliberately excludes 'hr'. Gating on it alone would
  -- lock the HR user out of the very screen that manages duties, so hr
  -- is OR-ed in explicitly (InitPlan-wrapped, per §8 Fix 2).
  where ((select public.is_internal()) or (select public.app_role()) = 'hr')
    and u.role <> 'dealer'
  group by u.id;
$$;

revoke all on function public.org_duty_holders() from public;
grant execute on function public.org_duty_holders() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Duty grant/revoke — audited DEFINER write (guardrail #4 shape)
-- ---------------------------------------------------------------------
create or replace function public.hr_set_position_duty(
  p_position_id uuid,
  p_duty_key    text,
  p_granted     boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pos  text;
  v_duty text;
begin
  if (select public.app_role()) not in ('hr','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select name into v_pos  from org_positions where id = p_position_id and active;
  if v_pos is null then raise exception 'position_not_found'; end if;

  select name into v_duty from org_duties where key = p_duty_key;
  if v_duty is null then raise exception 'duty_not_found'; end if;

  if p_granted then
    insert into org_position_duties (position_id, duty_key, granted_by)
    values (p_position_id, p_duty_key, auth.uid())
    on conflict (position_id, duty_key) do nothing;
  else
    delete from org_position_duties
    where position_id = p_position_id and duty_key = p_duty_key;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('Duty %s · %s: %s',
                 case when p_granted then 'granted' else 'revoked' end,
                 v_pos, v_duty),
          p_position_id::text);
end;
$function$;

revoke all on function public.hr_set_position_duty(uuid, text, boolean) from public;
grant execute on function public.hr_set_position_duty(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Folded fix — hr_set_reports_to was writing SILENTLY (no audit row)
-- ---------------------------------------------------------------------
-- Signature verified against live: (p_user_id uuid, p_manager_id uuid),
-- single overload. Body below is the live body + the audit insert; the
-- cycle guard and dealer exclusion are unchanged.
create or replace function public.hr_set_reports_to(p_user_id uuid, p_manager_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user  app_users%rowtype;
  v_walk  uuid;
  v_hops  int := 0;
  v_prev  text;
  v_new   text;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from app_users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user.role = 'dealer' then raise exception 'dealer_not_in_hierarchy'; end if;

  if p_manager_id is not null then
    if p_manager_id = p_user_id then raise exception 'reports_to_self'; end if;
    if not exists (select 1 from app_users
                   where id = p_manager_id and role <> 'dealer') then
      raise exception 'manager_not_found';
    end if;
    -- cycle guard: walking up from the manager must never reach the subject
    v_walk := p_manager_id;
    while v_walk is not null and v_hops < 20 loop
      select reports_to_user_id into v_walk from app_users where id = v_walk;
      if v_walk = p_user_id then raise exception 'reporting_cycle'; end if;
      v_hops := v_hops + 1;
    end loop;
  end if;

  select name into v_prev from app_users where id = v_user.reports_to_user_id;
  select name into v_new  from app_users where id = p_manager_id;

  update app_users set reports_to_user_id = p_manager_id where id = p_user_id;

  -- NEW (HR-P2): reporting-line moves are the payment spine for HR-P6
  -- rollups — they must not move silently.
  if coalesce(v_user.reports_to_user_id::text, '') <> coalesce(p_manager_id::text, '') then
    insert into audit_log (role, actor_text, action, ref)
    values ((select public.app_role()),
            (select name from app_users where id = auth.uid()),
            format('Reporting line · %s: %s → %s',
                   v_user.name, coalesce(v_prev, '—'), coalesce(v_new, '—')),
            p_user_id::text);
  end if;
end;
$function$;

-- =====================================================================
-- ROLLBACK NOTE
-- Dropping org_position_duties alone reverts every gate to the legacy
-- email list (the transition fallback stays in code for one release),
-- so this migration is safe to reverse without a code deploy.
-- =====================================================================
