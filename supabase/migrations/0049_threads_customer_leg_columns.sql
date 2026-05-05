-- Phase 4.5 Chunk 2 Sprint A Task 1: per-leg LP schema split (CQ1=option (b)).
--
-- Per `docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md` §3.2,
-- the customer-leg LP fields and RFD/accept timestamps move from
-- `purchase_orders` to `order_supplier_threads`. PO retains only the
-- procurement-leg partner (renamed `procurement_partner_id` in Sprint C
-- migration 0052). This migration is the additive foundation: ADD COLUMNS
-- on threads + a partial index that mirrors 0044's `po_partner_rfd_pending_idx`
-- shape so the Logistics "RFD pending" queue can run partner-scoped queries
-- against threads instead of POs.
--
-- Schema change (all NULLABLE, no defaults):
--   order_supplier_threads.delivery_partner_id      uuid REFERENCES delivery_partners(id)
--   order_supplier_threads.confirm_delivery_date    date
--   order_supplier_threads.request_for_delivery_at  timestamptz
--   order_supplier_threads.partner_accepted_at      timestamptz
--   order_supplier_threads.partner_rejected_at      timestamptz
--
-- Plus partial index `ost_rfd_pending_idx` on
--   (delivery_partner_id, request_for_delivery_at)
--   WHERE request_for_delivery_at IS NOT NULL
--     AND partner_accepted_at IS NULL
--     AND partner_rejected_at IS NULL
-- to support partner-scoped "pending acceptance" queue listings.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Re-running this migration on a post-applied database is a no-op.
--
-- RLS posture: `order_supplier_threads` already has full RLS from 0033 +
-- 0046 (LP role partner-scoped reads). The column whitelist VOLATILE
-- trigger from 0046 will be extended in Sprint B Task 6 to allow LP role
-- to write `partner_accepted_at` / `partner_rejected_at` on their own
-- threads. This migration adds columns only — no RLS or trigger changes.
--
-- Migration 0050 (Sprint A Task 2) backfills these columns from PO data.
-- Sprint C migration 0052 drops the legacy PO columns (IRREVERSIBLE,
-- gated on Loo's explicit at-apply approval).

alter table public.order_supplier_threads
  add column if not exists delivery_partner_id     uuid references public.delivery_partners(id),
  add column if not exists confirm_delivery_date   date,
  add column if not exists request_for_delivery_at timestamptz,
  add column if not exists partner_accepted_at     timestamptz,
  add column if not exists partner_rejected_at     timestamptz;

create index if not exists ost_rfd_pending_idx
  on public.order_supplier_threads (delivery_partner_id, request_for_delivery_at)
  where request_for_delivery_at is not null
    and partner_accepted_at is null
    and partner_rejected_at is null;
