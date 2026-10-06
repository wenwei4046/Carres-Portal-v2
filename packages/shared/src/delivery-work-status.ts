/**
 * DELIVERY WORK STATUS — the OPERATION's progress on one delivery, in the
 * words of Delivery MASTER §8.4 (owner rulings 2026-09-13 · 2026-09-14 ·
 * 2026-09-24 · 2026-09-25).
 *
 * ⭐ ONE FUNCTION PRINTS THE WORDS (owner ruling 2026-09-25, Delivery segment
 * 1). The Monitor register column, the `DELIVERY STATUS` dropdown, the
 * schedule card, the phone card, the Order Route's DELIVER node and every
 * report read `deliveryWorkStatusOf` and its ONE label function
 * `deliveryWorkStatusLabelOf`. A second label function is a Law D defect, not
 * a variation: on 2026-09-25 the register printed one spelling while the card
 * printed another, through two functions over the same facts.
 *
 * The DOCUMENT and the OPERATION keep two separate vocabularies, and neither
 * borrows the other's words:
 *
 * ```
 * Delivery Orders register   the DOCUMENT's own life (delivery-order-status.ts)
 * Monitor · Delivery Status  the OPERATION's progress (this file)
 *
 *   before the arrangement     Assign logistics · Get delivery date from {partner} ·
 *                              Get delivery date from customer · Waiting for customer reply
 *   customer leg               Scheduled · Waiting for {partner} pickup · Collected by {partner} ·
 *                              On the way to customer · Delivered to customer · Failed Delivery
 *   transfer leg               Transfer scheduled · Waiting for {partner} pickup ·
 *                              Collected for transfer · In transit to {stop} ·
 *                              Arrived at {stop} · Transfer failed
 *   across both                Overdue · Order details incomplete
 * ```
 *
 * The two journey ladders share no word: a warehouse leg can never reach
 * `Delivered to customer`, and `Arrived at {stop}` never claims a customer
 * received anything. `Arrived at customer` does not exist (no such fact is
 * recorded) and may not be inferred.
 *
 * ── THE LADDER READS DOWNWARDS, AND THE LATEST REAL FACT WINS ───────────────
 *
 * Every rung is a FACT somebody recorded, never a guess from the calendar —
 * except `Overdue`, which is the one rung about TODAY, and it is answered only
 * when the caller hands in the day (`todayIso`); the arithmetic keeps no clock.
 *
 * ```
 * a recorded result                         → Delivered to customer · Arrived at {stop}
 *                                              · Failed Delivery · Transfer failed
 * a required Sales fact missing on the row  → Order details incomplete
 * scheduled day passed, no result           → Overdue
 * the partner's receipt + a departure/ETA   → On the way to customer · In transit to {stop}
 * the partner's receipt is recorded         → Collected by {partner} · Collected for transfer
 * a live document exists                    → Waiting for {partner} pickup
 * a scheduled date (time optional)          → Scheduled · Transfer scheduled
 * no partner on the scope                   → Assign logistics
 * latest contact is waiting for a reply     → Waiting for customer reply
 * the partner contacts the customer         → Get delivery date from {partner}
 * Carres contacts the customer              → Get delivery date from customer
 * ```
 *
 * A day without a time is a COMPLETE arrangement (owner ruling 2026-09-24):
 * no rung asks for a time.
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
  /* `Get delivery date from {partner}` — the partner contacts the customer. */
  | "partner_must_contact"
  /* `Get delivery date from customer` — the one Carres-contacts case. */
  | "operation_must_call"
  | "waiting_customer_reply"
  /* `Scheduled` — the customer leg. The key keeps its 2026-09-14 spelling so
     a stored `?status=confirmed` URL still resolves; the screen never prints
     a key. */
  | "confirmed"
  | "transfer_scheduled"
  | "waiting_pickup"
  | "collected"
  | "collected_for_transfer"
  | "delivering"
  | "in_transit"
  | "overdue"
  | "arrived"
  | "delivered"
  | "failed"
  | "transfer_failed"
  | "details_incomplete";

