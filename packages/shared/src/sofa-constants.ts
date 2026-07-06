/**
 * Sofa engine constants (Phase 2, migration 0179).
 *
 * `SOFA_HEIGHTS` is the canonical seat-height / depth axis for sofa combos —
 * the SUPERSET of valid keys in a combo's `prices_by_height` matrix (= 2990s
 * `sofaSizes`, minus the non-dimensional "Flat"). Which of these actually
 * surface at POS is driven by the `sofa_size` option pool (0201) — the
 * Maintenance "Special Add-ons › Sofa › Sizes" list: an entry must be ACTIVE
 * in the pool to show as a seat-height tab / picker choice, and the Sofa
 * Combos price grid offers a column per active pool size. À-la-carte
 * compartment prices stay flat (height-independent) — only combos vary by
 * height.
 */
export const SOFA_HEIGHTS = ["24", "26", "28", "30", "32", "35", "37"] as const;

export type SofaHeight = (typeof SOFA_HEIGHTS)[number];
