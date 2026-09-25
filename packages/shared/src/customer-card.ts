/**
 * THE CUSTOMER CARD — the Work right panel's Customer party card.
 * Owner approval 2026-09-25 (docs/workspace/MASTER.md §5.9 · docs/delivery/MASTER.md §5.2).
 *
 * ONE arithmetic for the card, the Order Route and the Work feed's Waiting
 * state (Law D):
 *
 *   · the ONE status line the collapsed card prints, in the governed precedence;
 *   · the ONE current act, which follows Delivery's `customer_contact_by`
 *     setting — `operation`: Carres agrees the date with the customer;
 *     `partner`: the logistics company does, and Carres acts on exceptions;
 *   · the three checks, each a STORED fact (a contact record, a Scheduled
 *     delivery date, an address-confirmed contact + a condo registration);
 *   · the follow-up day after `Waiting for Customer Reply` / `No Answer` —
 *     the next Delivery working day, derived, never typed.
 *
 * The contact deadline is NOT a second clock: the caller hands in the
 * Logistics card's `2 working days before` check (date + state).
 *
 * PURE — no clock, no I/O. Dates are ISO `YYYY-MM-DD`; `spell` prints them.
 */
import { addWorkingDays, type WorkingDayOptions } from "./working-days";
import type { DeliveryContactChannelKey, DeliveryContactPurposeKey, DeliveryContactResultKey } from "./delivery-contact";
import type { LogisticsCheckState } from "./logistics-card";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const CUSTOMER_CARD_COPY = {
  heading: "Customer",
  progress: (done: number, total: number) => `${done} of ${total}`,
  delivered: (date: string) => `Delivered ${date}`,
  refused: "Customer refused delivery",
  phoneWrong: "Phone number is wrong",
  anotherDate: (date: string | null) => (date ? `Customer requested another date · ${date}` : "Customer requested another date"),
  followUpToday: "No answer · Follow up today",
  waiting: (date: string) => `Waiting for customer · reply due ${date}`,
  contactMissed: (date: string) => `Contact missed ${date}`,
  scheduled: (date: string) => `Scheduled ${date}`,
  contactDueToday: "Contact due today",
  contactDue: (date: string) => `Contact due ${date}`,
  partnerContacts: (company: string, date: string | null) =>
    date ? `${company} contacts the customer · by ${date}` : `${company} contacts the customer`,
  noRequested: "No requested delivery date",
  /* current act */
  contactToday: "Contact customer today",
  contactBy: (date: string) => `Contact customer by ${date}`,
  agree: "Agree the delivery date, then record the reply",
  partnerAct: (company: string) => `${company} contacts the customer.`,
  decideNext: "Decide the next step for this delivery",
  refusedResult: "Customer refused delivery",
  correctPhone: "Correct the phone number",
  correctPhoneResult: "Change it in the Sales Order, then contact the customer",
  recordScheduled: "Record scheduled delivery",
  customerAsked: (date: string) => `The customer asked for ${date}`,
  /* checks */
  checkContacted: "Customer contacted",
  checkAgreed: "Delivery date agreed",
  checkAddress: "Address and access checked",
  /* sections */
  sectionAction: "Current action",
  sectionChecks: "Checks",
  sectionDelivery: "Delivery",
  sectionContact: "Contact",
  sectionHistory: "Evidence and recent history",
  carresContacts: "Carres contacts this customer",
  companyContacts: (company: string) => `${company} contacts this customer`,
  noEmail: "No email recorded",
  noPhone: "No phone recorded",
  noContacts: "No contact recorded yet",
  unavailable: "Customer contact unavailable",
  /* buttons */
  whatsapp: "WhatsApp",
  email: "Email",
  recordReply: "Record reply",
  openSalesOrder: "Open Sales Order",
  /* communication */
  to: (name: string, where: string) => `To ${name} · ${where}`,
  template: "Template",
  templateConfirm: "Confirm delivery date",
  copyMessage: "Copy message",
  openWhatsApp: "Open WhatsApp",
  openEmail: "Open email",
  wasSent: "Was this message sent?",
  recordSent: "Record as sent",
  notSent: "Not sent",
  whatsappUnavailable: "WhatsApp unavailable · No phone number",
  emailUnavailable: "Email unavailable · No email recorded",
  messageCopied: "Message copied",
  sentRecorded: "Recorded as sent",
  /* record reply */
  channel: "Channel",
  reply: "Reply",
  askedDate: "Date the customer asked for",
  whatsappReply: "WhatsApp reply",
  addressChecked: "Address and access checked with the customer",
  saveReply: "Save reply",
  cancel: "Cancel",
  detailsChanged: "Change the address in the Sales Order, then record the reply.",
  replyRecorded: "Reply recorded",
  replyFailed: "The reply could not be recorded. Try again.",
  needsProof: "Upload the customer's WhatsApp reply first.",
  needsDate: "Choose the date the customer asked for.",
} as const;

