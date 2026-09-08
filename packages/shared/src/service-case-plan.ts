/**
 * Service Case follow-ups (S3, service-case execution queue — Jess 2026-07-27).
 * **The case drives the follow-ups.**
 *
 * S1 turned the intake into closed questions. S2 made the answer to "what is
 * wrong" decide which photos the case cannot be filed without. S3 makes the
 * answer to "what does the customer want" decide WHAT HAPPENS NEXT — so nobody
 * has to remember that a repair means the item comes back, goes to the factory,
 * comes back again and then goes out again.
 *
 * ── Derived, not created ────────────────────────────────────────────────────
 *
 * The card says the system "creates" the next steps. It does something
 * stronger: the steps are DERIVED from the answers already on the case, every
 * time the case is read. There is no row for someone to forget to create, none
 * to delete, and none that can drift away from what the customer actually asked
 * for. What IS stored is the opposite half — the OUTCOME of each step
 * (`service_cases.progress`, migration 0293): the date it happened, who
 * recorded it, and the note where the step has something to say.
 *
 * That is the no-decorative-checkbox law (ACTION-FLOW-STANDARD Law 2) taken
 * literally: no step here is ticked. Each one closes because a fact the system
 * stores now exists — a date the supplier gave, the day the item came back, the
 * day the customer said it was solved.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 *  * **A deadline.** Law 2's sixth thing is Due, and these steps have none: the
 *    14-working-day SLA is card S4, and a per-step clock invented here would be
 *    a second, competing rule S4 would have to unpick. Nothing in S3 turns red.
 *  * **An owner per step.** Nothing in service cases assigns a PIC today; the
 *    whole module is operation-scoped, so the owner is the operation team.
 *  * **A supplier claim row.** The card asks for a claim STUB "until the
 *    R-series ships" — R2 has since shipped `supplier_claims`, but that table is
 *    keyed to a PO line (a receiving problem), and a customer complaint has no
 *    PO. Cross-linking the two is R3's card, not this one. Here the supplier
 *    step is what the card asked for: the call, with the supplier named.
 *
 * PURE — no I/O, no clock. The wizard's preview, the case view, the list's
 * next-step column and the API's close gate all read this one copy.
 */
import type { CaseWantKey } from "./service-case-intake";

// ── The chain ────────────────────────────────────────────────────────────────

export type CaseStepKey =
  | "inspect"
  | "supplier_date"
  | "collect"
  | "at_supplier"
  | "back_from_supplier"
  | "redeliver"
  | "customer_confirmed";

/**
 * The order the chain runs in — the card's own
 * `Complaint → Collected → At supplier → Repaired → Redelivered → Closed`, with
 * the two steps the card names in its bullets slotted where they belong (the
 * inspection comes before we can tell the supplier anything, and the supplier's
 * date is what makes the rest of the chain plannable).
 *
 * "Which one shows first" is answered by this order alone: the first step with
 * no outcome recorded. No second ranking rule exists.
 */
export const CASE_STEP_ORDER = [
  "inspect",
  "supplier_date",
  "collect",
  "at_supplier",
  "back_from_supplier",
  "redeliver",
  "customer_confirmed",
] as const satisfies readonly CaseStepKey[];

export const CASE_STEP_KEYS = CASE_STEP_ORDER as unknown as [CaseStepKey, ...CaseStepKey[]];

/** One follow-up, with everything the screen needs and nothing to look up. */
export interface CaseStep {
  key: CaseStepKey;
  /** The action: verb + named party + measurable object (COPY-STANDARD). */
  label: string;
  /** The FACT the timeline prints once the outcome is recorded. */
  done: string;
  /** The question above the date box. Each step's date means its own thing —
   *  the supplier's is a PROMISE about the future, the rest are records of a
   *  day that has already happened. */
  dateLabel: string;
  /** A note the step is worthless without (an inspection with nothing written
   *  down decided nothing). */
  noteRequired: boolean;
  /** Why it exists. Tooltip material — never a re-statement of the label. */
  why: string;
}

// ── Which wants pull which steps ─────────────────────────────────────────────

/** The factory has to promise us something: a replacement, the parts, or a
 *  repair. An inspection or a refund asks the supplier for nothing. */
const WANTS_NEEDING_SUPPLIER: readonly CaseWantKey[] = ["repair", "replace", "missing_parts"];

/** The item physically comes back to us. Missing parts do not — nothing is
 *  wrong with what the customer already has. */
const WANTS_BRINGING_IT_BACK: readonly CaseWantKey[] = ["repair", "replace", "refund"];

/** Something goes back out to the customer afterwards. A refund does not send
 *  anything back. */
const WANTS_GOING_BACK_OUT: readonly CaseWantKey[] = ["repair", "replace", "missing_parts"];

function has(wants: readonly CaseWantKey[], keys: readonly CaseWantKey[]): boolean {
  return wants.some((w) => keys.includes(w));
}

