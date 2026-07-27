import { describe, it, expect } from "vitest";
import {
  EMERGENCY_REASONS,
  EMERGENCY_REASON_LABEL,
  EMERGENCY_STATUS_LABEL,
  computeEmergencyView,
  emergencyDraftProblem,
  emergencyPoList,
  reasonNeedsNote,
  type EmergencyRequest,
} from "./emergency-stock-request";
import { computePlanView, planPoList } from "./ready-stock-plan";

/**
 * Urgent restock engine — card K3.
 *
 * The four things a click could never prove:
 *  1. An approved urgent ask NEVER reaches the monthly plan's numbers.
 *  2. The urgent PO list reads the APPROVED number and drops what is ordered.
 *  3. `Other` cannot be filed without words.
 *  4. The waiting queue puts the OLDEST ask first — the one about to cost a sale.
 */

const PILLOW = "Essential Memory Pillow(L)";
const ASOF = "2026-07-27";

function req(over: Partial<EmergencyRequest> = {}): EmergencyRequest {
  return {
    id: "r1",
    sku: PILLOW,
    qty: 20,
    reason: "weekend_low",
    note: null,
    requestedBy: "u1",
    requestedByName: "Jess",
    requestedAt: "2026-07-27T01:00:00Z",
    status: "pending",
    approvedQty: null,
    ...over,
  };
}

describe("the locked reason list", () => {
  it("carries the card's six reasons and nothing else", () => {
    expect([...EMERGENCY_REASONS]).toEqual([
      "promotion",
      "unexpected_demand",
      "weekend_low",
      "oos_risk",
      "new_launch",
      "other",
    ]);
  });

  it("gives every reason and every state a plain-word label", () => {
    for (const r of EMERGENCY_REASONS) {
      expect(EMERGENCY_REASON_LABEL[r]).toBeTruthy();
      // The DB word must never be the screen word.
      expect(EMERGENCY_REASON_LABEL[r]).not.toContain("_");
    }
    for (const label of Object.values(EMERGENCY_STATUS_LABEL)) {
      expect(label).not.toContain("_");
    }
  });

  it("keeps warehouse jargon off the screen", () => {
    expect(EMERGENCY_REASON_LABEL.oos_risk).toBe("About to run out");
    expect(EMERGENCY_REASON_LABEL.oos_risk).not.toMatch(/OOS/i);
  });

  it("asks only Other to explain itself", () => {
    expect(reasonNeedsNote("other")).toBe(true);
    for (const r of EMERGENCY_REASONS.filter((k) => k !== "other")) {
      expect(reasonNeedsNote(r)).toBe(false);
    }
  });
});

describe("emergencyDraftProblem", () => {
  const ok = { sku: PILLOW, qty: 5, reason: "promotion" as const, note: null };

  it("passes a complete draft", () => {
    expect(emergencyDraftProblem(ok)).toBeNull();
  });

  it("refuses a blank item, a non-positive qty and an absurd qty", () => {
    expect(emergencyDraftProblem({ ...ok, sku: "   " })).toBeTruthy();
    expect(emergencyDraftProblem({ ...ok, qty: 0 })).toBeTruthy();
    expect(emergencyDraftProblem({ ...ok, qty: -3 })).toBeTruthy();
    expect(emergencyDraftProblem({ ...ok, qty: 1.5 })).toBeTruthy();
    expect(emergencyDraftProblem({ ...ok, qty: 100001 })).toBeTruthy();
  });

  it("refuses no reason, and a reason nobody locked", () => {
    expect(emergencyDraftProblem({ ...ok, reason: "" })).toBeTruthy();
    expect(
      emergencyDraftProblem({
        ...ok,
        reason: "because_i_said_so" as never,
      }),
    ).toBeTruthy();
  });

  it("refuses Other with no words — the whole point of the list", () => {
    expect(emergencyDraftProblem({ ...ok, reason: "other" })).toBeTruthy();
    expect(emergencyDraftProblem({ ...ok, reason: "other", note: "  " })).toBeTruthy();
    expect(
      emergencyDraftProblem({ ...ok, reason: "other", note: "TikTok video" }),
    ).toBeNull();
  });
});

