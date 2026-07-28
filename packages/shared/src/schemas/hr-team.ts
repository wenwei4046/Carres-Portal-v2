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
  /** 0259 — the department this position belongs to; null = none (C-level). */
  departmentId: z.string().uuid().optional().nullable(),
});
export type UpsertOrgPositionInput = z.infer<typeof upsertOrgPositionInput>;

/** 0259 — create / rename / retire a department (mirrors positions). */
export const upsertOrgDepartmentInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  sort: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
export type UpsertOrgDepartmentInput = z.infer<typeof upsertOrgDepartmentInput>;

/** HR-P2 (0260) — grant/revoke ONE duty key on ONE position. Audited DEFINER
 *  RPC `hr_set_position_duty`; the checkbox in the Team → Positions card. */
export const setPositionDutyInput = z.object({
  positionId: z.string().uuid(),
  dutyKey: z.string().trim().min(1).max(40),
  granted: z.boolean(),
});
export type SetPositionDutyInput = z.infer<typeof setPositionDutyInput>;

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
  // R6 (0301) — the THIRD external role, minted at the same door as the other
  // two. Unlike them it creates no org row: a warehouse already exists as
  // master data, and minting one as a side effect of making a login is how a
  // second "Klang" gets into the stock register.
  "warehouse",
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
    /** R6 — which EXISTING warehouse a `warehouse` login belongs to. */
    warehouseId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.role === "supplier" || v.role === "partner") && !v.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: `companyName is required for role=${v.role}`,
      });
    }
    // The `app_users` CHECK (0302) says the warehouse id and the role imply
    // each other. Saying it here too turns a database error into a sentence the
    // person filling the form can act on.
    if (v.role === "warehouse" && !v.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["warehouseId"],
        message: "Pick the warehouse this login belongs to",
      });
    }
    if (v.role !== "warehouse" && v.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["warehouseId"],
        message: "Only a warehouse login belongs to a warehouse",
      });
    }
    const internal = !["supplier", "partner", "warehouse"].includes(v.role);
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
  /** 0259 — owning department; null for C-level / unassigned positions. */
  departmentId?: string | null;
}

/** 0259 — a department (the chart's columns). */
export interface OrgDepartment {
  id: string;
  name: string;
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
  /** 0259 — departments; absent on a pre-0259 server (render chart w/o columns). */
  departments?: OrgDepartment[];
  history: PositionHistoryEntry[];
  /** 0260 — the duty catalogue (5 keys) + which positions hold which. Both
   *  absent on a pre-0260 server, which simply hides the Duties card while
   *  every gate keeps running on the legacy email fallback. */
  duties?: OrgDuty[];
  positionDuties?: { positionId: string; dutyKey: string }[];
  /** R6 — the warehouses a `warehouse` login can be bound to. Absent on a
   *  pre-R6 server; the form then shows an empty picker and the create is
   *  refused with a sentence rather than binding a login to nothing. */
  warehouses?: { id: string; name: string }[];
}

/** One grantable duty key (0260). `name` is what HR reads on the checkbox. */
export interface OrgDuty {
  key: string;
  name: string;
  description: string;
  sort: number;
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
