import { z } from "zod";
import type { CommissionReport } from "../commission";

/**
 * HR-P5 — commission runs (migration 0272, 2026-07-26).
 *
 * Closing a month snapshots what the engine computed into `commission_run_lines`.
 * From then on the statement is read from those rows and NEVER recomputed: only
 * `staff_commission_rates` is effective-dated, so a later edit to a model rate,
 * tier, milestone or scheme method would silently change what a "live" view of a
 * closed month showed. The freeze is what makes those tables safe to edit at all.
 *
 * THE PRE-FLIGHT LIVES HERE, as a pure function, so the button the operator sees and
 * the guard the server enforces can never disagree about what "ready" means.
 */

// ── vocabulary ───────────────────────────────────────────────────────────────

export const commissionRunStatusSchema = z.enum(["draft", "approved", "paid", "void"]);
export type CommissionRunStatus = z.infer<typeof commissionRunStatusSchema>;

export const COMMISSION_RUN_STATUS_LABEL: Record<CommissionRunStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  paid: "Paid",
  void: "Discarded",
};

/** A month is locked once it is approved — draft deliberately stays fluid. */
export function isMonthLocked(status: CommissionRunStatus | null): boolean {
  return status === "approved" || status === "paid";
}

export function runStatusTone(
  s: CommissionRunStatus | null,
): "ready" | "waiting" | "neutral" {
  if (s === "approved" || s === "paid") return "ready";
  if (s === "draft") return "waiting";
  return "neutral";
}

export const commissionProgramSchema = z.enum(["staff", "bd"]);

export const adjustmentReasonSchema = z.enum([
  "clawback",
  "refund",
  "correction",
  "rental_share",
  "other",
]);
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;

export const ADJUSTMENT_REASON_LABEL: Record<AdjustmentReason, string> = {
  clawback: "Clawback",
  refund: "Refund",
  correction: "Correction",
  rental_share: "Rental share",
  other: "Other",
};

// ── the pre-flight ───────────────────────────────────────────────────────────

export const READINESS_KEYS = ["rates", "attribution", "month_over", "no_run"] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];

export interface ReadinessCheck {
  key: ReadinessKey;
  /** `false` + blocking = Close is disabled. `false` + !blocking = a warning only. */
  passed: boolean;
  blocking: boolean;
  title: string;
  detail: string;
}

export interface ReadinessInput {
  /** The engine's own output for the month — the only thing that knows about rates. */
  report: Pick<CommissionReport, "perStaff">;
  /** Facts only the DB knows (commission_run_state). */
  unattributed: number;
  legacyUnattributed?: number;
  runStatus: CommissionRunStatus | null;
  year: number;
  month: number;
  /** "now" is injected so this stays pure and testable. */
  today: { year: number; month: number };
}

/**
 * The four checks, in the order the operator reads them.
 *
 * `rates` is the one that matters on day one: a person who sold and computes to zero
 * has no rate configured. Freezing that would write "you earned nothing" into a
 * permanent statement and then lock the month against fixing it — which is exactly
 * what a month-lock is supposed to prevent, pointed the wrong way.
 */
export function commissionReadiness(input: ReadinessInput): ReadinessCheck[] {
  const { report, unattributed, runStatus, year, month, today } = input;

  const sellers = report.perStaff.filter((s) => s.basis > 0);
  const unpaid = sellers.filter((s) => s.total === 0);

  const monthIsOver =
    year < today.year || (year === today.year && month < today.month);

  const liveRun = runStatus !== null && runStatus !== "void";

  return [
    {
      key: "rates",
      passed: unpaid.length === 0,
      blocking: true,
      title:
        unpaid.length === 0
          ? "Everyone who sold has a rate"
          : unpaid.length === sellers.length
            ? "Nobody has a commission rate"
            : `${unpaid.length} of ${sellers.length} people have no rate`,
      detail:
        unpaid.length === 0
          ? `${sellers.length} ${sellers.length === 1 ? "person" : "people"} sold this month and all of them compute to a figure.`
          : `${unpaid.length} of ${sellers.length} people who sold this month have no rate configured. Their statement would read RM 0.`,
    },
    {
      key: "attribution",
      passed: unattributed === 0,
      blocking: true,
      title:
        unattributed === 0
          ? "Every sale has a salesperson"
          : `${unattributed} ${unattributed === 1 ? "sale has" : "sales have"} no salesperson`,
      detail:
        unattributed === 0
          ? "Nothing would be paid to nobody. Imported archive rows are excluded — they have nobody to pay."
          // The Attribution tab was retired (Loo 2026-07-27) — the worklist now
          // appears on this page whenever it is non-empty, so the fix is here.
          : "Assign them below first, or their commission goes to nobody.",
    },
    {
      key: "month_over",
      passed: monthIsOver,
      blocking: false, // a warning: closing early is allowed, just say so
      title: monthIsOver ? "The month is over" : "This month is still running",
      detail: monthIsOver
        ? "Nothing more can land in it."
        : "You can close early, but sales after today will not be in the statement.",
    },
    {
      key: "no_run",
      passed: !liveRun,
      blocking: true,
      title: liveRun ? "This month is already closed" : "No run exists for this month yet",
      detail: liveRun
        ? "Discard the draft or reopen the approved run before closing again."
        : "Nothing has been approved or paid for this month.",
    },
  ];
}

