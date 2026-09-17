-- 0521 — the Contact-by task scan uses today in Kuala Lumpur.
--
-- ops_generate_contact_by_tasks (0197) picks the orders whose delivery date
-- is within contact_by_days of today, and it spelled today as current_date —
-- the database clock's day, which is UTC on Supabase. The cron runs at 01:00
-- UTC (09:00 KL), when both clocks agree, so the scheduled run was right; a
-- manual run between 00:00 and 08:00 KL scanned against yesterday, so an
-- order due exactly contact_by_days from today was missed until the next run,
-- and an order that was delivered yesterday KL still qualified.
--
-- Body replayed as it is on main with only those two comparisons changed to
-- (timezone('Asia/Kuala_Lumpur', now()))::date, the same spelling 0519, 0520
-- and 0524 use. Same signature, same SECURITY DEFINER, same search_path.
-- create or replace keeps the cron-only grants (0197 revoked public,
-- authenticated and anon), and the revokes are replayed below anyway.
-- Left alone: due_at = delivery_date::timestamptz (midnight UTC = 08:00 KL on
-- the delivery day); changing it would move the rollover weekday (0519).
-- Existing tasks and stamps are not touched.

-- 1. Contact-by scan (0197:24-63)
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
      and o.delivery_date >= (timezone('Asia/Kuala_Lumpur', now()))::date  -- 0521: KL today
      and (o.delivery_date - coalesce(ooc.contact_by_days, 3)) <= (timezone('Asia/Kuala_Lumpur', now()))::date  -- 0521: KL today
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

-- Cron-only (0197:66-68 replayed).
revoke all on function public.ops_generate_contact_by_tasks() from public;
revoke all on function public.ops_generate_contact_by_tasks() from authenticated, anon;