/** The ladder's own order — the `DELIVERY STATUS` dropdown lists it as is,
 *  one option per printed word. `arrived` sits before `delivered`. */
export const DELIVERY_WORK_STATUS_KINDS: readonly DeliveryWorkStatusKind[] = [
  "assign_logistics",
  "partner_must_contact",
  "operation_must_call",
  "waiting_customer_reply",
  "confirmed",
  "transfer_scheduled",
  "waiting_pickup",
  "collected",
  "collected_for_transfer",
  "delivering",
  "in_transit",
  "overdue",
  "arrived",
  "delivered",
  "failed",
  "transfer_failed",
  "details_incomplete",
];

/**
 * Text colour, never an icon (owner ruling 2026-09-13): green for a settled
 * good fact, orange for a specific fact that needs an act and is not yet late,
 * red for `Overdue` and a failure, none for the goods moving normally and for
 * a transfer's schedule (a transfer is never a customer appointment).
 */
export type DeliveryWorkStatusTone = "green" | "orange" | "red" | "none";

export const DELIVERY_WORK_STATUS_TONE: Record<DeliveryWorkStatusKind, DeliveryWorkStatusTone> = {
  assign_logistics: "orange",
  partner_must_contact: "orange",
  operation_must_call: "orange",
  waiting_customer_reply: "orange",
  confirmed: "green",
  transfer_scheduled: "none",
  waiting_pickup: "none",
  collected: "none",
  collected_for_transfer: "none",
  delivering: "none",
  in_transit: "none",
  overdue: "red",
  arrived: "green",
  delivered: "green",
  failed: "red",
  transfer_failed: "red",
  details_incomplete: "orange",
};

/** The role word where the data names no partner — never an empty gap. */
export const LOGISTICS_ROLE_WORD = "logistics";
/** The role word where an intermediate leg names no stop. An intermediate leg
 *  ends at a partner warehouse by definition (Delivery MASTER §8.4, Card 20);
 *  the customer's town is never substituted for it. */
export const TRANSFER_STOP_ROLE_WORD = "warehouse";

/** The real names the words carry. Absent → the role words above. */
export interface DeliveryStatusWords {
  partner?: string | null;
  stop?: string | null;
}

/**
 * ⭐ THE ONLY SPELLINGS of line one (COPY-STANDARD, Delivery MASTER §8.4).
 * Nothing else may print a synonym beside them. The partner's real name and
 * the transfer's stop come from the data; the role words stand in only where
 * no name exists (the `DELIVERY STATUS` dropdown's options are exactly that).
 */
export function deliveryWorkStatusLabelOf(
  kind: DeliveryWorkStatusKind,
  words: DeliveryStatusWords = {},
): string {
  const partner = (words.partner ?? "").trim() || LOGISTICS_ROLE_WORD;
  const stop = (words.stop ?? "").trim() || TRANSFER_STOP_ROLE_WORD;
  switch (kind) {
    case "assign_logistics":
      return "Assign logistics";
    case "partner_must_contact":
      return `Get delivery date from ${partner}`;
    case "operation_must_call":
      return "Get delivery date from customer";
    case "waiting_customer_reply":
      return "Waiting for customer reply";
    case "confirmed":
      return "Scheduled";
    case "transfer_scheduled":
      return "Transfer scheduled";
    case "waiting_pickup":
      return `Waiting for ${partner} pickup`;
    case "collected":
      return `Collected by ${partner}`;
    case "collected_for_transfer":
      return "Collected for transfer";
    case "delivering":
      return "On the way to customer";
    case "in_transit":
      return `In transit to ${stop}`;
    case "overdue":
      return "Overdue";
    case "arrived":
      return `Arrived at ${stop}`;
    case "delivered":
      return "Delivered to customer";
    case "failed":
      return "Failed Delivery";
    case "transfer_failed":
      return "Transfer failed";
    case "details_incomplete":
      return "Order details incomplete";
  }
}

