import { AlertTriangle, Check } from "lucide-react";

import { orderActionQueue } from "@carres/shared";

import type { OrderActionRow } from "./OrderActionList";

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
    /** The action's QUEUE word — what this module keys its maps on. */
    label: string;
    /** The row LINE, party named (`Call NETS — confirm delivery date`). The
     *  caller builds it with the SAME shared helper the Orders list uses, so
     *  the strip and the row can never spell one action two ways. Absent →
     *  the queue word is shown, which is still a legal label. */
    line?: string;
    tone: "danger" | "warning" | "info" | "success" | "neutral";
    locked?: boolean;
  };
  /** A purchase order exists for these goods — a portal PO or an imported
   *  `order_lines.source_po`. */
  hasPo: boolean;
  /** The ladder's own "ready" rule (live free stock OR the Master import's
   *  per-line ready flag). */
  goodsReady: boolean;
  /** D1/0277 — the CUSTOMER confirmed a date, not the logistics company's
   *  provisional word. Same predicate as `bookingConfirmedOf`. */
  bookingConfirmed: boolean;
  /** The order reached the customer. */
  delivered: boolean;
  /** T6/0280 photo ledger: true = on file · false = genuinely none ·
   *  null = UNKNOWN (older Worker / no overlay row). Unknown never accuses. */
  photoOnFile: boolean | null;
  /** C2 · LAYER 1 — every open action on this order, already in display order,
   *  computed by the same engine that produced `next` above. `next` is this
   *  list's first row; the drawer renders the whole list (`OrderActionList`)
   *  and this strip renders only the head, so the two cannot disagree. */
  openActions: OrderActionRow[];
  /** The money the LADDER locked on — `ops_order_control.balance` plus any
   *  uncollected storage fee, the exact inputs of its 🔒. `null` means the
   *  balance is not on file (the live case on every order today), which is why
   *  the health line must never read this as "settled". */
  holdAmount: number | null;
  /**
   * C8 — the delay this order is in, when it is in one. Absent means the
   * supplier's date does not overshoot the promise, and there is nothing to
   * decide.
   *
   * Resolved by the CALLER from the same overlay read the ladder used, so the
   * panel and the action above it can never be about two different supplier
   * dates. It is NOT a second computation of "is this order delayed?" — the
   * ladder still owns that, and the panel renders only when the ladder has
   * raised `Delay planning`.
   */
  delay?: {
    supplierEtaIso: string;
    promisedDateIso: string | null;
    decision: "keep" | "new_date" | null;
  };
}

/** The action → stage map. This is the ONE place the two surfaces are joined:
 *  the ladder picks the action, and the action picks the ● . Keyed on the
 *  QUEUE word (party-free), which is exactly what `nextActionOf` hands over.
 *  An action this map does not know (an older or newer Worker) falls through
 *  to "the first stage that is not finished", so the strip degrades instead of
 *  pointing nowhere. */
const VERB_STAGE: Record<string, JourneyStage> = {
  // P7A — both purchasing acts sit on the Purchase step: neither has secured
  // the goods, and a Draft PO moves the order forward no stage at all.
  [orderActionQueue("prepare_po")]: "Purchase",
  [orderActionQueue("issue_po")]: "Purchase",
  [orderActionQueue("confirm_ready_date")]: "Goods",
  // C8 — both delay stages sit on the Goods step: the promise is at risk
  // because the goods are, and neither stage moves the order forward a stage.
  [orderActionQueue("delay_planning")]: "Goods",
  [orderActionQueue("arrange_new_delivery_date")]: "Goods",
  [orderActionQueue("assign_logistics")]: "Booking",
  [orderActionQueue("confirm_delivery_date")]: "Booking",
  // C7 — the paper for a booked trip. Booking is finished (the customer said
  // yes); the delivery has not happened, so the ● sits exactly where the
  // `Delivering` fact sits.
  [orderActionQueue("issue_delivery_order")]: "Delivery",
  [orderActionQueue("deliver_today")]: "Delivery",
  // C3 — the FACT that replaced `Confirm delivery`. It is not an action, but it
  // IS what the ladder returns for an order waiting for its booked day, so the
  // ● has to land somewhere: Booking is finished, Delivery has not happened.
  [orderActionQueue("delivering")]: "Delivery",
  [orderActionQueue("upload_delivery_photo")]: "Done",
};

