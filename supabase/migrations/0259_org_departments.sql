-- 0259_org_departments — HR Team hierarchy Phase 1b (Loo 2026-07-25):
-- departments + the department chart.
--
--   * org_departments — the department registry (Sales / Operation / Finance /
--     HR / Business Development seeded; HR renames/adds/retires from the Team
--     page exactly like positions).
--   * org_positions.department_id — a position belongs to (at most) one
--     department. C-level seats stay department-less: the management team sits
--     ON TOP of the chart, not inside a column.
--   * hr_team_source() v2 — same zero-arg signature (verified single overload
--     at apply), adds `departments` + `departmentId` on positions.
--
-- All additive; RLS mirrors org_positions (hr/principal read+write keyhole).

-- ── A. org_departments ───────────────────────────────────────────────────────

create table public.org_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.org_departments enable row level security;
create policy org_departments_hr_rw on public.org_departments
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

insert into public.org_departments (name, sort) values
  ('Sales',                0),
  ('Operation',            1),
  ('Finance',              2),
  ('HR',                   3),
  ('Business Development', 4);

-- ── B. positions → department link ───────────────────────────────────────────

alter table public.org_positions
  add column department_id uuid references public.org_departments(id) on delete set null;

-- Obvious mapping for the 0254 seed ladder (HR refines in the UI). C-level
-- rows are deliberately left NULL — the management team tops the chart.
update public.org_positions p set department_id = d.id
from public.org_departments d
where (p.name in ('Sales Manager', 'Sales Executive')       and d.name = 'Sales')
   or (p.name in ('Operation Manager', 'Admin Assistant')   and d.name = 'Operation')
   or (p.name in ('Finance Executive')                      and d.name = 'Finance')
   or (p.name in ('HR Manager', 'HR Executive')             and d.name = 'HR')
   or (p.name in ('BD Executive')                           and d.name = 'Business Development');

-- ── C. hr_team_source() v2 ───────────────────────────────────────────────────

create or replace function public.hr_team_source()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', u.name, 'role', u.role,
        'title', u.title, 'status', u.status,
        'staffCode', u.staff_code,
        'positionId', u.position_id, 'positionName', p.name, 'band', p.band,
        'reportsToUserId', u.reports_to_user_id,
        'lastSeenAt', u.last_seen_at, 'createdAt', u.created_at,
        'orgName', coalesce(s.name, dp.name, d.name))
        order by u.created_at)
      from app_users u
      left join org_positions p on p.id = u.position_id
      left join suppliers s on s.id = u.supplier_id
      left join delivery_partners dp on dp.id = u.partner_id
      left join dealers d on d.id = u.dealer_id
      where u.role <> 'dealer'), '[]'::jsonb),
    'showroomStores', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
      from dealers d where d.channel = 'showroom'), '[]'::jsonb),
    'showroomStaff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'name', sp.name, 'staffRole', sp.staff_role,
        'staffCode', sp.staff_code, 'active', sp.active,
        'email', sp.email, 'phone', sp.phone,
        'dealerId', sp.dealer_id, 'storeName', d.name,
        'outletId', sp.outlet_id, 'outletName', o.name,
        'hasPin', exists (select 1 from salesperson_pins pin
                          where pin.salesperson_id = sp.id))
        order by d.name, o.name nulls first, sp.name)
      from salespersons sp
      join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
      left join outlets o on o.id = sp.outlet_id), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', op.id, 'name', op.name, 'band', op.band,
        'sort', op.sort, 'active', op.active,
        'departmentId', op.department_id)
        order by case op.band when 'c_level' then 0 when 'manager' then 1 else 2 end,
                 op.sort, op.name)
      from org_positions op), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', od.id, 'name', od.name, 'sort', od.sort, 'active', od.active)
        order by od.sort, od.name)
      from org_departments od), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'subjectKind', h.subject_kind, 'subjectId', h.subject_id,
        'subjectName', h.subject_name, 'prevPosition', h.prev_position,
        'newPosition', h.new_position, 'changedAt', h.changed_at,
        'changedBy', (select name from app_users a where a.id = h.changed_by))
        order by h.changed_at desc)
      from (select * from org_position_history
            order by changed_at desc limit 100) h), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$$;
