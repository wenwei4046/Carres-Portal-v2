/**
 * DELIVERY WORK STATUS — what an operator needs to DO about a scope, spoken
 * as WHO must act and WHAT has happened (Delivery MASTER §8.4, owner ruling
 * 2026-09-13).
 *
 * The DOCUMENT and the OPERATION keep two separate vocabularies, and neither
 * borrows the other's words:
 *
 * ```
 * Delivery Orders Register   the DOCUMENT's own life
 *                            Created · Out for delivery · Delivered ·
 *                            Delivery exception · Cancelled
 *
 * Monitor · Delivery Status  the OPERATION's progress, naming the actor
 *                            Operation must assign logistics ·
 *                            {partner} must contact the customer ·
 *                            Operation must call the customer ·
 *                            Waiting for customer reply ·
 *                            Confirmed for {weekday, date} ·
 *                            Waiting for {partner} pickup ·
 *                            Goods collected by {partner} ·
 *                            {partner} is delivering to the customer ·
 *                            Overdue · Delivered · Failed Delivery ·
 *                            Order details incomplete
 * ```
 *
 * ⛔ RETIRED on Monitor, never to return: `Waiting for customer date` ·
 * `Delivery confirmed` · `Waiting for warehouse` · `Ready for handover` ·
 * `Out for delivery` · `Created` · any bare `Waiting` that does not name who
 * must act. `Ready for handover` and `Received by logistics` survive only as
 * the recorded handover EVENT words on the DO object page.
 *
 * ── THE LADDER READS DOWNWARDS, AND THE LATEST REAL FACT WINS ───────────────
 *
 * Every rung is a FACT somebody recorded, never a guess from the calendar —
 * except `Overdue`, which is the one rung about TODAY, and it is answered only
 * when the caller hands in the day (`todayIso`); the arithmetic keeps no clock.
 *
 * ```
 * a recorded delivery                       → Delivered
 * a recorded failure or partial             → Failed Delivery
 * a required Sales fact missing on the row  → Order details incomplete
 * confirmed day passed, no result           → Overdue
 * the partner's receipt + a departure/ETA   → {partner} is delivering to the customer
 * the partner's receipt is recorded         → Goods collected by {partner}
 * a live document exists                    → Waiting for {partner} pickup
 * a day AND a window are recorded           → Confirmed for {weekday, date}
 * no partner on the scope                   → Operation must assign logistics
 * latest contact is waiting for a reply     → Waiting for customer reply
 * the partner contacts the customer         → {partner} must contact the customer
 * Carres contacts the customer              → Operation must call the customer
 * ```
 *
 * A cancelled document drops the scope off the workspace entirely, so there is
 * no operational word for it.
 *
 * ── THE ENGINE SPELLS NO DATES ──────────────────────────────────────────────
 *
 * The Year Rule (owner ruling 2026-08-15) gives the portal ONE date spelling,
 * and it lives in the web's `fmtDate`. This module therefore takes a SPELLER
 * from its caller and never formats a day, a time or a timestamp itself — the
 * words are decided here, the spelling is decided in the one home.
 *
 * PURE: no clock, no I/O.
 */

import type { DeliveryHandoverKind, DeliveryOrderAttemptFact } from "./delivery-order-status";
import { deliveryReasonByKey } from "./delivery-reasons";
import type { ProofReviewState } from "./delivery-proof";

export type DeliveryWorkStatusKind =
  | "assign_logistics"
  | "partner_must_contact"
  | "operation_must_call"
  /* The DAY is agreed and the WINDOW is not: a different call with a
     different question, and the row says which one (owner ruling
     2026-09-14). */
  | "confirm_time"
  | "waiting_customer_reply"
  | "confirmed"
  | "waiting_pickup"
  | "collected"
  | "delivering"
  | "overdue"
  | "arrived"
  | "delivered"
  | "failed"
  | "details_incomplete";

/** The ladder's own order — the `DELIVERY STATUS` dropdown lists it as is.
 *  `arrived` (【DELIVERY】 CARD 20): an intermediate Journey leg whose goods
 *  reached the named partner warehouse — never the customer's `Delivered`. */
export const DELIVERY_WORK_STATUS_KINDS: readonly DeliveryWorkStatusKind[] = [
  "assign_logistics",
  "partner_must_contact",
  "operation_must_call",
  "waiting_customer_reply",
  /* AFTER the wait, because a window is asked for only once a day is
     agreed — the ladder is the order the work actually happens in. */
  "confirm_time",
  "confirmed",
  "waiting_pickup",
  "collected",
  "delivering",
  "overdue",
  "arrived",
  "delivered",
  "failed",
  "details_incomplete",
];

