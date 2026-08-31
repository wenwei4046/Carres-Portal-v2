import { describe, expect, it } from "vitest";
import {
  purchaseOrderIdentity,
  purchaseOrderRegisterFacts,
  purchaseOrderWork,
  type PurchaseOrderRegisterInput,
} from "./purchase-order-register";

const base: PurchaseOrderRegisterInput = {
  id: "PO-20260828-4827",
  supplierName: "Hooka",
  status: "open",
  version: 1,
  placedAt: "2026-08-28T08:00:00Z",
  poDeliveryDate: "2026-09-01",
  supplierDeliveryDate: null,
  expectedReadyDate: null,
  lines: [{ qty: 3, receivedQty: 0, damagedQty: 0, wrongItemQty: 0 }],
  sends: [],
};

describe("Purchase Order Register authority", () => {
  it("prints Version only after the first official document", () => {
    expect(purchaseOrderIdentity("PO-2032", 1)).toBe("PO-2032");
    expect(purchaseOrderIdentity("PO-2032", 2)).toBe("PO-2032 · Version 2");
  });

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
    expect(facts.documentState).toBe("The PO PDF has not been sent");
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
    expect(purchaseOrderWork({ ...base, version: 2, sends: base.sends }, facts)).toEqual({
      kind: "issue",
      problem: "Version 2 has not been sent",
      action: "Issue Version 2",
      dueOn: "2026-08-28",
    });
  });

  it("keeps damaged and wrong quantities separate from good received and pending delivery", () => {
    const facts = purchaseOrderRegisterFacts({
      ...base,
      supplierDeliveryDate: "2026-09-01",
      lines: [
        { qty: 3, receivedQty: 1, damagedQty: 1, wrongItemQty: 0 },
        { qty: 2, receivedQty: 2, damagedQty: 0, wrongItemQty: 1 },
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

    expect(facts.quantities).toMatchObject({
      orderQty: 5,
      receivedQty: 3,
      damagedQty: 1,
      wrongItemQty: 1,
      pendingDeliveryQty: 2,
    });
    expect(facts.filters).toContain("partly_received");
    expect(facts.operationStatus).toBe("Receiving");
  });

  it("a passed supplier date remains work while an open balance exists", () => {
    const input = {
      ...base,
      supplierDeliveryDate: "2026-08-27",
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
      kind: "supplier_date_passed",
      problem: "The supplier delivery date has passed and 3 are still due",
      action: "Ask when the goods will arrive",
      dueOn: "2026-08-27",
    });
  });

  it("gives missing supplier-date work a governed Mon–Fri due date without a supplier name", () => {
    const input = {
      ...base,
      placedAt: "2026-08-28T08:00:00Z", // Friday
      sends: [{
        kind: "confirmed_sent" as const,
        channel: "email",
        sentAt: "2026-08-28T09:00:00Z",
        poVersion: 1,
      }],
    };
    const facts = purchaseOrderRegisterFacts(input, "2026-08-28");

    expect(purchaseOrderWork(input, facts)).toEqual({
      kind: "supplier_date",
      problem: "The supplier delivery date is missing",
      action: "Ask for the delivery date",
      dueOn: "2026-08-31",
    });
  });

  it("completed and cancelled documents do not create supplier work", () => {
    const completed = purchaseOrderRegisterFacts({
      ...base,
      status: "received",
      lines: [{ qty: 3, receivedQty: 3, damagedQty: 0, wrongItemQty: 0 }],
    }, "2026-08-28");
    const cancelled = purchaseOrderRegisterFacts({ ...base, status: "cancelled" }, "2026-08-28");

    expect(completed.operationStatus).toBe("Completed");
    expect(completed.filters).toContain("completed");
    expect(purchaseOrderWork(base, completed)).toBeNull();
    expect(cancelled.operationStatus).toBe("Cancelled");
    expect(cancelled.filters).toContain("cancelled");
    expect(purchaseOrderWork(base, cancelled)).toBeNull();
  });
});
