/**
 * THE CUSTOMER CARD — the Work right panel's Customer party card.
 * Owner approval 2026-09-25 + OWNER CORRECTION 2026-09-25
 * (docs/workspace/MASTER.md §5.10 "Customer card").
 *
 * The assigned Logistics company contacts the customer and agrees the date.
 * This card is NOT a routine Carres calling queue and never a second
 * scheduling workflow: during normal partner scheduling it is read-only and
 * carries no Carres action. Carres acts only on four source exceptions:
 *
 *   1. Sales Orders knows the goods will be late (`delay_planning` /
 *      `arrange_new_delivery_date` open) → `Tell the customer the new date`
 *      through the Sales Order;
 *   2. Logistics recorded `Requested Another Date` → `Decide the next step for
 *      this delivery` in Delivery;
 *   3. Logistics recorded `Customer Refused Delivery` → the same, in Delivery;
 *   4. Logistics recorded `Contact Details Incorrect` → `Correct the phone
 *      number` in the Sales Order.
 *
 * PURE — no clock, no I/O. Every input is its owner's stored fact; the
 * contact deadline is the Logistics card's `2 working days before` check.
 */
import type { DeliveryContactChannelKey, DeliveryContactPurposeKey, DeliveryContactResultKey } from "./delivery-contact";
import type { LogisticsCheckState } from "./logistics-card";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const CUSTOMER_CARD_COPY = {
  heading: "Customer",
  partnerContacts: (company: string, date: string | null) =>
    date ? `${company} contacts the customer · by ${date}` : `${company} contacts the customer`,
  partnerAct: (company: string) => `${company} contacts the customer.`,
  notAssigned: "Logistics not assigned",
  scheduled: (date: string) => `Scheduled ${date}`,
  delivered: (date: string) => `Delivered · ${date}`,
  anotherDate: (date: string | null) => (date ? `Customer requested another date · ${date}` : "Customer requested another date"),
  refused: "Customer refused delivery",
  phoneWrong: "Phone number is wrong",
  delayed: "Delivery delayed · customer notice required",
  /* the exception acts */
  tellNewDate: "Tell the customer the new date",
  decideNext: "Decide the next step for this delivery",
  correctPhone: "Correct the phone number",
  customerAsked: (date: string) => `The customer asked for ${date}`,
  /* sections */
  sectionAction: "Current action",
  sectionDelivery: "Delivery",
  sectionPartner: "Partner contact",
  sectionException: "Exception",
  sectionHistory: "Evidence and communication history",
  contactBy: "Contact by",
  latestResult: "Latest result",
  noContacts: "No contact recorded yet",
  noPhone: "No phone recorded",
  noEmail: "No email recorded",
  unavailable: "Customer contact unavailable",
  openSalesOrder: "Open Sales Order",
  openInDelivery: "Open in Delivery",
} as const;

/** The history words for a stored contact result (screen only). */
export const CUSTOMER_RESULT_WORD: Record<DeliveryContactResultKey, string> = {
  confirmed: "Confirmed",
  no_answer: "No answer",
  asked_to_call_again: "Asked to call again",
  requested_another_date: "Requested another date",
  contact_details_incorrect: "Phone number is wrong",
  customer_refused_delivery: "Customer refused delivery",
  waiting_for_customer_reply: "Waiting for customer reply",
};

/** The Carres business day (Asia/Kuala_Lumpur, UTC+8, no daylight saving) of
 *  a timestamp. `07:30 MYT Fri 23 Oct` is stored `2026-10-22T23:30:00Z`; its
 *  day is the 23rd, never the 22nd a bare slice would give. */
