-- 0667 — the Team list in the page header shows who is online today.
--
-- Owner ruling 2026-10-08 (Jess, Sales Order Outright template, Carres Layout
-- Standard §1 header: "team (avatar icon + online count)"): build the real
-- read now. Every staff member may see the whole team and its owner of each
-- job (Ops Rules §6), so this is a team read, not a manager read.
--
-- What it returns, per active internal person who can own Operations work:
--   * name and role,
--   * the last minute their portal recorded activity TODAY (Malaysia day),
--   * whether staff settings mark them not available (recorded leave / off).
-- Online / Away are decided by the API against its own clock (online = active
-- in the last 15 minutes, owner default 2026-10-08), so this function never
-- interprets the minutes.
--
-- workspace_activity_events has no authenticated read (0613); this definer
-- function is the dedicated door. It returns only TODAY's last minute — never
-- the history — and refuses every role except operation and principal.

create function public.workspace_team_today()
returns table (
  user_id uuid,
  name text,
  role text,
  last_active_at timestamptz,
  available boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_day_start timestamptz :=
    (timezone('Asia/Kuala_Lumpur', clock_timestamp())::date)::timestamp at time zone 'Asia/Kuala_Lumpur';
begin
  if (select public.app_role()) is distinct from 'operation'
     and (select public.app_role()) is distinct from 'principal' then
    raise exception 'operation only' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.name,
           u.role::text,
           (select max(e.minute_at)
              from public.workspace_activity_events e
             where e.user_id = u.id
               and e.minute_at >= v_day_start),
           s.available is distinct from false
      from public.app_users u
      left join public.ops_staff_settings s on s.user_id = u.id
     where u.is_person
       and u.status = 'active'
       and u.role in ('operation', 'principal')
     order by u.name, u.id;
end;
$fn$;

revoke all on function public.workspace_team_today() from public, anon;
grant execute on function public.workspace_team_today() to authenticated;
