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

  it("'+ Create Purchase' opens the modal in MANUAL mode (0308)", () => {
    // 0308 — this button is the ONLY door to a purchase no customer order
    // asked for (the card's item 3). Its twin on To Order is gone, so what
    // this test guards is not that a modal opens but that it opens in the
    // right MODE: the reason field is what proves `manual` was passed, and
    // without it the door would silently raise customer-driven POs that
    // state nothing.
    renderShell("/operation/procurement/nice-future");
    // Closed to begin with. `Create Purchase` is NOT the marker for that —
    // the button itself now carries those words, which is exactly the point
    // of the door. The reason field is what only the open modal has.
    expect(screen.queryByTestId("purchase-reason-input")).toBeNull();
    fireEvent.click(screen.getByTestId("create-purchase-button"));
    // Modal is mounted, in manual mode: the required reason and the lines
    // table the modal scaffolds on first paint. We don't drive submit —
    // that's covered by CreatePOModal's own suite.
    expect(screen.getByTestId("purchase-reason-input")).toBeInTheDocument();
    expect(screen.getByTestId("po-lines-table")).toBeInTheDocument();
    // The customer-driven title must NOT be what opened.
    expect(screen.queryByText(/New purchase order/)).not.toBeInTheDocument();
  });
});