// ── The parties ──────────────────────────────────────────────────────────────

export interface CaseFollowUpInput {
  customerImpact?: "customer" | "stock_only" | null;
  /** Question 5 of the intake. An empty list is legal — a case filed before the
   *  wizard, or through the edit modal, has none. */
  customerWants?: readonly CaseWantKey[] | null;
  /** Named where we know it; the role word only where we do not (COPY-STANDARD:
   *  "the role word only when no name exists"). */
  customerName?: string | null;
  /** Resolved from the item's SKU at intake (0293). Null until a case names a
   *  product we can trace to a factory. */
  supplierName?: string | null;
}

function customerOf(i: CaseFollowUpInput): string {
  return (i.customerName ?? "").trim() || "the customer";
}

function supplierOf(i: CaseFollowUpInput): string {
  return (i.supplierName ?? "").trim() || "the supplier";
}

/**
 * What we are asking the factory for. The card's own
 * "confirm replacement/parts/repair date", picked in that order when the
 * customer asked for more than one thing.
 */
function supplierAsk(wants: readonly CaseWantKey[]): string {
  if (wants.includes("replace")) return "replacement";
  if (wants.includes("missing_parts")) return "parts";
  return "repair";
}

// ── The plan ─────────────────────────────────────────────────────────────────

/**
 * THE plan — the one function the wizard's preview, the case view, the list's
 * next-step column and the server's close gate all ask, so they cannot disagree
 * about what is still owed on a case.
 *
 * `customer_confirmed` is in EVERY plan, including a case with no answers at
 * all: the card's acceptance is that closing requires the customer to have
 * confirmed, and that does not depend on which boxes were ticked at intake.
 */
export function caseFollowUpPlan(input: CaseFollowUpInput): CaseStep[] {
  // A product-only problem cannot manufacture customer calls or confirmation.
  if (input.customerImpact === "stock_only") return [];
  const wants = input.customerWants ?? [];
  const customer = customerOf(input);
  const supplier = supplierOf(input);
  const steps: CaseStep[] = [];

  if (wants.includes("inspection")) {
    steps.push({
      key: "inspect",
      label: `Inspect the item at ${customer}`,
      done: "Inspected",
      dateLabel: "Date you inspected it",
      noteRequired: true,
      why: "An inspection nobody wrote down decides nothing afterwards.",
    });
  }

  if (has(wants, WANTS_NEEDING_SUPPLIER)) {
    steps.push({
      key: "supplier_date",
      label: `Call ${supplier} — confirm the ${supplierAsk(wants)} date`,
      done: `${supplier} gave a date`,
      dateLabel: `Date ${supplier} gave`,
      noteRequired: false,
      why: "A promise with no date on it cannot be followed up.",
    });
  }

  if (has(wants, WANTS_BRINGING_IT_BACK)) {
    steps.push({
      key: "collect",
      label: `Collect the item from ${customer}`,
      done: "Collected",
      dateLabel: "Date it was collected",
      noteRequired: false,
      why: "Nothing can be done to the item while it is still in the house.",
    });
  }

  if (wants.includes("repair")) {
    steps.push({
      key: "at_supplier",
      label: `Send the item to ${supplier}`,
      done: `At ${supplier}`,
      dateLabel: "Date it was sent",
      noteRequired: false,
      why: "The date it left us is the date the repair clock starts.",
    });
    steps.push({
      key: "back_from_supplier",
      label: `Check in the item from ${supplier}`,
      done: `Back from ${supplier}`,
      dateLabel: "Date it came back",
      noteRequired: false,
      why: "Nothing goes back to the customer before it is here to look at.",
    });
  }

  if (has(wants, WANTS_GOING_BACK_OUT)) {
    const partsOnly = wants.includes("missing_parts") && !wants.includes("repair") && !wants.includes("replace");
    steps.push({
      key: "redeliver",
      label: partsOnly
        ? `Deliver the missing parts to ${customer}`
        : `Deliver the item back to ${customer}`,
      done: "Delivered back",
      dateLabel: "Date it was delivered",
      noteRequired: false,
      why: "The customer is owed the goods, not an explanation.",
    });
  }

  steps.push({
    key: "customer_confirmed",
    label: `Call ${customer} — confirm the problem is solved`,
    done: "Customer says it is solved",
    dateLabel: "Date the customer confirmed",
    noteRequired: false,
    why: "A case is not finished when we are finished. It is finished when the customer is.",
  });

  return steps;
}

/** Every want there is — the plan for any one case is a subset of this. */
const ALL_WANTS: readonly CaseWantKey[] = [
  "repair",
  "replace",
  "missing_parts",
  "inspection",
  "refund",
];

