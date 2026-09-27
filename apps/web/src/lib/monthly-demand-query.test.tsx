import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, apiFetch };
});

import { useMonthlyDemandFacts } from "./queries";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const ORDERS = [{
  id: "order-1", so: 1301, deliveryDate: "2026-10-12", deliveryDateTbd: false,
  salesLocation: "{dealer 1}", state: "{state 1}", city: "{city 1}",
  lines: [{ id: "L1", sku: "B1201S-K", qty: 3, category: "mattress" }],
  delivered: [],
}];

const line = (orderLineId: string, qty: number, stockTaken: number, bought: number) => ({
  orderLineId, sku: "B1201S-K", qty, stockTaken, item: "{item}", variant: null, category: "mattress",
  pos: bought ? [{ poId: "PO-1", qty: bought }] : [],
});
const registerRow = (orderId: string, lines: ReturnType<typeof line>[]) => ({
  orderId, so: 1301, customer: "{customer}", status: "blank", proceededAt: null,
  requestedDeliveryDate: null, deliveryCity: null, deliveryState: null, pos: [], lines,
  outstandingSuppliers: [],
});
const DEMANDS = {
  today: "2026-09-28", rows: [],
  registerRows: [
    registerRow("order-1", [line("L1", 3, 1, 1)]),
    registerRow("order-2", [line("L2", 2, 0, 2), line("L3", 4, 0, 0)]),
  ],
  destinations: [], defaultDestinationId: null, currentPoDuty: null, actingPoDuty: null,
  poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: false,
  procurementPartners: [], safetyDays: 14,
};

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url === "/api/operation/orders/monthly-demand") return Promise.resolve({ orders: ORDERS });
    if (url === "/api/operation/purchase/demands") return Promise.resolve(DEMANDS);
    throw new Error(`unexpected ${url}`);
  });
});

describe("useMonthlyDemandFacts", () => {
  it("does not read until Monthly demand is the chosen view", () => {
    renderHook(() => useMonthlyDemandFacts(false), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("reads the orders and SO Batch Purchase's still-to-buy quantity per order", async () => {
    const { result } = renderHook(() => useMonthlyDemandFacts(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.orders).toEqual(ORDERS);
    expect([...result.current.data!.toBuyByOrder!.entries()]).toEqual([["order-1", 1], ["order-2", 4]]);
  });

  it("a failed SO Batch Purchase read is unread, never zero, and the orders still answer", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url === "/api/operation/purchase/demands" ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useMonthlyDemandFacts(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.toBuyByOrder).toBeNull();
    expect(result.current.data?.orders).toEqual(ORDERS);
  });

  it("an SO Batch Purchase answer that does not parse is unread", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url === "/api/operation/purchase/demands" ? Promise.resolve({ registerRows: "nope" }) : base(url),
    );
    const { result } = renderHook(() => useMonthlyDemandFacts(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.toBuyByOrder).toBeNull();
  });

  it("a failed read of the orders fails the query", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url === "/api/operation/orders/monthly-demand" ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useMonthlyDemandFacts(true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
