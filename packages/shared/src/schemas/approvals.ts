import { z } from 'zod';

/**
 * Phase 3 — Principal approvals workflow.
 *
 * `decideApprovalInput` is what the Principal POSTs to act on a pending
 * approval. Status is restricted to {approved, rejected} because "pending"
 * is the *initial* state set by the requester (dealer / finance / etc.) —
 * the principal can only finalize one of the two outcomes. Note is optional
 * (rejections are common without commentary in the proto), capped at 500
 * chars to keep the audit trail readable.
 */
export const decideApprovalInput = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalInput>;

/**
 * `listApprovalsQuery` powers the principal Approvals inbox. Defaults to
 * `pending` because that's the working queue; the UI offers tabs for the
 * other statuses + an "all" view for audit. `kind` filters by approval
 * category — matches `approvals.kind` enum on the DB side.
 */
export const listApprovalsQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  kind:   z.enum(['refund', 'new_dealer', 'top_up', 'price_change', 'other']).optional(),
});
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuery>;
