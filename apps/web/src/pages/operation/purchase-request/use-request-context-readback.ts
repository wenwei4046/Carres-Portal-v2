import type { PurchaseRequestDecision, PurchaseRequestIssue } from "@carres/shared";
import { usePurchaseRequestContextReview, useDecidePurchaseRequest, useIssuePurchaseRequests } from "../../../lib/queries";
import { readRequestApproval, readRequestContext } from "./read-request-context";

/** Existing Workspace's future context composition opts in explicitly. No
 * production caller yet; no new writer, legacy upgrade, or cached approval grant.
 * A refetch must finish before its proof can be used for review or issue. */
export function useRequestContextReadback(
  id: string | null,
  request: Parameters<typeof readRequestContext>[0] | undefined,
  enabled = false,
) {
  const saved = request ? readRequestContext(request) : { kind: "unavailable" as const };
  const review = usePurchaseRequestContextReview(enabled && saved.kind === "context" ? id : null);
  const approval = saved.kind === "legacy" ? readRequestApproval(saved, undefined) : !enabled || !id || review.isFetching || review.isError
    ? { kind: "unavailable" as const }
    : readRequestApproval(saved, review.data);
  return { saved, approval, isFetching: review.isFetching, error: review.error, refetch: review.refetch };
}

/** Guarded action composition for the SAME review and issue doors. No production
 * caller. Permissions are the existing detail/PO actor facts; SQL rechecks them.
 * Allocation quantities/recipients are supplied explicitly by the review editor,
 * never reconstructed from a legacy header or current remaining display. */
export function useRequestContextActions(
  id: string | null,
  request: Parameters<typeof readRequestContext>[0] | undefined,
  options: { enabled: boolean; mayApprove: boolean; mayIssue: boolean } = { enabled: false, mayApprove: false, mayIssue: false },
) {
  const readback = useRequestContextReadback(id, request, options.enabled);
  const decision = useDecidePurchaseRequest();
  const issue = useIssuePurchaseRequests();
  const busy = decision.isPending || issue.isPending;
  const canDecide = options.enabled && options.mayApprove && !busy && readback.approval.kind === "pending";
  const canIssue = options.enabled && options.mayIssue && !busy && readback.approval.kind === "approved";
  async function decide(input: Omit<PurchaseRequestDecision, "cuts" | "contextReview"> & {
    context: NonNullable<PurchaseRequestDecision["contextReview"]>["context"];
    approvedDistribution: NonNullable<PurchaseRequestDecision["contextReview"]>["approvedDistribution"];
  }) {
    if (!id || !canDecide || readback.approval.kind !== "pending") throw new Error("Not available");
    const review = readback.approval.review.review;
    return decision.mutateAsync({ id, decision: input.decision, reason: input.reason,
      contextReview: { expectedVersion: review.request_version, reviewScope: review, context: input.context,
        approvedDistribution: input.decision === "approve" ? input.approvedDistribution : null } });
  }
  async function issueRemaining(input: {
    together: boolean;
    key: string;
    allocations?: NonNullable<PurchaseRequestIssue["contextIssue"]>["allocations"];
  }) {
    if (!id || !canIssue || readback.approval.kind !== "approved") throw new Error("Not available");
    const proof = readback.approval.review.approval;
    if (!proof) throw new Error("Not available");
    return issue.mutateAsync({ requestIds: [id], together: input.together, contextIssue: { key: input.key,
      requests: [{ id, requestVersion: proof.request_version, approvalVersion: proof.approval_version, approvalToken: proof.token }],
      ...(input.allocations ? { allocations: input.allocations } : {}),
    } });
  }
  return { ...readback, canDecide, canIssue, decide, issueRemaining, decision, issue };
}