export function canClose(checks: ReadinessCheck[]): boolean {
  return checks.every((c) => c.passed || !c.blocking);
}

export function blockingFailures(checks: ReadinessCheck[]): ReadinessCheck[] {
  return checks.filter((c) => c.blocking && !c.passed);
}

// ── payloads ─────────────────────────────────────────────────────────────────

export const commissionRunLineSchema = z.object({
  subjectKind: z.enum(["salesperson", "hq_user"]),
  subjectId: z.string().uuid(),
  staffCode: z.string().nullable(),
  name: z.string(),
  storeName: z.string().nullable(),
  orderCount: z.number(),
  basis: z.coerce.number(),
  ratePct: z.coerce.number().nullable(),
  direct: z.coerce.number(),
  override: z.coerce.number(),
  perModel: z.coerce.number(),
  milestone: z.coerce.number(),
  kpiBonus: z.coerce.number(),
  adjustments: z.coerce.number(),
  total: z.coerce.number(),
  breakdown: z.record(z.unknown()).optional(),
});
export type CommissionRunLine = z.infer<typeof commissionRunLineSchema>;

export const commissionRunSummarySchema = z.object({
  id: z.string().uuid(),
  year: z.number(),
  month: z.number(),
  program: commissionProgramSchema,
  status: commissionRunStatusSchema,
  note: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  paidAt: z.string().nullable().optional(),
  closedByName: z.string().nullable().optional(),
  approvedByName: z.string().nullable().optional(),
  totalCommission: z.coerce.number().default(0),
  totalAdjustments: z.coerce.number().default(0),
  totalPayable: z.coerce.number().default(0),
  peopleCount: z.number().default(0),
});
export type CommissionRunSummary = z.infer<typeof commissionRunSummarySchema>;

export const commissionRunDetailSchema = commissionRunSummarySchema.extend({
  lines: z.array(commissionRunLineSchema),
  adjustmentRows: z.array(
    z.object({
      id: z.string().uuid(),
      subjectKind: z.enum(["salesperson", "hq_user"]),
      subjectId: z.string().uuid(),
      amount: z.coerce.number(),
      reason: adjustmentReasonSchema,
      note: z.string().nullable(),
      originYear: z.number().nullable(),
      originMonth: z.number().nullable(),
      refOrderId: z.string().uuid().nullable(),
      refSo: z.union([z.string(), z.number()]).nullable(),
    }),
  ),
});
export type CommissionRunDetail = z.infer<typeof commissionRunDetailSchema>;

/** commission_run_state — the DB half of the pre-flight. */
export const commissionRunStateSchema = z.object({
  run: commissionRunSummarySchema.nullable(),
  unattributed: z.number(),
  pendingAdjustments: z.coerce.number(),
  locked: z.boolean(),
});
export type CommissionRunState = z.infer<typeof commissionRunStateSchema>;

// ── inputs ───────────────────────────────────────────────────────────────────

const yearMonth = {
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
};

export const closeMonthInput = z.object({
  ...yearMonth,
  program: commissionProgramSchema.default("staff"),
  note: z.string().trim().max(300).optional(),
});
export type CloseMonthInput = z.infer<typeof closeMonthInput>;

export const runActionInput = z.object({
  runId: z.string().uuid(),
  /** Required for reopen and discard — an audit line with no reason is a shrug. */
  reason: z.string().trim().max(300).optional(),
});
export type RunActionInput = z.infer<typeof runActionInput>;

export const addAdjustmentInput = z.object({
  ...yearMonth,
  program: commissionProgramSchema.default("staff"),
  subjectKind: z.enum(["salesperson", "hq_user"]).default("salesperson"),
  subjectId: z.string().uuid(),
  amount: z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  reason: adjustmentReasonSchema,
  originYear: z.number().int().min(2020).max(2100).optional(),
  originMonth: z.number().int().min(1).max(12).optional(),
  refOrderId: z.string().uuid().optional(),
  note: z.string().trim().max(300).optional(),
});
export type AddAdjustmentInput = z.infer<typeof addAdjustmentInput>;

// ── the CSV contract ─────────────────────────────────────────────────────────
// This is the integration with whatever pays people (§6: statutory payroll is bought,
// never built). Kept here so the API and any future consumer agree on the columns.

export const COMMISSION_CSV_COLUMNS = [
  "staff_code",
  "name",
  "store",
  "month",
  "sales_basis",
  "commission",
  "kpi_bonus",
  "adjustments",
  "total",
] as const;

/** RFC4180-ish: quote everything that could contain a comma, quote or newline. */
function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function commissionRunCsv(run: {
  year: number;
  month: number;
  lines: CommissionRunLine[];
}): string {
  const period = `${run.year}-${String(run.month).padStart(2, "0")}`;
  const rows = run.lines.map((l) =>
    [
      l.staffCode ?? "",
      l.name,
      l.storeName ?? "",
      period,
      l.basis.toFixed(2),
      (l.direct + l.override + l.perModel + l.milestone).toFixed(2),
      l.kpiBonus.toFixed(2),
      l.adjustments.toFixed(2),
      l.total.toFixed(2),
    ]
      .map(csvCell)
      .join(","),
  );
  return [COMMISSION_CSV_COLUMNS.join(","), ...rows].join("\r\n");
}
