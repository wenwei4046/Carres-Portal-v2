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

/**
 * Normalized MATCH KEY for a product SKU — used to link `order_lines.sku` ↔
 * `ops_stock_items.sku` when neither lives in the (currently empty) catalog and
 * both sources carry the product NAME with only cosmetic drift (case +
 * separators). Lower-cases and strips every non-alphanumeric char, so:
 *
 *   "Breeze FirmCare-B1201F-Q"  →  "breezefirmcareb1201fq"   (order line)
 *   "Breeze Firmcare B1201F-Q"  →  "breezefirmcareb1201fq"   (warehouse stock)  ✓ match
 *
 * The model code + size suffix are preserved (…b1201f-q stays distinct from
 * …b1201f-k), so a Queen unit never matches a King order line. Two genuinely
 * different products only collide if their names are identical after stripping
 * punctuation — acceptable for the ops stock-reserve flow (see
 * project-catalog-empty-sku-naming). Returns "" for an empty/punctuation-only sku.
 */
export function normalizeSkuKey(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
