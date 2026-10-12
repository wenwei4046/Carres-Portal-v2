import { describe, expect, it } from "vitest";
import type { PurchaseDemandRow } from "@carres/shared";
import { BY_SUPPLIER, daysBetween, supplierGroups } from "./by-supplier";

/**
 * SO Batch Purchase · By supplier (owner 12 Oct 2026). One row per supplier
 * and category, built only from what the SO Batch read already carries.
 * Every name below is TEST data.
 */
const row = (over: Partial<PurchaseDemandRow> & { id: string }): PurchaseDemandRow => ({
  state: "safety_days_full", lineIds: [`${over.id}-l`], orderId: "o-1", so: 1001, customer: "TEST customer A",
  customerDelivery: "2026-11-20", orderBy: "2026-10-16", safetyDaysLeft: 4, item: "TEST Model A", variant: "King",
  category: "mattress", skus: ["TEST-SKU"], supplierId: "s-1", supplier: "TEST Supplier One", qtyNeeded: 1,
  readyStock: 0, takenFromStock: 0, onPo: 0, poNumbers: [], toBuy: 1, goodsMustArrive: "2026-11-13",
  issueRef: { proposalKey: "p", buildKey: "b" }, action: null, parts: [], poDate: "2026-10-12",
  poDeliveryDate: "2026-10-21", poDeliveryWorkingDays: 7, supplierKind: "factory_pickup", ownerName: null,
  ownerDuty: null, poWindow: "2026-10-12T11:30", ...over,
} as PurchaseDemandRow);

describe("By supplier: one row per supplier and category", () => {
  it("a supplier with two categories is two rows, as its POs are", () => {
    const groups = supplierGroups([
      row({ id: "a", category: "bedframe", supplierId: "s-2", supplier: "TEST Supplier Two" }),
      row({ id: "b", category: "sofa", supplierId: "s-2", supplier: "TEST Supplier Two" }),
      row({ id: "c" }),
    ], "2026-10-12T09:00");
    expect(groups.map((g) => `${g.supplier} · ${g.category}`)).toEqual([
      "TEST Supplier One · mattress", "TEST Supplier Two · bedframe", "TEST Supplier Two · sofa",
    ]);
  });

  it("adds up what is still to buy, counts models and lists each sales order once", () => {
    const [g] = supplierGroups([
      row({ id: "a", toBuy: 2, item: "TEST Model A", orderId: "o-1", so: 1001 }),
      row({ id: "b", toBuy: 3, item: "TEST Model B", orderId: "o-1", so: 1001 }),
      row({ id: "c", toBuy: 1, item: "TEST Model B", orderId: "o-2", so: 1002 }),
      row({ id: "d", toBuy: 0, item: "TEST Model C", orderId: "o-3", so: 1003 }), // nothing left to buy
    ], "2026-10-12T09:00");
    expect(g!.qty).toBe(6);
    expect(g!.models).toBe(2);
    expect(g!.orders).toEqual([{ orderId: "o-1", so: 1001 }, { orderId: "o-2", so: 1002 }]);
    expect(g!.lines.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("the deadline is the earliest Order By, and ready by the latest PO Delivery Date", () => {
    const [g] = supplierGroups([
      row({ id: "a", orderBy: "2026-10-16", poDeliveryDate: "2026-10-21" }),
      row({ id: "b", orderBy: "2026-10-07", poDeliveryDate: "2026-10-23" }),
      row({ id: "c", orderBy: null, poDeliveryDate: null }),
    ], "2026-10-12T09:00");
    expect(g!.orderBy).toBe("2026-10-07");
    expect(g!.readyBy).toBe("2026-10-23");
  });

  it("a PO window that has gone by marks the row, and such rows come first", () => {
    const groups = supplierGroups([
      row({ id: "a", supplierId: "s-1", supplier: "TEST Supplier One", poWindow: "2026-10-12T16:00" }),
      row({ id: "b", supplierId: "s-9", supplier: "TEST Supplier Zed", poWindow: "2026-10-12T11:30" }),
    ], "2026-10-12T12:00");
    expect(groups.map((g) => [g.supplier, g.cutOffPassed])).toEqual([
      ["TEST Supplier Zed", true], ["TEST Supplier One", false],
    ]);
  });

  it("goods with no supplier are their own row and say what to do", () => {
    const [g] = supplierGroups([row({ id: "a", supplierId: null, supplier: null, supplierKind: null })], "2026-10-12T09:00");
    expect(g!.supplier).toBeNull();
    expect(BY_SUPPLIER.supplierLine(g!)).toBe("Set the supplier in Catalog");
  });

  it("production days show only when every line agrees", () => {
    const [same] = supplierGroups([row({ id: "a" }), row({ id: "b" })], "2026-10-12T09:00");
    const [mixed] = supplierGroups([row({ id: "a" }), row({ id: "b", poDeliveryWorkingDays: 14 })], "2026-10-12T09:00");
    expect(BY_SUPPLIER.supplierLine(same!)).toBe("We collect · 7d");
    expect(BY_SUPPLIER.supplierLine(mixed!)).toBe("We collect");
  });
});

describe("By supplier: the words", () => {
  it("a sofa is counted in sets, everything else in pieces", () => {
    expect(BY_SUPPLIER.qty("sofa", 1)).toBe("1 set");
    expect(BY_SUPPLIER.qty("sofa", 4)).toBe("4 sets");
    expect(BY_SUPPLIER.qty("mattress", 1)).toBe("1 pc");
    expect(BY_SUPPLIER.qty("bedframe", 20)).toBe("20 pcs");
  });

  it("the deadline says days left, Today, or days late: never Overdue or Missed", () => {
    expect(BY_SUPPLIER.deadline(daysBetween("2026-10-12", "2026-10-16"))).toBe("4 days left");
    expect(BY_SUPPLIER.deadline(daysBetween("2026-10-12", "2026-10-13"))).toBe("1 day left");
    expect(BY_SUPPLIER.deadline(daysBetween("2026-10-12", "2026-10-12"))).toBe("Today");
    expect(BY_SUPPLIER.deadline(daysBetween("2026-10-12", "2026-10-11"))).toBe("1 day late");
    expect(BY_SUPPLIER.deadline(daysBetween("2026-10-12", "2026-10-07"))).toBe("5 days late");
    expect(JSON.stringify(BY_SUPPLIER)).not.toMatch(/overdue|missed/i);
  });

  it("one sales order shows its number, several show the first and how many more", () => {
    const ref = (so: number | null) => (so == null ? "Not recorded" : `SO-${so}`);
    expect(BY_SUPPLIER.orderRefs([{ orderId: "o-1", so: 1001 }], ref)).toBe("SO-1001");
    expect(BY_SUPPLIER.orderRefs([{ orderId: "o-1", so: 1001 }, { orderId: "o-2", so: 1002 }, { orderId: "o-3", so: 1003 }], ref)).toBe("SO-1001 +2");
  });

  it("the footer counts groups and suppliers", () => {
    expect(BY_SUPPLIER.footer(4, 3)).toBe("4 groups · 3 suppliers");
    expect(BY_SUPPLIER.footer(1, 1)).toBe("1 group · 1 supplier");
  });
});
