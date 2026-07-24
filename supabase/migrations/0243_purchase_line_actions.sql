-- 0243_purchase_line_actions.sql
--
-- Purchase §6 backend (Jess 2026-07-24 approve): wire the 3 line-⋮ actions +
-- the Snooze PO button that today only toast "coming soon".
--
--   ⋮ Skip           → order_lines.excluded_from_plan = true (permanent)
--   ⋮ Push to next   → order_lines.exclude_from_plan_until = <target ts>
--   ⋮ Send separately → no DB change (UI opens CreatePOModal for the 1 line)
--   ⏰ Snooze PO      → purchase_snoozes (supplier_id, snooze_until, reason)
--
-- Engine (buildPurchaseTodayReport → net-requirements): skip a line when
-- `excluded_from_plan OR (exclude_from_plan_until IS NOT NULL AND
-- exclude_from_plan_until > now())`, and skip a supplier from placeGroups
-- when purchase_snoozes has an unexpired row for it. Both filters short-
-- circuit — zero perf impact when nothing is excluded/snoozed.
--
-- Additive + nullable/defaulted → existing lines default to excluded_from_plan
-- false and exclude_from_plan_until null (= included = current behaviour).
-- Existing tests + engine calls unaffected until the columns are read.
-- NOT YET APPLIED — awaiting Jess apply via MCP.

alter table public.order_lines
  add column if not exists excluded_from_plan boolean not null default false,
  add column if not exists exclude_from_plan_until timestamptz;

comment on column public.order_lines.excluded_from_plan is
  'Purchase §6 · Skip: permanently drop this line from the purchase plan (operator opted out of buying it). Engine treats it as if the demand doesn''t exist.';
comment on column public.order_lines.exclude_from_plan_until is
  'Purchase §6 · Push to next cycle: temp-skip this line from the purchase plan until this timestamp (defaults to the next Mon/Wed/Fri PO day). null = not pushed.';

create table if not exists public.purchase_snoozes (
  supplier_id text primary key references public.suppliers(id) on delete cascade,
  snooze_until timestamptz not null,
  reason text,
  set_by_user_id uuid references public.app_users(id),
  set_at timestamptz not null default now()
);
comment on table public.purchase_snoozes is
  'Purchase §6 · Snooze PO: whole-supplier defer of PO planning until snooze_until (MYT). Engine skips the supplier''s placeGroups until now() > snooze_until. One row per supplier — a new snooze upserts.';

alter table public.purchase_snoozes enable row level security;

drop policy if exists purchase_snoozes_op_principal_all on public.purchase_snoozes;
create policy purchase_snoozes_op_principal_all on public.purchase_snoozes
  for all
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'))
  with check ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));
