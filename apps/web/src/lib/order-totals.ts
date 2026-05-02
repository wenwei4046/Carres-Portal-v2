import type { Order } from "@carres/shared";

/**
 * Pure-function order math. Mirrors the prototype helpers but uses the
 * unit_price stored on the line/addon at order time — no live SKU lookup.
 *
 * floorSurcharge() is stubbed to 0 in Phase 2A; it'll wire up to the
 * floor_config table in Phase 2C once we add the catalog endpoint.
 */

export function lineSubtotal(order: Order): number {
  return (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

export function addonSubtotal(order: Order): number {
  return (order.addons ?? []).reduce((s, a) => s + a.unitPrice * a.qty, 0);
}

// Stub: returns 0 until 2C wires floor_config. Real signature will accept the
// floor_config row.
export function floorSurcharge(_order: Order): number {
  return 0;
}

export function orderTotal(order: Order): number {
  return lineSubtotal(order) + addonSubtotal(order) + floorSurcharge(order);
}
