import type { FloorConfigDto, Order } from "@carres/shared";

/**
 * Pure-function order math. Mirrors the prototype helpers (proto/store.jsx
 * lines 562-570) but uses the unit_price stored on the line/addon at order
 * time — no live SKU lookup.
 *
 * Stair-carry rule (from proto):
 *   - if delivery has a lift → 0
 *   - if delivery floor ≤ floor_config.free_up_to_floor → 0
 *   - else: (floor − freeUpToFloor) × perFloorPerItem × total_qty
 *
 * Caller passes the catalog's floorConfig (fetched once via useCatalog) so
 * total math is purely client-side and no extra fetch fires per order render.
 */

export function lineSubtotal(order: Order): number {
  return (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

export function addonSubtotal(order: Order): number {
  return (order.addons ?? []).reduce((s, a) => s + a.unitPrice * a.qty, 0);
}

export function totalItems(order: Order): number {
  return (order.lines ?? []).reduce((s, l) => s + l.qty, 0);
}

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

export function floorSurcharge(order: Order, cfg: FloorConfigDto): number {
  return floorSurchargeRaw(order.delivery.floor, order.delivery.hasLift, totalItems(order), cfg);
}

export function orderTotal(order: Order, cfg: FloorConfigDto): number {
  return lineSubtotal(order) + addonSubtotal(order) + floorSurcharge(order, cfg);
}
