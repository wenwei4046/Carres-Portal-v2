import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StockDropRow } from "@carres/shared/stock-drops";
import StockDrops from "./StockDrops";

/* Finance → Reports → Stock drops (0714; YH 2026-10-26). One read; rows invented. */
const api = vi.hoisted(() => ({ answer: null as unknown, calls: [] as string[], fail: false }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    // The personal layouts read (0704) is not this page's read.
    if (url.startsWith("/api/operation/register-layouts")) return { layouts: [], limit: 10 };
    api.calls.push(url);
    if (api.fail) throw Object.assign(new Error("boom"), { status: 500, body: {} });
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const row = (over: Partial<StockDropRow>): StockDropRow => ({
  key: over.unit_code ?? "k", adjustment_no: "ADJ-20261020-1111", dropped_at: "2026-10-20T02:00:00Z",
  site_name: "Carres Klang", reason: "Water damage", unit_code: "U1-000-001", sku: "SOFA-3S", qty: 1,
  unit_cost: 520, value: 520, ...over,
});

beforeEach(() => {
  api.answer = {
    rows: [row({}), row({ unit_code: "U1-000-002", unit_cost: null, value: null })],
    total: { units: 2, value: 52000, noCost: 1 },
  };
  api.calls = [];
  api.fail = false;
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><StockDrops /></MemoryRouter></QueryClientProvider>,
  );
}

describe("Stock drops", () => {
  it("lists each written-off Unit, says no cost recorded instead of 0, and totals the known value", async () => {
    show();
    const known = await screen.findByTestId("stock-drops-row-U1-000-001");
    expect(api.calls).toEqual(["/api/finance/ledger/stock-drops"]);
    expect(within(known).getByText("ADJ-20261020-1111")).toBeInTheDocument();
    expect(within(known).getByText("Water damage")).toBeInTheDocument();
    const unknown = screen.getByTestId("stock-drops-row-U1-000-002");
    expect(within(unknown).getAllByText("No cost recorded")).toHaveLength(2);
    expect(within(unknown).queryByText(/RM\s*0\.00/)).toBeNull();
    expect(screen.getByTestId("stock-drops-note")).toHaveTextContent("Nothing is posted to the ledger.");
    expect(screen.getByTestId("stock-drops-note")).toHaveTextContent(/Known value RM\s*520\.00 · 1 with no cost recorded\./);
  });

  it("says when it could not be read", async () => {
    api.fail = true;
    show();
    expect(await screen.findByText(/The stock drops could not be loaded/)).toBeInTheDocument();
  });
});
