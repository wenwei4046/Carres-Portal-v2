import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, apiFetch };
});

import { useSalesOrderRouteFacts } from "./queries";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url.endsWith("/allocation")) return Promise.resolve({ allocation: { lines: [] } });
    if (url.endsWith("/booking-brief")) return Promise.resolve({ brief: { appointment: null } });
    if (url.endsWith("/delivery-attempts")) return Promise.resolve({ attempts: [] });
    if (url.endsWith("/loans")) return Promise.resolve({ loans: [] });
    if (url.endsWith("/refunds")) return Promise.resolve({ refunds: [] });
    if (url.startsWith("/api/ops/service-cases")) return Promise.resolve({ items: [] });
    // Decision A (0355) — the gate's one money question rides the same fan-in.
    if (url.startsWith("/api/finance/exceptions/")) return Promise.resolve([]);
    if (url.startsWith("/api/operation/supplier-claims")) return Promise.resolve({
      claims: [
        { id: "c1", claim_no: "CL-1", po_id: "PO-1", status: "open", reported_at: "2026-08-12" },
        { id: "c2", claim_no: "CL-2", po_id: "PO-X", status: "open", reported_at: "2026-08-12" },
      ],
    });
    if (url.includes("/pos/PO-1/receiving")) return Promise.resolve({ sessions: [{ id: "r1", po_id: "PO-1" }] });
    if (url.includes("/pos/PO-2/receiving")) return Promise.resolve({ sessions: [{ id: "r2", po_id: "PO-2" }] });
    throw new Error(`unexpected ${url}`);
  });
});

describe("useSalesOrderRouteFacts", () => {
  it("does not fan out until the operator opens Order Route", () => {
    renderHook(() => useSalesOrderRouteFacts("order-1", false, ["PO-1"]), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("reads every owner and keeps only claims belonging to this order's POs", async () => {
    const { result } = renderHook(
      () => useSalesOrderRouteFacts("order-1", true, ["PO-1", "PO-2"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiFetch.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "/api/operation/orders/order-1/allocation",
      "/api/operation/orders/order-1/booking-brief",
      "/api/operation/orders/order-1/delivery-attempts",
      "/api/operation/orders/order-1/loans",
      "/api/operation/orders/order-1/refunds",
      "/api/ops/service-cases?orderId=order-1",
      "/api/operation/supplier-claims?status=all",
      "/api/finance/exceptions/order-1",
      "/api/operation/pos/PO-1/receiving",
      "/api/operation/pos/PO-2/receiving",
    ]));
    expect(result.current.data?.receiving.map((row) => row.id)).toEqual(["r1", "r2"]);
    expect(result.current.data?.claims.map((claim) => claim.claim_no)).toEqual(["CL-1"]);
  });
});
