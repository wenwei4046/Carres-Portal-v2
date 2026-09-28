import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/sku-categories", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  skuCategories: vi.fn(async () => new Map([["MS12", "mattress"]])),
}));

import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const jwt = (role: string) =>
  signTestJwt("11111111-1111-1111-1111-000000000999", { email: `${role}@carres.com`, app_metadata: { role } });

const row = (n: number) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  so: 1000 + n,
  delivery_date: "2026-10-12",
  delivery_date_tbd: false,
  customer_address_state: "Selangor",
  customer_address_city: "Petaling Jaya",
  outlets: { name: "PJ Showroom" },
  dealers: { name: "Carres HQ" },
  order_lines: [{ id: `l${n}`, sku: "MS12", qty: 1, attrs: null }],
});

/** `orders` answers page by page from `pages`; `ops_stock_items` answers `sold`. */
function mockSb(pages: unknown[][], sold: unknown[] = [], fail: string[] = []) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  let page = 0;
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "or", "not", "order", "range"]) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      });
    }
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (fail.includes(table)) return resolve({ data: null, error: { code: "XX000", message: "boom" } });
      if (table === "orders") return resolve({ data: pages[page++] ?? [], error: null });
      if (table === "ops_stock_items") return resolve({ data: sold, error: null });
      return resolve({ data: [], error: null });
    };
    return chain;
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
  return { calls };
}

const read = async (role = "operation") =>
  app.fetch(
    new Request("http://t/api/operation/orders/monthly-demand", {
      headers: { Authorization: `Bearer ${await jwt(role)}` },
    }),
    env,
  );

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/orders/monthly-demand", () => {
  it("is not mistaken for an order id", async () => {
    mockSb([[row(1)]]);
    const res = await read();
    expect(res.status).toBe(200);
  });

  it("returns every order of the Register's population as the facts the arithmetic needs", async () => {
    mockSb([[row(1)]], [{ sku: "MS12", qty: 1, sold_order_id: row(1).id, reserved_order_line_id: "l1" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await read()).json()) as any;
    expect(body.orders).toEqual([
      {
        id: row(1).id,
        so: 1001,
        deliveryDate: "2026-10-12",
        deliveryDateTbd: false,
        salesLocation: "PJ Showroom",
        state: "Selangor",
        city: "Petaling Jaya",
        lines: [{ id: "l1", sku: "MS12", qty: 1, category: "mattress", attrs: null }],
        delivered: [{ orderLineId: "l1", sku: "MS12", qty: 1 }],
      },
    ]);
  });

  it("⭐ reads PAST the list's 500-row cap: it pages until a page comes back short", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => row(i + 1));
    const { calls } = mockSb([full, [row(1001), row(1002)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await read()).json()) as any;
    expect(body.orders).toHaveLength(1002);
    const ranges = calls.filter((c) => c.table === "orders" && c.method === "range").map((c) => c.args);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(calls.some((c) => c.table === "orders" && c.method === "limit")).toBe(false);
  });

  it("uses the Register's ONE population predicate", async () => {
    const { calls } = mockSb([[row(1)]]);
    await read();
    expect(calls).toContainEqual({ table: "orders", method: "not", args: ["status", "in", "(place,cancelled)"] });
    expect(calls).toContainEqual({
      table: "orders",
      method: "or",
      args: ["source_system.is.null,source_system.neq.rental"],
    });
  });

  it("a failed read of the delivered Units is a failure — never zero delivered", async () => {
    mockSb([[row(1)]], [], ["ops_stock_items"]);
    expect((await read()).status).toBeGreaterThanOrEqual(400);
  });

  it("refuses a role outside Operation", async () => {
    mockSb([[row(1)]]);
    expect((await read("dealer")).status).toBe(403);
  });
});
