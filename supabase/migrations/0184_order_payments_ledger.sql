-- 0184_order_payments_ledger.sql
-- Balance job — Phase 1 foundation (Jess 2026-06-26: "complete all the balance job").
--
-- Adds a real multi-entry PAYMENT LEDGER (replacing the single
-- ops_order_control.paid_amount stopgap from 0180) plus the storage-collection +
-- waiver state the collect-before-delivery gate needs. ADDITIVE — paid_amount /
-- storage_paid stay in place until the ledger UI lands, so nothing breaks on
-- apply. Principal + operation own it (mirrors ops_order_control RLS, 0159).
-- Applied manually via MCP by Jess.
--
-- Plan: docs/superpowers/plans/2026-06-26-balance-job.md

-- 1) The ledger — one row per payment received (goods, deposit, OR a storage
--    collection). Outstanding (goods) = bill − Σ(payment+deposit); storage
--    collected is summed separately for the delivery gate.
create table if not exists public.order_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  paid_on     date not null,
  method      text not null default 'cash'
              check (method in ('cash','bank','card','cheque','online','other')),
  kind        text not null default 'payment'
              check (kind in ('payment','deposit','storage')),
  reference   text,            -- bank ref / cheque no / online approval code
  receipt_no  text,            -- our issued receipt number (proof of collection)
  receipt_url text,            -- signed proof object (mirrors invoice / DO storage)
  note        text,
  recorded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists order_payments_order_idx on public.order_payments(order_id);

alter table public.order_payments enable row level security;

-- Internal roles read; operation + principal write (mirror ooc_* policies, 0159).
drop policy if exists order_payments_read_internal on public.order_payments;
create policy order_payments_read_internal on public.order_payments
  for select
  using ( (select public.is_internal()) );

drop policy if exists order_payments_write_op_principal on public.order_payments;
create policy order_payments_write_op_principal on public.order_payments
  for all
  using      ( (select (auth.jwt() -> 'app_metadata' ->> 'role')) = any (array['operation','principal']) )
  with check ( (select (auth.jwt() -> 'app_metadata' ->> 'role')) = any (array['operation','principal']) );

-- 2) Storage-collection + waiver state on the per-order overlay. The collect-
--    before-delivery gate reads storage_collected_at / storage_waiver_status; a
--    waiver only counts once a PRINCIPAL has approved it (enforced in the Hono
--    route + an approvals-style flow — see the plan; column writes themselves
--    stay operation+principal via the existing ops_order_control RLS).
alter table public.ops_order_control
  add column if not exists storage_collected_at        timestamptz,
  add column if not exists storage_waiver_status        text not null default 'none'
        check (storage_waiver_status in ('none','requested','approved','rejected')),
  add column if not exists storage_waiver_reason        text,
  add column if not exists storage_waiver_requested_by  uuid references auth.users(id),
  add column if not exists storage_waiver_decided_by    uuid references auth.users(id),
  add column if not exists storage_waiver_decided_at    timestamptz;
