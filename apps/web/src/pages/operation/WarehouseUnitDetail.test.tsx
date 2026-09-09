import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import WarehouseUnitDetail from "./WarehouseUnitDetail";

/**
 * CARD-2026-09-07-purchasing-10 · the scan door must ANSWER.
 *
 * Walked in production 2026-09-09: scanning a code the register cannot resolve
 * left the operator on a blank page — no message, no instruction. `0453` makes
 * one more thing unresolvable on purpose (a counted row's technical key is not
 * addressable, because nothing was ever printed for it), so the empty state has
 * to speak.
 */
// Override ONLY the one hook under test — the module also feeds the portal
// shell (GlobalTopBar), and replacing it wholesale breaks the render.
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useStockUnit: vi.fn(),
}));

import { useStockUnit } from "@/lib/queries";

function renderAt(code: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/operation/stock/unit/${code}`]}>
        <Routes>
          <Route path="/operation/stock/unit/:unitCode" element={<WarehouseUnitDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.mocked(useStockUnit).mockReset());

describe("the scan door never leaves the operator on a blank page", () => {
  it("says so plainly when the read settled with no Unit", () => {
    // The exact production shape: settled, not loading, no error flag, no unit.
    vi.mocked(useStockUnit).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderAt("id-nope000000");

    expect(screen.getByTestId("stock-unit-not-found")).toBeInTheDocument();
    expect(screen.getByText("No Unit carries that ID.")).toBeInTheDocument();
  });

  it("says so for a counted row's technical key, which is not addressable", () => {
    vi.mocked(useStockUnit).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderAt("QTY-000000001");

    expect(screen.getByText("No Unit carries that ID.")).toBeInTheDocument();
  });

  it("still shows the loading state rather than the empty answer", () => {
    vi.mocked(useStockUnit).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);

    renderAt("U1-000-082");

    expect(screen.queryByTestId("stock-unit-not-found")).toBeNull();
  });

  it("shows the Unit, by its stored identity, when there is one", () => {
    vi.mocked(useStockUnit).mockReturnValue({
      data: {
        unit: {
          id: "u1",
          unitCode: "U1-000-082",
          sku: "ALL-AASNDA-K",
          availability: "available",
          siteName: "Carres Klang Warehouse",
          holderName: null,
          ownership: "carres_owned",
          status: "free",
          condition: "new",
          qty: 1,
        },
        events: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderAt("u1000082");

    // typed without hyphens; what is DISPLAYED is the stored identity
    expect(screen.queryByTestId("stock-unit-not-found")).toBeNull();
    expect(screen.getAllByText(/U1-000-082/).length).toBeGreaterThan(0);
  });
});
