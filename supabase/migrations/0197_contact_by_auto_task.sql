-- 0197_contact_by_auto_task.sql
--
-- Contact-by auto follow-up (Jess 2026-07-01, order-detail spec). Operation must
-- reach the customer a few days BEFORE the delivery deadline to confirm the
-- window + stock readiness. A daily Cloudflare cron drops a "Contact customer ·
-- SO-xxxx" task into the existing ops_tasks board (right-rail Follow-ups) at
-- `delivery_date - N`, where N = ops_order_control.contact_by_days (default 3,
-- editable per order).
--
-- Applied in two steps via the Supabase SQL Editor:
--   1) the ALTERs below (adds the config + idempotency columns, allows a
--      system-authored task) — DONE 2026-07-01.
--   2) the ops_generate_contact_by_tasks() function + its cron-only grants.

alter table public.ops_order_control
  add column if not exists contact_by_days    integer,      -- per-order override; null = default 3
  add column if not exists contact_by_task_at timestamptz;  -- idempotency stamp: set once the task is created
alter table public.ops_tasks alter column created_by drop not null;  -- allow a system-generated task

-- Set-based scan → create the follow-up task + stamp the order, in one atomic
-- call. Cron-only: run by the Worker's scheduled handler with the service_role
-- key. SECURITY DEFINER so it can write ops_tasks / ops_order_control without a
-- user JWT. Idempotent — an order that already has contact_by_task_at is skipped.
create or replace function public.ops_generate_contact_by_tasks()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with due as (
    select o.id, o.so, o.delivery_date
    from orders o
    left join ops_order_control ooc on ooc.order_id = o.id
    where o.delivery_date is not null
      and coalesce(o.delivery_date_tbd, false) = false
      and o.status in ('place', 'proceed_order')
      and o.delivery_date >= current_date
      and (o.delivery_date - coalesce(ooc.contact_by_days, 3)) <= current_date
      and ooc.contact_by_task_at is null
  ),
  ins as (
    insert into ops_tasks (title, detail, status, priority, related_order_id, due_at, created_by)
    select
      'Contact customer · SO-' || d.so,
      'Deadline ' || to_char(d.delivery_date, 'DD Mon YY')
        || ' — confirm delivery window + stock readiness.',
      'open', 'normal', d.id, d.delivery_date::timestamptz, null
    from due d
    returning related_order_id
  ),
  stamp as (
    insert into ops_order_control (order_id, contact_by_task_at)
    select related_order_id, now() from ins
    on conflict (order_id) do update set contact_by_task_at = excluded.contact_by_task_at
    returning order_id
  )
  select count(*) into v_count from stamp;
  return v_count;
end;
$$;

-- Cron-only. On Supabase, REVOKE FROM public alone does NOT block callers —
-- authenticated/anon get a DEFAULT direct EXECUTE grant — so revoke them too.
revoke all on function public.ops_generate_contact_by_tasks() from public;
revoke all on function public.ops_generate_contact_by_tasks() from authenticated, anon;