/** Who acts next, and why — keyed on the same queue word. Plain words, the
 *  party named (COPY-STANDARD rules 1/8/9): a new operator must read one line
 *  and know whether to pick up the phone, and to whom. */
const VERB_OWNER: Record<string, string> = {
  // P7A — the verb `Send` is retired, and the two acts have two owners' lines
  // because they are two different jobs: gathering the demand, then issuing the
  // document the factory receives.
  [orderActionQueue("prepare_po")]: "Operations — prepare the purchase order",
  [orderActionQueue("issue_po")]: "Operations — issue the purchase order",
  [orderActionQueue("confirm_ready_date")]: "Supplier — goods not in yet",
  // C8 — this line used to read "agree a new date with the customer", which is
  // exactly what Law 4 rung 2 forbids. Stage 1 is a decision nobody outside is
  // part of; stage 2 is a call to LOGISTICS, who carry the conversation.
  [orderActionQueue("delay_planning")]:
    "Operations — decide before anyone calls",
  [orderActionQueue("arrange_new_delivery_date")]:
    "Operations — give logistics the new date to arrange",
  [orderActionQueue("assign_logistics")]: "Operations — pick the logistics company",
  [orderActionQueue("confirm_delivery_date")]:
    "Logistics — customer has not confirmed a date",
  // C7 — one press, and it is ours: the SYSTEM writes the document, nobody
  // outside is waiting on anything.
  [orderActionQueue("issue_delivery_order")]:
    "Operations — issue the delivery order",
  [orderActionQueue("deliver_today")]: "Logistics — delivering today",
  // C3 — nobody acts before the day, and saying so is the point of retiring the
  // old `Confirm delivery`: this line used to read "everything ready, confirm"
  // over a row no button could close.
  [orderActionQueue("delivering")]: "Logistics — delivering on the confirmed day",
  [orderActionQueue("upload_delivery_photo")]: "Operations — upload the delivery photo",
  // C2 made `collect` a headline in its own right (a delivered order that still
  // owes; a delivery held on the balance). Without this it fell through to
  // "check this order", which tells an operator nothing.
  [orderActionQueue("collect")]: "Operations — collect the balance",
  [orderActionQueue("done")]: "Nobody — this order is closed",
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
  const line = sig.next.line ?? verb;
  const locked = sig.next.locked === true;

  // ── Where the order sits ────────────────────────────────────────────────
  const firstOpen = JOURNEY_STAGES.find((s) => !stageDone(s, sig)) ?? null;
  const mapped = VERB_STAGE[verb];
  // "Done" is the ladder's closed state: no stage is current.
  const closed = verb === orderActionQueue("done");
  const current: JourneyStage | null = closed ? null : (mapped ?? firstOpen);
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
  // C8 — one health line for both delay stages. It is a FACT about the goods
  // (`Stock arrives after the promised date`), and it stays a fact through the
  // decision: what changes is the ACTION beside it, not the truth about the
  // stock. Law 7 — a records surface states what it has; it never phrases the
  // gap as a second instruction.
  if (
    verb === orderActionQueue("delay_planning") ||
    verb === orderActionQueue("arrange_new_delivery_date")
  ) {
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
    nextLabel: line,
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
                <span className="text-base-300 text-label" aria-hidden="true">
                  ·
                </span>
              )}
              <span
                data-testid="journey-stage"
                data-stage={c.stage}
                data-state={c.state}
                className={
                  c.state === "current"
                    ? "inline-flex items-center gap-1 text-body font-semibold text-foreground"
                    : c.state === "done"
                      ? "inline-flex items-center gap-1 text-body font-medium text-base-600"
                      : "inline-flex items-center gap-1 text-body font-normal text-base-400"
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
                className={`flex items-center gap-1 text-body font-medium ${
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
