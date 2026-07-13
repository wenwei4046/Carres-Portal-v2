-- 0221_ops_last_chased_at.sql
-- Orders drawer Round 1A (Jess 2026-07-13): stamp when ops last CHASED the
-- partner/supplier for this order — written by the drawer's "WhatsApp <partner>"
-- copy-template button (copy to clipboard + stamp now). Read-only surface for
-- now; no alert-engine wiring.
--
-- Additive + dormant for the deployed system (same rationale as 0220): the live
-- Worker selects explicit column lists without it; the deployed web has no UI.

alter table public.ops_order_control
  add column if not exists last_chased_at timestamptz;

comment on column public.ops_order_control.last_chased_at is
  'When ops last chased the logistic/supplier for this order (drawer WhatsApp copy button, 0221).';
