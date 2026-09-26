/**
 * THE INVENTORY WORDS — owner rulings 2026-09-25 (Stock MASTER §7, COPY-STANDARD).
 *
 * One arithmetic for the two screen words every Inventory surface prints:
 *
 *   Inventory Status   can it be sold        Available · Reserved · Cannot sell (· Incoming)
 *   Stock Condition    what state it is in   New · Display · Old · Refurbished · Damaged ·
 *                                            Wrong item · In repair · Waiting inspection
 *
 * They are DERIVED from the one availability arithmetic (`unitAvailability`,
 * 0366) and the stored physical facts; nothing here re-reads a status to decide
 * saleability. `Stock use`, `Not available`, `Reserved / sold`, `Who has it`,
 * `With NETS Delivery` and `In transit` are retired screen words: a Unit on the
 * road keeps its Available/Reserved word and the road shows in the
 * `Ship Date · Pickup By · Delivery Location` columns.
 */

import type { UnitAvailability } from "./unit-availability";

export type InventoryStatus = "Available" | "Reserved" | "Cannot sell" | "Incoming";

export interface InventoryWordsInput {
  availability: UnitAvailability;
  reservedRef?: string | null;
  condition?: string | null;
  needsRepair?: boolean | null;
  holdReason?: string | null;
}

/** `null` for an ended Unit — History prints the distinct lifecycle outcome,
 *  never a saleability word. */
export function inventoryStatusOf(u: InventoryWordsInput): InventoryStatus | null {
  switch (u.availability) {
    case "available":
      return "Available";
    case "reserved":
      return "Reserved";
    case "incoming":
      return "Incoming";
    case "not_available":
      return "Cannot sell";
    case "in_transit":
      // Owner 2026-09-25: nobody records the road. The word stays what it was
      // when the Warehouse posted OUT; the movement shows in its own columns.
      return u.reservedRef ? "Reserved" : "Available";
    default:
      return null;
  }
}

export const STOCK_CONDITION_WORDS: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Old",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

/** The reason a `Cannot sell` row cannot be sold, or the plain physical grade. */
export function stockConditionOf(u: Pick<InventoryWordsInput, "condition" | "needsRepair" | "holdReason">): string {
  if (u.holdReason === "wrong_item") return "Wrong item";
  if (u.holdReason) return "Waiting inspection";
  if (u.needsRepair) return "In repair";
  return STOCK_CONDITION_WORDS[u.condition ?? ""] ?? (u.condition || "Not recorded");
}

/** The three rail rows under STOCK that read Inventory Status, in order. */
export const INVENTORY_STATUS_RAIL: readonly InventoryStatus[] = ["Available", "Cannot sell", "Incoming"];

/** The default Inventory list is what Carres physically holds: `Incoming`
 *  (born with the PO, not yet received) is a rail row, never in the default. */
export function isHeldUnit(u: Pick<InventoryWordsInput, "availability">): boolean {
  return u.availability !== "ended" && u.availability !== "incoming";
}

/** The footer's second line when goods are still owed; empty when none are. */
export function stillToArriveLine(incoming: number): string | null {
  return incoming > 0 ? `${incoming} still to arrive · see Inbound` : null;
}
