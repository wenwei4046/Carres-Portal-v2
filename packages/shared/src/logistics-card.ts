/**
 * THE LOGISTICS CARD — the Work right panel's Logistics party card.
 * Owner rulings 2026-09-24 (docs/workspace/MASTER.md §5.9 · docs/delivery/MASTER.md §5.5).
 *
 * ONE arithmetic for three things the card, the Work panel and the external
 * link page must agree on (Law D):
 *
 *   1. the THREE FIXED CHECKS — `3 working days before` · `2 working days
 *      before` · `1 working day before`, counted on the Delivery week (Mon–Sat
 *      + Malaysian public holidays) back from the ANCHOR:
 *        · a Scheduled delivery date when one is recorded,
 *        · else the Requested delivery date.
 *      A check that is done or missed keeps the date it had; the checks still
 *      ahead follow a new Scheduled date. The first two checks are finished by
 *      the Scheduled date itself (it cannot exist without them), so only the
 *      third ever moves with a reschedule.
 *   2. the STOCK ROUTE — which of the three governed routes the goods take,
 *      read from Purchasing's `Supplier Deliver To` and Stock's Site kind. The
 *      card never stores a route of its own.
 *   3. the ONE current action and the ONE exception the collapsed card shows.
 *
 * PURE — no clock, no I/O. The holiday set and today are injected. Dates are
 * ISO `YYYY-MM-DD`; the screen spells them.
 */
import { z } from "zod";
import { subtractWorkingDays, type WorkingDayOptions } from "./working-days";
import { CANNOT_DELIVER_REASON_KEYS } from "./schemas/delivery-arrangement";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* ── the words ─────────────────────────────────────────────────────────── */

/** Every visible word the card, the Work panel and the link page print.
 *  COPY-STANDARD § "The Logistics card words" registers each one. */
export const LOGISTICS_COPY = {
  heading: "Logistics",
  notAssigned: "Logistics not assigned",
  checks: (done: number) => `Checks ${done} of 3`,
  checkLabel: { t3: "3 working days before", t2: "2 working days before", t1: "1 working day before" } as const,
  opens: (date: string) => `Opens ${date}`,
  requested: "Requested delivery",
  scheduled: "Scheduled delivery",
  delivered: "Delivered",
  noRequested: "No requested delivery date",
  notScheduled: "Not scheduled yet",
  notNeeded: "Passed before this delivery started",
  assign: { act: "Assign logistics", result: "Choose the company that carries this delivery" },
  contact: (overdueOrToday: boolean) =>
    overdueOrToday ? "Contact logistics today" : "Contact logistics",
  shareDetails: (partner: string) => `Share the delivery details with ${partner}`,
  detailsReceived: (partner: string) => `${partner} has the delivery details`,
  detailsNotReceived: "Details not received yet",
  callPartner: (partner: string) => `Call ${partner}`,
  getScheduled: "Get the scheduled delivery date",
  noAnswer: "No answer",
  scheduledFact: (date: string) => `Scheduled ${date}`,
  anotherDate: (date: string) => `Requested another date · ${date}`,
  agreeAnotherDate: (date: string) => `Agree ${date} with the customer, then record it`,
  callCustomer: "Call the customer",
  cannotDeliver: (reason: string) => `Cannot deliver · ${reason}`,
  decideNext: "Decide the next step for this delivery",
  decideNextResult: (partner: string) => `Keep ${partner} with a new date, or change logistics`,
  nothingMissing: "Nothing missing",
  stillToCollect: (amount: string) => `RM ${amount} still to collect`,
  financeHolding: (reason: string) => (reason ? `Finance is holding this delivery: ${reason}` : "Finance is holding this delivery"),
} as const;

/* ── the stock route ───────────────────────────────────────────────────── */

export type StockRouteKey =
  | "carres_klang"
  | "supplier_pickup"
  | "supplier_to_logistics"
  | "supplier_to_customer"
  | "not_known";

/** The three governed routes (owner ruling 2026-09-24), the separate Ohana
 *  flow, and the honest absence. `supplier_pickup` has no source fact yet —
 *  Purchasing records no "logistics collects straight to the customer" choice
 *  — so it is declared here and never derived until that fact exists. */
