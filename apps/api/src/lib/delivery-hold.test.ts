/**
 * `heldDeliveryScopes` — the `Hold delivery` yes/no for the NETS portal and the
 * external link (owner ruling 2026-09-25, Delivery MASTER §3).
 *
 * What the routes' own tests do not reach: a Journey leg's Scheduled day, the
 * storage money the DO gate counts (and the Monitor list does not), and the
 * read budget.
 */
import { describe, expect, it, vi } from "vitest";
import { heldDeliveryScopes, holdKey } from "./delivery-hold";

vi.mock("./today", () => ({ todayIsoMYT: () => "2026-10-19" }));

const A = "00000000-0000-0000-0000-0000000a0001";

function sbWith(rows: unknown[]) {
  const tables: string[] = [];
  const from = vi.fn().mockImplementation((table: string) => {
    tables.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) chain[m] = vi.fn().mockImplementation(() => chain);
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "orders" ? rows : [], error: null }).then(resolve);
    return chain;
  });
  return { sb: { from }, tables };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: A,
  paid: 1200,
  delivery_stops: null,
  order_lines: [{ sku: "mattress:M1401F-K", qty: 1, unit_price: 1200 }],
  order_addons: [],
  ops_order_control: null,
  invoices: [],
  order_finance_exceptions: [],
  order_delivery_payment_approvals: [],
  ops_delivery_orders: [],
  ...over,
});

describe("heldDeliveryScopes", () => {
  it("no scopes, no reads", async () => {
    const { sb, tables } = sbWith([]);
    expect((await heldDeliveryScopes(sb, [])).size).toBe(0);
    expect(tables).toEqual([]);
  });

  it("a Journey leg is Scheduled by the day on its recorded stop", async () => {
    const { sb } = sbWith([
      row({
        paid: 0,
        delivery_stops: [
          { leg: 1, scheduled_at: "2026-10-20T02:00:00Z" },
          { leg: 2, scheduled_at: null },
        ],
      }),
    ]);
    const held = await heldDeliveryScopes(sb, [
      { orderId: A, leg: 1, arrangement: null },
      { orderId: A, leg: 2, arrangement: null },
    ]);
    expect([...held]).toEqual([holdKey(A, 1)]);
  });

  it("counts an issued storage invoice the way the DO gate does", async () => {
    const { sb } = sbWith([
      row({ invoices: [{ kind: "storage", status: "issued", amount: 50, tax_amount: 0, voided_at: null }] }),
    ]);
    const held = await heldDeliveryScopes(sb, [{ orderId: A, leg: 0, arrangement: { confirmedDate: "2026-10-20", confirmedTime: null } }]);
    expect(held.has(holdKey(A, 0))).toBe(true);
  });

  it("a paid order with nothing open is not held", async () => {
    const { sb } = sbWith([row()]);
    const held = await heldDeliveryScopes(sb, [{ orderId: A, leg: 0, arrangement: { confirmedDate: "2026-10-20", confirmedTime: null } }]);
    expect(held.size).toBe(0);
  });

  it("a provisional carrier date is not a Scheduled delivery", async () => {
    const { sb } = sbWith([
      row({ paid: 0, ops_order_control: { booking_stage: "provisional", confirmed_date: null, logistic_eta: "2026-10-20" } }),
    ]);
    const held = await heldDeliveryScopes(sb, [{ orderId: A, leg: 0, arrangement: null }]);
    expect(held.size).toBe(0);
  });

  it("a failed read throws for the route to answer", async () => {
    const from = vi.fn().mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) chain[m] = vi.fn().mockImplementation(() => chain);
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
      return chain;
    });
    await expect(heldDeliveryScopes({ from }, [{ orderId: A, leg: 0, arrangement: null }])).rejects.toMatchObject({ message: "boom" });
  });
});
