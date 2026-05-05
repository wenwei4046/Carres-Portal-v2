import { Navigate, NavLink, useParams } from "react-router-dom";
import { PROCUREMENT_TAB_SLUGS, type ProcurementTabSlug } from "@carres/shared";
import HoOKkABedFrameTab from "./HoOKkABedFrameTab";
import HoOKkASofaTab from "./HoOKkASofaTab";
import NiceFutureMattressTab from "./NiceFutureMattressTab";

/**
 * TabbedProcurementShell — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Per-supplier kanban shell wrapping the three procurement channel tabs:
 *   • Nice Future Mattress (`nice-future`)
 *   • HoOKkA Sofa          (`hookka-sofa`)
 *   • HoOKkA Bed Frame     (`hookka-bedframe`)
 *
 * The active tab is decided by the URL `:slug` param. Invalid slugs redirect
 * to the first tab so the user never sees a 404 from a typo or stale link.
 * No slug at all → the same redirect (T35 wires the route table; until then
 * the redirect target acts as the default landing).
 *
 * Why URL-based instead of useState:
 *   - Direct URL access to `/logistics/procurement/hookka-sofa` works on
 *     refresh/share/back/forward (acceptance criterion in plan §F).
 *   - The other Logistics tabs (dashboard / orders / warehouse / movements)
 *     still use the parent `LogisticsApp` `useState` pattern; only the
 *     procurement tab sub-shell goes URL-driven for v3 spec §4.1's tab
 *     deep-linking requirement. T35 mounts this shell on the `/logistics`
 *     side of the parent App router.
 *
 * Layout: top tab strip + active tab body. The tab strip sticks to the same
 * cream/warm aesthetic as `LogisticsProcurement.tsx` (per CLAUDE.md §10) so
 * users don't notice a styling jump when this replaces the legacy page.
 */
const TAB_LABELS: Record<ProcurementTabSlug, string> = {
  "nice-future": "Nice Future Mattress",
  "hookka-sofa": "HoOKkA Sofa",
  "hookka-bedframe": "HoOKkA Bed Frame",
};

const TAB_COMPONENTS: Record<ProcurementTabSlug, () => JSX.Element> = {
  "nice-future": NiceFutureMattressTab,
  "hookka-sofa": HoOKkASofaTab,
  "hookka-bedframe": HoOKkABedFrameTab,
};

const DEFAULT_SLUG: ProcurementTabSlug = "nice-future";

function isValidSlug(slug: string | undefined): slug is ProcurementTabSlug {
  return (
    typeof slug === "string" &&
    (PROCUREMENT_TAB_SLUGS as readonly string[]).includes(slug)
  );
}

export default function TabbedProcurementShell() {
  const params = useParams<{ slug?: string }>();
  const rawSlug = params.slug;

  // Invalid or missing slug → redirect to the default tab. `replace` keeps
  // history clean (a typo doesn't pollute the back stack).
  if (!isValidSlug(rawSlug)) {
    return (
      <Navigate
        to={`/logistics/procurement/${DEFAULT_SLUG}`}
        replace
        data-testid="procurement-tab-redirect"
      />
    );
  }

  const ActiveTab = TAB_COMPONENTS[rawSlug];

  return (
    <div className="pb-14" data-testid="tabbed-procurement-shell">
      {/* Page header — persists across tabs so the procurement section feels
          coherent. Mirrors the kicker/title from LogisticsProcurement.tsx. */}
      <div className="px-9 pt-7 pb-3">
        <div className="kicker">Procurement</div>
        <h1 className="font-display text-[32px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-bold text-base-900">
          Purchase orders
        </h1>
        <div className="font-body text-[13px] text-base-600 mt-1 max-w-[780px]">
          Per-supplier channels for purchase orders. Each tab loads its own PO
          list (server-filtered by supplier slug + category) so the view stays
          focused on the channel the user is working on.
        </div>
      </div>

      {/* Tab strip — sticks to the warm-linen palette per CLAUDE.md §10. The
          active tab gets a stronger underline + bolder weight; inactive tabs
          read like quiet section toggles. */}
      <div
        className="px-9 border-b border-base-200"
        role="tablist"
        aria-label="Procurement channel"
        data-testid="procurement-tab-strip"
      >
        <div className="flex gap-1">
          {PROCUREMENT_TAB_SLUGS.map((slug) => (
            <NavLink
              key={slug}
              to={`/logistics/procurement/${slug}`}
              role="tab"
              aria-selected={slug === rawSlug}
              data-testid={`procurement-tab-link-${slug}`}
              className={({ isActive }) =>
                [
                  "relative px-4 py-3 text-[13px] font-body transition-colors",
                  "border-b-2 -mb-px",
                  isActive
                    ? "border-accent text-base-900 font-semibold"
                    : "border-transparent text-base-600 font-medium hover:text-base-900",
                ].join(" ")
              }
            >
              {TAB_LABELS[slug]}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Active tab body — child mounts on slug change so each tab's
          TanStack query runs against its own slug-keyed cache. */}
      <ActiveTab />
    </div>
  );
}
