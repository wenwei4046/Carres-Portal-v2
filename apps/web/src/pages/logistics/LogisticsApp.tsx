import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import LogisticsSidebar from "./LogisticsSidebar";
import LogisticsDashboard from "./LogisticsDashboard";
import LogisticsOrders from "./LogisticsOrders";
import LogisticsWarehouse from "./LogisticsWarehouse";
import LogisticsMovements from "./LogisticsMovements";
import TabbedProcurementShell from "./procurement/TabbedProcurementShell";
import type { MovementsFilters } from "@/lib/queries";

/**
 * Logistics shell — sidebar + main routing area. Mirrors the Phase 3 PrincipalApp
 * tab-state pattern (`React.useState("dashboard")`) for most tabs so the proto's
 * pixel layout (`reference/proto/logistics-*.jsx`) transfers one-to-one without
 * router config drift.
 *
 * Procurement is the exception (Phase 4.5 Chunk 2 Sprint F Task 35): per spec
 * §4.1 the per-supplier tabs (`nice-future` / `hookka-sofa` / `hookka-bedframe`)
 * each get their own URL via React Router 7 nested routes, so refresh/share/
 * back/forward all preserve the active channel. Inside this shell the
 * procurement slot mounts `<TabbedProcurementShell />` via nested `<Routes>`,
 * and `useLocation` keeps the sidebar's "procurement" highlight in sync with
 * the URL pathname (without forcing the rest of the app to URL-driven nav).
 *
 * Cross-tab prefill (M5.5): LogisticsWarehouse → LogisticsMovements carries
 * `{ sku?, warehouseId? }` through `movementsPrefill` so the user lands on
 * the movement log already filtered to the row they clicked. Mirrors the
 * proto's `movementsPrefill` state in `reference/proto/logistics.jsx` line 15.
 */
export default function LogisticsApp() {
  const location = useLocation();
  const navigate = useNavigate();

  // Detect URL-driven procurement section. Anything under `/logistics/procurement`
  // (with or without slug) flips the sidebar highlight to "procurement" without
  // mutating the tab state for the other slots. The URL is the source of truth
  // for procurement; the tab state is the source of truth for everything else.
  const isProcurementUrl = location.pathname.startsWith(
    "/logistics/procurement",
  );

  const [tab, setTab] = useState<string>("dashboard");
  const [movementsPrefill, setMovementsPrefill] = useState<
    Partial<MovementsFilters> | undefined
  >(undefined);

  // When the URL leaves the procurement section (e.g. user navigated via Back
  // to `/logistics`), make sure the local tab state has a sensible value so
  // the conditional render below picks SOMETHING. Default back to dashboard
  // unless tab state already points at a non-procurement slot.
  useEffect(() => {
    if (!isProcurementUrl && tab === "procurement") {
      setTab("dashboard");
    }
  }, [isProcurementUrl, tab]);

  function goMovements(prefill?: Partial<MovementsFilters>) {
    setMovementsPrefill(prefill);
    setTab("movements");
    // Leave the procurement URL if we were inside it — otherwise the nested
    // <Routes> below would keep showing TabbedProcurementShell.
    if (isProcurementUrl) {
      navigate("/logistics");
    }
  }

  /**
   * Single tab-change entry point used by both the sidebar and child pages
   * (LogisticsDashboard's KPI tiles + side cards still call
   * `setTab("procurement")` per the established prop contract). Procurement
   * is URL-driven now, so any "procurement" target gets translated into a
   * `navigate('/logistics/procurement')` call instead of mutating local state
   * — the missing-slug redirect inside `TabbedProcurementShell` then carries
   * the user to the default channel (`nice-future`). Every other tab keeps
   * the original useState pattern so the rest of the shell is unchanged.
   */
  function changeTab(next: string) {
    if (next === "procurement") {
      navigate("/logistics/procurement");
      // Switching to procurement also discards any pending movements prefill,
      // matching the original sidebar behaviour.
      setMovementsPrefill(undefined);
      return;
    }

    // Switching away from the movements tab via the sidebar discards any
    // pending prefill so re-entering the tab starts fresh.
    if (next !== "movements") setMovementsPrefill(undefined);
    setTab(next);
    // Leave any procurement URL behind so the nested <Routes> stops matching.
    if (isProcurementUrl) {
      navigate("/logistics");
    }
  }

  // The sidebar highlight follows the URL when we're in procurement; for every
  // other slot it follows the local tab state.
  const activeTab = isProcurementUrl ? "procurement" : tab;

  return (
    <div
      className="min-h-screen text-base-900 grid"
      style={{
        gridTemplateColumns: "232px 1fr",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <LogisticsSidebar active={activeTab} onChange={changeTab} />
      <main className="min-w-0 overflow-auto bg-base-50">
        {isProcurementUrl ? (
          // Nested route table for `/logistics/procurement[/:slug]`. Both the
          // bare and slugged paths mount the same shell — the shell internally
          // dispatches on `useParams<{ slug? }>()` and `<Navigate replace>`
          // sends invalid/missing slugs to the default tab (`nice-future`).
          <Routes>
            <Route
              path="/logistics/procurement"
              element={<TabbedProcurementShell />}
            />
            <Route
              path="/logistics/procurement/:slug"
              element={<TabbedProcurementShell />}
            />
          </Routes>
        ) : (
          <>
            {tab === "dashboard" && <LogisticsDashboard setTab={changeTab} />}
            {tab === "orders" && <LogisticsOrders />}
            {tab === "warehouse" && (
              <LogisticsWarehouse setTab={changeTab} goMovements={goMovements} />
            )}
            {tab === "movements" && (
              <LogisticsMovements
                initialFilters={movementsPrefill}
                clearInitialFilters={() => setMovementsPrefill(undefined)}
                setTab={changeTab}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