/** `Ask {partner} for the result` — line two of `Overdue`. */
export function askForResultLine(partnerName: string | null | undefined): string {
  return `Ask ${(partnerName ?? "").trim() || LOGISTICS_ROLE_WORD} for the result`;
}

/** A recorded result: the trip has run, nothing is left to arrange. */
export function deliveryResultRecorded(kind: DeliveryWorkStatusKind): boolean {
  return kind === "arrived" || kind === "delivered" || kind === "failed" || kind === "transfer_failed";
}

/** A recorded failure on either ladder — the `Failed Delivery` queue. */
export function deliveryFailed(kind: DeliveryWorkStatusKind): boolean {
  return kind === "failed" || kind === "transfer_failed";
}

/** The goods have left the warehouse (the partner's receipt, or a result). */
export function deliveryGoodsMoved(kind: DeliveryWorkStatusKind): boolean {
  return (
    kind === "collected" ||
    kind === "collected_for_transfer" ||
    kind === "delivering" ||
    kind === "in_transit" ||
    deliveryResultRecorded(kind)
  );
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
  /** Line one — the act or the fact. */
  label: string;
  tone: DeliveryWorkStatusTone;
  /** Line two — the time, ETA, proof state, reason or missing fact; null when
   *  the fact needs no second line. A contact deadline is never here: the
   *  surface draws it from the row's own `contactDueIso`, once. */
  second: string | null;
  /** Line two spends a colour only for a proof gap (orange). */
  secondTone: "orange" | "red" | null;
  /** A failure's ONE reason, in the reason library's own words. */
  reasonLabel: string | null;
}

export interface DeliveryWorkStatusInput {
  /** The scope's Logistics company, by name. null = nobody carries it yet. */
  partnerName: string | null;
  /** Who arranges the day with the customer. The partner unless the record
   *  says Carres does (Delivery Settings, Card 12). */
  contactBy?: "partner" | "operation";
  /** The latest customer-contact record on the scope (Card 11); null until one
   *  exists. */
  latestContact?: { result: "waiting_customer_reply" | "answered"; recordedOn: string } | null;
  /** Delivery's scheduled operational date for this scope. */
  confirmedDate: string | null;
  /** The scheduled time, optional — it prints when recorded. */
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
   *  fact that turns `Delivered to customer` green; until then it is orange. */
  proof?: {
    photoUploaded: boolean | null;
    signedDoUploaded: boolean | null;
    acceptedOn: string | null;
    review?: { state: ProofReviewState; reason: string | null } | null;
  } | null;
  /** Required Sales facts this row lacks, in the operator's words. */
  missingFacts?: ReadonlyArray<string>;
  /** 0491 — this scope is a Journey leg BEFORE the last one: a TRANSFER. Its
   *  words are the transfer ladder's, its `delivered` result is an ARRIVAL at
   *  the named partner warehouse, and no delivery proof is owed here. Absent =
   *  a whole-order scope or the customer leg. */
  intermediateLeg?: boolean;
  /** The intermediate leg's named stop — `In transit to` / `Arrived at`. */
  legStop?: string | null;
}

/**
 * ONE arithmetic (Architecture Law D). The column, the rail dropdown, the
 * calendar card, the phone card, the Order Route and every report call this —
 * a second copy is how two surfaces start disagreeing about whether a truck
 * went out.
 */
