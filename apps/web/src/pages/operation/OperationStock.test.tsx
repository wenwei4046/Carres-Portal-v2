import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationStock from "./OperationStock";
import { qk } from "@/lib/queries";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const payload = {
  warehouses: [{ id: "w1", name: "Klang" }],
  skus: [{ sku: "SKU-LOW", name: "Low chair", category: null, price: 0, available: 0, lowThreshold: 2, incoming: 0, perWarehouse: {} }],
  summary: { totalSkus: 1, lowStockCount: 1, openPos: 0 },
};

function mount(seed: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(qk.operation.stock(), payload);
  render(<QueryClientProvider client={qc}><OperationStock /></QueryClientProvider>);
}

describe("OperationStock failed reads", () => {
  it("a failed first read says so", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    mount(false);
    expect(await screen.findByTestId("could-not-load")).toBeInTheDocument();
  });

  it("a failed background refetch keeps the cached rows and summary", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    mount(true);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("Low chair")).toBeInTheDocument();
    expect(screen.queryByTestId("could-not-load")).toBeNull();
  });
});
