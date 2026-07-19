import { describe, expect, it } from "vitest";
import { buildChaseSupplierPlan, type ChaseOrder } from "./chase-supplier-plan";

const skuMeta = new Map<string, { supplierId: string | null; category: string | null }>([
  ["MS01-K", { supplierId: "sup-nf", category: "mattress" }],
  ["MS02-Q", { supplierId: "sup-nf", category: "mattress" }],
  ["BF01-K", { supplierId: "sup-oh", category: "bedframe" }],
]);
const suppliers = [
  { id: "sup-nf", cat_covered: ["mattress"] },
  { id: "sup-oh", cat_covered: ["bedframe", "sofa"] },
];

describe("buildChaseSupplierPlan", () => {
  it("2 orders same supplier → 1 card with 2 rows", () => {
    const orders: ChaseOrder[] = [
      { id: "o1", so: 1001, refNo: "CR-1001", deliveryDate: null, lines: [{ sku: "MS01-K", qty: 1 }] },
      { id: "o2", so: 1002, refNo: "CR-1002", deliveryDate: null, lines: [{ sku: "MS02-Q", qty: 2 }] },
    ];
    const { cards, unresolved } = buildChaseSupplierPlan(orders, skuMeta, suppliers);
    expect(cards).toHaveLength(1);
    expect(cards[0].supplierId).toBe("sup-nf");
    expect(cards[0].rows).toHaveLength(2);
    expect(cards[0].lineCount).toBe(2);
    expect(unresolved).toBe(0);
  });

  it("different suppliers → 2 cards", () => {
    const orders: ChaseOrder[] = [
      { id: "o1", so: 1001, refNo: "CR-1001", deliveryDate: null, lines: [{ sku: "MS01-K", qty: 1 }] },
      { id: "o2", so: 1002, refNo: "CR-1002", deliveryDate: null, lines: [{ sku: "BF01-K", qty: 1 }] },
    ];
    const { cards } = buildChaseSupplierPlan(orders, skuMeta, suppliers);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.supplierId)).toEqual(["sup-nf", "sup-oh"]);
  });

  it("acc-only line → skipped, no card, not unresolved (catalog acc)", () => {
    const accMeta = new Map([["PILLOW-1", { supplierId: null, category: "accessory" }]]);
    const orders: ChaseOrder[] = [
      { id: "o1", so: 1001, refNo: "CR-1001", deliveryDate: null, lines: [{ sku: "PILLOW-1", qty: 1 }] },
    ];
    const { cards, unresolved } = buildChaseSupplierPlan(orders, accMeta, suppliers);
    expect(cards).toHaveLength(0);
    expect(unresolved).toBe(0);
  });

  it("ref passes through onto the row", () => {
    const orders: ChaseOrder[] = [
      { id: "o1", so: 1001, refNo: "TCF-9", deliveryDate: null, lines: [{ sku: "MS01-K", qty: 1 }] },
    ];
    const { cards } = buildChaseSupplierPlan(orders, skuMeta, suppliers);
    expect(cards[0].rows[0].ref).toBe("TCF-9");
    expect(cards[0].rows[0].so).toBe(1001);
  });

  it("unresolvable core line (no catalog meta, ambiguous category) counts unresolved", () => {
    const orders: ChaseOrder[] = [
      { id: "o1", so: 1001, refNo: "CR-1001", deliveryDate: null, lines: [{ sku: "sofa:XYZ", qty: 1 }] },
    ];
    // 'sofa' is covered only by sup-oh → resolves; make it ambiguous instead:
    const ambiguous = [
      { id: "sup-oh", cat_covered: ["sofa"] },
      { id: "sup-oh2", cat_covered: ["sofa"] },
    ];
    const { cards, unresolved } = buildChaseSupplierPlan(orders, new Map(), ambiguous);
    expect(cards).toHaveLength(0);
    expect(unresolved).toBe(1);
  });
});
