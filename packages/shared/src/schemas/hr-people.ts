import { z } from "zod";

/**
 * HR-P4 — the employee master (migration 0269, 2026-07-26).
 *
 * The People tab is NOT a second roster. `hr_employees` is an HR-private
 * satellite of app_users / salespersons: it stores only fields with no home on
 * the identity tables, and name / staff code / position / work email are READ
 * THROUGH the join. See the 0269 header for why the ratified spec's
 * `staff_code (sync w/ CRnnn)` design was rejected.
 *
 * THE DISTINCTION THIS FILE EXISTS TO KEEP:
 *   employment — HR's record of the person, DERIVED from join/confirm/exit dates
 *   access     — whether they can actually log in, from app_users.status /
 *                salespersons.active, which is what 0266/0267 made load-bearing
 * They are two questions. Conflating them into one field is what let a disabled
 * account keep a live session for two months.
 */

// ── employment status (derived in SQL by _hr_employment_status) ──────────────

export const employmentStatusSchema = z.enum([
  "not_recorded", // no join date yet — the backfill state
  "incoming", // join date is in the future
  "probation", // joined, not confirmed
  "active",
  "leaving", // exit date recorded but not reached
  "left",
]);
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  not_recorded: "Not recorded",
  incoming: "Starts soon",
  probation: "Probation",
  active: "Active",
  leaving: "Leaving",
  left: "Left",
};

// ── access (the real switch — never derived from HR's dates) ─────────────────

export const employeeAccessSchema = z.enum([
  "can_login", // app_users.status = 'active'
  "disabled", // app_users.status = 'disabled' OR salespersons.active = false
  "pin_only", // floor staff: no portal login, unlocks the POS with a PIN
]);
export type EmployeeAccess = z.infer<typeof employeeAccessSchema>;

export const EMPLOYEE_ACCESS_LABEL: Record<EmployeeAccess, string> = {
  can_login: "Can log in",
  disabled: "Disabled",
  pin_only: "PIN only",
};

// ── checklists — a CONSTANT, deliberately not a config table ─────────────────
// The spec wanted hr_checklist_templates + instances. A company hiring ~3 people
// a year does not need per-role custom checklists, and the settings screen to
// maintain them would cost more than it saves. Editing this array is a one-line
// PR; the DB stores only the ticks.

export interface ChecklistItem {
  readonly key: string;
  readonly label: string;
}

export const ONBOARDING_CHECKLIST: readonly ChecklistItem[] = [
  { key: "contract_signed", label: "Employment contract signed" },
  { key: "ic_copy", label: "IC copy on file" },
  { key: "bank_details", label: "Bank details collected" },
  { key: "account_created", label: "Portal account or store PIN created" },
  { key: "intro_done", label: "Introduced to the team" },
  { key: "probation_set", label: "Probation end date agreed" },
];

export const OFFBOARDING_CHECKLIST: readonly ChecklistItem[] = [
  { key: "laptop_returned", label: "Laptop returned" },
  { key: "keys_returned", label: "Office keys and access card returned" },
  { key: "handover_filed", label: "Handover notes filed" },
  { key: "email_archived", label: "Work email archived" },
  { key: "payroll_final", label: "Final month sent to payroll" },
];

export const checklistKindSchema = z.enum(["onboarding", "offboarding"]);
export type ChecklistKind = z.infer<typeof checklistKindSchema>;

export function checklistFor(kind: ChecklistKind): readonly ChecklistItem[] {
  return kind === "onboarding" ? ONBOARDING_CHECKLIST : OFFBOARDING_CHECKLIST;
}

// ── the roster payload (hr_people_source) ────────────────────────────────────