/**
 * Text colour, never an icon (owner ruling 2026-09-13): green for a settled
 * good fact, orange for a specific fact that needs an act and is not yet late,
 * red for `Overdue` and `Failed Delivery`, none for the goods moving normally.
 */
export type DeliveryWorkStatusTone = "green" | "orange" | "red" | "none";

export const DELIVERY_WORK_STATUS_TONE: Record<DeliveryWorkStatusKind, DeliveryWorkStatusTone> = {
  assign_logistics: "orange",
  partner_must_contact: "orange",
  operation_must_call: "orange",
  confirm_time: "orange",
  waiting_customer_reply: "orange",
  confirmed: "green",
  waiting_pickup: "none",
  collected: "none",
  delivering: "none",
  overdue: "red",
  arrived: "green",
  delivered: "green",
  failed: "red",
  details_incomplete: "orange",
};

/** The role word where the data names no partner — the same fallback the
 *  action lines use (`Call logistics`), never an empty gap. */
export const LOGISTICS_ROLE_WORD = "logistics";

/**
 * ⭐ THE ONLY SPELLINGS of line one. COPY-STANDARD owns these words; nothing
 * may print a synonym beside them. The partner's real name comes from the
 * data; the role word stands in only where no name exists.
 */
export function deliveryWorkStatusLabelOf(
  kind: DeliveryWorkStatusKind,
  partnerName: string | null | undefined,
  confirmedDay?: string | null,
): string {
  const partner = (partnerName ?? "").trim() || LOGISTICS_ROLE_WORD;
  const cap = partner === LOGISTICS_ROLE_WORD ? "Logistics" : partner;
  switch (kind) {
    case "assign_logistics":
      return "Operation must assign logistics";
    /* ⭐ THE ACT, NOT THE ACTOR (owner ruling 2026-09-14). `NETS must contact
       the customer` spent the whole column naming a party the `Logistics`
       column already carries, and buried the one word that says what to do.
       Who calls is a Delivery Settings fact and stays in its own field; the
       status says the JOB. Both contact rungs print the same act because the
       operator's job is the same act — the rungs differ only in who owns it. */
    case "partner_must_contact":
    case "operation_must_call":
      return "Call customer";
    /* The day is agreed; only the window is missing. Sending the operator to
       `Call customer` re-opens a question the customer already answered. */
    case "confirm_time":
      return "Confirm delivery time";
    case "waiting_customer_reply":
      return "Waiting for customer reply";
    case "confirmed":
      return confirmedDay ? `Confirmed for ${confirmedDay}` : "Confirmed";
    case "waiting_pickup":
      return `Waiting for ${partner} pickup`;
    case "collected":
      return `Goods collected by ${partner}`;
    case "delivering":
      return `${cap} is delivering to the customer`;
    case "overdue":
      return "Overdue";
    case "arrived":
      return "Arrived";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed Delivery";
    case "details_incomplete":
      return "Order details incomplete";
  }
}

/** The caller's spelling of a day, a window and a timestamp — the web hands
 *  in `fmtDate`; a test hands in whatever it likes. */
export interface DeliveryStatusSpell {
  /** `2026-10-22` → `Thu, 22 Oct` */
  date: (iso: string) => string;
  /** A recorded timestamp → `Thu, 22 Oct 14:30` */
  dateTime: (iso: string) => string;
  /** A stored window or clock time → the words on screen. Identity by default. */
  time?: (value: string) => string;
}

export interface DeliveryWorkStatus {
  kind: DeliveryWorkStatusKind;
  /** Line one — the actor and the fact. */
  label: string;
  tone: DeliveryWorkStatusTone;
  /** Line two — the date, window, deadline, ETA, proof state or reason; null
   *  when the fact needs no second line. */
  second: string | null;
  /** Line two spends a colour only for a proof gap (orange) or a contact
   *  deadline that has passed (red). */
  secondTone: "orange" | "red" | null;
  /** A failure's ONE reason, in the reason library's own words. */
  reasonLabel: string | null;
}

