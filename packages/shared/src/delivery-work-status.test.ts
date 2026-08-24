import { describe, it, expect } from "vitest";
import {
  deliveryWorkStatusOf,
  DELIVERY_WORK_STATUS_LABEL,
  type DeliveryWorkStatusInput,
} from "./delivery-work-status";
import { DELIVERY_ORDER_STATUS_LABEL } from "./delivery-order-status";
import type { DeliveryHandoverKind } from "./delivery-order-status";

const base: DeliveryWorkStatusInput = {
  confirmedDate: null,
  hasDeliveryOrder: false,
  handoverEvents: [],
  attempts: [],
};
const at = (...kinds: DeliveryHandoverKind[]) => kinds.map((kind) => ({ kind }));
const attempt = (
  result: "delivered" | "partial" | "failed",
  reasonKey: string | null = null,
  recordedAt = "2026-08-24T10:00:00Z",
) => ({ result, reasonKey, recordedAt });

describe("deliveryWorkStatusOf — the operator's ladder, not the document's", () => {
  it("nothing agreed with the customer yet", () => {
    expect(deliveryWorkStatusOf(base).label).toBe("Waiting for customer date");
  });

  it("a day is agreed and no document exists yet", () => {
    expect(deliveryWorkStatusOf({ ...base, confirmedDate: "2026-08-28" }).label).toBe(
      "Delivery confirmed",
    );
  });

  it("⭐ a document with nothing physical recorded names the WAREHOUSE, never `Created`", () => {
    const s = deliveryWorkStatusOf({
      ...base,
      confirmedDate: "2026-08-28",
      hasDeliveryOrder: true,
    });
    expect(s.label).toBe("Waiting for warehouse");
    // The whole point of the correction: the document word must not leak here.
    expect(s.label).not.toBe(DELIVERY_ORDER_STATUS_LABEL.created);
  });

  it("the warehouse says the goods are ready", () => {
    expect(
      deliveryWorkStatusOf({
        ...base,
        hasDeliveryOrder: true,
        handoverEvents: at("ready_for_handover"),
      }).label,
    ).toBe("Ready for handover");
  });

  it("handed over WITHOUT a logistics receipt is still only ready — half a handshake", () => {
    expect(
      deliveryWorkStatusOf({
        ...base,
        hasDeliveryOrder: true,
        handoverEvents: at("ready_for_handover", "handed_over"),
      }).label,
    ).toBe("Ready for handover");
  });

  it("only the logistics receipt puts the goods on the road", () => {
    expect(
      deliveryWorkStatusOf({
        ...base,
        hasDeliveryOrder: true,
        handoverEvents: at("ready_for_handover", "handed_over", "received_by_logistics"),
      }).label,
    ).toBe("Out for delivery");
  });

  it("a recorded delivery outranks every derivation", () => {
    expect(
      deliveryWorkStatusOf({
        ...base,
        hasDeliveryOrder: true,
        handoverEvents: at("received_by_logistics"),
        attempts: [attempt("delivered")],
      }).label,
    ).toBe("Delivered");
  });

  it("a failure is ONE Failed Delivery carrying ONE reason", () => {
    const s = deliveryWorkStatusOf({
      ...base,
      hasDeliveryOrder: true,
      attempts: [attempt("failed", "customer_unreachable")],
    });
    expect(s.label).toBe("Failed Delivery");
    expect(s.reasonLabel).toBeTruthy();
  });

  it("a partial delivery is the same one failure word, never a third", () => {
    expect(
      deliveryWorkStatusOf({ ...base, hasDeliveryOrder: true, attempts: [attempt("partial")] })
        .label,
    ).toBe("Failed Delivery");
  });

  it("the LATEST attempt decides — a redelivery after a failure reads Delivered", () => {
    expect(
      deliveryWorkStatusOf({
        ...base,
        hasDeliveryOrder: true,
        attempts: [
          attempt("failed", "customer_unreachable", "2026-08-20T09:00:00Z"),
          attempt("delivered", null, "2026-08-24T09:00:00Z"),
        ],
      }).label,
    ).toBe("Delivered");
  });

  it("⭐ the document's vocabulary and the operator's never overlap on `Created`", () => {
    const operational = Object.values(DELIVERY_WORK_STATUS_LABEL);
    expect(operational).not.toContain(DELIVERY_ORDER_STATUS_LABEL.created);
    expect(operational).toHaveLength(7);
  });

  it("no status word names a mood", () => {
    for (const label of Object.values(DELIVERY_WORK_STATUS_LABEL)) {
      expect(label).not.toMatch(/pending|awaiting|in progress|scheduled|booked/i);
    }
  });
});
