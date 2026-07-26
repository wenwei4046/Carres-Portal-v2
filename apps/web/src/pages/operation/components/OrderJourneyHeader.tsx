import { AlertTriangle, Check } from "lucide-react";

/**
 * J3 — the journey header. ONE strip at the top of the order drawer answering
 * the three questions in 3 seconds: where is this order · who is next · what is
 * wrong.
 *
 * THE LAW OF THIS FILE (card J3, DONE WHEN): "the strip agrees with the
 * ladder/queues for the same order, ALWAYS". That is not achieved by copying
 * the ladder's rules carefully — it is achieved by never running them twice.
 * The Orders list computes the row's NEXT verb with `nextActionOf` and hands
 * the RESULT down as `OrderJourneySignals.next`; this module only renders it.
 * The stage strip and the owner line are pure functions OF that verb and of the
 * ladder's own inputs, so a future change to the ladder moves both surfaces at
 * once. There is no second derivation here to drift.
 *
 * ZERO WRITES — every field is read at render time from data the drawer and the
 * list already load. Nothing here fetches and nothing here mutates.
 *
 * NOT a second timeline. The drawer's numbered journey spine (定稿 rev25) still
 * owns "what happened, step by step, which panel do I open"; the activity log
 * still owns the event history. This strip answers only "where · who · what is
 * wrong" and deliberately shares no vocabulary with either.
 */

/** The five lifecycle stages, in order. These are ORDER stages (what the order
 *  has been through), not the drawer's task steps and not DB stage words. */
export const JOURNEY_STAGES = [
  "Purchase",
  "Goods",
  "Booking",
  "Delivery",
  "Done",
] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

/** done = this stage is behind us · current = where the order sits right now
 *  (the ● the ladder's verb points at) · todo = not reached. A stage can be
 *  open WITHOUT being current (a late order chasing the logistic while a line
 *  is still unready), which is why "not done" and "current" are separate. */
export type JourneyStageState = "done" | "current" | "todo";

export interface JourneyStageCell {
  stage: JourneyStage;
  state: JourneyStageState;
}

export type JourneyHealthTone = "danger" | "warning";
export interface JourneyHealthLine {
  /** Stable key for react + tests. */
  key: "hold" | "stock_delay" | "uncollected" | "documents";
  tone: JourneyHealthTone;
  text: string;
}

export interface OrderJourney {
  stages: JourneyStageCell[];
  /** The ladder's verb, passed straight through — the SAME word the list row's
   *  MANAGE pill shows for this order. */
  nextLabel: string;
  nextTone: "danger" | "warning" | "info" | "success" | "neutral";
  nextLocked: boolean;
  /** "Logistic — waiting customer confirmation": who acts, then why. */
  owner: string;
  /** At most three. Empty = nothing is wrong, which the UI states out loud. */
  health: JourneyHealthLine[];
}

/** Everything this module needs, all of it computed by the CALLER using the
 *  functions that already drive the Orders list row. Nothing in here is a
 *  signal the list does not already read. */
export interface OrderJourneySignals {
  /** `nextActionOf(...)` verbatim — not a re-derivation of it. */
  next: {
    label: string;
    tone: "danger" | "warning" | "info" | "success" | "neutral";
    locked?: boolean;
  };
  /** A purchase order exists for these goods — a portal PO or an imported
   *  `order_lines.source_po`. */
  hasPo: boolean;
  /** The ladder's own "ready" rule (live free stock OR the Master import's
   *  per-line ready flag). */
  goodsReady: boolean;
  /** D1/0277 — the CUSTOMER confirmed a date, not the carrier's provisional
   *  word. Same predicate as `bookingConfirmedOf`. */
  bookingConfirmed: boolean;
  /** The order reached the customer. */
  delivered: boolean;
  /** T6/0280 photo ledger: true = on file · false = genuinely none ·
   *  null = UNKNOWN (older Worker / no overlay row). Unknown never accuses. */
  photoOnFile: boolean | null;
  /** The money the LADDER locked on — `ops_order_control.balance` plus any
   *  uncollected storage fee, the exact inputs of its 🔒. `null` means the
   *  balance is not on file (the live case on every order today), which is why
   *  the health line must never read this as "settled". */
  holdAmount: number | null;
}

