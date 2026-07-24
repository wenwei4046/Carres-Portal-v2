import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Boxes,
  ArrowLeftRight,
  Wallet,
  BookOpen,
  Calculator,
  Truck,
  LifeBuoy,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Undo2,
  Scale,
  BarChart3,
  BadgeCheck,
  LayoutGrid,
  Users,
  Store,
  Network,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@carres/shared/domain";
import {
  CATALOG_TABS,
  CATALOG_TAB_PARAM,
  DEFAULT_CATALOG_TAB,
} from "@/pages/catalog/catalog-tabs";

/**
 * Unified Internal Portal nav model (2026-06-30, Loo).
 *
 * The Operation / Principal / Finance portals merged into ONE role-aware
 * portal. This module is the single source of truth for the merged sidebar:
 * three AREA groups (Operations / Finance / Admin), each a flat item list.
 * `PortalSidebar` renders the groups a given role may see; the per-area shells
 * (`OperationApp` / `FinanceApp` / `PrincipalApp`) still own the actual page
 * rendering. Navigation is URL-driven:
 *   - operation + principal (admin) items  → `<base>?tab=<key>`
 *   - the two URL-path operation sections   → `/operation/orders|procurement`
 *   - finance items                         → an absolute `/finance/...` path
 *
 * Roles that may see each area:
 *   - Operations → operation, principal
 *   - Finance    → finance, principal
 *   - Admin      → principal only
 *
 * Catalog (`Product & Maintenance`) is DEDUPED: it lived in BOTH the old
 * Operation and Principal sidebars (same component, `isPrincipal` flag). It now
 * appears ONCE, in the Operations area, reachable by operation + principal. The
 * page derives `isPrincipal` from the live role, so the principal still gets the
 * pricing-edit affordances there. The old standalone Principal "Catalog" nav
 * entry is dropped.
 */

export type PortalArea = "operation" | "finance" | "principal";

/** Operation badge keys surfaced as nav counters (reuses the 0083 unread set). */
export type PortalBadge = "orders" | "procurement" | "service-notes";

export interface PortalNavItem {
  /** routing key:
   *  - operation/principal → the `?tab=` value consumed by that shell
   *  - finance → unused (the absolute `path` is the truth) */
  key: string;
  label: string;
  icon: LucideIcon;
  /** operation only: a path-driven section reached by pathname, not `?tab=`. */
  path?: string;
  /** operation only: the `?tab=` value this item links to when it differs from
   *  `key`. The merged "Purchasing" item keys as `purchasing` but its click
   *  target is the To Order tab (`?tab=purchase`). Defaults to `key`. */
  tab?: string;
  /** operation only: extra locations that render this item ACTIVE, beyond its
   *  own href. Each entry is `tab:<key>` (a `?tab=` value) or `path:<prefix>`
   *  (a pathname prefix). The merged "Purchasing" item stays lit across its
   *  three routes: To Order (`?tab=purchase`), Purchase Orders
   *  (`/operation/procurement`) and Receiving (`?tab=receiving`). */
  activeFor?: ReadonlyArray<string>;
  /** finance only: the absolute route to link to. */
  financePath?: string;
  /** nav unread counter (operation area only). */
  badge?: PortalBadge;
  /** principal Approvals carries the pending-count pill. */
  pendingPill?: boolean;
  /** optional per-item narrowing of the group's roles — the item shows only
   *  for these roles (0226: Product & Maintenance is principal-only; operation
   *  gets the costing-focused Operation Catalog instead). */
  roles?: ReadonlyArray<Role>;
  /** tab-driven items only: the page's own tab bar mirrored into the rail as
   *  section links, rendered indented under the item while it is ACTIVE. Each
   *  links to `navItemHref(...)&<param>=<key>`; the page reads the same param.
   *  Product & Maintenance carries its 8 catalog tabs this way (Loo
   *  2026-07-24: "I want this tab show on the left bar tab as well"). */
  sub?: {
    param: string;
    defaultKey: string;
    items: ReadonlyArray<{ key: string; label: string }>;
  };
}

export interface PortalNavGroup {
  area: PortalArea;
  label: string;
  /** base path the area mounts at (used to derive active highlight + links). */
  base: string;
  /** roles permitted to see this whole area group. */
  roles: ReadonlyArray<Role>;
  /** the tab key the area lands on by default (operation/principal). */
  defaultTab: string;
  items: PortalNavItem[];
}

