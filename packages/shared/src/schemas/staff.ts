import { z } from "zod";
import { salespersonSchema } from "./catalog";

/**
 * 0233 — Staff PIN login (Loo 2026-07-18).
 *
 * One store login (email+password, unchanged) → outlet pick (only when the
 * dealer has >1 outlet) → 6-digit PIN identifies the STAFF MEMBER. Three
 * tiers ride on `salespersons.staff_role`:
 *
 *   principal   — store owner; all outlets; may create manager / salesperson /
 *                 co-owner principal. (Showroom stores cap at manager — their
 *                 "principal" is Carres itself.)
 *   manager     — outlet-bound; sees the whole outlet's orders; may create
 *                 salespersons for OWN outlet only.
 *   salesperson — sees own orders only; no user management.
 *
 * After a PIN verifies, the API mints a short-lived signed staff token
 * (jose HS256, `STAFF_SESSION_SECRET`, 12 h). The client echoes it back via
 * the `X-Staff-Token` header; the orders routes use it to scope reads and to
 * stamp `salesperson_id` server-side. PIN hashes live in `salesperson_pins`
 * (deny-all RLS; verified only inside service_role-only DEFINER fns).
 */

export const staffTierSchema = z.enum(["principal", "manager", "salesperson"]);
export type StaffTierDto = z.infer<typeof staffTierSchema>;

/** Header carrying the staff session token on every authed API call. */
export const STAFF_TOKEN_HEADER = "X-Staff-Token";

/** Staff session lifetime (matches a long shop day). */
export const STAFF_TOKEN_TTL_SECONDS = 12 * 60 * 60;

/** API error code emitted when an activated store calls without a token. */
export const STAFF_SESSION_REQUIRED = "staff_session_required";

/**
 * Avatar palette for the PIN screen tiles. Keys are stored in
 * `salespersons.color`; hexes render the tile (white text on all of them).
 * Flame first — it's the brand accent.
 */
export const STAFF_COLORS = {
  flame:  "#C44D2B",
  ocean:  "#0E7490",
  forest: "#15803D",
  indigo: "#4338CA",
  plum:   "#7E22CE",
  rose:   "#BE123C",
  amber:  "#B45309",
  teal:   "#0F766E",
  slate:  "#475569",
  cocoa:  "#78350F",
} as const;
export type StaffColorKey = keyof typeof STAFF_COLORS;
export const staffColorSchema = z.enum(
  Object.keys(STAFF_COLORS) as [StaffColorKey, ...StaffColorKey[]],
);

/** Exactly 6 digits — the only accepted PIN shape. */
export const staffPinSchema = z.string().regex(/^[0-9]{6}$/, "PIN must be exactly 6 digits");

/** Verified staff-token payload (plus standard exp/iat handled by jose). */
export const staffTokenPayloadSchema = z.object({
  /** salespersons.id — null only for reauth-minted owner-mode sessions. */
  sid: z.string().uuid().nullable(),
  did: z.string().uuid(),
  oid: z.string().uuid().nullable(),
  tier: staffTierSchema,
});
export type StaffTokenPayload = z.infer<typeof staffTokenPayloadSchema>;

/** Salesperson + PIN presence flag (never the hash). */
export const staffDtoSchema = salespersonSchema.extend({
  hasPin: z.boolean().default(false),
});
export type StaffDto = z.infer<typeof staffDtoSchema>;

export const staffListResponseSchema = z.object({
  staff: z.array(staffDtoSchema),
  /** True once ANY staff of this store has a PIN — flips the login gate on. */
  activated: z.boolean(),
  /** salespersons row linked to the CALLER's auth user (role=salesperson logins). */
  selfStaffId: z.string().uuid().nullable(),
  /** Showroom stores cap tier creation at manager. */
  storeKind: z.enum(["dealer", "showroom"]),
});
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;

export const verifyPinInputSchema = z.object({
  salespersonId: z.string().uuid(),
  pin: staffPinSchema,
});
export type VerifyPinInput = z.infer<typeof verifyPinInputSchema>;

export const staffSessionResponseSchema = z.object({
  token: z.string().min(1),
  staff: staffDtoSchema.nullable(),
  tier: staffTierSchema,
  outletId: z.string().uuid().nullable(),
});
export type StaffSessionResponse = z.infer<typeof staffSessionResponseSchema>;

/** Owner-mode fallback: re-prove the store email+password (wizard / forgot-PIN). */
export const staffReauthInputSchema = z.object({
  password: z.string().min(1),
});
export type StaffReauthInput = z.infer<typeof staffReauthInputSchema>;

export const createStaffInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  staffRole: staffTierSchema,
  outletId: z.string().uuid().nullable().optional(),
  color: staffColorSchema.optional(),
  phone: z.string().trim().max(40).optional(),
  /** Optional initial PIN (set-later is allowed; PIN-less staff can't sign in). */
  pin: staffPinSchema.optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffInputSchema>;

export const updateStaffInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    staffRole: staffTierSchema.optional(),
    outletId: z.string().uuid().nullable().optional(),
    color: staffColorSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "empty patch",
  });
export type UpdateStaffInput = z.infer<typeof updateStaffInputSchema>;

export const setStaffPinInputSchema = z.object({
  pin: staffPinSchema,
});
export type SetStaffPinInput = z.infer<typeof setStaffPinInputSchema>;
