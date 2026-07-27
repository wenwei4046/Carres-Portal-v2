/**
 * Urgent restock — Ready Stock card K3
 * (`docs/ready-stock-execution-queue.md`, Jess-locked 2026-07-27).
 *
 * THE CARD: "same flow, any time, flagged EMERGENCY with reason
 * (Promotion · Unexpected demand · Weekend stock low · OOS risk · New launch ·
 * Other); skips consolidation (straight to COO), never mixes into the monthly
 * plan's numbers. Done when: a viral-product weekend can be restocked without
 * waiting for month-end."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR DECISIONS THIS FILE ENCODES, AND WHY
 *
 * 1. "NEVER MIXES INTO THE MONTHLY PLAN'S NUMBERS" IS A SEPARATE TABLE, NOT A
 *    FLAG. An `is_emergency` column on `ops_stock_plan_proposals` would have
 *    been less SQL and would have made every future reader of that table
 *    responsible for remembering to filter it out — and the first one who
 *    forgets silently inflates a month's ask with a weekend panic. K2's
 *    `computePlanView` reads proposals; it cannot see an urgent request even by
 *    mistake, because the row is not there and has no `plan_id` to join on.
 *
 * 2. NO CYCLE, NO SUGGESTION. A request is filed against a DAY, not a month —
 *    that is what makes "any time" real, since the monthly cycle's `collecting`
 *    window would otherwise gate the exact case the card names. And there is
 *    deliberately NO suggested quantity here: an emergency is by definition
 *    demand the history does not contain, so scaling a run rate off it would be
 *    the same fabrication K2 refused to print. The screen states FACTS instead
 *    — free now, spoken for, on the water — and lets the human decide.
 *
 * 3. THE FOURTH STATE (`ordered`) IS AN ADDITION TO THE CARD, ON PURPOSE. K2's
 *    handover list is scoped by its month, so it clears itself. This lane runs
 *    continuously: without a way to say "I raised the PO", an approved request
 *    would sit on the worklist forever and the list would stop being a list.
 *    It is NOT auto-PO (the queue doc's LATER section) — it is a human ticking
 *    the box, gated on `po_duty_editor`, the duty that already means "the
 *    person who raises purchase orders".
 *
 * 4. `Other` MUST CARRY WORDS. The whole point of a locked reason list is that
 *    K4 and K5 can read WHY the ready pool drains; "Other" with an empty note
 *    is a hole in that answer, so the same rule refuses it on the client, in
 *    the route and in the database.
 *
 * ZERO new duty keys — K1's note stands and K2 asserted it: raise = any
 * operation login · decide = `stock_planner` · mark ordered = `po_duty_editor`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { aggregateStockUnits, type PlanStockUnit } from "./ready-stock-plan";
import type { IsoDate } from "./working-days";

// ── The reason list (Jess-locked) ───────────────────────────────────────────

export const EMERGENCY_REASONS = [
  "promotion",
  "unexpected_demand",
  "weekend_low",
  "oos_risk",
  "new_launch",
  "other",
] as const;
export type EmergencyReason = (typeof EMERGENCY_REASONS)[number];

/**
 * The words on screen. Two differ from the card's shorthand and both are the
 * no-jargon law, not a redesign: `OOS risk` is warehouse jargon a low-English
 * operator does not read, and "Weekend stock low" reads better as the thing
 * that is actually happening. The KEYS are the card's, so the data keeps its
 * locked vocabulary.
 */
export const EMERGENCY_REASON_LABEL: Record<EmergencyReason, string> = {
  promotion: "Promotion",
  unexpected_demand: "Unexpected demand",
  weekend_low: "Weekend stock low",
  oos_risk: "About to run out",
  new_launch: "New launch",
  other: "Other",
};

/** `Other` explains nothing by itself — see decision 4 in the header. */
export function reasonNeedsNote(reason: EmergencyReason): boolean {
  return reason === "other";
}

// ── The states ──────────────────────────────────────────────────────────────

/**
 * `pending`  → raised, waiting for the COO. No consolidation step exists.
 * `approved` → the COO said yes (possibly at a smaller number).
 * `rejected` → turned down, with a remark. Terminal (K2's law: a sent-back ask
 *              is raised again, never quietly re-approved).
 * `ordered`  → somebody raised the purchase order. Terminal, and the only
 *              thing that takes an approved row off the worklist.
 */
export const EMERGENCY_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "ordered",
] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

/** State vocabulary law: no DB word reaches the screen. One mapping, shared. */
export const EMERGENCY_STATUS_LABEL: Record<EmergencyStatus, string> = {
  pending: "Waiting for COO",
  approved: "Approved",
  rejected: "Turned down",
  ordered: "Ordered",
};

// ── Validation, in one place ────────────────────────────────────────────────

export const EMERGENCY_MAX_QTY = 100000;
export const EMERGENCY_NOTE_MAX = 300;

export interface EmergencyDraft {
  sku: string;
  qty: number;
  reason: EmergencyReason | "";
  note?: string | null;
}

/**
 * Why a draft cannot be raised yet, or `null` when it can.
 *
 * ONE function, three consumers: the disabled button, the Hono route and (in
 * the same shape) the SQL. The client copy is a courtesy — the server decides —
 * but a button that goes dark for a different reason than the server refuses
 * for is how an operator learns to distrust the screen.
 */
