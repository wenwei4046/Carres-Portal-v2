import type { PortalNavItem } from "./portal-nav";

/**
 * THE MENU TREE — one rule for every module (owner 12 Oct 2026; 01 §4 "Side
 * menu"). A module's pages hang on one tree line. A module may also name
 * groups for its pages (Purchasing: BUY · RECEIVE · PROBLEMS · SHOWROOM); a
 * group is a small caps word on the tree with its own chevron, never a
 * destination. It is all read from data: a page says which group it belongs to
 * with `pageGroup`, and the group words live in `PAGE_GROUPS`. Nothing here, and
 * nothing in the renderer, names a module.
 *
 * ⭐ THIS FILE OWNS GROUPING — NEVER ROUTES. `portal-nav.ts` stays the one
 * page/route source; every helper here consumes those same `PortalNavItem`
 * objects, so no page can be added, renamed or re-addressed by the groups
 * drawn on top of them.
 */

export type PageGroupKey =
  | "purchasing-buy"
  | "purchasing-receive"
  | "purchasing-problems"
  | "purchasing-showroom";

export interface PageGroup {
  key: PageGroupKey;
  /** The menu word. Uppercase because it is a LABEL rank, not a destination. */
  label: string;
}

/**
 * Purchasing's four groups, in the approved order — the order a purchase
 * travels: you BUY, the goods are RECEIVED, something goes WRONG, and SHOWROOM
 * is the floor-display book that never mixes with any of it
 * (`docs/purchasing/MASTER.md` §4).
 */
export const PURCHASING_PAGE_GROUPS: ReadonlyArray<PageGroup> = [
  { key: "purchasing-buy", label: "BUY" },
  { key: "purchasing-receive", label: "RECEIVE" },
  { key: "purchasing-problems", label: "PROBLEMS" },
  { key: "purchasing-showroom", label: "SHOWROOM" },
];

/** Every group any module may name. A new module adds its groups here and
 *  sets `pageGroup` on its pages; the menu needs no other change. */
export const PAGE_GROUPS: ReadonlyArray<PageGroup> = [...PURCHASING_PAGE_GROUPS];

/**
 * PURCHASING'S LANDING PAGE, NAMED RATHER THAN DERIVED: `SO Batch Purchase`,
 * the buyer's daily page. Taking "the first live row" made the landing a side
 * effect of row order. It is PERMANENT — there is no Purchasing Home to hand
 * it to (`docs/purchasing/MASTER.md` §4). The module record in `portal-nav.ts`
 * carries it as `landingKey`.
 */
export const PURCHASING_LANDING_KEY = "purchase";

/** One row-group inside an open module. */
export type ModuleChildBlock =
  | { kind: "page"; item: PortalNavItem }
  | { kind: "group"; group: PageGroup; pages: PortalNavItem[] };

/**
 * A module's pages, grouped.
 *
 * Presentation only. A page with no `pageGroup` stays a direct row on the
 * module's tree line. A group takes the position of its FIRST member, so the
 * groups cannot silently reshuffle: the nav array is still the order.
 */
export function moduleChildBlocks(pages: ReadonlyArray<PortalNavItem>): ModuleChildBlock[] {
  const out: ModuleChildBlock[] = [];
  const opened = new Map<PageGroupKey, Extract<ModuleChildBlock, { kind: "group" }>>();

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
    const group = PAGE_GROUPS.find((g) => g.key === key);
    // A page pointing at a group that does not exist is a bug, not a reason to
    // hide the page: it falls back to a direct row and stays reachable.
    if (!group) {
      out.push({ kind: "page", item });
      continue;
    }
    const block: Extract<ModuleChildBlock, { kind: "group" }> = { kind: "group", group, pages: [item] };
    opened.set(key, block);
    out.push(block);
  }
  return out;
}

/**
 * The group holding the page you are standing on. It is the one group open
 * when the module loads, and it cannot be shut while you are in it. Derived
 * from the live route every time; never stored, because where you are is not
 * a preference.
 */
export function activePageGroup(
  pages: ReadonlyArray<PortalNavItem>,
  activeKey: string | null,
): PageGroupKey | null {
  if (!activeKey) return null;
  return pages.find((item) => item.key === activeKey)?.pageGroup ?? null;
}

/**
 * WHICH GROUPS ARE OPEN (owner 12 Oct 2026): only the group holding the
 * current page; the others show their name and open with their own chevron.
 * A module that does not hold the current page shows every group open, so
 * opening it to look shows the whole map. A chevron worked by hand wins,
 * except that the group you are standing in never shuts.
 */
export function isPageGroupOpen(
  key: PageGroupKey,
  current: PageGroupKey | null,
  byHand: Readonly<Partial<Record<PageGroupKey, boolean>>>,
): boolean {
  if (key === current) return true;
  return byHand[key] ?? current === null;
}
