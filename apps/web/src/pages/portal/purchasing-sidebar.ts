import type { PortalNavItem } from "./portal-nav";

/**
 * THE PURCHASING MAP — four named groups inside one module row
 * (CARD-2026-08-22-purchasing-01-final-sidebar-listing, owner-approved; the
 * tree is `docs/purchasing/MASTER.md` §4).
 *
 * The shipped module accordion (CARD-2026-08-19-sidebar-expandable-modules)
 * gave the rail its outer grammar: one expandable module row, its
 * pages hanging off rounded elbows. That grammar holds for five pages and
 * breaks at eleven — a new hire cannot tell from a flat list which row holds
 * a buying document, a receipt, a supplier problem or a showroom paper. So
 * the module's pages hang off four NAMED drawers, and the operator opens the
 * one their job lives in.
 *
 * ⭐ THIS FILE OWNS GROUPING AND PRESENTATION STATE — NEVER ROUTES.
 * `portal-nav.ts` stays the one page/route source; every helper here consumes
 * those same `PortalNavItem` objects, so no page can be added, renamed or
 * re-addressed by the drawers drawn on top of them. It lives beside
 * `PortalSidebar.tsx` rather than inside it because that file is already
 * ~700 lines of renderer, and pure logic that can be tested without a DOM
 * should not need one.
 */

export type PurchasingPageGroupKey =
  | "purchasing-buy"
  | "purchasing-receive"
  | "purchasing-problems"
  | "purchasing-showroom";

export interface PurchasingPageGroup {
  key: PurchasingPageGroupKey;
  /** The rail word. Uppercase because it is a LABEL rank, not a destination. */
  label: string;
}

/**
 * The four drawers, in the approved order — the order a purchase actually
 * travels: you BUY, the goods are RECEIVED, something goes WRONG, and
 * SHOWROOM is the floor-display book that never mixes with any of it.
 *
 * REQUESTS is gone: a blocked buy opens an in-context governed supplier/SKU
 * request to Catalog and comes straight back to the same buy, so there was
 * never a destination to name. CONSIGNMENT became SHOWROOM because the drawer
 * holds bought display goods as well as supplier-owned ones.
 */
export const PURCHASING_PAGE_GROUPS: ReadonlyArray<PurchasingPageGroup> = [
  { key: "purchasing-buy", label: "BUY" },
  { key: "purchasing-receive", label: "RECEIVE" },
  { key: "purchasing-problems", label: "PROBLEMS" },
  { key: "purchasing-showroom", label: "SHOWROOM" },
];

const GROUP_KEYS = new Set<string>(PURCHASING_PAGE_GROUPS.map((g) => g.key));

/**
 * THE MODULE'S LANDING PAGE, NAMED RATHER THAN DERIVED.
 *
 * The 60px icon rail has one Purchasing control and it must open a page the
 * operator expects. Taking "the first live row" made that page a side effect
 * of row order — grouping the rail once moved it from `SO Batch Purchase` to
 * a request page with nobody deciding it. So the destination is named here:
 * `SO Batch Purchase`, the buyer's daily page. It is PERMANENT — there is no
 * Purchasing Home to hand it to (`docs/purchasing/MASTER.md` §4).
 */
export const PURCHASING_LANDING_KEY = "purchase";

/** One row-group inside the open Purchasing module. */
export type PurchasingChildBlock =
  | { kind: "page"; item: PortalNavItem }
  | { kind: "group"; group: PurchasingPageGroup; pages: PortalNavItem[] };

/**
 * The module's children, grouped.
 *
 * Presentation only. Every Purchasing page hangs in a drawer today; a page
 * with no `pageGroup` would stay a direct row at the module's own child
 * indent, and that fallback is kept because losing a page is worse than
 * drawing it in the wrong place. A group takes the position of its FIRST
 * member, so the drawers cannot silently reshuffle: the nav array is still
 * the order.
 */
