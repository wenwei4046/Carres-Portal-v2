-- =============================================================================
-- 0177_combo_pricing.sql — Phase 4: combo / set pricing
-- =============================================================================
-- WHY:
--   The principal ("Master Admin") defines a named combo = a fixed SET of
--   product SKUs (each with a qty) sold together at ONE combo price.
--   At add-to-cart the POS EXPLODES a combo into its real component
--   order_lines, splitting combo_price proportionally across the components.
--   That keeps every downstream consumer working UNCHANGED — PO-by-sku,
--   stock reservation, supplier forecast, and finance all still see plain
--   per-SKU order_lines, never a "combo line".
--
-- ORDER CONTRACT UNTOUCHED:
--   Combo membership rides entirely in order_lines.attrs
--   (`attrs.combo_key` / `attrs.combo_label`) — a jsonb tag for traceability.
--   NO change to order_lines, create_order, or any part of the order contract.
--
-- CLIENT-PRICED:
--   The POS computes the proportional split client-side; the server does NOT
--   recompute combo prices (consistent with the fabric-tier v1 model in 0176).
--
-- PRINCIPAL-OWNED:
--   Pricing knobs are principal-only.  RLS mirrors floor_config / 0176 exactly
--   via (select public.is_principal()) — read by any authenticated user,
--   ALL writes gated to the principal.
--
-- combo_components.sku FK:
--   product_skus.sku carries a UNIQUE constraint (product_skus_sku_key), so a
--   text FK to product_skus(sku) is valid.  ON DELETE RESTRICT means a SKU
--   that is in use by a combo cannot be hard-deleted out from under it.
--
-- ADDITIVE ONLY:
--   This migration only CREATEs 2 new tables.  No existing columns,
--   constraints, triggers, or data are modified.
--   (Never edit frozen migrations 0001–0176.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Combos — one row per named set, priced at a single combo_price.
--    combo_key is the stable handle the POS tags onto order_lines.attrs.
--    updated_by is a plain nullable uuid (no FK — system edits have no actor),
--    mirroring how 0176 left updated_by un-FK'd.
-- -----------------------------------------------------------------------------
CREATE TABLE public.combos (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_key       text          NOT NULL UNIQUE,
  name            text          NOT NULL,
  combo_price     numeric(12,2) NOT NULL CHECK (combo_price >= 0),
  active          boolean       NOT NULL DEFAULT true,
  effective_from  date          NOT NULL DEFAULT current_date,
  discontinued_at timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      uuid
);

-- -----------------------------------------------------------------------------
-- 2. Combo components — the fixed set of SKUs (with qty) that make up a combo.
--    PRIMARY KEY (combo_id, sku) = a SKU appears at most once per combo.
--    ON DELETE CASCADE: deleting a combo removes its component rows.
--    ON DELETE RESTRICT on the sku FK: a SKU referenced by a combo cannot be
--    hard-deleted (product_skus.sku is UNIQUE, so the text FK is valid).
-- -----------------------------------------------------------------------------
CREATE TABLE public.combo_components (
  combo_id   uuid NOT NULL REFERENCES public.combos(id)         ON DELETE CASCADE,
  sku        text NOT NULL REFERENCES public.product_skus(sku)  ON DELETE RESTRICT,
  qty        int  NOT NULL CHECK (qty > 0),
  sort_order int  NOT NULL DEFAULT 0,
  PRIMARY KEY (combo_id, sku)
);

-- -----------------------------------------------------------------------------
-- 3. RLS — mirror floor_config / 0176 pattern exactly:
--      SELECT: any authenticated user (auth.uid() is not null)
--      ALL write: principal-only via (select public.is_principal()) [InitPlan wrap]
--
--   public.is_principal() verified on live DB:
--     args='', prosecdef=true, provolatile='s' (STABLE)
--     → §8 compliant: STABLE + SECURITY DEFINER + (select …) wrap
-- -----------------------------------------------------------------------------

ALTER TABLE public.combos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_components ENABLE ROW LEVEL SECURITY;

-- combos: read by all authenticated, write by principal only
CREATE POLICY combos_read_all
  ON public.combos
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY combos_write_principal
  ON public.combos
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- combo_components: read by all authenticated, write by principal only
CREATE POLICY combo_components_read_all
  ON public.combo_components
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY combo_components_write_principal
  ON public.combo_components
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
