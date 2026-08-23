import { Navigate, NavLink, useParams } from "react-router-dom";
import { PROCUREMENT_TAB_SLUGS, type ProcurementTabSlug } from "@carres/shared";
import PurchasingTabs from "../PurchasingTabs";
import OhanaBedFrameTab from "./OhanaBedFrameTab";
import OhanaSofaTab from "./OhanaSofaTab";
import NiceFutureMattressTab from "./NiceFutureMattressTab";

/**
 * TabbedProcurementShell — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Per-supplier kanban shell wrapping the three procurement channel tabs:
 *   • Nice Future Mattress (`nice-future`)
 *   • Ohana Sofa          (`hookka-sofa`)
 *   • Ohana Bed Frame     (`hookka-bedframe`)
 *
 * The active tab is decided by the URL `:slug` param. Invalid slugs redirect
 * to the first tab so the user never sees a 404 from a typo or stale link.
 * No slug at all → the same redirect (T35 wires the route table; until then
 * the redirect target acts as the default landing).
 *
 * Why URL-based instead of useState:
 *   - Direct URL access to `/operation/procurement/hookka-sofa` works on
 *     refresh/share/back/forward (acceptance criterion in plan §F).
 *   - The other operation tabs (dashboard / orders / warehouse / movements)
 *     still use the parent `OperationApp` `useState` pattern; only the
 *     procurement tab sub-shell goes URL-driven for v3 spec §4.1's tab
 *     deep-linking requirement. T35 mounts this shell on the `/operation`
 *     side of the parent App router.
 *
 * Layout: top tab strip + active tab body. The tab strip sticks to the same
 * cream/warm aesthetic as `operationProcurement.tsx` (per CLAUDE.md §10) so
 * users don't notice a styling jump when this replaces the legacy page.
 */
const TAB_LABELS: Record<ProcurementTabSlug, string> = {
  "nice-future": "Nice Future Mattress",
  "hookka-sofa": "Ohana Sofa",
  "hookka-bedframe": "Ohana Bed Frame",
};

const TAB_COMPONENTS: Record<ProcurementTabSlug, () => JSX.Element> = {
  "nice-future": NiceFutureMattressTab,
  "hookka-sofa": OhanaSofaTab,
  "hookka-bedframe": OhanaBedFrameTab,
};

const DEFAULT_SLUG: ProcurementTabSlug = "nice-future";

function isValidSlug(slug: string | undefined): slug is ProcurementTabSlug {
  return (
    typeof slug === "string" &&
    (PROCUREMENT_TAB_SLUGS as readonly string[]).includes(slug)
  );
}

/**
 * ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
 *
 * This shell used to be a Purchase Order CREATION surface: a `+ New PO` button
 * (T42-C2) mounting `CreatePOModal`, plus a `location.state.prefill` inbox that
 * let `OrderDetailDrawer` push an order's shortages straight into that modal.
 * Both are gone, and `CreatePOModal` is deleted with them.
 *
 * `purchasing_issue_pos_batch(jsonb)` is the only authority that may create a
 * Purchase Order, and it is reached only through the governed operator
 * journeys — SO Batch Purchase and Manual Purchase (corrected 2026-08-23; this
 * comment used to say Batch Purchase was the single door). This page keeps
 * every one of its EXISTING-document responsibilities — the three channel tabs
 * and everything inside them — and creates nothing.
 *
 * The prefill inbox is deliberately NOT replaced with a Batch Purchase deep
 * link: Card 4B forbids substituting another PO creation shortcut.
 */
export default function TabbedProcurementShell() {
  const params = useParams<{ slug?: string }>();
  const rawSlug = params.slug;

  // Invalid or missing slug → redirect to the default tab. `replace` keeps
  // history clean (a typo doesn't pollute the back stack).
  if (!isValidSlug(rawSlug)) {
    return (
      <Navigate
        to={`/operation/procurement/${DEFAULT_SLUG}`}
        replace
        data-testid="procurement-tab-redirect"
      />
    );
  }

  const ActiveTab = TAB_COMPONENTS[rawSlug];

  return (
    /* h-full flex column: the two header rows stay put, only the tab body
       scrolls — the page itself never scrolls (Shell pattern, Loo
       2026-08-02). The kicker + <h1> + description that used to sit here
       repeated the word already lit in the tab bar and cost ~110px of
       height; deleted per §8.3 / UI_KIT_MASTER §11. */
    <div
      className="h-full min-h-0 flex flex-col"
      data-testid="tabbed-procurement-shell"
    >
      {/* The module header — the shell's ONE 44px row (tabs + global icons).
          This page draws no header of its own. */}
      <PurchasingTabs />

      {/* Channel tab strip. Card 4B removed the "+ New PO" button that used to
          sit at the right of this row; the strip is now navigation only. */}
      <div
        className="shrink-0 px-9 border-b border-base-200 bg-white flex items-center gap-4"
        role="tablist"
        aria-label="Procurement channel"
        data-testid="procurement-tab-strip"
      >
        <div className="flex gap-1">
          {PROCUREMENT_TAB_SLUGS.map((slug) => (
            <NavLink
              key={slug}
              to={`/operation/procurement/${slug}`}
              role="tab"
              aria-selected={slug === rawSlug}
              data-testid={`procurement-tab-link-${slug}`}
              className={({ isActive }) =>
                [
                  "relative px-4 py-3 text-body font-body transition-colors whitespace-nowrap",
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

      {/* Active tab body — the ONLY scroll area. Child mounts on slug change
          so each tab's TanStack query runs against its own slug-keyed cache. */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-14">
        <ActiveTab />
      </div>
    </div>
  );
}