export const hrPersonRowSchema = z.object({
  employeeId: z.string().uuid(),
  entity: z.string(),
  kind: z.enum(["hq", "floor"]),
  subjectId: z.string().uuid(),
  staffCode: z.string().nullable(),
  name: z.string(),
  workEmail: z.string().nullable(),
  positionName: z.string().nullable(),
  band: z.string().nullable(),
  /** Raw salespersons.staff_role — label it with STAFF_TIER_LABEL, never in SQL. */
  staffRole: z.string().nullable(),
  departmentName: z.string().nullable(),
  storeName: z.string().nullable(),
  reportsToName: z.string().nullable(),
  access: employeeAccessSchema,
  employment: employmentStatusSchema,
  joinDate: z.string().nullable(),
  confirmDate: z.string().nullable(),
  exitDate: z.string().nullable(),
  employmentType: z.string().nullable(),
  filled: z.number().int(),
});
export type HrPersonRow = z.infer<typeof hrPersonRowSchema>;

export const hrPeopleSourceSchema = z.object({
  people: z.array(hrPersonRowSchema),
  /** People whose access is already cut with no exit on file — the banner. */
  accessWithoutExit: z.number().int(),
  totalFields: z.number().int(),
});
export type HrPeopleSource = z.infer<typeof hrPeopleSourceSchema>;

// ── the drawer payload (hr_employee_detail) ──────────────────────────────────

export const hrEmployeeEventSchema = z.object({
  kind: z.string(),
  effectiveDate: z.string().nullable(),
  note: z.string().nullable(),
  byName: z.string().nullable(),
});

export const hrEmployeeDocumentSchema = z.object({
  id: z.string().uuid(),
  docType: z.enum(["ic", "contract", "certificate", "other"]),
  fileName: z.string(),
  filePath: z.string(),
  uploadedAt: z.string(),
  byName: z.string().nullable(),
});

export const hrEmployeeDetailSchema = z.object({
  employeeId: z.string().uuid(),
  entity: z.string(),
  appUserId: z.string().uuid().nullable(),
  salespersonId: z.string().uuid().nullable(),

  nationality: z.string().nullable(),
  maritalStatus: z.string().nullable(),
  personalEmail: z.string().nullable(),
  personalPhone: z.string().nullable(),
  emergencyName: z.string().nullable(),
  emergencyPhone: z.string().nullable(),
  emergencyRelation: z.string().nullable(),
  address: z.record(z.unknown()).nullable(),
  bankName: z.string().nullable(),
  bankHolder: z.string().nullable(),
  epfNo: z.string().nullable(),
  socsoNo: z.string().nullable(),
  taxNo: z.string().nullable(),
  employmentType: z.string().nullable(),
  joinDate: z.string().nullable(),
  confirmDate: z.string().nullable(),
  exitDate: z.string().nullable(),
  exitReason: z.string().nullable(),
  exitNote: z.string().nullable(),
  employment: employmentStatusSchema,
  filled: z.number().int(),

  /**
   * Flags, never the values. The numbers reach the client ONLY through
   * hr_reveal_employee_field, which writes the audit row in the same
   * transaction — so a masked field the UI merely hides would be theatre.
   */
  hasIcNumber: z.boolean(),
  hasBankAccount: z.boolean(),

  events: z.array(hrEmployeeEventSchema),
  documents: z.array(hrEmployeeDocumentSchema),
  checklist: z.array(
    z.object({
      kind: checklistKindSchema,
      itemKey: z.string(),
      doneAt: z.string(),
      byName: z.string().nullable(),
    }),
  ),
});
export type HrEmployeeDetail = z.infer<typeof hrEmployeeDetailSchema>;

// ── inputs ───────────────────────────────────────────────────────────────────

/**
 * The editable surface. Exit fields are absent ON PURPOSE — they go through
 * recordExit so the lifecycle event is written with them; hr_upsert_employee
 * rejects them server-side too.
 */
