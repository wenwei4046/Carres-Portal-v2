import {
  LayoutDashboard,
  ClipboardList,
  ShoppingBag,
  Boxes,
  Repeat,
  Wallet,
  BookOpen,
  Calculator,
  Truck,
  Route,
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
  History,
  ListTodo,
  CircleAlert,
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
  /** ERP Shell V1 responsibility heading within a real portal area. */
  section?: "Workspace" | "Sales" | "Supply Chain" | "Finance" | "Customer Care" | "Master Data" | "Admin";
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
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Workspace" },
      {
        // SO-5 (Loo, 2026-08-09) — the page is Sales Orders and the door says so.
        // ⭐ PRODUCTION CUTOVER (owner, 2026-08-10) — this door is now the NEW
        // Sales Order register (`SalesOrdersRegister`), and it is the OFFICIAL
        // Sales Orders entry. The old control table moved out to its own
        // temporary door below.
        key: "orders",
        label: "Sales Orders",
        icon: ClipboardList,
        path: "/operation/orders",
        badge: "orders",
        section: "Sales",
      },
      // Work (SO V2 CARD 10, owner ruling 2026-08-11) — My Work / Team Work:
      // two filters over the ONE open work set the Card 9 engine composes.
      // Sits directly under the register on the Constitution's own mission —
      // *what to do today, with the number, the party and the date already
      // worked out*. The page writes nothing; a row opens the owning module's
      // workspace.
      { key: "work", label: "Work", icon: ListTodo, section: "Workspace" },
      { key: "issue-tracker", label: "Issue Tracker", icon: CircleAlert, path: "/operation/issues", section: "Workspace" },
      // ⭐ THE TEMPORARY DOOR (SALES-ORDER-CUTOVER, owner 2026-08-10).
      //
      // The old Orders control table is NOT deleted and NOT hidden — it keeps
      // its own separate route because it still carries the Delivery, Payment
      // and Purchasing work that has not been migrated yet, plus the AutoCount
      // import (today the ONLY import surface, which is what blocks the final
      // delete).
      //
      // The label says `(temporary)` on purpose: a legacy surface that looks
      // permanent BECOMES permanent. This item is deleted, not renamed, when
      // the last box on the cutover map is empty. Its icon is deliberately NOT
      // ClipboardList — two doors sharing one icon read as the same page.
      {
        key: "old-orders",
        label: "Old Orders (temporary)",
        icon: History,
        path: "/operation/old-orders",
        section: "Sales",
      },
      // Purchasing (2026-07-21) — the THREE procurement rails (To Order / the
      // Purchase Order register / Receiving) collapsed into ONE sidebar item.
      // Its click target is the default tab, To Order (`?tab=purchase`); the
      // shared PurchasingTabs bar at the top of each page switches between the
      // three. `activeFor` keeps the item lit across all three routes.
      // R2 (2026-07-27) added a FOURTH tab — Claims (what the supplier still
      // owes us). Still no new sidebar item: the receiving & claim queue's own
      // rule, and a claim is what a receiving produces.
      {
        key: "purchasing",
        label: "Purchasing",
        // ShoppingBag = the MODULE's one face (sidebar + header nameplate,
        // Loo 2026-08-02); ClipboardCheck stays the To Order TAB's icon —
        // the two used to share one icon and read as the same thing.
        icon: ShoppingBag,
        tab: "purchase",
        activeFor: [
          "tab:purchase",
          "tab:receiving",
          "tab:claims",
          "path:/operation/procurement",
        ],
        section: "Supply Chain",
      },
      // Delivery (T11, Jess 2026-07-27) — **the ONE new menu item in the whole
      // build plan**; every other line upgrades an existing door, and its place
      // in the rail is the one the queue index draws (Orders · Purchasing ·
      // Delivery · Stock · Payments). The module WRITES nothing: bookings,
      // reasons and photos stay behind the order drawer's server-side gates, so
      // this door shows the delivery work and hands over to the same drawer the
      // Orders list opens.
      { key: "delivery", label: "Delivery", icon: Route, section: "Supply Chain" },
      // Stock (K0, Jess 2026-07-27) — the two stock doors merged into ONE
      // entry, same shape as the Purchasing merge above: one warehouse, three
      // questions (On hand · Ready stock [joins at K2] · In & out). Click
      // target = On hand; the shared StockTabs bar at the top of each page
      // switches between them. Word law (COPY-STANDARD): the user-facing word
      // is "Stock" — "Inventory"/"Movements" are banned UI words; the old tab
      // keys stay live so existing links keep working.
      {
        key: "stock",
        label: "Stock",
        icon: Boxes,
        tab: "stock-onhand",
        activeFor: ["tab:stock-onhand", "tab:stock-plan", "tab:movements"],
        section: "Supply Chain",
      },
      { key: "payments", label: "Payments", icon: Wallet, section: "Finance" },
      // Rental base (0247-0249, Loo 2026-07-25) — rent-to-own agreements +
      // the deployed-unit asset registry. Dormant until the POS rental lane.
      { key: "rental", label: "Rental", icon: Repeat, section: "Customer Care" },
      // Catalog split (Loo 2026-07-25) — Operations carries ONLY the costing
      // door: the 0226 Operation Catalog (SKU Master / Modular / Fabric; the
      // money there is buying cost, isolated from POS selling). The selling
      // Product & Maintenance lives in the Admin area below.
      { key: "op-catalog", label: "Catalog", icon: Calculator, section: "Master Data" },
      { key: "suppliers", label: "Suppliers", icon: Truck, section: "Master Data" },
      {
        key: "service-notes",
        label: "Service Cases",
        icon: LifeBuoy,
        badge: "service-notes",
        section: "Customer Care",
      },
      // Guarantees (0261-0263, Loo 2026-07-26) — the claim desk. Sits right
      // under Service Cases because that is where a claim ends up: look the
      // guarantee up here, then swap the item and open the case.
      { key: "guarantees", label: "Guarantees", icon: ShieldCheck, section: "Customer Care" },
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
      // Commission is ONE entry (Loo 2026-07-27) — the month report and the
      // rates that compute it are one subject, so "Commission Setup" stopped
      // being a second rail item and became a sub-tab (`HrCommissionTabs`),
      // the same merge Stock (K0) and Purchasing made. `activeFor` keeps the
      // item lit on both `?tab=` values.
      {
        key: "commission",
        label: "Commission",
        icon: HandCoins,
        activeFor: ["tab:commission", "tab:setup"],
      },
      // Attribution retired (Loo 2026-07-27, "no more use for me") — the
      // unassigned-order worklist is empty on a healthy month, so it cost a
      // permanent rail item to say "nothing to do". It renders inside
      // Commission → Earnings now, only while an order is unassigned.
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
      { key: "orders", label: "Sales Orders", icon: ClipboardList, path: "/operation/orders" },
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
