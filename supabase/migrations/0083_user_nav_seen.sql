-- =============================================================================
-- 0083_user_nav_seen.sql (Loo 2026-05-11)
-- =============================================================================
-- Per-user "seen" timestamps for sidebar nav badges. Replaces the
-- "open work counter" semantics with proper "unread / new since last view"
-- semantics — clicking into a tab marks it seen, badge shows only items
-- whose `updated_at > last_seen_at` afterwards.
--
-- Design:
--   - Single normalized table keyed by (user_id, badge_key)
--   - badge_key is free-form text so future roles can register their own
--     (e.g. 'logistics:orders', 'partner:pickups') without DDL
--   - RLS: each user reads/writes their own rows only
--   - Mark-seen RPC: SECURITY DEFINER upsert (no per-row policy traversal)
--
-- Filtering logic on the API side (badges router):
--   left join user_nav_seen on (user_id=auth.uid() and badge_key=$KEY)
--   then `where coalesce(nav.last_seen_at, '1970-01-01') < target_table.updated_at`
--   to surface only items that have advanced since the user last clicked in.
-- =============================================================================

create table if not exists public.user_nav_seen (
  user_id      uuid not null references auth.users(id) on delete cascade,
  badge_key    text not null,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

alter table public.user_nav_seen enable row level security;

-- Users can only see their own row(s)
create policy user_nav_seen_self_read on public.user_nav_seen
  for select
  using ( user_id = ( select auth.uid() ) );

-- Insert/update gate via mark_badge_seen() RPC; raw INSERT/UPDATE blocked
-- so the timestamp source-of-truth stays the RPC (which uses now()).
revoke insert, update, delete on public.user_nav_seen from authenticated;

-- =============================================================================
-- mark_badge_seen(p_badge_key) — upsert last_seen_at = now() for current user
-- Returns the timestamp written (for the client to optimistically reconcile).
-- =============================================================================
create or replace function public.mark_badge_seen(p_badge_key text)
returns timestamptz
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into user_nav_seen (user_id, badge_key, last_seen_at)
  values ((select auth.uid()), p_badge_key, now())
  on conflict (user_id, badge_key)
    do update set last_seen_at = excluded.last_seen_at
  returning last_seen_at;
$$;

revoke all on function public.mark_badge_seen(text) from public;
grant execute on function public.mark_badge_seen(text) to authenticated;
