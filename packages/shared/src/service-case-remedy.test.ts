import { describe, expect, it } from "vitest";
import { serviceCaseRemedyProposalSchema, serviceCaseRemedyDecisionSchema } from "./service-case-remedy";

const proposal = () => ({ key: "00000000-0000-4000-8000-000000000001", requestId: "00000000-0000-4000-8000-000000000002", expectedRequestVersion: 1, policy: "TEST policy", policyVersion: "TEST version", policyResult: "eligible", remedy: "replace", movement: "replace_first", charge: "free", amount: null, payer: "", reason: "Replace the two damaged goods", evidence: ["TEST-case/photo.jpg"] });
describe("formal Case remedy proposal", () => {
  it("admits an exact request reference and recorded policy, remedy and evidence", () => expect(serviceCaseRemedyProposalSchema.safeParse(proposal()).success).toBe(true));
  it("does not accept client-authored approval or actor stamps", () => expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), approved: true, decidedBy: "TEST" }).success).toBe(false));
  it("requires a policy version and existing evidence references", () => {
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), policyVersion: "" }).success).toBe(false);
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), evidence: [] }).success).toBe(false);
  });
  it("cannot submit prohibited or still-unproven entitlement for execution approval", () => {
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), policyResult: "prohibited" }).success).toBe(false);
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), policyResult: "evidence_required" }).success).toBe(false);
  });
  it("records a charged remedy only with its amount and payer", () => {
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), charge: "charged" }).success).toBe(false);
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), charge: "charged", amount: 250, payer: "TEST payer" }).success).toBe(false);
    expect(serviceCaseRemedyProposalSchema.safeParse({ ...proposal(), charge: "charged", amount: 250, payer: "TEST payer", payerAcceptance: { by: "TEST payer contact", on: "2026-10-18", evidence: "TEST-case/photo.jpg" } }).success).toBe(true);
  });
  it("keeps refusal separate from approval and requires the refusal reason", () => {
    const approvalId = proposal().key;
    expect(serviceCaseRemedyDecisionSchema.safeParse({ approvalId, status: "rejected", reason: "" }).success).toBe(false);
    expect(serviceCaseRemedyDecisionSchema.safeParse({ approvalId, status: "approved", reason: "" }).success).toBe(true);
  });
});