export function mytDayOf(iso: string): string {
  if (ISO.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
}

export interface CustomerContactFact {
  /** `contacted_at` — an ISO timestamp. */
  atIso: string;
  purpose: DeliveryContactPurposeKey;
  channel: DeliveryContactChannelKey;
  result: DeliveryContactResultKey;
  /** Who was contacted — the partner's own contact records are the normal path. */
  person: "customer" | "partner";
  evidencePath: string | null;
  note: string | null;
  /** The recorder's name, already resolved; evidence only. */
  by: string | null;
}

export type PartyTone = "done" | "current" | "attention" | "missed" | "future" | "neutral";

export interface PartyAction {
  act: string;
  result: string;
  dueIso: string | null;
  timing: "ahead" | "today" | "missed" | "no_date";
  door: "sales_order" | "delivery";
}

export type CustomerExceptionKey = "delayed" | "another_date" | "refused" | "phone_wrong";

export interface CustomerCardInput {
  todayIso: string;
  companyName: string | null;
  requestedIso: string | null;
  scheduledIso: string | null;
  deliveredIso: string | null;
  /** The Logistics card's `2 working days before` check — the partner's deadline. */
  contactCheck: { dueIso: string | null; state: LogisticsCheckState };
  /** This delivery's contact records (0487), partner and customer alike. */
  contacts: ReadonlyArray<CustomerContactFact>;
  /** Logistics' own answer through its portal/link (0581), when newer than the schedule. */
  partnerAnswer: { kind: "another_date" | "cannot_deliver"; proposedIso: string | null; atIso: string } | null;
  /** Sales Orders' action engine has `delay_planning` / `arrange_new_delivery_date` open. */
  delayNoticeRequired: boolean;
  settled: boolean;
  spell: (iso: string) => string;
}

export interface CustomerCardModel {
  status: { text: string; tone: PartyTone };
  /** Null during normal partner scheduling — no Carres button (owner correction). */
  action: PartyAction | null;
  exception: { key: CustomerExceptionKey; fact: string } | null;
  latest: CustomerContactFact | null;
  history: CustomerContactFact[];
}

function timingOf(dueIso: string | null, todayIso: string): PartyAction["timing"] {
  if (!dueIso) return "no_date";
  if (dueIso < todayIso) return "missed";
  if (dueIso === todayIso) return "today";
  return "ahead";
}

export function customerCardModel(input: CustomerCardInput): CustomerCardModel {
  const today = input.todayIso.slice(0, 10);
  const spell = input.spell;
  const valid = (iso: string | null) => (iso && ISO.test(iso.slice(0, 10)) ? iso.slice(0, 10) : null);
  const scheduled = valid(input.scheduledIso);
  const delivered = valid(input.deliveredIso);
  const company = input.companyName?.trim() || null;
  const due = valid(input.contactCheck.dueIso);

  const history = [...input.contacts].sort((a, b) => b.atIso.localeCompare(a.atIso));
  const latest = history[0] ?? null;
  const latestAt = latest ? latest.atIso : "";
  /* The partner's own answer wins when it is the newest fact. */
  const answer = input.partnerAnswer && (!latest || input.partnerAnswer.atIso >= latestAt) ? input.partnerAnswer : null;

  /* ── the ONE exception, highest material first ── */
  let exception: CustomerCardModel["exception"] = null;
  if (!delivered && !input.settled) {
    if (input.delayNoticeRequired) exception = { key: "delayed", fact: CUSTOMER_CARD_COPY.delayed };
    else if (latest?.result === "customer_refused_delivery") exception = { key: "refused", fact: CUSTOMER_CARD_COPY.refused };
    else if (latest?.result === "contact_details_incorrect") exception = { key: "phone_wrong", fact: CUSTOMER_CARD_COPY.phoneWrong };
    else if (!scheduled && answer?.kind === "another_date") {
      exception = { key: "another_date", fact: CUSTOMER_CARD_COPY.anotherDate(answer.proposedIso ? spell(answer.proposedIso.slice(0, 10)) : null) };
    } else if (!scheduled && latest?.result === "requested_another_date") {
      exception = { key: "another_date", fact: CUSTOMER_CARD_COPY.anotherDate(null) };
    }
  }

  /* ── the one status line ── */
  let status: CustomerCardModel["status"];
  if (delivered) status = { text: CUSTOMER_CARD_COPY.delivered(spell(delivered)), tone: "neutral" };
  else if (exception) status = { text: exception.fact, tone: exception.key === "refused" || exception.key === "delayed" ? "missed" : "attention" };
  else if (scheduled) status = { text: CUSTOMER_CARD_COPY.scheduled(spell(scheduled)), tone: "neutral" };
  else if (company) status = { text: CUSTOMER_CARD_COPY.partnerContacts(company, due ? spell(due) : null), tone: "future" };
  else status = { text: CUSTOMER_CARD_COPY.notAssigned, tone: "attention" };

  /* ── the Carres act — exceptions only ── */
  let action: PartyAction | null = null;
  if (exception) {
    if (exception.key === "delayed") {
      action = { act: CUSTOMER_CARD_COPY.tellNewDate, result: CUSTOMER_CARD_COPY.delayed, dueIso: today, timing: "today", door: "sales_order" };
    } else if (exception.key === "phone_wrong") {
      action = { act: CUSTOMER_CARD_COPY.correctPhone, result: CUSTOMER_CARD_COPY.phoneWrong, dueIso: due, timing: timingOf(due, today), door: "sales_order" };
    } else {
      action = {
        act: CUSTOMER_CARD_COPY.decideNext,
        result:
          exception.key === "another_date" && answer?.proposedIso
            ? CUSTOMER_CARD_COPY.customerAsked(spell(answer.proposedIso.slice(0, 10)))
            : exception.fact,
        dueIso: today,
        timing: "today",
        door: "delivery",
      };
    }
  }

  return { status, action, exception, latest, history };
}
