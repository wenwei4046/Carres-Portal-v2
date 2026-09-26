import { describe, expect, it } from "vitest";
import {
  makeAvailableChecks,
  unitCountAgainAction,
  unitProblemAction,
  unitProblemConsequence,
  unitProblemIntake,
  unitProblemReportInputSchema,
} from "./unit-problem";
import { buildIssueEnglish } from "./issue-tracker";

const free = { id: "u1", unitCode: "U1-000-082", productName: "Jager · Super Single", sku: "JAGER-SS", availability: "available", status: "free", siteName: "Carres Klang" };
const reserved = { ...free, availability: "reserved", status: "reserved", reservedRef: "SO2609-4827", soldOrderId: "order-1" };

describe("Report a problem — the consequence is explained before submit (Stock MASTER §6)", () => {
  it("a free Unit will read Cannot sell · Waiting inspection", () => {
    expect(unitProblemConsequence(free, "damaged")).toBe(
      "After you submit, U1-000-082 reads Cannot sell · Waiting inspection until Carres Klang checks it and records the result.",
    );
  });
  it("a reserved Unit keeps its Sales Order and Sales sees the risk", () => {
    expect(unitProblemConsequence(reserved, "damaged")).toBe(
      "U1-000-082 stays reserved for SO2609-4827. Sales sees this problem on the order until it is checked.",
    );
  });
});

describe("the one shared Work action", () => {
  it("routes the check to GRN Duty at the Site, due the next working day, in the governed grammar", () => {
    const action = unitProblemAction(free, "damaged", "2026-09-26"); // Saturday → Monday
    expect(action).toEqual({
      trigger: "U1-000-082 was reported damaged",
      ownerRule: "grn_duty",
      action: "Check the damage on U1-000-082 and record the result",
      recipient: "Carres Klang",
      requiredResult: "The inspection result is recorded",
      dueOn: "2026-09-28",
    });
  });
  it("a Unit not found is looked for and scanned again — never a bare `Not found`", () => {
    const action = unitProblemAction(free, "not_found", "2026-09-24");
    expect(action.action).toBe("Look for U1-000-082 at Carres Klang and scan it again");
    expect(action.requiredResult).toBe("U1-000-082 is scanned again or reported as not found");
    expect(unitCountAgainAction(free, "2026-09-24")).toEqual(action);
  });
  it("never puts the owner identity in the action sentence", () => {
    for (const problem of ["damaged", "not_found", "wrong_item", "missing_component", "label_problem", "something_else"] as const) {
      expect(unitProblemAction(free, problem, "2026-09-24").action).not.toMatch(/^[^·]+\s·\s/);
    }
  });
});

describe("the Issue intake the door writes", () => {
  it("links the Unit (and the reserved Sales Order), counts the proof and reads as official English", () => {
    const intake = unitProblemIntake(reserved, { problem: "damaged", note: "Corner of the headboard is cracked", evidence: [{ path: "a.jpg", kind: "photo" }, { path: "b.jpg", kind: "photo" }] }, "Shasha", "2026-09-26");
    expect(intake.linkedObjects).toEqual([
      { kind: "unit", id: "u1", label: "U1-000-082" },
      { kind: "sales_order", id: "order-1", label: "SO2609-4827" },
    ]);
    expect(intake.evidence).toEqual([{ kind: "photo", count: 2 }]);
    expect(intake.impact).toBe("Sales Order SO2609-4827 is at risk");
    expect(buildIssueEnglish(intake)).toBe(
      "Unit U1-000-082 · Jager · Super Single · JAGER-SS was damaged when Warehouse checked U1-000-082 on 26 Sept 2026. 2 photos were added by Shasha. Sales Order SO2609-4827 is at risk.",
    );
  });
  it("refuses a report with no proof or no sentence", () => {
    expect(unitProblemReportInputSchema.safeParse({ requestId: "5f6b8b6a-1c1e-4a1e-9a1e-1c1e4a1e9a1e", problem: "damaged", note: "cracked", evidence: [] }).success).toBe(false);
    expect(unitProblemReportInputSchema.safeParse({ requestId: "5f6b8b6a-1c1e-4a1e-9a1e-1c1e4a1e9a1e", problem: "damaged", note: "", evidence: [{ path: "a.jpg", kind: "photo" }] }).success).toBe(false);
  });
});

describe("Make available for sale checks", () => {
  it("names the failing check", () => {
    const checks = makeAvailableChecks({ ...free, availability: "not_available", status: "on_hold", needsRepair: false }, 1);
    expect(checks.find((c) => c.key === "problem")).toMatchObject({ pass: false, why: "1 reported problem is still open" });
    expect(checks.filter((c) => !c.pass).map((c) => c.key)).toEqual(["problem"]);
  });
  it("passes a held Unit at a Site with no open problem", () => {
    expect(makeAvailableChecks({ ...free, availability: "not_available", status: "on_hold" }, 0).every((c) => c.pass)).toBe(true);
  });
});
