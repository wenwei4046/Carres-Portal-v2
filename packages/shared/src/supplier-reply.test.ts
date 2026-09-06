import { describe, expect, it } from "vitest";
import { poSupplierDeliveryDateOf, type PoDatePromise } from "./po-workspace";
import { recordSupplierReplyInput } from "./schemas/operation";

const reply: PoDatePromise = {
  kind: "tomorrow_delivery", answer: "shipping", about_date: "2026-09-10",
  previous_date: null, new_date: null, reason: null,
  po_version: 1, channel: "whatsapp", recipient: "Factory group", evidence: "PO-TEST/reply.png",
  reported_by: "Factory staff", reported_at: "2026-09-01T01:00:00Z", recorded_by: "actor",
  recorded_at: "2026-09-01T02:00:00Z",
};
describe("evidenced current-version supplier reply", () => {
  it("keeps a same-date answer separate from no answer", () => {
    expect(poSupplierDeliveryDateOf([reply], 1)).toBe("2026-09-10");
    expect(poSupplierDeliveryDateOf([], 1)).toBeNull();
  });
  it("invalidates the answer after revision and ignores incomplete evidence", () => {
    expect(poSupplierDeliveryDateOf([reply], 2)).toBeNull();
    for (const key of ["po_version", "channel", "recipient", "evidence", "reported_by", "reported_at", "recorded_by"] as const) {
      expect(poSupplierDeliveryDateOf([{ ...reply, [key]: null }], 1)).toBeNull();
    }
  });
  it("reads the latest answer of this version, independent of fetch order", () => {
    const changed = { ...reply, answer: "delayed" as const, new_date: "2026-09-15", recorded_at: "2026-09-02T02:00:00Z" };
    expect(poSupplierDeliveryDateOf([changed, reply], 1)).toBe("2026-09-15");
  });
  it("takes ONE date, no browser classification, and only a governed reason", () => {
    /* 0430 — `answer`/`firstDate`/`newDate` left the wire: the server compares
       `supplierDate` with the recorded original and classifies it itself. */
    const input = { poVersion: 1, supplierDate: "2026-09-10", channel: "whatsapp", recipient: "Factory", evidence: "PO-TEST/reply.png", reportedBy: "Factory staff", reportedAt: "2026-09-01T00:00:00Z" };
    expect(recordSupplierReplyInput.safeParse(input).success).toBe(true);
    expect(recordSupplierReplyInput.safeParse({ ...input, answer: "shipping" }).success).toBe(false);
    expect(recordSupplierReplyInput.safeParse({ ...input, newDate: "2026-09-15" }).success).toBe(false);
    expect(recordSupplierReplyInput.safeParse({ ...input, reason: "Anything" }).success).toBe(false);
    expect(recordSupplierReplyInput.safeParse({ ...input, reason: "Material Shortage" }).success).toBe(true);
  });
});
