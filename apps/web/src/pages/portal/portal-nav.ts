import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Boxes,
  ArrowLeftRight,
  Repeat,
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
  IdCard,
  Target,
  Users,
  Store,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  HandCoins,
  UserCheck,
  SlidersHorizontal,
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
 * Catalog split (Loo 2026-07-25) — TWO isolated doors, one per money surface:
 *   - Operations → "Operation Catalog" (`op-catalog`): the 0226 COSTING page
 *     (SKU Master / Modular / Fabric only; buying costs).
 *   - Admin → "Product & Maintenance" (`catalog`): the full 8-tab SELLING
 *     page (retail / POS prices, PWP, promos) — principal-only by area.
 * A principal hitting the old Operations door (`/operation?tab=catalog`) is
 * forwarded to the Admin door by OperationApp; operation stays on the costing
 * page there (stale-link fallback).
 */

export type PortalArea = "operation" | "finance" | "hr" | "principal";

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
   *  for these roles. */
  roles?: ReadonlyArray<Role>;
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
      // Rental base (0247-0249, Loo 2026-07-25) — rent-to-own agreements +
      // the deployed-unit asset registry. Dormant until the POS rental lane.
      { key: "rental", label: "Rental", icon: Repeat },
      // Catalog split (Loo 2026-07-25) — Operations carries ONLY the costing
      // door: the 0226 Operation Catalog (SKU Master / Modular / Fabric; the
      // money there is buying cost, isolated from POS selling). The selling
      // Product & Maintenance lives in the Admin area below.
      { key: "op-catalog", label: "Operation Catalog", icon: Calculator },
      { key: "suppliers", label: "Suppliers", icon: Truck },
      {
        key: "service-notes",
        label: "Service Cases",
        icon: LifeBuoy,
        badge: "service-notes",
      },
      // Guarantees (0261-0263, Loo 2026-07-26) — the claim desk. Sits right
      // under Service Cases because that is where a claim ends up: look the
      // guarantee up here, then swap the item and open the case.
      { key: "guarantees", label: "Guarantees", icon: ShieldCheck },
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
        // 0268 — the rent-to-own credit gate. Sits next to the money tabs
        // because approving one is a credit decision, not an ops step: it
        // writes the whole billing schedule and unlocks the card charge.
        key: "rental-approver",
        label: "Rental Approver",
        icon: UserCheck,
        financePath: "/finance/rental-approver",
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
    // 0244/0245 (Loo 2026-07-25) — HR area: commission calculation for Carres'
    // OWN sales executives (showroom-channel staff; dealers excluded by the
    // gated hr_commission_source RPC). No base payroll — commission only.
    area: "hr",
    label: "HR",
    base: "/hr",
    roles: ["hr", "principal"],
    // O1 (2026-07-26): HR lands on Overview — "what needs me today" — rather
    // than opening straight into the commission table.
    defaultTab: "overview",
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard },
      { key: "commission", label: "Commission", icon: HandCoins },
      { key: "attribution", label: "Attribution", icon: UserCheck },
      { key: "setup", label: "Commission Setup", icon: SlidersHorizontal },
      // Team hierarchy (Loo 2026-07-25) — the org registry + THE account door:
      // every new user except dealers is minted here.
      { key: "team", label: "Team", icon: Users },
      // HR-P4 (2026-07-26) — the employee master. Sits next to Team because
      // that is where a person is created; People is where their file lives.
      { key: "people", label: "People", icon: IdCard },
      // HR-P6 (0276, 2026-07-26) — targets + the scoreboard. Sits after People
      // because a target is set ON a person: you need the file to exist first.
      { key: "performance", label: "Performance", icon: Target },
      // HR-P7 (0278) — the Chairman's cost question. Last in the HR group: it is
      // the only screen carrying salary, and it reads the other tabs' figures.
      { key: "people-cost", label: "People cost", icon: Wallet },
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
      // Catalog split (Loo 2026-07-25) — the SELLING catalog (retail / POS
      // prices, PWP, promos; the full 8-tab Product & Maintenance page) is an
      // ADMIN door: only the principal touches selling prices (0226). Costing
      // stays in Operations as the Operation Catalog above.
      { key: "catalog", label: "Product & Maintenance", icon: BookOpen },
      // Rental split out of P&M (Loo 2026-07-26): the rent/buy offer config
      // had outgrown a tab strip that is otherwise pure catalog work. Settings
      // only — the agreements/units registry stays the Operations "Rental" page.
      { key: "rental-setting", label: "Rental", icon: Repeat },
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

/** Default landing href for an area (its dashboard / overview). */
export function areaDefaultHref(group: PortalNavGroup): string {
  if (group.area === "finance") return "/finance/dashboard";
  return `${group.base}?tab=${group.defaultTab}`;
}
