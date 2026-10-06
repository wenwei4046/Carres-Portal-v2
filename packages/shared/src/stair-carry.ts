import type { FloorConfigDto } from "./schemas/catalog";

/**
 * STAIR CARRY — the one arithmetic, now on BOTH sides of the wire.
 *
 * It lived in `apps/web/src/lib/order-totals.ts`, which the Worker cannot
 * import. So the fee the customer signed for was computed in the browser on
 * every render and **written down nowhere** — no column, no addon row, no
 * writer, across 404 migrations. The order's own total was `lines + addons`,
 * every payment door capped against that, and the difference was uncollectible
 * by any door in the portal.
 *
 * Moving it here is what lets the SERVER stamp the fee onto the order. It is a
 * MOVE, not a copy: `order-totals.ts` re-exports these two so every existing
 * caller keeps working, and there is still exactly one implementation
 * (ownership Law D — a derived fact has ONE arithmetic).
 *
 * Both functions are pure and take `FloorConfigDto`, which already lived here.
 */

/**
 * Raw stair-carry calculation — exported so the wizard's Step 2 (which holds
 * a pre-Order draft, not an Order) can call the same formula without
 * constructing a fake Order. Single source of truth: change this function and
 * both the wizard preview and the order-detail page update together.
 */
export function floorSurchargeRaw(
  floor: number,
  hasLift: boolean,
  totalQty: number,
  cfg: FloorConfigDto,
): number {
  if (hasLift) return 0;
  if (floor <= cfg.freeUpToFloor) return 0;
  const flights = floor - cfg.freeUpToFloor;
  return flights * cfg.perFloorPerItem * totalQty;
}

/**
 * ⭐ UNSET MEANS NONE — owner ruling 2026-08-27 (YH), and it is a PRICING
 * decision, not a formatting one.
 *
 * `delivery.stairItems` is the count of items that need carrying up. It used
 * to read: NULL = "nobody overrode it" = EVERY item, which is what 0104
 * documented and what the code did on both surfaces. So an order where nobody
 * was asked the question was charged the maximum stair fee.
 *
 * It now reads: NULL = NONE. Somebody has to say how many items need carrying
 * before the customer is charged for carrying them.
 *
 * ⛔ Migration 0104's column comment still says NULL = auto = every item. A
 * committed migration may not be edited (red line 6); the current meaning
 * lives in `docs/orders/MASTER.md`.
 *
 * ── AND THE COUNT IS CLAMPED ON BOTH SIDES ──────────────────────────────────
 *
 * Never below zero, and **never above the number of items on the order**. You
 * cannot carry more sofas up the stairs than the customer bought.
 *
 * The rule was written out by hand in four places and one of them had only the
 * lower half, so a typed `99` on a three-item order priced ninety-nine carries
 * on the saved-order path while the office page priced three. It is one
 * function now, and since 2026-08-29 it is one function on both the client and
 * the server — which is the only reason the two can agree about a stamped fee.
 */
export function stairCarryCount(
  itemsTotal: number,
  stairItems: number | null | undefined,
): number {
  return Math.max(0, Math.min(itemsTotal, stairItems ?? 0));
}

/**
 * THE ORDER'S STAIR FEE, from the three stored inputs plus the rate.
 *
 * The composition the browser has always done inline — clamp the count, then
 * price it — named once so the server can stamp exactly what the confirm step
 * showed. Returns 0 for a lift, for a floor at or below the free floor, and for
 * an unset count; `0` means **write no addon row**, because a zero row is noise.
 */
export function stairCarryFee(
  input: {
    floor: number;
    hasLift: boolean;
    stairItems: number | null | undefined;
    itemsTotal: number;
  },
  cfg: FloorConfigDto,
): number {
  const count = stairCarryCount(input.itemsTotal, input.stairItems);
  return floorSurchargeRaw(input.floor, input.hasLift, count, cfg);
}

/** The `addons` key the stamped fee rides on — seeded by migration 0393. */
export const STAIR_CARRY_ADDON_KEY = "STAIR_CARRY";

/**
 * THE KEYS ONLY THE SERVER MAY WRITE — one set, not three.
 *
 * These four fees are COMPUTED, so a client that could send one could name its
 * own price for it. Every door that accepts add-ons must therefore strip them.
 *
 * The three delivery keys were written out by hand at THREE such doors
 * (`POST /api/orders`, `POST /api/orders/raw`, and the add-lines pricer). When
 * `STAIR_CARRY` joined them on 2026-08-29 only the first was found, which would
 * have left two doors open to exactly the injection the other one refuses. One
 * exported set removes the fourth chance to miss one.
 */
export const SERVER_EXCLUSIVE_ADDON_KEYS: ReadonlySet<string> = new Set([
  "DELIVERY",
  "DELIVERY_CROSS",
  "DELIVERY_ADD",
  STAIR_CARRY_ADDON_KEY,
]);
