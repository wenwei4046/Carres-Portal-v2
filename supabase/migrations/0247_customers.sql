-- 0247_customers.sql
-- Rental + Service Plan base (Loo 2026-07-25) — the FIRST customer entity.
-- Until now Carres had no customer table: orders carry name/phone text and PWP
-- vouchers bind by canonical phone only (0188 pwp_phone_key). Rent-to-own
-- agreements and service entitlements must OUTLIVE any single order and be
-- checkable by the customer, so the customer becomes a real row.
--
-- phone_key = the MY-aware canonical phone (computed app-side by the same
-- helper family as pwp_phone_key) and is the natural identity: one customer
-- per canonical phone. Raw phone is kept as typed for display/callback.
--
-- RLS: internal-only for the base (dormant — no POS/customer surface writes
-- yet). Store-side POS access is widened in the sell phase, deliberately not
-- before it exists.

CREATE TABLE public.customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text NOT NULL,
  phone_key   text NOT NULL UNIQUE,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

CREATE INDEX customers_name_idx ON public.customers (name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_internal_all
  ON public.customers
  FOR ALL
  USING      ((SELECT public.is_internal()))
  WITH CHECK ((SELECT public.is_internal()));
