import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
// The right rail self-fetches (tasks/notes) — stub it; this suite tests routing.
vi.mock("./components/OperationRightRail", () => ({
  default: () => <div data-testid="right-rail-stub">rail</div>,
}));
// The global top bar self-fetches (orders/tasks for Alerts) — stub it too.
vi.mock("./components/GlobalTopBar", () => ({
  default: () => <div data-testid="global-topbar-stub">topbar</div>,
}));

import OperationApp from "./OperationApp";

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/operation/*" element={<OperationApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OperationApp — procurement descendant routing", () => {
  it("URL /operation/procurement mounts TabbedProcurementShell via descendant Routes", () => {
    renderApp("/operation/procurement");
    expect(screen.getByTestId("procurement-shell-stub")).toBeInTheDocument();
    // The dashboard must NOT render alongside the shell — `isProcurementUrl`
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
