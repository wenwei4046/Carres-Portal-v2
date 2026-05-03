import { z } from 'zod';

/**
 * Phase 3 — Principal dealer admin inputs.
 *
 * `inviteDealerInput` creates a new dealer record (plus pending invitation).
 * `name` / `region` / `contact` are trimmed to absorb sloppy paste from the
 * principal's CRM exports; trimmed length must satisfy the min check, so
 * "  X  " (1 char trimmed) is rejected.
 */
export const inviteDealerInput = z.object({
  name:    z.string().trim().min(2).max(120),
  region:  z.string().trim().min(2).max(80),
  contact: z.string().trim().min(3).max(160),
});
export type InviteDealerInput = z.infer<typeof inviteDealerInput>;

/**
 * `setDealerStatusInput` is the principal's lever for active/suspended
 * toggles on existing dealers. `pending` and `rejected` are intentionally
 * excluded — those transitions belong to the approval workflow
 * (`approval_decide` RPC), not the manual status switch.
 */
export const setDealerStatusInput = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(200).optional(),
});
export type SetDealerStatusInput = z.infer<typeof setDealerStatusInput>;

/**
 * `setDealerTermsInput` updates commercial terms. Credit limit allows zero
 * (COD-only dealers exist), capped at 10M to catch fat-finger entries.
 * Payment terms are constrained to the four values the proto exposes.
 */
export const setDealerTermsInput = z.object({
  creditLimit:  z.number().nonnegative().max(10_000_000),
  paymentTerms: z.enum(['NET 14', 'NET 30', 'NET 60', 'COD']),
});
export type SetDealerTermsInput = z.infer<typeof setDealerTermsInput>;
