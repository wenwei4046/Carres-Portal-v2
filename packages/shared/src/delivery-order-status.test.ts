import { describe, expect, it } from "vitest";
import {
  DELIVERY_ORDER_STATUS_LABEL,
  deliveryOrderStatusOf,
  type DeliveryHandoverKind,
} from "./delivery-order-status";

const attempt = (
  result: "delivered" | "partial" | "failed",
  reasonKey: string | null,
  recordedAt: string,
) => ({ result, reasonKey, recordedAt });

const events = (...kinds: DeliveryHandoverKind[]) => kinds.map((kind) => ({ kind }));

describe("deliveryOrderStatusOf — ONE arithmetic for the document status", () => {
  it("a fresh document with no attempts is Created", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [],
      handoverEvents: [],
    });
    expect(s.kind).toBe("created");
    expect(s.label).toBe("Created");
    expect(s.reasonLabel).toBeNull();
  });

  it("a delivered latest attempt is Delivered", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [attempt("delivered", null, "2026-08-18T02:00:00Z")],
      handoverEvents: [],
    });
    expect(s.kind).toBe("delivered");
    expect(s.label).toBe("Delivered");
  });

  it("a failed attempt is ONE Delivery exception with its reason in library words", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [attempt("failed", "customer_unreachable", "2026-08-18T02:00:00Z")],
      handoverEvents: [],
    });
    expect(s.kind).toBe("exception");
    expect(s.label).toBe("Delivery exception");
    expect(s.reasonLabel).toBe("Customer unreachable");
  });

  it("a partial attempt is the same ONE exception, never a second word", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [attempt("partial", "goods_damaged", "2026-08-18T02:00:00Z")],
      handoverEvents: [],
    });
    expect(s.kind).toBe("exception");
    expect(s.reasonLabel).toBe("Goods damaged");
  });

  it("the LATEST attempt governs — an old failure followed by delivery reads Delivered", () => {
    // Same-document retry on the same trip (a rebooked trip is a NEW document,
    // covered below) — the newest fact wins.
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [
        attempt("failed", "vehicle_breakdown", "2026-08-17T02:00:00Z"),
        attempt("delivered", null, "2026-08-18T05:00:00Z"),
      ],
      handoverEvents: [],
    });
    expect(s.kind).toBe("delivered");
  });

  it("a failed document is NEVER rewritten by a NEW document's success — the exception has no cross-document input", () => {
    // The arithmetic only ever sees the attempts recorded against THIS
    // number, so the old trip's document keeps its exception forever by
    // construction: there is no field through which another trip's result
    // could reach it.
    const failedTrip = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [attempt("failed", "delivery_failed", "2026-08-17T02:00:00Z")],
      handoverEvents: [],
    });
    expect(failedTrip.kind).toBe("exception");
    expect(failedTrip.reasonLabel).toBe("Delivery failed");
  });

  it("a voided document is Cancelled and names its cause", () => {
    const cancelled = deliveryOrderStatusOf({
      voidedAt: "2026-08-18T03:00:00Z",
      voidReason: "order_cancelled",
      attempts: [],
      handoverEvents: [],
    });
    expect(cancelled.kind).toBe("cancelled");
    expect(cancelled.label).toBe("Cancelled");
    expect(cancelled.reasonLabel).toBe("Order cancelled");

    const rescheduled = deliveryOrderStatusOf({
      voidedAt: "2026-08-18T03:00:00Z",
      voidReason: "rescheduled",
      attempts: [attempt("failed", "customer_unreachable", "2026-08-17T02:00:00Z")],
      handoverEvents: [],
    });
    expect(rescheduled.kind).toBe("cancelled");
    expect(rescheduled.reasonLabel).toBe("Rescheduled");
  });

  // ── the §4 chain (0363) — the card's own assertions, verbatim ─────────────

  it("Ready for Handover alone does NOT derive Out for delivery", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [],
      handoverEvents: events("ready_for_handover"),
    });
    expect(s.kind).toBe("created");
  });

  it("Handed Over alone does NOT derive Out for delivery — handover is not receipt", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [],
      handoverEvents: events("ready_for_handover", "handed_over"),
    });
    expect(s.kind).toBe("created");
  });

  it("only Received by Logistics derives Out for delivery", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [],
      handoverEvents: events("ready_for_handover", "handed_over", "received_by_logistics"),
    });
    expect(s.kind).toBe("out_for_delivery");
    expect(s.label).toBe("Out for delivery");
    expect(s.reasonLabel).toBeNull();
  });

  it("a recorded Delivery Result outranks the handover derivation — Delivered wins", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [attempt("delivered", null, "2026-08-19T05:00:00Z")],
      handoverEvents: events("ready_for_handover", "handed_over", "received_by_logistics"),
    });
    expect(s.kind).toBe("delivered");
  });

  it("a recorded exception outranks the handover derivation — the exception stays", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: null,
      voidReason: null,
      attempts: [attempt("failed", "customer_unreachable", "2026-08-19T05:00:00Z")],
      handoverEvents: events("ready_for_handover", "handed_over", "received_by_logistics"),
    });
    expect(s.kind).toBe("exception");
    expect(s.reasonLabel).toBe("Customer unreachable");
  });

  it("a voided document is Cancelled even when its goods were received — the void stamp wins", () => {
    const s = deliveryOrderStatusOf({
      voidedAt: "2026-08-19T06:00:00Z",
      voidReason: "order_cancelled",
      attempts: [],
      handoverEvents: events("ready_for_handover", "handed_over", "received_by_logistics"),
    });
    expect(s.kind).toBe("cancelled");
  });

  it("no internal enum reaches a screen — every kind has a dictionary label", () => {
    for (const label of Object.values(DELIVERY_ORDER_STATUS_LABEL)) {
      expect(label).not.toMatch(/_/);
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    }
  });
});
