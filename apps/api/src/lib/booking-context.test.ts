import { describe, expect, it } from "vitest";
import { orderMoney } from "@carres/shared";
import { bookingMoneyOf } from "./booking-context";

/** 0732 — a credit note lowers what the Delivery Order gate holds, not only
 *  what Finance prints (audit 2026-10-29: SO RM 3,000, paid 2,800, credit 200). */
describe("bookingMoneyOf · credited", () => {
  const rows = {
    lines: [{ sku: "mattress:M1401F-K", qty: 1, unit_price: 3000 }],
    addons: [],
    paid: 2800,
    control: null,
    invoices: [],
    storageCategories: new Map<string, string>(),
    asOf: "2026-10-29",
  };

  it("holds RM 200 with no credit note", () => {
    expect(orderMoney(bookingMoneyOf(rows)).holding).toBe(200);
  });

  it("holds nothing once RM 200 is credited", () => {
    const m = orderMoney(bookingMoneyOf({ ...rows, credited: "200.00" }));
    expect(m.holding).toBe(0);
    expect(m.holds).toBe(false);
  });
});
