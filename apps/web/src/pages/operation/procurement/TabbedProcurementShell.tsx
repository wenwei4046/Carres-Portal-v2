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
    <div className="pb-14" data-testid="tabbed-procurement-shell">
      {/* Purchasing module bar — merges the three procurement rails (To Order /
          Purchase Orders / Receiving) into one module; sits above this shell's
          own per-supplier channel tabs. */}
      <PurchasingTabs />
      {/* Page header — persists across tabs so the procurement section feels
          coherent. Mirrors the kicker/title from operationProcurement.tsx.
          The "+ New PO" button lives in the header (T42-C2 restore) rather
          than per-tab so it's visible regardless of which channel the user
          is currently viewing. */}
      <div className="px-9 pt-7 pb-3 flex justify-between items-start gap-4">
        <div>
          <div className="kicker">Procurement</div>
          <h1 className="text-page font-display mt-1.5 text-base-900">
            Purchase orders
          </h1>
          <div className="font-body text-body text-base-600 mt-1 max-w-[780px]">
            Per-supplier channels for purchase orders. Each tab loads its own PO
            list (server-filtered by supplier slug + category) so the view stays
            focused on the channel the user is working on.
          </div>
        </div>
        <button
          type="button"
          className="btn-hero text-meta"
          onClick={() => setCreatePrefill({})}
          data-testid="new-po-button"
        >
          + New PO
        </button>
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
              to={`/operation/procurement/${slug}`}
              role="tab"
              aria-selected={slug === rawSlug}
              data-testid={`procurement-tab-link-${slug}`}
              className={({ isActive }) =>
                [
                  "relative px-4 py-3 text-body font-body transition-colors",
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
