import { describe, expect, it } from "vitest";
import {
  purchaseOrderRegisterFacts,
  purchaseOrderWork,
  type PurchaseOrderRegisterInput,
} from "./purchase-order-register";

const base: PurchaseOrderRegisterInput = {
  id: "PO-20260828-4827",
  supplierName: "Hooka",
  status: "open",
  version: 1,
  supplierDate: null,
  expectedReadyDate: null,
  lines: [{ qty: 3, receivedQty: 0 }],
  sends: [],
};

describe("Purchase Order Register authority", () => {
  it("an external app opening never means the current PDF was sent", () => {
    const facts = purchaseOrderRegisterFacts({
      ...base,
      sends: [
        {
          kind: "external_open",
          channel: "whatsapp",
          sentAt: "2026-08-28T09:00:00Z",
          poVersion: null,
        },
      ],
    }, "2026-08-28");

    expect(facts.currentSend).toBeNull();
    expect(facts.filters).toContain("pdf_not_sent");
    expect(facts.documentState).toBe("Not sent to supplier");
  });

  it("a confirmed old version does not prove the current version reached the supplier", () => {
    const facts = purchaseOrderRegisterFacts({
      ...base,
      version: 2,
      sends: [
        {
          kind: "confirmed_sent",
          channel: "email",
          recipient: "buy@hooka.my",
          sentAt: "2026-08-27T09:00:00Z",
          poVersion: 1,
        },
      ],
    }, "2026-08-28");

    expect(facts.filters).toContain("supplier_update_required");
    expect(facts.sentToSupplier).toBe("PO V1");
    expect(purchaseOrderWork({ ...base, version: 2, sends: base.sends }, facts)).toEqual({
      problem: "PO V2 has not been sent",
      action: "Issue PO V2 to Hooka",
    });
  });

  it("received goods without a confirmed-send record stay honestly Not sent", () => {
    const facts = purchaseOrderRegisterFacts({
      ...base,
      status: "received",
      lines: [{ qty: 3, receivedQty: 3 }],
      sends: [],
    }, "2026-08-28");

    expect(facts.sentToSupplier).toBe("Not sent");
    expect(facts.latestConfirmedSend).toBeNull();
  });

  it("derives ordered, received and open balance from governed line quantities", () => {
    const facts = purchaseOrderRegisterFacts({
      ...base,
      supplierDate: "2026-09-01",
      lines: [
        { qty: 3, receivedQty: 1 },
        { qty: 2, receivedQty: 2 },
      ],
      sends: [
        {
          kind: "confirmed_sent",
          channel: "whatsapp",
          sentAt: "2026-08-28T09:00:00Z",
          poVersion: 1,
        },
      ],
    }, "2026-08-28");

    expect(facts.quantities).toEqual({ ordered: 5, received: 3, open: 2 });
    expect(facts.filters).toContain("partly_received");
    expect(facts.operationStatus).toBe("Receiving");
  });

  it("a passed supplier date remains work while an open balance exists", () => {
    const input = {
      ...base,
      supplierDate: "2026-08-27",
      sends: [
        {
          kind: "confirmed_sent" as const,
          channel: "whatsapp",
          sentAt: "2026-08-20T09:00:00Z",
          poVersion: 1,
        },
      ],
    };
    const facts = purchaseOrderRegisterFacts(input, "2026-08-28");

    expect(facts.filters).toContain("supplier_date_passed");
    expect(purchaseOrderWork(input, facts)).toEqual({
      problem: "The supplier date has passed and 3 are still open",
      action: "Ask Hooka when the goods will arrive",
    });
  });

  it("completed and cancelled documents do not create supplier work", () => {
    const completed = purchaseOrderRegisterFacts({
      ...base,
      status: "received",
      lines: [{ qty: 3, receivedQty: 3 }],
    }, "2026-08-28");
    const cancelled = purchaseOrderRegisterFacts({ ...base, status: "cancelled" }, "2026-08-28");

    expect(completed.operationStatus).toBe("Completed");
    expect(completed.filters).toContain("completed");
    expect(purchaseOrderWork(base, completed)).toBeNull();
    expect(cancelled.operationStatus).toBe("Cancelled");
    expect(purchaseOrderWork(base, cancelled)).toBeNull();
  });
});
