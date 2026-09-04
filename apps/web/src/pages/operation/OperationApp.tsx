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
// ⭐ SALES ORDER PRODUCTION CUTOVER (owner ruling, 2026-08-10 —
// `docs/SALES-ORDER-CUTOVER.md`). The two Orders pages now live at TWO
// SEPARATE ROUTES, and the swap-one-identifier trick that Stage 1 used is
// retired with it:
//
//   /operation/orders      →  SalesOrdersRegister    the OFFICIAL Sales Orders
//   /operation/old-orders  →  OperationOrdersControl the TEMPORARY door
//
// The old page is NOT deleted and NOT hidden — the cutover is a strangler
// migration, and it still carries the only Delivery / Payment / Purchasing
// work there is, plus the AutoCount import. `onImport` therefore stays wired
// on the OLD route (it flips to the import tab) and is gone from the new one:
// a register has no actions.
//
// ROLLBACK is no longer an identifier swap. It is the deployment rollback
// named in the cutover card — revert + redeploy the previous Pages build.
import OperationOrdersControl from "./OperationOrdersControl";
import SalesOrdersRegister from "./SalesOrdersRegister";
import DeliveryOrderPage from "./DeliveryOrderPage";
import SalesOrderWorkspace from "./SalesOrderWorkspace";
import SettingsWorkspace from "./SettingsWorkspace";
// T11 (2026-07-27) — the Delivery module: the ONE new sidebar item in the
// build plan. Tab-state driven like Payments / Stock (only orders and
// procurement are path-driven), so `?tab=delivery` deep-links it.
import OperationDelivery from "./OperationDelivery";
import EditDelivery from "./EditDelivery";
import OperationPayments from "./OperationPayments";
import OperationWork from "./OperationWork";
import OperationRental from "./OperationRental";
// Purchase / Procurement MRP cockpit — the "what to buy today" guided worklist.
import OperationToOrder from "./OperationToOrder";
import OperationManualPurchase from "./OperationManualPurchase";
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
import OperationSupplierItems from "./OperationSupplierItems";
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
import WarehouseStockRegister from "./WarehouseStockRegister";
import WarehouseWorkspace from "./WarehouseWorkspace";
import WarehouseUnitDetail from "./WarehouseUnitDetail";
// K2 (0287) — Ready stock, the middle Stock tab K0 reserved.
import OperationStockPlan from "./OperationStockPlan";
// Migration 0140 — Service Notes / Issue Tracker.
import OperationServiceCases from "./OperationServiceCases";
import OperationIssueTracker from "./OperationIssueTracker";
import IssueRelatedPartyReport from "./IssueRelatedPartyReport";
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
  const isToOrderUrl = location.pathname === "/operation/to-order";
  const isOrdersUrl = location.pathname.startsWith("/operation/orders");
  // Stage A: only the REFERENCE DESTINATION gives scroll ownership to its
  // grid. The Sales Order Workspace keeps its existing page-owned layout.
  const isSalesOrdersRegisterUrl =
    isOrdersUrl && !location.pathname.startsWith("/operation/orders/so/");
  // The cutover's temporary door. Deliberately NOT a `/operation/orders/…`
  // sub-path: `startsWith` would then light BOTH sidebar items at once, and a
  // door that shares the new register's prefix reads as part of it.
  const isOldOrdersUrl = location.pathname.startsWith("/operation/old-orders");
  // The Delivery Orders register + DO object page (blueprint card 2026-08-16).
  // Its own prefix, NOT `/operation/orders/…`, for the same sidebar-lighting
  // reason as old-orders above.
  const isDeliveryOrdersUrl = location.pathname.startsWith(
    "/operation/delivery-orders",
  );
  // Only the REGISTER hands scroll ownership to its grid; the DO object page
  // scrolls like a normal page.
  const isDeliveryOrdersRegisterUrl =
    location.pathname === "/operation/delivery-orders";
  /* EDIT DELIVERY (2026-08-24) draws its own 50px Destination Header, so the
     slim global bar must stand down — the SAME rule Delivery Work needed and
     Manual Purchase needed before it. A page that draws a header joins this
     list in the PR that gives it one. */
  const isEditDeliveryUrl = location.pathname.startsWith("/operation/delivery/edit");
  /* The one Settings Workspace is its own route, not a module tab — the
     Page Header gear is the ERP's single Settings entry (ui/MASTER.md). */
  const isSettingsUrl = location.pathname.startsWith("/operation/settings");
  const isIssuesUrl = location.pathname.startsWith("/operation/issues");
  /* 【WAREHOUSE】 CARD 02 — one exact Unit, addressed by its permanent Carres
     Unit ID. The Route shipped 2026-08-21 and never joined this gate, so the
     URL fell through to the `?tab=` branch and rendered the DASHBOARD over a
     real Unit address — the exact defect the Edit Delivery note below names:
     a new route joins BOTH lists in the same commit. Measured live 2026-09-03
     on /operation/stock/unit/id-aam135002 before the fix. */
  const isStockUnitUrl = location.pathname.startsWith("/operation/stock/unit");
  const isUrlDriven =
    isProcurementUrl || isToOrderUrl || isOrdersUrl || isOldOrdersUrl ||
    /* Edit Delivery (2026-08-24) is a real route. Its flag joined the
       GlobalTopBar suppression on day one but NOT this gate, so the URL fell
       through to the `?tab=` branch and rendered an empty main pane — found on
       the production walk, invisible to a component test that never mounts the
       router. A new route joins BOTH lists in the same commit. */
    isEditDeliveryUrl ||
    isDeliveryOrdersUrl || isSettingsUrl || isIssuesUrl || isStockUnitUrl;

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
    if (
      !urlTab
      || isProcurementUrl
      || isToOrderUrl
      || isOrdersUrl
      || isOldOrdersUrl
      || isDeliveryOrdersUrl
      || isSettingsUrl
      || isIssuesUrl
    )
      return;
    setMovementsPrefill((p) => (urlTab === "movements" ? p : undefined));
    setWarehousePrefill((p) => (urlTab === "warehouse" ? p : undefined));
    setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab, isProcurementUrl, isToOrderUrl, isOrdersUrl, isOldOrdersUrl, isDeliveryOrdersUrl, isSettingsUrl, isIssuesUrl]);

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
          !isDeliveryOrdersUrl &&
          !isEditDeliveryUrl &&
          !isOldOrdersUrl &&
          !isProcurementUrl &&
          !isToOrderUrl &&
          /* CARD-2026-08-22-purchasing-02 — SO Batch Purchase draws the
             Purchasing Destination Header itself, so the slim global bar would
             be a second top row. */
          tab !== "purchase" &&
          /* CARD-2026-08-21-delivery-02 — the SAME defect Manual Purchase
             shipped with, caught on the production walk: Delivery Work draws
             its own 50px Destination Header (which embeds TopBarIcons), so the
             slim bar put a second Jump to, a second bell reading 59, a second
             Help and a second gear on one screen. `Delivery Orders` never had
             it because it is a real route and is suppressed above. */
          tab !== "delivery" &&
          tab !== "manual-purchase" &&
          tab !== "receiving" &&
          tab !== "claims" &&
          tab !== "purchasing-report" &&
          tab !== "purchasing-settings" &&
          /* 【WAREHOUSE】 CARD 02 — the Inventory Register, the two
             de-navigated legacy Stock pages and Unit Detail all draw their own
             50px Destination Header (ModuleHeader embeds TopBarIcons), so the
             slim bar was a second Jump to, a second bell, a second gear on one
             screen — the same defect Manual Purchase and Delivery Work each
             shipped with, measured live on the CARD 01 walk. */
          tab !== "stock-onhand" &&
          tab !== "stock-plan" &&
          tab !== "movements" &&
          /* 【WAREHOUSE】 CARD 03 — Dashboard and Outbound draw their own
             Destination Header; the slim bar would be a second top row. */
          tab !== "warehouse-dashboard" &&
          tab !== "warehouse-outbound" &&
          !isStockUnitUrl && <GlobalTopBar />}
        <div
          className={`flex-1 min-h-0 ${
            isSalesOrdersRegisterUrl || isDeliveryOrdersRegisterUrl
              ? "overflow-hidden"
              : "overflow-auto"
          }`}
          data-testid={isSalesOrdersRegisterUrl ? "sales-orders-work-surface" : undefined}
        >
        {isUrlDriven ? (
          // Nested route table for the URL-driven sections.
          //
          // Procurement — the BARE path (`/operation/procurement`) mounts the
          // Purchase Execution Workspace (Jess's 2026-08-01 architecture
          // freeze). The slugged paths keep the legacy per-supplier shell so
          // every existing `?po=` deep link from To Order still opens the
          // document it names.
          //
          // Orders — TWO doors since the production cutover (2026-08-10):
          // `/operation/orders[/:stage]` is the new Sales Order register and
          // `/operation/old-orders[/:stage]` is the temporary old control
          // table. The optional `:stage` on the old door preselects the
          // matching status tab so hand-typed kanban-stage URLs still land
          // sensibly; unknown slugs fall back to the "All" tab
          // (tabFromStageParam guard inside the component). The "+ Import"
          // header button calls back into `changeTab("ops-import")` to flip to
          // the AutoCount import page.
          //
          // Paths are RELATIVE because this is a descendant `<Routes>`
          // mounted inside App.tsx's `<Route path="/operation/*">`. React
          // Router 7 matches descendant route paths relative to the parent's
          // matched portion. Absolute paths (`/operation/orders`) silently
          // fail to match here even though the URL string is identical — the
          // result is the main area renders nothing while the URL stays put.
          <Routes>
            {/* Card 1 — the Sales Order entrance is an alias onto the SAME
                Batch Purchase component. Query params (`?so=` plus its rail
                filters) remain component-owned; no second mode or engine. */}
            <Route path="to-order" element={<OperationToOrder />} />
            <Route path="procurement" element={<OperationPurchaseOrders />} />
            <Route
              path="procurement/:slug"
              element={<TabbedProcurementShell />}
            />
            <Route path="orders" element={<SalesOrdersRegister />} />
            {/* The Delivery Orders register + the DO object page (blueprint
                card 2026-08-16). `:doId` accepts the row id or the document
                number itself, so `DO-…` anywhere in the portal is a door. */}
            <Route
              path="delivery-orders"
              element={<Navigate to="/operation?tab=delivery" replace />}
            />
            <Route path="delivery-orders/:doId" element={<DeliveryOrderPage />} />
            {/* One exact Unit, addressed by its PERMANENT Carres Unit ID —
                the thing printed on the supplier label and the thing 0366
                promised never changes and is never reused. */}
            <Route path="stock/unit/:unitCode" element={<WarehouseUnitDetail />} />
            {/* STAGE 1 — the workspace route the register's rows open.
                STAGE 2 — `so/new` is the office birth door ([+ New Sales
                Order]); static `new` outranks `:orderId`. Declared before
                `orders/:stage` in source for the reader; React Router ranks
                them higher anyway. */}
            {/* The one Settings Workspace. Reached only from the Page Header
                gear's launcher — never a tab, nav item or Work Toolbar action. */}
            <Route path="settings/*" element={<SettingsWorkspace />} />
            {/* EDIT DELIVERY (owner ruling 2026-08-24) — Delivery's own
                full-screen surface, and where a Delivery Work row now opens.
                `?leg=` names the Journey leg; absent means the whole-order
                scope. It is a REAL route, so the shell suppresses its slim top
                bar the same way it does for every other page that draws its own
                Destination Header. */}
            <Route path="delivery/edit/:orderId" element={<EditDelivery />} />
            <Route path="issues" element={<OperationIssueTracker />} />
            <Route path="issues/reports" element={<IssueRelatedPartyReport />} />
            <Route path="orders/so/new" element={<SalesOrderWorkspace />} />
            <Route path="orders/so/:orderId" element={<SalesOrderWorkspace />} />
            <Route path="orders/:stage" element={<SalesOrdersRegister />} />
            {/* ⭐ THE TEMPORARY DOOR — the old control table, on its own route.
                `:stage` is carried across unchanged so every hand-typed kanban
                slug the old page still understands keeps landing on the same
                tab; the page reads it from `useParams<{ stage }>()` and an
                unknown slug already falls back to "All". */}
            <Route
              path="old-orders"
              element={
                <OperationOrdersControl onImport={() => changeTab("ops-import")} />
              }
            />
            <Route
              path="old-orders/:stage"
              element={
                <OperationOrdersControl onImport={() => changeTab("ops-import")} />
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
            {/* SO V2 CARD 10 — My Work / Team Work: two filters over the ONE
                open work set (Card 9's engine). The page writes nothing; a
                row opens the Sales Order Workspace. */}
            {tab === "work" && <OperationWork />}
            {/* 0165 — Payments / collection (Master Sheet Balance tab) */}
            {tab === "payments" && <OperationPayments />}
            {/* 0247-0249 — Rental base: agreements + deployed-unit registry */}
            {tab === "rental" && <OperationRental />}
            {/* Purchasing → SO Batch Purchase — the buying Register and the
                guided PO issue journey (CARD-2026-08-22-purchasing-02). */}
            {tab === "purchase" && <OperationToOrder />}
            {/* CARD-2026-08-22-purchasing-02 — `Purchase Demands` was never a
                destination. `purchase_demand` is hidden canonical truth
                (`docs/purchasing/MASTER.md` §4), and its useful capability —
                the six states, the blockers, the coverage arithmetic — now
                lives inside SO Batch Purchase. The old address REDIRECTS
                rather than 404s: a bookmark an operator saved must land
                somewhere that answers the same question. */}
            {tab === "purchase-demands" && (
              <Navigate to="/operation?tab=purchase" replace />
            )}
            {/* Purchasing → Manual Purchase — the typed request lane
                (CARD-2026-08-18-manual-purchase). */}
            {tab === "manual-purchase" && <OperationManualPurchase />}
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
            {/* CARD-2026-08-20-stock-register: the Stock Register replaces the
                On hand surface. Same `?tab=` address, new page. */}
            {tab === "stock-onhand" && <WarehouseStockRegister />}
            {/* 【WAREHOUSE】 CARD 03 — Dashboard Calendar + Outbound share ONE
                mounted workspace so Back restores the board's filters/scroll. */}
            {(tab === "warehouse-dashboard" || tab === "warehouse-outbound") && (
              <WarehouseWorkspace />
            )}
            {/* K2 — Ready stock: the monthly propose → approve plan. */}
            {tab === "stock-plan" && <OperationStockPlan />}
            {tab === "stock" && <OperationStock />}
            {tab === "all-orders" && <OperationAllOrders />}
            {tab === "suppliers" && <OperationSuppliers />}
            {/* 0375 — the supplier's own item code, joined to ours. A separate
                DESTINATION rather than a tab inside the roster: the roster is
                about parties, this is about items, and the sidebar already
                gives a module more than one page. */}
            {tab === "supplier-items" && <OperationSupplierItems />}
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
      {/* STAGE 2 MODULE SHELL (owner, 2026-08-09) — the rail is RESTORED on
          the Sales Orders routes, same as every other operation page. This
          supersedes SO-1's "rail not mounted" ruling — later owner statement
          wins (BUILD-QUEUE governance). */}
      <OperationRightRail />
    </div>
  );
}
