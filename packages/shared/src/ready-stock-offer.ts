/**
 * READY STOCK IS SUGGESTED; THE HUMAN DECIDES WHETHER TO TAKE IT — card P10
 * (`docs/purchasing-execution-queue.md`, Loo 2026-08-04).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 *
 * The engine has been able to net free stock against demand since
 * `net-requirements.ts` shipped, behind `consumeFreeStock`, and that flag
 * **stays OFF**. Jess ruled on 2026-07-21 that goods are labelled per order and
 * that auto-consuming free stock without a WMS confuses goods in and goods out;
 * P10 does not reopen that ruling. **The defect P10 fixes is the other half of
 * it: a decision reserved for a human was never SHOWN to the human.** To Order
 * printed `Qty 5` with no hint that the warehouse already held two.
 *
 * So this module computes an OFFER — what the floor could give this build, and
 * exactly what one press of the button would claim. It nets nothing, decides
 * nothing and writes nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE OFFER CARRIES TWO NUMBERS AND NOT ONE
 *
 * `available` is what the pool holds. `takeable` is what the button produces.
 * They differ, and pretending otherwise is how a screen starts lying:
 *
 *   · **The register moves WHOLE RECORDS.** `ops_stock_pool_draw` flips one
 *     `ops_stock_items` row, and 0218 bulk rows are ONE record of N units —
 *     K4 says so in its own words and refuses to split them ("splitting a
 *     555-unit accessory row belongs to the reservation engine"). So a demand
 *     for 1 against a single 2-unit record can take NOTHING without
 *     over-reserving, and the honest answer is `available 2 · takeable 0`.
 *   · **A take may never overshoot the demand.** Reserving 5 units against a
 *     requirement for 3 locks two units to a customer who did not order them.
 *
 * P9's law applies here word for word: *the number a row shows is the number of
 * units its click produces.* That number is `takeable`; `available` is stated
 * beside it so the operator can see what the system saw.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIFO, BECAUSE THE DOOR IS FIFO
 *
 * `ops_stock_pool_draw` picks `order by date_in asc nulls last, created_at asc`
 * — the rule `ops_stock_reserve` has used since 0137. The caller hands units in
 * that same order and this function keeps it, so the units NAMED here are the
 * units the door would claim. A suggestion that names different units from the
 * ones the act takes is a suggestion nobody can check.
 *
 * Pure and deterministic, like every other engine in this package: the API
 * decides, the browser renders the answer, and the two can never present
 * different arithmetic.
 */

/** One free record in the per-unit register, in the door's own pick order. */
export interface FreeStockUnit {
  /** `ops_stock_items.id` — what the draw claims. */
  itemId: string;
  /** The register's OWN spelling. Never the catalog's — the door matches on it. */
  sku: string;
  /** Units this record represents. 0218 bulk rows are one record of N. */
  qty: number;
  /** `new` · `exhibition` · … — stated, never filtered here (the caller scopes). */
  condition: string | null;
  /** Where it stands. One warehouse today; the offer says which. */
  warehouse: string | null;
}

export interface ReadyStockOffer {
  /** Free units on the floor that match this build. What the pool holds. */
  available: number;
  /**
   * What one press of the button would actually reserve: whole records, in the
   * door's own FIFO order, never more than the build still needs.
   */
  takeable: number;
  /** The records that press would claim, in the order it would claim them. */
  itemIds: string[];
  /** The register's spelling of the matched item — the door's `p_sku`. */
  stockSku: string;
  /** Where the units stand. Null when the register does not say. */
  warehouse: string | null;
}

/**
 * The offer for a build that needs `needed` units, given the free records that
 * match it (already matched and already in FIFO order by the caller).
 *
 * Returns `null` when the pool holds nothing — **the card's ❌ "show a marker
 * when free stock is 0"**, made structural: there is no offer to render rather
 * than an offer that renders as a zero.
 *
 * A record too large for what is left is SKIPPED, not stopped on: a 2-unit
 * record cannot serve a remaining 1, but a 1-unit record behind it still can,
 * and refusing it would leave a unit on the floor for no reason a human could
 * name.
 */
export function readyStockOffer(
  needed: number,
  units: readonly FreeStockUnit[],
): ReadyStockOffer | null {
  const want = Math.max(0, Math.floor(needed));
  let available = 0;
  for (const u of units) available += Math.max(0, Math.floor(u.qty));
  if (available <= 0) return null;

  let takeable = 0;
  const itemIds: string[] = [];
  for (const u of units) {
    const q = Math.max(0, Math.floor(u.qty));
    if (q <= 0) continue;
    if (takeable + q > want) continue;
    takeable += q;
    itemIds.push(u.itemId);
    if (takeable === want) break;
  }

  return {
    available,
    takeable,
    itemIds,
    stockSku: units[0]?.sku ?? "",
    warehouse: units.find((u) => u.warehouse)?.warehouse ?? null,
  };
}
