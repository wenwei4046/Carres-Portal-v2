-- Phase 5 Chunk A foundation — bank reconciliation tables.
-- Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §6.1
--
-- Why two tables:
--   - bank_statements: one row per line on the bank's monthly statement
--     (FPX inflow / outflow line). Loaded via CSV import (Q3=B locked
--     2026-05-08 21:42) — V1 supports Maybank2u 5-col CSV (date / desc /
--     amount / balance / ref) per Q3.1. Manual entry is also supported via
--     POST /api/finance/bank-statements.
--
--   - reconciliations: links a bank_statements row to ONE OF
--     payments / invoices / refunds / manual_ref. Many bank lines won't
--     auto-match (proto: customer transferred without quoting DL number),
--     so the manual_ref escape hatch is part of the contract from V1.
--
-- The check constraint enforces "at least one target" so we never end up
-- with orphan reconciliations rows. ON DELETE CASCADE on bank_statement_id
-- is intentional — re-importing a statement file should let us blow the
-- prior import's reconciliations cleanly.
--
-- RLS scope (per Loo's biz model lock 2026-05-03 §17):
--   - principal + finance: full read+write
--   - all other roles: denied (this is HQ-internal data; dealer/supplier/
--     partner have NO read on banking)
--
-- HV Portal lessons preempt-applied (per CLAUDE.md §8):
--   Fix 2 — Every policy wraps `public.app_role()` in a subselect so PG14+
--           InitPlan caching kicks in (one call per query, not per row).
--   Fix 3 — `public.app_role()` itself is already `language sql stable
--           security definer` (0002:18-22) — no STABLE marker fix needed.
--
-- Indexes:
--   - bank_statements_date_idx — recon page sorts by statement_date desc
--   - bank_statements_amount_idx — match-suggest RPC (Q4=B, Phase 5 Chunk B)
--     joins on amount; index helps the planner pick a sort
--   - bank_statements_ref_idx (partial) — match-suggest's reference LIKE
--     fallback when amount alone isn't unique
--   - reconciliations_bs_idx — single-row lookup when opening a matched line
--
-- Idempotent: not applicable (CREATE TABLE without IF NOT EXISTS by design;
-- we want the migration to fail loud if re-applied to a populated env so
-- the operator knows to write a 0061b instead).

create table bank_statements (
  id              uuid primary key default gen_random_uuid(),
  statement_date  date not null,
  description     text not null,
  amount          numeric(12,2) not null,                  -- signed: + inflow, - outflow
  reference       text,                                    -- bank's FPX/PYMT ref
  currency        text not null default 'MYR',
  raw_payload     jsonb,                                   -- raw CSV row for audit
  imported_by     uuid references app_users(id),
  imported_from   text not null default 'manual',          -- 'manual' | 'csv'
  created_at      timestamptz not null default now()
);

create index bank_statements_date_idx
  on bank_statements (statement_date desc);
create index bank_statements_amount_idx
  on bank_statements (amount);
create index bank_statements_ref_idx
  on bank_statements (reference)
  where reference is not null;

create table reconciliations (
  id                  uuid primary key default gen_random_uuid(),
  bank_statement_id   uuid not null references bank_statements(id) on delete cascade,
  payment_id          uuid references payments(id) on delete set null,
  invoice_id          uuid references invoices(id) on delete set null,
  refund_id           uuid references refunds(id) on delete set null,
  manual_ref          text,
  matched_by          uuid references app_users(id),
  matched_at          timestamptz not null default now(),
  note                text,
  constraint reconciliation_target_required check (
    payment_id is not null
    or invoice_id is not null
    or refund_id is not null
    or manual_ref is not null
  )
);

create index reconciliations_bs_idx
  on reconciliations (bank_statement_id);

-- =============================================================================
-- RLS — principal + finance only
-- =============================================================================
alter table bank_statements    enable row level security;
alter table reconciliations    enable row level security;

create policy bs_finance_all
  on bank_statements
  for all
  using      ((select public.app_role()) in ('principal','finance'))
  with check ((select public.app_role()) in ('principal','finance'));

create policy rec_finance_all
  on reconciliations
  for all
  using      ((select public.app_role()) in ('principal','finance'))
  with check ((select public.app_role()) in ('principal','finance'));
