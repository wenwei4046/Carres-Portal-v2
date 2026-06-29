-- 0182_catalog_option_pools.sql
-- 2990s Products parity Phase 4 — Maintenance pools (global option pools).
-- The 2990s Maintenance tab curates Brandings, Supplier Categories, Bedframe
-- Sizes and Mattress Sizes. Carres scope (Loo, 2026-06-26):
--   • Branding DROPPED — every Carres product is the same brand ("all Carres").
--   • Three pools only: supplier_category · bedframe_size · mattress_size.
--   • Sizes carry label + dimensions (mirrors 2990s sizeLabels override).
--   • The versioned config-history layer is DEFERRED (current-snapshot only) —
--     so this is ONE plain relational table, NOT the 2990s maintenance_config_
--     history JSONB blob.
--
-- One GENERIC table (a `pool` discriminator) keeps it DRY: adding a future pool
-- (sofa sizes, gaps, colours, branding-if-ever) is a new `pool` value + a CHECK
-- bump, no new migration of shape. value/label/dimensions cover both the plain
-- value pools (supplier_category) and the rich size pools.
--
-- These pools are READ-ONLY REFERENCE LISTS — they do NOT become a source of
-- truth for any existing consumer:
--   • Sizes: product_models.allowed_options.sizes stays the per-model source;
--     the pool only feeds the catalog size picker as curated suggestions.
--     Configurators / create_order / order_lines / DraftLine are UNTOUCHED.
--   • Supplier categories: suppliers.cat_covered stays the mutable source; the
--     pool is a curated reference list only (no supplier-page wiring this phase).
--
-- Principal-only writes (mirrors 0176/0177/0178/0179/0181 — these are pricing-
-- adjacent catalog config owned by the Master Admin). Additive + zero behaviour
-- change (empty table → existing fallbacks apply). Tail after this = 0182.

CREATE TABLE public.catalog_option_pools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- which pool this entry belongs to
  pool        text NOT NULL CHECK (pool IN ('supplier_category', 'bedframe_size', 'mattress_size')),
  -- the canonical value / code, e.g. 'sofa', 'K', 'Q' (unique within its pool)
  value       text NOT NULL,
  -- display label, e.g. '6FT' (size pools only; null for supplier_category)
  label       text,
  -- physical dimensions, e.g. '183X190CM' (size pools only)
  dimensions  text,
  -- inactive entries are hidden from new pickers but kept for historical display
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  -- no duplicate values within a single pool
  UNIQUE (pool, value)
);

CREATE INDEX catalog_option_pools_pool_active_sort_idx
  ON public.catalog_option_pools (pool, active, sort_order);

ALTER TABLE public.catalog_option_pools ENABLE ROW LEVEL SECURITY;

-- read by any authenticated user (the catalog bundle + Maintenance UI need it)
CREATE POLICY catalog_option_pools_read_all
  ON public.catalog_option_pools
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- write by principal only — InitPlan-wrapped is_principal() (§8 compliant)
CREATE POLICY catalog_option_pools_write_principal
  ON public.catalog_option_pools
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
