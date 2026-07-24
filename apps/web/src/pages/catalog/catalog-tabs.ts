/**
 * Product & Maintenance tab registry — the ONE list behind BOTH switchers
 * (Loo 2026-07-24: the catalog tabs must show on the left rail too):
 *
 *   • the in-page pill bar (`ProductMaintenancePage` → `PillTabs`)
 *   • the PortalSidebar section links indented under "Product & Maintenance"
 *
 * The active tab is URL-driven via `?section=<key>` (riding alongside the
 * shell's `?tab=catalog`), so the rail can deep-link a tab and both switchers
 * highlight the same one. An unknown / missing value falls back to SKU Master
 * so stale links never break.
 *
 * Import-free on purpose: `portal-nav.ts` (the sidebar model) consumes this
 * module, so it must not pull component code back in.
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
