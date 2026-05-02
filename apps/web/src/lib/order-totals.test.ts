import { describe, it, expect } from "vitest";
import type { Order } from "@carres/shared";
import { addonSubtotal, floorSurcharge, lineSubtotal, orderTotal } from "./order-totals";

function baseOrder(over: Partial<Order> = {}): Order {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    dl: 1,
    status: "place",
    channel: "dealer",
    dealerId: "00000000-0000-0000-0000-000000000d01",
    outletId: null,
    salespersonId: null,
    customer: { name: "X", phone: null, address: null, addressUnknown: false, billing: null, billingSame: true, emergency: null },
    delivery: { date: null, dateTbd: false, floor: 1, hasLift: false },
    paid: 0,
    signatureUrl: null,
    termsAccepted: true,
    logisticsStage: null,
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

  it("floorSurcharge returns 0 (Phase 2A stub)", () => {
    expect(floorSurcharge(baseOrder({ delivery: { date: null, dateTbd: false, floor: 5, hasLift: false } }))).toBe(0);
  });

  it("orderTotal sums lines + addons + floor", () => {
    const o = baseOrder({
      lines: [{ id: "a", orderId: "x", sku: "s1", qty: 1, attrs: null, unitPrice: 100 }],
      addons: [{ id: "b", orderId: "x", addonKey: "p", qty: 2, unitPrice: 25 }],
    });
    expect(orderTotal(o)).toBe(150);
  });
});
