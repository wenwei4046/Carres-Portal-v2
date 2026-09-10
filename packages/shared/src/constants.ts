// Carres does not stair-carry above floor 3. Applies to the dealer new-order
// wizard, the edit-order modal, and the createOrder/updateOrder zod schemas.
// freeUpToFloor + perFloorPerItem remain DB-configurable in `floor_config`;
// only the upper bound is policy-locked.
export const MAX_DELIVERY_FLOOR = 3 as const;

// The earliest delivery date a store may sell.
//
// P1 (2026-07-28) collapsed this to ONE number, editable on
// Purchasing → Settings (`purchasing_settings.earliest_sell_days`). It was a
// per-category constant here — mattress/bedframe 14, sofa 21 — which meant
// Jess could not move it, and it was ALSO sitting as two editable columns in
// `delivery_fee_config` that nothing read. Both are gone.
//
// The number is CALENDAR days and the caller supplies it, so the POS date
// picker, the accept-proceed soft-lock and the server-side create gate all
// read the same row rather than three copies of a literal.

/** Categories that carry a production lead at all. A pure accessory or
 *  service cart has no factory behind it and is sellable for any future
 *  date — which is why this is a SET, not a flat "applies to everything". */
export const EARLIEST_SELL_GATED_CATEGORIES = ["mattress", "bedframe", "sofa"] as const;

/**
 * The lead the cart must respect: `earliestSellDays` when any line is a made
 * item, otherwise 0 (no floor). Unknown category strings are ignored —
 * callers may pass arbitrary `product_models.category` values without
 * pre-filtering.
 */
export function maxLeadDaysFor(
  categories: readonly string[],
  earliestSellDays: number,
): number {
  const gated = categories.some((c) =>
    (EARLIEST_SELL_GATED_CATEGORIES as readonly string[]).includes(c),
  );
  return gated ? Math.max(0, Math.trunc(earliestSellDays)) : 0;
}

/**
 * THE CATEGORIES THAT ARE SOLD ON TOP OF SOMETHING ELSE, NEVER ON THEIR OWN.
 *
 * `docs/guarantee/MASTER.md` already says it for one of them — *"a guarantee
 * only sells attached to the item it covers"*. The owner ruling of 2026-08-15
 * generalises it to the whole cart: **a Sales Order must contain goods.** A
 * service with no product on the same order is not a sale, it is a Service
 * Case, and it belongs to the Service channel.
 */
export const ATTACHED_ONLY_CATEGORIES = ["service", "guarantee"] as const;

/**
 * True when the cart's resolved `product_models.category` values contain at
 * least one goods line.
 *
 * **An unrecognised category counts as GOODS.** Only a line we can POSITIVELY
 * identify as service or guarantee may be refused, so a legacy, imported or
 * not-yet-catalogued SKU never blocks a real sale — the same positive-
 * recognition rule `line-category.ts` applies to accessories.
 *
 * An EMPTY cart is not the goods gate's business (the schema's `min(1)` owns
 * it) and reports `false` here only so a caller cannot read "no lines" as
 * "goods present".
 */
export function cartHasGoods(
  categories: readonly (string | null | undefined)[],
): boolean {
  const attached = ATTACHED_ONLY_CATEGORIES as readonly string[];
  return categories.some((c) => !c || !attached.includes(c));
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

/**
 * THE INSTALMENT TERMS CARRES OFFERS.
 *
 * ⚠️ NOBODY WROTE DOWN WHY IT IS 6 AND 12 (measured 2026-09-01). There is no
 * ruling from Jess, Chai or Loo anywhere in this repository. The database
 * CHECK (`0007`) says `{6, 12}` and its header explains only why the COLUMN
 * exists — "the wizard already collects these three fields" — so the constraint
 * copied a hardcoded pair of buttons in `Step3SignaturePayment.tsx` and that is
 * the whole provenance.
 *
 * ⛔ AND THE "6/12" IN THE DOCS IS A DATE. `Jess 2026-07-19 … shipped 6/12`,
 * `the 6/12 ops overhaul`, `on prod since 6/12` — every one of those is 12 June
 * or 6 December, not a month count. Anyone grepping for a ruling will find them
 * and should not believe them.
 *
 * So this is the recorded truth and not a decided one. Adding 24 or 36 is a
 * business ruling plus a migration, not an edit here.
 */
export const INSTALMENT_MONTHS = [6, 12] as const;
export type InstalmentMonths = (typeof INSTALMENT_MONTHS)[number];
