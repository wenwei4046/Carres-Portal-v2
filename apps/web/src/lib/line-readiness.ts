/**
 * lineReadiness — the ONE per-line stock-readiness rule (Jess 2026-07-13).
 *
 * Extracted from OrderDetailDrawer so the Items-ordered header badge and each
 * row's status pill read the SAME derivation and can never contradict. The
 * Orders LIST's coarser per-order bucket (stockReadiness in
 * OperationOrdersControl) follows the same semantics; folding it onto this
 * helper is a separate step — the list is deliberately untouched today.
 *
 * Rule (locked vocab, red/amber/green):
 *   1. Accessories (pillow / M.P / protector) are ALWAYS ready — Klang warehouse
 *      stock, no PO / receive step (Jess 2026-07-07).
 *   2. A per-line OVERRIDE (Master-sheet import or keyed in the Stock cell,
 *      ops_order_control.line_stock_status, migration 0199) wins over the
 *      derived value — AutoCount receipts live in the sheet, not the portal.
 *   3. Derived: free same-model+size units ≥ line qty → ready · a PO exists for
 *      the sku (portal PO or AutoCount order_lines.source_po) → waiting · else
 *      no PO.
 */
import { lineKind } from "@/lib/line-category";

export type LineReadiness = "ready" | "waiting" | "nopo";

export interface LineReadinessInput {
  sku: string;
  /** Line qty the free stock must cover. */
  qty: number;
  /** Free same-model+size units available (stockMatchKey-grouped count). */
  freeCount: number;
  /** A PO exists for this sku (portal purchase_orders OR AutoCount source_po). */
  hasPo: boolean;
  /** Per-line override from ops_order_control.line_stock_status (draft wins). */
  override?: LineReadiness;
}

export function lineReadiness({
  sku,
  qty,
  freeCount,
  hasPo,
  override,
}: LineReadinessInput): LineReadiness {
  if (lineKind(sku) === "acc") return "ready";
  if (override) return override;
  if (freeCount >= qty) return "ready";
  if (hasPo) return "waiting";
  return "nopo";
}
