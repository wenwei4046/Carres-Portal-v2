import { useMemo, useState } from "react";
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
  visibleItems,
  navItemHref,
  areaDefaultHref,
  type PortalArea,
  type PortalNavGroup,
  type PortalNavItem,
} from "./portal-nav";

const COLLAPSE_KEY = "ops-sidebar-collapsed";

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
 * Visual: the v17 Operation rail (clean cool-gray, 3px flame active bar). Badge
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

  function isItemActive(group: PortalNavGroup, item: PortalNavItem): boolean {
    if (group.area !== activeArea) return false;
    if (group.area === "finance") {
      return location.pathname === item.financePath;
    }
    if (item.path) {
      // operation path-driven section (orders / procurement)
      return location.pathname.startsWith(item.path);
    }
    // tab-driven: a path-driven section is active → no tab item is.
    const onPathSection = group.items.some(
      (it) => it.path && location.pathname.startsWith(it.path),
    );
    if (onPathSection) return false;
    const current = searchTab ?? group.defaultTab;
    return current === item.key;
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
            className="grid place-items-center w-8 h-8 rounded-md text-base-400 hover:bg-base-100 hover:text-base-700"
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
            className="shrink-0 grid place-items-center w-8 h-8 rounded-md text-base-400 hover:bg-base-100 hover:text-base-700"
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
            (activeGroup ? visibleItems(activeGroup, role) : []).map((item) => {
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
                    active ? "bg-base-100" : "hover:bg-base-50"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-[7px] bottom-[7px] bg-primary rounded-r-sm"
                      style={{ width: 3 }}
                    />
                  )}
                  <item.icon
                    size={17}
                    strokeWidth={2}
                    className={`shrink-0 ${active ? "text-primary" : "text-base-400"}`}
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
                      className={`w-full flex items-center justify-between px-3.5 pb-1.5 pt-1 text-[9px] uppercase tracking-[0.16em] font-semibold ${
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
                      {visibleItems(group, role).map((item) => {
                        const active = isItemActive(group, item);
                        const baseCls =
                          "relative w-full text-left px-3.5 py-[9px] rounded text-[13px] flex items-center gap-[11px]";
                        const cls = active
                          ? `${baseCls} bg-base-100 text-base-900 font-semibold`
                          : `${baseCls} text-base-600 font-medium hover:bg-base-50`;
                        return (
                          <Link
                            key={item.key}
                            to={navItemHref(group, item)}
                            onClick={() => fireMarkSeen(item.badge)}
                            className={cls}
                          >
                            {active && (
                              <span
                                className="absolute left-0 top-[7px] bottom-[7px] bg-primary rounded-r-sm"
                                style={{ width: 3 }}
                              />
                            )}
                            <item.icon
                              size={17}
                              strokeWidth={2}
                              className={`shrink-0 ${
                                active ? "text-primary" : "text-base-400"
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
                                className="font-mono bg-primary text-primary-foreground rounded-full px-[7px] py-px text-[10px] font-bold text-center"
                                style={{ minWidth: 16 }}
                              >
                                {pendingCount}
                              </span>
                            )}
                          </Link>
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
        className={`border-t border-base-100 flex items-center hover:bg-base-50 transition-colors ${
          collapsed
            ? "px-2 py-4 justify-center"
            : "px-[22px] py-4 gap-2.5"
        }`}
      >
        <div className="w-[34px] h-[34px] shrink-0 rounded-full bg-base-900 text-white grid place-items-center text-[11px] font-semibold">
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-base-900 truncate">
              {email}
            </div>
            <div className="text-[9.5px] text-base-500 uppercase tracking-[0.1em] mt-px">
              {roleLabel}
            </div>
          </div>
        )}
      </Link>
    </aside>
  );
}
