import {
  LayoutDashboard,
  ArrowLeftRight,
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
  PackageCheck,
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
  Library,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@carres/shared/domain";
import type { PurchasingPageGroupKey } from "./purchasing-sidebar";

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

export type PortalSection =
  | "Workspace"
  | "Sales"
  | "Purchasing"
  | "Delivery"
  | "Warehouse"
  | "Finance"
  | "Customer Care"
  | "Master Data"
  | "Admin";

/** Rail order of the sections. The queue index's own order, unchanged. */
export const SECTION_ORDER: ReadonlyArray<PortalSection> = [
  "Workspace",
  "Sales",
  "Purchasing",
  "Delivery",
  "Warehouse",
  "Finance",
  "Customer Care",
  "Master Data",
  "Admin",
];

/**
 * A MODULE — one expandable parent row carrying its pages (Jess, 2026-08-19).
 *
 * A section listed here draws a parent row: icon + name + chevron, its pages
 * hanging beneath it on rounded elbows. A section NOT listed here has no
 * parent row and its pages stay plain top-level rows — `Workspace`
 * (Dashboard · Work · Issue Tracker, ruled plain by the card) and `Finance`,
 * whose single `Payments` page would otherwise hide behind a chevron that
 * reveals one row of the same name. A control that opens nothing new is the
 * dead control `docs/03-page-patterns.md:149` bans.
 *
 * The icon is the module's ONE face — the same law the Purchasing `ShoppingBag`
 * already followed (Loo, 2026-08-02). Children carry no icon at all now, so
 * each module's flagship page lends its face to the module and no two rows in
 * the rail wear the same picture.
 */
export interface PortalModule {
  section: PortalSection;
  label: string;
  icon: LucideIcon;
}

export const PORTAL_MODULES: ReadonlyArray<PortalModule> = [
  { section: "Sales", label: "Sales", icon: ClipboardList },
  { section: "Purchasing", label: "Purchasing", icon: ShoppingBag },
  { section: "Delivery", label: "Delivery", icon: Route },
  { section: "Warehouse", label: "Warehouse", icon: Boxes },
  { section: "Customer Care", label: "Customer Care", icon: LifeBuoy },
  { section: "Master Data", label: "Master Data", icon: Library },
];

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
  /** The MODULE this page belongs to (`PORTAL_MODULES`).
   *
   *  ⭐ A MODULE IS AN EXPANDABLE PARENT ROW, NOT A HEADING (Jess, 2026-08-19
   *  afternoon — CARD-2026-08-19-sidebar-expandable-modules). She saw the
   *  shipped uppercase headings in production and re-ruled the same day: every
   *  module is an ICON + NAME + CHEVRON row that expands its pages beneath it,
   *  each child hanging off a rounded elbow. This supersedes the morning's
   *  "a module is a HEADING, never a parent row".
   *
   *  The field stays on the PAGE rather than nesting pages inside a parent
   *  object on purpose: `visibleItems` keeps meaning "the PAGES this role may
   *  open", which is what `JumpTo` composes its destinations from. Grouping is
   *  presentation (`navBlocks`), so no page is added, renamed or reordered by
   *  the module rows drawn on top of them. */
  section?: PortalSection;
  /** THE PURCHASING DRAWER this page hangs in (`purchasing-sidebar.ts`).
   *
   *  ⭐ FOUR NAMED GROUPS INSIDE ONE MODULE (Jess, 2026-08-22 —
   *  CARD-2026-08-22-purchasing-01-final-sidebar-listing). Purchasing holds
   *  eleven destinations, and a new hire cannot tell from a flat list which
   *  row holds a buying document, a receipt, a supplier problem or a showroom
   *  paper. Grouping is PRESENTATION, exactly like `section`: the page is not
   *  moved, renamed or re-addressed by the drawer drawn around it, and
   *  `visibleItems` still means "the PAGES this role may open", which is what
   *  `JumpTo` composes from.
   *
   *  EVERY Purchasing page hangs in a drawer — the module has no direct rows
   *  left. A page with no `pageGroup` would fall back to the module's own
   *  child indent; nothing uses that today, and no other module's rail
   *  behaviour moves. */
  pageGroup?: PurchasingPageGroupKey;

  /** APPROVED, NOT BUILT (sidebar card §2). Renders as a NON-CONTROL saying
   *  `Coming soon` on its own line — no href, out of the tab order. */
  soon?: true;
  /** a hairline above this entry — Report is a PORTAL page, not the
   *  module's own (`docs/ERP-ARCHITECTURE.md` §2.1). */
  dividerAbove?: true;
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
      /* ⭐ THE FINAL PURCHASING MAP — FOUR NAMED GROUPS, ELEVEN PAGES
       * (Jess, 2026-08-22 — CARD-2026-08-22-purchasing-01-final-sidebar-listing;
       * the approved tree is `docs/purchasing/MASTER.md` §4).
       *
       * The module accordion and its drawer grammar HOLD — only the contents
       * changed. The earlier eighteen-row rail carried a Blueprint the owner
       * rejected, and every row it lost was a destination the business does
       * not have:
       *
       *   `Purchasing Home`        registers and central reports already own
       *                            the useful summary
       *   `My Purchasing Work`     the shared My Work / Team Work engine owns
       *                            all action truth
       *   REQUESTS (the group)     a blocked buy opens an IN-CONTEXT governed
       *                            supplier/SKU request to Catalog and returns
       *                            to the same buy — it is not a destination
       *   `Purchase Demands`       `purchase_demand` is hidden canonical truth,
       *                            not a page an operator is sent to
       *   `Consignment Overview`   the Stock Register reports supplier-owned
       *   `Consignment Receipts`   Units, and `Goods Receipts` is the ONE
       *                            physical receipt engine
       *   `Report` + its hairline  reports are central / Register exports
       *
       * `Manual Purchase Requests` became `Manual Purchase` and moved into BUY:
       * the final operator door is one internal buying record, not a request.
       * CONSIGNMENT became SHOWROOM, because the drawer holds bought display
       * goods as well as supplier-owned ones.
       *
       * THE ORDER IN THIS ARRAY IS THE ORDER ON SCREEN. A group takes the
       * position of its FIRST member, so a drawer cannot reshuffle unless this
       * list reshuffles first. No address moved in this change.
       *
       * NO SETTINGS ROW (Jess, 2026-08-19): the header gear is the ONE
       * Settings entry. An unbuilt entry is a NON-CONTROL printing `Coming
       * soon`; it goes live in ITS OWN page's PR by exactly two edits — drop
       * `soon`, and the row becomes a link. */

      /* BUY — the committing documents. `SO Batch Purchase` answers to BOTH
       * its entrances: the `?tab=purchase` door the rail links to, and the
       * `/operation/to-order` path an in-page link still uses. Two entrances,
       * ONE active destination — the rail may never light twice. */
      {
        key: "purchase",
        label: "SO Batch Purchase",
        icon: ShoppingBag,
        activeFor: ["tab:purchase", "path:/operation/to-order"],
        section: "Purchasing",
        pageGroup: "purchasing-buy",
      },
      { key: "manual-purchase", label: "Manual Purchase", icon: ClipboardList, section: "Purchasing", pageGroup: "purchasing-buy" },
      {
        // `operation:procurement` counts POs in the Pickup-action bucket —
        // this is the page that bucket belongs to.
        key: "purchase-orders",
        label: "Purchase Orders",
        icon: FileText,
        path: "/operation/procurement",
        badge: "procurement",
        section: "Purchasing",
        pageGroup: "purchasing-buy",
      },

      /* RECEIVE — one page today, and it still earns its own drawer: the
       * receipt is its own step in the operator's day, and the drawer is where
       * the rest of receiving (returns to warehouse, put-away) will land. It
       * receives purchased AND consignment goods — there is no second receipt
       * engine (`docs/purchasing/MASTER.md` §4). */
      { key: "receiving", label: "Goods Receipts", icon: PackageCheck, section: "Purchasing", pageGroup: "purchasing-receive" },

      /* PROBLEMS — what you open when the goods are wrong. */
      { key: "claims", label: "Supplier Claims", icon: Scale, section: "Purchasing", pageGroup: "purchasing-problems" },
      { key: "purchase-returns", label: "Purchase Returns", icon: Undo2, soon: true, section: "Purchasing", pageGroup: "purchasing-problems" },
      { key: "repair-orders", label: "Repair Orders", icon: ArrowUpRight, soon: true, section: "Purchasing", pageGroup: "purchasing-problems" },

      /* SHOWROOM — the goods standing on a Carres floor. Some Carres bought
       * (Display Requests), some the supplier still owns (the consignment
       * papers); one drawer, because the operator's question is the same one:
       * what is on display, and whose is it. */
      { key: "display-requests", label: "Display Requests", icon: Store, soon: true, section: "Purchasing", pageGroup: "purchasing-showroom" },
      { key: "consignment-orders", label: "Consignment Orders", icon: ArrowDownLeft, soon: true, section: "Purchasing", pageGroup: "purchasing-showroom" },
      { key: "consignment-returns", label: "Consignment Returns", icon: Undo2, soon: true, section: "Purchasing", pageGroup: "purchasing-showroom" },
      { key: "consignment-sale-notices", label: "Consignment Sale Notices", icon: ScrollText, soon: true, section: "Purchasing", pageGroup: "purchasing-showroom" },

      // Delivery (T11, Jess 2026-07-27) — **the ONE new menu item in the whole
      // build plan**; every other line upgrades an existing door, and its place
      // in the rail is the one the queue index draws (Orders · Purchasing ·
      // Delivery · Stock · Payments). The module WRITES nothing: bookings,
      // reasons and photos stay behind the order drawer's server-side gates, so
      // this door shows the delivery work and hands over to the same drawer the
      // Orders list opens.
      /* THE DELIVERY MODULE'S PAGES — TWO, and both of them open
       * (CARD-2026-08-21-delivery-01-sidebar, owner ruling 2026-08-21). This
       * OVERWRITES the seven-row list of 2026-08-19: `Schedule`,
       * `Delivery History`, `Exceptions`, `Partners` and `Report` were five
       * rows an operator could read, count and want, and every one of them
       * refused the click. A door that is drawn and cannot be opened teaches
       * the rail is unreliable, and it taught that lesson five times in a
       * module that has exactly two working pages.
       *
       * The capabilities are NOT retired — `docs/delivery/MASTER.md` §7 still
       * holds Delivery History, Exceptions and Partners as approved targets,
       * and Report stays central. They are simply not NAVIGATION until they
       * are pages. A row returns here in the PR that makes it answer.
       *
       * `Delivery Work` IS the existing Delivery page — same key, same
       * `?tab=delivery` route; `Delivery Orders` keeps its own path. No
       * hairline and no Report row survive: nothing is left to divide from.
       * NO Settings row: the header gear is the one Settings entry
       * (Jess, 2026-08-19). */
      { key: "delivery", label: "Delivery Work", icon: Route, section: "Delivery" },
      {
        key: "delivery-orders",
        label: "Delivery Orders",
        icon: PackageCheck,
        path: "/operation/delivery-orders",
        section: "Delivery",
      },
      /* WAREHOUSE IS A HEADING, NOT A PARENT ROW (Warehouse Blueprint item 13,
       * owner-approved; applied 2026-08-19 under the Jess 2026-08-19 SALES
       * template — CARD-2026-08-19-warehouse-rail). K0's single merged `Stock`
       * row becomes the module's pages in the rail. The three built pages keep
       * their `?tab=` addresses; `Transfers` and `Counts` are blueprint pages
       * printing `Coming soon` until their own PRs. The blueprint keeps
       * Reports and Settings central: NO Report row, NO Settings row here.
       * The three live rows keep K0's learned order (Stock · Ready stock ·
       * In & out) — the rail never reshuffles under an operator; when Ready
       * stock folds into Stock Views (blueprint item 13.7) its row dies in
       * that card's own PR. Word law (COPY-STANDARD): "Inventory" and
       * "Movements" stay banned UI words; the goods pool is still `Stock` on
       * any page — `Warehouse` is the MODULE heading, not the pool word. */
      /* `Stock`, not `On hand` — CARD-2026-08-20-stock-register §1, and
       * Stock MASTER §2 rejects `On hand` and `Stock Units` as the master-list
       * name by name. `On hand` described a QUANTITY on a shelf; the page now
       * lists exact Units and answers which one, where, who has it and whether
       * it can be used. The `?tab=` address is unchanged, so no bookmark and no
       * learned rail position moves. */
      { key: "stock", label: "Stock", icon: Boxes, tab: "stock-onhand", section: "Warehouse" },
      { key: "stock-plan", label: "Ready stock", icon: ClipboardList, section: "Warehouse" },
      { key: "movements", label: "In & out", icon: ArrowLeftRight, section: "Warehouse" },
      { key: "transfers", label: "Transfers", icon: Truck, soon: true, section: "Warehouse" },
      { key: "counts", label: "Counts", icon: ScrollText, soon: true, section: "Warehouse" },
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
export function navItemHref(
  group: PortalNavGroup,
  item: PortalNavItem,
): string {
  if (group.area === "finance") {
    return (item as PortalNavItem).financePath ?? group.base;
  }
  if (item.path) return item.path; // path-driven section or page
  return `${group.base}?tab=${item.tab ?? item.key}`;
}

/** Default landing href for an area (its dashboard / overview). */
export function areaDefaultHref(group: PortalNavGroup): string {
  if (group.area === "finance") return "/finance/dashboard";
  return `${group.base}?tab=${group.defaultTab}`;
}

/** One row-group of the rail: an expandable module, or a lone plain page. */
export type NavBlock =
  | { kind: "plain"; item: PortalNavItem }
  | { kind: "module"; module: PortalModule; pages: PortalNavItem[] };

/**
 * The rail's shape: the pages a role may see, grouped into module blocks.
 *
 * Presentation only — it never adds, renames or reorders a page. Sections keep
 * `SECTION_ORDER`; pages keep their order inside a section; an area with no
 * sections at all (Finance · HR · Admin) comes out as plain rows in its
 * declared order, exactly as it renders today.
 *
 * A module needs at least TWO pages to earn its parent row. One page behind a
 * chevron is a control that reveals a row of the same name, and the operator
 * pays a click to learn nothing.
 */
export function navBlocks(
  group: PortalNavGroup,
  role: Role | null,
): NavBlock[] {
  const items = visibleItems(group, role);
  const bySection = new Map<PortalSection | "__none__", PortalNavItem[]>();
  for (const item of items) {
    const key = item.section ?? "__none__";
    const bucket = bySection.get(key);
    if (bucket) bucket.push(item);
    else bySection.set(key, [item]);
  }

  const sections = [...bySection.keys()].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a as PortalSection);
    const bi = SECTION_ORDER.indexOf(b as PortalSection);
    return (ai < 0 ? SECTION_ORDER.length : ai) - (bi < 0 ? SECTION_ORDER.length : bi);
  });

  const out: NavBlock[] = [];
  for (const section of sections) {
    const pages = bySection.get(section)!;
    const module = PORTAL_MODULES.find((m) => m.section === section);
    if (module && pages.length > 1) out.push({ kind: "module", module, pages });
    else for (const item of pages) out.push({ kind: "plain", item });
  }
  return out;
}
