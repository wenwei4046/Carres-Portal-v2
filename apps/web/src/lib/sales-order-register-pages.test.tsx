import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⭐ THE REGISTER HOLDS EVERY PAGE, OR NOTHING (SO A3-3, 2026-10-06).
 *
 * `useSalesOrderRegisterOrders` asks `GET /api/operation/orders?paged=1`,
 * follows `nextCursor` to the last page and only then answers — so the
 * Register can never count, sum, group or export a 500-order sample as if it
 * were the whole list. These tests drive the hook with a 1,203-order server
 * (three pages) and hold: every order arrives once, the first page's total is
 * kept, nothing is answered while a page is outstanding, one failed page
 * fails the read, and an older Worker without cursors still works.
 */
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, apiFetch };
});

import { fetchEverySalesOrderPage, useSalesOrderRegisterOrders, type operationOrdersListResponse } from "./queries";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const TOTAL = 1203;
const ORDERS = Array.from({ length: TOTAL }, (_, n) => ({ id: `order-${n}`, so: 20_000 - n }));
/** The server's contract: 500 per page, cursor = the page's last row. */
function serverPage(url: string): operationOrdersListResponse {
  const params = new URL(url, "http://t").searchParams;
  const after = params.get("after");
  const start = after === null ? 0 : ORDERS.findIndex((o) => o.id === after) + 1;
  const page = ORDERS.slice(start, start + 500);
  return {
    orders: page as never,
    ...(after === null ? { salesOrderTotal: TOTAL } : {}),
    nextCursor: page.length === 500 ? page[page.length - 1]!.id : null,
  };
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url: string) => serverPage(url));
});

describe("useSalesOrderRegisterOrders", () => {
  it("reads every page through the cursor and answers the whole population once", async () => {
    const { result } = renderHook(() => useSalesOrderRegisterOrders({ stage: "proceeded" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/operation/orders?stage=proceeded&paged=1",
      "/api/operation/orders?stage=proceeded&paged=1&after=order-499",
      "/api/operation/orders?stage=proceeded&paged=1&after=order-999",
    ]);
    expect(result.current.data!.orders.map((o) => o.id)).toEqual(ORDERS.map((o) => o.id));
    expect(result.current.data!.salesOrderTotal).toBe(TOTAL);
  });

  it("carries the search on every page", async () => {
    const { result } = renderHook(() => useSalesOrderRegisterOrders({ stage: "proceeded", search: "019-833 72393" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const [url] of apiFetch.mock.calls) {
      const params = new URL(url as string, "http://t").searchParams;
      expect(params.get("search")).toBe("019-833 72393");
      expect(params.get("stage")).toBe("proceeded");
      expect(params.get("paged")).toBe("1");
    }
  });

  it("answers nothing while a later page is still loading", async () => {
    let releaseLast: () => void = () => {};
    apiFetch.mockImplementation(async (url: string) => {
      const page = serverPage(url);
      if (url.includes("after=order-999")) await new Promise<void>((resolve) => { releaseLast = resolve; });
      return page;
    });
    const { result } = renderHook(() => useSalesOrderRegisterOrders({ stage: "proceeded" }), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    /* Two full pages are in the browser — and still nothing is answered. */
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    releaseLast();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.orders).toHaveLength(TOTAL);
  });

  it("one failed page fails the read — never a partial list", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url.includes("after=order-499")) throw new Error("read failed");
      return serverPage(url);
    });
    const { result } = renderHook(() => useSalesOrderRegisterOrders({ stage: "proceeded" }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("fetchEverySalesOrderPage", () => {
  it("an older Worker that ignores `paged` answers one page and the walk stops", async () => {
    const read = vi.fn(async () => ({ orders: ORDERS.slice(0, 500) as never, salesOrderTotal: TOTAL }));
    const all = await fetchEverySalesOrderPage(read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(all.orders).toHaveLength(500);
    expect(all.salesOrderTotal).toBe(TOTAL);
  });

  it("an order repeated across two pages is listed once", async () => {
    const pages: operationOrdersListResponse[] = [
      { orders: [ORDERS[0], ORDERS[1]] as never, salesOrderTotal: 3, nextCursor: "c1" },
      { orders: [ORDERS[1], ORDERS[2]] as never, nextCursor: null },
    ];
    const all = await fetchEverySalesOrderPage(async () => pages.shift()!);
    expect(all.orders.map((o) => o.id)).toEqual(["order-0", "order-1", "order-2"]);
    expect(all.salesOrderTotal).toBe(3);
  });

  it("a cursor that does not move on is an error, never an endless read", async () => {
    const read = vi.fn(async () => ({ orders: ORDERS.slice(0, 500) as never, nextCursor: "stuck" }));
    await expect(fetchEverySalesOrderPage(read)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("an unknown first-page total stays unknown, never a later page's", async () => {
    const pages: operationOrdersListResponse[] = [
      { orders: [ORDERS[0]] as never, salesOrderTotal: null, nextCursor: "c1" },
      { orders: [ORDERS[1]] as never, salesOrderTotal: 99, nextCursor: null },
    ];
    const all = await fetchEverySalesOrderPage(async () => pages.shift()!);
    expect(all.salesOrderTotal).toBeNull();
  });
});