export const STOCK_ROUTE_LABEL: Record<StockRouteKey, string> = {
  carres_klang: "Pickup from Carres Klang Warehouse",
  supplier_pickup: "Pickup from supplier",
  supplier_to_logistics: "Supplier sends directly to logistics",
  supplier_to_customer: "Supplier delivers to the customer",
  not_known: "Stock route not known yet",
};

/** What the Purchasing destination resolves to in Stock (0509). */
export type DestinationSiteKind = "own" | "operation_partner" | "no_site";

export function stockRouteOfDestination(kind: DestinationSiteKind | null | undefined): StockRouteKey {
  if (kind === "own") return "carres_klang";
  if (kind === "operation_partner") return "supplier_to_logistics";
  if (kind === "no_site") return "supplier_to_customer";
  return "not_known";
}

/* ── the checks ────────────────────────────────────────────────────────── */

export type LogisticsCheckKey = "t3" | "t2" | "t1";
export const LOGISTICS_CHECK_LEAD: Record<LogisticsCheckKey, number> = { t3: 3, t2: 2, t1: 1 };
export type LogisticsCheckState = "not_open" | "open" | "done" | "missed" | "not_needed";

export interface LogisticsAction {
  act: string;
  result: string;
  dueIso: string | null;
  /** `missed` once the due day is behind us; `today` on it; else `ahead`. */
  timing: "ahead" | "today" | "missed" | "no_date";
  /** Which Delivery door does it: the card renders the owning component. */
  door: "assign" | "schedule" | "contact" | "decide" | "none";
}

/** One thing the day-before check found missing. `action` is null when the
 *  owning module (Payment, Finance, Warehouse) does the work, not logistics. */
export interface LogisticsGap {
  fact: string;
  action: Omit<LogisticsAction, "dueIso" | "timing"> | null;
}

export interface LogisticsCheckRow {
  key: LogisticsCheckKey;
  label: string;
  dueIso: string | null;
  state: LogisticsCheckState;
  /** The fact the row prints beside its label; null = print `Opens {date}`. */
  fact: string | null;
  gaps: LogisticsGap[];
}

export interface LogisticsPartnerAnswer {
  kind: "another_date" | "cannot_deliver";
  atIso: string;
  proposedIso: string | null;
  reasonLabel: string;
}

export interface LogisticsCardInput {
  todayIso: string;
  holidays?: WorkingDayOptions["holidays"];
  requestedIso: string | null;
  scheduledIso: string | null;
  partnerName: string | null;
  /** The first day this delivery could be worked (the order's proceed day).
   *  A check whose date was already behind it is `not_needed`, never missed. */
  startedIso: string | null;
  /** When the logistics company first had the delivery details: a portal
   *  assignment, a rendered link, or a recorded reply. */
  detailsReceivedIso: string | null;
  /** The partner's latest answer that is NOT a scheduled date, when it is
   *  newer than the current Scheduled date. */
  answer: LogisticsPartnerAnswer | null;
  /** A recorded outcome (delivered, cancelled, exception). Nothing is open. */
  settled: boolean;
  /** The day-before facts, already worded by their owners. */
  dayBeforeGaps: LogisticsGap[];
  /** Money owed that affects THIS delivery — formatted amount, or null. The
   *  caller decides "affects" (Payment's clock); this file only places it. */
  moneyOwed: string | null;
  financeHold: string | null;
  /** Spells a date for the facts (`27 Oct`). Injected so the engine spells no
   *  dates of its own (COPY: a business engine spells no dates). */
  spell: (iso: string) => string;
}

export interface LogisticsCardModel {
  anchorIso: string | null;
  anchorKind: "scheduled" | "requested" | null;
  rows: [LogisticsCheckRow, LogisticsCheckRow, LogisticsCheckRow];
  doneCount: number;
  currentAction: LogisticsAction | null;
  /** The ONE exception worth the collapsed card's last line. */
  exception: string | null;
}

function timingOf(dueIso: string | null, todayIso: string): LogisticsAction["timing"] {
  if (!dueIso) return "no_date";
  if (dueIso < todayIso) return "missed";
  if (dueIso === todayIso) return "today";
  return "ahead";
}

