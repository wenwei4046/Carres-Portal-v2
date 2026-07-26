// Carres does not stair-carry above floor 3. Applies to the dealer new-order
// wizard, the edit-order modal, and the createOrder/updateOrder zod schemas.
// freeUpToFloor + perFloorPerItem remain DB-configurable in `floor_config`;
// only the upper bound is policy-locked.
export const MAX_DELIVERY_FLOOR = 3 as const;

// 2026-05-22 (Loo) — minimum days between Today and the dealer-picked
// delivery date, by SKU category. Mattress + Bedframe both need 14 days of
// production / consolidation lead time; sofa needs 21 because per-fabric
// production is slower. When a cart spans multiple categories the longest
// lead time wins (the wizard's Step 3 date picker enforces this).
//
// Same constants drive the Operation-side soft-lock on accept-proceed:
// if the dealer's date is >= today + lead days, the request lands in the
// standard "Awaiting Operation Action" lane; if it's beyond that horizon
// the operator has to override (warns "still N days from standard
// lead-time, are you sure?").
export const DELIVERY_LEAD_DAYS = {
  mattress: 14,
  bedframe: 14,
  sofa: 21,
} as const;
export type DeliveryLeadCategory = keyof typeof DELIVERY_LEAD_DAYS;

/**
 * Returns the longest lead-time required by the given category list, or 0
 * when nothing in the list is gated. Unknown category strings are ignored —
 * callers may pass arbitrary `product_models.category` values without
 * pre-filtering.
 */
export function maxLeadDaysFor(categories: readonly string[]): number {
  let max = 0;
  for (const c of categories) {
    const lead = DELIVERY_LEAD_DAYS[c as DeliveryLeadCategory];
    if (lead && lead > max) max = lead;
  }
  return max;
}

/** Formats `today + n days` as an ISO yyyy-mm-dd string. Used by the wizard
 *  Step 3 date picker's `min` attribute + the validity checks in draft.ts. */
export function minDeliveryDateISO(leadDays: number, today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + leadDays);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 0169-0173 — Product & Maintenance rebuild constants.
// ---------------------------------------------------------------------------

/** The 6 product categories (0169 + 0261). Order = the SKU-Master / Modular
 *  filter order. 'guarantee' sits last: it is sold ON TOP of a covered item,
 *  never on its own. */
export const PRODUCT_CATEGORIES = [
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  "service",
  "guarantee",
] as const;

/** Bare Service-category SKU codes (0172) — also the value stored in
 *  addons.service_sku and product_skus.sku (no colon namespacing). */
export const SERVICE_SKU = {
  delivery: "SVC-DELIVERY",
  disposeMattress: "SVC-DISPOSE-MATTRESS",
  disposeSofa: "SVC-DISPOSE-SOFA",
  disposeBedframe: "SVC-DISPOSE-BEDFRAME",
} as const;

/** DB CHECK + zod guard for a service SKU code. */
export const SERVICE_SKU_REGEX = /^SVC-[A-Z0-9-]+$/;

/** Seeded internal supplier (0134) that owns the Service/Accessory SKUs. */
export const CARRES_INTERNAL_SUPPLIER_SLUG = "carres-internal";

/** Public Storage bucket for product model photos (0173). */
export const PRODUCT_MODEL_PHOTOS_BUCKET = "product-model-photos";

/**
 * Categories whose SKUs carry NO supplier (0171) — they're internal
 * (delivery / disposal / labour / pure accessories). Such SKUs must NEVER
 * enter a Create-PO line. Mirrors the server set in apps/api/src/routes/catalog.ts;
 * the FE Create-PO guard reads this so the boundary is explicit, not emergent.
 */
export const SUPPLIERLESS_CATEGORIES = ["service", "accessory", "guarantee"] as const;

/**
 * Categories with NO size axis — their `product_skus.variant` is not a size at
 * all (Loo 2026-07-26, SKU Master screenshots):
 *   - `service`  — the variant IS the code (`SVC-DISPOSE-SOFA`), a naming
 *     convention, so a SIZE column just repeats the CODE column;
 *   - `guarantee` — the variant is the customer-facing invoice sentence
 *     ("Mattress Guarantee 15 Years"), which is not a size either.
 * `accessory` is deliberately NOT here: its variant is a legitimate optional
 * "option" label (POS calls it that) and is merely empty today.
 *
 * DISPLAY-only. The column still round-trips through Export / Import SKUs, so
 * the underlying value stays reachable.
 */
export const SIZELESS_CATEGORIES = ["service", "guarantee"] as const;

/** True when a SIZE column carries real meaning for this category. */
export function categoryHasSizeAxis(category: string | undefined | null): boolean {
  return !!category && !(SIZELESS_CATEGORIES as readonly string[]).includes(category);
}
