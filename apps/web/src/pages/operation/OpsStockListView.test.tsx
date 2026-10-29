import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import OpsStockListView from "./OpsStockListView";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const unit = {
  id: "1", unitCode: "id-aaa111", sku: "SKU-1", warehouseId: "wh-klang", condition: "new", status: "free",
  reservedRef: null, refHistory: [], needsRepair: false, supplier: null, poNo: null, sourceRef: null,
  dateIn: "2026-05-20", createdAt: "2026-05-20T00:00:00Z", updatedAt: "2026-05-20T00:00:00Z",
};

function mount(seed: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(["operation", "ops-stock", "ready"], { items: [unit] });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OpsStockListView endpoint="/ready" cacheKey="ready" title="Ready" kicker="" blurb="" actions={[]} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("OpsStockListView failed reads", () => {
  it("a failed first read says so", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    mount(false);
    expect(await screen.findByTestId("could-not-load")).toBeInTheDocument();
  });

  it("a failed background refetch keeps the cached rows", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    mount(true);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("id-aaa111")).toBeInTheDocument();
    expect(screen.queryByTestId("could-not-load")).toBeNull();
  });
});