function stateFor(dueIso: string | null, todayIso: string, startedIso: string | null): LogisticsCheckState {
  if (!dueIso) return "not_open";
  if (startedIso && dueIso < startedIso) return "not_needed";
  if (todayIso < dueIso) return "not_open";
  if (todayIso === dueIso) return "open";
  return "missed";
}

export function logisticsCardModel(input: LogisticsCardInput): LogisticsCardModel {
  const opts: WorkingDayOptions = { holidays: input.holidays };
  const valid = (iso: string | null) => (iso && ISO.test(iso.slice(0, 10)) ? iso.slice(0, 10) : null);
  const requested = valid(input.requestedIso);
  const scheduled = valid(input.scheduledIso);
  const anchor = scheduled ?? requested;
  const anchorKind = scheduled ? "scheduled" : requested ? "requested" : null;
  const partner = input.partnerName?.trim() || null;
  const today = input.todayIso.slice(0, 10);
  const spell = input.spell;

  /* The first two checks keep the date they were counted from: the requested
     date (the scheduled one only when the customer never named a day). */
  const earlyAnchor = requested ?? scheduled;
  const due = (key: LogisticsCheckKey, from: string | null) =>
    from ? subtractWorkingDays(from, LOGISTICS_CHECK_LEAD[key], opts) : null;
  const t3Due = due("t3", earlyAnchor);
  const t2Due = due("t2", earlyAnchor);
  const t1Due = due("t1", anchor);

  /* ── 3 working days before ── */
  const t3Done = Boolean(partner && (input.detailsReceivedIso || scheduled));
  const t3: LogisticsCheckRow = {
    key: "t3",
    label: LOGISTICS_COPY.checkLabel.t3,
    dueIso: t3Due,
    state: t3Done ? "done" : stateFor(t3Due, today, input.startedIso),
    fact: t3Done
      ? LOGISTICS_COPY.detailsReceived(partner as string)
      : !partner
        ? LOGISTICS_COPY.notAssigned
        : null,
    gaps: [],
  };
  if (!t3Done && partner && (t3.state === "open" || t3.state === "missed")) t3.fact = LOGISTICS_COPY.detailsNotReceived;

  /* ── 2 working days before ── */
  const t2Done = Boolean(scheduled);
  const t2: LogisticsCheckRow = {
    key: "t2",
    label: LOGISTICS_COPY.checkLabel.t2,
    dueIso: t2Due,
    state: t2Done ? "done" : stateFor(t2Due, today, input.startedIso),
    fact: t2Done ? LOGISTICS_COPY.scheduledFact(spell(scheduled as string)) : null,
    gaps: [],
  };
  if (!t2Done && input.answer) {
    t2.fact =
      input.answer.kind === "another_date" && input.answer.proposedIso
        ? LOGISTICS_COPY.anotherDate(spell(input.answer.proposedIso))
        : LOGISTICS_COPY.cannotDeliver(input.answer.reasonLabel);
    if (t2.state === "not_open") t2.state = "open";
  } else if (!t2Done && t2.state === "missed") {
    t2.fact = LOGISTICS_COPY.noAnswer;
  } else if (!t2Done && t2.state === "open") {
    t2.fact = LOGISTICS_COPY.notScheduled;
  }

  /* ── 1 working day before — exceptions only ── */
  const t1Open = stateFor(t1Due, today, input.startedIso);
  const gaps: LogisticsGap[] = [...input.dayBeforeGaps];
  if (input.financeHold !== null) gaps.unshift({ fact: LOGISTICS_COPY.financeHolding(input.financeHold), action: null });
  if (input.moneyOwed) gaps.unshift({ fact: LOGISTICS_COPY.stillToCollect(input.moneyOwed), action: null });
  const t1Checked = t1Open === "open" || t1Open === "missed";
  const t1: LogisticsCheckRow = {
    key: "t1",
    label: LOGISTICS_COPY.checkLabel.t1,
    dueIso: t1Due,
    state: t1Checked ? (gaps.length === 0 ? "done" : t1Open) : t1Open,
    fact: t1Checked && gaps.length === 0 ? LOGISTICS_COPY.nothingMissing : null,
    gaps: t1Checked ? gaps : [],
  };

  let rows: [LogisticsCheckRow, LogisticsCheckRow, LogisticsCheckRow] = [t3, t2, t1];
  if (input.settled) {
    rows = rows.map((r) => (r.state === "done" || r.state === "not_needed" ? r : { ...r, state: "not_needed", gaps: [] })) as typeof rows;
  }
  const doneCount = rows.filter((r) => r.state === "done" || r.state === "not_needed").length;

  /* ── the ONE current action ── */
  let currentAction: LogisticsAction | null = null;
  if (!input.settled) {
    if (!partner) {
      currentAction = { ...LOGISTICS_COPY.assign, dueIso: t3Due, timing: timingOf(t3Due, today), door: "assign" };
    } else if (input.answer?.kind === "cannot_deliver" && !t2Done) {
      currentAction = {
        act: LOGISTICS_COPY.decideNext,
        result: LOGISTICS_COPY.decideNextResult(partner),
        dueIso: today,
        timing: "today",
        door: "decide",
      };
    } else if (input.answer?.kind === "another_date" && !t2Done && input.answer.proposedIso) {
      currentAction = {
        act: LOGISTICS_COPY.callCustomer,
        result: LOGISTICS_COPY.agreeAnotherDate(spell(input.answer.proposedIso)),
        dueIso: t2Due,
        timing: timingOf(t2Due, today),
        door: "schedule",
      };
    } else if (!t3Done && t3.state !== "not_needed") {
      const timing = timingOf(t3Due, today);
      currentAction = {
        act: LOGISTICS_COPY.contact(timing === "today" || timing === "missed"),
        result: LOGISTICS_COPY.shareDetails(partner),
        dueIso: t3Due,
        timing,
        door: "contact",
      };
    } else if (!t2Done) {
      currentAction = {
        act: LOGISTICS_COPY.callPartner(partner),
        result: LOGISTICS_COPY.getScheduled,
        dueIso: t2Due,
        timing: timingOf(t2Due, today),
        door: "schedule",
      };
    } else if (t1Checked) {
      const firstActionable = t1.gaps.find((g) => g.action);
      if (firstActionable?.action) {
        currentAction = { ...firstActionable.action, dueIso: t1Due, timing: timingOf(t1Due, today) };
      }
    }
  }

  /* ── the ONE exception line ── */
  let exception: string | null = null;
  if (!input.settled) {
    if (input.answer?.kind === "cannot_deliver" && !t2Done) exception = LOGISTICS_COPY.cannotDeliver(input.answer.reasonLabel);
    else if (input.financeHold !== null) exception = LOGISTICS_COPY.financeHolding(input.financeHold);
    else if (input.moneyOwed) exception = LOGISTICS_COPY.stillToCollect(input.moneyOwed);
    else if (t1Checked && t1.gaps[0]) exception = t1.gaps[0].fact;
  }

  return { anchorIso: anchor, anchorKind, rows, doneCount, currentAction, exception };
}

