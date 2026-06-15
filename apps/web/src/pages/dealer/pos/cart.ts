import type { DraftAddon, DraftLine } from "../new-order/draft";

/**
 * Cart math + line-merge helpers for the POS catalog flow. Pure functions so
 * they unit-test cleanly and the `DraftLine` / `DraftAddon` shapes stay
 * IDENTICAL to what the submit pipeline (`DealerNewOrder` → `create_order`)
 * expects — the POS only ever changes `qty`, never the line shape.
 */

/** Stable JSON key for a line's attrs (sorted keys) so two adds of the same
 *  sku + same options collapse into one cart line. */
export function attrsKey(attrs: DraftLine["attrs"]): string {
  if (attrs == null) return "null";
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(attrs).sort()) sorted[k] = attrs[k];
  return JSON.stringify(sorted);
}

/** True when two lines are the same product + identical options (mergeable). */
export function sameLine(a: DraftLine, b: DraftLine): boolean {
  return a.sku === b.sku && attrsKey(a.attrs) === attrsKey(b.attrs);
}

/**
 * Append `incoming` to the cart, merging into an existing line when the sku +
 * attrs match (POS-typical: repeat picks bump qty instead of stacking rows).
 * Only `qty` is mutated — the line shape is preserved so the submit payload is
 * unaffected.
 */
export function mergeLine(lines: DraftLine[], incoming: DraftLine): DraftLine[] {
  const idx = lines.findIndex((l) => sameLine(l, incoming));
  if (idx === -1) return [...lines, incoming];
  return lines.map((l, i) =>
    i === idx ? { ...l, qty: l.qty + incoming.qty } : l,
  );
}

/** Σ unitPrice × qty over product lines. */
export function cartLineSubtotal(lines: DraftLine[]): number {
  return lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

/** Σ unitPrice × qty over add-ons. */
export function cartAddonSubtotal(addons: DraftAddon[]): number {
  return addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
}

/** Lines + add-ons total, EXCLUDING stair carry (stair is set later in the
 *  CUSTOMER step and matches the deposit-pct base of lines + addons only). */
export function cartTotalExStair(lines: DraftLine[], addons: DraftAddon[]): number {
  return cartLineSubtotal(lines) + cartAddonSubtotal(addons);
}

/** Total product units in the cart (Σ line qty) — the headline cart count. */
export function cartItemCount(lines: DraftLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}
