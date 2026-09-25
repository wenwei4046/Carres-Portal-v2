import { describe, expect, it } from "vitest";
import {
  purchaseOrderRegisterFacts,
  purchaseOrderWork,
  purchaseOrderReplyWorkItems,
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
    expect(facts.documentState).toBe("Sending not confirmed");
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

    expect(facts.sentToSupplier).toBe("Sending not confirmed");
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
      problem: "Supplier delivery date passed",
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

  it("a completed PO without sending evidence leaves work but never fabricates a send", () => {
    /* Correction card §5 — receiving completion and sending evidence are two
       facts. Completed goods close the send WORK (no PDF is owed), while the
       Sent to Supplier fact stays an honest `Not sent`. */
    const facts = purchaseOrderRegisterFacts({
      ...base,
      status: "received",
      lines: [{ qty: 3, receivedQty: 3 }],
      sends: [],
    }, "2026-08-28");
    expect(facts.filters).toEqual(["completed"]);
    expect(facts.filters).not.toContain("pdf_not_sent");
    expect(facts.sentToSupplier).toBe("Sending not confirmed");
  });

  it("a revised PO whose latest version is unsent is BOTH not-sent and update-required — overlap, not exclusivity", () => {
    /* Correction card §5 — the rail's facets overlap by design; their counts
       describe rows matching each facet, never a partition of the register. */
    const facts = purchaseOrderRegisterFacts({
      ...base,
      version: 2,
      sends: [{ kind: "confirmed_sent", channel: "whatsapp", poVersion: 1, sentAt: "2026-08-27T09:00:00Z" }],
    }, "2026-08-28");
    expect(facts.filters).toContain("pdf_not_sent");
    expect(facts.filters).toContain("supplier_update_required");
    /* And it left the chase facets: nothing asks a supplier about a version
       Carres has not sent. */
    expect(facts.filters).not.toContain("supplier_date_missing");
    expect(facts.filters).not.toContain("supplier_date_passed");
    expect(facts.sentToSupplier).toBe("PO V1");
  });
});


describe("shared supplier reply Work", () => {
  const sent = { kind: "confirmed_sent" as const, channel: "whatsapp", poVersion: 1, sentAt: "2026-09-03T17:00:00Z" };
  const person = { userId: "po-duty", name: "Jess" };
  const owner = { dutyKey: "po_duty", onDate: "2026-09-08", normalOwner: person,
    actingPerson: person, activeCover: null, buddy: null, state: "primary" as const, assignmentId: "assignment" };
  it("starts on the Malaysia send day and resending does not reset its clock", () => {
    const items = purchaseOrderReplyWorkItems({ ...base, sends: [sent, { ...sent, sentAt: "2026-09-07T01:00:00Z" }] }, owner, "2026-09-08", new Set());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ dueIso: "2026-09-04", workingDaysLate: 2, ownerUserId: "po-duty", ruleKey: "purchasing.supplier_reply", action: "Ask Hooka to confirm the PO delivery date" });
  });
  it("does not chase an unsent revision, completed goods, or a current future reply", () => {
    for (const patch of [{ version: 2 }, { lines: [{ qty: 3, receivedQty: 3 }] }, { supplierDate: "2026-09-10" }]) {
      expect(purchaseOrderReplyWorkItems({ ...base, sends: [sent], ...patch }, owner, "2026-09-08", new Set())).toEqual([]);
    }
  });
  it("routes to active cover while retaining the normal owner for Team Work", () => {
    const cover = { userId: "cover", name: "Cover" };
    const [item] = purchaseOrderReplyWorkItems({ ...base, sends: [sent] }, { ...owner, activeCover: cover, actingPerson: cover, state: "covered" }, "2026-09-08", new Set());
    expect(item).toMatchObject({ ownerUserId: "cover", normalOwner: person, activeCover: cover, ownerDutyKey: "po_duty", ownerState: "covered" });
    expect(purchaseOrderReplyWorkItems({ ...base, sends: [sent] }, null, "2026-09-08", new Set())[0]).toMatchObject({ ownerUserId: null, normalOwner: null, ownerState: "not_assigned" });
  });
  it("rolls an office holiday forward without changing the supplier date", () => {
    const input = { ...base, sends: [sent], supplierDate: "2026-09-05" };
    expect(purchaseOrderReplyWorkItems(input, owner, "2026-09-09", new Set(["2026-09-07"]))[0]).toMatchObject({ dueIso: "2026-09-08", ruleKey: "purchasing.supplier_date_passed" });
    expect(input.supplierDate).toBe("2026-09-05");
  });
});

