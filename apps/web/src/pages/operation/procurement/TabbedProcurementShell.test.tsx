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

  it("'+ Create Purchase' opens the modal on its MANUAL door (0308)", () => {
    // T42-C2 restored a `+ New PO` button here; 0308 makes it the module's ONE
    // manual purchasing door and names it for what it does. The assertion that
    // matters is not the label — it is that the modal opens in manual mode, so
    // it asks for a reason. A rename with the old mode behind it would pass a
    // label check and leave the boundary undrawn.
    renderShell("/operation/procurement/nice-future");
    // The precondition is asserted on the MODAL's own markers, not on the text
    // "Create Purchase" — the button and the manual modal's title are the same
    // words now, so a text query would match the trigger and never the dialog.
    expect(screen.queryByTestId("po-lines-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("purchase-reason")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("create-purchase-button"));

    expect(screen.getByTestId("po-lines-table")).toBeInTheDocument();
    // The reason field IS the manual door. Without this the test would pass on
    // a button that merely reads differently.
    expect(screen.getByTestId("purchase-reason")).toBeInTheDocument();
  });

  it("has no `+ New PO` — the old door is gone, not renamed in place", () => {
    renderShell("/operation/procurement/nice-future");
    expect(screen.queryByTestId("new-po-button")).toBeNull();
    expect(screen.queryByText("+ New PO")).toBeNull();
  });
});
