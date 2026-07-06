-- =============================================================================
-- 0205_compartment_special_fabric_price.sql — Per-compartment fabric-tier special
-- =============================================================================
-- WHY (Loo 2026-07-06):
--   Sofa fabric pricing already has TWO delta layers keyed on the whole sofa:
--     · global   fabric_tier_addon_config     (P2/P3 delta, all sofas)
--     · per-model model_fabric_tier_overrides  (P2/P3 delta, one sofa MODEL)
--   Add a THIRD, highest-precedence layer keyed on the COMPARTMENT: when a sofa
--   build USES a compartment carrying a special delta, that delta REPLACES
--   (overwrites, does not add to) the per-model / global fabric premium for the
--   WHOLE sofa, per tier. P1 always carries zero delta (unchanged).
--
--   Precedence in the pure engine (packages/shared/src/fabric-tier.ts):
--     per-compartment special  >  per-model override  >  global config  >  0
--   Multiple special compartments in one build → HIGHEST wins per tier (resolved
--   in the engine, `pickCompartmentSpecial`, NOT the DB).
--
-- SCOPE — fabric-delta only:
--   These columns tune the whole-sofa FABRIC premium (the P2/P3 delta), NOT the
--   compartment's own module price (that stays on the synced per-model SKU, per
--   the 2026-07-05 "pool carries no module price" decision). Naming is `_delta`
--   to match the 0176 global/per-model tier-delta vocabulary.
--
-- ADDITIVE + DORMANT:
--   Two NULLABLE columns on the principal-owned sofa_compartments pool (0178).
--   NULL = no special (the whole-sofa delta inherits per-model / global as
--   before). Existing rows default to NULL → byte-identical prices. The sofa
--   compartment engine is dormant in prod (0 compartments authored) → zero
--   behaviour change on apply.
--
-- NO RLS / TRIGGER CHANGE:
--   sofa_compartments is ALREADY entirely principal-only write via 0178's
--   `sofa_compartments_write_principal` policy — the new columns inherit that
--   lock automatically (same as the existing `default_price` pricing column; no
--   per-column 0175-style trigger is needed when the whole table is gated).
--
--   create_order / order_lines / orderLineInputSchema / DraftLine UNTOUCHED —
--   zero order-contract change. (Never edit frozen migrations 0001–0204.)
-- =============================================================================

ALTER TABLE public.sofa_compartments
  ADD COLUMN special_tier2_delta numeric(12,2)
    CHECK (special_tier2_delta IS NULL OR special_tier2_delta >= 0),
  ADD COLUMN special_tier3_delta numeric(12,2)
    CHECK (special_tier3_delta IS NULL OR special_tier3_delta >= 0);

COMMENT ON COLUMN public.sofa_compartments.special_tier2_delta IS
  'Per-compartment P2 fabric-tier delta override (0205). When a sofa build uses '
  'this compartment, REPLACES the per-model/global P2 delta for the whole sofa. '
  'NULL = inherit. Highest wins across multiple special compartments in a build.';
COMMENT ON COLUMN public.sofa_compartments.special_tier3_delta IS
  'Per-compartment P3 fabric-tier delta override (0205). See special_tier2_delta.';
