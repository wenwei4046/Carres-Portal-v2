import { Fragment, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import MIcon from "@/components/carres/MIcon";
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
  visibleItems,
  navBlocks,
  menuGroups,
  navItemHref,
  areaDefaultHref,
  type NavBlock,
  type PortalArea,
  type PortalNavGroup,
  type PortalNavItem,
  type PortalSection,
  WAREHOUSE_LANDING_KEY,
  PAYMENTS_LANDING_KEY,
} from "./portal-nav";
import {
  purchasingChildBlocks,
  activePurchasingGroup,
  parsePurchasingSidebarState,
  serializePurchasingSidebarState,
  purchasingSidebarStorageKey,
  PURCHASING_LANDING_KEY,
  EMPTY_PURCHASING_SIDEBAR_STATE,
  type PurchasingChildBlock,
  type PurchasingPageGroupKey,
  type PurchasingSidebarStateV2,
} from "./purchasing-sidebar";

/* The menu OPENS at 220px with words and group labels (handoff 2026-10-08,
   "Do NOT" 2). Only the person's own « click closes it, and that choice is
   remembered under a new key so an older auto-collapse never carries over. */
const COLLAPSE_KEY = "carres-menu-collapsed";

/** The module / plain-row icon (Layout Standard §4.4: 16–20px). */
const MODULE_ICON = 20;

const PURCHASING: PortalSection = "Purchasing";
const WAREHOUSE: PortalSection = "Warehouse";
const PAYMENTS: PortalSection = "Payments";

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
 * Visual: the v17 Operation rail (clean cool-gray), with the governed blue
 * selection treatment on the current destination — 3px `kit-blue-9` active bar
 * + `kit-blue-3` wash (`docs/ui/MASTER.md` PORTAL NAVIGATION ACTIVE COLOUR,
 * APPROVED / LOCKED). Never flame: red in Carres means late / act now, so an
 * "I am on this page" marker may not spend it. Badge counts (orders /
 * procurement / service-notes) + the Approvals pending pill are fetched here,
 * each gated by role so an operation user never calls the principal dashboard
 * API (and vice-versa).
 */
