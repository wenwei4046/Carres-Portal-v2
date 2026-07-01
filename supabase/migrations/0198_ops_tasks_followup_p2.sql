-- 0198_ops_tasks_followup_p2.sql
--
-- Follow-up P2 automations (Jess — the order-detail follow-up spec, phase 2).
-- Three daily-cron jobs on ops_tasks; each is idempotent + surfaces its effect
-- through the EXISTING task UI (assignee / due date / priority / new tasks), so
-- no feed-function or schema recreate is needed:
--
--   P2a  reassign-unacknowledged — an ASSIGNED task never acknowledged (still
--        'open') past its deadline returns to the CREATOR + goes 'urgent', so it
--        surfaces in the creator's "Mine" list instead of sitting unhandled.
--   P2b  rollover-overdue        — a CLAIMED task past its due date, not done,
--        rolls its due_at to the next WORKING day (once/day); after 2 rollovers
--        it goes 'urgent' (clearly stuck).
--   P2c  flag-stalled            — a CLAIMED task with no update in 3+ days spawns
--        an 'urgent' "Chase:" task (linked to the same order) + is stamped so it
--        isn't re-flagged.
--
-- Markers double as idempotency guards. Cron-only functions: SECURITY DEFINER +
-- REVOKEd from authenticated/anon (Supabase default-grants EXECUTE — P8c/P8d
-- lesson). Additive; existing tasks get NULL markers = no behaviour change.

alter table ops_tasks
  add column if not exists auto_reassigned_at timestamptz,
  add column if not exists rolled_over_at     timestamptz,
  add column if not exists rollover_count     integer not null default 0,
  add column if not exists stalled_flagged_at timestamptz;

-- ── P2a ──────────────────────────────────────────────────────────────────────
create or replace function public.ops_tasks_reassign_unacknowledged()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with moved as (
    update ops_tasks
      set assigned_to = created_by,
          priority = 'urgent',
          auto_reassigned_at = now(),
          updated_at = now()
    where status = 'open'
      and assigned_to is not null
      and created_by is not null
      and assigned_to <> created_by
      and auto_reassigned_at is null
      and (
        (due_at is not null and now() > due_at)
        or (due_at is null and now() > created_at + interval '1 day')
      )
    returning 1
  )
  select count(*) into v_count from moved;
  return v_count;
end; $$;

-- ── P2b ──────────────────────────────────────────────────────────────────────
create or replace function public.ops_tasks_rollover_overdue()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with rolled as (
    update ops_tasks t
      set due_at = (
            case extract(dow from t.due_at + interval '1 day')
              when 6 then t.due_at + interval '3 day'   -- Sat -> Mon
              when 0 then t.due_at + interval '2 day'   -- Sun -> Mon
              else t.due_at + interval '1 day'
            end
          ),
          rollover_count = t.rollover_count + 1,
          rolled_over_at = now(),
          priority = case when t.rollover_count + 1 >= 2 then 'urgent' else t.priority end,
          updated_at = now()
    where t.status = 'claimed'
      and t.due_at is not null
      and now() > t.due_at
      and (t.rolled_over_at is null or t.rolled_over_at::date < current_date)
    returning 1
  )
  select count(*) into v_count from rolled;
  return v_count;
end; $$;

-- ── P2c ──────────────────────────────────────────────────────────────────────
create or replace function public.ops_tasks_flag_stalled()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with stalled as (
    select id, title, related_order_id
    from ops_tasks
    where status = 'claimed'
      and stalled_flagged_at is null
      and updated_at < now() - interval '3 days'
  ),
  chased as (
    insert into ops_tasks (title, detail, status, priority, related_order_id, created_by)
    select 'Chase: ' || s.title,
           'Auto-flagged — no update in 3+ days. Follow up or close the original.',
           'open', 'urgent', s.related_order_id, null
    from stalled s
    returning 1
  ),
  stamped as (
    update ops_tasks set stalled_flagged_at = now(), updated_at = now()
    where id in (select id from stalled)
    returning 1
  )
  select count(*) into v_count from stamped;
  return v_count;
end; $$;

-- Cron-only.
revoke all on function public.ops_tasks_reassign_unacknowledged() from public;
revoke all on function public.ops_tasks_reassign_unacknowledged() from authenticated, anon;
revoke all on function public.ops_tasks_rollover_overdue() from public;
revoke all on function public.ops_tasks_rollover_overdue() from authenticated, anon;
revoke all on function public.ops_tasks_flag_stalled() from public;
revoke all on function public.ops_tasks_flag_stalled() from authenticated, anon;
