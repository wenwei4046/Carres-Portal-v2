-- 0239_product_bundles.sql
-- Bundle pricing (Loo 2026-07-19): several catalog SKUs sold together at ONE
-- bundle price (e.g. Cloud Series King + Lumi classic King + Kayu Platform King
-- = RM 2,500). The POS explodes a bundle into its component order_lines with the
-- bundle price split proportional to catalog price × qty (residue-corrected so
-- the lines sum EXACTLY to the bundle price); bundle identity rides in
-- order_lines.attrs (bundle_key / bundle_label / bundle_group) — create_order /
-- order_lines are UNTOUCHED.
--
-- NOTE: this is a deliberate REINTRODUCTION of the fixed-set bundle concept the
-- 0177 `combos` tables carried before 0206 dropped them (0177 was authored as a
-- misread of 2990s "Combo Pricing", which is the sofa system). Named `product_
-- bundles` — "combo" now unambiguously means the 0179 sofa combo system.
--
-- `components` jsonb = [{ "sku": text, "qty": int }, ...] (validated by the
-- shared zod schema; the adapter drops malformed entries — same convention as
-- model_default_free_gifts.gifts / pwp_rules targets).
--
-- Additive; principal-only write (mirrors 0181/0182/0184/0185/0186); DORMANT
-- until a bundle is authored (empty table → POS + admin UI render nothing).
-- Tail before this = 0238.

BEGIN;

CREATE TABLE public.product_bundles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  price      numeric(14,2) NOT NULL CHECK (price >= 0),
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  active     boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.product_bundles IS
  'Bundle pricing (0239): a named set of catalog SKUs sold at one bundle price. components jsonb = [{sku, qty}]. POS explodes into component order_lines (split Σ-exact); identity rides order_lines.attrs.bundle_*. Principal-only write.';

CREATE INDEX product_bundles_active_idx
  ON public.product_bundles (active);

ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_bundles_read_all
  ON public.product_bundles
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY product_bundles_write_principal
  ON public.product_bundles
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

COMMIT;
