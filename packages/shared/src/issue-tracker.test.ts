import { describe, expect, it } from "vitest";
import {
  buildIssueEnglish,
  issueActionInputSchema,
  issueActionResultInputSchema,
  issueIntakeSchema,
  projectIssueActionWork,
  reconcileIssueMoney,
  relatedPartyReportRows,
} from "./issue-tracker";

const intake = {
  problemObject: "item" as const,
  observedProblem: "damaged" as const,
  foundByKind: "warehouse" as const,
  foundByName: "Mei Ling",
  observedOn: "2026-08-14",
  linkedObjects: [{ kind: "purchase_order" as const, id: "po-1", label: "PO-2041" }],
  affectedObject: "Unit CU-000128",
  impact: "SO-1319 cannot use this Unit",
  evidence: [{ kind: "photo" as const, count: 3 }],
};

describe("Issue Tracker operating model", () => {
  it("creates official English from facts without asking staff to compose it", () => {
    expect(issueIntakeSchema.parse(intake)).toEqual(intake);
    expect(buildIssueEnglish(intake)).toBe(
      "Unit CU-000128 was damaged when Warehouse checked PO-2041 on 14 Aug 2026. 3 photos were added by Mei Ling. SO-1319 cannot use this Unit.",
    );
  });

  it("keeps the owner rule structured and rejects owner prose in the action", () => {
    const action = issueActionInputSchema.parse({
      trigger: "Supplier has not answered the evidence request",
      ownerRule: "issue_triage_duty",
      action: "Ask supplier to accept or reject the evidence",
      recipient: "Hookka",
      requiredResult: "Acceptance or rejection recorded",
      dueOn: "2026-08-17",
    });
    expect(action.ownerRule).toBe("issue_triage_duty");
    expect(action.action).not.toContain("Yu Jun");
    expect(() => issueActionInputSchema.parse({ ...action, action: "Yu Jun · Ask supplier to reply" })).toThrow();
  });

  it("requires a governed result when completing the current action", () => {
    expect(issueActionResultInputSchema.parse({ resultCode: "accepted", result: "Supplier accepted the evidence" })).toEqual({ resultCode: "accepted", result: "Supplier accepted the evidence" });
    expect(() => issueActionResultInputSchema.parse({ resultCode: "", result: "Done" })).toThrow();
  });

  it("projects one open Issue action with duty cover and an exact Issue door", () => {
    const [item] = projectIssueActionWork({
      actions: [{ id: "action-1", issueId: "issue-1", issueNo: "IS-2608-0001", trigger: "Supplier has not answered", ownerRule: "issue_triage_duty", action: "Ask supplier for an answer", recipient: "Hookka", requiredResult: "Supplier answer recorded", dueOn: "2026-09-06", materiality: "significant" }],
      dutyResolutions: { issue_triage_duty: { dutyKey: "issue_triage_duty", onDate: "2026-09-07", normalOwner: { userId: "staff-1", name: "Shasha" }, buddy: { userId: "staff-2", name: "Yu Jun" }, activeCover: { userId: "staff-2", name: "Yu Jun" }, actingPerson: { userId: "staff-2", name: "Yu Jun" }, state: "covered", assignmentId: "assignment-1" } },
      today: "2026-09-07",
    });
    expect(item).toMatchObject({
      id: "issue_tracker:action-1:current_action",
      module: "issue_tracker",
      object: { id: "issue-1", label: "IS-2608-0001" },
      problem: "Supplier has not answered",
      action: "Ask supplier for an answer",
      owner: { rule: "issue_triage_duty", normal: { name: "Shasha" }, acting: { name: "Yu Jun" }, state: "covered" },
      timing: { bucket: "overdue" },
      destination: "/operation/issues?issue=issue-1",
    });
  });

  it("keeps incurred, recoverable and recovered separate", () => {
    expect(reconcileIssueMoney([
      { track: "incurred", amount: 80, currency: "MYR" },
      { track: "recoverable", amount: 80, currency: "MYR", costBearerId: "hookka" },
      { track: "recovered", amount: 20, currency: "MYR", costBearerId: "hookka" },
    ])).toEqual({ currency: "MYR", incurred: 80, recoverable: 80, recovered: 20, outstanding: 60 });
  });

  it("shows one issue in each fault owner's report without duplicating company cost", () => {
    const rows = relatedPartyReportRows({
      issueId: "issue-1",
      issueNo: "IS-2608-0001",
      observedOn: "2026-08-14",
      officialEnglish: "A wrong item was delivered.",
      incurred: 80,
      faultOwners: [
        { partyId: "hookka", partyName: "Hookka", actOrOmission: "Supplied the wrong item", finding: "confirmed_fault" as const },
        { partyId: "tsdd", partyName: "TSDD", actOrOmission: "Delivered without label check", finding: "contributing_fault" as const },
      ],
      money: [{ track: "recoverable" as const, amount: 80, currency: "MYR", costBearerId: "hookka" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.issueId)).toEqual(["issue-1", "issue-1"]);
    expect(rows.find((r) => r.partyId === "hookka")?.recoverable).toBe(80);
    expect(rows.find((r) => r.partyId === "tsdd")?.recoverable).toBe(0);
    expect(new Set(rows.map((r) => r.issueId)).size).toBe(1);
  });
});
