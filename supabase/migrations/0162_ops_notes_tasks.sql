-- Migration 0162 — ops_notes (Keep) + ops_tasks (COO task board)
-- Two independent operation-cockpit tables behind the Gmail-style right panel:
--   ops_notes — per-staff Keep notes (private; principal/COO can read all)
--   ops_tasks — COO/manager assigns work to the operation team; staff claim it
--               (records WHO took it) + mark done. A 1-hour SLA drives an in-app
--               overdue badge (overdue = open AND age > sla_minutes), derived on
--               read — no cron.
-- app_users.id == auth.users.id (verified 2026-06-12, 13/13), so
-- author_id/created_by/claimed_by = auth.uid().

-- ───────────────────────── ops_notes (Keep) ─────────────────────────
create table ops_notes (
  id          uuid        primary key default gen_random_uuid(),
  author_id   uuid        not null references app_users(id) on delete cascade,
  title       text,
  content     text        not null default '',
  color       text,                                  -- keep colour tag (yellow/green/blue/pink/…)
  pinned      boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ───────────────────────── ops_tasks (task board) ─────────────────────────
create table ops_tasks (
  id               uuid        primary key default gen_random_uuid(),
  title            text        not null,
  detail           text,
  created_by       uuid        not null references app_users(id),               -- COO/manager
  assigned_to      uuid        references app_users(id),                         -- optional: a specific staff; null = open to anyone
  claimed_by       uuid        references app_users(id),                         -- who took the job
  claimed_at       timestamptz,
  status           text        not null default 'open'
                               check (status in ('open','claimed','done','cancelled')),
  priority         text        not null default 'normal'
                               check (priority in ('normal','urgent')),
  sla_minutes      integer     not null default 60,                             -- 1-hour action SLA
  due_at           timestamptz,                                                  -- optional hard deadline (else SLA-derived)
  done_at          timestamptz,
  related_order_id uuid        references orders(id) on delete set null,         -- optional link to an order
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ───────────────────────── updated_at triggers ─────────────────────────
create or replace function set_ops_notes_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger ops_notes_updated_at before update on ops_notes
  for each row execute function set_ops_notes_updated_at();

create or replace function set_ops_tasks_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger ops_tasks_updated_at before update on ops_tasks
  for each row execute function set_ops_tasks_updated_at();

-- ───────────────────────── RLS ─────────────────────────
alter table ops_notes enable row level security;
alter table ops_tasks enable row level security;

-- ops_notes: a staff member fully manages their OWN notes; principal (COO) may
-- READ everyone's. auth.uid()/auth.jwt() are SELECT-wrapped per the InitPlan
-- perf rule (CLAUDE.md §8 Fix 2).
create policy ops_notes_own_all on ops_notes
  for all to authenticated
  using (
    author_id = (select auth.uid())
    and (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal')
  )
  with check (
    author_id = (select auth.uid())
    and (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal')
  );
create policy ops_notes_principal_read on ops_notes
  for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'principal');

-- ops_tasks: team-shared board — operation + principal full access (claim/done
-- record claimed_by server-side via the authed JWT). Mirrors service_notes.
create policy ops_tasks_op_principal_all on ops_tasks
  for all to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') in ('operation','principal'))
  with check ((select auth.jwt()->'app_metadata'->>'role') in ('operation','principal'));

-- ───────────────────────── read-side RPCs (SECURITY DEFINER) ─────────────────────────
-- ops_tasks_feed() — tasks + joined member names + an overdue flag. SECURITY
-- DEFINER so the app_users name join works regardless of app_users RLS; the
-- op/principal gate is enforced inside the body.
create or replace function ops_tasks_feed()
returns table (
  id uuid, title text, detail text, status text, priority text,
  created_by uuid, created_by_name text,
  assigned_to uuid, assigned_to_name text,
  claimed_by uuid, claimed_by_name text, claimed_at timestamptz,
  sla_minutes int, due_at timestamptz, done_at timestamptz,
  related_order_id uuid, related_so int,
  created_at timestamptz, updated_at timestamptz,
  overdue boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.detail, t.status, t.priority,
    t.created_by, cb.name, t.assigned_to, ab.name, t.claimed_by, clb.name, t.claimed_at,
    t.sla_minutes, t.due_at, t.done_at, t.related_order_id, o.so,
    t.created_at, t.updated_at,
    (t.status = 'open'
      and now() > t.created_at + make_interval(mins => t.sla_minutes)) as overdue
  from ops_tasks t
  left join app_users cb on cb.id = t.created_by
  left join app_users ab on ab.id = t.assigned_to
  left join app_users clb on clb.id = t.claimed_by
  left join orders o on o.id = t.related_order_id
  where (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal')
  order by (t.status in ('done','cancelled')) asc,
           (t.priority = 'urgent') desc,
           t.created_at desc;
$$;

-- ops_tasks_overdue_count() — drives the sidebar red badge (open past SLA).
create or replace function ops_tasks_overdue_count()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(count(*), 0)::int from ops_tasks
  where status = 'open'
    and now() > created_at + make_interval(mins => sla_minutes)
    and (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal');
$$;

-- ops_team_members() — operation + principal staff list for the assign dropdown.
create or replace function ops_team_members()
returns table (id uuid, name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select id, name, email, role::text from app_users
  where role in ('operation','principal')
    and (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal')
  order by role, name;
$$;

-- ───────────────────────── indexes ─────────────────────────
create index ops_notes_author_idx on ops_notes (author_id, pinned desc, updated_at desc);
create index ops_tasks_status_idx on ops_tasks (status, created_at desc);
create index ops_tasks_claimed_idx on ops_tasks (claimed_by) where claimed_by is not null;
create index ops_tasks_order_idx on ops_tasks (related_order_id) where related_order_id is not null;
