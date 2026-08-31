import { describe, expect, it } from "vitest";
import { recordSupplierAnswerInput, revisePoInput } from "./schemas/operation";

describe("Purchase Order governed inputs", () => {
  it("requires all supplier-answer evidence facts", () => {
    expect(recordSupplierAnswerInput.safeParse({
      answer: "same_as_po",
      poDeliveryDate: "2026-09-10",
      supplierDeliveryDate: "2026-09-10",
      channel: "whatsapp",
      evidencePath: "PO-2032/answer.png",
      supplierAnsweredAt: "2026-08-30T09:20:00+08:00",
      reportedByUserId: "00000000-0000-0000-0000-000000000101",
    }).success).toBe(true);
    expect(recordSupplierAnswerInput.safeParse({
      answer: "same_as_po",
      supplierDeliveryDate: "2026-09-10",
      channel: "whatsapp",
    }).success).toBe(false);
  });

  it("carries PO Delivery Date through the one revision request", () => {
    const result = revisePoInput.safeParse({
      reason: "Supplier asked for a later official date",
      poDeliveryDate: "2026-09-12",
      lines: [{
        lineId: "00000000-0000-0000-0000-000000000201",
        qty: 3,
        destinationId: null,
      }],
    });
    expect(result.success).toBe(true);
  });
});