export function emergencyDraftProblem(draft: EmergencyDraft): string | null {
  if (!draft.sku?.trim()) return "Pick the item";
  if (!Number.isInteger(draft.qty) || draft.qty <= 0)
    return "How many do you need?";
  if (draft.qty > EMERGENCY_MAX_QTY) return "That is more than the warehouse holds";
  if (!draft.reason) return "Why is this urgent?";
  if (!EMERGENCY_REASONS.includes(draft.reason as EmergencyReason))
    return "Why is this urgent?";
  if (
    reasonNeedsNote(draft.reason as EmergencyReason) &&
    !(draft.note ?? "").trim()
  )
    return "Say what the reason is";
  return null;
}

// ── Inputs ──────────────────────────────────────────────────────────────────

/** One `ops_stock_emergency_requests` row, camel-cased. */
export interface EmergencyRequest {
  id: string;
  sku: string;
  qty: number;
  reason: EmergencyReason;
  note: string | null;
  requestedBy: string;
  requestedByName?: string | null;
  /** ISO timestamp. */
  requestedAt: string;
  status: EmergencyStatus;
  /** The COO's number. May be smaller than `qty`; never read before approval. */
  approvedQty: number | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionRemark?: string | null;
  orderedByName?: string | null;
  orderedAt?: string | null;
}

// ── Outputs ─────────────────────────────────────────────────────────────────

export interface EmergencyRow extends EmergencyRequest {
  reasonLabel: string;
  /** Free units on the floor right now — K1's law, summed from the register. */
  onHand: number;
  /** Spoken for by an order. Context only, never counted as cover. */
  reserved: number;
  /** Ordered and not yet arrived — the single most useful thing to know
   *  before raising an urgent PO for the same thing twice. */
  incoming: number;
  /**
   * Free stock already covers the ask. WARNS, never blocks (Jess's locked word
   * on the K2 warning, and the same restraint applies here): the register can
   * be behind reality, and the person on the floor may know something it does
   * not.
   */
  coveredByFreeStock: boolean;
  /** Days this ask has been waiting. `null` once it has been answered. */
  waitingDays: number | null;
}

export interface EmergencyPoLine {
  sku: string;
  qty: number;
  /** How many separate urgent asks this one PO line answers. */
  requestCount: number;
}

export interface EmergencyView {
  rows: EmergencyRow[];
  /** Drives the "needs the COO" badge. */
  pendingCount: number;
  /** Approved and not yet ordered — the urgent handover to Operations. */
  poList: EmergencyPoLine[];
}

// ── The view ────────────────────────────────────────────────────────────────

function dayOf(ts: string): IsoDate {
  return ts.slice(0, 10);
}

function daysWaiting(requestedAt: string, asOf: IsoDate): number {
  const a = Date.parse(`${dayOf(requestedAt)}T00:00:00Z`);
  const b = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const STATUS_ORDER: Record<EmergencyStatus, number> = {
  pending: 0,
  approved: 1,
  ordered: 2,
  rejected: 3,
};

export function computeEmergencyView(input: {
  requests: readonly EmergencyRequest[];
  units?: readonly PlanStockUnit[];
  asOf: IsoDate;
}): EmergencyView {
  const { requests, units = [], asOf } = input;
  const stock = aggregateStockUnits(units);

  const rows: EmergencyRow[] = requests.map((r) => {
    const s = stock.get(r.sku?.trim() ?? "") ?? {
      free: 0,
      reserved: 0,
      incoming: 0,
    };
    return {
      ...r,
      reasonLabel: EMERGENCY_REASON_LABEL[r.reason] ?? r.reason,
      onHand: s.free,
      reserved: s.reserved,
      incoming: s.incoming,
      coveredByFreeStock: s.free >= r.qty,
      waitingDays: r.status === "pending" ? daysWaiting(r.requestedAt, asOf) : null,
    };
  });

  // Waiting asks first, and among those the OLDEST first — the one that has
  // been ignored longest is the one about to cost a sale. Everything already
  // answered sorts newest first, which is how a history reads.
  rows.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.status === "pending") return a.requestedAt.localeCompare(b.requestedAt);
    return b.requestedAt.localeCompare(a.requestedAt);
  });

  return {
    rows,
    pendingCount: rows.filter((r) => r.status === "pending").length,
    poList: emergencyPoList(rows),
  };
}

/**
 * The urgent handover.
 *
 * Reads `approvedQty` and NOTHING else — never falling back to what was asked
 * for, exactly as K2's `planPoList` refuses to fall back to the manager's cut,
 * so every ordered unit traces to a decision somebody made. Two people who both
 * panic about the same SKU produce ONE line: Operations raises one purchase
 * order, and `requestCount` says how many asks it answers.
 *
 * `ordered` rows drop off — that is the whole point of the state.
 */
export function emergencyPoList(
  rows: readonly EmergencyRequest[],
): EmergencyPoLine[] {
  const bySku = new Map<string, EmergencyPoLine>();
  for (const r of rows) {
    if (r.status !== "approved") continue;
    const qty = r.approvedQty ?? 0;
    if (qty <= 0) continue;
    const sku = r.sku.trim();
    const line = bySku.get(sku) ?? { sku, qty: 0, requestCount: 0 };
    line.qty += qty;
    line.requestCount += 1;
    bySku.set(sku, line);
  }
  return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}
