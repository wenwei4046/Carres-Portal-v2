import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import OperationSidebar from "./OperationSidebar";
import OperationDashboard from "./OperationDashboard";
// Jess redesign step 2 (2026-06-08) — the Orders tab is now the unified control
// table (merges the old kanban + Inbox + All-orders). The legacy kanban
// `OperationOrders` is retained as a file (+ its test) but no longer routed.
import OperationOrdersControl from "./OperationOrdersControl";
import OperationWarehouse from "./OperationWarehouse";
import OperationMovements from "./OperationMovements";
import TabbedProcurementShell from "./procurement/TabbedProcurementShell";
// P3 (Jess redesign Q3a=B) — GRN receiving station, split out from the
// Purchase Order (procurement) menu.
import OperationReceiving from "./OperationReceiving";
import OperationCatalog from "@/pages/catalog/OperationCatalog";
// 2026-05-19 — Stock / All orders / Suppliers moved from Principal sidebar.
import OperationStock from "./OperationStock";
import OperationAllOrders from "./OperationAllOrders";
import OperationSuppliers from "./OperationSuppliers";
// 2026-05-20 — Phase A · AutoCount integration tabs.
import OperationImport from "./OperationImport";
import OperationInbox from "./OperationInbox";
// 2026-05-20 — Phase A step 5 · per-unit stock register tabs (Carres Klang).
// Jess redesign step 3 (2026-06-08): the four below are merged into the single
// OperationStockOnHand chip-filtered list. Kept mounted (de-routed from the
// sidebar) so nothing that still calls changeTab on their keys breaks.
import OperationOpsReady from "./OperationOpsReady";
import OperationOpsReserved from "./OperationOpsReserved";
import OperationOpsRepair from "./OperationOpsRepair";
import OperationOpsInventory from "./OperationOpsInventory";
import OperationStockOnHand from "./OperationStockOnHand";
// Migration 0140 — Service Notes / Issue Tracker.
import OperationServiceNotes from "./OperationServiceNotes";
import type { MovementsFilters } from "@/lib/queries";

/**
 * operation shell — sidebar + main routing area. Mirrors the Phase 3 PrincipalApp
 * tab-state pattern (`React.useState("dashboard")`) for most tabs so the proto's
 * pixel layout (`reference/proto/operation-*.jsx`) transfers one-to-one without
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
 * Cross-tab prefill (M5.5): OperationWarehouse → OperationMovements carries
 * `{ sku?, warehouseId? }` through `movementsPrefill` so the user lands on
 * the movement log already filtered to the row they clicked. Mirrors the
 * proto's `movementsPrefill` state in `reference/proto/operation.jsx` line 15.
 */