export interface DeliveryWorkStatusInput {
  /** The scope's Logistics Partner, by name. null = nobody carries it yet. */
  partnerName: string | null;
  /** Who arranges the day with the customer. The partner unless the record
   *  says Carres does (Delivery Settings, Card 12). */
  contactBy?: "partner" | "operation";
  /** The latest customer-contact record on the scope (Card 11); null until one
   *  exists. */
  latestContact?: { result: "waiting_customer_reply" | "answered"; recordedOn: string } | null;
  /** Delivery's own agreed operational date for this scope. */
  confirmedDate: string | null;
  /** The agreed window. A day without one is still contact work. */
  confirmedTime?: string | null;
  /** Whether a live (non-void) Delivery Order exists for this scope. */
  hasDeliveryOrder: boolean;
  /** The §4 handover facts recorded on that document (0363), with their
   *  clock where the reader carries it. */
  handoverEvents: ReadonlyArray<{ kind: DeliveryHandoverKind; recordedAt?: string | null }>;
  /** The day Warehouse scheduled the handover for, when it recorded one. */
  handoverDate?: string | null;
  /** The partner's recorded ETA (a clock time), when it recorded one. */
  expectedArrival?: string | null;
  /** The delivery attempts recorded against the document (0344). */
  attempts: ReadonlyArray<DeliveryOrderAttemptFact>;
  /** Today, for the one rung about the calendar. Absent = never `Overdue`. */
  todayIso?: string | null;
  /** The proof a delivered result carries — the register's own arithmetic,
   *  and Operation's review of it (§6.1, 0489). `Proof Accepted` is the ONE
   *  fact that turns `Delivered` green; until then the word stays orange. */
  proof?: {
    photoUploaded: boolean | null;
    signedDoUploaded: boolean | null;
    acceptedOn: string | null;
    review?: { state: ProofReviewState; reason: string | null } | null;
  } | null;
  /** Required Sales facts this row lacks, in the operator's words. */
  missingFacts?: ReadonlyArray<string>;
  /** 0491 — this scope is a Journey leg BEFORE the last one: its `delivered`
   *  result is an ARRIVAL at the named partner warehouse (`Arrived`), the
   *  customer leg still owes its own result, and no delivery proof is owed
   *  here. Absent = a whole-order scope or the customer leg. */
  intermediateLeg?: boolean;
  /** The intermediate leg's named stop — line two of `Arrived`. */
  legStop?: string | null;
}

/**
 * ONE arithmetic (Architecture Law D). The column, the rail dropdown, the
 * calendar card and every report call this — a second copy is how two
 * surfaces start disagreeing about whether a truck went out.
 */
export function deliveryWorkStatusOf(
  input: DeliveryWorkStatusInput,
  spell: DeliveryStatusSpell,
): DeliveryWorkStatus {
  const time = spell.time ?? ((v: string) => v);
  const partner = input.partnerName;
  const say = (
    kind: DeliveryWorkStatusKind,
    second: string | null = null,
    extra: {
      secondTone?: "orange" | "red" | null;
      reasonLabel?: string | null;
      day?: string | null;
      tone?: DeliveryWorkStatusTone;
    } = {},
  ): DeliveryWorkStatus => ({
    kind,
    label: deliveryWorkStatusLabelOf(kind, partner, extra.day ?? null),
    tone: extra.tone ?? DELIVERY_WORK_STATUS_TONE[kind],
    second,
    secondTone: extra.secondTone ?? null,
    reasonLabel: extra.reasonLabel ?? null,
  });

  /* A RECORDED RESULT OUTRANKS EVERY DERIVATION — the DO model's own rule, and
     it holds here for the same reason: somebody was there. */
  const latest = [...input.attempts].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[
    input.attempts.length - 1
  ];
  if (latest) {
    if (latest.result === "delivered") {
      /* An intermediate leg's success is the goods reaching the named partner
         warehouse — `Arrived` over the stop, green, no proof owed here; the
         customer leg carries `Delivered` and its proof (Card 20). */
      if (input.intermediateLeg) return say("arrived", input.legStop?.trim() || null);
      const proof = input.proof;
      const review = proof?.review ?? null;
      /* `Proof Accepted` is the fact that turns `Delivered` green everywhere
         (§6.1). Every other delivered row is orange: a specific act is owed. */
      if (proof?.acceptedOn) return say("delivered", `Proof accepted ${spell.date(proof.acceptedOn)}`);
      const owed = { tone: "orange" as const, secondTone: "orange" as const };
      if (review?.state === "rejected" || review?.state === "more_required") {
        const word = review.state === "rejected" ? "Proof Rejected" : "More Proof Required";
        return say("delivered", review.reason ? `${word} · ${review.reason}` : word, owed);
      }
      if (proof && proof.photoUploaded === false) {
        return say("delivered", "Delivery photo not uploaded", owed);
      }
      if (proof && proof.signedDoUploaded === false) {
        return say("delivered", "Upload signed Delivery Order", owed);
      }
      if (review?.state === "pending") return say("delivered", "Check delivery proof", owed);
      return say("delivered", null, { tone: "orange" });
    }
    /* `partial` and `failed` are both ONE Failed Delivery carrying ONE reason
       (§7's rule) — never a family of failure words. */
    const reason = deliveryReasonByKey(latest.reasonKey)?.label ?? null;
    return say("failed", reason, { reasonLabel: reason });
  }

  /* A row Sales left incomplete is a DATA problem, and the row says so before
     it says anything about the trip (§8.3: `Open Sales Order to change`). */
  const missing = input.missingFacts ?? [];
  if (missing.length > 0) return say("details_incomplete", missing[0] ?? null);

  /* The one rung about today: a confirmed day behind us with nothing recorded.
     It outranks the transit rungs — goods still on the road past the agreed
     day are exactly what the operator must ask about. */
  if (input.todayIso && input.confirmedDate && input.confirmedDate < input.todayIso) {
    const who = (partner ?? "").trim() || "Logistics";
    return say("overdue", `${who} must record the result`);
  }

  const events = input.handoverEvents;
  const receipt = events.find((e) => e.kind === "received_by_logistics");
  /* Only the LOGISTICS RECEIPT takes goods out of the warehouse (0363 slice
     1). Handed Over without a receipt is the warehouse's half of a handshake
     nobody has answered, so the scope is still waiting for the pickup. */
  if (receipt) {
    if (input.expectedArrival) return say("delivering", `ETA ${time(input.expectedArrival)}`);
    return say("collected", receipt.recordedAt ? `Collected ${spell.dateTime(receipt.recordedAt)}` : null);
  }

  /* The document exists and the partner has not collected: the job is the
     partner's pickup, and the line names that partner. */
  if (input.hasDeliveryOrder) {
    return say(
      "waiting_pickup",
      input.handoverDate ? `Handover ${spell.date(input.handoverDate)}` : null,
    );
  }

  /* A booking is a DAY and a WINDOW (owner ruling 2026-09-11). A day alone
     leaves the conversation open, and the row stays contact work below. */
  if (input.confirmedDate && input.confirmedTime) {
    return say("confirmed", time(input.confirmedTime), { day: spell.date(input.confirmedDate) });
  }

  if (!partner) return say("assign_logistics");

  if (input.latestContact?.result === "waiting_customer_reply") {
    return say("waiting_customer_reply", `Asked ${spell.date(input.latestContact.recordedOn)}`);
  }

  /* ⭐ THE CONTACT DEADLINE IS NO LONGER A SENTENCE ON LINE TWO (owner ruling
     2026-09-14). `Call by {date}` repeated the verb the status word above it
     has just said. The DAY is the fact; the surface draws it with the kit's
     phone glyph, or the kit's late glyph in red once it has passed, and the
     whole sentence lives in the tooltip and the accessible name. The status
     therefore returns NO second line here: `contactDueIso` on the row is the
     one place the deadline is read from, and it is read ONCE. */
  /* The day is agreed and the window is not — a different question. */
  if (input.confirmedDate) return say("confirm_time");
  if (input.contactBy === "operation") return say("operation_must_call");
  return say("partner_must_contact");
}

