-- 0220_ops_customer_confirmed.sql
-- Orders drawer refine (Jess 2026-07-13): a plain per-order marker — has the
-- CUSTOMER confirmed the delivery? Lives on the ops_order_control overlay next
-- to called_customer (ops called them) but records the customer's own yes.
-- Surfaced as a checkbox in the drawer's Next banner. NO alert-engine wiring —
-- the Orders list does not read it (yet); adding it to nextActionOf/slackDays
-- is a separate, explicit decision.
--
-- Additive + dormant for the deployed system: the live Worker selects explicit
-- column lists that don't include this column, and the deployed web has no UI
-- for it — only the local build reads/writes it until the next deploy.

alter table public.ops_order_control
  add column if not exists customer_confirmed boolean not null default false;

comment on column public.ops_order_control.customer_confirmed is
  'Customer has confirmed the delivery (drawer Next-banner marker, 0220). Distinct from called_customer (= ops made the call).';
