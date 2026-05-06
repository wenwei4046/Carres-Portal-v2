import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Regression test for the Phase 4.5 Chunk 2 procurement nested routing.
 *
 * Bug shipped + fixed 2026-05-07: `LogisticsApp` mounts a descendant `<Routes>`
 * inside the parent App's `<Route path="/logistics/*">`. The original Sprint F
 * implementation declared the inner routes with absolute paths
 * (`/logistics/procurement` and `/logistics/procurement/:slug`). React Router 7
 * silently fails to match those — descendant Routes paths must be relative to
 * the parent route's matched portion. Symptom: URL flips to
 * `/logistics/procurement` but the main area renders blank.
 *
 * The pre-existing `TabbedProcurementShell.test.tsx` rendered the shell as a
 * top-level Route, which doesn't reproduce the descendant-Routes mount path.
 * That suite passed even with the buggy LogisticsApp wiring. This file closes
 * that gap by exercising the actual mount path the runtime uses.
 *
 * All children are stubbed so we test routing only; child suites cover their
 * own renders.
 */
vi.mock("./LogisticsSidebar", () => ({
  default: ({ active }: { active: string }) => (
    <div data-testid="sidebar-stub" data-active={active}>
      sidebar
    </div>
  ),
}));
vi.mock("./LogisticsDashboard", () => ({
  default: () => <div data-testid="dashboard-stub">dashboard</div>,
}));
vi.mock("./LogisticsOrders", () => ({
  default: () => <div data-testid="orders-stub">orders</div>,
}));
vi.mock("./LogisticsWarehouse", () => ({
  default: () => <div data-testid="warehouse-stub">warehouse</div>,
}));
vi.mock("./LogisticsMovements", () => ({
  default: () => <div data-testid="movements-stub">movements</div>,
}));
vi.mock("./procurement/TabbedProcurementShell", () => ({
  default: () => (
    <div data-testid="procurement-shell-stub">procurement-shell</div>
  ),
}));

import LogisticsApp from "./LogisticsApp";

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/logistics/*" element={<LogisticsApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LogisticsApp — procurement descendant routing", () => {
  it("URL /logistics/procurement mounts TabbedProcurementShell via descendant Routes", () => {
    renderApp("/logistics/procurement");
    expect(screen.getByTestId("procurement-shell-stub")).toBeInTheDocument();
    // The dashboard must NOT render alongside the shell — `isProcurementUrl`
    // gates the conditional so only the inner <Routes> block paints.
    expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
  });

  it("URL /logistics/procurement/:slug also mounts the shell", () => {
    renderApp("/logistics/procurement/hookka-sofa");
    expect(screen.getByTestId("procurement-shell-stub")).toBeInTheDocument();
  });

  it("URL /logistics (no procurement) renders the dashboard tab as default", () => {
    renderApp("/logistics");
    expect(screen.getByTestId("dashboard-stub")).toBeInTheDocument();
    expect(
      screen.queryByTestId("procurement-shell-stub"),
    ).not.toBeInTheDocument();
  });

  it("sidebar `active` flips to `procurement` when URL is in procurement section", () => {
    renderApp("/logistics/procurement/nice-future");
    expect(screen.getByTestId("sidebar-stub")).toHaveAttribute(
      "data-active",
      "procurement",
    );
  });

  it("sidebar `active` is `dashboard` when URL is not procurement", () => {
    renderApp("/logistics");
    expect(screen.getByTestId("sidebar-stub")).toHaveAttribute(
      "data-active",
      "dashboard",
    );
  });
});
