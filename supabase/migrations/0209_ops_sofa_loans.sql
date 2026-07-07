-- 0209_ops_sofa_loans
--
-- Sofa loan flow (Jess 2026-07-07). At the deadline, if the real sofa isn't ready
-- and the customer can't wait, operation lends ANY free sofa (prefer Exhibition /
-- Old), FREE, and issues a loan DO. The loaner is tracked "on loan" against the
-- order (the order stays open, the real sofa still Waiting); at the real delivery
-- it's collected back (swap) and returns to free stock.
--
-- ops_sofa_loans links the order to the loaned ops_stock_items unit + the DO. The
-- loaned unit is set status='reserved' (reserved_ref "LOAN SO-{n}") while on loan
-- and back to 'free' on return — that write is done by the /loan-sofa and
-- /loan-return endpoints. RLS mirrors ops_order_control (read internal, write
-- operation/principal).

create table if not exists public.ops_sofa_loans (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  item_id     uuid not null references public.ops_stock_items(id) on delete restrict,
  do_number   text,
  status      text not null default 'on_loan' check (status in ('on_loan', 'returned')),
  loaned_at   timestamptz not null default now(),
  returned_at timestamptz,
  loaned_by   uuid,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_ops_sofa_loans_order
  on public.ops_sofa_loans (order_id);
create index if not exists idx_ops_sofa_loans_active
  on public.ops_sofa_loans (order_id) where status = 'on_loan';

alter table public.ops_sofa_loans enable row level security;

create policy osl_read_internal on public.ops_sofa_loans
  for select
  using ( (select public.is_internal()) );

create policy osl_write_op_principal on public.ops_sofa_loans
  for all
  using      ( (select (auth.jwt() -> 'app_metadata' ->> 'role')) = any (array['operation', 'principal']) )
  with check ( (select (auth.jwt() -> 'app_metadata' ->> 'role')) = any (array['operation', 'principal']) );
