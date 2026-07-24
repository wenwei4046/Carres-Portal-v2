/**
 * Product & Maintenance tab registry + the `?section=` URL contract.
 *
 * The page's active tab is URL-driven via `?section=<key>` riding alongside
 * the shell's `?tab=catalog` — deep links / refresh keep the tab, and the
 * pill bar writes the param back. An unknown / missing value falls back to
 * SKU Master so stale links never break. (The 2026-07-24 sidebar section
 * links were removed next day — Loo 2026-07-25: no sub-columns in the rail;
 * the registry + URL contract stay.)
 *
 * Import-free on purpose so non-page modules (e.g. OperationApp's stale-link
 * forward) can read the param name without pulling component code in.
 */

export type CatalogTabKey =
  | "sku"
  | "modular"
  | "special"
  | "fabrics"
  | "delivery"
  | "maintenance"
  | "combos"
  | "promo";

export interface CatalogTab {
  key: CatalogTabKey;
  label: string;
}

/** Query param carrying the active catalog tab (alongside `?tab=catalog`). */
export const CATALOG_TAB_PARAM = "section";

export const DEFAULT_CATALOG_TAB: CatalogTabKey = "sku";

export const CATALOG_TABS: readonly CatalogTab[] = [
  { key: "sku", label: "SKU Master" },
  { key: "modular", label: "Modular" },
  { key: "special", label: "Special Add-ons" },
  { key: "fabrics", label: "Fabrics" },
  { key: "delivery", label: "Delivery" },
  { key: "maintenance", label: "Maintenance" },
  { key: "combos", label: "Sofa Combos" },
  { key: "promo", label: "Promo / GWP" },
];

export function isCatalogTabKey(value: string | null): value is CatalogTabKey {
  return value != null && CATALOG_TABS.some((t) => t.key === value);
}
