-- 0232_ops_staff_assignment.sql
-- Staff ownership on orders (Jess model B + MC-aware pool, 2026-07-18).
-- Additive only: 3 nullable columns on ops_order_control + 1 new ops_* table.
-- NO existing RLS/policy touched; ops_staff_settings gets the same
-- operation+principal ALL policy as ops_tasks (InitPlan-wrapped).
-- Applied to prod via MCP 2026-07-18.

alter table public.ops_order_control
  add column if not exists assigned_staff uuid references public.app_users(id),
  add column if not exists assigned_by    uuid references public.app_users(id),
  add column if not exists assigned_at    timestamptz;

comment on column public.ops_order_control.assigned_staff is
  'Soft owner (app_users.id) - a responsibility pointer, never a visibility wall. Auto-assigned to the least-loaded AVAILABLE pool member at order entry; anyone may reassign.';
comment on column public.ops_order_control.assigned_by is
  'Who set assigned_staff (app_users.id); null = auto-assigned by the system.';
comment on column public.ops_order_control.assigned_at is
  'When assigned_staff last changed.';

create index if not exists idx_ops_order_control_assigned_staff
  on public.ops_order_control (assigned_staff);

-- Assignment pool + availability (MC / leave / resign):
-- membership is OPT-IN (a row here = in the auto-assign pool);
-- available=false = temporarily out (MC/leave) - new orders skip them,
-- their existing orders stay put until redistributed by a human click.
create table if not exists public.ops_staff_settings (
  user_id    uuid primary key references public.app_users(id),
  available  boolean not null default true,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id)
);

alter table public.ops_staff_settings enable row level security;

drop policy if exists ops_staff_settings_op_principal_all on public.ops_staff_settings;
create policy ops_staff_settings_op_principal_all on public.ops_staff_settings
  for all
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'))
  with check ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));
