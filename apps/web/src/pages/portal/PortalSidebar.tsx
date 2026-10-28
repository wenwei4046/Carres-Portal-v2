import { Fragment, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import MIcon from "@/components/carres/MIcon";
import ReportProblemModal from "@/pages/operation/components/ReportProblemModal";
import { useAuth } from "@/lib/auth";
import { useNavCapabilities } from "./nav-capabilities";
import NavBadge from "@/components/NavBadge";
import {
  useOperationBadges,
  useMarkOperationBadgeSeen,
  usePrincipalDashboard,
} from "@/lib/queries";
import {
  visibleGroups,
  navBlocks,
  menuGroups,
  navItemHref,
  areaDefaultHref,
  type NavBlock,
  type PortalArea,
  type PortalNavGroup,
  type PortalNavItem,
  type PortalSection,
} from "./portal-nav";
import {
  moduleChildBlocks,
  activePageGroup,
  isPageGroupOpen,
  type ModuleChildBlock,
  type PageGroupKey,
} from "./menu-tree";

/* The named menu is 220px and remembers the person's choice. MASTER's
   common detail/Tasks canvas fit can temporarily use its existing 64px mode
   without overwriting that saved choice. */
const COLLAPSE_KEY = "carres-menu-collapsed";

/** The module / plain-row icon (01 §4 "Side menu": 18). */
const MODULE_ICON = 18;

/**
 * Unified Internal Portal sidebar (2026-06-30, Loo).
 *
 * ONE role-aware rail replacing the three private sidebars (Operation /
 * Principal / Finance). It renders an accordion of the AREA groups the live
 * role may see (`portal-nav.ts`):
 *   - operation staff → Operations only
 *   - finance staff   → Finance only
 *   - principal       → Operations + Finance + Admin (the de-facto super-admin)
 *
 * Fully URL-driven + self-contained: it reads the active area/tab from the URL
 * and links to `<base>?tab=<key>` (operation/principal) or `/finance/...`
 * (finance). The per-area shells read their `?tab=` to mount the right page, so
 * the sidebar needs no `onChange` contract and stays decoupled from each shell.
 *
 * ⭐ A MODULE IS AN EXPANDABLE PARENT ROW (Jess, 2026-08-19 afternoon —
 * CARD-2026-08-19-sidebar-expandable-modules, approved against her two
 * reference screenshots). Every module draws an ICON + NAME + CHEVRON row and
 * its pages hang beneath it, each on its own rounded elbow. This SUPERSEDES
 * the same morning's uppercase-heading rail: she saw the headings in
 * production and re-ruled. One module is open at a time — eleven purchasing
 * pages and a Warehouse module cannot stack — and the module you are standing
 * in is the open one when the rail loads.
 *
 * Collapse (ported from main's 2026-06-29 operation sidebar, now portal-wide):
 * a hide button shrinks the rail to a 60px icon rail (more table room). The
 * state is self-owned here + persisted to localStorage (same `ops-sidebar-
 * collapsed` key), and the rail owns its intrinsic width — the shells' grid
 * column is `auto`, so every area collapses consistently. Collapsed, the
 * children disappear and the module's ONE icon remains (`ui/MASTER.md` §4.2):
 * an icon rail is for table room, not for navigating thirteen pages by
 * guessing thirteen icons.
 *
 * Visual (owner 12 Oct 2026; 01 §4 "Side menu"): one rule for every module,
 * drawn from data. Section label 11/600 caps · module 13/500 ink with an 18
 * icon · page 13/400 · the current page, and the module holding it, 600 in
 * the theme's selection colour on the selected pill. A module's pages hang on
 * one tree line with a rounded elbow to each page; the line stops at the last
 * page of each group and the current page's elbow takes the theme colour. A
 * long name wraps to a second line and is never cut. Never flame: red in
 * Carres means late / act now, so an "I am on this page" marker may not spend
 * it. Badge counts (orders / procurement / service-notes) + the Approvals
 * pending pill are fetched here, each gated by role so an operation user
 * never calls the principal dashboard API (and vice-versa).
 */
export default function PortalSidebar({ drawer = false, compactForCanvas = false, onExpandForCanvas }: {
  /** Below 768px the rail is a slide-in drawer (owner review 2026-09-25):
   *  always the named rail, no collapse toggle of its own. */
  drawer?: boolean;
  /** Current Operations shell:64px at every width; full tree in its overlay. */
  compactForCanvas?: boolean;
  /** Uses the existing Tasks draft guard before making room for the menu. */
  onExpandForCanvas?: (expand: () => void) => void;
} = {}) {
  const role = useAuth((s) => s.role);
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  /* The person's name where the account carries one (item 10); the address
     stands in only while it does not. */
  const displayName = (session?.user?.user_metadata as { name?: string; full_name?: string } | undefined)?.name
    ?? (session?.user?.user_metadata as { full_name?: string } | undefined)?.full_name
    ?? email;
  const initials = displayName.slice(0, 2).toUpperCase();

  const location = useLocation();
  const navigate = useNavigate();

  const groups = useMemo(() => visibleGroups(role), [role]);
  // Chew 2026-10-03 (Finance MASTER §3.3): the one entry shown by a grant, not
  // a role — Payment Requests, for the staff Finance or the boss allows.
  const caps = useNavCapabilities(role, (session?.user as { id?: string } | undefined)?.id);

  // Active area = which base path we're under. Active tab = `?tab=` (or the
  // path-driven operation section, or the finance pathname).
  const activeArea: PortalArea | null = useMemo(() => {
    const g = groups.find((grp) => location.pathname.startsWith(grp.base));
    return g?.area ?? groups[0]?.area ?? null;
  }, [groups, location.pathname]);

  const searchTab = new URLSearchParams(location.search).get("tab");

  // Collapse — self-owned, persisted; open unless the person closed it.
  const [storedCollapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  // 01 §4: a Sales Order detail below 1100 uses the 64px rail. This
  // temporary layout must not overwrite the person's list preference.
  const [narrowDetail, setNarrowDetail] = useState(() => window.innerWidth < 1100);
  useEffect(() => {
    const measure = () => setNarrowDetail(window.innerWidth < 1100);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const isSalesOrderDetail = /^\/operation\/orders\/so\/(?!new(?:\/|$))[^/]+/.test(location.pathname);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [reporting, setReporting] = useState(false);
  useEffect(() => setDetailExpanded(false), [location.pathname, narrowDetail]);
  const autoDetail = isSalesOrderDetail && narrowDetail;
  const autoCanvas = compactForCanvas;
  /* A drawer is always the named rail. */
  const collapsed = drawer ? false : autoCanvas ? true : autoDetail ? !detailExpanded : storedCollapsed;
  const toggleCollapse = () => {
    if (autoCanvas && !onExpandForCanvas) return;
    if (autoCanvas && onExpandForCanvas) {
      onExpandForCanvas(() => {
        setCollapsed(false);
        try { localStorage.setItem(COLLAPSE_KEY, "0"); } catch { /* blocked storage */ }
      });
      return;
    }
    if (autoDetail) {
      setDetailExpanded((expanded) => !expanded);
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Badge counts — operation area only. `enabled` keeps a finance-only user
  // from hitting /api/operation/badges (it would 403).
  const opVisible = groups.some((g) => g.area === "operation");
  const principalVisible = groups.some((g) => g.area === "principal");
  const badgesQ = useOperationBadges({ enabled: opVisible });
  const lpRejected = badgesQ.data?.lpRejected ?? 0;
  const badgeCount: Record<string, number> = {
    orders: (badgesQ.data?.orders ?? 0) + lpRejected,
    procurement: badgesQ.data?.procurement ?? 0,
    "service-notes": badgesQ.data?.serviceNotes ?? 0,
  };
  const markSeen = useMarkOperationBadgeSeen();

  const principalDashQ = usePrincipalDashboard({ enabled: principalVisible });
  const pendingCount = principalDashQ.data?.kpis?.pending_approvals ?? 0;

  // NO SETTINGS ROW ON ANY RAIL (Jess, 2026-08-19): the header gear is the one
  // Settings entry, so the rail no longer asks the manager-gate RPC at all.

  // THE RAIL SCROLLS, AND THAT IS THE COST OF THE WHOLE MAP (Jess,
  // 2026-08-18). Landing on a rail whose highlighted row is OFF SCREEN is a
  // real defect, so the active row is brought into view once on mount.
  // `block: "nearest"` on purpose: visible, not centred, not animated.
  const activeRowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
    // Mount only: re-running on every navigation would yank the rail while the
    // operator is reading further down it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manually-opened AREA groups (in addition to the active area).
  const [opened, setOpened] = useState<Set<PortalArea>>(new Set());
  // THE AREA YOU ARE IN FOLDS (Chew, 2026-10-03; Finance MASTER §4). Its
  // title folds it and opens it again. The fold names its area, so another
  // area you jump to always opens; each area has its own rail, so coming back
  // or reloading opens it too.
  const [foldedArea, setFoldedArea] = useState<PortalArea | null>(null);
  const isOpen = (area: PortalArea) =>
    area === activeArea ? foldedArea !== area : opened.has(area);

  function toggleGroup(group: PortalNavGroup) {
    if (group.area === activeArea) {
      setFoldedArea((prev) => (prev === group.area ? null : group.area));
      return;
    }
    // First click on a non-active area: jump into it (its dashboard).
    setFoldedArea(null);
    navigate(areaDefaultHref(group));
    setOpened((prev) => new Set(prev).add(group.area));
  }

  function fireMarkSeen(badge?: PortalNavItem["badge"]) {
    if (!badge) return;
    if (badge === "orders") {
      if ((badgeCount.orders ?? 0) > 0) markSeen.mutate("orders");
      if (lpRejected > 0) markSeen.mutate("lp_rejected");
    } else if (badge === "procurement") {
      if ((badgeCount.procurement ?? 0) > 0) markSeen.mutate("procurement");
    }
    // service-notes has no mark-seen endpoint (read-only counter).
  }

  // Are we on a path-driven section of this group? True for an item's own
  // `path` (orders) OR an item's `activeFor` path matcher. Used to suppress the
  // tab-key match for every OTHER item while a path section is showing.
  function onPathSection(group: PortalNavGroup): boolean {
    // Settings is a routed destination even though it has no permanent menu row.
    if (group.area === "operation" && location.pathname.startsWith("/operation/settings")) return true;
    return group.items.some((it) => {
      if (it.path && location.pathname.startsWith(it.path)) return true;
      return (
        it.activeFor?.some(
          (m) => m.startsWith("path:") && location.pathname.startsWith(m.slice(5)),
        ) ?? false
      );
    });
  }

  function isItemActive(group: PortalNavGroup, item: PortalNavItem): boolean {
    if (group.area !== activeArea) return false;
    // An unbuilt page is not a page yet; it cannot be the one you are on.
    if (item.soon) return false;
    if (group.area === "finance") {
      return location.pathname === item.financePath;
    }

    // Merged items light up across several routes via `activeFor`:
    // `path:<prefix>` matches the pathname; `tab:<key>` matches the `?tab=`
    // value (but not while a path section is showing).
    if (item.activeFor) {
      const onPath = onPathSection(group);
      const current = searchTab ?? group.defaultTab;
      return item.activeFor.some((m) => {
        if (m.startsWith("path:")) return location.pathname.startsWith(m.slice(5));
        if (m.startsWith("tab:")) return !onPath && current === m.slice(4);
        return false;
      });
    }

    if (item.path) {
      // operation path-driven section (orders / procurement)
      return location.pathname.startsWith(item.path);
    }
    // tab-driven: a path-driven section is active → no tab item is.
    if (onPathSection(group)) return false;
    const current = searchTab ?? group.defaultTab;
    // Match the value the row LINKS to (`navItemHref`), not its key. `On hand`
    // keys as `stock` and links to `?tab=stock-onhand`, so comparing the key
    // left it permanently unlit — a defect since the Warehouse rail shipped,
    // invisible while headings meant nothing had to be found. The accordion
    // reads this to decide which module opens, so it surfaced here.
    return current === (item.tab ?? item.key);
  }

  const homeHref = groups[0] ? areaDefaultHref(groups[0]) : "/";
  const activeGroup = groups.find((g) => g.area === activeArea) ?? groups[0];

  /* ── THE ACCORDION ──────────────────────────────────────────────────────
   * ONE module open at a time, and THE PAGE DECIDES which one. The open module
   * is derived from where you are standing, so a direct URL load — or a jump
   * from ⌘K, or any link inside a page — always lands with the current page's
   * module open and its row on screen.
   *
   * The override exists for the one thing the page cannot say: a chevron the
   * operator worked HERE, on THIS page — expanding a module without leaving,
   * or shutting the one they are standing in. It is stamped with the location
   * it was made at, so it expires the moment the operator navigates. Without
   * that stamp, opening Purchasing and then jumping to a Warehouse page would
   * leave Purchasing open and hide the row you had just moved to. */
  const activeModuleSection: PortalSection | null = activeGroup
    ? (navBlocks(activeGroup, role, caps).find(
        (b) => b.kind === "module" && b.pages.some((p) => isItemActive(activeGroup, p)),
      ) as Extract<NavBlock, { kind: "module" }> | undefined)?.module.section ?? null
    : null;

  const here = `${location.pathname}${location.search}`;
  const [override, setOverride] = useState<
    { at: string; section: PortalSection | "" } | null
  >(null);

  /* THE ONE OPEN MODULE — the same rule for every module. The page decides;
   * a chevron worked here, on this page, wins until the operator navigates. */
  const openSection: PortalSection | null =
    override?.at === here ? override.section || null : activeModuleSection;

  /* ── GROUPS INSIDE A MODULE (owner 12 Oct 2026) ─────────────────────────
   * Only the group holding the current page is open; the others show their
   * name and open with their own chevron. A chevron worked by hand is kept
   * for this page only, exactly like the module override above: where you
   * are standing is read from the URL on every render, and a menu preference
   * may never become a second source of it. Nothing is stored. */
  const [groupsByHand, setGroupsByHand] = useState<
    { at: string; open: Partial<Record<PageGroupKey, boolean>> } | null
  >(null);
  const handOpen = groupsByHand?.at === here ? groupsByHand.open : {};

  /** The group holding the page you are on, inside this module. */
  function currentGroupOf(group: PortalNavGroup, pages: ReadonlyArray<PortalNavItem>): PageGroupKey | null {
    const key = pages.find((page) => isItemActive(group, page))?.key ?? null;
    return activePageGroup(pages, key);
  }

  /** A group opens and shuts on its own. The group you are STANDING in cannot
   *  be shut: that would hide the page you are on. */
  function togglePageGroup(key: PageGroupKey, current: PageGroupKey | null) {
    if (key === current) return;
    const open = isPageGroupOpen(key, current, handOpen);
    setGroupsByHand({ at: here, open: { ...handOpen, [key]: !open } });
  }

  function toggleModule(group: PortalNavGroup, block: Extract<NavBlock, { kind: "module" }>) {
    if (openSection === block.module.section) {
      setOverride({ at: here, section: "" }); // shut, on purpose, right here
      return;
    }
    // Opening one module shuts the others: there is one open module.
    setOverride({ at: here, section: block.module.section });
    /* A module whose row only opens its pages stays where you are (the data
     * says which: `handleOnly`). Every other module also GOES to its first
     * live page, because clicking it is how you get there. An all-unbuilt
     * module has nothing to open, so it only expands. */
    if (block.module.handleOnly) return;
    const first = block.pages.find((p) => !p.soon);
    if (first) {
      fireMarkSeen(first.badge);
      navigate(navItemHref(group, first));
    }
  }

  /**
   * WHERE A CLOSED MENU'S MODULE ICON GOES: the page the module NAMES
   * (`landingKey`), never "the first live row" (owner review, 2026-08-20) —
   * deriving it from row order moves the landing the day a page above it goes
   * live. A module that names none lands on its first live page.
   */
  function moduleLandingPage(
    block: Extract<NavBlock, { kind: "module" }>,
  ): PortalNavItem | undefined {
    const named = block.module.landingKey
      ? block.pages.find((p) => p.key === block.module.landingKey && !p.soon)
      : undefined;
    return named ?? block.pages.find((p) => !p.soon);
  }

  /** Work waiting inside a module, for the row that has hidden its children. */
  function moduleBadgeSum(block: Extract<NavBlock, { kind: "module" }>): number {
    return block.pages.reduce(
      (sum, p) => sum + (p.badge ? badgeCount[p.badge] ?? 0 : 0),
      0,
    );
  }

  /* ── THE DRAWING — 01 §4 "Side menu" (owner 12 Oct 2026). Width 220 open /
   * 64 closed. Row: pad 8 10 · gap 10 · radius 8 · 13/17. A module or plain
   * row is 500 ink with an 18 icon; a page is 400. The current page and the
   * module holding it are 600 in the theme's selection colour on the selected
   * pill. Pages hang 18 in on the tree line, their text 46 from the menu edge;
   * a group word sits on that same 46. */
  const ROW =
    "relative flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-[17px]";
  const ROW_REST = "font-medium text-c-ink hover:bg-c-hover";
  const ROW_ON = "bg-c-select-pill font-semibold text-c-select-fg [box-shadow:var(--shadow-lift)]";
  const PAGE =
    "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] leading-[17px]";
  const PAGE_REST = "font-normal text-c-body hover:bg-c-hover";
  const PAGE_ON = "bg-c-select-pill font-semibold text-c-select-fg";
  const SECTION_LABEL = "text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-c-secondary";
  const GROUP_LABEL = "text-[11px] font-medium uppercase leading-[14px] tracking-[0.06em] text-c-secondary";
  /** A long name wraps to a second line; it is never cut. */
  const WRAP = "min-w-0 flex-1 break-words [text-wrap:pretty]";

  /** The row icon: the Material Symbol when the menu row has one, else the
   *  area's own icon (Finance · People · Admin rows). */
  const rowIcon = (mIcon: string | undefined, Lucide: PortalNavItem["icon"], on: boolean) =>
    mIcon ? (
      <MIcon name={mIcon} size={MODULE_ICON} className={on ? undefined : "text-c-tab"} />
    ) : (
      <Lucide size={MODULE_ICON} strokeWidth={1.5} aria-hidden className={`shrink-0 ${on ? "" : "text-c-tab"}`} />
    );

  /**
   * ONE PAGE under its module, on the tree line: the trunk beside it and a
   * rounded elbow reaching it. `last` ends the trunk at this page's elbow, so
   * the line stops at the last page of each group.
   *
   * A `soon` page is deliberately NOT A LINK (03: a control that opens
   * nothing is banned): a span out of the tab order, `aria-disabled`, saying
   * `Coming soon` under its name. It carries no count.
   */
  function renderChild(group: PortalNavGroup, child: PortalNavItem, last: boolean) {
    const active = !child.soon && isItemActive(group, child);
    const line = active ? "border-c-select-fg" : "border-c-tree-line";
    return (
      <div key={child.key} data-tree-row={last ? "last" : ""} className="relative flex py-px pl-[18px]">
        <span
          aria-hidden
          data-tree="trunk"
          className="absolute left-0 top-0 border-l-[1.5px] border-c-tree-line"
          style={{ height: last ? "calc(50% - 8px)" : "100%" }}
        />
        <span
          aria-hidden
          data-tree="elbow"
          className={`absolute left-0 top-[calc(50%-9px)] h-[9px] w-3 rounded-bl-[7px] border-b-[1.5px] border-l-[1.5px] ${line}`}
        />
        {child.soon ? (
          <span
            data-testid={`nav-child-${child.key}`}
            data-soon="1"
            aria-disabled="true"
            tabIndex={-1}
            className={`${PAGE} cursor-default select-none font-normal text-c-body`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="break-words [text-wrap:pretty]">{child.label}</span>
              <span className="text-[11px] font-medium leading-[14px] text-c-secondary">Coming soon</span>
            </span>
          </span>
        ) : (
          <Link
            to={navItemHref(group, child)}
            onClick={() => fireMarkSeen(child.badge)}
            data-testid={`nav-child-${child.key}`}
            aria-current={active ? "page" : undefined}
            ref={active ? (activeRowRef as Ref<HTMLAnchorElement>) : undefined}
            className={`${PAGE} ${active ? PAGE_ON : PAGE_REST}`}
          >
            <span className={WRAP}>{child.label}</span>
            {child.badge && <NavBadge count={badgeCount[child.badge] ?? 0} label={child.label} />}
          </Link>
        )}
      </div>
    );
  }

  /**
   * A GROUP of a module's pages (Purchasing: Buy · Receive · Problems ·
   * Showroom): a small caps word aligned with the page text, with its own
   * chevron, never a destination. The one holding the current page is open
   * and says so with `aria-disabled`.
   */
  function renderPageGroup(
    group: PortalNavGroup,
    block: Extract<ModuleChildBlock, { kind: "group" }>,
    current: PageGroupKey | null,
    first: boolean,
  ) {
    const open = isPageGroupOpen(block.group.key, current, handOpen);
    const forced = current === block.group.key;
    return (
      <div key={block.group.key} className="flex flex-col">
        <button
          type="button"
          data-testid={`nav-group-${block.group.key}`}
          aria-expanded={open}
          aria-disabled={forced || undefined}
          onClick={() => togglePageGroup(block.group.key, current)}
          className={`flex h-6 items-center rounded-md pl-7 pr-1.5 text-left ${GROUP_LABEL} ${first ? "" : "mt-1.5"} ${
            forced ? "cursor-default" : "hover:bg-c-hover"
          }`}
        >
          <span className="flex-1">{block.group.label}</span>
          <MIcon name={open ? "expand_less" : "expand_more"} size={16} />
        </button>
        {open && (
          <div data-testid={`nav-group-children-${block.group.key}`} className="flex flex-col">
            {block.pages.map((child, i) => renderChild(group, child, i === block.pages.length - 1))}
          </div>
        )}
      </div>
    );
  }

  /** A page with no module — Dashboard · Workspace · Issue Tracker · Catalog. */
  function renderPlain(group: PortalNavGroup, item: PortalNavItem) {
    const active = isItemActive(group, item);
    return (
      <Link
        key={item.key}
        to={navItemHref(group, item)}
        onClick={() => fireMarkSeen(item.badge)}
        data-testid={`nav-child-${item.key}`}
        aria-current={active ? "page" : undefined}
        ref={active ? (activeRowRef as Ref<HTMLAnchorElement>) : undefined}
        className={`${ROW} ${active ? ROW_ON : ROW_REST}`}
      >
        {rowIcon(item.mIcon, item.icon, active)}
        <span className={WRAP}>{item.label}</span>
        {item.badge && <NavBadge count={badgeCount[item.badge] ?? 0} label={item.label} />}
        {item.pendingPill && pendingCount > 0 && (
          <span className="min-w-[16px] rounded-full bg-c-ink px-[7px] py-px text-center text-[11px] font-bold tabular-nums text-white">
            {pendingCount}
          </span>
        )}
      </Link>
    );
  }

  /** A MODULE: icon + name + chevron, its pages on the tree line beneath it. */
  function renderModule(group: PortalNavGroup, block: Extract<NavBlock, { kind: "module" }>) {
    const { module, pages } = block;
    const expanded = openSection === module.section;
    /* The module holding the page you are on wears the selection, open or
     * shut: open, its page wears it too; shut, it is the one mark of where
     * you are. `aria-current` stays on the page alone. */
    const holdsActive = pages.some((p) => isItemActive(group, p));
    // A SHUT module carries the work waiting inside it; OPEN it carries
    // none — the pages say it themselves.
    const sum = expanded ? 0 : moduleBadgeSum(block);
    const slug = module.section.toLowerCase().replace(/\s+/g, "-");
    const current = currentGroupOf(group, pages);
    const blocks = moduleChildBlocks(pages);
    return (
      <div key={module.section} className="flex flex-col gap-[3px]">
        <button
          type="button"
          data-testid={`nav-module-${slug}`}
          data-holds-current={holdsActive || undefined}
          aria-expanded={expanded}
          onClick={() => toggleModule(group, block)}
          className={`${ROW} ${holdsActive ? ROW_ON : ROW_REST}`}
        >
          {rowIcon(module.mIcon, module.icon, holdsActive)}
          <span className={WRAP}>{module.label}</span>
          {sum > 0 && <NavBadge count={sum} label={module.label} />}
          <MIcon name={expanded ? "expand_less" : "expand_more"} size={18} className="text-c-secondary" />
        </button>
        {expanded && (
          <div data-testid={`nav-children-${slug}`} className="ml-[18px] flex flex-col">
            {blocks.map((b, i) =>
              b.kind === "page"
                ? renderChild(group, b.item, i === blocks.length - 1 || blocks[i + 1]?.kind === "group")
                : renderPageGroup(group, b, current, i === 0),
            )}
          </div>
        )}
      </div>
    );
  }

  /** The small caps section word — OVERVIEW · SALES LOCATIONS · … */
  const groupHead = (label: string, key: string) => (
    <span key={`head-${key}`} data-testid={`nav-group-head-${key}`} className={`px-2.5 pb-1 pt-4 ${SECTION_LABEL}`}>
      {label}
    </span>
  );

  /* Settings — the ONE Settings entry sits at the bottom of the menu (Layout
   * Standard §2). Finance keeps its own Settings page; People has none. */
  const settingsHref = location.pathname.startsWith("/finance")
    ? "/finance/settings"
    : role === "operation" || role === "principal"
      ? "/operation/settings"
      : role === "finance"
        ? "/finance/settings"
        : null;
  const onSettings =
    location.pathname.startsWith("/operation/settings") || location.pathname.startsWith("/finance/settings");
  const roleWord: Record<string, string> = {
    operation: "Operations",
    principal: "Principal",
    finance: "Finance",
    hr: "People",
  };

  return (
    <nav
      aria-label="Modules"
      data-testid="portal-sidebar"
      data-collapsed={collapsed || undefined}
      className={`sticky top-0 flex ${drawer ? "h-full min-h-0" : "h-screen"} flex-col gap-[3px] overflow-hidden border-r border-c-head-line bg-c-ground px-2.5 py-3 text-c-body`}
      style={{ width: collapsed ? 64 : 220, transition: "width 0.18s ease" }}
    >
      {/* Logo row — wordmark 20px open, heart mark 34px closed, the « / »
          button at the right (Layout Standard §2). Never recoloured. */}
      <div
        className={`mb-3 flex min-h-[44px] shrink-0 items-center gap-2.5 ${
          collapsed ? "flex-col justify-center" : "pl-2.5 pr-1.5"
        }`}
      >
        <Link to={homeHref} title="Carres home" className="block shrink-0">
          {collapsed ? (
            <img src="/carres-mark.png" alt="Carres" width={34} height={34} className="block h-[34px] w-[34px] object-contain" />
          ) : (
            <img src="/carres-wordmark-shell.png" alt="Carres" className="block h-5 w-auto" />
          )}
        </Link>
        {!drawer && (
          <button
            type="button"
            onClick={toggleCollapse}
            disabled={autoCanvas && !onExpandForCanvas}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[16px] text-c-secondary hover:bg-c-hover ${collapsed ? "" : "ml-auto"}`}
          >
            {collapsed ? "»" : "«"}
          </button>
        )}
      </div>

      {/* The ONE scroller of the menu: nothing inside it scrolls on its own. */}
      <div data-testid="portal-sidebar-list" className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
        {collapsed
          ? // Icon rail — the active area only. A module's icon opens its
            // landing page; the page you are on keeps its selected pill.
            (activeGroup ? navBlocks(activeGroup, role, caps) : []).map((block) => {
              const target = block.kind === "plain" ? block.item : moduleLandingPage(block);
              if (!target) return null;
              const label = block.kind === "plain" ? block.item.label : block.module.label;
              const mIcon = block.kind === "plain" ? block.item.mIcon : block.module.mIcon;
              const Lucide = block.kind === "plain" ? block.item.icon : block.module.icon;
              const active =
                block.kind === "plain"
                  ? isItemActive(activeGroup, block.item)
                  : block.pages.some((p) => isItemActive(activeGroup, p));
              const dot =
                block.kind === "plain"
                  ? (block.item.badge && (badgeCount[block.item.badge] ?? 0) > 0) ||
                    (block.item.pendingPill && pendingCount > 0)
                  : moduleBadgeSum(block) > 0;
              return (
                <Link
                  key={block.kind === "plain" ? block.item.key : block.module.section}
                  to={navItemHref(activeGroup, target)}
                  onClick={() => fireMarkSeen(target.badge)}
                  title={label}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-[34px] w-full shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-c-select-pill text-c-select-fg [box-shadow:var(--shadow-lift)]" : "text-c-tab hover:bg-c-hover"
                  }`}
                >
                  {rowIcon(mIcon, Lucide, true)}
                  {dot && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-c-select-fg" />}
                </Link>
              );
            })
          : groups.map((group) => {
              /* For the boss, the Operations area draws its six groups with no
                 area word (no group is called "Operations"), so it has nothing
                 to fold or open it with: it is always drawn, on every page.
                 Every other area she can see keeps its own word as a fold. */
              const open = group.area === "operation" || isOpen(group.area);
              const areaHead = groups.length > 1 && group.area !== "operation";
              return (
                <div key={group.area} className="flex flex-col gap-[3px]">
                  {areaHead && (
                    <button
                      type="button"
                      data-testid={`nav-area-${group.area}`}
                      aria-expanded={open}
                      onClick={() => toggleGroup(group)}
                      className={`flex w-full items-center justify-between px-2.5 pb-1 pt-4 ${SECTION_LABEL} ${
                        group.area === activeArea && !open ? "!text-c-select-fg" : "hover:text-c-body"
                      }`}
                    >
                      <span>{group.label}</span>
                      <MIcon name={open ? "expand_less" : "expand_more"} size={16} />
                    </button>
                  )}
                  {open &&
                    menuGroups(group, role, caps).map((mg, i) => (
                      <Fragment key={mg.label ?? `rest-${i}`}>
                        {mg.label && groupHead(mg.label, mg.label.toLowerCase().replace(/\s+/g, "-"))}
                        {mg.blocks.map((block) =>
                          block.kind === "plain" ? renderPlain(group, block.item) : renderModule(group, block),
                        )}
                      </Fragment>
                    ))}
                </div>
              );
            })}
      </div>

      {/* Bottom — Settings and the person (Layout Standard §2). */}
      <div className="flex shrink-0 flex-col gap-[3px] border-t border-c-head-line pt-2">
        {settingsHref && (
          <Link
            to={settingsHref}
            data-testid="nav-settings"
            title="Settings"
            aria-label={collapsed ? "Settings" : undefined}
            aria-current={onSettings ? "page" : undefined}
            className={`${ROW} ${collapsed ? "justify-center" : ""} ${onSettings ? ROW_ON : ROW_REST}`}
          >
            <MIcon name="settings" size={MODULE_ICON} className={onSettings ? undefined : "text-c-tab"} />
            {!collapsed && <span>Settings</span>}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setReporting(true)}
          data-testid="nav-report-problem"
          title="Report a problem to IT"
          aria-label={collapsed ? "Report a problem to IT" : undefined}
          className={`${ROW} ${collapsed ? "justify-center" : ""} ${ROW_REST}`}
        >
          <MIcon name="support_agent" size={MODULE_ICON} className="text-c-tab" />
          {!collapsed && <span>Report a problem to IT</span>}
        </button>
        <ReportProblemModal open={reporting} onClose={() => setReporting(false)} />
        <Link
          to="/me"
          title={`${displayName} · Profile · Sign out`}
          aria-label={`${displayName} · Profile · Sign out`}
          className={`flex items-center gap-2.5 rounded-lg px-1.5 py-2 hover:bg-c-hover ${collapsed ? "justify-center" : ""}`}
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-c-info-bg text-[11px] font-bold text-c-ink">
            {initials}
            <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white bg-c-online" aria-hidden />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-[1.25]">
              <span className="break-words text-[13px] font-medium text-c-ink">{displayName}</span>
              <span className="text-[12px] text-c-secondary">{(role && roleWord[role]) ?? ""} · online</span>
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
