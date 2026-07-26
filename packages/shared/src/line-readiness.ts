/**
 * lineReadiness — the ONE per-line stock-readiness rule (Jess Round 1A,
 * 2026-07-13). The Items-ordered header badge, every row's status pill, and the
 * warehouse footer all read THIS derivation, so they can never contradict.
 *
 * Vocabulary (locked):
 *   ready    = warehouse free stock EXISTS for the line
 *   reserved = allocated to THIS SO
 *   picked   = physically pulled
 * A line counts "ready" ONLY when reserved >= ordered — free stock on the shelf
 * is "to reserve", not ready (the SO-1153 parity bug: an override said "ready"
 * while nothing was reserved).
 *
 * States:
 *   reserved   — reserved-to-this-SO count covers the line qty (green "Reserved").
 *                Accessories (pillow / M.P / protector) are always here: they're
 *                Klang warehouse stock, no PO / reserve step (Jess 2026-07-07).
 *   to_reserve — free same-model+size stock exists (or the Master-sheet override
 *                says the goods arrived) but it hasn't been reserved to this SO
 *                yet (amber "To reserve" — the action is to reserve it).
 *   on_po      — nothing to reserve yet, but a PO exists (portal PO or AutoCount
 *                order_lines.source_po), or the override says "waiting" (grey).
 *   no_po      — nothing raised at all (grey — red is reserved for alerts).
 */
// MOVED to packages/shared (D1, 2026-07-26) together with line-category — the
// API's booking-confirm gate and the drawer badge must read ONE rule.
import { lineKind } from "./line-category";

export type LineReadiness = "reserved" | "to_reserve" | "on_po" | "no_po";

export interface LineReadinessInput {
  sku: string;
  /** Line qty the reservation must cover. */
  qty: number;
  /** Units already reserved / booked in to THIS SO (ops_order_control.line_received). */
  reservedCount: number;
  /** Free same-model+size units available (stockMatchKey-grouped count). */
  freeCount: number;
  /** A PO exists for this sku (portal purchase_orders OR AutoCount source_po). */
  hasPo: boolean;
  /** Per-line Master-sheet override (ops_order_control.line_stock_status):
   *  "ready" = the goods arrived (⇒ to_reserve until actually reserved);
   *  "waiting" = on PO; "nopo" = nothing raised. */
  override?: "ready" | "waiting" | "nopo";
}

export function lineReadiness({
  sku,
  qty,
  reservedCount,
  freeCount,
  hasPo,
  override,
}: LineReadinessInput): LineReadiness {
  if (lineKind(sku) === "acc") return "reserved";
  if (qty > 0 && reservedCount >= qty) return "reserved";
  if (freeCount > 0 || override === "ready") return "to_reserve";
  if (hasPo || override === "waiting") return "on_po";
  return "no_po";
}

/** Roll a set of goods lines up for the Items badge / header stat strip:
 *  "<ready> ready · <toReserve> to reserve" (readyLines = reserved lines only). */
export function readinessCounts(states: LineReadiness[]) {
  let ready = 0;
  let toReserve = 0;
  let onPo = 0;
  let noPo = 0;
  for (const s of states) {
    if (s === "reserved") ready += 1;
    else if (s === "to_reserve") toReserve += 1;
    else if (s === "on_po") onPo += 1;
    else noPo += 1;
  }
  return { ready, toReserve, onPo, noPo, total: states.length };
}
