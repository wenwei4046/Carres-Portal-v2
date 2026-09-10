import { describe, expect, it } from "vitest";
import { inOrderScope, orderScopeOf, scopedRegisterHref } from "./payment-register-scope";

describe("the Register's order scope", () => {
  it("reads an SO No off the URL", () => {
    expect(orderScopeOf("1319")).toBe(1319);
    expect(orderScopeOf(" 1319 ")).toBe(1319);
  });

  it("is absent when nothing is scoped", () => {
    expect(orderScopeOf(null)).toBeNull();
    expect(orderScopeOf("")).toBeNull();
    expect(orderScopeOf("   ")).toBeNull();
  });

  /* An SO No is a positive integer. A UUID reaching this parameter is the
     collision the `?order=` name exists to avoid — the Invoices Register
     already spends `?so=` on the §17 Calendar's highlighted order, and that
     one holds `order_id`. */
  it("refuses anything that is not an SO No", () => {
    expect(orderScopeOf("6f0cb89e-1234-4000-8000-000000000000")).toBeNull();
    expect(orderScopeOf("SO-1319")).toBeNull();
    expect(orderScopeOf("-1")).toBeNull();
    expect(orderScopeOf("0")).toBeNull();
    expect(orderScopeOf("1.5")).toBeNull();
  });

  it("keeps only the scoped order's rows", () => {
    const mine = { orders: { so: 1319 } };
    const other = { orders: { so: 1320 } };
    const orphan = { orders: null };
    expect(inOrderScope(mine, 1319)).toBe(true);
    expect(inOrderScope(other, 1319)).toBe(false);
    expect(inOrderScope(orphan, 1319)).toBe(false);
  });

  it("shows every row when nothing is scoped — an orphan included", () => {
    expect(inOrderScope({ orders: null }, null)).toBe(true);
    expect(inOrderScope({ orders: { so: 1320 } }, null)).toBe(true);
  });

  /* Losing the scope on the toolbar's `Payments · Invoices` switch would make
     the second listing answer a different question than the first. */
  it("carries the scope across the toolbar switch", () => {
    expect(scopedRegisterHref("/finance/invoices", 1319)).toBe("/finance/invoices?order=1319");
    expect(scopedRegisterHref("/finance/invoices", null)).toBe("/finance/invoices");
  });
});
