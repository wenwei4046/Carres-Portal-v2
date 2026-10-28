import { describe, expect, it, vi } from "vitest";
import { findSalesOrderDocuments } from "./sales-order-document-search";
import type { userClient } from "./supabase";

function client(rows: Record<string, unknown[]>, failed?: string) {
  const calls: Array<{ table: string; field: string; term: string; start: number }> = [];
  const sb = { from: (table: string) => {
    let field = "", term = "";
    const q = { select: vi.fn(() => q), order: vi.fn(() => q),
      ilike: vi.fn((f: string, t: string) => { field = f; term = t; return q; }),
      range: vi.fn(async (start: number, end: number) => {
        calls.push({ table, field, term, start });
        return { data: (rows[table] ?? []).slice(start, end + 1), error: table === failed ? { code: "42501", message: "denied" } : null };
      }),
    }; return q;
  } } as unknown as ReturnType<typeof userClient>;
  return { sb, calls };
}

describe("SO document discovery", () => {
  it("finds historical/multiple documents and every allocated SO without inventing amendment numbers", async () => {
    const { sb, calls } = client({
      purchase_orders: [{ so: 1301, so_refs: [1302, 1301] }],
      ops_delivery_orders: [{ order_id: "o1" }], invoices: [{ order_id: "o2" }],
      order_payments: [{ order_id: "o3", payment_allocations: [{ order_id: "o4" }, { order_id: "o3" }] }],
    });
    const result = await findSalesOrderDocuments(sb, "rc-123");
    expect(result.orderIds.sort()).toEqual(["o1", "o2", "o3", "o4"]);
    expect(result.soNumbers.sort()).toEqual([1301, 1302]);
    expect(calls.map(c => c.table)).not.toContain("sales_order_amendments");
    expect(calls.every(c => c.term === "%RC-123%")).toBe(true);
  });
  it("continues beyond a page of receipts belonging to the same order", async () => {
    const rows = Array.from({ length: 1000 }, () => ({ order_id: "same" }));
    const { sb, calls } = client({ order_payments: [...rows, { order_id: "late" }] });
    expect((await findSalesOrderDocuments(sb, "RC")).orderIds.sort()).toEqual(["late", "same"]);
    expect(calls.filter(c => c.table === "order_payments").map(c => c.start)).toEqual([0, 1000]);
  });
  it("fails closed on a denied document read instead of reporting no match", async () => {
    const { sb } = client({}, "invoices");
    await expect(findSalesOrderDocuments(sb, "INV-1")).rejects.toMatchObject({ code: "42501" });
  });
  it("does not build query grammar from punctuation", async () => {
    const { sb, calls } = client({});
    await expect(findSalesOrderDocuments(sb, "),{}%_")).resolves.toEqual({ orderIds: [], soNumbers: [] });
    expect(calls).toHaveLength(0);
  });
});
