import { describe, expect, it } from "vitest";
import { monthlyDemandOf, monthlyDemandWindowOf, type MonthlyDemandOrder } from "./monthly-demand";

const order = (over: Partial<MonthlyDemandOrder> & { id: string }): MonthlyDemandOrder => ({
  deliveryDate: "2026-10-12",
  deliveryDateTbd: false,
  salesLocation: "PJ Showroom",
  state: "Selangor",
  city: "Petaling Jaya",
  lines: [{ id: `${over.id}-l1`, sku: "MS12 Firmcare 10inch Queen", qty: 1, category: "mattress" }],
  delivered: [],
  ...over,
});

const base = { startMonth: "2026-10", months: 6 as const, toBuyByOrder: new Map<string, number>() };
const rowOf = (view: ReturnType<typeof monthlyDemandOf>, key: string) => view.rows.find((r) => r.key === key)!;

describe("the window is a start month plus a count of months (owner re-ruling 2026-09-26)", () => {
  it("crosses the year boundary and names its first and last month", () => {
    expect(monthlyDemandWindowOf("2026-10", 6)).toEqual({
      months: ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
      first: "2026-10",
      last: "2027-03",
    });
    expect(monthlyDemandWindowOf("2026-12", 1).months).toEqual(["2026-12"]);
  });

  it("always keeps Before, After, No delivery date and Total", () => {
    const view = monthlyDemandOf({ ...base, months: 2, orders: [] });
    expect(view.rows.map((r) => r.key)).toEqual(["before", "2026-10", "2026-11", "after", "no-date", "total"]);
  });
});

describe("a cell is the physical pieces still owed to the customer", () => {
  it("assigns the month from the customer's requested delivery date, never anything else", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [
        order({ id: "a", deliveryDate: "2026-09-30" }),
        order({ id: "b", deliveryDate: "2026-10-01" }),
        order({ id: "c", deliveryDate: "2027-03-31" }),
        order({ id: "d", deliveryDate: "2027-04-01" }),
      ],
    });
    expect(rowOf(view, "before").totalQty).toBe(1);
    expect(rowOf(view, "2026-10").totalQty).toBe(1);
    expect(rowOf(view, "2027-03").totalQty).toBe(1);
    expect(rowOf(view, "after").totalQty).toBe(1);
    expect(rowOf(view, "total").totalQty).toBe(4);
  });

  it("an order with no definite date is never given a month", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [
        order({ id: "tbd", deliveryDate: "2026-10-12", deliveryDateTbd: true }),
        order({ id: "none", deliveryDate: null }),
      ],
    });
    expect(rowOf(view, "no-date").totalQty).toBe(2);
    expect(rowOf(view, "2026-10").totalQty).toBe(0);
  });

  it("partial delivery reduces only the quantity actually delivered, by the line the Unit names", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [
        order({
          id: "a",
          lines: [
            { id: "l1", sku: "MS12 Firmcare 10inch Queen", qty: 3, category: "mattress" },
            { id: "l2", sku: "MS12 Firmcare 10inch Queen", qty: 2, category: "mattress" },
          ],
          delivered: [
            { orderLineId: "l1", sku: "MS12 Firmcare 10inch Queen", qty: 1 },
            { orderLineId: "l1", sku: "MS12 Firmcare 10inch Queen", qty: 1 },
          ],
        }),
      ],
    });
    const row = rowOf(view, "2026-10");
    expect(row).toMatchObject({ totalQty: 5, delivered: 2, notDelivered: 3 });
    expect(row.categories.Mattress).toBe(3);
  });

  it("a delivered Unit that names no line fills the first line of its SKU with room, and never more than was ordered", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [
        order({
          id: "a",
          lines: [{ id: "l1", sku: "MS12 Firmcare 10inch Queen", qty: 1, category: "mattress" }],
          delivered: [
            { orderLineId: null, sku: "MS12 Firmcare 10inch Queen", qty: 1 },
            { orderLineId: null, sku: "MS12 Firmcare 10inch Queen", qty: 1 },
          ],
        }),
      ],
    });
    expect(rowOf(view, "2026-10")).toMatchObject({ totalQty: 1, delivered: 1, notDelivered: 0 });
  });

  it("gifts count in their real category, services never count, accessories share one column", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [
        order({
          id: "a",
          lines: [
            { id: "l1", sku: "BF07 Hilton Divan King", qty: 1, category: "bedframe" },
            { id: "l2", sku: "SF03 Muro 2 Seater", qty: 2, category: "sofa" },
            { id: "l3", sku: "Memory Pillow", qty: 2, category: "accessory", attrs: { free_gift: true } },
            { id: "l4", sku: "DELIVERY", qty: 1, category: "service" },
          ],
        }),
      ],
    });
    const row = rowOf(view, "2026-10");
    expect(row.categories).toMatchObject({ Mattress: 0, Bedframe: 1, Sofa: 2, Accessory: 2 });
    expect(row.totalQty).toBe(5);
  });

  it("a line with no catalog row is counted under Not in catalog — never dropped, never a kind of goods", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [order({ id: "a", lines: [{ id: "l1", sku: "ZZZ-UNKNOWN", qty: 2, category: null }] })],
    });
    const row = rowOf(view, "2026-10");
    expect(row.notInCatalog).toBe(2);
    expect(row.totalQty).toBe(2);
    expect(view.hasNotInCatalog).toBe(true);
    expect(monthlyDemandOf({ ...base, orders: [order({ id: "b" })] }).hasNotInCatalog).toBe(false);
  });

  it("every row reconciles: the categories add up to Not delivered, and the rows add up to Total", () => {
    const view = monthlyDemandOf({
      ...base,
      orders: [
        order({ id: "a", deliveryDate: "2026-08-01", lines: [{ id: "l1", sku: "SF03 Muro 2 Seater", qty: 4, category: "sofa" }], delivered: [{ orderLineId: "l1", sku: "SF03 Muro 2 Seater", qty: 1 }] }),
        order({ id: "b", deliveryDate: "2026-11-02", lines: [{ id: "l2", sku: "ZZZ", qty: 1, category: null }] }),
        order({ id: "c", deliveryDate: null }),
      ],
    });
    for (const row of view.rows) {
      const cells = Object.values(row.categories).reduce((a, b) => a + b, 0) + row.notInCatalog;
      expect(cells, row.key).toBe(row.notDelivered);
      expect(row.totalQty - row.delivered, row.key).toBe(row.notDelivered);
    }
    const total = rowOf(view, "total");
    const sum = view.rows.filter((r) => r.key !== "total").reduce((a, r) => a + r.totalQty, 0);
    expect(total.totalQty).toBe(sum);
  });
});

