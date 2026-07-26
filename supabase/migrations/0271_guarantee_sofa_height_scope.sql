-- =============================================================================
-- 0271_guarantee_sofa_height_scope.sql  (Loo 2026-07-26)
-- =============================================================================
-- Loo: a guarantee's variants come from THAT category's Maintenance pool —
-- mattress from `mattress_size`, bedframe from `bedframe_size`, "and sofa's
-- too". 0270 read the first two but gave sofa no variant axis at all, so its
-- Maintenance pool (`sofa_size` — the seat heights 24 / 26 / … / Flat) could
-- not be used to narrow a guarantee.
--
-- Seat height is ORTHOGONAL to shape: "the L-shape combo, at 32 inch" is a
-- sensible cover, so this widens the variants CHECK rather than adding another
-- mutually-exclusive scope. `covers_variants` therefore means:
--   mattress / bedframe → the SIZE  (King / Queen / …)
--   sofa                → the SEAT HEIGHT (24 / 32 / Flat …)
--   accessory           → still nothing (Loo was explicit: no variant axis)
--
-- Nothing to backfill: no sofa-scoped term carries variants today, and the
-- CHECK only ever widens what is allowed.
--
-- Authorized in conversation 2026-07-26 per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_variants_scope_ck;

ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_variants_scope_ck CHECK (
    covers_variants IS NULL
    OR cardinality(covers_variants) = 0
    OR covers_category IN ('mattress', 'bedframe', 'sofa')
  );

COMMENT ON COLUMN public.guarantee_terms.covers_variants IS
  'NULL / empty = any. mattress+bedframe = the SIZE (King/Queen/…); sofa = the '
  'SEAT HEIGHT (24/32/Flat…). Accessories carry no variant axis. Every list is '
  'the category''s own Maintenance pool.';
