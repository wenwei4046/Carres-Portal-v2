-- ============================================================================
-- 0425 — one Workspace owner-Duty registry and resolver
--
-- Owner Duty is responsibility, not permission. `org_duties` continues to
-- grant capabilities through positions; these tables answer who owns a kind of
-- action on a business date. Modules store only the stable Duty key.
-- ============================================================================

create extension if not exists btree_gist;

create table public.workspace_owner_duties (
  duty_key text primary key check (
    duty_key = btrim(duty_key)
    and duty_key ~ '^[a-z][a-z0-9]*([._-][a-z0-9]+)+$'
    and position('@' in duty_key) = 0
  ),
  name text not null unique check (btrim(name) <> ''),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id)
);

create table public.workspace_duty_assignments (
  id uuid primary key default gen_random_uuid(),
  duty_key text not null references public.workspace_owner_duties(duty_key),
  primary_user_id uuid not null references public.app_users(id),
  buddy_user_id uuid references public.app_users(id),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id),
  constraint workspace_duty_assignment_window check (ends_on is null or ends_on >= starts_on),
  constraint workspace_duty_assignment_two_people check (
    buddy_user_id is null or buddy_user_id <> primary_user_id
  ),
  constraint workspace_duty_assignment_no_overlap exclude using gist (
    duty_key with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  )
);

create index workspace_duty_assignments_date_idx
  on public.workspace_duty_assignments (duty_key, starts_on, ends_on);

create table public.workspace_duty_assignment_audit (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid,
  duty_key text not null,
  event text not null check (event in ('created', 'changed', 'ended', 'migrated')),
  previous_fact jsonb,
  resulting_fact jsonb not null,
  recorded_by uuid references public.app_users(id),
  recorded_at timestamptz not null default now()
);

