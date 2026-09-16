import { describe, expect, it } from "vitest";
import {
  buildIssueEnglish,
  buildIssueWorkTitle,
  createIssueInputSchema,
  decideProblemHome,
  issueIntakeSchema,
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
  it("routes customer remedy to Service Case and keeps pure internal failure in Issue Tracker", () => {
    expect(decideProblemHome({ customerResolutionRequired: true, internalFailureObserved: false })).toEqual({
      home: "service_case",
      linkedIssueRequired: false,
    });
    expect(decideProblemHome({ customerResolutionRequired: false, internalFailureObserved: true })).toEqual({
      home: "issue_tracker",
      linkedIssueRequired: false,
    });
    expect(decideProblemHome({ customerResolutionRequired: true, internalFailureObserved: true })).toEqual({
      home: "service_case",
      linkedIssueRequired: true,
    });
    expect(decideProblemHome({ customerResolutionRequired: false, internalFailureObserved: false })).toEqual({
      home: "owning_module",
      linkedIssueRequired: false,
    });
  });

  it("requires a Service Case link when an internal Issue also affected a customer", () => {
    const work = { owner: "Yu Jun", object: "New issue", recipient: "Operations", action: "Check the missed label step", requiredResult: "The check result is recorded", dueOn: "2026-08-17" };
    const withoutCase = createIssueInputSchema.safeParse({ intake, scope: "customer_impact_linked", sourceModule: "receiving", work });
    expect(withoutCase.success).toBe(false);
    expect(createIssueInputSchema.safeParse({
      intake: { ...intake, linkedObjects: [...intake.linkedObjects, { kind: "service_case" as const, id: "case-1", label: "SC-104" }] },
      scope: "customer_impact_linked",
      sourceModule: "receiving",
      work,
    }).success).toBe(true);
  });

  it("creates official English from facts without asking staff to compose it", () => {
    expect(issueIntakeSchema.parse(intake)).toEqual(intake);
    expect(buildIssueEnglish(intake)).toBe(
      "Unit CU-000128 was damaged when Warehouse checked PO-2041 on 14 Aug 2026. 3 photos were added by Mei Ling. SO-1319 cannot use this Unit.",
    );
  });

  it("rejects a bare action and builds WHO + OBJECT + RECIPIENT + RESULT + WHEN", () => {
    expect(() => buildIssueWorkTitle({ owner: "Yu Jun", object: "IS-204", recipient: "Hookka", action: "Call", requiredResult: "", dueOn: "2026-08-17" })).toThrow();
    expect(buildIssueWorkTitle({ owner: "Yu Jun", object: "IS-204", recipient: "Hookka", action: "Call about the wrong item", requiredResult: "Ask if they accept RM80", dueOn: "2026-08-17" })).toBe(
      "Yu Jun · Call about the wrong item for IS-204 · Contact Hookka · Need: Ask if they accept RM80 · By 17 Aug 2026",
    );
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
