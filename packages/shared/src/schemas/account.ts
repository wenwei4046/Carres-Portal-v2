import { z } from "zod";

/**
 * Store-account self-service (Loo 2026-07-19) — the dealer principal (店主)
 * manages the STORE login credential from the POS:
 *
 *   password — changed directly, client → Supabase Auth (verify current via
 *              signInWithPassword, then updateUser; no schema, no Hono hop).
 *   email    — REQUEST + APPROVAL: the owner submits a new login email; the
 *              request parks in `account_email_change_requests` (migration
 *              0239) until a Carres HQ principal approves (the API then swaps
 *              auth.users email via service_role admin) or rejects with a note.
 *
 * Scope: DEALER stores only. A showroom's login belongs to Carres HQ itself,
 * so its credential stays HQ-managed (Principal Accounts reset-password).
 */

export const EMAIL_CHANGE_REQUESTS_TABLE = "account_email_change_requests";

export const emailChangeStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type EmailChangeStatusDto = z.infer<typeof emailChangeStatusSchema>;

export const emailChangeRequestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  dealerId: z.string().uuid(),
  currentEmail: z.string(),
  requestedEmail: z.string(),
  status: emailChangeStatusSchema,
  /** Who filed it (staff name); null = owner-mode (the store credential itself). */
  requestedByName: z.string().nullable(),
  /** HQ's note on reject — shown back to the store. */
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  /** Principal-list enrichment only (joined dealers.name). */
  dealerName: z.string().nullable().optional(),
});
export type EmailChangeRequestDto = z.infer<typeof emailChangeRequestSchema>;

/** Postgres row shape (+ optional dealers(name) join in the principal list). */
export interface EmailChangeRequestRow {
  id: string;
  user_id: string;
  dealer_id: string;
  current_email: string;
  requested_email: string;
  status: string;
  requested_by_staff_id: string | null;
  requested_by_name: string | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  dealers?: { name: string } | null;
}

export function emailChangeRequestFromRow(row: EmailChangeRequestRow): EmailChangeRequestDto {
  return emailChangeRequestSchema.parse({
    id: row.id,
    userId: row.user_id,
    dealerId: row.dealer_id,
    currentEmail: row.current_email,
    requestedEmail: row.requested_email,
    status: row.status,
    requestedByName: row.requested_by_name,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    dealerName: row.dealers?.name ?? null,
  });
}

export const submitEmailChangeInputSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  /** The store password, re-proven server-side (same GoTrue grant as /reauth). */
  password: z.string().min(1, "Store password required"),
});
export type SubmitEmailChangeInput = z.infer<typeof submitEmailChangeInputSchema>;

export const decideEmailChangeInputSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type DecideEmailChangeInput = z.infer<typeof decideEmailChangeInputSchema>;
