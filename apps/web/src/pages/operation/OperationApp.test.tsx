import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * Regression test for the Phase 4.5 Chunk 2 procurement nested routing.
 *
 * Bug shipped + fixed 2026-05-07: `OperationApp` mounts a descendant `<Routes>`
 * inside the parent App's `<Route path="/operation/*">`. The original Sprint F
 * implementation declared the inner routes with absolute paths
 * (`/operation/procurement` and `/operation/procurement/:slug`). React Router 7
 * silently fails to match those — descendant Routes paths must be relative to
 * the parent route's matched portion. Symptom: URL flips to
 * `/operation/procurement` but the main area renders blank.
 *
 * The pre-existing `TabbedProcurementShell.test.tsx` rendered the shell as a
 * top-level Route, which doesn't reproduce the descendant-Routes mount path.
 * That suite passed even with the buggy OperationApp wiring. This file closes
 * that gap by exercising the actual mount path the runtime uses.
 *
 * All children are stubbed so we test routing only; child suites cover their
 * own renders.
 */
// Unified Internal Portal (2026-06-30) — the merged PortalSidebar replaced the
// private OperationSidebar. It self-fetches badges via react-query, so stub it;
// this suite tests OperationApp's descendant routing, not the rail. Active-tab
// highlight moved into PortalSidebar (URL-derived) and is covered by its own
// suite, so the old `data-active` prop assertions are gone.
vi.mock("@/pages/portal/PortalSidebar", () => ({
  default: () => <div data-testid="sidebar-stub">sidebar</div>,
}));
vi.mock("./OperationDashboard", () => ({
  default: () => <div data-testid="dashboard-stub">dashboard</div>,
}));
vi.mock("./OperationOrders", () => ({
  default: () => <div data-testid="orders-stub">orders</div>,
}));
vi.mock("./OperationWarehouse", () => ({
  default: () => <div data-testid="warehouse-stub">warehouse</div>,
}));
vi.mock("./OperationMovements", () => ({
  default: () => <div data-testid="movements-stub">movements</div>,
}));
vi.mock("./procurement/TabbedProcurementShell", () => ({
  default: () => (
    <div data-testid="procurement-shell-stub">procurement-shell</div>
  ),
}));
// The bare procurement path mounts the Purchase Execution Workspace (Jess's
// 2026-08-01 architecture freeze); slugged paths keep the legacy shell so
// `?po=` deep links survive. Stubbed — it self-fetches via react-query.
vi.mock("./OperationPurchaseOrders", () => ({
  default: () => (
    <div data-testid="purchase-orders-workspace-stub">po-workspace</div>
  ),
}));
vi.mock("./OperationToOrder", () => ({
  default: () => <div data-testid="to-order-stub">to-order</div>,
}));
vi.mock("./OperationManualPurchase", () => ({
  default: () => <div data-testid="manual-purchase-stub">manual-purchase</div>,
}));
// CARD-2026-08-21-delivery-02 — Delivery Work draws its own Destination Header
// and self-fetches; this suite only asks which route mounts it, and whether the
// slim global bar stands down when it does.
vi.mock("./OperationDelivery", () => ({
  default: () => <div data-testid="delivery-work-stub">delivery-work</div>,
}));
// Edit Delivery (2026-08-24) self-fetches the arrangement — stubbed; what this
// suite owns is that the URL actually MOUNTS it, which is precisely what the
// production walk found broken: the route existed and the `isUrlDriven` gate
// did not include it, so the main pane rendered nothing.
vi.mock("./EditDelivery", () => ({
  default: () => <div data-testid="edit-delivery-stub">edit-delivery</div>,
}));
vi.mock("./WarehouseUnitDetail", () => ({
  default: () => <div data-testid="warehouse-unit-stub">warehouse-unit</div>,
}));
vi.mock("./WarehouseStockRegister", () => ({
  default: () => <div data-testid="stock-register-destination-header">stock</div>,
}));
vi.mock("./WarehouseSchedule", () => ({
  default: () => <div data-testid="warehouse-schedule-destination-header">schedule</div>,
}));
vi.mock("./OperationStockPlan", () => ({
  default: () => <div data-testid="ready-stock-destination-header">ready-stock</div>,
}));
// The right rail self-fetches (tasks/notes) — stub it; this suite tests routing.
vi.mock("./components/OperationRightRail", () => ({
  default: () => <div data-testid="right-rail-stub">rail</div>,
}));
// The global top bar self-fetches (orders/tasks for Alerts) — stub it too.
vi.mock("./components/GlobalTopBar", () => ({
  default: () => <div data-testid="global-topbar-stub">topbar</div>,
}));
// ⭐ SALES ORDER PRODUCTION CUTOVER (2026-08-10) — the two Orders doors. Both
// self-fetch, so both are stubbed; this suite tests WHICH ROUTE MOUNTS WHICH,
// which is the whole of the cutover in code.
vi.mock("./SalesOrdersRegister", () => ({
  default: () => <div data-testid="register-stub">register</div>,
}));
vi.mock("./OperationOrdersControl", () => ({
  default: ({ onImport }: { onImport?: () => void }) => (
    <div data-testid="old-orders-stub">
      old-orders
      <button type="button" onClick={onImport}>
        import
      </button>
    </div>
  ),
}));
vi.mock("./SalesOrderWorkspace", () => ({
  default: () => <div data-testid="workspace-stub">workspace</div>,
}));
vi.mock("./OperationImport", () => ({
  default: () => <div data-testid="import-stub">import-page</div>,
}));

