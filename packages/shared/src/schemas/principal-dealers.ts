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
 * 2026-05-22 (Loo) — Principal-side dealer profile edit. Lets the principal
 * fill in / correct address, SSM code, and PIC contact for any existing
 * dealer row from the Dealer Drawer. Every field is optional so the editor
 * can save partial updates (e.g. fix just the phone without re-keying the
 * address). The PATCH endpoint forwards only present keys to the UPDATE.
 *
 * Min-length thresholds mirror the create-account zod (address ≥ 5,
 * ssmCode ≥ 6, contactName ≥ 2, contactPhone ≥ 7) so partial-save still
 * rejects nonsense values.
 */
export const updateDealerInput = z.object({
  name:         z.string().trim().min(2).max(120).optional(),
  region:       z.string().trim().min(1).max(80).optional(),
  address:      z.string().trim().min(5).max(500).optional(),
  ssmCode:      z.string().trim().min(6).max(40).optional(),
  contactName:  z.string().trim().min(2).max(120).optional(),
  contactPhone: z.string().trim().min(7).max(40).optional(),
});
export type UpdateDealerInput = z.infer<typeof updateDealerInput>;