export function purchasingChildBlocks(
  pages: ReadonlyArray<PortalNavItem>,
): PurchasingChildBlock[] {
  const out: PurchasingChildBlock[] = [];
  const opened = new Map<PurchasingPageGroupKey, Extract<PurchasingChildBlock, { kind: "group" }>>();

  for (const item of pages) {
    const key = item.pageGroup;
    if (!key) {
      out.push({ kind: "page", item });
      continue;
    }
    const existing = opened.get(key);
    if (existing) {
      existing.pages.push(item);
      continue;
    }
    const group = PURCHASING_PAGE_GROUPS.find((g) => g.key === key);
    // A page pointing at a group that does not exist is a bug, not a reason to
    // hide the page: it falls back to a direct row and stays reachable.
    if (!group) {
      out.push({ kind: "page", item });
      continue;
    }
    const block: Extract<PurchasingChildBlock, { kind: "group" }> = {
      kind: "group",
      group,
      pages: [item],
    };
    opened.set(key, block);
    out.push(block);
  }
  return out;
}

/**
 * The drawer holding the page you are standing on — it opens itself, and it
 * cannot be shut while you are in it. Derived from the live route every time;
 * never stored, because where you are is not a preference.
 */
export function activePurchasingGroup(
  pages: ReadonlyArray<PortalNavItem>,
  activeKey: string | null,
): PurchasingPageGroupKey | null {
  if (!activeKey) return null;
  return pages.find((item) => item.key === activeKey)?.pageGroup ?? null;
}

/**
 * PRESENTATION STATE, AND NOTHING ELSE. Which drawers this operator likes
 * open. No route, no active key, no count, no business status — a rail
 * preference may never become a second source of business truth.
 */
export interface PurchasingSidebarStateV2 {
  moduleOpen: boolean;
  openGroups: ReadonlyArray<PurchasingPageGroupKey>;
}

export const EMPTY_PURCHASING_SIDEBAR_STATE: PurchasingSidebarStateV2 = {
  moduleOpen: false,
  openGroups: [],
};

/**
 * The storage key — VERSIONED and PER SIGNED-IN USER.
 *
 * Per user because two people share a machine in the office and one operator's
 * open drawers are not the other's. `session.user.id`, never the email: an
 * email is a business identifier that can change, and it would put a staff
 * address in local storage for no gain.
 *
 * ⭐ V2 SINCE 2026-08-22. The allowed group keys changed, so a stored V1
 * preference names two drawers that no longer exist. The old key is left where
 * it is rather than migrated or deleted: it is a rail preference, not business
 * truth, and the honest cost of getting it wrong is one operator re-opening
 * one drawer once.
 */
export function purchasingSidebarStorageKey(userId: string): string {
  return `carres:portal-sidebar:purchasing:v2:${userId}`;
}

/**
 * Read whatever is in storage without ever trusting it. A stale shape, a
 * half-written string or another version's JSON falls back to "nothing open" —
 * a rail preference may not be able to break navigation.
 */
export function parsePurchasingSidebarState(
  raw: string | null,
): PurchasingSidebarStateV2 {
  if (!raw) return EMPTY_PURCHASING_SIDEBAR_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PURCHASING_SIDEBAR_STATE;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_PURCHASING_SIDEBAR_STATE;
  }
  const record = parsed as Record<string, unknown>;
  const moduleOpen = record.moduleOpen === true;
  const raws = Array.isArray(record.openGroups) ? record.openGroups : [];
  const openGroups: PurchasingPageGroupKey[] = [];
  for (const value of raws) {
    // An unknown key is DROPPED, not carried: a group that no longer exists
    // must not travel forward as a name nothing can render.
    if (typeof value !== "string" || !GROUP_KEYS.has(value)) continue;
    const key = value as PurchasingPageGroupKey;
    if (!openGroups.includes(key)) openGroups.push(key);
  }
  if (!moduleOpen && openGroups.length === 0) return EMPTY_PURCHASING_SIDEBAR_STATE;
  return { moduleOpen, openGroups };
}

export function serializePurchasingSidebarState(
  state: PurchasingSidebarStateV2,
): string {
  // Written field by field on purpose — spreading the caller's object is how a
  // route or a count would one day end up in storage.
  return JSON.stringify({
    moduleOpen: state.moduleOpen,
    openGroups: [...state.openGroups],
  });
}
