/**
 * THE AVAILABILITY ARITHMETIC — 0366, the Warehouse Unit authority foundation.
 *
 * The Unit register is the only inventory authority (Stock MASTER §4), and a
 * derived fact has ONE arithmetic (Architecture Law D). This file is the
 * TypeScript half of that one arithmetic; `public.unit_availability()` in
 * migration 0366 is the SQL half, and `unit-availability.test.ts` pins the two
 * together case by case.
 *
 * NOTHING may re-derive availability from a status, a stored total or a bulk
 * quantity. `stock_balances` is a non-authoritative cache of the legacy RPCs
 * and may never answer "can we offer this?" — the view
 * `public.stock_sku_availability` does, and it computes from the register on
 * every read so it cannot be stale.
 */

/** The six words, and the only six. Order is precedence, highest first. */
export const UNIT_AVAILABILITY = [
  "ended",
  "in_transit",
  "incoming",
  "reserved",
  "not_available",
  "available",
] as const;

export type UnitAvailability = (typeof UNIT_AVAILABILITY)[number];

/**
 * Operator-facing words for each bucket. `reserved` reads "Reserved / sold"
 * because that is the operator's phrase for a Unit the Sales Order has bound
 * (MASTER §4) — the VALUE stays `reserved`, because a filter key is not UI
 * wording.
 */
export const UNIT_AVAILABILITY_LABEL: Record<UnitAvailability, string> = {
  available: "Available",
  reserved: "Reserved / sold",
  incoming: "Incoming",
  in_transit: "In transit",
  not_available: "Not available",
  ended: "Delivered / history",
};

/** A condition that CONTROLS the Unit rather than describing it. R4 releases a
 *  quarantined unit back to `free` keeping the condition it was released with,
 *  so a damaged unit can be `free` and sound and still unsellable — the case
 *  the To Order engine closed in 2026-08 and the one 0371 closed here. The
 *  other four (`new`, `exhibition`, `old`, `refurbished`) are all sellable. */
const CONTROLLED_CONDITIONS = new Set(["damaged"]);

/** Statuses that mean the Unit's life ended — it is history, never stock. */
const ENDED_STATUSES = new Set([
  "sold",
  "voided",
  "returned_to_supplier",
  "written_off",
]);

/**
 * What a Unit's availability IS.
 *
 * RESERVED OUTRANKS CONTROL on purpose: Warehouse may protect a problematic
 * reserved Unit but never silently releases or substitutes it (MASTER §4), so
 * flagging one for repair must not quietly hand it back to the pool. It is not
 * `available` either way, so no goods are offered twice.
 */
export function unitAvailability(unit: {
  status: string | null | undefined;
  needsRepair?: boolean | null;
  holdReason?: string | null;
  condition?: string | null;
}): UnitAvailability {
  const status = unit.status ?? "";
  if (ENDED_STATUSES.has(status)) return "ended";
  if (status === "transferred") return "in_transit";
  if (status === "incoming") return "incoming";
  if (status === "reserved") return "reserved";
  if (status === "on_hold") return "not_available";
  if (status === "free") {
    if (unit.needsRepair) return "not_available";
    if (CONTROLLED_CONDITIONS.has(unit.condition ?? "")) return "not_available";
    return "available";
  }
  return "not_available";
}

/** Can these goods be promised to a new customer? The one question. */
export function isUnitAvailable(unit: {
  status: string | null | undefined;
  needsRepair?: boolean | null;
  holdReason?: string | null;
  condition?: string | null;
}): boolean {
  return unitAvailability(unit) === "available";
}

/**
 * HOW a Unit's life ended — a SEPARATE authoritative fact from availability.
 * `ended` is the right bucket for a list, but Delivered / history has to tell
 * a Unit delivered to a customer from one cancelled before it ever arrived,
 * written off, or returned to its supplier. Availability must never carry
 * lifecycle history (owner ruling 2026-08-20).
 */
export const UNIT_LIFECYCLE_OUTCOMES = [
  "active",
  "delivered",
  "cancelled_before_receipt",
  "written_off",
  "returned_to_supplier",
] as const;

export type UnitLifecycleOutcome = (typeof UNIT_LIFECYCLE_OUTCOMES)[number];

export const UNIT_LIFECYCLE_OUTCOME_LABEL: Record<UnitLifecycleOutcome, string> = {
  active: "In stock",
  delivered: "Delivered",
  cancelled_before_receipt: "Cancelled before it arrived",
  written_off: "Written off",
  returned_to_supplier: "Returned to supplier",
};

export function unitLifecycleOutcome(
  status: string | null | undefined,
): UnitLifecycleOutcome {
  switch (status) {
    case "sold":
      return "delivered";
    case "voided":
      return "cancelled_before_receipt";
    case "written_off":
      return "written_off";
    case "returned_to_supplier":
      return "returned_to_supplier";
    default:
      return "active";
  }
}

/**
 * OWNERSHIP — why Carres holds the goods. Purchasing owns the source fact;
 * Finance reads it for valuation and may never write a physical fact
 * (MASTER §1).
 */
export const UNIT_OWNERSHIPS = ["carres_owned", "supplier_consignment"] as const;
export type UnitOwnership = (typeof UNIT_OWNERSHIPS)[number];

export const UNIT_OWNERSHIP_LABEL: Record<UnitOwnership, string> = {
  carres_owned: "Carres Owned",
  supplier_consignment: "Supplier Consignment",
};

/**
 * One (sku, site) row of `public.stock_sku_availability` — the ONE surface any
 * screen asks how much it has. It carries THREE named numbers because there are
 * three different questions, and 0366 shipped one number answering two of them:
 * `available` summed bulk records that `ops_stock_items_bulk_never_reserved`
 * forbids from ever being reserved, so it said 978 where 85 could actually be
 * promised (measured on production 2026-08-20).
 *
 *   available     exact Units a Sales Order can BIND right now
 *   bulkOnHand    real pieces present in a qty > 1 record — sellable in
 *                 principle, but no exact-Unit promise can name one of them
 *   sellable      available + bulkOnHand — what REPLENISHMENT asks: a shelf
 *                 holding 555 pillows needs no purchase order
 *   onHand        everything physically at the Site, reserved and controlled
 *                 units included
 *
 * Never compute `onHand - reserved` (it counts a Unit in repair as sellable),
 * and never use `available` to decide whether to buy.
 */
export interface SkuAvailability {
  sku: string;
  warehouseId: string | null;
  onHand: number;
  available: number;
  bulkOnHand: number;
  sellable: number;
  reserved: number;
  notAvailable: number;
  incoming: number;
  inTransit: number;
}

/** Can this exact Unit be bound to a Sales Order? A bulk record stands for N
 *  anonymous pieces, so it can never carry ONE customer's promise. */
export function isUnitBindable(unit: {
  status: string | null | undefined;
  needsRepair?: boolean | null;
  holdReason?: string | null;
  condition?: string | null;
  qty?: number | null;
}): boolean {
  return isUnitAvailable(unit) && (unit.qty ?? 1) === 1;
}
