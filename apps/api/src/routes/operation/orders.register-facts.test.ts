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

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const order = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  so: 1000 + n,
  status: "proceed_order",
  paid: 100,
  delivery_date: "2099-01-01",
  order_lines: [{ id: "line-1", sku: "MS12", qty: 1, unit_price: 100 }],
  order_addons: [],
  ops_order_control: null,
  ...over,
});
const unit = (n: number, status: "sold" | "reserved", orderN: number) => ({
  id: `u${n}`, unit_code: `U${n}`, sku: "MS12", status, condition: "new", warehouse_id: null, po_no: null,
  qty: 1, date_in: null, sold_at: status === "sold" ? "2026-09-01" : null,
  reserved_ref: status === "reserved" ? `SO-${1000 + orderN}` : null,
  sold_order_id: status === "sold" ? id(orderN) : null,
});

/** Each table answers its rows; `ops_stock_items` answers by its `status` filter. */
function mockSb(rows: Record<string, unknown[]>, fail: string[] = []) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    let status: unknown = null;
    for (const method of ["select", "eq", "in", "or", "not", "order", "range"]) {
      chain[method] = vi.fn((...args: unknown[]) => {
        if (method === "eq" && args[0] === "status") status = args[1];
        return chain;
      });
    }
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (fail.includes(table)) return resolve({ data: null, error: { code: "XX000", message: "boom" } });
      const all = rows[table] ?? [];
      const data = table === "ops_stock_items" ? all.filter((u) => (u as { status: unknown }).status === status) : all;
      return resolve({ data, error: null });
    };
    return chain;
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
}

const read = async (role = "operation") =>
  app.fetch(
    new Request("http://t/api/operation/orders/register-facts", {
      headers: { Authorization: `Bearer ${await jwt(role)}` },
    }),
    env,
  );

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/orders/register-facts", () => {
  it("answers each order's obligations through the object page's completion, and its cases from Service", async () => {
    mockSb({
      orders: [
        order(1),                     // paid, delivered, no case → nothing owed
        order(2, { paid: 40 }),       // delivered, RM 60 still owed
        order(3),                     // paid, not delivered
      ],
      ops_stock_items: [unit(1, "sold", 1), unit(2, "sold", 2), unit(3, "reserved", 3)],
      receiving_unit_results: [{ id: "r1", stock_item_id: "u1", outcome: "received" }, { id: "r2", stock_item_id: "u2", outcome: "received_with_issue" }],
      service_cases: [
        { id: "c1", order_id: id(2), status: { is_closed: false } },
        { id: "c2", order_id: id(3), status: { is_closed: true } },
      ],
    });
    const res = await read();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facts: Record<string, unknown>; failed: unknown };
    /* Stock Status reads the same Units: delivered and reserved goods are Ready. */
    const ready = expect.objectContaining({ status: "ready", requiredQty: 1, usableQty: 1 });
    expect(body.facts[id(1)]).toEqual({ obligations: "none", cases: "none", stock: ready });
    expect(body.facts[id(2)]).toEqual({ obligations: "outstanding", cases: "open", stock: ready });
    expect(body.facts[id(3)]).toEqual({ obligations: "outstanding", cases: "closed", stock: ready });
    expect(body.failed).toEqual({ obligations: false, cases: false, stock: false });
  });

  it("an unreadable read leaves its fact unknown, never 'none'", async () => {
    mockSb({ orders: [order(1)], ops_stock_items: [unit(1, "sold", 1)] }, ["service_cases", "order_refunds"]);
    const res = await read();
    const body = (await res.json()) as { facts: Record<string, unknown>; failed: unknown };
    expect(body.facts[id(1)]).toEqual({ obligations: null, cases: null, stock: expect.objectContaining({ status: "ready" }) });
    expect(body.failed).toEqual({ obligations: true, cases: true, stock: false });
  });

  it("a failed Unit read leaves Stock Status unknown for every order, never a status", async () => {
    mockSb({ orders: [order(1)] }, ["ops_stock_items"]);
    const body = (await (await read()).json()) as { facts: Record<string, { stock: unknown }>; failed: unknown };
    expect(body.facts[id(1)]!.stock).toBeNull();
    expect(body.failed).toEqual({ obligations: true, cases: false, stock: true });
  });

  it("is refused to a role that may not read the Register", async () => {
    mockSb({ orders: [] });
    const res = await read("dealer");
    expect(res.status).toBe(403);
  });
});