describe("To buy is SO Batch Purchase's number, and an unread source is Unavailable", () => {
  it("adds up what SO Batch says each order still has to buy", () => {
    const view = monthlyDemandOf({
      ...base,
      toBuyByOrder: new Map([["a", 2], ["b", 1]]),
      orders: [order({ id: "a" }), order({ id: "b", deliveryDate: "2026-11-03" }), order({ id: "c" })],
    });
    expect(rowOf(view, "2026-10").toBuy).toBe(2);
    expect(rowOf(view, "2026-11").toBuy).toBe(1);
    expect(rowOf(view, "total").toBuy).toBe(3);
  });

  it("prints nothing as zero when SO Batch could not be read", () => {
    const view = monthlyDemandOf({ ...base, toBuyByOrder: null, orders: [order({ id: "a" })] });
    expect(view.rows.every((r) => r.toBuy === null)).toBe(true);
  });
});

describe("the rail narrows, and nothing carries over", () => {
  const orders = [
    order({ id: "a", salesLocation: "PJ Showroom", state: "Selangor", city: "Petaling Jaya" }),
    order({ id: "b", salesLocation: "Dealer Ahmad", state: "Johor", city: "Johor Bahru", lines: [{ id: "lb", sku: "SF03 Muro 2 Seater", qty: 2, category: "sofa" }] }),
  ];

  it("Dealer / Sales Location and the delivery State / City are different facts", () => {
    expect(rowOf(monthlyDemandOf({ ...base, orders, filters: { salesLocation: "Dealer Ahmad" } }), "total").totalQty).toBe(2);
    expect(rowOf(monthlyDemandOf({ ...base, orders, filters: { state: "Selangor" } }), "total").totalQty).toBe(1);
    expect(rowOf(monthlyDemandOf({ ...base, orders, filters: { state: "Johor", city: "Petaling Jaya" } }), "total").totalQty).toBe(0);
  });

  it("Product category narrows the lines, not the orders", () => {
    const view = monthlyDemandOf({ ...base, orders, filters: { category: "Sofa" } });
    expect(rowOf(view, "total")).toMatchObject({ totalQty: 2 });
    expect(rowOf(view, "total").categories).toMatchObject({ Mattress: 0, Sofa: 2 });
  });

  it("offers only the choices the orders carry, in order", () => {
    const view = monthlyDemandOf({ ...base, orders });
    expect(view.choices.salesLocations).toEqual(["Dealer Ahmad", "PJ Showroom"]);
    expect(view.choices.states).toEqual(["Johor", "Selangor"]);
    expect(view.choices.cities).toEqual(["Johor Bahru", "Petaling Jaya"]);
  });

  it("the three numbers are ONE month — the chosen one, else the window's first", () => {
    const view = monthlyDemandOf({ ...base, orders, focusMonth: "2026-10" });
    expect(view.focus).toMatchObject({ month: "2026-10", totalQty: 3, delivered: 0, notDelivered: 3 });
    expect(monthlyDemandOf({ ...base, orders }).focus.month).toBe("2026-10");
    expect(monthlyDemandOf({ ...base, orders, focusMonth: "2031-01" }).focus.month).toBe("2026-10");
  });
});
