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
  order_lines: [{ sku: "MS12", qty: 1, unit_price: 100 }],
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
    expect(body.facts[id(1)]).toMatchObject({ obligations: "none", cases: "none", stock: { MS12: "unknown" } });
    expect(body.facts[id(2)]).toMatchObject({ obligations: "outstanding", cases: "open", stock: { MS12: "unknown" } });
    expect(body.facts[id(3)]).toMatchObject({ obligations: "outstanding", cases: "closed", stock: { MS12: "unknown" } });
    expect(body.failed).toMatchObject({ obligations: false, cases: false });
  });

  it("an unreadable read leaves its fact unknown, never 'none'", async () => {
    mockSb({ orders: [order(1)], ops_stock_items: [unit(1, "sold", 1)] }, ["service_cases", "order_refunds"]);
    const res = await read();
    const body = (await res.json()) as { facts: Record<string, unknown>; failed: unknown };
    expect(body.facts[id(1)]).toMatchObject({ obligations: null, cases: null, stock: { MS12: "unknown" } });
    expect(body.failed).toMatchObject({ obligations: true, cases: true });
  });

  it("answers the Outright list's owner facts from each owner's own record", async () => {
    const pic = "22222222-2222-2222-2222-000000000001";
    mockSb({
      orders: [
        order(1, { ops_order_control: { assigned_staff: pic }, delivery_partner_id: "p-order" }),
        order(2, { ops_order_control: { assigned_staff: "33333333-3333-3333-3333-000000000002" } }),
      ],
      ops_stock_items: [{ ...unit(3, "reserved", 1), warehouse_id: "w1" }],
      app_users: [{ id: pic, name: "Shasha" }], // order 2's PIC is not readable to this caller
      po_line_sources: [
        { id: "s1", order_id: id(1), po_id: "po1", po_line_id: "pl1" },
        { id: "s2", order_id: id(2), po_id: "po2", po_line_id: "pl2" },
      ],
      purchase_orders: [{ id: "po1", do_number: " DO-778 " }, { id: "po2", do_number: null }],
      warehouse_receipts: [
        { id: "r1", po_id: "po1", grn_no: "GRN-11", lines: [{ id: "pl1", sku: "MS12" }], status: "posted" },
        { id: "r2", po_id: "po1", grn_no: "GRN-12", lines: [{ id: "pl-other", sku: "MS12" }], status: "posted" },
      ],
      ops_delivery_arrangements: [{ id: "a1", order_id: id(1), leg: 0, partner_id: "p-arr", confirmed_date: "2026-10-20", confirmed_time: "AM" }],
      ops_delivery_orders: [{ id: "do1", order_id: id(1), leg: 0, delivery_date: null, time_slot: null, issued_at: "2026-10-01T00:00:00Z", voided_at: null }],
      delivery_handover_events: [
        { id: "h1", delivery_order_id: "do1", kind: "ready_for_handover", recorded_at: "2026-10-02T01:00:00Z" },
        { id: "h2", delivery_order_id: "do1", kind: "handed_over", recorded_at: "2026-10-02T03:00:00Z" },
      ],
      delivery_partners: [{ id: "p-arr", name: "NETS" }],
      warehouses: [{ id: "w1", name: "Klang" }],
      order_finance_exceptions: [
        { id: "f1", order_id: id(1), status: "open", reason: "Cheque not cleared", opened_at: "2026-10-01T00:00:00Z" },
        { id: "f2", order_id: id(1), status: "open", reason: "Refund under review", opened_at: "2026-10-03T00:00:00Z" },
      ],
    });
    const res = await read();
    const body = (await res.json()) as { facts: Record<string, { owned: unknown }>; failed: unknown };
    expect(body.facts[id(1)].owned).toEqual({
      pic: { userId: pic, name: "Shasha" },
      poCount: 1,
      supplierDos: ["DO-778"],
      grns: ["GRN-11"], // GRN-12 counted another order's line
      delivery: { dateIso: "2026-10-20", time: "AM", source: "arrangement", partnerId: "p-arr", partnerName: "NETS" },
      loading: { hasDo: true, kind: "handed_over", at: "2026-10-02T03:00:00Z" },
      locations: ["Klang"],
      financeHold: { reason: "Refund under review" }, // the newest open one
    });
    expect(body.facts[id(2)].owned).toMatchObject({
      pic: { userId: "33333333-3333-3333-3333-000000000002", name: null },
      poCount: 1,
      supplierDos: [],
      grns: [],
      delivery: { dateIso: null, source: null, partnerId: null },
      loading: { hasDo: false, kind: null },
      financeHold: null,
    });
    expect(body.failed).toEqual({
      obligations: false, cases: false,
      pic: false, purchasing: false, delivery: false, loading: false, location: false, finance: false,
    });
  });

  it("a failed owner read is flagged, so the screen says it could not read — never 'not recorded' or 'no hold'", async () => {
    mockSb(
      { orders: [order(1, { ops_order_control: { assigned_staff: "x" } })] },
      ["order_finance_exceptions", "po_line_sources", "app_users", "ops_delivery_orders"],
    );
    const res = await read();
    const body = (await res.json()) as { failed: Record<string, boolean> };
    expect(body.failed).toMatchObject({ pic: true, purchasing: true, delivery: true, loading: true, finance: true, location: false });
  });

  it("is refused to a role that may not read the Register", async () => {
    mockSb({ orders: [] });
    const res = await read("dealer");
    expect(res.status).toBe(403);
  });
});
