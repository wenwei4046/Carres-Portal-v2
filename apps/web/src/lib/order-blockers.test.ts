import { describe, expect, it } from "vitest";
import type { Order } from "@carres/shared";
import { isProceedReady, proceedBlockers } from "./order-blockers";

/** Fully-valid Place order — no blockers. Tests override fields to fail one
 *  precondition at a time. Mirrors the fixture in order-totals.test.ts. */
function readyOrder(over: Partial<Order> = {}): Order {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    so: 42,
    status: "place",
    channel: "dealer",
    dealerId: "00000000-0000-0000-0000-000000000d01",
    outletId: null,
    salespersonId: null,
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "1, Jalan Test, 50000 Kuala Lumpur",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: "Bob · 012-9988776 · Spouse",
    },
    delivery: { date: "2026-06-01", dateTbd: false, floor: 1, hasLift: false, stairItems: null, proceedDate: null },
    paid: 1000,
    totalAmount: 2000,
    signatureUrl: "orders-attachments/d01/sess/signature.png",
    paymentSlipUrl: null,
    termsAccepted: true,
    paymentMethod: "online",
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

describe("proceedBlockers", () => {
  it("returns empty for a fully-valid Place order", () => {
    expect(proceedBlockers(readyOrder())).toEqual([]);
    expect(isProceedReady(readyOrder())).toBe(true);
  });

  it("flags missing customer name", () => {
    const result = proceedBlockers(readyOrder({ customer: { ...readyOrder().customer, name: "  " } }));
    expect(result.map((b) => b.code)).toContain("customer_name_required");
  });

  it("flags missing phone", () => {
    const result = proceedBlockers(readyOrder({ customer: { ...readyOrder().customer, phone: null } }));
    expect(result.map((b) => b.code)).toContain("customer_phone_required");
  });

  it("flags addressUnknown OR empty address", () => {
    const unknownFlag = proceedBlockers(
      readyOrder({ customer: { ...readyOrder().customer, addressUnknown: true } }),
    );
    expect(unknownFlag.map((b) => b.code)).toContain("delivery_address_required");

    const empty = proceedBlockers(readyOrder({ customer: { ...readyOrder().customer, address: null } }));
    expect(empty.map((b) => b.code)).toContain("delivery_address_required");
  });

  it("flags TBD or missing delivery date", () => {
    const tbd = proceedBlockers(readyOrder({ delivery: { ...readyOrder().delivery, dateTbd: true } }));
    expect(tbd.map((b) => b.code)).toContain("delivery_date_required");

    const missing = proceedBlockers(readyOrder({ delivery: { ...readyOrder().delivery, date: null } }));
    expect(missing.map((b) => b.code)).toContain("delivery_date_required");
  });

  it("flags missing signature", () => {
    const result = proceedBlockers(readyOrder({ signatureUrl: null }));
    expect(result.map((b) => b.code)).toContain("signature_required");
  });

  it("flags terms not accepted", () => {
    const result = proceedBlockers(readyOrder({ termsAccepted: false }));
    expect(result.map((b) => b.code)).toContain("terms_not_accepted");
  });

  it("flags zero total", () => {
    expect(proceedBlockers(readyOrder({ totalAmount: 0 })).map((b) => b.code)).toContain(
      "total_amount_missing",
    );
  });

  it("falls back to lines+addons when totalAmount missing (detail shape)", () => {
    // Phase 2C.1a regression: detail endpoint pre-fix didn't include totalAmount,
    // which surfaced a phantom "Order pricing" blocker on every Place order.
    // The client function should reconstruct total from the embedded rels.
    const order = readyOrder({
      totalAmount: undefined,
      lines: [
        { id: "l1", orderId: "x", sku: "s1", qty: 2, attrs: null, unitPrice: 800 },
      ],
      addons: [
        { id: "a1", orderId: "x", addonKey: "delivery", qty: 1, unitPrice: 400 },
      ],
      paid: 1000, // 50% of 2000 — should be ready
    });
    expect(proceedBlockers(order)).toEqual([]);
  });

  it("flags total_amount_missing when no totalAmount AND no rels (truly empty)", () => {
    const order = readyOrder({ totalAmount: undefined });
    // With no lines/addons embedded, the fallback yields 0 → flagged.
    expect(proceedBlockers(order).map((b) => b.code)).toContain("total_amount_missing");
  });

  it("flags payment below 50% with dynamic message", () => {
    const result = proceedBlockers(readyOrder({ paid: 499, totalAmount: 2000 })); // 25%
    const blocker = result.find((b) => b.code === "payment_below_50");
    expect(blocker).toBeDefined();
    // Message includes the dynamic percentage so the dealer sees how short
    // they are (proto/dealer-orders.jsx OrderRow uses the same prompt copy).
    expect(blocker?.message).toMatch(/25%/);
  });

  it("accepts exactly 50% paid", () => {
    expect(proceedBlockers(readyOrder({ paid: 1000, totalAmount: 2000 }))).toEqual([]);
  });

  it("accumulates multiple blockers in stable order", () => {
    const result = proceedBlockers(
      readyOrder({
        customer: { ...readyOrder().customer, phone: null, addressUnknown: true },
        signatureUrl: null,
      }),
    );
    const codes = result.map((b) => b.code);
    expect(codes).toContain("customer_phone_required");
    expect(codes).toContain("delivery_address_required");
    expect(codes).toContain("signature_required");
    // Order matches the source-code walk: phone → address → signature.
    expect(codes.indexOf("customer_phone_required")).toBeLessThan(
      codes.indexOf("delivery_address_required"),
    );
    expect(codes.indexOf("delivery_address_required")).toBeLessThan(codes.indexOf("signature_required"));
  });
});

describe("isProceedReady", () => {
  it("requires status='place' even with no blockers", () => {
    expect(isProceedReady(readyOrder({ status: "proceed_order" }))).toBe(false);
    expect(isProceedReady(readyOrder({ status: "delivered" }))).toBe(false);
    expect(isProceedReady(readyOrder({ status: "cancelled" }))).toBe(false);
  });

  it("returns false when any blocker exists, even on a Place order", () => {
    expect(isProceedReady(readyOrder({ signatureUrl: null }))).toBe(false);
  });
});