/** The same recorded ladder, without data gaps or the clock replacing the
 * journey fact. Work queues still use deliveryWorkStatusOf unchanged. */
export function deliveryJourneyProgressOf(
  input: DeliveryWorkStatusInput,
  spell: DeliveryStatusSpell,
): DeliveryWorkStatus {
  return deliveryJourneyProgressFromStatus(
    deliveryWorkStatusOf({ ...input, missingFacts: [], todayIso: null }, spell),
    input,
  );
}

/** Shared copy for a recorded journey rung, including legacy stop records.
 * This translates a fact; it never infers movement from a planned date. */
export function deliveryJourneyProgressFromStatus(
  status: DeliveryWorkStatus,
  context: Pick<DeliveryWorkStatusInput, "partnerName" | "intermediateLeg" | "legStop">,
): DeliveryWorkStatus {
  const transfer = Boolean(context.intermediateLeg);
  const stop = context.legStop?.trim();
  const partner = context.partnerName?.trim() || LOGISTICS_ROLE_WORD;
  let label = status.label;
  switch (status.kind) {
    case "confirmed": label = transfer ? "Transfer confirmed" : "Confirmed"; break;
    case "collected": label = transfer ? "Collected for transfer" : `Collected by ${partner}`; break;
    // With no named stop, retain the recorded collection fact instead of
    // inventing a destination. The recorded ETA remains in supporting detail.
    case "delivering": label = transfer ? (stop ? `In transit to ${stop}` : "Collected for transfer") : "On the way to customer"; break;
    case "arrived": label = stop ? `Arrived at ${stop}` : "Arrived"; break;
    case "delivered": label = transfer ? (stop ? `Arrived at ${stop}` : "Arrived") : "Delivered to customer"; break;
    case "failed": label = transfer ? "Transfer failed" : "Failed Delivery"; break;
  }
  return {
    ...status,
    label,
    tone: transfer && status.kind === "confirmed" ? "none" : status.tone,
    // The stop is already in the progress label and route; it is not a blocker.
    second: status.kind === "arrived" ? null : status.second,
  };
}
