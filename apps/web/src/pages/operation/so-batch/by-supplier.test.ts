import { describe, expect, it } from "vitest";
import type { PurchaseDemandRow, SoBatchOrderRow } from "@carres/shared";
import { BY_SUPPLIER, daysBetween, orderedSupplierGroups, supplierGroups, toBuyByCategory, todayNumbers } from "./by-supplier";

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

/** A Sales Order as the Register reads it. TEST data. */
const order = (over: Partial<SoBatchOrderRow> & { orderId: string }): SoBatchOrderRow => ({
  so: 1001, customer: "TEST customer A", status: "ordered", proceededAt: null, requestedDeliveryDate: null,
  deliveryCity: null, deliveryState: null, pos: [], lines: [], outstandingSuppliers: [], ...over,
} as SoBatchOrderRow);

describe("Ordered: what is already on a PO, by supplier and category", () => {
  const orders = [
    order({
      orderId: "o-1", so: 1001,
      pos: [
        { poId: "PO-20261001-0001", status: "open", supplierId: "s-1", supplierName: "TEST Supplier One", destinationId: null, officialDeliveryDate: "2026-10-20", sentCurrentVersion: true },
        { poId: "PO-20261002-0002", status: "open", supplierId: "s-2", supplierName: "TEST Supplier Two", destinationId: null, officialDeliveryDate: "2026-10-28", sentCurrentVersion: false },
      ],
      lines: [
        { orderLineId: "l-1", sku: "TEST-A", qty: 3, stockTaken: 0, item: "TEST Model A", variant: "King", category: "mattress", pos: [{ poId: "PO-20261001-0001", qty: 2 }] },
        { orderLineId: "l-2", sku: "TEST-B", qty: 1, stockTaken: 0, item: "TEST Model B", variant: null, category: "sofa", pos: [{ poId: "PO-20261002-0002", qty: 1 }] },
        { orderLineId: "l-3", sku: "TEST-C", qty: 1, stockTaken: 0, item: "TEST Model C", variant: null, category: "mattress", pos: [] },
      ],
    } as Partial<SoBatchOrderRow> & { orderId: string }),
    order({
      orderId: "o-2", so: 1002,
      pos: [{ poId: "PO-20261003-0003", status: "open", supplierId: "s-1", supplierName: "TEST Supplier One", destinationId: null, officialDeliveryDate: "2026-10-24", sentCurrentVersion: true }],
      lines: [{ orderLineId: "l-4", sku: "TEST-A", qty: 1, stockTaken: 0, item: "TEST Model A", variant: "King", category: "mattress", pos: [{ poId: "PO-20261003-0003", qty: 1 }] }],
    } as Partial<SoBatchOrderRow> & { orderId: string }),
  ];

  it("counts the quantity on POs, never the line's whole quantity or a line with no PO", () => {
    const groups = orderedSupplierGroups(orders);
    expect(groups.map((g) => `${g.supplier} · ${g.category} · ${g.qty}`)).toEqual([
      "TEST Supplier One · mattress · 3", "TEST Supplier Two · sofa · 1",
    ]);
    const one = groups[0]!;
    expect(one.ordered!.poIds).toEqual(["PO-20261001-0001", "PO-20261003-0003"]);
    expect(one.orders.map((o) => o.so)).toEqual([1001, 1002]);
    expect(one.readyBy).toBe("2026-10-24"); // the latest PO Delivery Date
    expect(one.lines).toEqual([]); // nothing to tick
    expect(one.ordered!.lines.map((l) => `${l.item} x${l.qty} ${l.poId}`)).toEqual([
      "TEST Model A x2 PO-20261001-0001", "TEST Model A x1 PO-20261003-0003",
    ]);
  });

  it("an ordered group can never be mistaken for one to buy", () => {
    const [g] = orderedSupplierGroups(orders);
    expect(g!.key.startsWith("ordered|")).toBe(true);
    expect(g!.cutOffPassed).toBe(false);
    expect(toBuyByCategory([g!])).toEqual([]);
  });
});

describe("the footer totals and the Today card read the same lines", () => {
  const rows = [
    row({ id: "a", toBuy: 2, category: "sofa", supplierId: "s-2", supplier: "TEST Supplier Two", poWindow: "2026-10-12T11:00", orderBy: "2026-10-10" }),
    row({ id: "b", toBuy: 3, category: "mattress", poWindow: "2026-10-12T11:00", orderBy: "2026-10-16" }),
    row({ id: "c", toBuy: 4, category: "mattress", poWindow: "2026-10-12T16:00", orderBy: "2026-10-12" }),
    row({ id: "d", toBuy: 0, category: "bedframe", poWindow: "2026-10-12T11:00", orderBy: "2026-10-01" }),
  ];

  it("totals what is still to buy per category, in the approved order", () => {
    const totals = toBuyByCategory(supplierGroups(rows, "2026-10-12T09:00"));
    expect(totals).toEqual([{ category: "mattress", qty: 7 }, { category: "sofa", qty: 2 }]);
    expect(BY_SUPPLIER.toBuyTotals(totals)).toBe("To buy: Mattress 7 pcs · Sofa 2 sets");
    expect(BY_SUPPLIER.toBuyTotals([])).toBe("");
  });

  it("To order now is what is still to buy after its PO window has gone by", () => {
    const morning = todayNumbers(rows, "2026-10-12T09:00", "2026-10-12", ["11:00", "16:00"]);
    expect(morning.toOrderNow).toBe(0);
    expect(morning.windows).toEqual([
      { key: "2026-10-12T11:00", time: "11:00", qty: 5, passed: false },
      { key: "2026-10-12T16:00", time: "16:00", qty: 4, passed: false },
    ]);
    const noon = todayNumbers(rows, "2026-10-12T12:00", "2026-10-12", ["11:00", "16:00"]);
    expect(noon.toOrderNow).toBe(5);
    expect(noon.windows.map((w) => w.passed)).toEqual([true, false]);
  });

  it("Past the order-by date counts from the server's day, and today itself has not passed", () => {
    const numbers = todayNumbers(rows, "2026-10-12T09:00", "2026-10-12", []);
    expect(numbers.pastOrderBy).toBe(2); // only row a; row d has nothing to buy
  });

  it("a window with nothing left reads All ordered once it has passed", () => {
    expect(BY_SUPPLIER.passed(null, 5)).toBe("5 pcs passed");
    expect(BY_SUPPLIER.toOrder(null, 1)).toBe("1 pc to order");
    expect(BY_SUPPLIER.windowToday("11:00 AM")).toBe("11:00 AM today");
    expect(BY_SUPPLIER.allOrdered).toBe("All ordered");
  });
});
