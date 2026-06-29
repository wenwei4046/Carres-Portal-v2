-- Migration 0185 — ops_tasks "Escalate to Jess" fields + due-aware overdue
-- Powers the Orders follow-up form (#2): a follow-up IS an ops_task linked to an
-- order. When an operator can't resolve it, they ESCALATE to the principal (Jess)
-- with a structured reason + a short report. Also makes `overdue` honour the hard
-- due_at (not just the 60-min claim SLA), so a claimed-but-late task goes red too.
-- Additive: existing tasks get NULLs (= not escalated); zero behaviour change for
-- tasks without a due date.

alter table ops_tasks
  add column escalated_at    timestamptz,
  add column escalate_reason text check (escalate_reason in ('discount','refund','question','other')),
  add column escalate_note   text;

comment on column ops_tasks.escalated_at    is 'when this task was escalated to the principal (Jess); null = not escalated';
comment on column ops_tasks.escalate_reason is 'why it needs the boss: discount | refund | question | other';
comment on column ops_tasks.escalate_note   is 'the operator''s short report to the principal';

-- ── recreate the read feed: + escalate cols, + due-aware overdue ─────────────
-- overdue (= the red ⚠ signal) now fires when EITHER nobody claimed it past the
-- SLA, OR it's claimed/open and past its hard due_at. The rest is 0162 verbatim.
create or replace function ops_tasks_feed()
returns table (
  id uuid, title text, detail text, status text, priority text,
  created_by uuid, created_by_name text,
  assigned_to uuid, assigned_to_name text,
  claimed_by uuid, claimed_by_name text, claimed_at timestamptz,
  sla_minutes int, due_at timestamptz, done_at timestamptz,
  related_order_id uuid, related_so int,
  escalated_at timestamptz, escalate_reason text, escalate_note text,
  created_at timestamptz, updated_at timestamptz,
  overdue boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.detail, t.status, t.priority,
    t.created_by, cb.name, t.assigned_to, ab.name, t.claimed_by, clb.name, t.claimed_at,
    t.sla_minutes, t.due_at, t.done_at, t.related_order_id, o.so,
    t.escalated_at, t.escalate_reason, t.escalate_note,
    t.created_at, t.updated_at,
    (
      (t.status = 'open' and now() > t.created_at + make_interval(mins => t.sla_minutes))
      or (t.status in ('open','claimed') and t.due_at is not null and now() > t.due_at)
    ) as overdue
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

-- keep the sidebar badge count consistent with the feed's overdue definition.
create or replace function ops_tasks_overdue_count()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(count(*), 0)::int from ops_tasks t
  where (
      (t.status = 'open' and now() > t.created_at + make_interval(mins => t.sla_minutes))
      or (t.status in ('open','claimed') and t.due_at is not null and now() > t.due_at)
    )
    and (select auth.jwt()->'app_metadata'->>'role') in ('operation','principal');
$$;

create index ops_tasks_escalated_idx on ops_tasks (escalated_at) where escalated_at is not null;
