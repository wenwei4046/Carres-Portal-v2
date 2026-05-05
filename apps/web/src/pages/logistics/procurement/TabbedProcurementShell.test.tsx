import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import TabbedProcurementShell from "./TabbedProcurementShell";

/**
 * TabbedProcurementShell — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * The shell renders tab nav + the active child component + the page-level
 * "+ New PO" button (T42-C2 restore). The child tabs (NiceFutureMattressTab
 * / HoOKkASofaTab / HoOKkABedFrameTab) all wrap `ProcurementTabContent`,
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
    useLogisticsSuppliers: () => ({ data: { suppliers: [] } }),
    useLogisticsWarehouse: () => ({
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
    // CreatePOModal-only hooks — defaults are benign empty states so the
    // modal renders without crashing when the "+ New PO" test opens it.
    useDeliveryPartners: () => ({ data: { partners: [] } }),
    useCreatePoMutation: () => ({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    }),
    useCreatePosBatch: () => ({
      mutateAsync: vi.fn().mockResolvedValue({ poIds: [] }),
      isPending: false,
    }),
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

function renderShell(initialPath: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/logistics/procurement"
            element={
              <>
                <TabbedProcurementShell />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/logistics/procurement/:slug"
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
    renderShell("/logistics/procurement/nice-future");
    expect(
      screen.getByTestId("procurement-tab-link-nice-future"),
    ).toHaveTextContent("Nice Future Mattress");
    expect(
      screen.getByTestId("procurement-tab-link-hookka-sofa"),
    ).toHaveTextContent("HoOKkA Sofa");
    expect(
      screen.getByTestId("procurement-tab-link-hookka-bedframe"),
    ).toHaveTextContent("HoOKkA Bed Frame");
  });

  it("active tab matches the URL slug", () => {
    renderShell("/logistics/procurement/hookka-sofa");
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
    renderShell("/logistics/procurement/totally-bogus-slug");
    // The shell returned <Navigate>, which the parent <Routes> resolved.
    // The location probe mounted on the destination must therefore read the
    // redirected path, NOT the original `/totally-bogus-slug` URL.
    expect(screen.getByTestId("location").textContent).toBe(
      "/logistics/procurement/nice-future",
    );
    // The default tab also rendered — no error surface, no broken view.
    expect(
      screen.getByTestId("procurement-tab-link-nice-future"),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("missing slug (parent route hit) redirects to the default tab", () => {
    // Route `/logistics/procurement` (no slug) — same redirect to default.
    renderShell("/logistics/procurement");
    expect(screen.getByTestId("location").textContent).toBe(
      "/logistics/procurement/nice-future",
    );
  });

  it("'+ New PO' button opens CreatePOModal (T42-C2 restore)", () => {
    // The shell-level button replaces the entry point that lived on the
    // deleted LogisticsProcurement.tsx. Default click → empty prefill, so
    // the modal title is "New purchase order" (no order/bundle suffix).
    renderShell("/logistics/procurement/nice-future");
    expect(screen.queryByText(/New purchase order/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-po-button"));
    // Modal is mounted: header + the lines table the modal scaffolds on
    // first paint both render. We don't drive submit — that's covered by
    // CreatePOModal's own suite — only the open path that codex flagged as
    // unreachable.
    expect(screen.getByText(/New purchase order/)).toBeInTheDocument();
    expect(screen.getByTestId("po-lines-table")).toBeInTheDocument();
  });
});