/** The governed customer message — leads with the customer's own reference,
 *  never the SO number; carries the date Carres is agreeing (owner approval
 *  2026-09-25, Orders §9). */
export function customerMessage(input: { name: string | null; reference: string | null; dateText: string | null }): string {
  const name = input.name?.trim() || "there";
  const about = input.reference ? `your order ${input.reference}` : "your order";
  const date = input.dateText ? ` for ${input.dateText}` : "";
  return `Hello ${name}, this is Carres about ${about}. We are arranging your delivery${date}. Please reply to confirm this date, or tell us a date that suits you.`;
}

/* ── the reply the operator records ────────────────────────────────────── */

export type CustomerReplyKey =
  | "accepted_date"
  | "another_date"
  | "no_answer"
  | "details_changed"
  | "phone_wrong"
  | "refused";

export const CUSTOMER_REPLIES: ReadonlyArray<{ key: CustomerReplyKey; label: string }> = [
  { key: "accepted_date", label: "Accepted date" },
  { key: "another_date", label: "Requested another date" },
  { key: "no_answer", label: "No answer" },
  { key: "details_changed", label: "Delivery details changed" },
  { key: "phone_wrong", label: "Phone number is wrong" },
  { key: "refused", label: "Customer refused delivery" },
];

/** The stored contact result each recordable reply writes (0487's list).
 *  `accepted_date` rides Delivery's arrangement save; `details_changed`
 *  writes nothing — the address belongs to the Sales Order. */
export const CUSTOMER_REPLY_RESULT: Partial<Record<CustomerReplyKey, DeliveryContactResultKey>> = {
  another_date: "requested_another_date",
  no_answer: "no_answer",
  phone_wrong: "contact_details_incorrect",
  refused: "customer_refused_delivery",
};

/** A reply that must carry the customer's own words as a file. */
export function customerReplyNeedsProof(key: CustomerReplyKey): boolean {
  return key === "another_date" || key === "refused";
}

/** The history words for a stored contact result (screen only). */
export const CUSTOMER_RESULT_WORD: Record<DeliveryContactResultKey, string> = {
  confirmed: "Accepted date",
  no_answer: "No answer",
  asked_to_call_again: "Asked to call again",
  requested_another_date: "Requested another date",
  contact_details_incorrect: "Phone number is wrong",
  customer_refused_delivery: "Customer refused delivery",
  waiting_for_customer_reply: "Waiting for customer",
};

/** The note a `Requested another date` contact carries — one machine-readable
 *  shape so the card can print the asked date back (`Asked for 2026-10-30`). */
export const askedForNote = (iso: string) => `Asked for ${iso}`;
export function askedForOf(note: string | null | undefined): string | null {
  const m = /^Asked for (\d{4}-\d{2}-\d{2})/.exec(note ?? "");
  return m ? m[1] : null;
}

/* ── the model ─────────────────────────────────────────────────────────── */

export interface CustomerContactFact {
  /** `contacted_at` — an ISO timestamp. */
  atIso: string;
  purpose: DeliveryContactPurposeKey;
  channel: DeliveryContactChannelKey;
  result: DeliveryContactResultKey;
  evidencePath: string | null;
  note: string | null;
  /** The recorder's name, already resolved; evidence only. */
  by: string | null;
}

/**
 * The follow-up day after a `Waiting for Customer Reply` / `No Answer`
 * contact: the next Delivery working day (Mon–Sat + public holidays). The
 * Work feed and the card both ask THIS (Law D).
 */
