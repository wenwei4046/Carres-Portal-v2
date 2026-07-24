-- 0248_rental_config.sql
-- Rental + Service Plan base (Loo 2026-07-25) — the CONFIG side, authored in
-- the P&M "Rental" tab. Two tables:
--
--   service_packages — a cleaning-service product: duration (months) ×
--     visits-per-year (Loo: configurable — some plans 2/3/4 visits a year),
--     optionally linked to a sellable `service`-category SKU (bought at POS)
--     and priced for standalone sale. Free-with-purchase attach reuses the
--     P7 free-gift mechanism later (gift SKU = the package's SKU at RM0).
--
--   rental_plans — a rent-to-own offer on ONE sellable sku: term_months ×
--     monthly_fee (e.g. RM59 × 84), plus the per-collection revenue split
--     Loo wants recorded in finance: supplier_rate_pct (fixed, e.g. 49% of
--     every month collected goes to the supplier) and commission_base_pct
--     (base 20% to the selling dealer/salesperson — the full commission
--     HIERARCHY lives in the parallel HR line's 0245_hr_commission work and
--     is NOT rebuilt here; this is the flat base snapshot only). A plan can
--     bundle a service package for free (included_package_id).
--
-- Business locks honoured (subscription-mattress-proposal.md, Jess
-- 2026-07-22): terms are authored in the UI as 60/84-month presets (5/7 yr);
-- no deposit column on purpose. The DB stays flexible (CHECK > 0) so the
-- lock lives in config UI, not schema.
--
-- Principal-only writes (mirrors 0182); read = any authenticated (the POS
-- sell lane will need the offer list). Additive + DORMANT (empty tables).

CREATE TABLE public.service_packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  service_type     text NOT NULL DEFAULT 'cleaning'
                   CHECK (service_type IN ('cleaning', 'repair', 'other')),
  duration_months  integer NOT NULL CHECK (duration_months BETWEEN 1 AND 120),
  visits_per_year  integer NOT NULL CHECK (visits_per_year BETWEEN 1 AND 12),
  -- standalone selling price (RM); 0 = not sold standalone (free-attach only)
  price            numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- optional sellable service-category SKU; selling it mints an entitlement
  sku              text UNIQUE REFERENCES public.product_skus(sku) ON DELETE SET NULL,
  active           boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

CREATE INDEX service_packages_active_sort_idx
  ON public.service_packages (active, sort_order);

CREATE TABLE public.rental_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  text NOT NULL REFERENCES public.product_skus(sku) ON DELETE RESTRICT,
  term_months          integer NOT NULL CHECK (term_months > 0),
  monthly_fee          numeric(10,2) NOT NULL CHECK (monthly_fee >= 0),
  -- % of every collected month paid to the supplier (fixed rate, e.g. 49)
  supplier_rate_pct    numeric(5,2) NOT NULL DEFAULT 0
                       CHECK (supplier_rate_pct BETWEEN 0 AND 100),
  -- base % of every collected month to the selling dealer/salesperson (e.g. 20)
  commission_base_pct  numeric(5,2) NOT NULL DEFAULT 0
                       CHECK (commission_base_pct BETWEEN 0 AND 100),
  -- service package included free with this rental (visits ride the term)
  included_package_id  uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  active               boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  UNIQUE (sku, term_months)
);

CREATE INDEX rental_plans_active_idx ON public.rental_plans (active, sku);

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_plans     ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_packages_read_all
  ON public.service_packages FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY service_packages_write_principal
  ON public.service_packages FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

CREATE POLICY rental_plans_read_all
  ON public.rental_plans FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY rental_plans_write_principal
  ON public.rental_plans FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
