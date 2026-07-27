/**
 * Service Case deadline (S4, service-case execution queue — Jess 2026-07-27).
 * **No case silently passes day 14.**
 *
 * S1 made the intake a set of closed questions, S2 made the answer decide the
 * evidence, S3 made it decide what happens next. S4 puts a CLOCK on all of it:
 * every case is finished within **14 working days of the day it was reported**,
 * and four working days before that deadline the system asks the operator to
 * ring the customer and say why it is taking longer — with a reason picked from
 * a locked list, never typed.
 *
 * ── Derived, not stored (the S3 law, applied to the clock) ──────────────────
 *
 * The deadline is NOT a column. It is `opened_at + 14 working days`, computed
 * every time the case is read, so a correction to the holiday calendar fixes
 * every case at once and no row can carry a deadline that disagrees with the
 * rule. What IS stored is the half that is genuinely a fact and cannot be
 * derived from anything: that somebody rang the customer on a date and gave a
 * reason, and that the deadline was moved once (`service_cases.sla_events`,
 * migration 0298).
 *
 * ── Why every event carries the deadline it was given against ───────────────
 *
 * "The customer has been told" is not a permanent state — it is true only about
 * ONE deadline. Move the deadline and the customer has to hear the new one. So
 * each event records the due date in force when it was made (`due`), and an
 * extension records the due date it CREATED (`until`); the call is owed again
 * whenever no event points at today's deadline. Without that field, extending
 * would silently mark the new deadline as already explained.
 *
 * ── Working days, one definition ────────────────────────────────────────────
 *
 * Mon–Sat · Sunday excluded · Malaysian public holidays excluded. The math is
 * delegated to `working-days.ts` (shipped with procurement 2026-07-21) and the
 * holiday set is INJECTED, exactly as `delivery-queue.ts` does — this module
 * reimplements neither.
 *
 * PURE — no I/O, no clock. `todayIso` is always passed in, so a test can sit on
 * any date and the caller owns the timezone question (MYT for this business).
 */

import {
  addWorkingDays,
  countWorkingDays,
  isWorkingDay,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";

// ── The numbers ──────────────────────────────────────────────────────────────

/** The promise: a case is finished within this many working days of the report. */
export const CASE_SLA_WORKING_DAYS = 14;

/** The card's "at day 10 unresolved" — the working day the call becomes owed. */
export const CASE_SLA_NOTICE_WORKING_DAY = 10;

/**
 * The same rung read from the other end: the call is owed once this many
 * working days are left. Derived rather than typed twice — and it is the form
 * the code uses, because it keeps meaning the same thing after the deadline has
 * been extended (day 10 of an extended case is not the interesting day; four
 * days before the deadline in force always is).
 */
export const CASE_SLA_NOTICE_DAYS_BEFORE =
  CASE_SLA_WORKING_DAYS - CASE_SLA_NOTICE_WORKING_DAY;

/**
 * How far the one allowed extension may push the deadline: one more full SLA
 * period. The card says an extension is recorded, not how long it may be — and
 * an unbounded date box is how a case gets moved to next year and disappears.
 */
export const CASE_SLA_EXTENSION_MAX_WORKING_DAYS = CASE_SLA_WORKING_DAYS;

export const CASE_SLA_NOTE_MAX = 300;

// ── The reasons (T4-style: staff pick facts, never write essays) ─────────────

export const CASE_DELAY_REASONS = [
  "supplier_special_order",
  "supplier_no_date",
  "no_stock",
  "logistics",
  "customer_unreachable",
  "customer_hold",
  "other",
] as const;
export type CaseDelayReason = (typeof CASE_DELAY_REASONS)[number];

/** The words on screen. Plain, no abbreviation, no mood words. */
export const CASE_DELAY_REASON_LABEL: Record<CaseDelayReason, string> = {
  supplier_special_order: "Parts on special order",
  supplier_no_date: "Factory has not given a date",
  no_stock: "No replacement in stock",
  logistics: "No collection or delivery date yet",
  customer_unreachable: "Customer cannot be reached",
  customer_hold: "Customer asked us to hold it",
  other: "Other",
};

/**
 * Who the delay sits with. NOT shown to staff — it is what lets S5 answer
 * "which supplier causes the most late cases" without a second tagging pass
 * (T4's own reasoning, and the same one-field-now price).
 */
export type CaseDelayResponsibility = "supplier" | "carres" | "customer";

export const CASE_DELAY_REASON_RESPONSIBILITY: Record<
  CaseDelayReason,
  CaseDelayResponsibility
> = {
  supplier_special_order: "supplier",
  supplier_no_date: "supplier",
  no_stock: "carres",
  logistics: "carres",
  customer_unreachable: "customer",
  customer_hold: "customer",
  other: "carres",
};

/** `Other` explains nothing by itself — the same rule K3/K4 settled for the
 *  pool reasons, inherited rather than re-invented. */
export function caseDelayNeedsNote(reason: CaseDelayReason): boolean {
  return reason === "other";
}

export function caseDelayReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—";
  return CASE_DELAY_REASON_LABEL[reason as CaseDelayReason] ?? reason;
}

