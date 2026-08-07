import type { CatalogResponse } from "@carres/shared";
import type { DraftAddon, DraftLine } from "../new-order/draft";

/**
 * Cart math + line-merge helpers for the POS catalog flow. Pure functions so
 * they unit-test cleanly and the `DraftLine` / `DraftAddon` shapes stay
 * IDENTICAL to what the submit pipeline (`DealerNewOrder` → `create_order`)
 * expects — the POS only ever changes `qty`, never the line shape.
 */

/** Where a cart line can be re-opened for editing (the ✎ pencil, Loo
 *  2026-07-12). One helper so the CartDrawer's pencil visibility and the
 *  CatalogStep's routing never drift:
 *    - `sofa_build`  → SofaConfigurePage (the stored geometry back on canvas)
 *    - `bed_mattress` → PosConfigurePage (size / options / specials restored)
 *    - `rental` → RentalConfigurePage (size / term / quantity restored)
 *    - null → not editable in a configurator (accessory / service / preset
 *      lines — qty is already editable in the cart itself). */
export type LineEditTarget = "sofa_build" | "bed_mattress" | "rental";
export function lineEditTarget(
  line: DraftLine,
  catalog: CatalogResponse,
): LineEditTarget | null {
  // 0239 — a bundle component line is never re-configured individually: its
  // unitPrice is a share of the bundle price, and a configurator re-emit would
  // re-price it at catalog. Remove the bundle and re-add instead.
  if (lineBundleGroup(line) !== null) return null;
  const sku = catalog.skus.find((s) => s.sku === line.sku);
  const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
  if (!model) return null;
  const attrs = line.attrs as Record<string, unknown> | null;
  if (attrs?.sofa_build) return model.category === "sofa" ? "sofa_build" : null;
  // BEFORE the category test, because a rented mattress is still a mattress
  // MODEL and would otherwise open the OUTRIGHT-SALE configurator: RM0 (a
  // rental's money lives in `rental_plans`, never on the sku), plus a Remark
  // price adjustment and a PWP bar that mean nothing to a rental. The pencil
  // stays, the operator must be able to change size, term and quantity — it
  // just has to open the surface that knows what those words mean.
  if (attrs?.rental) return "rental";
  if (model.category === "mattress" || model.category === "bedframe") return "bed_mattress";
  return null;
}

/** 0239 — the per-add bundle group id a bundle component line carries
 *  (`attrs.bundle_group`), or null for a normal line. Bundle lines are
 *  removed / price-locked as a GROUP: a lone component kept at its split
 *  share would silently under-price the item. */
export function lineBundleGroup(line: DraftLine): string | null {
  const g = (line.attrs as Record<string, unknown> | null)?.bundle_group;
  return typeof g === "string" && g.length > 0 ? g : null;
}

/** 0239 — the bundle display name stamped on a component line, if any. */
export function lineBundleLabel(line: DraftLine): string | null {
  const l = (line.attrs as Record<string, unknown> | null)?.bundle_label;
  return typeof l === "string" && l.length > 0 ? l : null;
}

/** Stable JSON key for a line's attrs (sorted keys) so two adds of the same
 *  sku + same options collapse into one cart line. */
export function attrsKey(attrs: DraftLine["attrs"]): string {
  if (attrs == null) return "null";
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(attrs).sort()) sorted[k] = attrs[k];
  return JSON.stringify(sorted);
}

/** True when two lines are the same product + identical options (mergeable).
 *  A PWP/promo reward line (attrs.pwp) NEVER merges — the server enforces
 *  reward qty = 1 (pwp_reward_qty_not_one), so each claim stays its own line
 *  even when a code-less claim would otherwise be attrs-identical. */
export function sameLine(a: DraftLine, b: DraftLine): boolean {
  if (a.attrs?.pwp || b.attrs?.pwp) return false;
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