export function customerFollowUpIso(contactAtIso: string, holidays?: WorkingDayOptions["holidays"]): string | null {
  const day = contactAtIso.slice(0, 10);
  if (!ISO.test(day)) return null;
  return addWorkingDays(day, 1, { holidays });
}

/** Is the customer's side of this delivery waiting on the customer today?
 *  Only a recorded result says so — silence is never a result (0487). */
export function customerWaitingOf(input: {
  latest: Pick<CustomerContactFact, "atIso" | "result"> | null;
  todayIso: string;
  holidays?: WorkingDayOptions["holidays"];
}): { waiting: boolean; followUpIso: string | null } {
  const latest = input.latest;
  if (!latest || (latest.result !== "waiting_for_customer_reply" && latest.result !== "no_answer")) {
    return { waiting: false, followUpIso: null };
  }
  const followUpIso = customerFollowUpIso(latest.atIso, input.holidays);
  return { waiting: Boolean(followUpIso && input.todayIso.slice(0, 10) < followUpIso), followUpIso };
}

export type PartyTone = "done" | "current" | "attention" | "missed" | "future" | "neutral";

export interface PartyAction {
  act: string;
  result: string;
  dueIso: string | null;
  timing: "ahead" | "today" | "missed" | "no_date";
  door: "contact" | "schedule" | "sales_order" | "none";
}

export interface CustomerCardInput {
  todayIso: string;
  holidays?: WorkingDayOptions["holidays"];
  /** Delivery's `customer_contact_by` for the assigned company; null when no
   *  company is assigned (Carres then owns the contact). */
  contactBy: "operation" | "partner" | null;
  companyName: string | null;
  requestedIso: string | null;
  scheduledIso: string | null;
  deliveredIso: string | null;
  /** The Logistics card's `2 working days before` check — the ONE deadline. */
  contactCheck: { dueIso: string | null; state: LogisticsCheckState };
  /** This delivery's CUSTOMER contact records (contacted_person = customer). */
  contacts: ReadonlyArray<CustomerContactFact>;
  condoRequired: boolean;
  condoRecorded: boolean;
  /** A recorded outcome (delivered, cancelled). */
  settled: boolean;
  spell: (iso: string) => string;
}

export interface CustomerCheck {
  key: "contacted" | "agreed" | "address";
  label: string;
  done: boolean;
}

export interface CustomerCardModel {
  mode: "operation" | "partner";
  status: { text: string; tone: PartyTone };
  action: PartyAction | null;
  checks: [CustomerCheck, CustomerCheck, CustomerCheck];
  doneCount: number;
  latest: CustomerContactFact | null;
  followUpIso: string | null;
  waiting: boolean;
  /** Contact records newest first — the card's history. */
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
  const requested = valid(input.requestedIso);
  const delivered = valid(input.deliveredIso);
  const mode: "operation" | "partner" = input.contactBy === "partner" && input.companyName ? "partner" : "operation";
  const company = input.companyName?.trim() || null;

  const history = [...input.contacts].sort((a, b) => b.atIso.localeCompare(a.atIso));
  const latest = history[0] ?? null;
  const { waiting, followUpIso } = customerWaitingOf({ latest, todayIso: today, holidays: input.holidays });

  const checks: [CustomerCheck, CustomerCheck, CustomerCheck] = [
    { key: "contacted", label: CUSTOMER_CARD_COPY.checkContacted, done: history.length > 0 },
    { key: "agreed", label: CUSTOMER_CARD_COPY.checkAgreed, done: Boolean(scheduled) },
    {
      key: "address",
      label: CUSTOMER_CARD_COPY.checkAddress,
      done:
        history.some((c) => c.purpose === "confirm_delivery_address" && c.result === "confirmed") &&
        (!input.condoRequired || input.condoRecorded),
    },
  ];
  const doneCount = checks.filter((c) => c.done).length;