// ── What is stored ───────────────────────────────────────────────────────────

export type CaseSlaEventKind = "customer_told" | "extension";

/**
 * One deadline event. `at` / `by` / `byRole` / `due` are stamped by the SERVER
 * and refused by 0298's CHECK if absent — the same law S2 applies to evidence
 * and S3 to the follow-ups: a record of who did what is worth nothing if the
 * doer writes it.
 *
 * `kind` is a plain string on the READ side (like an evidence `slot` or a
 * progress `step`): a kind that is later retired must stay readable in the
 * history rather than vanish from it.
 */
export interface CaseSlaEvent {
  kind: string;
  /** The BUSINESS date — the day the customer was actually told. */
  on: string;
  reason: string;
  note?: string | null;
  /** `extension` only: the new deadline this event created. */
  until?: string | null;
  /** The deadline in force when the event was made. Server-stamped. */
  due?: string | null;
  at: string;
  by: string;
  byRole: string;
}

// ── The clock ────────────────────────────────────────────────────────────────

export interface CaseSlaInput {
  /** Day 0 — the day the case was reported (`service_cases.opened_at`). */
  openedAt?: string | null;
  todayIso: string;
  events?: readonly CaseSlaEvent[] | null;
  /** A closed case's clock is off: there is nothing left to be late for. */
  closed?: boolean;
  /** Named where we know it, so the action can carry the party. */
  customerName?: string | null;
}

/**
 * Internal keys, never words on screen.
 *  - `off`         — no report date, or the case is closed. Nothing to say.
 *  - `on_track`    — more than four working days left.
 *  - `notice_due`  — the card's day 10: the customer is owed a call.
 *  - `late`        — the deadline has passed.
 */
export type CaseSlaState = "off" | "on_track" | "notice_due" | "late";

export interface CaseSlaClock {
  state: CaseSlaState;
  /** The deadline in force: the base one, or the extension's date. */
  dueIso: IsoDate | null;
  /** What it would be with no extension — what the extension is measured from. */
  baseDueIso: IsoDate | null;
  extendedToIso: IsoDate | null;
  /** Working days from today to the deadline; negative once it has passed. */
  workingDaysLeft: number | null;
  /** Working days past the deadline (0 until it passes). */
  workingDaysLate: number;
  /** The last call on file, whichever deadline it was about. */
  toldOn: string | null;
  toldReason: string | null;
  /** True when the deadline in force has been explained to the customer. */
  toldAboutThisDeadline: boolean;
  /** The call is owed NOW (the warn window is open and nobody has rung). */
  noticeOwed: boolean;
  /** The one allowed extension is still unused. */
  mayExtend: boolean;
}

