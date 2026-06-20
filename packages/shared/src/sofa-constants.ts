/**
 * Sofa engine constants (Phase 2, migration 0179).
 *
 * `SOFA_HEIGHTS` is the canonical seat-height / depth axis for sofa combos —
 * the set of valid keys in a combo's `prices_by_height` matrix (= 2990s
 * `sofaSizes`). The builder (Phase 3) lets the customer pick one height; the
 * maintenance UI authors one combo price per height. À-la-carte compartment
 * prices stay flat (height-independent) — only combos vary by height.
 */
export const SOFA_HEIGHTS = ["24", "28", "30", "32", "35"] as const;

export type SofaHeight = (typeof SOFA_HEIGHTS)[number];