  const due = input.contactCheck.dueIso ? valid(input.contactCheck.dueIso) : null;
  const checkState = input.contactCheck.state;
  const contactMissed = !scheduled && checkState === "missed";
  const latestResult = latest?.result ?? null;
  const askedIso = latestResult === "requested_another_date" ? askedForOf(latest?.note) : null;
  const followUpDue = !scheduled && (latestResult === "waiting_for_customer_reply" || latestResult === "no_answer") && !waiting && Boolean(followUpIso);

  /* ── the ONE status line, in the governed precedence ── */
  let status: CustomerCardModel["status"];
  if (delivered) status = { text: CUSTOMER_CARD_COPY.delivered(spell(delivered)), tone: "neutral" };
  else if (latestResult === "customer_refused_delivery") status = { text: CUSTOMER_CARD_COPY.refused, tone: "missed" };
  else if (latestResult === "contact_details_incorrect") status = { text: CUSTOMER_CARD_COPY.phoneWrong, tone: "attention" };
  else if (latestResult === "requested_another_date" && (!scheduled || (askedIso && askedIso !== scheduled)))
    status = { text: CUSTOMER_CARD_COPY.anotherDate(askedIso ? spell(askedIso) : null), tone: "attention" };
  else if (contactMissed && due) status = { text: CUSTOMER_CARD_COPY.contactMissed(spell(due)), tone: "missed" };
  else if (followUpDue) status = { text: CUSTOMER_CARD_COPY.followUpToday, tone: "attention" };
  else if (waiting && followUpIso && !scheduled) status = { text: CUSTOMER_CARD_COPY.waiting(spell(followUpIso)), tone: "future" };
  else if (scheduled) {
    const dueToday = mode === "operation" && history.length === 0 && due === today;
    status = {
      text: dueToday
        ? `${CUSTOMER_CARD_COPY.scheduled(spell(scheduled))} · ${CUSTOMER_CARD_COPY.contactDueToday}`
        : CUSTOMER_CARD_COPY.scheduled(spell(scheduled)),
      tone: dueToday ? "current" : "neutral",
    };
  } else if (mode === "partner" && company) status = { text: CUSTOMER_CARD_COPY.partnerContacts(company, due ? spell(due) : null), tone: "future" };
  else if (due && due === today) status = { text: CUSTOMER_CARD_COPY.contactDueToday, tone: "current" };
  else if (due) status = { text: CUSTOMER_CARD_COPY.contactDue(spell(due)), tone: "future" };
  else status = { text: requested ? CUSTOMER_CARD_COPY.contactDue(spell(requested)) : CUSTOMER_CARD_COPY.noRequested, tone: "future" };

  /* ── the ONE current act ── */
  let action: PartyAction | null = null;
  if (!input.settled && !delivered) {
    if (latestResult === "customer_refused_delivery") {
      action = { act: CUSTOMER_CARD_COPY.decideNext, result: CUSTOMER_CARD_COPY.refusedResult, dueIso: today, timing: "today", door: "sales_order" };
    } else if (latestResult === "contact_details_incorrect") {
      action = { act: CUSTOMER_CARD_COPY.correctPhone, result: CUSTOMER_CARD_COPY.correctPhoneResult, dueIso: due, timing: timingOf(due, today), door: "sales_order" };
    } else if (latestResult === "requested_another_date" && askedIso && askedIso !== scheduled) {
      action = { act: CUSTOMER_CARD_COPY.recordScheduled, result: CUSTOMER_CARD_COPY.customerAsked(spell(askedIso)), dueIso: due, timing: timingOf(due, today), door: "schedule" };
    } else if (!scheduled && mode === "operation" && !waiting) {
      const timing = timingOf(due, today);
      action = {
        act: timing === "today" || timing === "missed" || !due ? CUSTOMER_CARD_COPY.contactToday : CUSTOMER_CARD_COPY.contactBy(spell(due)),
        result: CUSTOMER_CARD_COPY.agree,
        dueIso: due,
        timing,
        door: "contact",
      };
    } else if (scheduled && mode === "operation" && history.length === 0 && due === today) {
      action = { act: CUSTOMER_CARD_COPY.contactToday, result: CUSTOMER_CARD_COPY.agree, dueIso: due, timing: "today", door: "contact" };
    }
  }

  return { mode, status, action, checks, doneCount, latest, followUpIso, waiting: waiting && !scheduled, history };
}