export const PORTAL_NAV: PortalNavGroup[] = [
  {
    area: "operation",
    label: "Operations",
    base: "/operation",
    roles: ["operation", "principal"],
    defaultTab: "dashboard",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        key: "orders",
        label: "Orders",
        icon: ClipboardList,
        path: "/operation/orders",
        badge: "orders",
      },
      // Purchasing (2026-07-21) — the THREE procurement rails (To Order / the
      // Purchase Order register / Receiving) collapsed into ONE sidebar item.
      // Its click target is the default tab, To Order (`?tab=purchase`); the
      // shared PurchasingTabs bar at the top of each page switches between the
      // three. `activeFor` keeps the item lit across all three routes.
      {
        key: "purchasing",
        label: "Purchasing",
        icon: ClipboardCheck,
        tab: "purchase",
        activeFor: ["tab:purchase", "tab:receiving", "path:/operation/procurement"],
      },
      { key: "stock-onhand", label: "Stock · On Hand", icon: Boxes },
      { key: "movements", label: "Stock · Movements", icon: ArrowLeftRight },
      { key: "payments", label: "Payments", icon: Wallet },
      // 0226 (Loo 2026-07-16) — Product & Maintenance is PRINCIPAL-ONLY: only
      // the principal touches selling prices. Operation records buying costs
      // in the Operation Catalog below instead.
      {
        key: "catalog",
        label: "Product & Maintenance",
        icon: BookOpen,
        roles: ["principal"],
        sub: {
          param: CATALOG_TAB_PARAM,
          defaultKey: DEFAULT_CATALOG_TAB,
          items: CATALOG_TABS,
        },
      },
      // 0226 — the operation-facing COSTING catalog (SKU Master / Modular /
      // Fabric; prices there are buying costs, isolated from POS selling).
      { key: "op-catalog", label: "Operation Catalog", icon: Calculator },
      { key: "suppliers", label: "Suppliers", icon: Truck },
      {
        key: "service-notes",
        label: "Service Cases",
        icon: LifeBuoy,
        badge: "service-notes",
      },
    ],
  },
  {
    area: "finance",
    label: "Finance",
    base: "/finance",
    roles: ["finance", "principal"],
    defaultTab: "dashboard",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        financePath: "/finance/dashboard",
      },
      {
        key: "ar",
        label: "AR · Receivables",
        icon: ArrowDownLeft,
        financePath: "/finance/ar",
      },
      {
        key: "ap",
        label: "AP · Payables",
        icon: ArrowUpRight,
        financePath: "/finance/ap",
      },
      {
        key: "payments",
        label: "Order Payments",
        icon: Wallet,
        financePath: "/finance/payments",
      },
      {
        key: "invoices",
        label: "Invoices",
        icon: FileText,
        financePath: "/finance/invoices",
      },
      {
        key: "refunds",
        label: "Refunds & Credits",
        icon: Undo2,
        financePath: "/finance/refunds",
      },
      {
        key: "recon",
        label: "Reconciliation",
        icon: Scale,
        financePath: "/finance/recon",
      },
      {
        key: "reports",
        label: "Reports",
        icon: BarChart3,
        financePath: "/finance/reports",
      },
    ],
  },
  {
    area: "principal",
    label: "Admin",
    base: "/principal",
    roles: ["principal"],
    defaultTab: "dashboard",
    items: [
      { key: "dashboard", label: "Overview", icon: LayoutDashboard },
      { key: "approvals", label: "Approvals", icon: BadgeCheck, pendingPill: true },
      // POS-parity (Loo 2026-07-03): the entry opens the POS *catalog* — named
      // like 2990s (the POS home IS the catalog), not "New order".
      { key: "pos", label: "Catalog", icon: LayoutGrid },
      // The principal trace-only Orders page is gone (Loo 2026-07-16) — Admin
      // "Orders" jumps straight to the Operations order control grid.
      { key: "orders", label: "Orders", icon: ClipboardList, path: "/operation/orders" },
      // Loo 2026-07-19 — two separate doors: "Dealers" = external resellers,
      // "Showrooms" = the stores Carres owns. Same page, filtered by
      // `dealers.channel`.
      { key: "dealers", label: "Dealers", icon: Users },
      { key: "showrooms", label: "Showrooms", icon: Store },
      { key: "partners", label: "Partners", icon: Network },
      { key: "audit", label: "Audit log", icon: ScrollText },
      { key: "accounts", label: "Accounts", icon: Settings },
    ],
  },
];

/** The area-groups a given role may see (preserves PORTAL_NAV order). */
export function visibleGroups(role: Role | null): PortalNavGroup[] {
  if (!role) return [];
  return PORTAL_NAV.filter((g) => g.roles.includes(role));
}

/** The items of a group a given role may see (per-item `roles` narrowing). */
export function visibleItems(
  group: PortalNavGroup,
  role: Role | null,
): PortalNavItem[] {
  return group.items.filter((it) => !it.roles || (role != null && it.roles.includes(role)));
}

/** The href a nav item points at. */
export function navItemHref(group: PortalNavGroup, item: PortalNavItem): string {
  if (group.area === "finance") return item.financePath ?? group.base;
  if (item.path) return item.path; // operation path-driven section
  return `${group.base}?tab=${item.tab ?? item.key}`;
}

/** The href of a section link under a tab-driven item (`item.sub`). */
export function navSubItemHref(
  group: PortalNavGroup,
  item: PortalNavItem,
  subKey: string,
): string {
  if (!item.sub) return navItemHref(group, item);
  return `${navItemHref(group, item)}&${item.sub.param}=${subKey}`;
}

/** Default landing href for an area (its dashboard / overview). */
export function areaDefaultHref(group: PortalNavGroup): string {
  if (group.area === "finance") return "/finance/dashboard";
  return `${group.base}?tab=${group.defaultTab}`;
}