const EMPTY: readonly CaseSlaEvent[] = [];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return ISO_DATE.test(d) ? d : null;
}

/** The next working day, or `iso` itself when it already is one — the law's
 *  "a due date landing on a non-working day moves to the next working day". */
export function caseSlaWorkingDay(iso: IsoDate, opts: WorkingDayOptions = {}): IsoDate {
  return isWorkingDay(iso, opts) ? iso : addWorkingDays(iso, 1, opts);
}

/** The deadline with no extension applied: report date + 14 working days. */
export function caseSlaBaseDue(
  openedAt: string | null | undefined,
  opts: WorkingDayOptions = {},
): IsoDate | null {
  const from = day(openedAt);
  return from ? addWorkingDays(from, CASE_SLA_WORKING_DAYS, opts) : null;
}

/** The one extension on file, or null. */
export function caseSlaExtension(
  events: readonly CaseSlaEvent[] | null | undefined,
): CaseSlaEvent | null {
  return (events ?? EMPTY).find((e) => e.kind === "extension") ?? null;
}

/**
 * THE clock — the one function the list column, the case view, the next-step
 * ranking and the API's extension gate all ask, so they cannot disagree about
 * when a case is late or who has been told what.
 */
export function caseSlaClock(
  input: CaseSlaInput,
  opts: WorkingDayOptions = {},
): CaseSlaClock {
  const events = input.events ?? EMPTY;
  const baseDueIso = caseSlaBaseDue(input.openedAt, opts);
  const ext = caseSlaExtension(events);
  const extendedToIso = day(ext?.until);
  const dueIso = extendedToIso ?? baseDueIso;

  // The last call on file, by business date — the customer's own memory of it.
  let told: CaseSlaEvent | null = null;
  for (const e of events) {
    const on = day(e.on);
    if (!on) continue;
    if (!told || on >= (day(told.on) ?? "")) told = e;
  }

  const mayExtend = !input.closed && ext === null;

  if (!dueIso || input.closed) {
    return {
      state: "off",
      dueIso,
      baseDueIso,
      extendedToIso,
      workingDaysLeft: null,
      workingDaysLate: 0,
      toldOn: day(told?.on),
      toldReason: told?.reason ?? null,
      toldAboutThisDeadline: coversDeadline(events, dueIso),
      noticeOwed: false,
      mayExtend,
    };
  }

  const today = day(input.todayIso);
  if (!today) {
    return {
      state: "off",
      dueIso,
      baseDueIso,
      extendedToIso,
      workingDaysLeft: null,
      workingDaysLate: 0,
      toldOn: day(told?.on),
      toldReason: told?.reason ?? null,
      toldAboutThisDeadline: coversDeadline(events, dueIso),
      noticeOwed: false,
      mayExtend,
    };
  }

  const late = today > dueIso;
  const workingDaysLate = late ? countWorkingDays(dueIso, today, opts) : 0;
  const workingDaysLeft = late ? -workingDaysLate : countWorkingDays(today, dueIso, opts);

  const state: CaseSlaState = late
    ? "late"
    : workingDaysLeft <= CASE_SLA_NOTICE_DAYS_BEFORE
      ? "notice_due"
      : "on_track";

  const toldAboutThisDeadline = coversDeadline(events, dueIso);

  return {
    state,
    dueIso,
    baseDueIso,
    extendedToIso,
    workingDaysLeft,
    workingDaysLate,
    toldOn: day(told?.on),
    toldReason: told?.reason ?? null,
    toldAboutThisDeadline,
    noticeOwed: (state === "notice_due" || state === "late") && !toldAboutThisDeadline,
    mayExtend,
  };
}

/**
 * Has the customer been told about THIS deadline?
 *
 * An extension points at the deadline it created (`until`); a call points at
 * the one in force when it was made (`due`). Anything that points at today's
 * deadline covers it — which is why moving the deadline re-opens the call
 * instead of inheriting the last one's silence.
 */