/* ── Purchasing MASTER §5.8 / §9.3 (Jess, 2026-09-17) ─────────────────────── */
describe("Purchase Orders listing groups and Expected Delivery Date", () => {
  const marked = {
    kind: "confirmed_sent" as const,
    channel: "whatsapp",
    recipient: "https://chat.whatsapp.com/hooka",
    sentAt: "2026-09-01T09:00:00Z",
    poVersion: 1,
  };

  it("classifies Cancelled → Completed → Waiting for goods from supplier → Confirm PO sent to supplier, each PO once", () => {
    const today = "2026-09-17";
    expect(purchaseOrderRegisterFacts({ ...base, status: "cancelled", sends: [marked] }, today).group).toBe("cancelled");
    expect(purchaseOrderRegisterFacts({ ...base, lines: [{ qty: 3, receivedQty: 3 }], sends: [marked] }, today).group).toBe("completed");
    expect(purchaseOrderRegisterFacts({ ...base, sends: [marked] }, today).group).toBe("issued");
    expect(purchaseOrderRegisterFacts(base, today).group).toBe("not_marked_as_sent");
  });

  it("a completed legacy PO without a mark stays Completed, and says it is not marked", () => {
    const facts = purchaseOrderRegisterFacts({ ...base, status: "received", lines: [{ qty: 3, receivedQty: 3 }] }, "2026-09-17");
    expect(facts.group).toBe("completed");
    expect(facts.currentSend).toBeNull();
    expect(facts.sentToSupplier).toBe("Sending not confirmed");
  });

  it("an earlier version's mark never marks the current version", () => {
    const facts = purchaseOrderRegisterFacts({ ...base, version: 2, sends: [marked] }, "2026-09-17");
    expect(facts.group).toBe("not_marked_as_sent");
    expect(facts.sentToSupplier).toBe("PO V1");
  });

  it("a failed quantity read is never zero and never Completed", () => {
    for (const lines of [null, [{ qty: 3, receivedQty: null }], [{ qty: null, receivedQty: 0 }]]) {
      const facts = purchaseOrderRegisterFacts({ ...base, lines, sends: [marked] }, "2026-09-17");
      expect(facts.quantitiesKnown).toBe(false);
      expect(facts.group).toBe("issued");
      expect(facts.filters).not.toContain("completed");
      expect(facts.filters).not.toContain("partly_received");
      // An unknown balance raises no supplier chase it cannot justify.
      expect(facts.filters).not.toContain("supplier_date_missing");
    }
    // The authoritative received status still completes it.
    expect(purchaseOrderRegisterFacts({ ...base, status: "received", lines: null }, "2026-09-17").group).toBe("completed");
  });

  it("Expected Delivery Date: supplier's evidenced date first, else the original, else unknown", () => {
    const today = "2026-09-17";
    expect(purchaseOrderRegisterFacts({ ...base, originalDate: "2026-09-25", sends: [marked] }, today).expected)
      .toEqual({ date: "2026-09-25", supplier: "not_confirmed", changedFrom: null });
    expect(purchaseOrderRegisterFacts({ ...base, originalDate: "2026-09-25", supplierDate: "2026-09-25", sends: [marked] }, today).expected)
      .toEqual({ date: "2026-09-25", supplier: "confirmed", changedFrom: null });
    expect(purchaseOrderRegisterFacts({ ...base, originalDate: "2026-09-25", supplierDate: "2026-10-02", sends: [marked] }, today).expected)
      .toEqual({ date: "2026-10-02", supplier: "changed", changedFrom: "2026-09-25" });
    expect(purchaseOrderRegisterFacts({ ...base, originalDate: null, sends: [marked] }, today).expected)
      .toEqual({ date: null, supplier: "not_confirmed", changedFrom: null });
  });

  it("Supplier Delivery Date changed is a SUPPLIER REPLY facet for marked, pending POs only", () => {
    const today = "2026-09-17";
    const changed = { ...base, originalDate: "2026-09-25", supplierDate: "2026-10-02" };
    expect(purchaseOrderRegisterFacts({ ...changed, sends: [marked] }, today).filters).toContain("supplier_date_changed");
    expect(purchaseOrderRegisterFacts(changed, today).filters).not.toContain("supplier_date_changed");
    expect(purchaseOrderRegisterFacts({ ...changed, sends: [marked], lines: [{ qty: 3, receivedQty: 3 }] }, today).filters)
      .not.toContain("supplier_date_changed");
    expect(purchaseOrderRegisterFacts({ ...base, originalDate: "2026-09-25", supplierDate: "2026-09-25", sends: [marked] }, today).filters)
      .not.toContain("supplier_date_changed");
  });
});
