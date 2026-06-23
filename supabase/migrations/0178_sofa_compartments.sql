-- =============================================================================
-- 0178_sofa_compartments.sql — Sofa engine Phase 1: compartment pool + offered
-- =============================================================================
-- WHY:
--   The sofa engine needs a principal-owned CATALOG of compartments (the
--   "Base" — all sofa segment types: '1A(LHF)', '1NA', '2A(RHF)', … each with
--   a description + default price) plus a per-model declaration of WHICH
--   compartments each sofa model offers (a subset, with an optional per-model
--   price).  This is the data foundation every later sofa phase builds on
--   (builder / pricing engine / explode) — Phase 1 lays only the pool + the
--   offered set + price; NO builder, NO pricing engine, NO order change yet.
--
-- COMPARTMENTS BECOME REAL product_skus (later phase):
--   In a future phase each (model, compartment) becomes a REAL product_skus
--   row, so the sofa EXPLODE + every downstream consumer (PO-by-sku, stock
--   reservation, supplier forecast, finance, per-line-thread, SO-Maintenance)
--   keep working UNCHANGED — exactly like the combo explode references real
--   SKUs (0177).  The additive product_skus.compartment_id column is added
--   NOW so it is ready to link a future compartment SKU back to its type.
--   NO SKU rows are generated in Phase 1.
--
-- POOL + OVERRIDE pricing model:
--   sofa_compartments.default_price = the pool price (matches the RM column in
--   the maintenance screenshot).  model_sofa_compartments row PRESENT = that
--   model offers that compartment; price_override NULL = use the pool
--   default_price (mirrors the fabric-tier per-model override pattern in 0176).
--   Price kept numeric MYR.  Pricing is principal-owned (consistent with 0175).
--
-- PRINCIPAL-OWNED:
--   Pricing knobs are principal-only.  RLS mirrors floor_config / 0176 / 0177
--   exactly via (select public.is_principal()) — read by any authenticated
--   user, ALL writes gated to the principal.
--
-- FK rules:
--   model_sofa_compartments.model_id        ON DELETE CASCADE  — deleting a
--     model removes its offered rows.
--   model_sofa_compartments.compartment_id  ON DELETE RESTRICT — an in-use
--     compartment cannot be hard-deleted out from under a model that offers it.
--   product_skus.compartment_id (nullable, no ON DELETE) — only future
--     compartment SKUs set it; plain references sofa_compartments(id).
--
-- ADDITIVE ONLY:
--   This migration only CREATEs 2 new tables + ADDs 1 nullable column.  No
--   existing columns, constraints, triggers, or data are modified.  Bedframe
--   is NOT touched.  create_order / order_lines / orderLineInputSchema /
--   DraftLine are UNTOUCHED — zero order-contract change.
--   (Never edit frozen migrations 0001–0177.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Compartment pool — the "Base" catalog of sofa segment types.
--    code is the stable handle (e.g. '1A(LHF)') and is UNIQUE.
--    default_price = the pool price; a model may override per compartment.
--    updated_by is a plain nullable uuid (no FK — system edits have no actor),
--    mirroring how 0176/0177 left updated_by un-FK'd.
-- -----------------------------------------------------------------------------
CREATE TABLE public.sofa_compartments (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text          NOT NULL UNIQUE,
  description   text,
  seat_count    int,
  arm_config    text,
  icon_url      text,
  default_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_price >= 0),
  sort_order    int           NOT NULL DEFAULT 0,
  active        boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  updated_by    uuid
);

-- -----------------------------------------------------------------------------
-- 2. Per-model offered compartments (+ optional price override).
--    Row PRESENT = the model offers this compartment.
--    price_override NULL = use the pool default_price (NOT 0).
--    PRIMARY KEY (model_id, compartment_id) = a compartment is offered at most
--    once per model.
--    ON DELETE CASCADE on model_id   : deleting a model removes its offered rows.
--    ON DELETE RESTRICT on the FK to sofa_compartments: an in-use compartment
--    cannot be hard-deleted out from under a model that offers it.
-- -----------------------------------------------------------------------------
CREATE TABLE public.model_sofa_compartments (
  model_id       uuid          NOT NULL REFERENCES public.product_models(id)    ON DELETE CASCADE,
  compartment_id uuid          NOT NULL REFERENCES public.sofa_compartments(id) ON DELETE RESTRICT,
  price_override numeric(12,2) CHECK (price_override IS NULL OR price_override >= 0),
  sort_order     int           NOT NULL DEFAULT 0,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  updated_by     uuid,
  PRIMARY KEY (model_id, compartment_id)
);

-- -----------------------------------------------------------------------------
-- 3. product_skus.compartment_id — links a (future) compartment SKU to its type.
--    Nullable + additive: only future compartment SKUs set it; existing SKUs
--    stay NULL.  No SKU rows are generated in Phase 1.  product_skus already
--    has its own RLS — adding a nullable column changes no access rules.
-- -----------------------------------------------------------------------------
ALTER TABLE public.product_skus
  ADD COLUMN compartment_id uuid REFERENCES public.sofa_compartments(id);

-- -----------------------------------------------------------------------------
-- 4. RLS — mirror floor_config / 0176 / 0177 pattern exactly:
--      SELECT: any authenticated user (auth.uid() is not null)
--      ALL write: principal-only via (select public.is_principal()) [InitPlan wrap]
--
--   public.is_principal() verified on live DB:
--     args='', prosecdef=true, provolatile='s' (STABLE)
--     → §8 compliant: STABLE + SECURITY DEFINER + (select …) wrap
-- -----------------------------------------------------------------------------

ALTER TABLE public.sofa_compartments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_sofa_compartments ENABLE ROW LEVEL SECURITY;

-- sofa_compartments: read by all authenticated, write by principal only
CREATE POLICY sofa_compartments_read_all
  ON public.sofa_compartments
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY sofa_compartments_write_principal
  ON public.sofa_compartments
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- model_sofa_compartments: read by all authenticated, write by principal only
CREATE POLICY model_sofa_compartments_read_all
  ON public.model_sofa_compartments
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY model_sofa_compartments_write_principal
  ON public.model_sofa_compartments
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
