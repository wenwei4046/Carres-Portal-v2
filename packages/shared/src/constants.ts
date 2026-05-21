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
