import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useWarehouseSchedule } from "./useWarehouseSchedule";

/**
 * The hook owns exactly two things the shared projection cannot: WHICH
 * authorized endpoints are read, and what happens when one of them fails.
 * Both are tested here; the card arithmetic is proved in
 * `packages/shared/src/warehouse-schedule.test.ts`.
 */

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (url: string) => h.fetch(url),
}));
vi.mock("@/lib/fmt-date", () => ({
  appTodayIso: () => "2026-09-14",
  fmtDate: (iso: string) => iso,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

const PO_ARRIVAL = {
  arrivals: [
    {
      id: "PO-1",
      sourceId: "PO-1",
      sourceType: "supplier-delivery",
      documentWord: "PO No",
      documentNo: "PO-1",
      party: "Ohana",
      from: "Ohana",
      siteId: "site-1",
      site: "Carres Klang",
      date: "2026-09-20",
      poDate: "2026-09-01",
      so: 1362,
      expected: 1,
      received: 0,
      remaining: 1,
      issues: 0,
      products: [{ sku: "sofa:Muro-K", name: "Muro", qty: 1, received: 0 }],
      identitiesMissing: false,
      sessionId: null,
      sessions: [],
      units: [
        {
          id: "u1",
          code: "U-1",
          sku: "sofa:Muro-K",
          product: "Muro",
          outcome: "not_received",
          issue: null,
        },
      ],
    },
  ],
  sites: [{ id: "site-1", name: "Carres Klang" }],
  sourceFacts: [
    {
      sourceId: "PO-1",
      dateStatus: "expected",
      lines: [{ id: "l1", sku: "sofa:Muro-K", qty: 1 }],
    },
  ],
  page: { offset: 0, limit: 200, total: 1 },
};

function route(url: string) {
  if (url.startsWith("/api/operation/warehouse/inbound"))
    return Promise.resolve(PO_ARRIVAL);
  if (url.startsWith("/api/operation/delivery-arrangements/warehouse-schedule"))
    return Promise.resolve({ events: [] });
  if (url.startsWith("/api/operation/delivery-arrangements"))
    return Promise.resolve({ arrangements: [] });
  if (url.startsWith("/api/operation/warehouse-settings"))
    return Promise.resolve({
      details: { status: "active" },
      workingHours: [],
      specialDates: [],
      holidayPolicy: null,
      holidayDates: [],
    });
  throw new Error(`unexpected request: ${url}`);
}

beforeEach(() => {
  h.fetch.mockReset();
  h.fetch.mockImplementation(route);
});

describe("useWarehouseSchedule — authorized sources only", () => {
  it("reads the ARRIVAL direction from Receiving's own register", async () => {
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0].direction).toBe("arrival");
    expect(result.current.cards[0].sourceRef).toBe("PO-1");
    expect(result.current.errors).toEqual([]);
    // It must NOT reach for the pickup feed while showing arrivals.
    const urls = h.fetch.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("warehouse/inbound"))).toBe(true);
    expect(urls.some((u) => u.includes("warehouse-schedule"))).toBe(false);
  });

  it("reads the PICKUP direction from Delivery's read-only feed", async () => {
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "pickup", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const urls = h.fetch.mock.calls.map((c) => c[0] as string);
    expect(
      urls.some((u) => u.includes("delivery-arrangements/warehouse-schedule")),
    ).toBe(true);
    expect(urls.some((u) => u.includes("warehouse/inbound"))).toBe(false);
  });

  it("returns six operating dates from `from`", async () => {
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.operatingDates).toHaveLength(6);
    expect(result.current.operatingDates[0]).toBe("2026-09-14");
  });
});

describe("a source FAILURE is never an empty day", () => {
  it("reports the arrival failure instead of returning a bare empty result", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound"))
        return Promise.reject(Object.assign(new Error("boom"), { message: "boom" }));
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.errors.length).toBeGreaterThan(0));
    expect(result.current.cards).toEqual([]);
    // The caller branches on errors, never on an empty `cards`.
    expect(result.current.errors[0].direction).toBe("arrival");
  });

  it("does not let the PICKUP direction be erased by an ARRIVAL failure", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound"))
        return Promise.reject(new Error("arrivals are down"));
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "pickup", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The pickup read succeeded; the arrival outage is not its business.
    expect(result.current.errors).toEqual([]);
  });

  it("reports a truncated arrival page rather than showing a silent partial", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound"))
        return Promise.resolve({
          ...PO_ARRIVAL,
          page: { offset: 0, limit: 200, total: 640 },
        });
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.errors.length).toBeGreaterThan(0));
    expect(result.current.errors[0].message).toContain("640");
    // The cards it DID read are still returned.
    expect(result.current.cards).toHaveLength(1);
  });
});

describe("an optional read that refuses degrades one field, honestly", () => {
  it("falls back to the GOVERNED WEEK and SAYS SO when settings refuse", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse-settings"))
        return Promise.reject(new Error("operation only"));
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-18" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.errors.length).toBeGreaterThan(0));
    /* CORRECTED after the 2026-09-14 production finding: 2026-09-20 is a
       Sunday and must NOT appear. An unreadable configuration is not a
       licence to contradict the approved Warehouse week. */
    expect(result.current.operatingDates).not.toContain("2026-09-20");
    expect(result.current.operatingDates).toHaveLength(6);
    // The operator is still told the configuration was not read.
    expect(
      result.current.errors.some((e) =>
        e.message.includes("standard Warehouse week"),
      ),
    ).toBe(true);
  });

  it("keeps a pickup date EXPECTED when the partner's reply cannot be read", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url === "/api/operation/delivery-arrangements")
        return Promise.reject(new Error("operation only"));
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "pickup", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    // No proof read means no card is upgraded to `scheduled`, and the reason
    // is reported rather than swallowed.
    expect(result.current.cards.every((c) => c.dateStatus !== "scheduled")).toBe(
      true,
    );
  });

  it("reports when the server cannot supply ordered lines or date agreement", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound")) {
        const { sourceFacts: _drop, ...rest } = PO_ARRIVAL;
        return Promise.resolve(rest);
      }
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.errors.length).toBeGreaterThan(0));
    // It still renders, falling back to the recorded Units.
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0].lines).toHaveLength(1);
    expect(result.current.cards[0].lines[0].id).toBe("u1");
  });
});

describe("the Site filter narrows the RESULT, not the permission", () => {
  it("passes the Site to the existing authorized query and keeps unsited work", async () => {
    const { result } = renderHook(
      () =>
        useWarehouseSchedule({
          direction: "arrival",
          siteId: "site-1",
          from: "2026-09-14",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const inboundUrl = (h.fetch.mock.calls.map((c) => c[0] as string).find((u) =>
      u.includes("warehouse/inbound"),
    ) ?? "") as string;
    expect(inboundUrl).toContain("site=site-1");
    expect(result.current.cards).toHaveLength(1);
  });

  it("drops a card belonging to a different Site", async () => {
    const { result } = renderHook(
      () =>
        useWarehouseSchedule({
          direction: "arrival",
          siteId: "site-OTHER",
          from: "2026-09-14",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards).toEqual([]);
    expect(result.current.errors).toEqual([]);
  });
});
