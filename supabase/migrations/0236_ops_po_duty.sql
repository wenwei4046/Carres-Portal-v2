-- 0236_ops_po_duty.sql
-- PO duty rotation (Jess locked spec 2026-07-18 night): ONE person controls
-- purchase orders per CALENDAR MONTH (MYT), auto-rotating through the
-- assignment pool. 人分单,货合买 — PIC owns the customer, POs are
-- consolidated company-wide.
--
-- Additive only: 1 new ops_* table + seeds. No existing RLS/policy touched;
-- same operation+principal ALL policy as ops_staff_settings (0232,
-- InitPlan-wrapped). Writes are further gated at the API:
--   · month override        = management only (isOpsManager)
--   · lazy month auto-fill  = any operation session (deterministic rotation)
-- NOT YET APPLIED — awaiting Jess approval.

create table if not exists public.ops_po_duty (
  month       text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  user_id     uuid not null references public.app_users(id),
  assigned_by uuid references public.app_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ops_po_duty is
  'One row per MYT calendar month: who controls PO creation that month. Auto-rotates through the ops_staff_settings pool; management can override.';
comment on column public.ops_po_duty.assigned_by is
  'Who set this month''s holder (app_users.id); null = auto-rotation.';

alter table public.ops_po_duty enable row level security;

drop policy if exists ops_po_duty_op_principal_all on public.ops_po_duty;
create policy ops_po_duty_op_principal_all on public.ops_po_duty
  for all
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'))
  with check ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

-- Seed the rotation Jess dictated: Jul Shasha → Aug Li Ching → Sep Khor Yee.
-- Email-keyed so a missing account simply skips its row (no hard failure);
-- on conflict do nothing keeps re-runs safe.
insert into public.ops_po_duty (month, user_id)
select m.month, u.id
from (values
  ('2026-07', 'shasha@carres.com'),
  ('2026-08', 'liching@carres.com'),
  ('2026-09', 'khoryee@carres.com')
) as m(month, email)
join public.app_users u on u.email = m.email
on conflict (month) do nothing;
