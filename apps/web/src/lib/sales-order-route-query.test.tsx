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
    /* A3 — the goods records, one read. */
    if (url === "/api/operation/orders/order-1/route-goods") {
      return Promise.resolve({
        lines: [{ id: "L1", sku: "B1201S", qty: 1 }],
        sources: [],
        purchaseOrders: [],
        receipts: [],
        units: [],
        readyStock: {},
        failed: { purchasing: false },
      });
    }
    /* A2 — Delivery's own records for this order. */
    if (url === "/api/operation/delivery-arrangements?order=order-1") {
      return Promise.resolve({ arrangements: [{ order_id: "order-1", leg: 1, partner_name: "NETS" }], contacts: [] });
    }
    if (url === "/api/operation/delivery-orders?order=order-1") {
      return Promise.resolve({
        deliveryOrders: [{ id: "d1", do_number: "DO2609-4827", leg: 1, trip: 0 }],
        attempts: [{ do_number: "DO2609-4827", result: "delivered" }],
        handoverEvents: [{ delivery_order_id: "d1", kind: "handed_over" }],
      });
    }
    if (url.endsWith("/loans")) return Promise.resolve({ loans: [] });
    /* 0492 (Card 15) — the loan offer conversation rides the same fan-in. */
    if (url.endsWith("/loan-offers")) return Promise.resolve({ offers: [] });
    if (url.endsWith("/refunds")) return Promise.resolve({ refunds: [] });
    if (url.startsWith("/api/ops/service-cases")) return Promise.resolve({ items: [] });
    // The gate's two money records (0355 + 0362) ride the same fan-in.
    if (url.startsWith("/api/finance/exceptions/")) return Promise.resolve([]);
    if (url.startsWith("/api/operation/payment-approvals/")) return Promise.resolve([]);
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
      "/api/operation/orders/order-1/loan-offers",
      "/api/operation/orders/order-1/refunds",
      "/api/ops/service-cases?orderId=order-1",
      "/api/operation/supplier-claims?status=all",
      "/api/finance/exceptions/order-1",
      "/api/operation/payment-approvals/order-1",
      "/api/operation/pos/PO-1/receiving",
      "/api/operation/pos/PO-2/receiving",
    ]));
    expect(result.current.data?.receiving.map((row) => row.id)).toEqual(["r1", "r2"]);
    expect(result.current.data?.claims.map((claim) => claim.claim_no)).toEqual(["CL-1"]);
  });

  /* ⭐ OWNER RULING 2026-09-26 — one branch failing never blanks the map. */
  it("a failed Delivery read is reported as unreadable and every other owner still answers", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.endsWith("/booking-brief") ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, ["PO-1"]), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.failed).toEqual({ delivery: true, payments: false, purchasing: false });
    expect(result.current.data?.brief).toBeNull();
    expect(result.current.data?.receiving.map((row) => row.id)).toEqual(["r1"]);
  });

  it("a failed Payments read is reported as unreadable", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.startsWith("/api/finance/exceptions/") ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.failed).toEqual({ delivery: false, payments: true, purchasing: false });
    expect(result.current.data?.financeExceptions).toEqual([]);
  });

  it("a read with no registered failure words still fails the route whole, never silently", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.endsWith("/allocation") ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("a failed receiving read rejects the query instead of escaping unhandled", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.includes("/receiving") ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, ["PO-1"]), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  /* ⭐ A2 — the DELIVERY group reads Delivery's own records (owner ruling 2026-09-26). */
  it("reads this order's arrangements and Delivery Orders, never the whole table", async () => {
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.delivery).toEqual({
      arrangements: [{ order_id: "order-1", leg: 1, partner_name: "NETS" }],
      deliveryOrders: [{ id: "d1", do_number: "DO2609-4827", leg: 1, trip: 0 }],
      attempts: [{ do_number: "DO2609-4827", result: "delivered" }],
      handoverEvents: [{ delivery_order_id: "d1", kind: "handed_over" }],
    });
    const urls = apiFetch.mock.calls.map((call) => call[0]);
    expect(urls).not.toContain("/api/operation/delivery-arrangements");
    expect(urls).not.toContain("/api/operation/delivery-orders");
  });

  it("a failed read of Delivery's records is Delivery unreadable, and no scope is invented", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.startsWith("/api/operation/delivery-orders?") ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.failed.delivery).toBe(true);
    expect(result.current.data?.delivery).toBeNull();
  });

  /* ⭐ A3 — the GOODS chain reads its owners (owner ruling 2026-09-26). */
  it("reads the goods records in one read", async () => {
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.goods?.lines).toEqual([{ id: "L1", sku: "B1201S", qty: 1 }]);
    expect(result.current.data?.failed.purchasing).toBe(false);
  });

  it("a failed goods read is Purchasing unreadable, and the rest of the route still answers", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.endsWith("/route-goods") ? Promise.reject(new Error("boom")) : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.goods).toBeNull();
    expect(result.current.data?.failed.purchasing).toBe(true);
    expect(result.current.data?.failed.delivery).toBe(false);
  });

  it("the door's own report that Purchasing could not be read is carried through", async () => {
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string) =>
      url.endsWith("/route-goods")
        ? Promise.resolve({ lines: [], sources: [], purchaseOrders: [], receipts: [], units: [], readyStock: {}, failed: { purchasing: true } })
        : base(url),
    );
    const { result } = renderHook(() => useSalesOrderRouteFacts("order-1", true, []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.failed.purchasing).toBe(true);
    expect(result.current.data?.goods).not.toBeNull();
  });
});
