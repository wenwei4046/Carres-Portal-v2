import { describe, expect, it } from "vitest";

import {
  codInstruction,
  paymentApprovalDecideInput,
  paymentApprovalOpensGate,
  paymentApprovalReason,
  paymentApprovalRequestInput,
  pendingPaymentApproval,
  type DeliveryPaymentApproval,
} from "./delivery-payment-approval";

/**
 * Owner ruling 2026-08-19: money in full before delivery is the only default;
 * the one exception is a recorded APPROVED Delivery Payment Approval. These
 * prove the ONE predicate every reader asks, and the governed sentences.
 */

const row = (
  over: Partial<DeliveryPaymentApproval> = {},
): DeliveryPaymentApproval => ({
  id: "pa-1",
  status: "pending",
  requestReason: "Outstation — partner schedules the customer",
  requestedAt: "2026-08-19T02:00:00Z",
  decidedAt: null,
  decisionReason: null,
  ...over,
});

describe("paymentApprovalOpensGate — the one predicate", () => {
  it("no rows → shut", () => {
    expect(paymentApprovalOpensGate([])).toBe(false);
  });
  it("pending → shut · refused → shut · approved → open", () => {
    expect(paymentApprovalOpensGate([row()])).toBe(false);
    expect(
      paymentApprovalOpensGate([
        row({ status: "refused", decidedAt: "x", decisionReason: "Collect first" }),
      ]),
    ).toBe(false);
    expect(
      paymentApprovalOpensGate([
        row({ status: "approved", decidedAt: "x", decisionReason: "COD" }),
      ]),
    ).toBe(true);
  });
  it("one approval among refusals still opens — decisions are append-only history", () => {
    expect(
      paymentApprovalOpensGate([
        row({ id: "a", status: "refused", decidedAt: "x", decisionReason: "no" }),
        row({ id: "b", status: "approved", decidedAt: "y", decisionReason: "COD" }),
      ]),
    ).toBe(true);
  });
});

describe("paymentApprovalReason — the governed refusal", () => {
  it("silent when nothing is outstanding, or an approval opens the gate", () => {
    expect(paymentApprovalReason(0, [])).toBeNull();
    expect(
      paymentApprovalReason(500, [
        row({ status: "approved", decidedAt: "x", decisionReason: "COD" }),
      ]),
    ).toBeNull();
  });
  it("names the figure and the two closers when nothing is raised", () => {
    const r = paymentApprovalReason(2455.5, []);
    expect(r).toContain("RM 2,455.50");
    expect(r).toContain("collect it in full");
    expect(r).toContain("request a payment approval");
  });
  it("says the decision is awaited while a request is pending", () => {
    expect(paymentApprovalReason(100, [row()])).toContain(
      "waiting for the approver",
    );
  });
});

describe("pendingPaymentApproval", () => {
  it("returns the newest pending row, and null when none wait", () => {
    expect(pendingPaymentApproval([])).toBeNull();
    expect(
      pendingPaymentApproval([
        row({ id: "old" }),
        row({ id: "new" }),
      ])?.id,
    ).toBe("new");
    expect(
      pendingPaymentApproval([
        row({ status: "refused", decidedAt: "x", decisionReason: "no" }),
      ]),
    ).toBeNull();
  });
});

describe("codInstruction — the DO document's line, owner's words", () => {
  it("spells the amount through the ONE money spelling", () => {
    expect(codInstruction(3200)).toBe(
      "COLLECT RM 3,200.00 BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.",
    );
  });
});

describe("the two doors' inputs", () => {
  it("a request requires its reason", () => {
    expect(paymentApprovalRequestInput.safeParse({ reason: "  " }).success).toBe(false);
    expect(
      paymentApprovalRequestInput.safeParse({ reason: "Outstation trip" }).success,
    ).toBe(true);
  });
  it("a decision requires the verdict and the approver's reason", () => {
    expect(
      paymentApprovalDecideInput.safeParse({ decision: "approved", reason: "" })
        .success,
    ).toBe(false);
    expect(
      paymentApprovalDecideInput.safeParse({ decision: "maybe", reason: "x" })
        .success,
    ).toBe(false);
    expect(
      paymentApprovalDecideInput.safeParse({
        decision: "refused",
        reason: "Collect in full first",
      }).success,
    ).toBe(true);
  });
});
