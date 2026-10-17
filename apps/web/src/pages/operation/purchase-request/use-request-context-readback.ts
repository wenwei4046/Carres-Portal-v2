import { usePurchaseRequestContextReview } from "../../../lib/queries";
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