export default function PortalSidebar({ drawer = false }: {
  /** Below 768px the rail is a slide-in drawer (owner review 2026-09-25):
   *  always the named rail, no collapse toggle of its own. */
  drawer?: boolean;
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
  /* A drawer is always the named rail. */
  const collapsed = drawer ? false : storedCollapsed;
  const toggleCollapse = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

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

  /* ── PURCHASING REMEMBERS ITS DRAWERS, PER SIGNED-IN USER ────────────────
   * (CARD-2026-08-22-purchasing-01-final-sidebar-listing.)
   *
   * Eighteen destinations behind five drawers is only kind if the operator
   * does not have to re-open theirs every morning. So Purchasing's parent and
   * group choices persist — PRESENTATION ONLY, and keyed on the auth user id,
   * because two people share a machine in the office.
   *
   * What is NOT stored: the active route, the active key, any count, any
   * business status. Where you are standing is derived from the URL every
   * render; a rail preference may never become a second source of truth. */
  const userId = session?.user?.id ?? null;
  const storageKey = userId ? purchasingSidebarStorageKey(userId) : null;
  const [purchasingState, setPurchasingState] = useState<PurchasingSidebarStateV2>(
    EMPTY_PURCHASING_SIDEBAR_STATE,
  );

  // Signing in, or switching user, LOADS that user's own state — never the
  // previous one's. No id (not signed in yet) → memory only, never written.
  useEffect(() => {
    if (!storageKey) {
      setPurchasingState(EMPTY_PURCHASING_SIDEBAR_STATE);
      return;
    }
    try {
      setPurchasingState(parsePurchasingSidebarState(localStorage.getItem(storageKey)));
    } catch {
      setPurchasingState(EMPTY_PURCHASING_SIDEBAR_STATE);
    }
  }, [storageKey]);

  /** A HUMAN turned this handle — remember it. */
  function writePurchasingState(next: PurchasingSidebarStateV2) {
    setPurchasingState(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, serializePurchasingSidebarState(next));
    } catch {
      /* a full or blocked storage may not break the rail */
    }
  }

  /** Another module took the rail. Memory only: the operator did not choose
   *  to shut Purchasing, so their stored preference is not overwritten. */
  function closePurchasingForOtherModule() {
    setPurchasingState((prev) => (prev.moduleOpen ? { ...prev, moduleOpen: false } : prev));
  }

  // The Purchasing pages this role may open, and which one is showing.
  const purchasingPages = useMemo(
    () =>
      activeGroup
        ? visibleItems(activeGroup, role, caps).filter((item) => item.section === PURCHASING)
        : [],
    [activeGroup, role],
  );
  const activePurchasingKey = activeGroup
    ? purchasingPages.find((page) => isItemActive(activeGroup, page))?.key ?? null
    : null;
  /** The drawer holding the page you are on. Derived, forced open, never stored. */
  const forcedGroup = activePurchasingGroup(purchasingPages, activePurchasingKey);

  /* ARRIVING ON A PURCHASING PAGE OPENS PURCHASING — the safety rule that wins
   * over a stored closed state. A URL, a ⌘K jump or an in-page link must never
   * land you on a page the rail is hiding. It is not persisted: the operator
   * did not choose it, the route did. */
  //
  // `storageKey` is a dependency on purpose. Switching user re-runs the LOAD
  // effect above and replaces the state with the new user's (often empty) one
  // — so this rule has to run again for the incoming user, or an operator who
  // signs in while standing on a Purchasing page lands on a rail that is
  // hiding their own page.
  useEffect(() => {
    if (!activePurchasingKey) return;
    setPurchasingState((prev) => (prev.moduleOpen ? prev : { ...prev, moduleOpen: true }));
  }, [activePurchasingKey, storageKey]);

  /* THE ONE OPEN MODULE. The shipped location rule still decides for every
   * other module; Purchasing alone answers to its own remembered handle. The
   * order matters: a module holding the page you are STANDING on always wins,
   * so a remembered Purchasing drawer can never hide the row you are on. */
  const baseOpen: PortalSection | null =
    override?.at === here ? override.section || null : activeModuleSection;
  const openSection: PortalSection | null =
    baseOpen !== null && baseOpen !== PURCHASING
      ? baseOpen
      : purchasingState.moduleOpen
        ? PURCHASING
        : null;

  const isGroupOpen = (key: PurchasingPageGroupKey) =>
    key === forcedGroup || purchasingState.openGroups.includes(key);

  /** A drawer opens and shuts on its own — opening one never shuts another.
   *  The drawer you are STANDING in cannot be shut: that would hide the page
   *  you are on, which is the one thing the rail may not do. */
  function togglePurchasingGroup(key: PurchasingPageGroupKey) {
    if (key === forcedGroup) return;
    const open = purchasingState.openGroups.includes(key);
    writePurchasingState({
      moduleOpen: purchasingState.moduleOpen,
      openGroups: open
        ? purchasingState.openGroups.filter((g) => g !== key)
        : [...purchasingState.openGroups, key],
    });
  }

  function toggleModule(group: PortalNavGroup, block: Extract<NavBlock, { kind: "module" }>) {
    /* ⭐ THE PURCHASING ROW IS A DRAWER HANDLE, NOT A DOOR (Jess, 2026-08-20).
     *
     * Every other module opens its first live page, because clicking it is how
     * you GO there. Purchasing cannot: its first row is a DRAWER, not a page,
     * and eleven destinations in four drawers mean the operator clicks this
     * row to LOOK — to find which drawer their job is in — far more often than
     * to travel. So it reveals the map and leaves the URL exactly where it
     * was. It still shuts whatever other module was open: one module at a time
     * is the shipped accordion's rule and it holds. */
    if (block.module.section === PURCHASING) {
      const next = openSection !== PURCHASING;
      setOverride({ at: here, section: "" }); // the location rule steps aside
      writePurchasingState({ ...purchasingState, moduleOpen: next });
      return;
    }
    if (openSection === block.module.section) {
      setOverride({ at: here, section: "" }); // shut, on purpose, right here
      closePurchasingForOtherModule();
      return;
    }
    setOverride({ at: here, section: block.module.section });
    closePurchasingForOtherModule();
    // Expanding also OPENS the module — its first live page. An all-unbuilt
    // module has nothing to open, so it only expands.
    const first = block.pages.find((p) => !p.soon);
    if (first) {
      fireMarkSeen(first.badge);
      navigate(navItemHref(group, first));
    }
  }

  /**
   * WHERE A COLLAPSED MODULE ICON GOES.
   *
   * ⭐ NOT "the first live row" (owner review, 2026-08-20). Deriving the
   * destination from row order means the module's landing page silently moves
   * the day a page above it goes live — grouping Purchasing had already
   * dragged its icon off `SO Batch Purchase` without anyone deciding that.
   * Purchasing names its landing page instead, and the name is PERMANENT:
   * there is no Purchasing Home to hand it to (`docs/purchasing/MASTER.md`
   * §4). Every other module keeps first-live-row until it has a reason not
   * to.
   */
  function moduleLandingPage(
    block: Extract<NavBlock, { kind: "module" }>,
  ): PortalNavItem | undefined {
    if (block.module.section === PURCHASING) {
      const named = block.pages.find(
        (p) => p.key === PURCHASING_LANDING_KEY && !p.soon,
      );
      if (named) return named;
    }
    /* Warehouse names its landing too (CARD-2026-09-01-warehouse-01-sidebar):
     * `Inventory` — the Unit Register — until Dashboard is built. */
    if (block.module.section === WAREHOUSE) {
      const named = block.pages.find(
        (p) => p.key === WAREHOUSE_LANDING_KEY && !p.soon,
      );
      if (named) return named;
    }
    /* Payments lands on Monitor — the collection desk — by name (owner
     * ruling 2026-09-12). */
    if (block.module.section === PAYMENTS) {
      const named = block.pages.find(
        (p) => p.key === PAYMENTS_LANDING_KEY && !p.soon,
      );
      if (named) return named;
    }
    return block.pages.find((p) => !p.soon);
  }

  /** Work waiting inside a module, for the row that has hidden its children. */
  function moduleBadgeSum(block: Extract<NavBlock, { kind: "module" }>): number {
    return block.pages.reduce(
      (sum, p) => sum + (p.badge ? badgeCount[p.badge] ?? 0 : 0),
      0,
    );
  }

  /* ── THE DRAWING — Carres UI Kit "Side menu" (owner-confirmed handoff, Jess
   * 2026-10-08; every number from v8 L20–35). Width 220 open / 64 closed ·
   * item pad 7 10 · gap 10 · radius 8 · 14/500 menu grey · icon 20 · selected
   * 600 in the theme select colours · hover c-hover · group label 10/600/.12em.
   * Sub-items hang 19px in on one thin grey tree line, text 16px from it;
   * Purchasing's pages are 13px, 28px in. */
  const ITEM =
    "relative flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[14px] leading-[18px] font-medium";
  const ITEM_REST = "text-c-menu hover:bg-c-hover";
  const ITEM_ON = "bg-c-select-bg text-c-select-fg font-semibold";
  const SUB = "ml-[19px] rounded-l-none shadow-[inset_1px_0_0_var(--c-btn-border)]";
  const GROUP_LABEL = "text-[10px] font-semibold uppercase leading-[13px] tracking-[0.12em] text-c-muted";

  /** The row icon: the Material Symbol when the menu row has one, else the
   *  area's own icon (Finance · People · Admin rows). */
  const rowIcon = (mIcon: string | undefined, Lucide: PortalNavItem["icon"]) =>
    mIcon ? (
      <MIcon name={mIcon} size={MODULE_ICON} />
    ) : (
      <Lucide size={MODULE_ICON} strokeWidth={1.5} aria-hidden className="shrink-0" />
    );

  /**
   * ONE CHILD PAGE under its module, on the tree line.
   *
   * A `soon` child is deliberately NOT A LINK (`03-page-patterns.md:149` bans
   * a control that opens nothing): a span out of the tab order, `aria-disabled`,
   * saying `Coming soon` on its own line. It carries no count.
   */
  function renderChild(group: PortalNavGroup, child: PortalNavItem, deep = false) {
    const size = deep ? "text-[13px]" : "";
    const pad = deep ? "pl-7" : "pl-4";
    if (child.soon) {
      return (
        <span
          key={child.key}
          data-testid={`nav-child-${child.key}`}
          data-soon="1"
          aria-disabled="true"
          tabIndex={-1}
          className={`${ITEM} ${SUB} ${pad} ${size} cursor-default select-none flex-col items-start gap-0 text-c-muted`}
        >
          <span className="w-full min-w-0 truncate">{child.label}</span>
          <span className="text-[11px] font-normal leading-[14px] text-c-muted">Coming soon</span>
        </span>
      );
    }
    const active = isItemActive(group, child);
    return (
      <Link
        key={child.key}
        to={navItemHref(group, child)}
        onClick={() => fireMarkSeen(child.badge)}
        data-testid={`nav-child-${child.key}`}
        aria-current={active ? "page" : undefined}
        ref={active ? (activeRowRef as Ref<HTMLAnchorElement>) : undefined}
        title={child.label}
        className={`${ITEM} ${SUB} ${pad} ${size} ${active ? ITEM_ON : ITEM_REST}`}
      >
        <span className="min-w-0 flex-1 truncate">{child.label}</span>
        {child.badge && <NavBadge count={badgeCount[child.badge] ?? 0} label={child.label} />}
      </Link>
    );
  }

  /**
   * A DRAWER — one named group of Purchasing pages (Buy · Receive · Problems ·
   * Showroom): a small uppercase word on the tree line, never a destination.
   * Each opens and shuts alone; the one holding the current page is forced
   * open and says so with `aria-disabled`.
   */
  function renderPurchasingGroup(
    group: PortalNavGroup,
    block: Extract<PurchasingChildBlock, { kind: "group" }>,
  ) {
    const open = isGroupOpen(block.group.key);
    const forced = forcedGroup === block.group.key;
    return (
      <div key={block.group.key} className="flex flex-col gap-0.5">
        <button
          type="button"
          data-testid={`nav-group-${block.group.key}`}
          aria-expanded={open}
          aria-disabled={forced || undefined}
          onClick={() => togglePurchasingGroup(block.group.key)}
          className={`${SUB} flex items-center gap-1.5 pb-0.5 pl-4 pr-2.5 pt-2.5 text-left ${GROUP_LABEL} ${
            forced ? "cursor-default" : "hover:text-c-body"
          }`}
        >
          <span className="flex-1 truncate">{block.group.label}</span>
          <MIcon name={open ? "expand_more" : "chevron_right"} size={16} className="text-c-muted" />
        </button>
        {open && (
          <div data-testid={`nav-group-children-${block.group.key}`} className="flex flex-col gap-0.5">
            {block.pages.map((child) => renderChild(group, child, true))}
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
        title={item.label}
        className={`${ITEM} ${active ? ITEM_ON : ITEM_REST}`}
      >
        {rowIcon(item.mIcon, item.icon)}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge && <NavBadge count={badgeCount[item.badge] ?? 0} label={item.label} />}
        {item.pendingPill && pendingCount > 0 && (
          <span className="min-w-[16px] rounded-full bg-c-ink px-[7px] py-px text-center text-[11px] font-semibold tabular-nums text-white">
            {pendingCount}
          </span>
        )}
      </Link>
    );
  }

  /** A MODULE: icon + name + caret, its pages on the tree line beneath it. */
  function renderModule(group: PortalNavGroup, block: Extract<NavBlock, { kind: "module" }>) {
    const { module, pages } = block;
    const expanded = openSection === module.section;
    const holdsActive = pages.some((p) => isItemActive(group, p));
    // A COLLAPSED module carries the work waiting inside it; EXPANDED it
    // carries none — the children say it themselves.
    const sum = expanded ? 0 : moduleBadgeSum(block);
    const isPurchasing = module.section === PURCHASING;
    /* ALWAYS EXACTLY ONE VISIBLE SELECTED ROW: tree open → the exact child;
     * tree shut → the module row, because it has swallowed your page. */
    const lit = holdsActive && !expanded;
    const slug = module.section.toLowerCase().replace(/\s+/g, "-");
    return (
      <div key={module.section} className="flex flex-col gap-0.5">
        <button
          type="button"
          data-testid={`nav-module-${slug}`}
          aria-expanded={expanded}
          title={module.label}
          onClick={() => toggleModule(group, block)}
          className={`${ITEM} ${lit ? ITEM_ON : ITEM_REST}`}
        >
          {rowIcon(module.mIcon, module.icon)}
          <span className="min-w-0 flex-1 truncate">{module.label}</span>
          {sum > 0 && <NavBadge count={sum} label={module.label} />}
          <MIcon name={expanded ? "expand_more" : "chevron_right"} size={18} className="text-c-muted" />
        </button>
        {expanded && (
          <div data-testid={`nav-children-${slug}`} className="flex flex-col gap-0.5">
            {isPurchasing
              ? purchasingChildBlocks(pages).map((b) =>
                  b.kind === "page" ? renderChild(group, b.item) : renderPurchasingGroup(group, b),
                )
              : pages.map((child) => renderChild(group, child))}
          </div>
        )}
      </div>
    );
  }

  /** The small uppercase group word — OVERVIEW · SALES LOCATIONS · … */
  const groupHead = (label: string, key: string) => (
    <span key={`head-${key}`} data-testid={`nav-group-head-${key}`} className={`px-2.5 pb-1 pt-3.5 ${GROUP_LABEL}`}>
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
    <aside
      data-testid="portal-sidebar"
      data-collapsed={collapsed || undefined}
      className="sticky top-0 flex h-screen flex-col gap-0.5 overflow-hidden bg-c-ground px-2.5 py-3 text-c-body"
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
            title={collapsed ? "Expand menu" : "Collapse menu"}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[16px] text-c-muted hover:bg-c-hover ${collapsed ? "" : "ml-auto"}`}
          >
            {collapsed ? "»" : "«"}
          </button>
        )}
      </div>

      <nav aria-label="Modules" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
        {collapsed
          ? // Icon rail — the active area only. A module's icon opens its
            // landing page; the page you are on keeps its selected wash.
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
                    active ? "bg-c-select-bg text-c-select-fg" : "text-c-menu hover:bg-c-hover"
                  }`}
                >
                  {rowIcon(mIcon, Lucide)}
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
                <div key={group.area} className="flex flex-col gap-0.5">
                  {areaHead && (
                    <button
                      type="button"
                      data-testid={`nav-area-${group.area}`}
                      aria-expanded={open}
                      onClick={() => toggleGroup(group)}
                      className={`flex w-full items-center justify-between px-2.5 pb-1 pt-3.5 ${GROUP_LABEL} ${
                        group.area === activeArea && !open ? "!text-c-select-fg" : "hover:text-c-body"
                      }`}
                    >
                      <span>{group.label}</span>
                      <MIcon name={open ? "expand_more" : "chevron_right"} size={16} />
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
      </nav>

      {/* Bottom — Settings ⚙ and the person (Layout Standard §2). */}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-c-footer-line pt-2">
        {settingsHref && (
          <Link
            to={settingsHref}
            data-testid="nav-settings"
            title="Settings"
            aria-label={collapsed ? "Settings" : undefined}
            aria-current={onSettings ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-[14px] ${
              collapsed ? "justify-center" : ""
            } ${onSettings ? "bg-c-select-bg font-semibold text-c-select-fg" : "font-medium text-c-ink hover:bg-c-info-bg"}`}
          >
            <MIcon name="settings" size={20} />
            {!collapsed && <span>Settings</span>}
          </Link>
        )}
        <Link
          to="/me"
          title={`${displayName} · Profile · Sign out`}
          aria-label={`${displayName} · Profile · Sign out`}
          className={`flex items-center gap-2.5 rounded-lg px-1.5 py-2 hover:bg-c-hover ${collapsed ? "justify-center" : ""}`}
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-c-ink text-[12px] font-semibold text-white">
            {initials}
            <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white bg-c-online" aria-hidden />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-[1.25]">
              <span className="truncate text-[13px] font-semibold text-c-ink">{displayName}</span>
              <span className="truncate text-[11px] text-c-muted">{(role && roleWord[role]) ?? ""} · online</span>
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}
