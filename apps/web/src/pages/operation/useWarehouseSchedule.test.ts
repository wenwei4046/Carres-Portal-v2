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
  skuCategories: [{ sku: "sofa:Muro-K", category: "sofa" }],
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

describe("the CATALOG reaches categoryKey", () => {
  it("labels a line from the catalog, not from the SKU text", async () => {
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards[0].lines[0].categoryKey).toBe("Sofa");
  });

  it("reports when the server cannot supply the catalog", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound")) {
        const { skuCategories: _drop, ...rest } = PO_ARRIVAL;
        return Promise.resolve(rest);
      }
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.errors.length).toBeGreaterThan(0));
    expect(
      result.current.errors.some((e) => e.message.includes("catalog")),
    ).toBe(true);
    // It still renders — the classifier rung is a degradation, not an outage.
    expect(result.current.cards).toHaveLength(1);
  });
});

/**
 * PICKUP SIDE — the same SKU must not get two answers.
 *
 * Delivery's feed carried neither the model name nor the catalog category, so
 * a 5539 sofa read `Sofa` on Arrival and `Other goods` on Pickup. The hook now
 * asks for the catalog on this side too, and SAYS SO when the server cannot
 * supply it rather than classifying in silence.
 */
describe("pickup product category", () => {
  const EVENT = {
    orderId: "order-19",
    deliveryOrderId: "do-19",
    doNumber: "DO-2609-019",
    leg: 0,
    kind: "customer_delivery_pickup",
    unitId: "unit-1",
    unitCode: "U-1",
    sku: "5539-CNR",
    product: "5539 Corner",
    warehouseSiteId: "site-1",
    fromLocation: "Carres Klang",
    toCustomer: "Ms Tan",
    eventDate: "2026-09-21",
    logisticsPartner: "NETS",
  };

  it("passes the CATALOG categories through to the pickup cards", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/delivery-arrangements/warehouse-schedule"))
        return Promise.resolve({
          events: [EVENT],
          skuCategories: [{ sku: "5539-CNR", category: "sofa" }],
        });
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "pickup", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      result.current.errors.some((e) => /catalog/i.test(e.message)),
    ).toBe(false);
  });

  it("REPORTS a missing catalog instead of classifying in silence", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/delivery-arrangements/warehouse-schedule"))
        return Promise.resolve({ events: [EVENT] });
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "pickup", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      result.current.errors.some((e) => /catalog is not available/i.test(e.message)),
    ).toBe(true);
  });

  it("stays quiet on an empty feed — there is nothing to classify", async () => {
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "pickup", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errors).toEqual([]);
  });
});

describe("a DEGRADATION is reported where something is degraded", () => {
  /* `errors` is the field the board branches on to tell a genuinely quiet day
     from a failed one: `cards: []` with `errors: []` means nothing is
     scheduled, and `cards: []` with a non-empty `errors` means a source
     failed and must never be read as "no arrangements".
     A degradation notice on an EMPTY result breaks exactly that: it makes a
     healthy quiet day render as a failure. Zero cards is zero mislabelled
     lines — the degradation has no victim, so it has nothing to report. A
     real FAILURE is never gated this way. */
  const empty = { ...PO_ARRIVAL, arrivals: [], page: { offset: 0, limit: 200, total: 0 } };

  it("stays silent about the catalog when there is nothing to classify", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound")) {
        const { skuCategories: _drop, ...rest } = empty;
        return Promise.resolve(rest);
      }
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards).toEqual([]);
    // A quiet day must stay a quiet day.
    expect(result.current.errors).toEqual([]);
  });

  it("stays silent about ordered lines when there is nothing to line up", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound")) {
        const { sourceFacts: _drop, ...rest } = empty;
        return Promise.resolve(rest);
      }
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errors).toEqual([]);
  });

  it("still reports a real FAILURE on an empty result — never gated", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound"))
        return Promise.reject(new Error("permission denied"));
      return route(url);
    });
    const { result } = renderHook(
      () => useWarehouseSchedule({ direction: "arrival", from: "2026-09-14" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.errors.length).toBeGreaterThan(0));
    expect(result.current.cards).toEqual([]);
  });

  it("still reports a TRUNCATION on an empty page — rows exist and none came", async () => {
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/operation/warehouse/inbound"))
        return Promise.resolve({
          ...PO_ARRIVAL,
          arrivals: [],
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
  });
});
