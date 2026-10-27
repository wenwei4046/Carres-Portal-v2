import { describe, it, expect } from "vitest";
import { orderMoney } from "../routes/ops/customer-consignment";

/**
 * Customer Consignment Order money: total, paid and balance, like Houzs's
 * local_total / paid / balance (Houzs consignment-orders.ts:286-300), per
 * Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
 */
describe("orderMoney", () => {
  it("sums prices and payments in sen so RM never drifts", () => {
    expect(orderMoney([{ price: "0.10" }, { price: 0.2 }], [{ amount: "0.10" }])).toEqual({ total: 0.3, paid: 0.1, balance: 0.2 });
  });

  it("an order with no payments owes its whole total", () => {
    expect(orderMoney([{ price: "1200.00" }, { price: "899.50" }], [])).toEqual({ total: 2099.5, paid: 0, balance: 2099.5 });
  });

  it("like Houzs, an overpayment shows as a negative balance", () => {
    expect(orderMoney([{ price: 100 }], [{ amount: 150 }]).balance).toBe(-50);
  });
});