export const hrEmployeePatchInput = z
  .object({
    ic_number: z.string().trim().max(30).nullable(),
    nationality: z.string().trim().max(60).nullable(),
    marital_status: z.enum(["single", "married", "divorced", "widowed"]).nullable(),
    personal_email: z.string().trim().email().max(200).nullable(),
    personal_phone: z.string().trim().max(30).nullable(),
    emergency_name: z.string().trim().max(120).nullable(),
    emergency_phone: z.string().trim().max(30).nullable(),
    emergency_relation: z.string().trim().max(60).nullable(),
    address: z.record(z.unknown()).nullable(),
    bank_name: z.string().trim().max(80).nullable(),
    bank_account_no: z.string().trim().max(40).nullable(),
    bank_holder: z.string().trim().max(120).nullable(),
    epf_no: z.string().trim().max(40).nullable(),
    socso_no: z.string().trim().max(40).nullable(),
    tax_no: z.string().trim().max(40).nullable(),
    employment_type: z.enum(["full_time", "part_time", "contract", "intern"]).nullable(),
    join_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    confirm_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to save" });
export type HrEmployeePatchInput = z.infer<typeof hrEmployeePatchInput>;

export const hrRevealFieldInput = z.object({
  field: z.enum(["ic_number", "bank_account_no"]),
});
export type HrRevealFieldInput = z.infer<typeof hrRevealFieldInput>;

export const hrRecordExitInput = z.object({
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.enum(["resigned", "terminated", "contract_ended"]),
  note: z.string().trim().max(500).optional(),
});
export type HrRecordExitInput = z.infer<typeof hrRecordExitInput>;

export const EXIT_REASON_LABEL: Record<HrRecordExitInput["reason"], string> = {
  resigned: "Resigned",
  terminated: "Terminated",
  contract_ended: "Contract ended",
};

export const hrChecklistToggleInput = z.object({
  kind: checklistKindSchema,
  itemKey: z.string().trim().min(1).max(60),
  done: z.boolean(),
});
export type HrChecklistToggleInput = z.infer<typeof hrChecklistToggleInput>;

/**
 * The door Loo approved on 2026-07-26: HR may disable a login, not just
 * principal. Deliberately its OWN input (and its own route) rather than
 * widening the principal Accounts router — that router also resets passwords
 * and creates accounts, and HR was granted exactly one of those powers.
 */
export const hrSetAccessInput = z.object({
  status: z.enum(["active", "disabled"]),
  reason: z.string().trim().max(200).optional(),
});
export type HrSetAccessInput = z.infer<typeof hrSetAccessInput>;

// ── pure helpers ─────────────────────────────────────────────────────────────

/** Pill tone for an employment status. Access has its own mapping — see below. */
export function employmentTone(
  s: EmploymentStatus,
): "ready" | "waiting" | "overdue" | "neutral" {
  if (s === "active") return "ready";
  if (s === "probation" || s === "incoming" || s === "leaving") return "waiting";
  return "neutral"; // not_recorded, left
}

export function accessTone(a: EmployeeAccess): "ready" | "overdue" | "neutral" {
  if (a === "can_login") return "ready";
  if (a === "disabled") return "overdue";
  return "neutral"; // pin_only is a fact, not a problem
}

/**
 * "Access is cut but no exit is on file" — the one row state that means somebody
 * has to do something. Kept here so the banner, the row and the drawer cannot
 * disagree about what counts.
 */
export function needsExitRecorded(p: {
  access: EmployeeAccess;
  exitDate: string | null;
}): boolean {
  return p.access === "disabled" && p.exitDate === null;
}

/**
 * Offboarding is TWO shapes, not one. An HQ login has a session to kill; floor
 * staff never had one — `staff_verify_pin` (0233) already refuses an inactive
 * salesperson at the unlock screen, verified live 2026-07-26. Saying "signed out
 * of every device" to a PIN-only person would be a promise about nothing.
 */
export function revocationShape(kind: "hq" | "floor"): "login_and_sessions" | "pin" {
  return kind === "hq" ? "login_and_sessions" : "pin";
}