/**
 * Money AFFECTS this delivery from the day payment must be complete: 2
 * working days before the anchor in the Klang Valley, 3 for an outstation
 * delivery (ERP-ARCHITECTURE §6.5). Before that it is Payment's own work and
 * the Logistics card stays quiet about it.
 */
export function moneyAffectsDelivery(input: {
  owed: number;
  anchorIso: string | null;
  todayIso: string;
  outstation: boolean;
  holidays?: WorkingDayOptions["holidays"];
}): boolean {
  if (!(input.owed > 0) || !input.anchorIso) return false;
  const deadline = subtractWorkingDays(input.anchorIso.slice(0, 10), input.outstation ? 3 : 2, {
    holidays: input.holidays,
  });
  return input.todayIso.slice(0, 10) >= deadline;
}

/* ── the external link ─────────────────────────────────────────────────── */

export const ANOTHER_DATE_REASONS = [
  { key: "customer_asked", label: "The customer asked for another date" },
  { key: "no_capacity", label: "We are full on that date" },
  { key: "area_not_served", label: "We do not go to that area on that date" },
  { key: "goods_not_ready", label: "The goods are not ready for pickup" },
] as const;
export type AnotherDateReasonKey = (typeof ANOTHER_DATE_REASONS)[number]["key"];
const ANOTHER_DATE_REASON_KEYS = ANOTHER_DATE_REASONS.map((r) => r.key) as [
  AnotherDateReasonKey,
  ...AnotherDateReasonKey[],
];