describe("computeEmergencyView", () => {
  it("shows what the warehouse actually holds, in units not rows", () => {
    const v = computeEmergencyView({
      requests: [req({ qty: 20 })],
      // 0218 bulk register: one row, 555 units.
      units: [
        { sku: PILLOW, status: "free", qty: 555 },
        { sku: PILLOW, status: "reserved", qty: 4 },
        { sku: PILLOW, status: "incoming", qty: 100 },
      ],
      asOf: ASOF,
    });
    expect(v.rows[0].onHand).toBe(555);
    expect(v.rows[0].reserved).toBe(4);
    expect(v.rows[0].incoming).toBe(100);
  });

  it("warns when free stock already covers the ask — and never blocks it", () => {
    const covered = computeEmergencyView({
      requests: [req({ qty: 20 })],
      units: [{ sku: PILLOW, status: "free", qty: 555 }],
      asOf: ASOF,
    });
    expect(covered.rows[0].coveredByFreeStock).toBe(true);
    // Still a live, decidable request — a warning, not a refusal.
    expect(covered.rows[0].status).toBe("pending");
    expect(covered.pendingCount).toBe(1);

    const short = computeEmergencyView({
      requests: [req({ qty: 20 })],
      units: [{ sku: PILLOW, status: "free", qty: 15 }],
      asOf: ASOF,
    });
    expect(short.rows[0].coveredByFreeStock).toBe(false);
  });

  it("does not count reserved or incoming units as cover", () => {
    const v = computeEmergencyView({
      requests: [req({ qty: 20 })],
      units: [
        { sku: PILLOW, status: "reserved", qty: 900 },
        { sku: PILLOW, status: "incoming", qty: 900 },
      ],
      asOf: ASOF,
    });
    expect(v.rows[0].coveredByFreeStock).toBe(false);
    expect(v.rows[0].onHand).toBe(0);
  });

  it("reads an unknown SKU as zero rather than throwing", () => {
    const v = computeEmergencyView({
      requests: [req({ sku: "Never-stocked item" })],
      units: [{ sku: PILLOW, status: "free", qty: 555 }],
      asOf: ASOF,
    });
    expect(v.rows[0].onHand).toBe(0);
  });

  it("puts waiting asks first, oldest first, and history newest first", () => {
    const v = computeEmergencyView({
      requests: [
        req({ id: "new-pending", requestedAt: "2026-07-27T09:00:00Z" }),
        req({ id: "old-decided", status: "approved", approvedQty: 5, requestedAt: "2026-07-20T09:00:00Z" }),
        req({ id: "old-pending", requestedAt: "2026-07-24T09:00:00Z" }),
        req({ id: "new-decided", status: "rejected", requestedAt: "2026-07-26T09:00:00Z" }),
      ],
      asOf: ASOF,
    });
    expect(v.rows.map((r) => r.id)).toEqual([
      "old-pending",
      "new-pending",
      "old-decided", // approved sorts above rejected
      "new-decided",
    ]);
    expect(v.pendingCount).toBe(2);
  });

  it("counts the days an ask has been waiting, and stops once answered", () => {
    const v = computeEmergencyView({
      requests: [
        req({ id: "a", requestedAt: "2026-07-24T23:00:00Z" }),
        req({ id: "b", status: "approved", approvedQty: 5, requestedAt: "2026-07-20T01:00:00Z" }),
      ],
      asOf: ASOF,
    });
    const byId = Object.fromEntries(v.rows.map((r) => [r.id, r]));
    expect(byId.a.waitingDays).toBe(3);
    expect(byId.b.waitingDays).toBeNull();
  });
});

describe("emergencyPoList", () => {
  it("reads the approved number and never falls back to what was asked", () => {
    const list = emergencyPoList([
      req({ id: "1", qty: 100, status: "approved", approvedQty: 30 }),
    ]);
    expect(list).toEqual([{ sku: PILLOW, qty: 30, requestCount: 1 }]);
  });

  it("hands over nothing for a pending or turned-down ask", () => {
    expect(emergencyPoList([req({ status: "pending", approvedQty: null })])).toEqual([]);
    expect(
      emergencyPoList([req({ status: "rejected", approvedQty: null })]),
    ).toEqual([]);
    // An approval with no number is not an instruction to order.
    expect(emergencyPoList([req({ status: "approved", approvedQty: null })])).toEqual(
      [],
    );
    expect(emergencyPoList([req({ status: "approved", approvedQty: 0 })])).toEqual([]);
  });

  it("drops a line once somebody has raised the purchase order", () => {
    expect(
      emergencyPoList([req({ status: "ordered", approvedQty: 30 })]),
    ).toEqual([]);
  });

  it("merges two panics about the same item into ONE purchase line", () => {
    const list = emergencyPoList([
      req({ id: "1", status: "approved", approvedQty: 30 }),
      req({ id: "2", status: "approved", approvedQty: 12 }),
      req({ id: "3", sku: "MP-K", status: "approved", approvedQty: 8 }),
    ]);
    expect(list).toEqual([
      { sku: PILLOW, qty: 42, requestCount: 2 },
      { sku: "MP-K", qty: 8, requestCount: 1 },
    ]);
  });
});

describe("the two lanes never mix (the card's own line)", () => {
  it("an approved urgent ask changes nothing in the monthly plan", () => {
    // The monthly cycle, as K2 computes it, with one ordinary proposal.
    const plan = computePlanView({
      proposals: [{ sku: PILLOW, qty: 10, proposedBy: "u1" }],
      lines: [{ sku: PILLOW, consolidatedQty: 10, approvedQty: 10 }],
      units: [{ sku: PILLOW, status: "free", qty: 555 }],
      sales: [],
      asOf: ASOF,
    });

    // A huge urgent ask, approved, for the same SKU on the same day.
    const urgent = computeEmergencyView({
      requests: [req({ qty: 900, status: "approved", approvedQty: 900 })],
      units: [{ sku: PILLOW, status: "free", qty: 555 }],
      asOf: ASOF,
    });
    expect(urgent.poList).toEqual([{ sku: PILLOW, qty: 900, requestCount: 1 }]);

    // The plan is untouched: the ask, the cut, the approval and the PO list all
    // still speak only about the 10 somebody proposed for the month.
    expect(plan.rows[0].proposedQty).toBe(10);
    expect(plan.rows[0].approvedQty).toBe(10);
    expect(planPoList(plan.rows)).toEqual([{ sku: PILLOW, qty: 10 }]);
  });
});