export default function OperationApp() {
  const location = useLocation();
  const navigate = useNavigate();

  // Detect URL-driven sections. Anything under `/operation/procurement` or
  // `/operation/orders` flips the sidebar highlight to that tab without
  // mutating the tab state for the other slots. The URL is the source of
  // truth for procurement + orders; the tab state owns everything else.
  //
  // 2026-05-10 — orders joined the URL-driven set as part of the pipeline
  // redesign so per-stage chip nav can route to `/operation/orders/:stage`
  // (refresh / share / back+forward all preserve the stage selection).
  const isProcurementUrl = location.pathname.startsWith(
    "/operation/procurement",
  );
  const isOrdersUrl = location.pathname.startsWith("/operation/orders");
  const isUrlDriven = isProcurementUrl || isOrdersUrl;

  const [tab, setTab] = useState<string>("dashboard");
  const [movementsPrefill, setMovementsPrefill] = useState<
    Partial<MovementsFilters> | undefined
  >(undefined);
  // Cross-tab prefill for the warehouse slot — currently just the alert filter
  // intent seeded by the dashboard StockAlertsTile. Mirrors `movementsPrefill`.
  const [warehousePrefill, setWarehousePrefill] = useState<
    { alert?: boolean } | undefined
  >(undefined);

  // When the URL leaves a URL-driven section (e.g. user navigated via Back
  // to `/operation`), make sure the local tab state has a sensible value so
  // the conditional render below picks SOMETHING. Default back to dashboard
  // unless tab state already points at a non-URL-driven slot.
  useEffect(() => {
    if (!isProcurementUrl && tab === "procurement") {
      setTab("dashboard");
    }
    if (!isOrdersUrl && tab === "orders") {
      setTab("dashboard");
    }
  }, [isProcurementUrl, isOrdersUrl, tab]);

  function goMovements(prefill?: Partial<MovementsFilters>) {
    setMovementsPrefill(prefill);
    setTab("movements");
    // Leave any URL-driven section if we were inside one — otherwise the
    // nested <Routes> below would keep showing that page.
    if (isUrlDriven) {
      navigate("/operation");
    }
  }

  // Cross-tab jump used by the dashboard StockAlertsTile → lands on the
  // warehouse tab with the alert filter pre-applied. Mirrors goMovements: seed
  // the prefill, flip the tab, leave any URL-driven section. No URL write —
  // warehouse is tab-state-driven (closes `phase-4.5-chunk-2-alerts-tab-routing`).
  function goWarehouse(prefill?: { alert?: boolean }) {
    setWarehousePrefill(prefill);
    setTab("warehouse");
    if (isUrlDriven) {
      navigate("/operation");
    }
  }

  /**
   * Single tab-change entry point used by both the sidebar and child pages
   * (OperationDashboard's KPI tiles + side cards still call
   * `setTab("procurement")` per the established prop contract). URL-driven
   * tabs (procurement, orders) get translated into a `navigate(...)` call so
   * the nested Routes below render the right shell — the missing-slug
   * redirect inside `TabbedProcurementShell` carries procurement to the
   * default channel; OperationOrders interprets a missing `:stage` as
   * the Overall layout. Every other tab keeps the original useState pattern.
   */
  function changeTab(next: string) {
    if (next === "procurement") {
      navigate("/operation/procurement");
      setMovementsPrefill(undefined);
      setWarehousePrefill(undefined);
      return;
    }
    if (next === "orders") {
      navigate("/operation/orders");
      setMovementsPrefill(undefined);
      setWarehousePrefill(undefined);
      return;
    }

    // Switching away from the movements / warehouse tabs via the sidebar
    // discards any pending prefill so re-entering the tab starts fresh — a
    // plain warehouse entry must NOT inherit a stale alert filter.
    if (next !== "movements") setMovementsPrefill(undefined);
    if (next !== "warehouse") setWarehousePrefill(undefined);
    setTab(next);
    // Leave any URL-driven section behind so the nested <Routes> stops
    // matching.
    if (isUrlDriven) {
      navigate("/operation");
    }
  }

  // The sidebar highlight follows the URL when we're in a URL-driven section;
  // for every other slot it follows the local tab state.
  const activeTab = isProcurementUrl
    ? "procurement"
    : isOrdersUrl
      ? "orders"
      : tab;

  return (
    <div
      className="min-h-screen text-base-900 grid"
      style={{
        gridTemplateColumns: "232px 1fr",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <OperationSidebar active={activeTab} onChange={changeTab} />
      <main className="min-w-0 overflow-auto bg-base-50">
        {isUrlDriven ? (
          // Nested route table for the URL-driven sections.
          //
          // Procurement (`/operation/procurement[/:slug]`) — both the bare and
          // slugged paths mount `TabbedProcurementShell`; the shell dispatches
          // internally on `useParams<{ slug? }>()` and `<Navigate replace>`
          // sends invalid/missing slugs to the default tab (`nice-future`).
          //
          // Orders (`/operation/orders[/:stage]`) — both paths mount the
          // unified `OperationOrdersControl` table (Jess redesign step 2). The
          // optional `:stage` preselects the matching status tab so legacy
          // hand-typed kanban-stage URLs still land sensibly; unknown slugs
          // fall back to the "All" tab (tabFromStageParam guard inside the
          // component). The "+ Import" header button calls back into
          // `changeTab("ops-import")` to flip to the AutoCount import page.
          //
          // Paths are RELATIVE because this is a descendant `<Routes>`
          // mounted inside App.tsx's `<Route path="/operation/*">`. React
          // Router 7 matches descendant route paths relative to the parent's
          // matched portion. Absolute paths (`/operation/orders`) silently
          // fail to match here even though the URL string is identical — the
          // result is the main area renders nothing while the URL stays put.
          <Routes>
            <Route path="procurement" element={<TabbedProcurementShell />} />
            <Route
              path="procurement/:slug"
              element={<TabbedProcurementShell />}
            />
            <Route
              path="orders"
              element={
                <OperationOrdersControl
                  onImport={() => changeTab("ops-import")}
                />
              }
            />
            <Route
              path="orders/:stage"
              element={
                <OperationOrdersControl
                  onImport={() => changeTab("ops-import")}
                />
              }
            />
          </Routes>
        ) : (
          <>
            {tab === "dashboard" && (
              <OperationDashboard setTab={changeTab} goWarehouse={goWarehouse} />
            )}
            {tab === "warehouse" && (
              <OperationWarehouse
                setTab={changeTab}
                goMovements={goMovements}
                initialAlert={warehousePrefill?.alert ?? false}
              />
            )}
            {tab === "movements" && (
              <OperationMovements
                initialFilters={movementsPrefill}
                clearInitialFilters={() => setMovementsPrefill(undefined)}
                setTab={changeTab}
              />
            )}
            {/* P3 — GRN receiving station (待收 queue). Distinct from the
                Purchase Order menu (TabbedProcurementShell at
                /operation/procurement); this is tab-state driven. */}
            {tab === "receiving" && <OperationReceiving />}
            {tab === "catalog" && <OperationCatalog />}
            {/* Jess redesign step 3 — unified per-unit Stock On Hand list. */}
            {tab === "stock-onhand" && <OperationStockOnHand />}
            {tab === "stock" && <OperationStock />}
            {tab === "all-orders" && <OperationAllOrders />}
            {tab === "suppliers" && <OperationSuppliers />}
            {/* 2026-05-20 — Phase A · AutoCount integration */}
            {tab === "ops-import" && <OperationImport />}
            {tab === "ops-inbox" && <OperationInbox />}
            {/* 2026-05-20 — Phase A step 5 · per-unit stock (Carres Klang) */}
            {tab === "ops-ready" && <OperationOpsReady />}
            {tab === "ops-reserved" && <OperationOpsReserved />}
            {tab === "ops-repair" && <OperationOpsRepair />}
            {tab === "ops-inventory" && <OperationOpsInventory />}
            {/* Migration 0140 — Service Notes / Issue Tracker */}
            {tab === "service-notes" && <OperationServiceNotes />}
          </>
        )}
      </main>
    </div>
  );
}
