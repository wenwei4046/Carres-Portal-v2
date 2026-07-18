-- 0235_staff_peers_read_and_presence.sql
-- Jess-approved in conversation 2026-07-18. Applied to prod via MCP same day.
-- (1) Team panel must list operation TEAMMATES: app_users_self_read only
--     allows self-or-principal, so staff saw an empty pool. Additive
--     READ-ONLY policy: operation/principal JWTs may read operation-role
--     rows (colleague name/email for the pool + PIC avatars). Writes and
--     every external role (dealer/supplier/partner) unchanged.
create policy app_users_operation_peers_read on public.app_users
  for select
  using (
    (select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal')
    and role = 'operation'
  );

-- (2) Presence heartbeat (auto "came to work" detection, Jess: staff opens
--     the portal = online = auto-available; MC/no-show = never stamped =
--     auto-skipped by the assign sweep). SECURITY DEFINER because app_users
--     write RLS is principal-only; the fn touches ONLY last_seen_at of the
--     CALLER's own row - no role/email self-edit possible.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.app_users set last_seen_at = now() where id = auth.uid();
$$;
-- P8 lesson: Supabase default-grants EXECUTE to authenticated AND anon on
-- definer fns - keep authenticated (every logged-in user may stamp itself),
-- strip anon explicitly.
revoke execute on function public.touch_last_seen() from anon, public;
grant execute on function public.touch_last_seen() to authenticated;
