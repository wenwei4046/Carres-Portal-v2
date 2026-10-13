import { describe, expect, it } from "vitest";
import type { PurchaseDemandRow, SoBatchOrderRow } from "@carres/shared";
import { BY_SUPPLIER, COLUMN_FLOOR, daysBetween, deadlineKey, fitColumns, orderedSupplierGroups, supplierGroups, todayNumbers } from "./by-supplier";

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

/* THE TWO OTHER GROUPINGS (owner 13 Oct 2026). Same lines, same arithmetic;
   only the key they are gathered under changes. */
describe("By category and By order deadline: the same lines, grouped another way", () => {
  const rows = [
    row({ id: "a", category: "sofa", supplierId: "s-2", supplier: "TEST Supplier Two", toBuy: 1, orderBy: "2026-10-09" }),
    row({ id: "b", category: "mattress", supplierId: "s-1", supplier: "TEST Supplier One", toBuy: 2, orderBy: "2026-10-12" }),
    row({ id: "c", category: "mattress", supplierId: "s-3", supplier: "TEST Supplier Three", toBuy: 3, orderBy: "2026-10-14" }),
    row({ id: "d", category: "bedframe", supplierId: "s-2", supplier: "TEST Supplier Two", toBuy: 4, orderBy: "2026-10-30" }),
    row({ id: "e", category: "bedframe", supplierId: "s-2", supplier: "TEST Supplier Two", toBuy: 5, orderBy: null }),
  ];

  it("By category: one row per category in the buying order, naming every supplier in it", () => {
    const groups = supplierGroups(rows, "2026-10-12T09:00", "category");
    expect(groups.map((g) => `${g.category} · ${g.qty} · ${g.suppliers.join(", ")}`)).toEqual([
      "mattress · 5 · TEST Supplier One, TEST Supplier Three",
      "bedframe · 9 · TEST Supplier Two",
      "sofa · 1 · TEST Supplier Two",
    ]);
    expect(groups.map((g) => g.key)).toEqual(["category|mattress", "category|bedframe", "category|sofa"]);
    expect(groups.every((g) => g.deadline === undefined)).toBe(true);
  });

  it("the deadline key: passed, each of the next seven days, then later, then none", () => {
    expect(deadlineKey("2026-10-11", "2026-10-12")).toBe("passed");
    expect(deadlineKey("2026-10-12", "2026-10-12")).toBe("2026-10-12");
    expect(deadlineKey("2026-10-18", "2026-10-12")).toBe("2026-10-18");
    expect(deadlineKey("2026-10-19", "2026-10-12")).toBe("later");
    expect(deadlineKey(null, "2026-10-12")).toBe("none");
  });

  it("By order deadline: passed first, then day by day, then later, then lines with no deadline", () => {
    const groups = supplierGroups(rows, "2026-10-12T09:00", "deadline", "2026-10-12");
    expect(groups.map((g) => `${g.key} · ${g.deadline} · ${g.qty}`)).toEqual([
      "deadline|passed · passed · 1",
      "deadline|2026-10-12 · day · 2",
      "deadline|2026-10-14 · day · 3",
      "deadline|later · later · 4",
      "deadline|none · none · 5",
    ]);
    expect(groups[0]!.suppliers).toEqual(["TEST Supplier Two"]);
  });

  it("no grouping loses or doubles a line", () => {
    const total = (by: "supplier" | "category" | "deadline") =>
      supplierGroups(rows, "2026-10-12T09:00", by, "2026-10-12").reduce((n, g) => n + g.qty, 0);
    expect(total("supplier")).toBe(15);
    expect(total("category")).toBe(15);
    expect(total("deadline")).toBe(15);
  });

  it("the words: the passed row never says Overdue or Missed", () => {
    expect(BY_SUPPLIER.deadlinePassed).toBe("Deadline passed");
    expect(BY_SUPPLIER.lateToOrder).toBe("Late to order");
    expect(BY_SUPPLIER.nextWeekAndLater).toBe("Next week +");
    expect(Object.values(BY_SUPPLIER).filter((v) => typeof v === "string").join(" ")).not.toMatch(/Overdue|Missed/);
    expect("cards" in BY_SUPPLIER).toBe(false);
    expect("matchReadyStock" in BY_SUPPLIER).toBe(false);
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

  /* Owner 13 Oct 2026: the footer is the rows' count only. */
  it("the footer counts the rows and nothing else", () => {
    expect(BY_SUPPLIER.footer(4)).toBe("4 groups");
    expect(BY_SUPPLIER.footer(1)).toBe("1 group");
  });

  /* Owner 13 Oct 2026: one PO per supplier and category, so a supplier with
     two rows names the category on each; a supplier with one row does not. */
  it("names the category only when the supplier has rows in two categories", () => {
    expect(BY_SUPPLIER.groupName({ supplier: "TEST Supplier Two", category: "bedframe" }, true)).toBe("TEST Supplier Two · Bedframe");
    expect(BY_SUPPLIER.groupName({ supplier: "TEST Supplier Two", category: "sofa" }, true)).toBe("TEST Supplier Two · Sofa");
    expect(BY_SUPPLIER.groupName({ supplier: "TEST Supplier One", category: "mattress" }, false)).toBe("TEST Supplier One");
    expect(BY_SUPPLIER.groupName({ supplier: null, category: "sofa" }, false)).toBe("Supplier not set");
  });

  it("the item line heads are the owner's sentence-case words", () => {
    expect([BY_SUPPLIER.lineItem, BY_SUPPLIER.lineToBuy, BY_SUPPLIER.lineSoNo, BY_SUPPLIER.lineOrderBy, BY_SUPPLIER.lineDeliverTo])
      .toEqual(["Item", "To buy", "Sales order", "Order deadline", "Supplier delivers to"]);
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
    expect(g!.qty).toBeGreaterThan(0);
  });

  it("By category gathers what is ordered by category, each line naming its supplier; By order deadline shows none", () => {
    const groups = orderedSupplierGroups(orders, "category");
    expect(groups.map((g) => `${g.key} · ${g.qty} · ${g.suppliers.join(", ")}`)).toEqual([
      "ordered|category|mattress · 3 · TEST Supplier One", "ordered|category|sofa · 1 · TEST Supplier Two",
    ]);
    expect(groups[0]!.ordered!.lines.every((l) => l.supplier === "TEST Supplier One")).toBe(true);
    expect(orderedSupplierGroups(orders, "deadline")).toEqual([]);
  });

  it("an ordered line carries the model code the data spells", () => {
    const [g] = orderedSupplierGroups(orders);
    expect(g!.ordered!.lines.map((l) => l.sku)).toEqual(["TEST-A", "TEST-A"]);
  });
});

describe("the Today card reads the same lines as the list", () => {
  const rows = [
    row({ id: "a", toBuy: 2, category: "sofa", supplierId: "s-2", supplier: "TEST Supplier Two", poWindow: "2026-10-12T11:00", orderBy: "2026-10-10" }),
    row({ id: "b", toBuy: 3, category: "mattress", poWindow: "2026-10-12T11:00", orderBy: "2026-10-16" }),
    row({ id: "c", toBuy: 4, category: "mattress", poWindow: "2026-10-12T16:00", orderBy: "2026-10-12" }),
    row({ id: "d", toBuy: 0, category: "bedframe", poWindow: "2026-10-12T11:00", orderBy: "2026-10-01" }),
  ];

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

/**
 * THE LIST FITS THE ROOM IT IS GIVEN (Layout Standard, 13 Oct 2026). The five
 * By supplier columns and their floors, as the view passes them.
 */
describe("fitColumns", () => {
  const BASE = [80, 96, 120, 120, 120];
  const FLOORS = [COLUMN_FLOOR.fixed, COLUMN_FLOOR.fixed, COLUMN_FLOOR.fixed, COLUMN_FLOOR.fixed, COLUMN_FLOOR.status];
  const sum = (widths: number[]) => widths.reduce((n, w) => n + w, 0);

  it("with room, the fixed columns keep their widths and the first takes the rest", () => {
    const fit = fitColumns(904, 80, 150, BASE, FLOORS);
    expect(fit).toEqual({ first: 904 - 80 - 2 - 536, fixed: BASE, tight: false });
  });

  it("the first column is never under 150 while the fixed columns keep their widths", () => {
    /* 80 + 2 + 536 + 150 = 768 is the least room the full widths take. */
    expect(fitColumns(768, 80, 150, BASE, FLOORS)).toMatchObject({ first: 150, tight: false });
    expect(fitColumns(767, 80, 150, BASE, FLOORS).tight).toBe(true);
  });

  it("short of room, the fixed columns give way together and everything still fits", () => {
    /* 1164 wide with the Tasks panel open leaves the list 570. */
    const fit = fitColumns(570, 80, 150, BASE, FLOORS);
    expect(fit.tight).toBe(true);
    expect(80 + 2 + fit.first + sum(fit.fixed)).toBeLessThanOrEqual(570);
    expect(fit.first).toBeGreaterThanOrEqual(COLUMN_FLOOR.first);
    fit.fixed.forEach((width, index) => {
      expect(width).toBeGreaterThanOrEqual(FLOORS[index]!);
      expect(width).toBeLessThanOrEqual(BASE[index]!);
    });
    /* Status never goes under its own floor. */
    expect(fit.fixed[4]).toBe(COLUMN_FLOOR.status);
  });

  it("gives way only as far as is needed", () => {
    const roomy = fitColumns(700, 80, 150, BASE, FLOORS);
    const tight = fitColumns(570, 80, 150, BASE, FLOORS);
    expect(sum(roomy.fixed)).toBeGreaterThan(sum(tight.fixed));
  });

  it("below every floor the columns stop at their floors: the list scrolls, nothing is squeezed further", () => {
    const fit = fitColumns(300, 80, 150, BASE, FLOORS);
    expect(fit.fixed).toEqual([60, 60, 60, 60, 112]);
    expect(fit.first).toBe(COLUMN_FLOOR.first);
  });

  it("before the room is measured it draws the full widths", () => {
    expect(fitColumns(0, 80, 150, BASE, FLOORS)).toMatchObject({ fixed: BASE, tight: false });
  });
});
