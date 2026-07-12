import {
  LayoutDashboard,
  ClipboardList,
  ShoppingCart,
  PackageCheck,
  Boxes,
  ArrowLeftRight,
  Wallet,
  BookOpen,
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
  Network,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@carres/shared/domain";

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
  /** finance only: the absolute route to link to. */
  financePath?: string;
  /** nav unread counter (operation area only). */
  badge?: PortalBadge;
  /** principal Approvals carries the pending-count pill. */
  pendingPill?: boolean;
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
      {
        key: "procurement",
        label: "Purchase Order",
        icon: ShoppingCart,
        path: "/operation/procurement",
      },
      {
        key: "receiving",
        label: "Receiving",
        icon: PackageCheck,
        badge: "procurement",
      },
      { key: "stock-onhand", label: "Stock · On Hand", icon: Boxes },
      { key: "movements", label: "Stock · Movements", icon: ArrowLeftRight },
      { key: "payments", label: "Payments", icon: Wallet },
      { key: "catalog", label: "Product & Maintenance", icon: BookOpen },
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
      { key: "orders", label: "Orders", icon: ClipboardList },
      { key: "dealers", label: "Dealers", icon: Users },
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

/** The href a nav item points at. */
export function navItemHref(group: PortalNavGroup, item: PortalNavItem): string {
  if (group.area === "finance") return item.financePath ?? group.base;
  if (item.path) return item.path; // operation path-driven section
  return `${group.base}?tab=${item.key}`;
}

/** Default landing href for an area (its dashboard / overview). */
export function areaDefaultHref(group: PortalNavGroup): string {
  if (group.area === "finance") return "/finance/dashboard";
  return `${group.base}?tab=${group.defaultTab}`;
}