/** The verb → stage map. This is the ONE place the two surfaces are joined:
 *  the ladder picks the verb, and the verb picks the ● . A verb this map does
 *  not know (an older or newer Worker) falls through to "the first stage that
 *  is not finished", so the strip degrades instead of pointing nowhere. */
const VERB_STAGE: Record<string, JourneyStage> = {
  "Order PO": "Purchase",
  "Chase supplier": "Goods",
  "Call customer (stock delay)": "Goods",
  "Assign logistic": "Booking",
  "Chase logistic": "Booking",
  "Deliver today": "Delivery",
  Confirm: "Delivery",
  "Upload delivery photo": "Done",
};

/** Who acts next, and why — keyed on the same verb. Plain words, the party
 *  named (COPY-STANDARD rules 1/8/9): a new operator must read one line and
 *  know whether to pick up the phone, and to whom. */
const VERB_OWNER: Record<string, string> = {
  "Order PO": "Operations — raise the purchase order",
  "Chase supplier": "Supplier — goods not in yet",
  "Call customer (stock delay)": "Operations — tell the customer the new date",
  "Assign logistic": "Operations — assign the logistic",
  "Chase logistic": "Logistic — waiting customer confirmation",
  "Deliver today": "Logistic — delivering today",
  Confirm: "Operations — everything ready, confirm",
  "Upload delivery photo": "Operations — upload the delivery photo",
  Done: "Nobody — this order is closed",
};
/** The money hold reads differently from the plain Confirm: the ladder's 🔒
 *  says the delivery may not happen, and the person who unblocks it is the
 *  customer, not us. */
const OWNER_HOLD = "Customer — balance not paid";
const OWNER_UNKNOWN = "Operations — check this order";

/** Is this stage finished? One signal each. Purchase counts as settled once the
 *  goods are secured: an order filled from shelf stock never needs a PO, and
 *  marking it forever-incomplete would put the ● on a step nobody will do. */
function stageDone(stage: JourneyStage, sig: OrderJourneySignals): boolean {
  switch (stage) {
    case "Purchase":
      return sig.hasPo || sig.goodsReady;
    case "Goods":
      return sig.goodsReady;
    case "Booking":
      return sig.bookingConfirmed;
    case "Delivery":
      return sig.delivered;
    case "Done":
      // T7's law: a delivered order whose photo ledger is empty is not done.
      // `null` (unknown) is not evidence of a gap — treat delivered as done.
      return sig.delivered && sig.photoOnFile !== false;
  }
}

export interface OrderJourneyInput {
  signals: OrderJourneySignals;
  /** J1's missing-document count for this order (`countDocumentsMissing`). */
  docsMissing: number;
  /** The names of those documents, in J1's own order, for the health line. */
  docsMissingLabels: string[];
  /** The drawer's OWN ledger figure (order total − collected), in RM. The list
   *  cannot see this — it reads `ops_order_control.balance`, which is NULL on
   *  every live order — so this is additive fact, never a contradiction: the
   *  list's money dot says "no balance data", and this says what the ledger
   *  knows. It is stated as a fact and never as a hold, because a hold is the
   *  ladder's word and the ladder is not holding this order. */
  ledgerOutstanding: number;
  /** Pre-formatted "1,200" — this module carries no currency dependency. */
  ledgerOutstandingLabel: string;
  /** `signals.holdAmount`, pre-formatted. Empty when the lock is on but the
   *  amount is not on file. */
  holdAmountLabel: string;
}

/** PURE. No clock, no I/O — every date-shaped decision was already made by the
 *  ladder before its verb arrived here. */
