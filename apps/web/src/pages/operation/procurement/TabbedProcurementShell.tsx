import { useEffect, useState } from "react";
import { Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { PROCUREMENT_TAB_SLUGS, type ProcurementTabSlug } from "@carres/shared";
import CreatePOModal, {
  type CreatePoPrefill,
} from "../components/CreatePOModal";
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

export default function TabbedProcurementShell() {
  const params = useParams<{ slug?: string }>();
  const rawSlug = params.slug;
  const location = useLocation();
  const navigate = useNavigate();

  // T42-C2 — restore the "+ New PO" entry point that lived on the deleted
  // operationProcurement.tsx (T36). The shell is now the only mount point for
  // the procurement section, so the create-PO button + CreatePOModal mount
  // belong here. Stockpile mode (no `so` / `soRefs` prefill) is the default;
  // the user can still tick the in-modal stockpile toggle or use the
  // "Suggest from alerts" / auto-fill buttons inside the modal.
  const [createPrefill, setCreatePrefill] = useState<CreatePoPrefill | null>(
    null,
  );

  // 2026-05-10 (Loo) — accept a CreatePOModal prefill via React Router
  // location.state. Used by OrderDetailDrawer's "+ Issue POs" navigate-to-
  // procurement flow so the order's shortages (sku + qty + attrs) feed
  // straight into the modal. Once consumed we replace the history entry to
  // strip the state — back/forward navigation must NOT reopen the modal.
  useEffect(() => {
    const state = location.state as { prefill?: CreatePoPrefill } | null;
    if (state?.prefill) {
      setCreatePrefill(state.prefill);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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

      {/* Channel tab strip — the page's toolbar row. "+ New PO" (the page's
          action) lives HERE, not in the header: header = whole-portal only. */}
      <div
        className="shrink-0 px-9 border-b border-base-200 bg-white flex items-center justify-between gap-4"
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
        <button
          type="button"
          className="btn-hero text-meta whitespace-nowrap"
          onClick={() => setCreatePrefill({})}
          data-testid="new-po-button"
        >
          + New PO
        </button>
      </div>

      {/* Active tab body — the ONLY scroll area. Child mounts on slug change
          so each tab's TanStack query runs against its own slug-keyed cache. */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-14">
        <ActiveTab />
      </div>

      {/* T42-C2 — CreatePOModal mount. Empty prefill (`{}`) opens the modal
          in its default mode: user can tick stockpile, paste lines manually,
          or hit "Suggest from alerts" / "Auto-fill from awaiting stock"
          inside the modal. Order-pinned prefill flows still flow through
          their own callers (e.g. the awaiting-stock dialog on the dashboard)
          — this is the manual-entry / stockpile entry point. */}
      {createPrefill !== null && (
        <CreatePOModal
          prefill={createPrefill}
          onClose={() => setCreatePrefill(null)}
        />
      )}
    </div>
  );
}
