import { describe, expect, it } from "vitest";
import { createServiceCaseInputSchema, updateServiceCaseInputSchema } from "./schemas/service-cases";
import { caseIntakeComplete, composeCaseSummary } from "./service-case-intake";
import { caseFollowUpPlan } from "./service-case-plan";
import { computeCaseNumbers } from "./service-case-numbers";

const report = {
  customerImpact: "stock_only" as const,
  reportedBy: "warehouse" as const,
  productCategory: "sofa" as const,
  issueType: "damaged" as const,
  draftId: "11111111-1111-4111-8111-111111111111",
};

describe("product-only Case intake", () => {
  it("accepts unsold stock without inventing a customer", () => {
    expect(createServiceCaseInputSchema.parse(report).customerName).toBe("");
    const answers = { ...report, productSku: null, usable: null, customerWants: [] };
    expect(caseIntakeComplete(answers)).toBe(true);
    expect(composeCaseSummary(answers)).toContain("Unsold stock. No customer affected.");
    expect(caseFollowUpPlan({ ...answers, customerWants: ["replace"] })).toEqual([]);
  });
  it.each([
    { customerName: "Invented customer" }, { reportedBy: "customer" },
    { customerWants: ["replace"] }, { usable: "yes" },
    { orderId: report.draftId }, { orderLineId: report.draftId },
    { customerPhone: "123" }, { customerAddress: "Address" },
  ])("refuses customer facts in a stock-only report: %j", (extra) => {
    expect(createServiceCaseInputSchema.safeParse({ ...report, ...extra }).success).toBe(false);
  });
  it("still requires a real customer for the customer path", () => {
    expect(createServiceCaseInputSchema.safeParse({ customerName: " " }).success).toBe(false);
    expect(createServiceCaseInputSchema.safeParse({ customerName: "Lee" }).success).toBe(true);
  });
  it("does not let a generic edit change customer impact", () => {
    expect(updateServiceCaseInputSchema.parse({ customerImpact: "stock_only" })).not.toHaveProperty("customerImpact");
  });
  it("requires a Unit and stock-only intake for explicit incident selection", () => {
    const selected = { ...report, existingCaseId: report.draftId };
    expect(createServiceCaseInputSchema.safeParse(selected).success).toBe(false);
    expect(createServiceCaseInputSchema.safeParse({ ...selected, unitCode: "id-aaa000001" }).success).toBe(true);
    expect(createServiceCaseInputSchema.safeParse({ ...selected, unitCode: "id-aaa000001", customerImpact: "customer", customerName: "Lee" }).success).toBe(false);
    expect(updateServiceCaseInputSchema.parse(selected)).not.toHaveProperty("existingCaseId");
  });
  it("does not invent a customer deadline for an old stock report", () => {
    const result = computeCaseNumbers({ todayIso: "2026-09-06", period: null, cases: [{
      id: report.draftId, caseNo: "SC2608-01", customerImpact: "stock_only",
      openedAt: "2026-08-01", closed: false,
    }] });
    expect(result.totals).toMatchObject({ opened: 1, stillOpen: 1, stillOpenLate: 0, finished: 0 });
  });
});