export function deriveOrderJourney(input: OrderJourneyInput): OrderJourney {
  const { signals: sig } = input;
  const verb = sig.next.label;
  const locked = sig.next.locked === true;

  // ── Where the order sits ────────────────────────────────────────────────
  const firstOpen = JOURNEY_STAGES.find((s) => !stageDone(s, sig)) ?? null;
  const mapped = VERB_STAGE[verb];
  // "Done" is the ladder's closed state: no stage is current.
  const current: JourneyStage | null = verb === "Done" ? null : (mapped ?? firstOpen);
  const stages: JourneyStageCell[] = JOURNEY_STAGES.map((stage) => ({
    stage,
    state:
      stage === current
        ? "current"
        : stageDone(stage, sig)
          ? "done"
          : "todo",
  }));

  // ── Who is next ─────────────────────────────────────────────────────────
  const owner = locked
    ? OWNER_HOLD
    : (VERB_OWNER[verb] ?? OWNER_UNKNOWN);

  // ── What is wrong (≤3, most urgent first) ───────────────────────────────
  const health: JourneyHealthLine[] = [];
  if (locked) {
    health.push({
      key: "hold",
      tone: "danger",
      text: input.holdAmountLabel
        ? `Delivery on hold — RM ${input.holdAmountLabel} to collect`
        : "Delivery on hold — balance not collected",
    });
  }
  if (verb === "Call customer (stock delay)") {
    health.push({
      key: "stock_delay",
      tone: "danger",
      text: "Stock arrives after the promised date",
    });
  }
  // Only when the ladder is NOT already holding on money — one money line.
  if (!locked && input.ledgerOutstanding > 0) {
    health.push({
      key: "uncollected",
      tone: "warning",
      text: `RM ${input.ledgerOutstandingLabel} not collected yet`,
    });
  }
  if (input.docsMissing > 0) {
    const names = input.docsMissingLabels.slice(0, 2).join(", ");
    health.push({
      key: "documents",
      tone: "warning",
      text:
        input.docsMissing === 1
          ? `${names || "1 document"} missing`
          : `${input.docsMissing} documents missing${names ? ` — ${names}` : ""}`,
    });
  }

  return {
    stages,
    nextLabel: verb,
    nextTone: sig.next.tone,
    nextLocked: locked,
    owner,
    health: health.slice(0, 3),
  };
}

const NEXT_PILL: Record<OrderJourney["nextTone"], string> = {
  danger: "pill-overdue",
  // info actions are amber, not blue — blue is SELECTION only (UI-KIT §2).
  info: "pill-warning",
  warning: "pill-warning",
  success: "pill-confirmed",
  neutral: "pill-neutral",
};

/** The strip. Three labelled rows, read-only, no controls — clicking anything
 *  here would be a second door to work that already has one. */
export default function OrderJourneyHeader({ journey }: { journey: OrderJourney }) {
  return (
    <section
      data-testid="journey-header"
      aria-label="Order journey"
      className="shrink-0 rounded-lg border border-base-200 bg-white px-3 py-2 flex flex-col gap-1"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="t4-label shrink-0 w-[58px]">Journey</span>
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {journey.stages.map((c, i) => (
            <span key={c.stage} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-base-300 text-[11px]" aria-hidden="true">
                  ·
                </span>
              )}
              <span
                data-testid="journey-stage"
                data-stage={c.stage}
                data-state={c.state}
                className={
                  c.state === "current"
                    ? "inline-flex items-center gap-1 text-[13px] font-semibold text-foreground"
                    : c.state === "done"
                      ? "inline-flex items-center gap-1 text-[13px] font-medium text-base-600"
                      : "inline-flex items-center gap-1 text-[13px] font-normal text-base-400"
                }
              >
                {c.state === "done" && (
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                )}
                {c.state === "current" && (
                  <span
                    aria-hidden="true"
                    className="h-[6px] w-[6px] rounded-full bg-foreground"
                  />
                )}
                {c.stage}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="t4-label shrink-0 w-[58px]">Next</span>
        <span
          data-testid="journey-next"
          className={`pill ${NEXT_PILL[journey.nextTone]} shrink-0`}
        >
          {journey.nextLocked && <span aria-hidden="true">🔒 </span>}
          {journey.nextLabel}
        </span>
        <span data-testid="journey-owner" className="t4-row truncate min-w-0">
          {journey.owner}
        </span>
      </div>

      <div className="flex items-start gap-2 min-w-0">
        <span className="t4-label shrink-0 w-[58px] pt-[2px]">Health</span>
        {journey.health.length === 0 ? (
          <span data-testid="journey-health-clear" className="t4-secondary">
            Nothing blocking this order.
          </span>
        ) : (
          <div className="flex flex-col gap-[2px] min-w-0">
            {journey.health.map((h) => (
              <span
                key={h.key}
                data-testid="journey-health"
                data-key={h.key}
                data-tone={h.tone}
                className={`flex items-center gap-1 text-[13px] font-medium ${
                  h.tone === "danger" ? "text-danger" : "text-warning"
                }`}
              >
                <AlertTriangle size={12} strokeWidth={2.5} aria-hidden="true" />
                {h.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
