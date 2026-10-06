-- Check the project name at the top left first: it must be the Carres production project.
--
-- 0511 read-only check. Changes nothing. One statement, so the SQL editor
-- answers all of it (it shows only the last statement's result).
--
-- The first row says whether 0511 is applied. Every other row is a person
-- who holds or covers a duty today, or is booked to from a later date, and
-- is not an active principal, operation, finance or bd account. 0511 stops
-- new ones; it does not move these. Only the first row means nothing needs
-- attention.

with today as (
  select (timezone('Asia/Kuala_Lumpur', now()))::date as d
),
people as (
  -- today's holder of each duty, as the one resolver answers it
  select 'holder today' as what, k.duty_key,
         (public.workspace_resolve_duty(k.duty_key, null)->>'normal_user_id')::uuid as user_id,
         null::date as from_date, null::date as to_date
    from (select distinct duty_key from public.workspace_duty_assignments) k
  union all
  -- a holder booked to start later
  select 'holder from a later date', a.duty_key, a.holder_id, a.effective_from, a.effective_until
    from public.workspace_duty_assignments a, today
   where a.effective_from > today.d
  union all
  -- a cover running today or later
  select 'cover', c.duty_key, c.acting_user_id, c.starts_on, c.ends_on
    from public.workspace_duty_covers c, today
   where c.ends_on >= today.d
)
select 0 as n, '0511 applied' as what,
       case when count(*) = 2 then 'yes' else 'no (' || count(*) || ' of 2 doors changed)' end as detail,
       null::text as duty_key, null::text as person, null::text as role, null::text as status,
       null::date as from_date, null::date as to_date
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('workspace_assign_duty', 'workspace_cover_duty')
   and p.prosrc like '%workspace_is_internal_staff%'
union all
select 1, x.what, 'not active internal staff', x.duty_key,
       coalesce(u.name, x.user_id::text), u.role::text, u.status::text,
       x.from_date, x.to_date
  from people x
  left join public.app_users u on u.id = x.user_id
 where x.user_id is not null
   and not coalesce(u.status = 'active' and u.role::text in ('principal', 'operation', 'finance', 'bd'), false)
order by n, duty_key, what;
