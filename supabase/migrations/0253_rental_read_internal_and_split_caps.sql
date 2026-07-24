-- 0253_rental_read_internal_and_split_caps.sql
-- Rental base hardening (adversarial review findings on 0248/0249, applied the
-- same session while every table is still EMPTY — trivially safe).
--
-- 1) MAJOR: 0248's read-all-authenticated on the config tables would have let
--    ANY store/supplier/partner JWT read supplier_rate_pct +
--    commission_base_pct via direct PostgREST once a plan is authored —
--    cross-party commercial terms (dealer sees the supplier's 49% cut,
--    supplier sees the dealer's 20% base), a step beyond the accepted
--    product_skus.cost exposure. The base's only reader (GET
--    /api/rental/config) is internal, so read narrows to is_internal(); the
--    POS sell lane will widen DELIBERATELY with a stripped projection (no pct
--    columns) when it ships.
--
-- 2) The split can never exceed the collection: supplier + commission <= 100
--    on rental_plans AND on the agreement snapshots (which 0249 shipped
--    without even the per-column 0..100 CHECK). Mirrored in zod
--    (rentalPlanInputSchema .refine).
--
-- 3) Money columns written later by the billing engine get their >= 0 CHECKs
--    now (paid_amount / supplier_share / commission_share / buyout_amount).

DROP POLICY service_packages_read_all ON public.service_packages;
DROP POLICY rental_plans_read_all     ON public.rental_plans;

CREATE POLICY service_packages_read_internal
  ON public.service_packages FOR SELECT
  USING ((SELECT public.is_internal()));

CREATE POLICY rental_plans_read_internal
  ON public.rental_plans FOR SELECT
  USING ((SELECT public.is_internal()));

ALTER TABLE public.rental_plans
  ADD CONSTRAINT rental_plans_split_cap
    CHECK (supplier_rate_pct + commission_base_pct <= 100);

ALTER TABLE public.rental_agreements
  ADD CONSTRAINT rental_agreements_supplier_pct_range
    CHECK (supplier_rate_pct BETWEEN 0 AND 100),
  ADD CONSTRAINT rental_agreements_commission_pct_range
    CHECK (commission_base_pct BETWEEN 0 AND 100),
  ADD CONSTRAINT rental_agreements_split_cap
    CHECK (supplier_rate_pct + commission_base_pct <= 100),
  ADD CONSTRAINT rental_agreements_buyout_nonneg
    CHECK (buyout_amount IS NULL OR buyout_amount >= 0);

ALTER TABLE public.rental_billings
  ADD CONSTRAINT rental_billings_paid_nonneg
    CHECK (paid_amount IS NULL OR paid_amount >= 0),
  ADD CONSTRAINT rental_billings_supplier_share_nonneg
    CHECK (supplier_share IS NULL OR supplier_share >= 0),
  ADD CONSTRAINT rental_billings_commission_share_nonneg
    CHECK (commission_share IS NULL OR commission_share >= 0);
