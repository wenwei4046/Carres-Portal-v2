import { describe, expect, it } from "vitest";
import { collectionQuery, collectionReport, pctWord, type CollectionAnswer, type CollectionOrderWire } from "./collection";

const order = (over: Partial<CollectionOrderWire>): CollectionOrderWire => ({
  id: "o", so: 1401, placed_on: "2026-09-05", status: "proceed_order", customer_name: "LIM KUAN YANG",
  salesperson_id: "s1", salesperson_name: "Aina", channel: "showroom", dealer_name: "PJ Showroom",
  order_value: "2000.00", deposit: "1000.00", balance_paid: "0.00", invoice_no: null, billed: null, issued_at: null,
  delivered: false, ...over,
});
const answer = (orders: CollectionOrderWire[]): CollectionAnswer => ({ from: "2026-09-01", to: "2026-09-30", orders });

describe("the Collection report", () => {
  it("adds each salesperson's orders and deposit, largest value first", () => {
    const r = collectionReport(answer([
      order({ id: "a" }),
      order({ id: "b", so: 1402, order_value: "3000.00", deposit: "600.00" }),
      order({ id: "c", so: 1403, salesperson_id: "s2", salesperson_name: "Boon", order_value: "800.00", deposit: "800.00" }),
    ]), 50);
    expect(r.rows.map((x) => [x.name, x.orders, x.value, x.deposit, pctWord(x.depositBp), x.below])).toEqual([
      ["Aina", 2, 500000, 160000, "32.0%", 1],
      ["Boon", 1, 80000, 80000, "100.0%", 0],
    ]);
    expect(r.total).toMatchObject({ orders: 3, value: 580000, deposit: 240000, below: 1 });
  });

  it("the threshold decides which orders are below it; a zero-value order never is", () => {
    const list = [order({ id: "a", deposit: "1000.00" }), order({ id: "z", order_value: "0", deposit: "0" })];
    expect(collectionReport(answer(list), 50).total.below).toBe(0);
    expect(collectionReport(answer(list), 60).total.below).toBe(1);
    expect(collectionReport(answer(list), 0).total.below).toBe(0); // reads as 50
  });

  it("for delivered orders: balance due, balance paid, balance % and what is still owed", () => {
    const r = collectionReport(answer([
      order({ id: "d", delivered: true, invoice_no: "INV-1", billed: "2100.00", deposit: "1000.00", balance_paid: "600.00" }),
      order({ id: "e", delivered: true, billed: null, order_value: "500.00", deposit: "700.00", balance_paid: "0" }),
      order({ id: "n", delivered: false, deposit: "200.00" }),
    ]), 50);
    expect(r.total.delivered).toEqual({
      orders: 2, billed: 260000, deposit: 170000,
      balanceDue: 110000,        // 1,100 on the first; nothing on the second, never below 0
      balancePaid: 60000, balanceBp: 5455, outstanding: 30000, // 500 still owed, 200 paid over
    });
    expect(pctWord(r.total.delivered.balanceBp)).toBe("54.5%");
  });

  it("an order with no salesperson is grouped on its own", () => {
    const r = collectionReport(answer([order({ salesperson_id: null, salesperson_name: null })]), 50);
    expect(r.rows[0]).toMatchObject({ key: "none", name: null, orders: 1 });
  });

  it("refuses a figure it cannot read, and a period that runs backwards", () => {
    expect(() => collectionReport(answer([order({ deposit: "abc" })]), 50)).toThrow("A money figure could not be read.");
    expect(collectionQuery.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success).toBe(false);
    expect(pctWord(null)).toBe("");
  });
});
