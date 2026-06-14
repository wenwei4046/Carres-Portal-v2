import { describe, it, expect } from "vitest";
import type { FloorConfigDto, Order } from "@carres/shared";
import {
  addonSubtotal,
  floorSurcharge,
  floorSurchargeRaw,
  lineSubtotal,
  orderTotal,
  totalItems,
} from "./order-totals";

const CFG: FloorConfigDto = { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 };

function baseOrder(over: Partial<Order> = {}): Order {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    so: 1,
    status: "place",
    channel: "dealer",
    dealerId: "00000000-0000-0000-0000-000000000d01",
    outletId: null,
    salespersonId: null,
    customer: { name: "X", phone: null, address: null, addressUnknown: false, billing: null, billingSame: true, emergency: null },
    delivery: { date: null, dateTbd: false, floor: 1, hasLift: false, stairItems: null, proceedDate: null },
    paid: 0,
    signatureUrl: null,
    paymentSlipUrl: null,
    termsAccepted: true,
    paymentMethod: null,
    approvalCode: null,
    installmentMonths: null,
    operationStage: null,
    warehouseId: null,
    deliveryPartnerId: null,
    partnerStage: null,
    partnerPickedAt: null,
    partnerEta: null,
    doNumber: null,
    doNote: null,
    invoiceNo: null,
    invoicedAt: null,
    placedAt: "2026-05-02T00:00:00Z",
    ...over,
  };
}

describe("order-totals pure functions", () => {
  it("lineSubtotal sums unitPrice × qty across lines (or 0 if no rels)", () => {
    expect(lineSubtotal(baseOrder())).toBe(0);
    const withLines = baseOrder({
      lines: [
        { id: "a", orderId: "x", sku: "s1", qty: 2, attrs: null, unitPrice: 100 },
        { id: "b", orderId: "x", sku: "s2", qty: 1, attrs: null, unitPrice: 50 },
      ],
    });
    expect(lineSubtotal(withLines)).toBe(250);
  });

  it("addonSubtotal sums addons × qty", () => {
    const withAddons = baseOrder({
      addons: [{ id: "a", orderId: "x", addonKey: "pillow", qty: 3, unitPrice: 20 }],
    });
    expect(addonSubtotal(withAddons)).toBe(60);
  });

  it("totalItems sums line qty", () => {
    const o = baseOrder({
      lines: [
        { id: "a", orderId: "x", sku: "s1", qty: 2, attrs: null, unitPrice: 100 },
        { id: "b", orderId: "x", sku: "s2", qty: 3, attrs: null, unitPrice: 50 },
      ],
    });
    expect(totalItems(o)).toBe(5);
  });
});

describe("floorSurcharge — un-stubbed in 2B.1", () => {
  const lineQty2 = [{ id: "a", orderId: "x", sku: "s1", qty: 2, attrs: null, unitPrice: 100 }];

  it("returns 0 when delivery has a lift (floor irrelevant)", () => {
    const o = baseOrder({
      delivery: { date: null, dateTbd: false, floor: 12, hasLift: true, stairItems: null, proceedDate: null },
      lines: lineQty2,
    });
    expect(floorSurcharge(o, CFG)).toBe(0);
  });

  it("returns 0 when floor is at or below freeUpToFloor", () => {
    expect(
      floorSurcharge(
        baseOrder({ delivery: { date: null, dateTbd: false, floor: 1, hasLift: false, stairItems: null, proceedDate: null }, lines: lineQty2 }),
        CFG,
      ),
    ).toBe(0);
    expect(
      floorSurcharge(
        baseOrder({ delivery: { date: null, dateTbd: false, floor: 2, hasLift: false, stairItems: null, proceedDate: null }, lines: lineQty2 }),
        CFG,
      ),
    ).toBe(0);
  });

  it("charges (floor − freeUpToFloor) × perFloorPerItem × total_qty when no lift", () => {
    // 2 items, floor 5, free up to 2 → flights=3, 3 × 50 × 2 = 300
    const o = baseOrder({
      delivery: { date: null, dateTbd: false, floor: 5, hasLift: false, stairItems: null, proceedDate: null },
      lines: lineQty2,
    });
    expect(floorSurcharge(o, CFG)).toBe(300);
  });

  it("multi-line items sum into qty correctly for surcharge", () => {
    // 3 items total (qty 2 + qty 1), floor 4, free up to 2 → flights=2, 2 × 50 × 3 = 300
    const o = baseOrder({
      delivery: { date: null, dateTbd: false, floor: 4, hasLift: false, stairItems: null, proceedDate: null },
      lines: [
        { id: "a", orderId: "x", sku: "s1", qty: 2, attrs: null, unitPrice: 100 },
        { id: "b", orderId: "x", sku: "s2", qty: 1, attrs: null, unitPrice: 50 },
      ],
    });
    expect(floorSurcharge(o, CFG)).toBe(300);
  });
});

describe("floorSurchargeRaw — single source of truth shared with wizard", () => {
  it("returns 0 when hasLift is true regardless of floor / qty", () => {
    expect(floorSurchargeRaw(12, true, 2, CFG)).toBe(0);
  });

  it("returns 0 at or below freeUpToFloor", () => {
    expect(floorSurchargeRaw(2, false, 2, CFG)).toBe(0);
  });

  it("(floor − freeUpToFloor) × perFloorPerItem × qty", () => {
    expect(floorSurchargeRaw(5, false, 2, CFG)).toBe(300);
  });

  it("matches floorSurcharge(order, cfg) for the same inputs", () => {
    const o = {
      delivery: { date: null, dateTbd: false, floor: 5, hasLift: false, stairItems: null, proceedDate: null },
      lines: [{ id: "x", orderId: "y", sku: "s", qty: 2, attrs: null, unitPrice: 100 }],
    } as unknown as Parameters<typeof floorSurcharge>[0];
    expect(floorSurcharge(o, CFG)).toBe(floorSurchargeRaw(5, false, 2, CFG));
  });
});

describe("orderTotal", () => {
  it("sums lines + addons + floor surcharge", () => {
    const o = baseOrder({
      lines: [{ id: "a", orderId: "x", sku: "s1", qty: 1, attrs: null, unitPrice: 100 }],
      addons: [{ id: "b", orderId: "x", addonKey: "p", qty: 2, unitPrice: 25 }],
      delivery: { date: null, dateTbd: false, floor: 1, hasLift: false, stairItems: null, proceedDate: null },
    });
    expect(orderTotal(o, CFG)).toBe(150);
  });

  it("includes stair-carry charge when applicable", () => {
    const o = baseOrder({
      lines: [{ id: "a", orderId: "x", sku: "s1", qty: 1, attrs: null, unitPrice: 1000 }],
      delivery: { date: null, dateTbd: false, floor: 4, hasLift: false, stairItems: null, proceedDate: null },
    });
    // 1000 + 0 + (4−2) × 50 × 1 = 1100
    expect(orderTotal(o, CFG)).toBe(1100);
  });
});