function coversDeadline(
  events: readonly CaseSlaEvent[] | null | undefined,
  dueIso: string | null,
): boolean {
  if (!dueIso) return false;
  return (events ?? EMPTY).some((e) => (day(e.until) ?? day(e.due)) === dueIso);
}

// ── The action ───────────────────────────────────────────────────────────────

function customerOf(name: string | null | undefined): string {
  return (name ?? "").trim() || "the customer";
}

/**
 * The ONE thing S4 ever asks a human to do, or null when it asks nothing.
 *
 * Verb + named party + measurable object (COPY-STANDARD's action naming law):
 * the object is the reason, which lands in the ledger — a call with nothing
 * recorded does not close it (the Call verb's own completion rule).
 */
export function caseSlaAction(
  clock: CaseSlaClock,
  customerName?: string | null,
): string | null {
  if (!clock.noticeOwed) return null;
  return `Call ${customerOf(customerName)} — say why it is taking longer`;
}

/**
 * The deadline as a FACT, for the badge under the date. Never a to-do word
 * (COPY-STANDARD: a fact may state an absence, never a gap that needs doing),
 * and numbers up front.
 */
export function caseSlaCountLabel(clock: CaseSlaClock): string | null {
  if (clock.state === "off" || clock.workingDaysLeft === null) return null;
  if (clock.state === "late") {
    return `${clock.workingDaysLate} working ${plural(clock.workingDaysLate)} late`;
  }
  if (clock.workingDaysLeft === 0) return "Due today";
  return `${clock.workingDaysLeft} working ${plural(clock.workingDaysLeft)} left`;
}

function plural(n: number): string {
  return n === 1 ? "day" : "days";
}

// ── Recording an event ───────────────────────────────────────────────────────

export interface CaseSlaRecordInput {
  kind: CaseSlaEventKind;
  /** The day the customer was told. */
  on: string;
  reason: string;
  note?: string | null;
  /** `extension` only — the new deadline. */
  until?: string | null;
}

/**
 * Why this cannot be recorded yet, or null when it can.
 *
 * ONE function, two consumers: the disabled button and the Hono route. A button
 * that goes dark for a different reason than the server refuses for is how an
 * operator learns to distrust the screen (K4's rule, inherited).
 *
 * The bounds are measured against the BASE deadline, not the one in force, so
 * the answer cannot be walked forward by re-reading a deadline the caller just
 * moved.
 */
export function caseSlaRecordProblem(
  input: CaseSlaRecordInput,
  clock: CaseSlaClock,
  opts: WorkingDayOptions = {},
): string | null {
  if (!day(input.on)) return "Give the date as YYYY-MM-DD";
  if (!(CASE_DELAY_REASONS as readonly string[]).includes(input.reason))
    return "Why is it taking longer?";
  if (caseDelayNeedsNote(input.reason as CaseDelayReason) && !(input.note ?? "").trim())
    return "Say what the reason is";
  if ((input.note ?? "").length > CASE_SLA_NOTE_MAX) return "That note is too long";

  if (input.kind !== "extension") return null;

  if (!clock.mayExtend) return "This deadline has already been moved once.";
  const base = clock.baseDueIso;
  if (!base) return "This case has no report date, so it has no deadline to move.";
  const until = day(input.until);
  if (!until) return "Give the new deadline as YYYY-MM-DD";
  if (until <= base) return "The new deadline must be after the one it replaces.";
  const max = caseSlaExtensionMax(base, opts);
  if (max && until > max) return `The deadline cannot be moved past ${max}.`;
  return null;
}

/** The furthest the one extension may reach. */
export function caseSlaExtensionMax(
  baseDueIso: string | null,
  opts: WorkingDayOptions = {},
): IsoDate | null {
  const base = day(baseDueIso);
  return base ? addWorkingDays(base, CASE_SLA_EXTENSION_MAX_WORKING_DAYS, opts) : null;
}
