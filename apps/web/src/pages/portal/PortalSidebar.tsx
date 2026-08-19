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
  usePurchasingSettings,
} from "@/lib/queries";
import {
  visibleGroups,
  visibleItems,
  visibleChildren,
  navItemHref,
  areaDefaultHref,
  type PortalArea,
  type PortalNavChild,
  type PortalNavGroup,
  type PortalNavItem,
} from "./portal-nav";

const COLLAPSE_KEY = "ops-sidebar-collapsed";
const SECTION_ORDER = ["Workspace", "Sales", "Supply Chain", "Finance", "Customer Care", "Master Data", "Admin"];

function orderedItems(group: PortalNavGroup, role: Parameters<typeof visibleItems>[1]) {
  return [...visibleItems(group, role)].sort(
    (a, b) => SECTION_ORDER.indexOf(a.section ?? "Admin") - SECTION_ORDER.indexOf(b.section ?? "Admin"),
  );
}

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
 * Collapse (ported from main's 2026-06-29 operation sidebar, now portal-wide):
 * a hide button shrinks the rail to a 60px icon rail (more table room). The
 * state is self-owned here + persisted to localStorage (same `ops-sidebar-
 * collapsed` key), and the rail owns its intrinsic width — the shells' grid
 * column is `auto`, so every area collapses consistently. Collapsed mode shows
 * the real heart mark (`/carres-logo.png`) + the active area's items as icons.
 *
 * Visual: the v17 Operation rail (clean cool-gray), with the governed blue
 * selection treatment on the current destination — 3px `kit-blue-9` active bar
 * + `kit-blue-3` wash (`docs/ui/MASTER.md` PORTAL NAVIGATION ACTIVE COLOUR,
 * APPROVED / LOCKED). Never flame: red in Carres means late / act now, so an
 * "I am on this page" marker may not spend it. The grey `base-100` wash it
 * replaced was not a selection colour at all. Badge
 * counts (orders / procurement / service-notes) + the Approvals pending pill are
 * fetched here, each gated by role so an operation user never calls the
 * principal dashboard API (and vice-versa).
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

  // Purchasing Settings is a manager door and the SERVER decides who is one —
  // the rail asks the same RPC that guards the seven engine numbers rather
  // than guessing from the role. `enabled` keeps a finance-only user from
  // calling an operation endpoint (it would 403), the same shape the badge
  // feed above already uses.
  const purchasingSettingsQ = usePurchasingSettings({ enabled: opVisible });
  const canEditPurchasingSettings = purchasingSettingsQ.data?.canEdit ?? false;

  // THE RAIL NOW SCROLLS, AND THAT IS THE COST OF THE WHOLE MAP (Jess,
  // 2026-08-18). Thirteen purchasing pages plus the module rows is ~860px on a
  // ~800px viewport, so `Delivery` and `Stock` can sit below the fold while
  // Purchasing is open. The rail already scrolls (`overflow-auto` below) so
  // nothing breaks — but landing on a rail whose highlighted row is OFF SCREEN
  // is a real defect, so the active row is brought into view once on mount.
  // `block: "nearest"` on purpose: visible, not centred, not animated.
  const activeRowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
    // Mount only: re-running on every navigation would yank the rail while the
    // operator is reading further down it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manually-opened groups (in addition to the always-open active area).
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
  // `path` (orders) OR an item's `activeFor` path matcher (Purchasing owns
  // `/operation/procurement` via activeFor, not a `path`). Used to suppress the
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
    if (group.area === "finance") {
      return location.pathname === item.financePath;
    }

    // Merged items (Purchasing) light up across several routes via `activeFor`:
    // `path:<prefix>` matches the pathname; `tab:<key>` matches the `?tab=` value
    // (but not while a path section is showing).
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
    return current === item.key;
  }

  /**
   * Is this CHILD PAGE the one on screen?
   *
   * Same two shapes the items use: a `path` page matches by pathname prefix, a
   * tab page matches the `?tab=` value — and never while a path page of the
   * same module is showing, or `Receiving` would light up next to
   * `Purchase Orders`.
   */
  function isChildActive(
    group: PortalNavGroup,
    child: PortalNavChild,
  ): boolean {
    if (child.soon) return false; // it is not a page yet; it cannot be the page
    if (child.path) return location.pathname.startsWith(child.path);
    if (onPathSection(group)) return false;
    return (searchTab ?? group.defaultTab) === (child.tab ?? child.key);
  }

  /**
   * One page row under its module.
   *
   * A `soon` child is deliberately NOT A LINK. `docs/03-page-patterns.md:149`
   * bans a control that opens nothing; there is no arrow here to be dead,
   * because the row is a `<span>` with no href, out of the tab order and
   * `aria-disabled`. `:219` of the same document requires a deliberately
   * disabled control to say WHY on screen, and `Coming soon` on the row is
   * that sentence (`docs/COPY-STANDARD.md` — the ONE word for a planned door,
   * never `TBD`, never `Not available`, never a grey word with nothing beside
   * it).
   *
   * It carries no count either, not even zero: a number would claim work
   * exists on a page that does not.
   *
   * The 43px indent aligns a page word under its module word — 14px padding +
   * an 18px icon + the 11px gap the parent row already uses.
   */
  function renderChild(
    group: PortalNavGroup,
    parent: PortalNavItem,
    child: PortalNavChild,
  ) {
    const rule = child.dividerAbove ? (
      <div key={`${child.key}-rule`} className="mx-3.5 my-1 border-t border-base-100" />
    ) : null;

    const row = "relative w-full text-left pl-[43px] pr-3.5 py-[7px] rounded text-meta flex items-center gap-2";

    if (child.soon) {
      // `Coming soon` sits on its OWN line, under the name. Measured on the
      // production stylesheet (2026-08-19, 1440×900 and 1920): beside the 71px
      // tag a name gets 71px of the row's 150px and every one of the seven
      // unbuilt names needs 78–128px — all truncate, and the three Consignment
      // entries truncate to the same string. The map exists so staff learn the
      // NAMES; the name owns the line, the reason sits under it at the same
      // indent, and every word is still on the row (`03-page-patterns.md:219`).
      return (
        <div key={child.key}>
          {rule}
          <span
            data-testid={`nav-child-${child.key}`}
            data-soon="1"
            aria-disabled="true"
            tabIndex={-1}
            className="relative w-full text-left pl-[43px] pr-3.5 py-[7px] rounded text-meta flex flex-col items-start text-base-400 font-medium cursor-default select-none"
          >
            <span className="w-full truncate">{child.label}</span>
            <span className="text-label text-base-400">Coming soon</span>
          </span>
        </div>
      );
    }

    const active = isChildActive(group, child);
    return (
      <div key={child.key}>
        {rule}
        <Link
          to={navItemHref(group, child)}
          onClick={() => fireMarkSeen(child.badge)}
          data-testid={`nav-child-${child.key}`}
          ref={active ? (activeRowRef as Ref<HTMLAnchorElement>) : undefined}
          className={
            active
              ? `${row} bg-kit-blue-3 text-base-900 font-semibold`
              : `${row} text-base-600 font-medium hover:bg-hovertint`
          }
        >
          {active && (
            <span
              className="absolute left-0 top-[6px] bottom-[6px] bg-kit-blue-9 rounded-r-sm"
              style={{ width: 3 }}
            />
          )}
          <span className="flex-1 truncate">{child.label}</span>
          {child.badge && (
            <NavBadge
              count={badgeCount[child.badge] ?? 0}
              label={`${parent.label} ${child.label}`}
            />
          )}
        </Link>
      </div>
    );
  }

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
  const homeHref = groups[0] ? areaDefaultHref(groups[0]) : "/";
  const activeGroup = groups.find((g) => g.area === activeArea) ?? groups[0];

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
          ? // Icon rail — the active area's items only (collapse = more room,
            // not area-switching; expand to jump areas).
            (activeGroup ? orderedItems(activeGroup, role) : []).map((item) => {
              const active = isItemActive(activeGroup, item);
              const dot =
                (item.badge && (badgeCount[item.badge] ?? 0) > 0) ||
                (item.pendingPill && pendingCount > 0);
              return (
                <Link
                  key={item.key}
                  to={navItemHref(activeGroup, item)}
                  onClick={() => fireMarkSeen(item.badge)}
                  title={item.label}
                  className={`relative w-full px-0 py-[9px] rounded flex items-center justify-center ${
                    active ? "bg-kit-blue-3" : "hover:bg-hovertint"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-[7px] bottom-[7px] bg-kit-blue-9 rounded-r-sm"
                      style={{ width: 3 }}
                    />
                  )}
                  <item.icon
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
                      {orderedItems(group, role).map((item, index, items) => {
                        const active = isItemActive(group, item);
                        const baseCls =
                          "relative w-full text-left px-3.5 py-[9px] rounded text-body flex items-center gap-[11px]";
                        const cls = active
                          ? `${baseCls} bg-kit-blue-3 text-base-900 font-semibold`
                          : `${baseCls} text-base-600 font-medium hover:bg-hovertint`;
                        const startsSection = item.section && item.section !== items[index - 1]?.section;
                        const children =
                          item.children && group.area === activeArea && active
                            ? visibleChildren(item, { canEditPurchasingSettings })
                            : [];
                        return (
                          <Fragment key={item.key}>
                          {startsSection && (
                            <div className="px-3.5 pb-1 pt-3 text-label font-semibold uppercase tracking-[0.14em] text-base-500">
                              {item.section}
                            </div>
                          )}
                          <div>
                            <Link
                              to={navItemHref(group, item)}
                              onClick={() => fireMarkSeen(item.badge)}
                              className={cls}
                              ref={
                                active && children.length === 0
                                  ? (activeRowRef as Ref<HTMLAnchorElement>)
                                  : undefined
                              }
                            >
                              {active && (
                                <span
                                  className="absolute left-0 top-[7px] bottom-[7px] bg-kit-blue-9 rounded-r-sm"
                                  style={{ width: 3 }}
                                />
                              )}
                              <item.icon
                                size={18}
                                strokeWidth={2}
                                className={`shrink-0 ${
                                  active ? "text-kit-blue-9" : "text-base-400"
                                }`}
                              />
                              <span className="flex-1">{item.label}</span>
                              {item.badge && (
                                <NavBadge
                                  count={badgeCount[item.badge] ?? 0}
                                  label={item.label}
                                />
                              )}
                              {item.pendingPill && pendingCount > 0 && (
                                <span
                                  className="font-mono bg-primary text-primary-foreground rounded-full px-[7px] py-px text-label font-semibold text-center"
                                  style={{ minWidth: 16 }}
                                >
                                  {pendingCount}
                                </span>
                              )}
                            </Link>

                            {children.length > 0 && (
                              <div
                                data-testid={`nav-children-${item.key}`}
                                className="flex flex-col gap-0.5 mt-0.5 mb-1"
                              >
                                {children.map((child) =>
                                  renderChild(group, item, child),
                                )}
                              </div>
                            )}
                          </div>
                          </Fragment>
                        );
                      })}
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