-- People owns absence. A reason is an HR fact and is deliberately not returned
-- by the Duty resolver; it answers only whether the person may own work that day.
create table public.hr_staff_unavailability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id),
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id),
  constraint hr_staff_unavailability_window check (ends_on >= starts_on),
  constraint hr_staff_unavailability_no_overlap exclude using gist (
    user_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

create table public.hr_staff_unavailability_audit (
  id uuid primary key default gen_random_uuid(),
  unavailability_id uuid,
  user_id uuid not null,
  event text not null check (event in ('created', 'changed', 'removed')),
  previous_fact jsonb,
  resulting_fact jsonb,
  recorded_by uuid references public.app_users(id),
  recorded_at timestamptz not null default now()
);

comment on table public.workspace_owner_duties is
  'Workspace owner-Duty catalogue. Separate from org_duties capability grants.';
comment on table public.workspace_duty_assignments is
  'Effective-dated normal Primary and optional Buddy. Exactly one assignment may cover a Duty date.';
comment on table public.workspace_duty_assignment_audit is
  'Append-only evidence for every owner-Duty assignment change.';
comment on table public.hr_staff_unavailability is
  'People-owned dated absence used by the shared Duty resolver.';
comment on table public.hr_staff_unavailability_audit is
  'Append-only evidence for every staff-unavailability change.';

-- Approved named Duties only. No person is seeded by name or email.
insert into public.workspace_owner_duties (duty_key, name, description) values
  ('purchasing.po', 'PO Duty', 'Issue purchase orders and obtain supplier commitments.'),
  ('receiving.grn', 'GRN Duty', 'Receive and reconcile goods against their source.'),
  ('payment.collection', 'Payment Duty', 'Own governed customer collection work.'),
  ('approval.storage_waiver', 'Storage Waiver Approver', 'Decide storage free-period exceptions.'),
  ('approval.purchasing', 'Purchasing Approver', 'Decide governed purchasing exceptions.'),
  ('approval.delivery_charge', 'Delivery Charge Approver', 'Decide delivery charge exceptions.'),
  ('approval.payment', 'Payment Approver', 'Decide governed payment exceptions.'),
  ('approval.stock_adjustment', 'Stock Adjustment Approver', 'Decide stock adjustment requests.'),
  ('approval.service_case', 'Service Case Approver', 'Decide governed Service Case requests.')
on conflict (duty_key) do update set
  name = excluded.name,
  description = excluded.description,
  changed_at = now();

-- Carry forward only factual legacy rota rows. The new store contains UUIDs,
-- never an email lookup. GRN for month M is the next PO rota row, so each PO
-- row also supplies GRN for the preceding month.
insert into public.workspace_duty_assignments (
  duty_key, primary_user_id, starts_on, ends_on, created_at, created_by
)
select
  'purchasing.po', d.user_id, to_date(d.month || '-01', 'YYYY-MM-DD'),
  (to_date(d.month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date,
  d.created_at, d.assigned_by
from public.ops_po_duty d
where d.month ~ '^[0-9]{4}-[0-9]{2}$';

insert into public.workspace_duty_assignments (
  duty_key, primary_user_id, starts_on, ends_on, created_at, created_by
)
select
  'receiving.grn', d.user_id,
  (to_date(d.month || '-01', 'YYYY-MM-DD') - interval '1 month')::date,
  (to_date(d.month || '-01', 'YYYY-MM-DD') - interval '1 day')::date,
  d.created_at, d.assigned_by
from public.ops_po_duty d
where d.month ~ '^[0-9]{4}-[0-9]{2}$';

insert into public.workspace_duty_assignment_audit (
  assignment_id, duty_key, event, resulting_fact, recorded_by, recorded_at
)
select id, duty_key, 'migrated', to_jsonb(a), created_by, created_at
from public.workspace_duty_assignments a
where duty_key in ('purchasing.po', 'receiving.grn');

-- Browser sessions receive no table write door. Reads and writes happen through
-- narrow SECURITY DEFINER functions/API service authority.
alter table public.workspace_owner_duties enable row level security;
alter table public.workspace_duty_assignments enable row level security;
alter table public.workspace_duty_assignment_audit enable row level security;
alter table public.hr_staff_unavailability enable row level security;
alter table public.hr_staff_unavailability_audit enable row level security;

revoke all on public.workspace_owner_duties from authenticated;
revoke all on public.workspace_duty_assignments from authenticated;
revoke all on public.workspace_duty_assignment_audit from authenticated;
revoke all on public.hr_staff_unavailability from authenticated;
revoke all on public.hr_staff_unavailability_audit from authenticated;

create or replace function public.workspace_resolve_duty(p_duty_key text, p_on date)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_primary uuid;
  v_buddy uuid;
  v_cover uuid;
  v_state text := 'not_assigned';
  v_primary_eligible boolean := false;
  v_buddy_eligible boolean := false;
begin
  if p_on is null or nullif(btrim(p_duty_key), '') is null then
    raise exception 'duty_and_date_required' using errcode = '22023';
  end if;

  select a.id, a.primary_user_id, a.buddy_user_id
    into v_assignment_id, v_primary, v_buddy
    from public.workspace_duty_assignments a
    join public.workspace_owner_duties d on d.duty_key = a.duty_key and d.active
   where a.duty_key = p_duty_key
     and p_on between a.starts_on and coalesce(a.ends_on, 'infinity'::date)
   limit 1;

  if v_assignment_id is null then
    return jsonb_build_object(
      'duty_key', p_duty_key, 'assignment_id', null,
      'normal_user_id', null, 'buddy_user_id', null,
      'active_cover_user_id', null, 'acting_user_id', null,
      'state', v_state, 'on_date', p_on
    );
  end if;

  select exists (
    select 1 from public.app_users u
    where u.id = v_primary and u.status = 'active'
      and not exists (
        select 1 from public.hr_employees e
        where e.app_user_id = u.id and e.exit_date is not null and e.exit_date < p_on
      )
      and not exists (
        select 1 from public.hr_staff_unavailability x
        where x.user_id = u.id and p_on between x.starts_on and x.ends_on
      )
  ) into v_primary_eligible;

  if v_primary_eligible then
    v_state := 'primary';
  elsif v_buddy is not null then
    select exists (
      select 1 from public.app_users u
      where u.id = v_buddy and u.status = 'active'
        and not exists (
          select 1 from public.hr_employees e
          where e.app_user_id = u.id and e.exit_date is not null and e.exit_date < p_on
        )
        and not exists (
          select 1 from public.hr_staff_unavailability x
          where x.user_id = u.id and p_on between x.starts_on and x.ends_on
        )
    ) into v_buddy_eligible;
    if v_buddy_eligible then
      v_cover := v_buddy;
      v_state := 'covered';
    end if;
  end if;

  if v_state = 'not_assigned' then
    v_assignment_id := null;
    v_primary := null;
    v_buddy := null;
  end if;

  return jsonb_build_object(
    'duty_key', p_duty_key,
    'assignment_id', v_assignment_id,
    'normal_user_id', v_primary,
    'buddy_user_id', v_buddy,
    'active_cover_user_id', v_cover,
    'acting_user_id', coalesce(v_cover, v_primary),
    'state', v_state,
    'on_date', p_on
  );
end;
$$;

revoke all on function public.workspace_resolve_duty(text, date) from public;
grant execute on function public.workspace_resolve_duty(text, date) to authenticated;

create or replace function public.workspace_set_duty_assignment(
  p_duty_key text,
  p_primary_user_id uuid,
  p_buddy_user_id uuid,
  p_starts_on date,
  p_ends_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_previous jsonb;
begin
  if not public.is_principal() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) then
    raise exception 'invalid_assignment_window' using errcode = '22023';
  end if;
  if p_buddy_user_id = p_primary_user_id then
    raise exception 'primary_and_buddy_must_differ' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_owner_duties where duty_key = p_duty_key and active) then
    raise exception 'duty_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.app_users where id = p_primary_user_id and status = 'active')
     or (p_buddy_user_id is not null and not exists (
       select 1 from public.app_users where id = p_buddy_user_id and status = 'active'
     )) then
    raise exception 'staff_not_active' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_duty_key));
  select a.id, to_jsonb(a)
    into v_id, v_previous
    from public.workspace_duty_assignments a
   where a.duty_key = p_duty_key
     and a.starts_on = p_starts_on
   for update;

  -- Saving the assignment already shown in Staff & Duties is a governed
  -- change, not an overlapping second truth. Reuse its stable id and retain
  -- the complete before/after evidence in the append-only audit.
  if v_id is not null then
    update public.workspace_duty_assignments
       set primary_user_id = p_primary_user_id,
           buddy_user_id = p_buddy_user_id,
           ends_on = p_ends_on,
           changed_at = now(),
           changed_by = auth.uid()
     where id = v_id;
    insert into public.workspace_duty_assignment_audit (
      assignment_id, duty_key, event, previous_fact, resulting_fact, recorded_by
    ) select a.id, a.duty_key, 'changed', v_previous, to_jsonb(a), auth.uid()
        from public.workspace_duty_assignments a where a.id = v_id;
    return v_id;
  end if;

  if exists (
    select 1 from public.workspace_duty_assignments a
    where a.duty_key = p_duty_key
      and daterange(a.starts_on, coalesce(a.ends_on, 'infinity'::date), '[]') &&
          daterange(p_starts_on, coalesce(p_ends_on, 'infinity'::date), '[]')
  ) then
    raise exception 'assignment_overlap' using errcode = '23P01';
  end if;

  insert into public.workspace_duty_assignments (
    duty_key, primary_user_id, buddy_user_id, starts_on, ends_on, created_by, changed_by
  ) values (
    p_duty_key, p_primary_user_id, p_buddy_user_id, p_starts_on, p_ends_on, auth.uid(), auth.uid()
  ) returning id into v_id;

  insert into public.workspace_duty_assignment_audit (
    assignment_id, duty_key, event, previous_fact, resulting_fact, recorded_by
  ) select a.id, a.duty_key, 'created', v_previous, to_jsonb(a), auth.uid()
      from public.workspace_duty_assignments a where a.id = v_id;
  return v_id;
