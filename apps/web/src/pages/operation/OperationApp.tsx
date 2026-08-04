import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
// Unified Internal Portal (2026-06-30) — the three private rails (Operation /
// Principal / Finance) merged into ONE role-aware PortalSidebar.
import PortalSidebar from "@/pages/portal/PortalSidebar";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import OperationDashboard from "./OperationDashboard";
// Jess redesign step 2 (2026-06-08) — the Orders tab is now the unified control
// table (merges the old kanban + Inbox + All-orders). The legacy kanban
// `OperationOrders` is retained as a file (+ its test) but no longer routed.
import OperationOrdersControl from "./OperationOrdersControl";
// T11 (2026-07-27) — the Delivery module: the ONE new sidebar item in the
// build plan. Tab-state driven like Payments / Stock (only orders and
// procurement are path-driven), so `?tab=delivery` deep-links it.
import OperationDelivery from "./OperationDelivery";
import OperationPayments from "./OperationPayments";
import OperationRental from "./OperationRental";
// Purchase / Procurement MRP cockpit — the "what to buy today" guided worklist.
import OperationToOrder from "./OperationToOrder";
import OperationWarehouse from "./OperationWarehouse";
import OperationMovements from "./OperationMovements";
import TabbedProcurementShell from "./procurement/TabbedProcurementShell";
import OperationPurchaseOrders from "./OperationPurchaseOrders";
// P3 (Jess redesign Q3a=B) — GRN receiving station, split out from the
// Purchase Order (procurement) menu.
import OperationReceiving from "./OperationReceiving";
// R2 (0288) — the supplier-claim queue, fourth tab of the Purchasing module.
import OperationSupplierClaims from "./OperationSupplierClaims";
import OperationPurchasingSettings from "./OperationPurchasingSettings";
// Q3 (Loo, 2026-08-04) — Purchasing → Report: the "look at the numbers" layer.
import OperationPurchasingReport from "./OperationPurchasingReport";
// 0226 — the operation-facing COSTING catalog (SKU Master / Modular / Fabric).
import OperationCatalogPage from "@/pages/catalog/OperationCatalogPage";
import { CATALOG_TAB_PARAM } from "@/pages/catalog/catalog-tabs";
// 0174 — Sales Order Maintenance (AutoCount-style configurable SO grid).
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
// K2 (0287) — Ready stock, the middle Stock tab K0 reserved.
import OperationStockPlan from "./OperationStockPlan";
// Migration 0140 — Service Notes / Issue Tracker.
import OperationServiceCases from "./OperationServiceCases";
import OperationGuarantees from "./OperationGuarantees";
// Gmail-style right rail — Calendar (deliveries/day) · Keep notes · Tasks board.
import OperationRightRail from "./components/OperationRightRail";
import GlobalTopBar from "./components/GlobalTopBar";
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
  // Presence heartbeat (0235, Jess: opens portal = came to work = available
  // for auto-assign; MC/no-show = never stamped = skipped). Stamps the
  // caller's OWN app_users.last_seen_at on mount + every 15 min; fails soft
  // on a Worker that predates the route.
  useEffect(() => {
    const beat = () => {
      void apiFetch("/api/operation/staff/heartbeat", { method: "POST" }).catch(
        () => {},
      );
    };
    beat();
    const t = setInterval(beat, 15 * 60_000);
    return () => clearInterval(t);
  }, []);
  // Catalog split (Loo 2026-07-25) — the selling Product & Maintenance moved
  // to the Admin area (/principal?tab=catalog); Operations keeps only the
  // costing Operation Catalog (0226). A stale `?tab=catalog` deep link here
  // forwards a principal to the Admin door; operation stays on costing.
  const role = useAuth((s) => s.role);

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
  // Sidebar collapse moved into PortalSidebar (Unified Internal Portal,
  // 2026-06-30) — it self-owns the collapsed state + localStorage so every area
  // (Operations / Finance / Admin) collapses consistently. The grid column is
  // now `auto`, tracking the rail's intrinsic width.
  const [movementsPrefill, setMovementsPrefill] = useState<
    Partial<MovementsFilters> | undefined
  >(undefined);
  // Cross-tab prefill for the warehouse slot — currently just the alert filter
  // intent seeded by the dashboard StockAlertsTile. Mirrors `movementsPrefill`.
  const [warehousePrefill, setWarehousePrefill] = useState<
    { alert?: boolean } | undefined
  >(undefined);

  // Unified Internal Portal — the merged PortalSidebar links to
  // `/operation?tab=<key>`, so cross-area deep links (e.g. principal jumping in
  // from the Finance area) and within-area clicks both arrive as a `?tab=`
  // change. Sync it into the local tab state. Procurement / Orders stay
  // path-driven (`/operation/procurement|orders`, no `?tab=`), so this is a
  // no-op while inside them. In-page callbacks (goWarehouse / goMovements /
  // dashboard tiles) still drive `tab` directly and don't touch the URL, so a
  // stale `?tab=` never overrides them (the effect only refires when the param
  // actually changes).
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  // Rides along on the stale-catalog-link forward so a deep-linked tab
  // (`?section=promo`) survives the hop to the Admin door.
  const catalogSection = searchParams.get(CATALOG_TAB_PARAM);
  useEffect(() => {
    if (!urlTab || isProcurementUrl || isOrdersUrl) return;
    setMovementsPrefill((p) => (urlTab === "movements" ? p : undefined));
    setWarehousePrefill((p) => (urlTab === "warehouse" ? p : undefined));
    setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab, isProcurementUrl, isOrdersUrl]);

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

  return (
    <div
      className="h-screen text-base-900 grid"
      style={{
        // PortalSidebar owns its own collapse state + intrinsic width (232px
        // expanded ⇄ icon rail collapsed), so the grid column just follows it.
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
      }}
    >
      <PortalSidebar />
      <main className="min-w-0 bg-base-50 flex flex-col overflow-hidden">
        {/* Site-wide utility bar (Alerts · Help · Settings) — pinned above the
            routed page on every operation screen. The Orders list is the ONE
            exception: its own white header surface embeds <TopBarIcons />, so
            the slim bar would duplicate them there. */}
        {/* Hide the slim top bar on pages that render TopBarIcons in their own
            header surface (Orders list) or that sit under a module tab bar with
            its own right cluster (Purchasing: To Order / Purchase Orders /
            Receiving — Jess 2026-07-22, Q9 Option B — one clean top row, not
            two, so the module tab bar is the only chrome). */}
        {!isOrdersUrl &&
          !isProcurementUrl &&
          tab !== "purchase" &&
          tab !== "receiving" &&
          tab !== "claims" &&
          tab !== "purchasing-report" &&
          tab !== "purchasing-settings" && <GlobalTopBar />}
        <div className="flex-1 min-h-0 overflow-auto">
        {isUrlDriven ? (
          // Nested route table for the URL-driven sections.
          //
          // Procurement — the BARE path (`/operation/procurement`) mounts the
          // Purchase Execution Workspace (Jess's 2026-08-01 architecture
          // freeze). The slugged paths keep the legacy per-supplier shell so
          // every existing `?po=` deep link from To Order still opens the
          // document it names.
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
            <Route path="procurement" element={<OperationPurchaseOrders />} />
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
            {/* R2 — the supplier-claim queue: what receiving found wrong, and
                what an unkept ETA turned into. Fourth Purchasing tab, no new
                sidebar entry. */}
            {tab === "claims" && <OperationSupplierClaims />}
            {/* P1 — Purchasing → Settings: the numbers the ordering engine
                reads. Manager-only; the tab is hidden for everyone else and
                the RPCs refuse the write regardless. */}
            {tab === "purchasing-settings" && <OperationPurchasingSettings />}
            {/* Q3 — Purchasing → Report. Read-only, stores nothing, computes
                at read time; every figure is a door back to the purchase
                orders it counted. */}
            {tab === "purchasing-report" && <OperationPurchasingReport />}
            {/* T11 — Delivery: the 3-pane module (queues · calendar · detail).
                Read-only by design; every write stays behind the order drawer. */}
            {tab === "delivery" && <OperationDelivery />}
            {/* 0165 — Payments / collection (Master Sheet Balance tab) */}
            {tab === "payments" && <OperationPayments />}
            {/* 0247-0249 — Rental base: agreements + deployed-unit registry */}
            {tab === "rental" && <OperationRental />}
            {/* Purchasing → To Order — the Planning Workspace, rebuilt from
                the Golden Template 2026-07-31 (docs/03-page-patterns.md). */}
            {tab === "purchase" && <OperationToOrder />}
            {tab === "catalog" &&
              (role === "principal" ? (
                <Navigate
                  to={`/principal?tab=catalog${
                    catalogSection
                      ? `&${CATALOG_TAB_PARAM}=${encodeURIComponent(catalogSection)}`
                      : ""
                  }`}
                  replace
                />
              ) : (
                <OperationCatalogPage />
              ))}
            {tab === "op-catalog" && <OperationCatalogPage />}
            {/* Jess redesign step 3 — unified per-unit Stock On Hand list. */}
            {tab === "stock-onhand" && <OperationStockOnHand />}
            {/* K2 — Ready stock: the monthly propose → approve plan. */}
            {tab === "stock-plan" && <OperationStockPlan />}
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
            {tab === "service-notes" && <OperationServiceCases />}
            {/* 0261-0263 — the guarantee claim / track-back desk */}
            {tab === "guarantees" && <OperationGuarantees />}
          </>
        )}
        </div>
      </main>
      <OperationRightRail />
    </div>
  );
}
