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
 *   unknown    — D9: nothing recognised this SKU, so this rule has no idea what
 *                stock would satisfy it. It is NOT "ready" (the bug this state
 *                exists to kill) and it is NOT "no_po" either — "nobody ordered
 *                it" is a claim about a thing we can name, and we cannot name
 *                this one. The action is to say what the line is, not to raise
 *                a PO for it.
 */
// MOVED to packages/shared (D1, 2026-07-26) together with line-category — the
// API's booking-confirm gate and the drawer badge must read ONE rule.
import { lineKind } from "./line-category";

export type LineReadiness =
  | "reserved"
  | "to_reserve"
  | "on_po"
  | "no_po"
  | "unknown";

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
  const kind = lineKind(sku);
  // "Always ready" is now EARNED by a recognised accessory (D9). Before, every
  // SKU nothing recognised took this exit — which is how a sofa module reported
  // 1/1 ready on zero units.
  if (kind === "acc") return "reserved";
  if (qty > 0 && reservedCount >= qty) return "reserved";
  if (freeCount > 0 || override === "ready") return "to_reserve";
  if (hasPo || override === "waiting") return "on_po";
  // D9 — `unknown` is checked LAST, so it yields to every piece of real
  // evidence and only ever replaces the bare guess. It raises nothing and
  // claims nothing; it is the honest answer where `no_po` would be a story.
  if (kind === "unknown") return "unknown";
  return "no_po";
}

/**
 * THE RULED WORDS FOR A LINE WHOSE UNITS ARE SHORT (COPY-STANDARD.md:1755).
 *
 * `Not allocated` sits in that row's `Do NOT use` column, beside `No stock` and
 * `Units not created yet`. The registered answer is TWO strings — the count,
 * then what is being waited on — because a short line is a fact plus an action,
 * which is the two-line standard the whole portal is written to.
 *
 * It lives here, once, because three surfaces need the same sentence: the Order
 * Route's STOCK node (`sales-order-route.ts`), the Sales Order object page's
 * Goods table, and the Sales Orders register expansion behind it. This
 * codebase's signature defect is one rule written in three places with the next
 * case added to none of them — so there is one place, and it is this one.
 */
export function unitsShortWords(ready: number, committed: number): [string, string] {
  return [`${ready} of ${committed} Units ready`, "Waiting for purchase"];
}

/** Roll a set of goods lines up for the Items badge / header stat strip:
 *  "<ready> ready · <toReserve> to reserve" (readyLines = reserved lines only).
 *  `unknown` is counted on its own — folding it into `noPo` would send an
 *  operator to raise a PO for a line nobody can name (D9). */
export function readinessCounts(states: LineReadiness[]) {
  let ready = 0;
  let toReserve = 0;
  let onPo = 0;
  let noPo = 0;
  let unknown = 0;
  for (const s of states) {
    if (s === "reserved") ready += 1;
    else if (s === "to_reserve") toReserve += 1;
    else if (s === "on_po") onPo += 1;
    else if (s === "unknown") unknown += 1;
    else noPo += 1;
  }
  return { ready, toReserve, onPo, noPo, unknown, total: states.length };
}
