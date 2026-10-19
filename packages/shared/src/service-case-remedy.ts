import { z } from "zod";
import type { PurchaseRequestContext } from "./purchase-request-context";

const words = z.string().trim().min(1).max(1000);
export const serviceCasePicSchema = z.object({
  ownerId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
  reason: words, key: z.string().uuid(),
}).strict();
/** Case-owned proposal; the database captures the exact linked request and Case
 * facts. Neither an uploader stamp nor a browser-authored approval is authority. */
export const serviceCaseRemedyProposalSchema = z.object({
  key: z.string().uuid(),
  requestId: z.string().uuid(),
  expectedRequestVersion: z.number().int().positive(),
  affectedUnits: z.array(z.string().uuid()).default([]),
  policy: words,
  policyVersion: words,
  policyResult: z.enum(["eligible", "not_eligible"]),
  remedy: z.enum(["repair", "replace", "exchange", "missing_parts", "clean", "paid_service", "goodwill_exception"]),
  movement: z.enum(["replace_first", "collect_first", "exchange_on_collection", "collect_defective_item"]),
  charge: z.enum(["free", "charged"]),
  amount: z.number().finite().positive().multipleOf(0.01).nullable(),
  payer: z.string().trim().max(200),
  payerAcceptance: z.object({ by: words, on: z.string().date(), evidence: z.string().trim().min(1).max(2000) }).strict().nullable().default(null),
  reason: words,
  evidence: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
}).strict().superRefine((p, ctx) => {
  if (p.charge === "charged" && (!p.amount || !p.payer)) ctx.addIssue({ code: "custom", path: ["payer"], message: "Record the charge and payer" });
  if (p.charge === "charged" && (!p.payerAcceptance || !p.evidence.includes(p.payerAcceptance.evidence))) ctx.addIssue({ code: "custom", path: ["payerAcceptance"], message: "Record the payer's acceptance and its Case evidence" });
  if (p.charge === "free" && (p.amount !== null || p.payer)) ctx.addIssue({ code: "custom", path: ["amount"], message: "A free remedy has no charge or payer" });
  if (p.charge === "free" && p.payerAcceptance !== null) ctx.addIssue({ code: "custom", path: ["payerAcceptance"], message: "A free remedy has no charged proposal acceptance" });
  if (p.policyResult === "not_eligible" && !["paid_service", "goodwill_exception"].includes(p.remedy)) ctx.addIssue({ code: "custom", path: ["remedy"], message: "Use the policy's permitted remedy" });
  if (new Set(p.evidence).size !== p.evidence.length) ctx.addIssue({ code: "custom", path: ["evidence"], message: "Duplicate evidence" });
  if (new Set(p.affectedUnits).size !== p.affectedUnits.length) ctx.addIssue({ code: "custom", path: ["affectedUnits"], message: "Duplicate Unit" });
});
export const serviceCaseRemedyDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(1000),
}).strict().superRefine((p, ctx) => {
  if (p.status === "rejected" && !p.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Give the refusal reason" });
});
export type ServiceCaseRemedyProposal = z.infer<typeof serviceCaseRemedyProposalSchema>;
export type ServiceCaseRemedyDecision = z.infer<typeof serviceCaseRemedyDecisionSchema>;

export interface ServiceCaseRemedyState {
  caseId: string;
  caseNo?: string | null;
  canDecide: boolean;
  canPropose: boolean;
  canAssignPic?: boolean;
  ownerCandidates?: Array<{id:string;name:string}>;
  ownerHistory?: Array<{key:string;from:string|null;to:string;by:string;at:string;reason:string}>;
  approver: { revision?:number; state?:string; owner_rule?:string; normal_user_id?: string | null; acting_user_id?: string | null; is_cover?: boolean; actor_user_id?: string | null; actorName?: string | null; acting_user_name?: string | null; normal_user_name?: string | null };
  evidence: Array<{ path: string; slot: string }>;
  units: Array<{ id: string; code: string | null; sku: string }>;
  requests: Array<{ id: string; number: string | null; version: number; context: PurchaseRequestContext }>;
  events: Array<{ approvalId: string; kind: string; at: string; by: string; reason?: string }>;
  proposals: Array<{ id: string; status: "pending" | "approved" | "rejected"; scopeCurrent: boolean; decidedAt: string | null; decidedBy: string | null; decidedByName: string | null; decisionReason: string | null; payload: { proposal: ServiceCaseRemedyProposal; scope: { context: PurchaseRequestContext } } }>;
}

export const SERVICE_CASE_REMEDIES = [
  { value: "repair", label: "Repair" }, { value: "replace", label: "Replace" },
  { value: "exchange", label: "Exchange for another model" }, { value: "missing_parts", label: "Missing parts" },
  { value: "clean", label: "Clean" }, { value: "paid_service", label: "Paid service" }, { value: "goodwill_exception", label: "Goodwill exception" },
] as const;
export const SERVICE_CASE_MOVEMENTS = [
  { value: "replace_first", label: "Replace First" }, { value: "collect_first", label: "Collect First" },
  { value: "exchange_on_collection", label: "Exchange on Collection" }, { value: "collect_defective_item", label: "Collect Defective Item" },
] as const;
