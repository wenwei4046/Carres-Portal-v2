/**
 * A service's Item Code as the Sales Order page AND its PDF print it.
 *
 * The governed identity (verified 2026-09-24): an order saves `addon_key`, the
 * catalogue's `addons.key`; a LINKED service also carries the catalogue's own
 * Service SKU, `addons.service_sku` (0172 — e.g. `dispose-mattress` →
 * `SVC-DISPOSE-MATTRESS`). No other display mapping exists.
 *
 * So: a linked service prints its catalogue Service SKU; an unlinked one
 * (`DELIVERY`, `STAIR_CARRY` — bare by design, 0393) or a historical key prints
 * EXACTLY as saved. Nothing is upper-cased or rewritten. The API applies the
 * same rule to the document payload, so page and paper tally.
 */
export const serviceCodeWord = (savedKey: string, catalogServiceSku?: string | null): string =>
  catalogServiceSku && catalogServiceSku.trim() ? catalogServiceSku.trim() : savedKey;