import OperationApp from "./OperationApp";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname}{location.search}</output>;
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/operation/*" element={<OperationApp />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("OperationApp — procurement descendant routing", () => {
  it("URL /operation/to-order?so=1204 mounts the same Batch Purchase page", () => {
    renderApp("/operation/to-order?so=1204");
    expect(screen.getByTestId("to-order-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("URL /operation/procurement mounts the Purchase Execution Workspace via descendant Routes", () => {
    renderApp("/operation/procurement");
    expect(
      screen.getByTestId("purchase-orders-workspace-stub"),
    ).toBeInTheDocument();
    // The dashboard must NOT render alongside the workspace — `isProcurementUrl`
    // gates the conditional so only the inner <Routes> block paints.
    expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
  });

  it("URL /operation/procurement/:slug also mounts the shell", () => {
    renderApp("/operation/procurement/hookka-sofa");
    expect(screen.getByTestId("procurement-shell-stub")).toBeInTheDocument();
  });

  it("URL /operation (no procurement) renders the dashboard tab as default", () => {
    renderApp("/operation");
    expect(screen.getByTestId("dashboard-stub")).toBeInTheDocument();
    expect(
      screen.queryByTestId("procurement-shell-stub"),
    ).not.toBeInTheDocument();
  });
});

/**
 * ⭐ SALES ORDER PRODUCTION CUTOVER — `docs/SALES-ORDER-CUTOVER.md`.
 *
 * The card's whole risk is that the cutover breaks the page 83 live orders are
 * being worked on today. Two doors, and NEITHER may serve the other's page:
 *
 *   /operation/orders      → the NEW Sales Order register  (official)
 *   /operation/old-orders  → the OLD control table         (temporary)
 *
 * The old door must also still reach the AutoCount import — it is the only
 * import surface there is, which is exactly what blocks the final delete.
 */