export function deliveryWorkStatusOf(
  input: DeliveryWorkStatusInput,
  spell: DeliveryStatusSpell,
): DeliveryWorkStatus {
  const time = spell.time ?? ((v: string) => v);
  const partner = input.partnerName;
  const transfer = Boolean(input.intermediateLeg);
  const words: DeliveryStatusWords = { partner, stop: input.legStop };
  const say = (
    kind: DeliveryWorkStatusKind,
    second: string | null = null,
    extra: {
      secondTone?: "orange" | "red" | null;
      reasonLabel?: string | null;
      tone?: DeliveryWorkStatusTone;
    } = {},
  ): DeliveryWorkStatus => ({
    kind,
    label: deliveryWorkStatusLabelOf(kind, words),
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
         warehouse — `Arrived at {stop}`, green, no proof owed here; the stop
         is already on line one. The customer leg carries its proof (Card 20). */
      if (transfer) return say("arrived");
      const proof = input.proof;
      const review = proof?.review ?? null;
      /* `Proof Accepted` is the fact that turns the result green everywhere
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
    /* `partial` and `failed` are both ONE failure carrying ONE reason (§7's
       rule) — never a family of failure words. A transfer fails as a transfer. */
    const reason = deliveryReasonByKey(latest.reasonKey)?.label ?? null;
    return say(transfer ? "transfer_failed" : "failed", reason, { reasonLabel: reason });
  }

  /* A row Sales left incomplete is a DATA problem, and the row says so before
     it says anything about the trip. Line two names the MISSING FACT (owner
     ruling 2026-09-25); the contact deadline, when owed, is the cell's title
     and accessible name, never this line. */
  const missing = input.missingFacts ?? [];
  if (missing.length > 0) return say("details_incomplete", missing[0] ?? null);

  /* The one rung about today: a scheduled day behind us with nothing recorded.
     It outranks the transit rungs — goods still on the road past the agreed
     day are exactly what the operator must ask about. */
  if (input.todayIso && input.confirmedDate && input.confirmedDate < input.todayIso) {
    return say("overdue", askForResultLine(partner));
  }

  const receipt = input.handoverEvents.find((e) => e.kind === "received_by_logistics");
  /* Only the LOGISTICS RECEIPT takes goods out of the warehouse (0363 slice
     1). Handed Over without a receipt is the warehouse's half of a handshake
     nobody has answered, so the scope is still waiting for the pickup. */
  if (receipt) {
    if (input.expectedArrival) {
      return say(transfer ? "in_transit" : "delivering", `ETA ${time(input.expectedArrival)}`);
    }
    return say(
      transfer ? "collected_for_transfer" : "collected",
      receipt.recordedAt ? `Collected ${spell.dateTime(receipt.recordedAt)}` : null,
    );
  }

  /* The document exists and the partner has not collected: the job is the
     partner's pickup, and the line names that partner. */
  if (input.hasDeliveryOrder) {
    return say(
      "waiting_pickup",
      input.handoverDate ? `Handover ${spell.date(input.handoverDate)}` : null,
    );
  }

  /* A SCHEDULED DATE COMPLETES THE ARRANGEMENT (owner ruling 2026-09-24). The
     time is optional: it prints when recorded, and its absence is never
     contact work. The day itself is the `Scheduled delivery` column's. */
  if (input.confirmedDate) {
    return say(transfer ? "transfer_scheduled" : "confirmed", input.confirmedTime ? time(input.confirmedTime) : null);
  }

  if (!partner?.trim()) return say("assign_logistics");

  if (input.latestContact?.result === "waiting_customer_reply") {
    return say("waiting_customer_reply", `Asked ${spell.date(input.latestContact.recordedOn)}`);
  }

  /* ⭐ THE CONTACT DEADLINE IS NOT A SENTENCE ON LINE TWO (owner ruling
     2026-09-14). The DAY is the fact; the surface draws it with the kit's
     phone glyph, or the kit's late glyph in red once it has passed, from the
     row's own `contactDueIso` — read ONCE. */
  if (input.contactBy === "operation") return say("operation_must_call");
  return say("partner_must_contact");
}

/** The same recorded ladder with the two overlays — a data gap and the clock
 *  — removed, so a calendar card keeps the journey fact (`Collected by NETS`)
 *  while the Work queues keep `Order details incomplete` and `Overdue`. ONE
 *  function, ONE label function: this only changes what is handed in. */
export function deliveryJourneyProgressOf(
  input: DeliveryWorkStatusInput,
  spell: DeliveryStatusSpell,
): DeliveryWorkStatus {
  return deliveryWorkStatusOf({ ...input, missingFacts: [], todayIso: null }, spell);
}
