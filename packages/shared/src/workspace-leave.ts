import { z } from "zod";

/**
 * Workspace → Leave (migration 0670; owner rules 9 Oct 2026, `Carres Settings
 * List.md` WS-11 and "Leave types"; docs/workspace/MASTER.md §4.4).
 *
 * One entry for three types. A person submits their OWN leave; no type needs
 * approval today. MC may carry proof (photo or PDF, optional: owner rule 9 Oct 2026), Emergency leave a short
 * reason, Planned leave an optional note. Every rule is enforced again by the
 * SQL door `staff_leave_submit`; this file only guides early and shapes the
 * wire. Who covers the work is the database's answer, never this file's.
 */

export const LEAVE_TYPES = [
  { key: "mc", label: "MC" },
  { key: "emergency", label: "Emergency leave" },
  { key: "planned", label: "Planned leave" },
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number]["key"];
export const leaveTypeSchema = z.enum(["mc", "emergency", "planned"]);

export function leaveTypeLabel(key: string): string {
  return LEAVE_TYPES.find((t) => t.key === key)?.label ?? key;
}

/** The longest Emergency leave reason and Planned leave note the door keeps. */
export const LEAVE_REASON_MAX = 200;
export const LEAVE_NOTE_MAX = 500;
/** The proof bucket's own limit (0670: 10 MB; PDF, JPEG, PNG, WEBP), and
 *  up to three files per leave (an MC photographed in parts). */
export const LEAVE_PROOF_BUCKET = "staff-leave-proof";
export const LEAVE_PROOF_MAX_FILES = 3;
export const LEAVE_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const LEAVE_PROOF_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const LEAVE_PROOF_EXT: Record<(typeof LEAVE_PROOF_MIME)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hasText = (v: string | undefined) => v !== undefined && /\S/.test(v);
/** `<user id>/<file id>.<ext>` — the path the API signs; nobody picks one. */
export const LEAVE_PROOF_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/;

export const staffLeaveSubmitInput = z
  .object({
    type: leaveTypeSchema,
    startsOn: isoDay,
    endsOn: isoDay,
    reason: z.string().max(LEAVE_REASON_MAX).optional(),
    note: z.string().max(LEAVE_NOTE_MAX).optional(),
    proofPaths: z.array(z.string().regex(LEAVE_PROOF_PATH)).max(LEAVE_PROOF_MAX_FILES).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "invalid_dates" });
    if (v.type === "emergency" && !hasText(v.reason)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "reason_required" });
    }
  });
export type StaffLeaveSubmitInput = z.infer<typeof staffLeaveSubmitInput>;

/** 0680 — leave recorded FOR a colleague by the owner or a named Staff &
 *  Duties editor (owner ruling 9 Oct 2026). Same rules as my own leave; no
 *  proof file on this door (proof is optional). */
export const staffLeaveRecordForInput = z
  .object({
    userId: z.string().uuid(),
    type: leaveTypeSchema,
    startsOn: isoDay,
    endsOn: isoDay,
    reason: z.string().max(LEAVE_REASON_MAX).optional(),
    note: z.string().max(LEAVE_NOTE_MAX).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "invalid_dates" });
    if (v.type === "emergency" && !hasText(v.reason)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "reason_required" });
    }
  });
export type StaffLeaveRecordForInput = z.infer<typeof staffLeaveRecordForInput>;

/** What the Record leave form needs to offer a colleague (0680). */
export const leaveRecorderViewSchema = z.object({
  canRecordForOthers: z.boolean(),
  people: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  recorded: z.array(z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string(),
    leave_type: leaveTypeSchema,
    starts_on: isoDay,
    ends_on: isoDay,
    cancelled_from: isoDay.nullable(),
    submitted_at: z.string(),
  })),
});
export type LeaveRecorderView = z.infer<typeof leaveRecorderViewSchema>;

export const staffLeaveProofSignInput = z
  .object({
    mimeType: z.enum(LEAVE_PROOF_MIME),
    sizeBytes: z.number().int().positive().max(LEAVE_PROOF_MAX_BYTES),
  })
  .strict();

export const staffLeaveRowSchema = z.object({
  id: z.string().uuid(),
  leave_type: leaveTypeSchema,
  starts_on: isoDay,
  ends_on: isoDay,
  reason: z.string().nullable(),
  note: z.string().nullable(),
  proof_paths: z.array(z.string()),
  approval_required: z.boolean(),
  submitted_at: z.string(),
  cancelled_from: isoDay.nullable(),
  cancelled_at: z.string().nullable(),
  /** 0680: who recorded it (null before 0680, or when the person did). */
  recorded_by: z.string().uuid().nullable().optional(),
  recorded_by_name: z.string().nullable().optional(),
});
export type StaffLeaveRow = z.infer<typeof staffLeaveRowSchema>;

export const leavePolicySchema = z.object({
  leave_type: leaveTypeSchema,
  approval_required: z.boolean(),
  proof_required: z.boolean(),
  reason_required: z.boolean(),
});
export type LeavePolicy = z.infer<typeof leavePolicySchema>;

export const myLeaveResponseSchema = z.object({
  today: isoDay,
  canSubmit: z.boolean(),
  policies: z.array(leavePolicySchema),
  leave: z.array(staffLeaveRowSchema),
});
export type MyLeaveResponse = z.infer<typeof myLeaveResponseSchema>;

export const teamLeaveResponseSchema = z.object({
  today: isoDay,
  people: z.array(
    z.object({ userId: z.string().uuid(), name: z.string(), startsOn: isoDay, endsOn: isoDay }),
  ),
});
export type TeamLeaveResponse = z.infer<typeof teamLeaveResponseSchema>;

/** The leave's last day still on leave: the day before `cancelled_from`, or
 *  `ends_on`. Null when the whole leave was cancelled before it began. */
export function leaveLastDay(row: Pick<StaffLeaveRow, "starts_on" | "ends_on" | "cancelled_from">): string | null {
  if (!row.cancelled_from) return row.ends_on;
  if (row.cancelled_from <= row.starts_on) return null;
  const d = new Date(`${row.cancelled_from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type LeaveState = "cancelled" | "upcoming" | "current" | "past";

/** Where a leave stands on the company date `today` (never the browser clock). */
export function leaveState(
  row: Pick<StaffLeaveRow, "starts_on" | "ends_on" | "cancelled_from">,
  today: string,
): LeaveState {
  const last = leaveLastDay(row);
  if (last === null) return "cancelled";
  if (row.starts_on > today) return "upcoming";
  if (last >= today) return "current";
  return "past";
}

/**
 * What the owner may still cancel (0670 `staff_leave_cancel`): the whole leave
 * before it starts, or the days after today while it runs. Today itself stays
 * leave — its work already moved and never bounces back.
 */
export function leaveCancelAction(
  row: Pick<StaffLeaveRow, "starts_on" | "ends_on" | "cancelled_from">,
  today: string,
): "whole" | "remaining" | null {
  if (row.cancelled_from) return null;
  if (row.starts_on > today) return "whole";
  if (row.ends_on > today) return "remaining";
  return null;
}
