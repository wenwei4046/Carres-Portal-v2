import type { Order } from "@carres/shared";

/**
 * POS My-orders lane + edit-scope model (design:
 * docs/superpowers/plans/2026-07-14-pos-order-detail.md §1 — the Carres
 * mapping of the 2990s `getSoEditScope` / `so-edit-scope.ts`).
 *
 * Lane semantics (the board's 3 columns):
 *   place     — status 'place', untouched by ops, native → EVERYTHING editable
 *   proceed   — status 'proceed_order', or a 'place' order ops already picked
 *               up (operationStage set) or an AutoCount import → customer /
 *               address / payment only; dates + items locked
 *   delivered — status 'delivered' → fully read-only
 *   cancelled — off the board (null lane)
 */

export type Lane = "place" | "proceed" | "delivered";

export function laneOf(
  status: Order["status"],
  operationStage?: Order["operationStage"],
  sourceSystem?: Order["sourceSystem"],
): Lane | null {
  if (status === "delivered") return "delivered";
  if (status === "proceed_order") return "proceed";
  if (status === "place") {
    // A 'place' order that's already out of the dealer's hands sits in the
    // Proceed lane: operation picked it up (stage set), or it's an AutoCount
    // import (those enter the pipeline already proceeded — same rule the
    // operation grid uses).
    return operationStage || sourceSystem === "autocount" ? "proceed" : "place";
  }
  return null; // cancelled — off the board
}

export interface OrderEditScope {
  isDeliveredLane: boolean;
  /** place lane — everything editable (dates, checklist, Move to Proceed). */
  editablePlaced: boolean;
  /** proceed lane — customer / address / payment only. */
  editableProceed: boolean;
  /** editablePlaced || editableProceed. */
  canEditDetails: boolean;
  /** "Move to Order placed" — only the SALES Proceed marker is reversible:
   *  status proceed_order + operation_stage still 'confirmed' (ops hasn't
   *  started), and only while the proceed date is empty / today / future.
   *  Mirrors 2990s PR 589 (`canUnproceed = CONFIRMED && proceededAt &&
   *  !processingPassed`). */
  canUnproceed: boolean;
  /** 0231 (add-product P1) — direct "+ Add product" is a PLACE-lane-only
   *  affordance; the proceed lane goes through the P3 submission + operation
   *  approval instead. */
  canAddProduct: boolean;
}

/** Today in Malaysia (UTC+8) as an ISO yyyy-mm-dd — the un-proceed cutoff
 *  compares proceed dates in MY local time, not the browser's zone. */
export function todayMYISO(nowMs: number = Date.now()): string {
  return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function getOrderEditScope(
  o: {
    status: Order["status"];
    operationStage: Order["operationStage"];
    sourceSystem: Order["sourceSystem"];
    proceedDate: string | null;
  },
  todayMY: string,
): OrderEditScope {
  const lane = laneOf(o.status, o.operationStage, o.sourceSystem);
  const isDeliveredLane = lane === "delivered";
  const editablePlaced = lane === "place";
  const editableProceed = lane === "proceed";
  const proceedDatePassed = !!o.proceedDate && o.proceedDate.slice(0, 10) < todayMY;
  const canUnproceed =
    o.status === "proceed_order" &&
    o.operationStage === "confirmed" &&
    !proceedDatePassed;
  return {
    isDeliveredLane,
    editablePlaced,
    editableProceed,
    canEditDetails: editablePlaced || editableProceed,
    canUnproceed,
    canAddProduct: editablePlaced,
  };
}
