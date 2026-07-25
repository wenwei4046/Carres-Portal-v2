import { z } from "zod";
import { createStaffInputSchema } from "./staff";

/**
 * HR Team hierarchy (Phase 1, 2026-07-25, Loo).
 *
 * One position registry (band: C-level / Manager / Executive), CRnnn staff
 * codes shared by HQ logins + Carres' OWN showroom floor staff, and a real
 * reporting line on app_users. Dealer accounts and dealer-side staff are
 * EXCLUDED — dealers are independent entities, their staff are not our staff.
 *
 * The Team tab is also THE account door going forward: every new user except
 * dealers is created here (dealer/showroom STORES stay on the Dealers side).
 */

export const positionBandSchema = z.enum(["c_level", "manager", "executive"]);
export type PositionBand = z.infer<typeof positionBandSchema>;

export const POSITION_BAND_LABEL: Record<PositionBand, string> = {
  c_level: "C-Level",
  manager: "Manager",
  executive: "Executive",
};

/** Band display order — management team first. */
export const POSITION_BAND_ORDER: readonly PositionBand[] = [
  "c_level",
  "manager",
  "executive",
];

/**
 * Staff code — CRnnn by default (one company-wide sequence, CR001…), but the
 * shape stays lenient so HR can adopt another prefix later without a migration.
 */
export const staffCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}[0-9]{2,6}$/, "Staff code looks like CR001");

/** Create / rename / retire a registry position. */
export const upsertOrgPositionInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  band: positionBandSchema,
  sort: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
export type UpsertOrgPositionInput = z.infer<typeof upsertOrgPositionInput>;

/** hr_set_position — positionId null clears. Audited + history row (职位更替). */
export const setTeamPositionInput = z.object({
  userId: z.string().uuid(),
  positionId: z.string().uuid().nullable(),
});
export type SetTeamPositionInput = z.infer<typeof setTeamPositionInput>;

/** hr_set_reports_to — managerId null clears the line. Cycle-guarded in DB. */
export const setReportsToInput = z.object({
  userId: z.string().uuid(),
  managerId: z.string().uuid().nullable(),
});
export type SetReportsToInput = z.infer<typeof setReportsToInput>;

/** hr_set_staff_code — code null clears; uniqueness spans BOTH staff tables. */
export const setStaffCodeInput = z.object({
  kind: z.enum(["hq_user", "showroom_staff"]),
  id: z.string().uuid(),
  code: staffCodeSchema.nullable(),
});
export type SetStaffCodeInput = z.infer<typeof setStaffCodeInput>;

/**
 * Roles the HR Team door may mint. Dealer + showroom STORES are the explicit
 * exception (Loo): they are created on the Dealers side. `principal` is
 * further narrowed to principal callers at the route.
 */
export const HR_TEAM_CREATABLE_ROLES = [
  "principal",
  "operation",
  "finance",
  "hr",
  "bd",
  "supplier",
  "partner",
] as const;
export type HrTeamCreatableRole = (typeof HR_TEAM_CREATABLE_ROLES)[number];

/**
 * Team-door account creation. Mirrors createAccountInput's core, minus every
 * dealer/showroom-store field; internal roles may carry a position and get a
 * CRnnn staff code minted server-side.
 */
export const hrCreateTeamAccountInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    role: z.enum(HR_TEAM_CREATABLE_ROLES),
    title: z.string().trim().max(120).optional().nullable(),
    tempPassword: z.string().min(8).max(72),
    /** supplier / partner need their org row, same as the old Accounts door. */
    companyName: z.string().trim().max(200).optional(),
    /** Internal roles only — registry position set at hire. */
    positionId: z.string().uuid().optional().nullable(),
    reportsToUserId: z.string().uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.role === "supplier" || v.role === "partner") && !v.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: `companyName is required for role=${v.role}`,
      });
    }
    const internal = !["supplier", "partner"].includes(v.role);
    if (!internal && (v.positionId || v.reportsToUserId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["positionId"],
        message: "positions/reporting lines are for Carres staff only",
      });
    }
  });
export type HrCreateTeamAccountInput = z.infer<typeof hrCreateTeamAccountInput>;

/**
 * Team-door showroom floor-staff creation (PIN identity, not a login).
 * Same shape as the POS Add-staff door + the target showroom store id;
 * the server verifies channel='showroom' and mints the CRnnn code.
 */
export const hrCreateShowroomStaffInput = createStaffInputSchema.extend({
  dealerId: z.string().uuid(),
});
export type HrCreateShowroomStaffInput = z.infer<typeof hrCreateShowroomStaffInput>;

// ── hr_team_source projection (response shapes; source of truth = the RPC) ──

export interface TeamAccount {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string | null;
  status: "active" | "disabled";
  staffCode: string | null;
  positionId: string | null;
  positionName: string | null;
  band: PositionBand | null;
  reportsToUserId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  /** supplier / partner / showroom-store display name. */
  orgName: string | null;
}

export interface TeamShowroomStaff {
  id: string;
  name: string;
  staffRole: "principal" | "manager" | "salesperson";
  staffCode: string | null;
  active: boolean;
  email: string | null;
  phone: string | null;
  dealerId: string;
  storeName: string;
  outletId: string | null;
  outletName: string | null;
  hasPin: boolean;
}

export interface OrgPosition {
  id: string;
  name: string;
  band: PositionBand;
  sort: number;
  active: boolean;
}

export interface PositionHistoryEntry {
  id: string;
  subjectKind: "hq_user" | "showroom_staff";
  subjectId: string;
  subjectName: string;
  prevPosition: string | null;
  newPosition: string | null;
  changedAt: string;
  changedBy: string | null;
}

export interface HrTeamSource {
  accounts: TeamAccount[];
  /** Our own stores (dealers.channel='showroom') — the add-staff store picker. */
  showroomStores: { id: string; name: string }[];
  showroomStaff: TeamShowroomStaff[];
  positions: OrgPosition[];
  history: PositionHistoryEntry[];
}

/** Roles that are Carres' own team (get hierarchy + codes); rest = external. */
export const TEAM_INTERNAL_ROLES = [
  "principal",
  "operation",
  "finance",
  "hr",
  "bd",
] as const;
export function isTeamInternalRole(role: string): boolean {
  return (TEAM_INTERNAL_ROLES as readonly string[]).includes(role);
}
