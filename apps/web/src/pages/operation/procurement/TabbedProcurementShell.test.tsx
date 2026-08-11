import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import TabbedProcurementShell from "./TabbedProcurementShell";

/**
 * TabbedProcurementShell — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * The shell renders tab nav + the active child component + the page-level
 * "+ New PO" button (T42-C2 restore). The child tabs (NiceFutureMattressTab
 * / OhanaSofaTab / OhanaBedFrameTab) all wrap `ProcurementTabContent`,
 * which calls `useProcurementTab(slug)` plus the three reference hooks
 * (suppliers / warehouse / catalog). The modal is `CreatePOModal`, which
 * additionally calls useDeliveryPartners + the create mutations + the
 * shortage/alerts lazy hooks. Mock all of them so the suite stays hermetic
 * — no MSW, no real fetch.
 */
vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useProcurementTab: () => ({
      data: { pos: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useOperationSuppliers: () => ({ data: { suppliers: [] } }),
    useOperationWarehouse: () => ({
      data: { warehouses: [], byWarehouse: {}, totalsBySku: {} },
    }),
    useCatalog: () => ({
      data: {
        models: [],
        skus: [],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    }),
    // Card 4B — the CreatePOModal-only stubs went with the modal. Only
    // `useDeliveryPartners` stays: the child tabs read it too.
    useDeliveryPartners: () => ({ data: { partners: [] } }),
    useAwaitingStockShortage: () => ({
      data: undefined,
      isFetching: false,
      isFetched: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useStockAlerts: () => ({
      data: undefined,
      isFetching: false,
      isFetched: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});

function LocationProbe() {
  // Surfaces the active route so redirect tests can assert what URL the
  // shell navigated to. Mirrors the StockAlertsTile.test.tsx pattern.
  const loc = useLocation();
  return (
    <div data-testid="location">
      {loc.pathname}
      {loc.search}
    </div>
  );
}

function renderShell(initialPath: string, state?: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[state === undefined ? initialPath : { pathname: initialPath, state }]}
      >
        <Routes>
          <Route
            path="/operation/procurement"
            element={
              <>
                <TabbedProcurementShell />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/operation/procurement/:slug"
            element={
              <>
                <TabbedProcurementShell />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TabbedProcurementShell", () => {
  it("renders 3 tab links with the expected labels", () => {
    renderShell("/operation/procurement/nice-future");
    expect(
      screen.getByTestId("procurement-tab-link-nice-future"),
    ).toHaveTextContent("Nice Future Mattress");
    expect(
      screen.getByTestId("procurement-tab-link-hookka-sofa"),
    ).toHaveTextContent("Ohana Sofa");
    expect(
      screen.getByTestId("procurement-tab-link-hookka-bedframe"),
    ).toHaveTextContent("Ohana Bed Frame");
  });

  it("active tab matches the URL slug", () => {
    renderShell("/operation/procurement/hookka-sofa");
    // Active tab carries aria-selected=true; the other two carry false. NavLink
    // also drives an `active`-style class branch — the aria attr is the most
    // reliable assertion across class drift.
    expect(
      screen.getByTestId("procurement-tab-link-hookka-sofa"),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByTestId("procurement-tab-link-nice-future"),
    ).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByTestId("procurement-tab-link-hookka-bedframe"),
    ).toHaveAttribute("aria-selected", "false");
    // The active tab's body mounts under its slug-suffixed test id (the
    // ProcurementTabContent root carries `procurement-tab-content-${slug}`).
    expect(
      screen.getByTestId("procurement-tab-content-hookka-sofa"),
    ).toBeInTheDocument();
  });

  it("invalid slug redirects to the default tab (nice-future)", () => {
    renderShell("/operation/procurement/totally-bogus-slug");
    // The shell returned <Navigate>, which the parent <Routes> resolved.
    // The location probe mounted on the destination must therefore read the
    // redirected path, NOT the original `/totally-bogus-slug` URL.
    expect(screen.getByTestId("location").textContent).toBe(
      "/operation/procurement/nice-future",
    );
    // The default tab also rendered — no error surface, no broken view.
    expect(
      screen.getByTestId("procurement-tab-link-nice-future"),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("missing slug (parent route hit) redirects to the default tab", () => {
    // Route `/operation/procurement` (no slug) — same redirect to default.
    renderShell("/operation/procurement");
    expect(screen.getByTestId("location").textContent).toBe(
      "/operation/procurement/nice-future",
    );
  });

  /**
   * ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
   *
   * T42-C2 restored a "+ New PO" button here and this suite guarded that it
   * opened `CreatePOModal`. That test is SUPERSEDED by its inverse: the button
   * is gone, the modal is deleted, and the page creates nothing.
   *
   * The `location.state.prefill` inbox is checked too — it was the OTHER way in,
   * the one `OrderDetailDrawer` used, and a door that opens from a navigation
   * payload is easier to leave behind than a visible button.
   */
  it("has no + New PO button, and no modal to open", () => {
    renderShell("/operation/procurement/nice-future");
    expect(screen.queryByTestId("new-po-button")).not.toBeInTheDocument();
    expect(screen.queryByText(/New PO/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/New purchase order/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("po-lines-table")).not.toBeInTheDocument();
  });

  it("a navigation prefill can no longer open a creation surface", () => {
    renderShell("/operation/procurement/nice-future", {
      prefill: { so: 1234, lines: [{ sku: "mattress:x", qty: 2 }] },
    });
    expect(screen.queryByText(/New purchase order/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("po-lines-table")).not.toBeInTheDocument();
    // The page itself still works — this is a removal, not a breakage.
    expect(
      screen.getByTestId("procurement-tab-content-nice-future"),
    ).toBeInTheDocument();
  });
});
