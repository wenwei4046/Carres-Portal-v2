import type { DraftLine } from "../new-order/draft";

/**
 * The rental cart law (Loo, 2026-07-26 — LOCKED).
 *
 *   "rent and outright 不能在同一张单"
 *
 * A cart is either ALL rental or ALL outright. This module is the single place
 * that decides which, so the rail locks, the add guard, the cart totals and the
 * submit branch can never disagree with each other.
 *
 * WHY the rule exists (it is not arbitrary): a bought mattress is RM1,999 ONCE;
 * a rented one is RM59 EVERY MONTH for 84 months. Put both on one order and
 * `orders.total` has no honest value, the 50%-deposit gate has nothing to take a
 * percentage of, the invoice cannot print a figure, and the rental half needs
 * finance credit approval (0268) while the bought half must ship immediately.
 * Splitting at the cart is the cheapest place to keep those two worlds apart.
 *
 * A rental line carries its plan in `attrs.rental`. The plan id is the only
 * thing that reaches the server at checkout — every ringgit is re-read from
 * `rental_plans` inside the signup RPC, so the numbers below are for DISPLAY
 * and are never trusted.
 */

export interface RentalLineAttrs {
  /** `rental_plans.id` — the (sku × term) row the customer picked. */
  planId: string;
  termMonths: number;
  /** Display only. The server re-reads the fee from the plan at signup. */
  monthlyFee: number;
  /** monthlyFee × termMonths, precomputed for the cart. Display only. */
  contractTotal: number;
  /** "Queen", "King" … — what the operator reads on the cart row. */
  variantLabel: string;
}

/** Build the `attrs` payload for a rental cart line. */
export function rentalAttrs(v: RentalLineAttrs): Record<string, unknown> {
  return {
    rental: {
      planId: v.planId,
      termMonths: v.termMonths,
      monthlyFee: v.monthlyFee,
      contractTotal: v.contractTotal,
      variantLabel: v.variantLabel,
    },
  };
}

/** Read a line's rental payload, or null when it is an ordinary sale line. */
export function rentalOf(line: { attrs?: Record<string, unknown> | null }): RentalLineAttrs | null {
  const raw = (line.attrs ?? {})["rental"];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<RentalLineAttrs>;
  if (typeof r.planId !== "string" || r.planId === "") return null;
  if (typeof r.termMonths !== "number" || !(r.termMonths > 0)) return null;
  return {
    planId: r.planId,
    termMonths: r.termMonths,
    monthlyFee: Number(r.monthlyFee ?? 0),
    contractTotal: Number(r.contractTotal ?? 0),
    variantLabel: typeof r.variantLabel === "string" ? r.variantLabel : "",
  };
}

export function isRentalLine(line: { attrs?: Record<string, unknown> | null }): boolean {
  return rentalOf(line) !== null;
}

export type CartMode = "empty" | "outright" | "rental";

/**
 * What kind of cart this is. `empty` accepts either kind; once the first line
 * lands the cart has committed and the other kind is refused.
 *
 * A cart that somehow holds both (only reachable by a restored draft written
 * before this rule existed) reports `rental`, which is the SAFE answer: it
 * routes the cart to the agreement path, where the server re-validates every
 * line, instead of letting a rental line ride into an order as if it were a
 * one-off sale.
 */
export function cartModeOf(lines: ReadonlyArray<DraftLine>): CartMode {
  if (lines.length === 0) return "empty";
  return lines.some(isRentalLine) ? "rental" : "outright";
}

/** Can a line of `kind` join this cart? */
export function cartAccepts(lines: ReadonlyArray<DraftLine>, kind: "rental" | "outright"): boolean {
  const mode = cartModeOf(lines);
  return mode === "empty" || mode === kind;
}

/** The one sentence a store operator is shown when the rule bites. */
export function mixRefusalMessage(kind: "rental" | "outright"): string {
  return kind === "rental"
    ? "This cart is a normal sale. A rental needs its own order — finish or clear this one first."
    : "This cart is a rental. Items bought outright need their own order — finish or clear this one first.";
}

/** Monthly total of a rental cart (each line is one agreement, qty always 1). */
export function rentalMonthlyTotal(lines: ReadonlyArray<DraftLine>): number {
  return lines.reduce((sum, l) => sum + (rentalOf(l)?.monthlyFee ?? 0), 0);
}

/** What the customer pays across the whole term, summed over every agreement. */
export function rentalContractTotal(lines: ReadonlyArray<DraftLine>): number {
  return lines.reduce((sum, l) => sum + (rentalOf(l)?.contractTotal ?? 0), 0);
}