/**
 * Every step this module knows, carrying THIS case's parties.
 *
 * A case's plan is a subset of the catalogue. Anything that needs a step's own
 * rules rather than its presence — the record form's date question, whether the
 * note is mandatory, what the timeline calls it — looks it up here, so a step
 * recorded outside the current plan still knows what it is.
 */
export function caseStepCatalogue(input: CaseFollowUpInput): CaseStep[] {
  return caseFollowUpPlan({ ...input, customerWants: ALL_WANTS });
}

export function caseStepDefinition(
  input: CaseFollowUpInput,
  key: string,
): CaseStep | null {
  return caseStepCatalogue(input).find((s) => s.key === key) ?? null;
}

// ── What has actually been recorded ──────────────────────────────────────────

/**
 * One recorded outcome. `at` / `by` / `byRole` are stamped by the SERVER and
 * refused by 0293's CHECK if absent — the same law S2 applies to evidence: a
 * record of who did what is worth nothing if the doer writes it themselves.
 *
 * `on` is the BUSINESS date (the day it happened, or the day the supplier
 * promised); `at` is when the row was typed. They are different facts and a
 * back-dated record needs both.
 */
export interface CaseProgressEntry {
  /** A plain string, not the enum: a step key that is later retired must stay
   *  readable in the timeline rather than vanish from the history. */
  step: string;
  on: string;
  at: string;
  by: string;
  byRole: string;
  note?: string | null;
}

export function caseStepEntry(
  progress: readonly CaseProgressEntry[] | null | undefined,
  key: string,
): CaseProgressEntry | null {
  return (progress ?? []).find((e) => e.step === key) ?? null;
}

export function caseStepDone(
  progress: readonly CaseProgressEntry[] | null | undefined,
  key: string,
): boolean {
  return caseStepEntry(progress, key) !== null;
}

/** Everything still owed on this case, in chain order. */
export function caseOpenSteps(
  plan: readonly CaseStep[],
  progress: readonly CaseProgressEntry[] | null | undefined,
): CaseStep[] {
  return plan.filter((s) => !caseStepDone(progress, s.key));
}

/**
 * Which ONE shows in the list row (ACTION-FLOW-STANDARD Law 1, layer 2). The
 * rest ride behind it as "+N" and are all visible the moment the case is
 * opened — none of them is suppressed, only out-ranked.
 */
export function caseNextStep(
  plan: readonly CaseStep[],
  progress: readonly CaseProgressEntry[] | null | undefined,
): CaseStep | null {
  return caseOpenSteps(plan, progress)[0] ?? null;
}

// ── The close gate ───────────────────────────────────────────────────────────

/**
 * The card's acceptance, in one call: **closing a case requires all its tasks
 * closed + customer-confirmed.** The disabled control and the server's refusal
 * ask this same question, so a client that skips the control cannot skip the
 * rule (the same shape as S2's evidence gate).
 */
export function caseMayClose(
  plan: readonly CaseStep[],
  progress: readonly CaseProgressEntry[] | null | undefined,
): boolean {
  return caseOpenSteps(plan, progress).length === 0;
}

/** Plain-words list of what is still open, for the refusal message and the
 *  tooltip (rule 6: the error gives the fix, by name). */
export function caseCloseBlockerMessage(steps: readonly CaseStep[]): string {
  return steps.map((s) => s.label).join(" · ");
}

// ── The timeline ─────────────────────────────────────────────────────────────

export interface CaseTimelineRow {
  key: string;
  /** The action while it is open, the fact once it is done. */
  label: string;
  step: CaseStep | null;
  entry: CaseProgressEntry | null;
}

/**
 * The whole chain, done and undone, in one list — the card's
 * `Complaint → Collected → At supplier → Repaired → Redelivered → Closed`.
 *
 * Takes the case's answers rather than a ready-made plan: a recorded step that
 * is NOT in today's plan is still listed (last), and naming it needs the same
 * parties the plan was built with. The answers stay editable after the fact,
 * and a timeline that quietly drops what really happened is a timeline that
 * lies.
 */
export function caseTimeline(
  input: CaseFollowUpInput,
  progress: readonly CaseProgressEntry[] | null | undefined,
): CaseTimelineRow[] {
  const plan = caseFollowUpPlan(input);
  const rows: CaseTimelineRow[] = plan.map((s) => {
    const entry = caseStepEntry(progress, s.key);
    return { key: s.key, label: entry ? s.done : s.label, step: s, entry };
  });

  const planned = new Set<string>(plan.map((s) => s.key));
  // Every step this module knows, with THIS case's parties in it — so a step
  // outside the plan still reads "At Ohana", never a raw key.
  const everyStep = caseStepCatalogue(input);
  for (const e of progress ?? []) {
    if (planned.has(e.step)) continue;
    const known = everyStep.find((s) => s.key === e.step) ?? null;
    rows.push({ key: e.step, label: known?.done ?? e.step, step: known, entry: e });
  }
  return rows;
}