export const LINK_COPY = {
  heading: "External link",
  none: "No link yet",
  active: "Active link",
  revoked: "Link revoked",
  createLink: "Create link",
  copyLink: "Copy link",
  revokeLink: "Revoke link",
  linkCopied: "Link copied",
  created: (date: string, who: string) => `Created ${date} · ${who}`,
  opened: (company: string, date: string) => `Opened by ${company} via external link · ${date}`,
  notOpened: "Not opened yet",
  actor: (company: string) => `${company} via external link`,
  portalPartner: (company: string) => `${company} answers in its own portal.`,
  /* The page the logistics company opens */
  pageTitle: "Delivery for",
  reference: "Reference",
  customer: "Customer",
  phone: "Phone",
  address: "Delivery address",
  goods: "Goods",
  pickup: "Pickup",
  saveScheduled: "Save scheduled delivery",
  modeScheduled: "Scheduled date",
  modeAnother: "Another date",
  scheduledDate: "Scheduled date",
  scheduledTime: "Scheduled time (optional)",
  askAnotherDate: "Ask for another date",
  proposedDate: "Date you can deliver",
  reason: "Reason",
  sendAnotherDate: "Save another date",
  cannotDeliver: "Cannot deliver",
  cannotDeliverNote: "Tell us more (optional)",
  savedScheduled: "Saved. Carres can see your scheduled delivery.",
  savedAnother: "Saved. Carres will call the customer about your date.",
  savedCannot: "Saved. Carres will decide the next step.",
  dead: "This link no longer works. Ask Carres for a new link.",
  loadFailed: "The delivery could not be loaded. Try again.",
  tryAgain: "Try again",
  sundayRefused: "Sunday is not a delivery day. Pick another date.",
  holidayRefused: "This date is a public holiday. Pick another date.",
  pastRefused: "This date has passed. Pick another date.",
} as const;

const isoDate = z.string().regex(ISO, "Pick a date");

export const linkSaveScheduledInput = z
  .object({
    scheduledDate: isoDate,
    scheduledTime: z.string().trim().min(1).max(60).nullish(),
  })
  .strict();
export type LinkSaveScheduledInput = z.infer<typeof linkSaveScheduledInput>;

export const linkAnotherDateInput = z
  .object({ proposedDate: isoDate, reason: z.enum(ANOTHER_DATE_REASON_KEYS) })
  .strict();
export type LinkAnotherDateInput = z.infer<typeof linkAnotherDateInput>;

export const linkCannotDeliverInput = z
  .object({ reason: z.enum(CANNOT_DELIVER_REASON_KEYS), note: z.string().trim().max(2000).nullish() })
  .strict()
  .refine((v) => v.reason !== "other" || Boolean(v.note), { message: "Tell us the reason", path: ["note"] });
export type LinkCannotDeliverInput = z.infer<typeof linkCannotDeliverInput>;

/** The minimum a logistics company sees through its link. No SO number, no
 *  money, no other delivery, no commercial term (owner ruling 2026-09-24). */
export interface ExternalDeliveryLinkView {
  company: string;
  reference: string | null;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  building: string | null;
  requestedDate: string | null;
  goods: Array<{ name: string; qty: number }>;
  pickup: string[];
  scheduledDate: string | null;
  scheduledTime: string | null;
}

/** The facts the Logistics card reads from Delivery beyond the Monitor card. */
export interface LogisticsCardFacts {
  partner: { id: string; name: string; hasPortal: boolean; kvDefault: boolean } | null;
  routes: Array<{
    key: StockRouteKey;
    place: string | null;
    purchaseOrders: Array<{
      poNo: string;
      supplier: string | null;
      poDeliveryDate: string | null;
      receivedDate: string | null;
    }>;
    readyUnits: number;
  }>;
  link: {
    id: string;
    token: string;
    createdAt: string;
    createdByName: string | null;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
  } | null;
  lastRevokedAt: string | null;
  detailsReceivedAt: string | null;
  answer: { kind: "another_date" | "cannot_deliver"; at: string; proposedDate: string | null; reasonKey: string } | null;
  history: Array<{ event: string; at: string; source: string | null; who: string | null; detail: string | null }>;
}
