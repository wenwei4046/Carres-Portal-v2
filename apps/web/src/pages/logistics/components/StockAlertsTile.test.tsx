import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import StockAlertsTile from "./StockAlertsTile";
import type { LogisticsStockAlertsResponse } from "@/lib/queries";

/**
 * StockAlertsTile — Phase 4.5 Chunk 2 Sprint D Task 21.
 *
 * `apiFetch` is mocked so the tests can drive the underlying `useStockAlerts`
 * query through real TanStack Query state machine without spinning up MSW.
 * The component owns its own data dependency (no props), so each test maps
 * one fetch result → expected UI state.
 */
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});
import { apiFetch } from "@/lib/api";

function makeAlerts(n: number): LogisticsStockAlertsResponse {
  return {
    alerts: Array.from({ length: n }, (_, i) => ({
      sku: `mattress:demo:variant-${i}`,
      warehouse_id: `22222222-2222-2222-2222-${String(i).padStart(12, "0")}`,
      qty: 0 + i,
      reserved: 0,
      effective: 0 + i,
      low_threshold: 5,
      shortage: 5 - i,
    })),
  };
}

function LocationProbe() {
  // Renders the active route so click-navigation tests can read the URL
  // resulting from `useNavigate(...)` calls.
  const loc = useLocation();
  return (
    <div data-testid="location">
      {loc.pathname}
      {loc.search}
    </div>
  );
}

function wrap(ui: React.ReactNode, initialEntries: string[] = ["/logistics"]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/logistics" element={ui} />
          <Route
            path="/logistics/warehouse"
            element={
              <>
                {ui}
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("StockAlertsTile", () => {
  it("renders the alert count + the top 3 SKU rows", async () => {
    vi.mocked(apiFetch).mockResolvedValue(makeAlerts(5));
    render(wrap(<StockAlertsTile />));

    // The tile waits for fetch resolution, then surfaces "5" as the count.
    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-count")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("stock-alerts-count").textContent).toMatch(
      /5\s*below threshold/i,
    );

    // Top 3 SKUs render via testid; the 4th and 5th must NOT.
    expect(
      screen.getByTestId("stock-alerts-row-mattress:demo:variant-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("stock-alerts-row-mattress:demo:variant-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("stock-alerts-row-mattress:demo:variant-2"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("stock-alerts-row-mattress:demo:variant-3"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("stock-alerts-row-mattress:demo:variant-4"),
    ).not.toBeInTheDocument();

    // Hint line reflects the count + plural form.
    expect(screen.getByText(/5 SKUs below threshold/)).toBeInTheDocument();
  });

  it("renders the empty state when fetch returns an empty array", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ alerts: [] });
    render(wrap(<StockAlertsTile />));

    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-empty")).toBeInTheDocument(),
    );
    expect(screen.getByText("All SKUs above threshold.")).toBeInTheDocument();
    // No count + no row testids when empty.
    expect(screen.queryByTestId("stock-alerts-count")).not.toBeInTheDocument();
  });

  it("clicking the open button navigates to /logistics/warehouse?alert=true AND calls onJumpToWarehouse", async () => {
    // T42-C3: the parent (`LogisticsApp`) keeps the active tab in `useState`,
    // so URL change alone leaves the dashboard tab selected. The tile has to
    // tell the parent to flip its state via `onJumpToWarehouse` while ALSO
    // changing the URL (so refresh / share / back / forward all keep the
    // alert filter applied via `?alert=true`).
    vi.mocked(apiFetch).mockResolvedValue({ alerts: [] });
    const onJumpToWarehouse = vi.fn();
    render(wrap(<StockAlertsTile onJumpToWarehouse={onJumpToWarehouse} />));

    // Wait for the empty state so the button is fully rendered (the header
    // is always present, but waiting on settled state avoids fragile races).
    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-empty")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("stock-alerts-open"));

    // Both effects must fire on a single click: the tab-state flip AND the
    // URL navigation. Order is enforced inside `handleOpen` (state first,
    // navigate second), but at the assertion level we only require both
    // happened by the time React has flushed.
    expect(onJumpToWarehouse).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const probe = screen.getByTestId("location");
      expect(probe.textContent).toBe("/logistics/warehouse?alert=true");
    });
  });

  it("clicking the open button still navigates when onJumpToWarehouse is omitted (backward compat)", async () => {
    // The prop is optional — the tile can still be mounted standalone (e.g.
    // future placement outside `LogisticsApp`'s tab shell) and the URL-only
    // path must keep working without crashing.
    vi.mocked(apiFetch).mockResolvedValue({ alerts: [] });
    render(wrap(<StockAlertsTile />));

    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-empty")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("stock-alerts-open"));

    await waitFor(() => {
      const probe = screen.getByTestId("location");
      expect(probe.textContent).toBe("/logistics/warehouse?alert=true");
    });
  });

  it("renders the loading state while the query is pending", () => {
    // `apiFetch` never resolves so the query stays in `isLoading`.
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    render(wrap(<StockAlertsTile />));

    expect(screen.getByTestId("stock-alerts-loading")).toBeInTheDocument();
    // The header hint mirrors the loading body.
    expect(screen.getAllByText(/Loading/).length).toBeGreaterThan(0);
  });

  it("renders the error state when the fetch rejects", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    render(wrap(<StockAlertsTile />));

    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-error")).toBeInTheDocument(),
    );
    // Both the header hint AND the body copy mention "Couldn’t load alerts"
    // so we assert the count rather than singling one out.
    expect(screen.getAllByText(/Couldn’t load alerts/i).length).toBeGreaterThanOrEqual(1);
  });
});
