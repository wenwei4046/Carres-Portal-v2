import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import StockAlertsTile from "./StockAlertsTile";
import type { operationStockAlertsResponse } from "@/lib/queries";

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

function makeAlerts(n: number): operationStockAlertsResponse {
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

function wrap(ui: React.ReactNode, initialEntries: string[] = ["/operation"]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // The LocationProbe rides alongside the `/operation` element so the
  // navigation tests can assert the URL stays put (the tile must NOT write a
  // URL anymore — see `phase-4.5-chunk-2-alerts-tab-routing`).
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/operation"
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

  it("clicking the open button calls onJumpToWarehouse and does NOT write a URL", async () => {
    // 2026-06-05 fix (`phase-4.5-chunk-2-alerts-tab-routing`): the operation
    // shell is tab-state-driven, so the tile must NOT navigate. The earlier
    // `navigate("/operation/warehouse?alert=true")` was a no-op nothing read
    // back. Clicking now flips the parent tab via `onJumpToWarehouse` ONLY; the
    // URL stays put so it can never desync from the rendered tab.
    vi.mocked(apiFetch).mockResolvedValue({ alerts: [] });
    const onJumpToWarehouse = vi.fn();
    render(wrap(<StockAlertsTile onJumpToWarehouse={onJumpToWarehouse} />));

    // Wait for the empty state so the button is fully rendered (the header
    // is always present, but waiting on settled state avoids fragile races).
    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-empty")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("stock-alerts-open"));

    expect(onJumpToWarehouse).toHaveBeenCalledTimes(1);
    // URL is unchanged — no fake `/operation/warehouse?alert=true` write.
    expect(screen.getByTestId("location").textContent).toBe("/operation");
  });

  it("clicking the open button is a safe no-op when onJumpToWarehouse is omitted", async () => {
    // The prop is optional — mounted standalone (e.g. a future placement
    // outside `OperationApp`'s tab shell) clicking must not crash and must not
    // navigate anywhere.
    vi.mocked(apiFetch).mockResolvedValue({ alerts: [] });
    render(wrap(<StockAlertsTile />));

    await waitFor(() =>
      expect(screen.getByTestId("stock-alerts-empty")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("stock-alerts-open"));

    // Still mounted, and no navigation occurred.
    expect(screen.getByTestId("stock-alerts-open")).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("/operation");
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