end;
$$;

revoke all on function public.workspace_set_duty_assignment(text, uuid, uuid, date, date) from public;
grant execute on function public.workspace_set_duty_assignment(text, uuid, uuid, date, date) to authenticated;

create or replace function public.hr_set_staff_unavailability(
  p_user_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.app_role()::text, '') not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'invalid_unavailability_window' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_users where id = p_user_id) then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;

  insert into public.hr_staff_unavailability (
    user_id, starts_on, ends_on, reason, created_by, changed_by
  ) values (
    p_user_id, p_starts_on, p_ends_on, nullif(btrim(p_reason), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  insert into public.hr_staff_unavailability_audit (
    unavailability_id, user_id, event, resulting_fact, recorded_by
  ) select x.id, x.user_id, 'created', to_jsonb(x), auth.uid()
      from public.hr_staff_unavailability x where x.id = v_id;
  return v_id;
end;
$$;

revoke all on function public.hr_set_staff_unavailability(uuid, date, date, text) from public;
grant execute on function public.hr_set_staff_unavailability(uuid, date, date, text) to authenticated;

-- Compatibility: legacy callers keep their response shape while all authority
-- now comes from the shared resolver. There is no direct rota/cover read here.
create or replace function public.purchasing_po_actor()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_month text := to_char(timezone('Asia/Kuala_Lumpur', now()), 'YYYY-MM');
  v_resolution jsonb;
begin
  v_resolution := public.workspace_resolve_duty('purchasing.po', v_today);
  return jsonb_build_object(
    'normal_user_id', v_resolution->'normal_user_id',
    'acting_user_id', v_resolution->'active_cover_user_id',
    'actor_user_id', v_resolution->'acting_user_id',
    'is_cover', (v_resolution->>'state') = 'covered',
    'cover_id', case when (v_resolution->>'state') = 'covered'
                     then v_resolution->'assignment_id' else null end,
    'month', v_month
  );
end;
$$;

revoke all on function public.purchasing_po_actor() from public;
grant execute on function public.purchasing_po_actor() to authenticated;
