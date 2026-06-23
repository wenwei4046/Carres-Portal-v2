/**
 * The single source of truth for a model's derived SKU code:
 * `{MODEL_KEY}-{variant}` (model_key upper-cased). Used to materialize size
 * variants (catalog generate-skus) AND sofa compartment skus (Phase 5
 * auto-sync), and to derive the read-back sku shown in the maintenance UI.
 *
 * Keep it here so the api mint, the api generate-skus, and the web read-back all
 * agree — a drifted copy would silently mislabel SKUs (the review's triplication
 * finding). `product_skus.sku` has no format constraint, so a `variant` with
 * parens (a compartment code like `1A(LHF)`) is fine.
 */
export function deriveSkuCode(modelKey: string, variant: string): string {
  return `${modelKey.toUpperCase()}-${variant}`;
}