describe("OperationApp — the Sales Order cutover's two doors", () => {
  it("/operation/orders mounts the NEW register and never the old table", () => {
    renderApp("/operation/orders");
    expect(screen.getByTestId("register-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("old-orders-stub")).not.toBeInTheDocument();
    expect(screen.getByTestId("sales-orders-work-surface")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("sales-orders-work-surface")).not.toHaveClass("overflow-auto");
  });

  it("/operation/orders/:stage still mounts the NEW register", () => {
    renderApp("/operation/orders/in_production");
    expect(screen.getByTestId("register-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("old-orders-stub")).not.toBeInTheDocument();
  });

  it("/operation/old-orders mounts the OLD table and never the register", () => {
    renderApp("/operation/old-orders");
    expect(screen.getByTestId("old-orders-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("register-stub")).not.toBeInTheDocument();
    // The old door is a URL-driven section too — the dashboard must not paint
    // underneath it.
    expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
  });

  it("/operation/old-orders/:stage carries the kanban slug across", () => {
    renderApp("/operation/old-orders/in_production");
    expect(screen.getByTestId("old-orders-stub")).toBeInTheDocument();
  });

  it("the OLD door still reaches the AutoCount import", async () => {
    renderApp("/operation/old-orders");
    fireEvent.click(screen.getByRole("button", { name: "import" }));
    expect(await screen.findByTestId("import-stub")).toBeInTheDocument();
  });

  it("the workspace route is unshadowed by the old door", () => {
    renderApp("/operation/orders/so/new");
    expect(screen.getByTestId("workspace-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("sales-orders-work-surface")).not.toBeInTheDocument();
  });
});

/**
 * ONE HEADER ON MANUAL PURCHASE (corrections card §2, Jess 2026-08-19 on a
 * production screenshot). The shell law: the shell draws the header and a page
 * draws no second one. `?tab=manual-purchase` was missing from the
 * GlobalTopBar suppression list, so production showed two bells both reading
 * 54. The suppression is the fix; the page's own PurchasingTabs row is the ONE
 * header.
 */
describe("OperationApp — one header on Manual Purchase", () => {
  it("?tab=manual-purchase suppresses the global top bar like its siblings", () => {
    renderApp("/operation?tab=manual-purchase");
    expect(screen.getByTestId("manual-purchase-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("the dashboard keeps its top bar — the suppression is per purchasing page", () => {
    renderApp("/operation?tab=dashboard");
    expect(screen.getByTestId("global-topbar-stub")).toBeInTheDocument();
  });
});

/**
 * ONE HEADER ON DELIVERY WORK (CARD-2026-08-21-delivery-02, caught on the
 * production walk 2026-08-21).
 *
 * The identical defect Manual Purchase shipped with: `?tab=delivery` was
 * missing from the GlobalTopBar suppression list, so the page's own 50px
 * Destination Header — which embeds TopBarIcons — sat under a slim bar carrying
 * a second Jump to, a second bell reading 59, a second Help and a second gear.
 * `Delivery Orders` never showed it because it is a real route and was
 * suppressed already, which is exactly why one route looked right and its
 * sibling did not.
 */
describe("OperationApp — one header on Delivery Work", () => {
  it("?tab=delivery mounts the page and stands the global top bar down", () => {
    renderApp("/operation?tab=delivery");
    expect(screen.getByTestId("delivery-work-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("its rail choices survive the mount — both filters ride the URL", () => {
    renderApp("/operation?tab=delivery&date=__no_date&logistics=NETS");
    expect(screen.getByTestId("delivery-work-stub")).toBeInTheDocument();
  });
});

describe("OperationApp — Delivery is one page", () => {
  it("the old Delivery Orders list address returns to the unified Delivery page", async () => {
    renderApp("/operation/delivery-orders");
    expect(await screen.findByTestId("delivery-work-stub")).toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/operation?tab=delivery",
    );
  });
});

/**
 * EDIT DELIVERY IS A ROUTE THAT MOUNTS (walk finding, 2026-08-24). The page
 * shipped with its Route declared and the `isUrlDriven` gate unaware of it, so
 * the URL fell through to the `?tab=` branch and drew an empty main pane. A
 * component test cannot see that — only mounting the APP at the URL can.
 */
describe("OperationApp — Edit Delivery mounts at its URL", () => {
  it("/operation/delivery/edit/:orderId mounts the page", () => {
    renderApp("/operation/delivery/edit/order-1");
    expect(screen.getByTestId("edit-delivery-stub")).toBeInTheDocument();
  });

  it("and the slim global bar stands down — the page draws its own header", () => {
    renderApp("/operation/delivery/edit/order-1");
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("a leg keeps its query string", () => {
    renderApp("/operation/delivery/edit/order-1?leg=2");
    expect(screen.getByTestId("edit-delivery-stub")).toBeInTheDocument();
  });
});

/**
 * A Unit ID is a permanent object address. Declaring the descendant Route is
 * not enough: the shell must also enter its URL-driven branch, otherwise a
 * direct load keeps the URL but renders Dashboard underneath it.
 */
describe("OperationApp — an exact Stock Unit mounts at its permanent URL", () => {
  it("/operation/stock/unit/:unitCode mounts Unit Detail, not Dashboard", () => {
    renderApp("/operation/stock/unit/id-yjk864506");
    expect(screen.getByTestId("warehouse-unit-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/operation/stock/unit/id-yjk864506",
    );
  });

  it("stands the slim global bar down because Unit Detail owns its header", () => {
    renderApp("/operation/stock/unit/id-yjk864506");
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });
});

describe("OperationApp — Warehouse registers own the only Destination Header", () => {
  it("mounts Schedule as the Warehouse landing Register without duplicate chrome", () => {
    renderApp("/operation?tab=warehouse-schedule");
    expect(screen.getByTestId("warehouse-schedule-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("retires the old In & out bookmark into Stock", () => {
    renderApp("/operation?tab=movements");
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/operation?tab=stock-onhand",
    );
    expect(screen.getByTestId("stock-register-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("movements-stub")).not.toBeInTheDocument();
  });

  it("retires the Warehouse Dashboard bookmark into Schedule", () => {
    renderApp("/operation?tab=warehouse");
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/operation?tab=warehouse-schedule",
    );
    expect(screen.getByTestId("warehouse-schedule-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("warehouse-stub")).not.toBeInTheDocument();
  });

  it("Stock mounts its Destination Header and the global utility row stands down", () => {
    renderApp("/operation?tab=stock-onhand");
    expect(screen.getByTestId("stock-register-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("retires the old Ready stock bookmark into Stock's Available to sell filter", () => {
    renderApp("/operation?tab=stock-plan");
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/operation?tab=stock-onhand&availability=available",
    );
    expect(screen.getByTestId("stock-register-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("ready-stock-destination-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });
});

/**
 * PURCHASE DEMANDS — the newest BUY destination
 * (CARD-2026-08-20-purchase-demands).
 *
 * The Register draws the Purchasing Destination Header itself, so the slim
 * global bar must be suppressed exactly as it is for its five siblings — the
 * same defect Manual Purchase shipped with in August.
 */
/**
 * CARD-2026-08-22-purchasing-02 — the separate Purchase Demands page is RETIRED.
 * `purchase_demand` is hidden canonical truth, not a destination
 * (`docs/purchasing/MASTER.md` §4), and its useful capability now lives inside
 * SO Batch Purchase. The old address REDIRECTS: a bookmark an operator saved
 * must land somewhere that answers the same question, not on a 404.
 */
describe("OperationApp — the retired Purchase Demands address", () => {
  it("?tab=purchase-demands lands on SO Batch Purchase", () => {
    renderApp("/operation?tab=purchase-demands");
    expect(screen.getByTestId("to-order-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("purchase-demands-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
  });

  it("a saved link with the old rail parameters still lands on the buying page", () => {
    renderApp("/operation?tab=purchase-demands&state=no_supplier,no_sku");
    expect(screen.getByTestId("to-order-stub")).toBeInTheDocument();
  });

  it("SO Batch Purchase suppresses the global bar — one header, not two", () => {
    renderApp("/operation?tab=purchase");
    expect(screen.queryByTestId("global-topbar-stub")).not.toBeInTheDocument();
  });

  it("SO Batch Purchase mounts its own page at its own address", () => {
    renderApp("/operation?tab=purchase");
    expect(screen.getByTestId("to-order-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("purchase-demands-stub")).not.toBeInTheDocument();
  });
});
