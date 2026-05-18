import { z } from "zod";

/**
 * Phase 10 — Principal Accounts admin schemas.
 *
 * Backs `POST /api/principal/accounts` (create) + `POST /api/principal/accounts/:id/disable|enable|reset-password`.
 * All admin actions require service_role (auth.admin.createUser /
 * updateUserById) per CLAUDE.md §4.4 — never expose service_role to the
 * browser; routes are gated to `role='principal'` only.
 *
 * Mirrors `reference/proto/principal-accounts.jsx` field semantics:
 *   - role one of the 9 app_role enum values (principal / dealer /
 *     salesperson / showroom / operation / supplier / partner / finance / bd)
 *   - `companyName` only when role ∈ {dealer, supplier, partner} (creates the
 *     org row first, then app_users links via dealer_id / supplier_id /
 *     partner_id per check constraints in 0041)
 *   - `region` only for dealer role
 *   - `tempPassword` is given to the user offline; we do NOT email it. The
 *     "Email invite link" branch from proto is intentionally NOT implemented
 *     for V1 (needs Supabase email-template config — defer to next phase).
 */
export const APP_ROLES = [
  "principal",
  "dealer",
  "salesperson",
  "showroom",
  "operation",
  "supplier",
  "partner",
  "finance",
  "bd",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const createAccountInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    role: z.enum(APP_ROLES),
    title: z.string().trim().max(120).optional().nullable(),
    companyName: z.string().trim().max(200).optional(),
    region: z.string().trim().max(80).optional(),
    tempPassword: z.string().min(8).max(72),
  })
  .superRefine((v, ctx) => {
    if ((v.role === "dealer" || v.role === "supplier" || v.role === "partner") && !v.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: `companyName is required for role=${v.role}`,
      });
    }
  });
export type CreateAccountInput = z.infer<typeof createAccountInput>;

export const setAccountStatusInput = z.object({
  status: z.enum(["active", "disabled"]),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type SetAccountStatusInput = z.infer<typeof setAccountStatusInput>;

export const resetPasswordInput = z.object({
  tempPassword: z.string().min(8).max(72),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>;
