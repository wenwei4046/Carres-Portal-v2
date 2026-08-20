import { Fragment, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";
import NavBadge from "@/components/NavBadge";
import {
  useOperationBadges,
  useMarkOperationBadgeSeen,
  usePrincipalDashboard,
} from "@/lib/queries";
import {
  visibleGroups,
  navBlocks,
  navItemHref,
  areaDefaultHref,
  type NavBlock,
  type PortalArea,
  type PortalNavGroup,
  type PortalNavItem,
  type PortalSection,
} from "./portal-nav";

const COLLAPSE_KEY = "ops-sidebar-collapsed";

/* ⭐ THE MEASURED RAIL (CARD-2026-08-19-sidebar-expandable-modules §3).
 *
 * One place for the numbers, because the elbow has to LAND on the icon it
 * hangs from and a second copy of 14 or 16 is how that drifts apart.
 *
 *   module row   36px — text-body (13/18) + 9px above and below
 *   child row    32px — text-body (13/18) + 7px above and below
 *   elbow        drops from the module ICON'S CENTRE and turns into the row
 */
const ROW_PAD_X = 14; // px-3.5 — the rail's shipped row padding
const MODULE_ICON = 16;
/** x of the trunk = the module icon's centre. The RULE, not a copied number:
 *  the card measured ≈18px against a narrower padding, and an elbow that
 *  misses the icon it hangs from is the one defect this drawing cannot have. */
const ELBOW_X = ROW_PAD_X + MODULE_ICON / 2;
const ELBOW_W = 11;
const ELBOW_R = 9;
/** child text = parent text + 4px (the card's own alignment rule). */
const CHILD_PAD_L = ROW_PAD_X + MODULE_ICON + 11 + 4;
/** the flex `gap-0.5` the trunk has to bridge to look continuous. */
const ROW_GAP = 2;
/** module row bottom → icon bottom, so the first elbow reaches the icon. */
const ICON_TO_ROW_BOTTOM = (36 - MODULE_ICON) / 2;
/** a `dividerAbove` hairline: 2px gap + 4px margin + 1px rule + 4px + 2px. */
const DIVIDER_GAP = 13;

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
 * production and re-ruled. One module is open at a time — thirteen purchasing
 * pages and six delivery pages cannot stack — and the module you are standing
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
export default function PortalSidebar() {
  const role = useAuth((s) => s.role);
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  const location = useLocation();
  const navigate = useNavigate();

  const groups = useMemo(() => visibleGroups(role), [role]);

  // Active area = which base path we're under. Active tab = `?tab=` (or the
  // path-driven operation section, or the finance pathname).
  const activeArea: PortalArea | null = useMemo(() => {
    const g = groups.find((grp) => location.pathname.startsWith(grp.base));
    return g?.area ?? groups[0]?.area ?? null;
  }, [groups, location.pathname]);

  const searchTab = new URLSearchParams(location.search).get("tab");

  // Collapse — self-owned, persisted. Icon rail = more room for wide tables.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
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

  // Manually-opened AREA groups (in addition to the always-open active area).
  const [opened, setOpened] = useState<Set<PortalArea>>(new Set());
  const isOpen = (area: PortalArea) => area === activeArea || opened.has(area);

  function toggleGroup(group: PortalNavGroup) {
    if (group.area === activeArea) return; // active area stays open
    // First click on a non-active area: jump into it (its dashboard).
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

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
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
    ? (navBlocks(activeGroup, role).find(
        (b) => b.kind === "module" && b.pages.some((p) => isItemActive(activeGroup, p)),
      ) as Extract<NavBlock, { kind: "module" }> | undefined)?.module.section ?? null
    : null;

  const here = `${location.pathname}${location.search}`;
  const [override, setOverride] = useState<
    { at: string; section: PortalSection | "" } | null
  >(null);
  const openSection: PortalSection | null =
    override?.at === here ? override.section || null : activeModuleSection;

  function toggleModule(group: PortalNavGroup, block: Extract<NavBlock, { kind: "module" }>) {
    if (openSection === block.module.section) {
      setOverride({ at: here, section: "" }); // shut, on purpose, right here
      return;
    }
    setOverride({ at: here, section: block.module.section });
    // Expanding also OPENS the module — its first live page. An all-unbuilt
    // module has nothing to open, so it only expands.
    const first = block.pages.find((p) => !p.soon);
    if (first) {
      fireMarkSeen(first.badge);
      navigate(navItemHref(group, first));
    }
  }

  /** Work waiting inside a module, for the row that has hidden its children. */
  function moduleBadgeSum(block: Extract<NavBlock, { kind: "module" }>): number {
    return block.pages.reduce(
      (sum, p) => sum + (p.badge ? badgeCount[p.badge] ?? 0 : 0),
      0,
    );
  }

  /**
   * ONE CHILD PAGE, HANGING OFF ITS OWN ELBOW.
   *
   * Every child draws its own connector: the trunk drops from the module
   * icon's centre to this row's middle, then turns right on a 9px radius into
   * the row. Because each elbow stops at its own row, the line is structurally
   * ABSENT below the last child — there is no single straight bar running past
   * the group, which is the defect the drawing exists to avoid.
   *
   * A `soon` child is deliberately NOT A LINK (`03-page-patterns.md:149` bans
   * a control that opens nothing; there is no arrow here to be dead). It is a
   * span with no href, out of the tab order, `aria-disabled`, and it says WHY
   * on screen — `Coming soon`, on its OWN LINE under the name, because beside
   * the tag every unbuilt name truncated (measured 2026-08-19,
   * `COPY-STANDARD.md`). It carries no count either, not even zero: a number
   * would claim work exists on a page that does not.
   */
  function renderChild(
    group: PortalNavGroup,
    child: PortalNavItem,
    index: number,
    isLast: boolean,
  ) {
    const gapAbove = child.dividerAbove
      ? DIVIDER_GAP
      : index === 0
        ? ROW_GAP + ICON_TO_ROW_BOTTOM
        : ROW_GAP;

    const elbow = (
      <>
        {/* The corner: down the trunk, then a 9px turn into the row. */}
        <span
          aria-hidden="true"
          data-testid={`nav-elbow-${child.key}`}
          className="absolute pointer-events-none border-kit-slate-6"
          style={{
            left: ELBOW_X - 0.5,
            top: -gapAbove,
            width: ELBOW_W,
            // Down to the row's MIDDLE, where it turns.
            height: `calc(50% + ${gapAbove}px)`,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
            borderBottomLeftRadius: ELBOW_R,
            // Above the row's own wash: a selected page must still show which
            // module it hangs from, the way any tree keeps its indent guide.
            zIndex: 1,
          }}
        />
        {/* The trunk carrying on to the NEXT child — absent on the last one,
         * which is what makes the line END at the last elbow instead of
         * running past the group as one straight bar. Drawn per child rather
         * than measured once, so a two-line `Coming soon` row cannot knock the
         * arithmetic out. */}
        {!isLast && (
          <span
            aria-hidden="true"
            data-testid={`nav-trunk-${child.key}`}
            className="absolute pointer-events-none border-kit-slate-6"
            style={{
              left: ELBOW_X - 0.5,
              top: "50%",
              bottom: -ROW_GAP,
              borderLeftWidth: 1,
              zIndex: 1,
            }}
          />
        )}
      </>
    );

    const row =
      "relative w-full text-left pr-3.5 py-[7px] rounded-control text-body flex";

    if (child.soon) {
      return (
        <Fragment key={child.key}>
          {child.dividerAbove && (
            <div className="mr-3.5 my-1 border-t border-base-100" style={{ marginLeft: CHILD_PAD_L }} />
          )}
          <div className="relative">
            {elbow}
            <span
              data-testid={`nav-child-${child.key}`}
              data-soon="1"
              aria-disabled="true"
              tabIndex={-1}
              className={`${row} flex-col items-start text-base-400 font-normal cursor-default select-none`}
              style={{ paddingLeft: CHILD_PAD_L }}
            >
              <span className="min-w-0 w-full truncate">{child.label}</span>
              <span className="text-label text-base-400">Coming soon</span>
            </span>
          </div>
        </Fragment>
      );
    }

    const active = isItemActive(group, child);
    return (
      <Fragment key={child.key}>
        {child.dividerAbove && (
          <div className="mr-3.5 my-1 border-t border-base-100" style={{ marginLeft: CHILD_PAD_L }} />
        )}
        <div className="relative">
          {elbow}
          <Link
            to={navItemHref(group, child)}
            onClick={() => fireMarkSeen(child.badge)}
            data-testid={`nav-child-${child.key}`}
            ref={active ? (activeRowRef as Ref<HTMLAnchorElement>) : undefined}
            className={
              active
                ? `${row} items-center gap-2 bg-kit-blue-3 text-base-900 font-medium`
                : `${row} items-center gap-2 text-base-600 font-normal hover:bg-hovertint`
            }
            style={{ paddingLeft: CHILD_PAD_L }}
          >
            {active && (
              <span
                className="absolute left-0 top-[6px] bottom-[6px] bg-kit-blue-9 rounded-r-sm"
                style={{ width: 3 }}
              />
            )}
            <span className="flex-1 truncate">{child.label}</span>
            {child.badge && (
              <NavBadge count={badgeCount[child.badge] ?? 0} label={child.label} />
            )}
          </Link>
        </div>
      </Fragment>
    );
  }

  /** A page with no module — Dashboard · Work · Issue Tracker · Payments. */
  function renderPlain(group: PortalNavGroup, item: PortalNavItem) {
    const active = isItemActive(group, item);
    const base =
      "relative w-full text-left px-3.5 py-[9px] rounded-control text-body font-medium flex items-center gap-[11px]";
    return (
      <Link
        key={item.key}
        to={navItemHref(group, item)}
        onClick={() => fireMarkSeen(item.badge)}
        data-testid={`nav-child-${item.key}`}
        ref={active ? (activeRowRef as Ref<HTMLAnchorElement>) : undefined}
        className={
          active
            ? `${base} bg-kit-blue-3 text-base-900`
            : `${base} text-base-600 hover:bg-hovertint`
        }
      >
        {active && (
          <span
            className="absolute left-0 top-[7px] bottom-[7px] bg-kit-blue-9 rounded-r-sm"
            style={{ width: 3 }}
          />
        )}
        <item.icon
          size={MODULE_ICON}
          strokeWidth={2}
          className={`shrink-0 ${active ? "text-kit-blue-9" : "text-base-400"}`}
        />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && <NavBadge count={badgeCount[item.badge] ?? 0} label={item.label} />}
        {item.pendingPill && pendingCount > 0 && (
          <span
            className="font-mono bg-primary text-primary-foreground rounded-full px-[7px] py-px text-label font-semibold text-center"
            style={{ minWidth: 16 }}
          >
            {pendingCount}
          </span>
        )}
      </Link>
    );
  }

  /** A MODULE: icon + name + chevron, its pages on elbows beneath it. */
  function renderModule(
    group: PortalNavGroup,
    block: Extract<NavBlock, { kind: "module" }>,
  ) {
    const { module, pages } = block;
    const expanded = openSection === module.section;
    const holdsActive = pages.some((p) => isItemActive(group, p));
    // A COLLAPSED module carries the work waiting inside it, so nothing hides
    // behind a chevron; EXPANDED it carries none — the children say it
    // themselves, and the same number twice reads as two queues. Zero prints
    // nothing (NavBadge), because a zero badge is a daily invitation to check
    // a page with nothing on it.
    const sum = expanded ? 0 : moduleBadgeSum(block);
    // Lit only when it has swallowed the page you are on.
    const lit = holdsActive && !expanded;
    const base =
      "relative w-full text-left px-3.5 py-[9px] rounded-control text-body font-medium flex items-center gap-[11px]";
    return (
      // 8px between module blocks (2px flex gap + 6px) — the pages inside a
      // module sit 2px apart, so the module is the thing the eye counts.
      <div key={module.section} className="mt-1.5">
        <button
          type="button"
          data-testid={`nav-module-${module.section.toLowerCase().replace(/\s+/g, "-")}`}
          aria-expanded={expanded}
          onClick={() => toggleModule(group, block)}
          className={
            lit
              ? `${base} bg-kit-blue-3 text-base-900`
              : `${base} text-base-600 hover:bg-hovertint`
          }
        >
          {lit && (
            <span
              className="absolute left-0 top-[7px] bottom-[7px] bg-kit-blue-9 rounded-r-sm"
              style={{ width: 3 }}
            />
          )}
          <module.icon
            size={MODULE_ICON}
            strokeWidth={2}
            className={`shrink-0 ${lit ? "text-kit-blue-9" : "text-base-400"}`}
          />
          <span className="flex-1 truncate">{module.label}</span>
          {sum > 0 && <NavBadge count={sum} label={module.label} />}
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={`shrink-0 text-base-400 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
        </button>

        {expanded && (
          <div
            data-testid={`nav-children-${module.section.toLowerCase().replace(/\s+/g, "-")}`}
            className="flex flex-col gap-0.5 mt-0.5"
          >
            {pages.map((child, i) =>
              renderChild(group, child, i, i === pages.length - 1),
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className="bg-white border-r border-base-200 py-5 flex flex-col h-screen sticky top-0 overflow-hidden"
      style={{ width: collapsed ? 60 : 232, transition: "width 0.18s ease" }}
    >
      {/* Header — brand + collapse toggle. */}
      {collapsed ? (
        <div className="px-2 pb-[18px] flex flex-col items-center gap-2.5">
          <Link to={homeHref} title="Carres — home" className="grid place-items-center">
            <img
              src="/carres-logo.png"
              alt="Carres"
              width={26}
              height={26}
              className="block object-contain"
            />
          </Link>
          <button
            onClick={toggleCollapse}
            title="Show menu"
            aria-label="Show menu"
            className="grid place-items-center w-8 h-8 rounded-md text-base-400 hover:bg-hovertint hover:text-base-700"
          >
            <PanelLeftOpen size={18} />
          </button>
        </div>
      ) : (
        <div className="px-[22px] pb-[18px] flex items-center justify-between gap-2">
          <Link to={homeHref} title="Home" className="block text-left min-w-0">
            <CarresLockup showPortal={false} />
          </Link>
          <button
            onClick={toggleCollapse}
            title="Hide menu"
            aria-label="Hide menu"
            className="shrink-0 grid place-items-center w-8 h-8 rounded-md text-base-400 hover:bg-hovertint hover:text-base-700"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
      )}

      <nav
        className={`flex-1 ${collapsed ? "px-2" : "px-3"} pt-3 pb-1 flex flex-col gap-2 overflow-auto`}
      >
        {collapsed
          ? // Icon rail — the active area only. Collapsed, the children
            // disappear and the MODULE's one icon remains (`ui/MASTER.md`
            // §4.2): an icon rail is for table room, not for navigating
            // thirteen pages by guessing thirteen icons.
            (activeGroup ? navBlocks(activeGroup, role) : []).map((block) => {
              const target =
                block.kind === "plain"
                  ? block.item
                  : block.pages.find((p) => !p.soon);
              // An unbuilt page is not a control and gets no icon.
              if (!target) return null;
              const label = block.kind === "plain" ? block.item.label : block.module.label;
              const Icon = block.kind === "plain" ? block.item.icon : block.module.icon;
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
                  className={`relative w-full px-0 py-[9px] rounded-control flex items-center justify-center ${
                    active ? "bg-kit-blue-3" : "hover:bg-hovertint"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-[7px] bottom-[7px] bg-kit-blue-9 rounded-r-sm"
                      style={{ width: 3 }}
                    />
                  )}
                  <Icon
                    size={18}
                    strokeWidth={2}
                    className={`shrink-0 ${active ? "text-kit-blue-9" : "text-base-400"}`}
                  />
                  {dot && (
                    <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })
          : groups.map((group) => {
              const open = isOpen(group.area);
              const multi = groups.length > 1; // area headers only for principal
              return (
                <div key={group.area}>
                  {multi && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className={`w-full flex items-center justify-between px-3.5 pb-1.5 pt-1 text-label uppercase tracking-[0.16em] font-semibold ${
                        group.area === activeArea
                          ? "text-base-700 cursor-default"
                          : "text-base-500 hover:text-base-700 cursor-pointer"
                      }`}
                    >
                      <span>{group.label}</span>
                      {group.area !== activeArea && (
                        <ChevronDown
                          size={12}
                          className={`transition-transform ${open ? "" : "-rotate-90"}`}
                        />
                      )}
                    </button>
                  )}

                  {open && (
                    <div className="flex flex-col gap-0.5">
                      {navBlocks(group, role).map((block) =>
                        block.kind === "plain"
                          ? renderPlain(group, block.item)
                          : renderModule(group, block),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className={`border-t border-base-100 flex items-center hover:bg-hovertint transition-colors ${
          collapsed
            ? "px-2 py-4 justify-center"
            : "px-[22px] py-4 gap-2.5"
        }`}
      >
        <div className="w-[34px] h-[34px] shrink-0 rounded-full bg-base-900 text-white grid place-items-center text-label font-semibold">
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-meta font-semibold text-base-900 truncate">
              {email}
            </div>
            <div className="text-label text-base-500 uppercase tracking-[0.1em] mt-px">
              {roleLabel}
            </div>
          </div>
        )}
      </Link>
    </aside>
  );
}
