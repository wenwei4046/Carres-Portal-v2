/**
 * DELIVERY MONITOR — the arithmetic behind the Monitor page.
 * Owner ruling 2026-09-10 · `docs/delivery/MASTER.md` §8.
 *
 * PURE. No React, no I/O, no clock of its own — every function that needs
 * "today" is handed it, so the browser, the tests and a CI runner in UTC can
 * never disagree about which day a delivery sits on.
 *
 * ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
 *
 * ONE question: *what do I owe today, and which record does each row open?*
 * Monitor answers it through TWO NAMED VIEWS over the SAME canonical rows:
 *
 *     Work to do (DEFAULT)   the standard selectable work list over one
 *                            WORK TO DO queue — the landing
 *     Confirmed deliveries   Day · Week · Month; only rows a customer has
 *                            actually agreed a day for
 *
 * ⭐ THE VIEW IS A NAMED TAB, NEVER A SIDE EFFECT OF A FILTER (owner ruling
 * 2026-09-10, retiring the 2026-09-07 projection rule). A STATE / LOGISTICS
 * PARTNER / DELIVERY STATUS pick NARROWS whichever view is open; a WORK TO DO
 * queue belongs to the work list; a rail date opens that date's `Day` on the
 * calendar. A phone only ever shows `Day`.
 *
 * The windows, the card mapping, the goods split, the contact deadline, the
 * filters, the rail counts, the month counts and the one href arithmetic all
 * live here, so the rail count and the listing it filters cannot be two
 * different numbers (Architecture Law D).
 *
 * ── WHAT IT DELIBERATELY DOES NOT OWN ───────────────────────────────────────
 *
 * It writes nothing and derives no second truth. The rows come from
 * `delivery-work.ts` — the SAME `buildDeliveryScopeRows` entry rule and status
 * ladder — the missing-evidence facts come from the Delivery Orders register's
 * own `missingDeliveryProofOf`, the contact deadline is the shared `chase`
 * step's (`deliveryStepDueIso`), the arrival is `deliveryArrivalStateOf`'s over
 * Purchasing's recorded dates, and the shortage is `deliveryStockReadinessOf`'s
 * over Stock's register. This file only arranges what those owners already
 * say. A planned window ending proves nothing: no rung of any status reads the
 * clock.
 */

import type { DeliveryWorkStatusKind, DeliveryWorkStatusTone } from "@carres/shared";
import {
  DELIVERY_WORK_STATUS_KINDS,
  ARRIVAL_COPY,
  deliveryArrivalStateOf,
  deliveryStockReadinessOf,
  deliveryWorkStatusLabelOf,
  goodsCategoryWordOf,
  receivedForBoundLine,
  lineKind,
  SERVER_EXCLUSIVE_ADDON_KEYS,
  lineShortagesOf,
  myHolidaySet,
  orderActionLines,
  type DeliveryArrivalState,
  type DeliveryQueueLeads,
  type DeliveryStockReadiness,
} from "@carres/shared";
import {
  buildDeliveryScopeRows,
  regionBucketOf,
  GOVERNED_LOGISTICS,
  type DeliveryScopeRow,
  type ScopeInputs,
} from "./delivery-work";
import {
  DOR_COPY,
  proofReopened,
  tripLinesOf,
  type DoProofReview,
  type MissingDeliveryProof,
} from "./delivery-orders-register";
import { lineName, moneyOfOrder } from "./sales-order-facts";
import { fmtMoney, paymentApprovalOpensGate } from "@carres/shared";

/**
 * ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD, Delivery section).
 * Reused governed strings keep their governed spelling. `scope` and `leg`
 * never reach an employee's screen (owner correction 2026-09-07).
 */
export const MONITOR_COPY = {
  page: "Monitor",
  docTitle: "Monitor — Carres",
  search: "Search deliveries…",
  /** Owner correction 2026-09-06 — the short per-day absence; the spanning
   *  sentence below owns the fully-empty range. */
  emptyDay: "No deliveries",
  emptyList: "No deliveries",
  emptySearch: "No matching deliveries.",
  loadFailed: "Monitor could not be loaded",
  tryAgain: "Try again",
  railWork: "WORK TO DO",
  /** The three dropdowns own clear-this-one-condition word (2026-09-12).
   *  `All` alone would read as all of everything; each says WHAT it clears. */
  allStates: "All states",
  allPartners: "All",
  allStatuses: "All",
  railState: "STATE",
  railLogistics: "LOGISTICS",
  railStatus: "DELIVERY STATUS",
  allDeliveryWork: "All delivery work",
  noLogistics: "No logistics picked",
  /**
   * ⭐ THE CONTACT-WORK QUEUE (owner ruling 2026-09-10).
   *
   * The rows are unchanged — a delivery nobody has agreed a day for — but the
   * queue is named after the JOB rather than after the hole, because the job
   * has a DEADLINE: Logistics contacts the customer at least three working
   * days before the requested delivery date, whether or not the goods are in.
   * `No confirmed date` stays the CELL's absence word (it is the fact) and
   * the retired `?view=no_confirmed_date` still opens this queue.
   */
  callCustomer: "Call customer",
  noConfirmedDate: "No confirmed date",
  /** A day agreed with no window on it — the arrangement's own half-state. */
  noTimeAgreed: "No time agreed",
  /**
   * ⭐ TWO DIFFERENT OVERDUE POPULATIONS, TWO DIFFERENT WORDS (owner ruling
   * 2026-09-11). The rail's `Overdue delivery` is a confirmed trip whose day
   * has passed with no result; the contact strip's `Overdue contact` is a
   * customer conversation that missed its T−3 deadline. They answer different
   * questions, they are worked by different people, and two bare `Overdue`
   * counts on one screen read as one number that disagrees with itself.
   */
  overdue: "Overdue delivery",
  overdueContact: "Overdue contact",
  failed: "Failed Delivery",
  /** Owner correction 2026-09-07 — the queue names the JOB; each row then
   *  names the exact missing file (`DOR_COPY.uploadPhoto` / `uploadSignedDo`). */
  uploadProof: "Upload delivery proof",
  /** §6.1 (0489) — the review queue; its door is the DO object's Evidence
   *  section. Joins the rail now that the proof-review record exists. */
  checkProof: "Check delivery proof",
  noDeliveryOrder: "No delivery order yet",
  noDeliveryOrderShort: "DO",
  paymentBlocked: "Payment blocked",
  stockRisk: "Stock risk",
  logisticsIncomplete: "Logistics details incomplete",
  doNotReleased: "DO not released",
  noPrice: "No price yet",
  openDo: "Open DO",
  receivedQty: "Received Qty",
  receiptUnknown: "Receipt not verified",
  receiptMeaning: "Receipt for this product line. Delivery and current location are separate.",
  /** The governed editor door (COPY-STANDARD, Delivery workspace words). */
  editDelivery: "Edit Delivery",
  /* ── THE TWELVE-COLUMN REGISTER (owner ruling 2026-09-12, MASTER §8.3) ── */
  confirmed: "Confirmed",
  notConfirmed: "Not confirmed",
  paid: "Paid",
  doNotDeliver: "Do not deliver",
  stillToCollect: (amount: string) => `${amount} still to collect`,
  financeHolding: "Finance is holding this delivery",
  collect: (amount: string) => `Collect ${amount}`,
  cashOnDelivery: "Cash on delivery",
  ofPieces: (have: number, total: number) => `${have} of ${total}`,
  arrivingAfterRequested: "Arriving after the requested date",
  doDate: (date: string) => `DO date ${date}`,
  /* ── THE FOUR PANELS (owner ruling 2026-09-12, MASTER §8.5) ─────────────── */
  panelCustomer: "Customer, Address & Access",
  panelDates: "Delivery Dates",
  panelLogistics: "Logistics Details",
  panelItems: "Items, Services & Stock",
  updateDateTime: "Update date and time",
  changeLogistics: "Change logistics",
  customer: "Customer",
  phone: "Phone",
  emergencyContact: "Emergency contact",
  emergencyPhone: "Emergency phone",
  emergencyRelationship: "Emergency relationship",
  accessNotRecorded: "Access not recorded",
  legOf: (n: number, total: number) => `Leg ${n} of ${total}`,
  address: "Address",
  buildingType: "Building type",
  lift: "Lift",
  access: "Access",
  customerRequested: "Customer requested",
  confirmedDate: "Confirmed delivery date",
  confirmedTime: "Confirmed delivery time",
  partner: "Logistics",
  driver: "Driver",
  driverPhone: "Driver phone",
  vehiclePlate: "Vehicle plate",
  pickup: "Pickup",
  eta: "ETA",
  pickupNotRecorded: "Pickup not recorded",
  handedOver: (at: string) => `Handed over ${at}`,
  receivedBy: (partner: string, at: string) => `Received by ${partner} ${at}`,
  condoRegistration: "Condo registration",
  stairCarry: (n: number, floor: number | null) =>
    floor == null ? `Stair carry · ${n} items` : `Stair carry · ${n} items · floor ${floor}`,
  item: "Item",
  qty: "Qty",
  source: "Source",
  status: "Status",
  location: "Location",
  countedStock: "Counted stock",
  arriving: (date: string) => `Arriving ${date}`,
  notReceivedYet: "Not received yet",
  withHolder: (holder: string) => `With ${holder}`,
  loanLine: (unit: string | null) =>
    unit ? `Loan ${unit} · collect back on delivery day` : `Loan item · collect back on delivery day`,
  services: "Services",
  accessories: "Accessories",
  /* ── THE IN-PANEL WRITES (owner ruling 2026-09-13, MASTER §8.6) ────────── */
  confirmedDateField: "Confirmed date",
  confirmedTimeField: "Confirmed time",
  informationReceivedFrom: "Information received from",
  customerWord: "Customer",
  operationOnBehalfOf: (partner: string) => `Operation on behalf of ${partner}`,
  whatsappProof: "WhatsApp proof",
  saveConfirmedDelivery: "Save confirmed delivery",
  saveConfirmedDeliveryNeedsReply: "Save confirmed delivery — upload the WhatsApp reply",
  cancel: "Cancel",
  notDeliveryDay: "Sunday and Malaysian public holidays are not delivery days",
  deliveryConfirmedDone: (date: string, slot: string | null) =>
    slot ? `Delivery confirmed ${date} · ${slot}` : `Delivery confirmed ${date}`,
  uploadReply: "Upload reply screenshot",
  replaceReply: "Replace screenshot",
  replyAttached: "Reply screenshot attached",
  uploadFailed: "The screenshot could not be uploaded",
  uploadWrongType: "Use a JPG, PNG or WEBP screenshot",
  uploadTooLarge: "That screenshot is too large (max 10 MB)",
  copyMessage: "Copy message",
  copied: "Message copied",
  openGroup: "Open WhatsApp group",
  groupNotSet: "No WhatsApp group saved for this partner",
  sentIsNotConfirmed:
    "Sending is not confirmation. Record the date only after the partner replies, and upload the reply.",
  whyChanging: "Why is the logistics partner changing?",
  pickOne: "Pick one",
  driverName: "Driver name",
  condoRegistrationHint:
    "What the building's management needs before the truck may enter — permit reference, registered time, in their words.",
  recordCannotDeliver: (partner: string) => `Record Cannot Deliver on behalf of ${partner}`,
  cannotDeliverReason: "Reason",
  cannotDeliverNote: "Note",
  cannotDeliverRecorded: (partner: string) => `${partner} cannot deliver — recorded`,
  showBrief: "Show delivery brief",
  hideBrief: "Hide delivery brief",
  /** The first carrier on a scope — the governed word, never `Set partner`. */
  assignLogistics: "Assign logistics",
  hideFilters: "Hide filters",
  showFilters: "Show filters",
  previousDays: "Previous days",
  nextDays: "Next days",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  clearFilters: "Clear filters",
  /** The empty calendar's door into the contact queue. It names the QUEUE it
   *  opens (owner ruling 2026-09-10), so the button and the rail row it lands
   *  on cannot read as two different places. */
  openNoConfirmedDate: "Open Call customer",
  calendarViews: "Calendar view",
  day: "Day",
  week: "Work week",
  threeDays: "3 days",
  month: "Month",
  /** The Month view's compact cell lines — the rail row grammar (label, then
   *  the count) so the operator reads what the rail already taught. */
  cellDeliveries: "Deliveries",
  cellExceptions: "Exceptions",
  /** The eighth WORK TO DO queue (owner ruling 2026-09-14) — the SAME words
   *  the status column already prints for these rows, so the rail and the row
   *  cannot read as two different facts. */
  detailsIncomplete: "Order details incomplete",
  /* ── THE TWO TOP-LEVEL VIEWS (owner ruling 2026-09-10) ─────────────────── */
  /** The landing: what an operator must DO today. */
  tabWork: "Work to do",
  /** The calendar: only deliveries a customer has actually agreed a day for. */
  tabCalendar: "Delivery schedule",
  deliveryType: "DELIVERY",
  transferType: "TRANSFER",
  cellTransfers: "Transfers",
  tabs: "Monitor views",
  /** The calendar's own boundary, stated ON the calendar rather than learned
   *  by noticing an absence (Delivery MASTER §8 — an unconfirmed delivery
   *  never enters a date cell). A day WITHOUT an agreed window does enter,
   *  because the operator must see the day — and its card says `No time
   *  agreed` rather than passing as a finished booking (owner ruling
   *  2026-09-11). */
  calendarScope: "Confirmed dates only",
  /* ── THE CONTACT WEEK (owner ruling 2026-09-10) ────────────────────────── */
  /** The strip's own caption — these dates are CONTACT deadlines, and a reader
   *  who mistakes them for delivery appointments will call on the wrong day. */
  contactWeekScope: "Contact deadlines — not supplier or delivery dates",
  contactWeek: "Contact-work week",
  previousWeek: "Previous week",
  nextWeek: "Next week",
  /** A contact deadline nothing can be measured from: the customer has not
   *  named a day, so nothing about this row is late (delivery-queue's own
   *  "a step with no anchor is never late"). */
  noContactDeadline: "No contact deadline",
  /**
   * ⭐ THE COMPACT DEADLINE IS A GLYPH AND A DATE (owner ruling 2026-09-11,
   * re-ruled 2026-09-14). `Call by` and `Late — was due` repeated the same
   * two phrases down an entire column — and once the status word above the
   * date became `Call customer`, `Call by` was the verb printed twice on one
   * row. The kit's glyph and its colour carry the state; the WORDS do not
   * disappear, they move into the tooltip, the accessible name, Search and
   * the Excel export, where a hover, a screen reader and a manager all find
   * them.
   *
   * NO DASH JOINS AN ACT TO ITS EXPLANATION (owner ruling 2026-09-14): the
   * late sentence separates its clauses with the sheet's own `·`.
   */
  contactDueSentence: (date: string) => `Contact deadline ${date}`,
  contactLateSentence: (date: string) =>
    `Contact deadline ${date} · overdue, the deadline does not move`,
  /** The contact strip's day button, for a screen reader: the day, then how
   *  many conversations are due on it. */
  contactDayLabel: (date: string, count: number) => `Contact deadline ${date} · ${count}`,
  /* ── THE GOODS COLUMNS (owner ruling 2026-09-10) ───────────────────────── */
  items: "Items",
  extras: "Accessories & services",
  /** No accessory and no service on this order — a fact, not a blank. */
  noExtras: "None",
  /** The site facts the crew meets, from the Sales Order's own answers. */
  floor: "Floor",
  hasLift: "Has lift",
  noLift: "No lift",
  stock: "Stock",
} as const;

/**
 * ⭐ THE WORK LIST'S COLUMN WORDS, IN ONE PLACE — the sheet and the phone's
 * card print the same label for the same fact. Two spellings of one column
 * heading is how `Customer Delivery` and `Deliver By` were born.
 */
export const MONITOR_COLUMN = {
  so: "SO No",
  customer: "Customer",
  state: "State",
  requestedDelivery: "Requested Delivery Date",
  logisticsPartner: "Logistics",
  /** The register's own heading for the partner column (§8.3 column 9). */
  logistics: "Logistics",
  confirmedDelivery: "Confirmed Delivery",
  confirmedTime: "Confirmed Time",
  doNumber: "DO No",
  location: "Delivery Location",
  /** The main goods on the truck — the model, its size and how many. */
  items: MONITOR_COPY.items,
  /** Everything that travels with them, and every service the crew performs. */
  extras: MONITOR_COPY.extras,
  /** WHEN the goods reach us — the supplier's date, never the customer's. */
  expectedArrival: ARRIVAL_COPY.column,
  /** Whether the register already holds the goods. */
  stock: MONITOR_COPY.stock,
  /** §8.3 column 10 — readiness and the exact count, one cell. */
  itemsStock: "Items & Stock",
  /** §8.3 column 11 — the one money rule's answer, never a door. */
  payment: "Payment",
  goods: "Goods",
  deliveryStatus: "Delivery Status",
  /** The ROW's open-action list — the governed word (COPY-STANDARD). */
  actions: "Actions",
  building: "Building",
  phone: "Phone",
} as const;

/** Desktop shows six operating days; Sunday is never one of them. */
export const MONITOR_DAYS = 6;

/**
 * `count` consecutive OPERATING days starting at `firstDate`, Sunday omitted.
 *
 * Bare-date arithmetic on `Date.UTC` — which day a delivery appears under is
 * never a timezone question, and this is the one clock-shaped API the file
 * touches without asking what time it is.
 */
export function operatingDaysFrom(firstDate: string, count = MONITOR_DAYS): string[] {
  const [y, m, d] = firstDate.slice(0, 10).split("-").map(Number);
  const out: string[] = [];
  /* The i < 60 guard is a runaway stop, far beyond any real run of Sundays. */
  for (let i = 0; out.length < Math.max(0, Math.trunc(count)) && i < 60; i += 1) {
    const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + i));
    if (t.getUTCDay() !== 0) out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

/** The operating day strictly BEFORE `dateIso` — Saturday when today is Monday. */
function previousOperatingDay(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  for (let i = 1; i < 8; i += 1) {
    const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - i));
    if (t.getUTCDay() !== 0) return t.toISOString().slice(0, 10);
  }
  return dateIso;
}

/**
 * THE FIXED OPERATING WEEK (owner correction 2026-09-06) — Monday to Saturday,
 * the six operating days containing `dateIso`. A Sunday input belongs to no
 * operating week and snaps FORWARD to Monday first, the same rule the phone's
 * one-day view has always applied. Windows are week-aligned: the arrows
 * replace the whole displayed work week, never scroll it.
 */
export function operatingWeekOf(dateIso: string): string[] {
  const snapped = operatingDaysFrom(dateIso, 1)[0]!;
  const [y, m, d] = snapped.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const monday = new Date(t);
  monday.setUTCDate(t.getUTCDate() - (t.getUTCDay() - 1));
  const out: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * THE TABLET WINDOW — a fixed three-day half of the operating week (Mon–Wed
 * or Thu–Sat), so the window is aligned and finite rather than a horizontal
 * scroll. Previous/next moves three operating days, landing on the other half.
 */
export function tabletWindowOf(dateIso: string): string[] {
  const week = operatingWeekOf(dateIso);
  const snapped = operatingDaysFrom(dateIso, 1)[0]!;
  return week.indexOf(snapped) < 3 ? week.slice(0, 3) : week.slice(3, 6);
}

/** Next moves exactly `count` operating days forward. */
export function nextOperatingWindowStart(firstDate: string, count = MONITOR_DAYS): string {
  return operatingDaysFrom(firstDate, count + 1)[count]!;
}

/** Previous moves exactly `count` operating days back — the exact inverse. */
export function previousOperatingWindowStart(firstDate: string, count = MONITOR_DAYS): string {
  let cursor = firstDate;
  for (let i = 0; i < count; i += 1) cursor = previousOperatingDay(cursor);
  return cursor;
}

/* ── THE MONTH (owner correction 2026-09-07) ─────────────────────────────── */

/** Every calendar day of the month containing `dateIso` — Sundays included,
 *  because a delivery recorded on one is a fact the month must still count. */
export function monthDaysOf(dateIso: string): string[] {
  const [y, m] = dateIso.slice(0, 10).split("-").map(Number);
  const out: string[] = [];
  for (let d = 1; d <= 31; d += 1) {
    const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d));
    if (t.getUTCMonth() !== (m ?? 1) - 1) break;
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

/** The first OPERATING day of the month `delta` months away — the Month
 *  view's arrows replace the whole displayed month, never scroll it. */
export function monthStepStart(dateIso: string, delta: 1 | -1): string {
  const [y, m] = dateIso.slice(0, 10).split("-").map(Number);
  const first = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1));
  return operatingDaysFrom(first.toISOString().slice(0, 10), 1)[0]!;
}

/* ── THE VIEWS ───────────────────────────────────────────────────────────── */

/** The page-toolbar control (owner correction 2026-09-07): `Week` is the
 *  desktop default; a phone only ever shows `Day`. */
export type MonitorCalendarView = "day" | "week" | "month";
export const MONITOR_CALENDAR_VIEWS: readonly MonitorCalendarView[] = ["day", "week", "month"];
export const MONITOR_CALENDAR_VIEW_LABEL: Record<MonitorCalendarView, string> = {
  day: MONITOR_COPY.day,
  week: MONITOR_COPY.week,
  month: MONITOR_COPY.month,
};
export const DEFAULT_CALENDAR_VIEW: MonitorCalendarView = "week";

/**
 * ONE single-pick WORK TO DO group (owner correction 2026-09-06 — never split
 * into "Delivery Schedule" and "Needs Checking"), in the ruled order (owner
 * correction 2026-09-07). `no_logistics` sits here as a PRIMARY work queue —
 * the bulk-assignment journey's entry — and never appears a second time under
 * LOGISTICS PARTNER. `Calendar` and `Waiting for warehouse` are NOT queues:
 * one is a view, the other a DELIVERY STATUS filter.
 */
export type MonitorWorkView =
  | "all"
  | "no_logistics"
  | "no_confirmed_date"
  | "overdue"
  | "failed"
  | "upload_proof"
  | "check_proof"
  | "details_incomplete";

export const MONITOR_WORK_VIEWS: readonly MonitorWorkView[] = [
  "all",
  "no_logistics",
  "no_confirmed_date",
  "overdue",
  "failed",
  "upload_proof",
  "check_proof",
  /* ⭐ THE EIGHTH QUEUE (owner ruling 2026-09-14, Card 23) — a DOOR, not a
     backlog. A row missing a required Sales fact gets somewhere deliberate to
     be worked, which is what stops it competing for the top of
     `All delivery work`: measured on production, 50 of 91 rows read
     `Order details incomplete`, and that verdict outranks `Overdue` in the
     status ladder, so more than half the workspace was answering a question
     about a postcode. It licenses NO cleanup, repair list or backfill —
     Constitution §6 rules every such row today is imported test data that
     go-live discards. */
  "details_incomplete",
];

export const MONITOR_VIEW_LABEL: Record<MonitorWorkView, string> = {
  all: MONITOR_COPY.allDeliveryWork,
  no_logistics: MONITOR_COPY.noLogistics,
  /** The rows are unchanged; the NAME is the job, and the job has a deadline
   *  (owner ruling 2026-09-10). `No confirmed date` remains the CELL's word. */
  no_confirmed_date: MONITOR_COPY.callCustomer,
  overdue: MONITOR_COPY.overdue,
  failed: MONITOR_COPY.failed,
  upload_proof: MONITOR_COPY.uploadProof,
  check_proof: MONITOR_COPY.checkProof,
  details_incomplete: MONITOR_COPY.detailsIncomplete,
};

/**
 * ⭐ THE TWO TOP-LEVEL VIEWS (owner ruling 2026-09-10), overwriting the
 * 2026-09-07 "calendar shows while nothing is picked" projection rule.
 *
 * ```
 * work       what must be DONE — the selectable work list. THE LANDING.
 * calendar   Confirmed deliveries — the Mon–Sat week, Day and Month
 * ```
 *
 * The old rule made the projection a SIDE EFFECT of the rail: picking a state
 * silently replaced the calendar with a sheet, and the only way back was to
 * find `Clear filters`. Two named tabs make the choice the operator's, and
 * every narrowing then applies to whichever view is open — which is also why
 * the rail's two-month calendar now stays useful on both.
 *
 * The work list leads because Monitor's morning question is *what do I owe
 * today?*, and a calendar of agreed appointments cannot answer it: a delivery
 * nobody has agreed a day for is not on the calendar at all.
 */
export type MonitorTopTab = "work" | "calendar";
export const MONITOR_TOP_TABS: readonly MonitorTopTab[] = ["work", "calendar"];
export const MONITOR_TOP_TAB_LABEL: Record<MonitorTopTab, string> = {
  work: MONITOR_COPY.tabWork,
  calendar: MONITOR_COPY.tabCalendar,
};
export const DEFAULT_TOP_TAB: MonitorTopTab = "work";
/** The queue a Work to do tab opens on when the URL names none. */
export const DEFAULT_WORK_VIEW: MonitorWorkView = "all";

/**
 * The DELIVERY STATUS group — a kit dropdown over the Monitor status words
 * (Delivery MASTER §8.4, owner ruling 2026-09-13): the same actor-first
 * dictionary the column prints, in the ladder's own order. Not actions, not
 * document statuses, and never a WORK TO DO queue. The option words carry the
 * role word where the column would carry the partner's name.
 */
export type MonitorDeliveryStatus = DeliveryWorkStatusKind;
export const MONITOR_STATUS_LABEL: Record<MonitorDeliveryStatus, string> = Object.fromEntries(
  DELIVERY_WORK_STATUS_KINDS.map((kind) => [kind, deliveryWorkStatusLabelOf(kind, null)]),
) as Record<MonitorDeliveryStatus, string>;
/**
 * ⭐ ONE OPTION PER PRINTED WORD (owner ruling 2026-09-14).
 *
 * The dropdown filters what the column SAYS, so two rungs that now say the
 * same thing are one option: since the status word became `Call customer`,
 * `partner_must_contact` and `operation_must_call` are the same sentence to
 * the operator and differ only in which Delivery Settings rule owns the call.
 * Two identically-worded options would be a menu asking the reader to pick
 * between two spellings of one word. The FIRST kind in the ladder wins the
 * option, and `matchesMonitorFilters` narrows by the LABEL rather than the
 * key, so picking it keeps every row that prints it.
 */
export const MONITOR_STATUS_FILTERS: readonly MonitorDeliveryStatus[] =
  DELIVERY_WORK_STATUS_KINDS.filter(
    (kind, i, all) =>
      all.findIndex((other) => MONITOR_STATUS_LABEL[other] === MONITOR_STATUS_LABEL[kind]) === i,
  );

/** One calendar card / work-list row — a read-only mapping of recorded facts. */
export interface DeliveryMonitorCard {
  eventType: "delivery" | "transfer";
  /** Stable identity — the row's own key (order id, or `id#legN`). */
  scopeId: string;
  orderId: string;
  /** The Journey leg this card is, when the order travels in legs. Rides the
   *  href only — never printed as a word. */
  leg: number | null;
  /** The issued DO row's id — the Delivery Order object's address. */
  deliveryOrderId: string | null;
  doNumber: string | null;
  /** Delivery's confirmed operational date. null = no confirmed date yet. */
  confirmedDate: string | null;
  confirmedTime: string | null;
  customerName: string;
  /** City and State — `conciseLocality`'s own spelling. */
  locality: string | null;
  goodsSummary: string;
  logisticsPartnerId: string | null;
  logisticsPartnerName: string | null;
  region: string | null;
  statusKey: DeliveryWorkStatusKind;
  /** Line one of the status — the actor and the fact (§8.4). */
  statusLabel: string;
  /** Its text colour: green · orange · red · none. Never an icon. */
  statusTone: DeliveryWorkStatusTone;
  /** Line two — the day, window, deadline, ETA, proof state or reason. */
  statusSecond: string | null;
  statusSecondTone: "orange" | "red" | null;
  /**
   * The evidence a RECORDED delivered result still lacks — the Delivery
   * Orders register's own arithmetic, never from a planned window ending. Both
   * false for any row whose result has not reached the customer.
   */
  missingProof: MissingDeliveryProof;
  /** §6.1 (0489) — Operation's review of that evidence: pending, accepted,
   *  more required or rejected with its reason. The register's arithmetic. */
  proofReview: DoProofReview;
  /** THE MAIN GOODS on the truck, with their size and quantity. */
  items: MonitorGoodsLine[];
  /** Accessories and services, kept APART from the main goods (owner ruling
   *  2026-09-10) — the two questions are answered by two cells. */
  extras: MonitorExtraLine[];
  /** The site the crew meets, from Sales Orders' own answers, or null when
   *  nobody has recorded one. */
  siteAccess: string | null;
  /** Whether the register holds every committed piece, and what is missing. */
  readiness: DeliveryStockReadiness;
  /** When the goods reach us — the ONE shared reader over recorded dates. */
  arrival: DeliveryArrivalState;
  /**
   * ⭐ THE CONTACT DEADLINE — three working days before the customer's
   * requested date, through the SAME `chase` step every other Carres surface
   * counts (`deliveryStepDueIso`), so the Orders list and Monitor cannot name
   * two different days. Null when the customer has not named a date: a step
   * with no anchor is never late.
   *
   * IT NEVER MOVES. A late contact keeps the deadline it missed — that is what
   * makes it late, and rolling it forward would erase the only evidence that
   * anything went wrong.
   */
  contactDueIso: string | null;
  /** The deadline is behind us and the arrangement is still not complete. A
   *  RECORDED fact about a RECORDED absence — never an inference about the
   *  customer. */
  contactOverdue: boolean;
  /**
   * ⭐ BOTH HALVES AGREED — a confirmed day AND a confirmed time (owner ruling
   * 2026-09-11). A day with no window is a half-finished arrangement: the
   * customer does not know when to be home, so the delivery is not booked, the
   * contact work stays open, and the calendar does not print it as settled.
   */
  booked: boolean;
  /**
   * ⭐ The trip has a RECORDED OUTCOME — delivered, an exception, or cancelled.
   * Nothing about the appointment is still open, whatever the arrangement
   * recorded, so no contact work survives it (owner correction 2026-09-11).
   */
  settled: boolean;
  /** The full row behind the card — the work list's own columns and the
   *  governed `Assign logistics` door read it; the calendar card never does. */
  scope: DeliveryScopeRow;
  /** §8.3 `Payment` — the one money rule's two lines and their colour. */
  payment: MonitorPayment;
  /** §8.3 `Items & Stock` — line one the readiness word, line two the count. */
  stock: MonitorStock;
}

export interface MonitorPayment {
  line1: string;
  line2: string | null;
  tone: "green" | "red" | "none";
}

export interface MonitorStock {
  line1: string;
  line2: string | null;
  ready: boolean;
}

/**
 * ⭐ `Payment` ARITHMETIC (Delivery MASTER §8.3): `orderMoney.outstanding`
 * through the one money rule and the OPEN Finance exception — the same
 * predicate the DO gate asks. `Paid` when nothing is outstanding and no
 * exception holds; `Do not deliver` over `RM {amount} still to collect` while
 * money is owed, or over `Finance is holding this delivery` while an exception
 * is open; `Collect RM {amount}` over `Cash on delivery` only when an approval
 * opened the gate. Monitor adds no payment door.
 */
export function monitorPaymentOf(o: DeliveryScopeRow["o"]): MonitorPayment {
  const money = moneyOfOrder(o);
  const financeHolds = (o.order_finance_exceptions ?? []).some((e) => e.status === "open");
  const owed = money.known ? money.outstanding : 0;
  if (financeHolds) {
    return { line1: MONITOR_COPY.doNotDeliver, line2: MONITOR_COPY.financeHolding, tone: "red" };
  }
  if (!money.known) return { line1: MONITOR_COPY.noPrice, line2: null, tone: "none" };
  if (owed <= 0) return { line1: MONITOR_COPY.paid, line2: null, tone: "green" };
  const approvals = (o.order_delivery_payment_approvals ?? []).map((a) => ({
    status: a.status as "pending" | "approved" | "refused",
  }));
  if (paymentApprovalOpensGate(approvals)) {
    return {
      line1: MONITOR_COPY.collect(fmtMoney(owed)),
      line2: MONITOR_COPY.cashOnDelivery,
      tone: "none",
    };
  }
  return {
    line1: MONITOR_COPY.doNotDeliver,
    line2: MONITOR_COPY.stillToCollect(fmtMoney(owed)),
    tone: "red",
  };
}

/** The arrival's own day, when the shared reader names one. */
export function arrivalDayOf(arrival: DeliveryArrivalState): string | null {
  return "dateIso" in arrival ? arrival.dateIso : null;
}

/**
 * ⭐ `Items & Stock` ARITHMETIC (§8.3): `deliveryStockReadinessOf` over THIS
 * shipment's goods (`tripLinesOf`); the count is the committed pieces the
 * register holds against the total; `Arriving after the requested date` is
 * `deliveryArrivalStateOf`'s day against Sales' requested day. Delivery
 * computes no arrival of its own.
 */
export function monitorStockOf(input: {
  readiness: DeliveryStockReadiness;
  totalQty: number;
  arrival: DeliveryArrivalState;
  requestedIso: string | null;
}): MonitorStock {
  const { readiness, totalQty } = input;
  const have = Math.max(0, totalQty - readiness.shortQty);
  if (readiness.ready) {
    return { line1: ARRIVAL_COPY.stockReady, line2: totalQty > 0 ? MONITOR_COPY.ofPieces(have, totalQty) : null, ready: true };
  }
  const arrivalDay = arrivalDayOf(input.arrival);
  if (arrivalDay && input.requestedIso && arrivalDay > input.requestedIso) {
    return { line1: ARRIVAL_COPY.stockNotReady, line2: MONITOR_COPY.arrivingAfterRequested, ready: false };
  }
  const count = MONITOR_COPY.ofPieces(have, totalQty);
  return {
    line1: ARRIVAL_COPY.stockNotReady,
    line2: readiness.shortQty > 0 ? `${count} · ${ARRIVAL_COPY.short(readiness.shortQty)}` : count,
    ready: false,
  };
}

/** One goods line as the work list prints it. */
export interface MonitorGoodsLine {
  key: string;
  /** The order line's own id — the brief's Unit and PO facts are read by it
   *  from the Sales Order expansion (Stock owns the Unit, Purchasing the PO). */
  lineId: string | null;
  sku: string;
  /** `Trion · Queen` — the catalog's own resolved name (model AND size), or
   *  the text the order carries when the catalog does not know the SKU. */
  name: string;
  /** The catalog's own category word (`Mattress` · `Pillow` · `Service`). */
  category: string;
  qty: number;
  /** Pieces the register does not hold for this line — 0 when it is all in. */
  shortQty: number;
  receivedQty?: number | null;
}

/** One accessory or service line. A service moves no Unit and can be short of
 *  nothing, so it carries a `detail` instead of a shortage. */
export interface MonitorExtraLine extends MonitorGoodsLine {
  kind: "accessory" | "service";
}

/** The source is the workspace's own canonical reads — nothing new is fetched. */
export interface DeliveryMonitorSource extends ScopeInputs {
  /**
   * The `Confirm delivery date` lead in WORKING DAYS (Purchasing → Settings,
   * `logistics_call_working_days`, three since 0342). Absent leaves the step
   * on `delivery-queue.ts`'s own seed — never on a number this file invented.
   */
  queueLeads?: DeliveryQueueLeads;
  /** Malaysian public holidays. Omitted → the live set, the same one every
   *  other delivery clock counts on. */
  holidays?: ReadonlySet<string>;
  /** Business today — the contact deadline is a question about it. */
  todayIso: string;
  /** Addon key → its catalog NAME (`dispose-mattress` → `Dispose old
   *  mattress`). A key nobody can name is printed as the order recorded it,
   *  never as a database word dressed up (COPY-STANDARD: no internal enum on
   *  screen — so an unresolved key is spaced out, not translated). */
  addonNameByKey?: Map<string, string>;
}

export interface DeliveryMonitorFilters {
  /** The picked WORK TO DO queue; null narrows no queue at all. */
  view: MonitorWorkView | null;
  region: string | null;
  /** A partner id, or null for all. `"none"` survives only for a retired
   *  shared URL — the UI's own unassigned queue is the `no_logistics` view. */
  logisticsPartnerId: string | "none" | null;
  status: MonitorDeliveryStatus | null;
  search: string;
  /**
   * ⭐ THE CONTACT-WEEK PICK (owner ruling 2026-09-10) — ONE contact deadline,
   * or null for every date. It narrows only the `Call customer` queue, because
   * it is a question only that queue asks; anywhere else it would be a hidden
   * second narrowing of a list that looks complete.
   */
  contactDue: string | null;
  /** The strip's own `Overdue` chip: contact deadlines already behind us. It
   *  is always visible WITH ITS COUNT, so navigating to a quiet Thursday can
   *  never hide the calls that are already late. */
  contactOverdueOnly: boolean;
  /** Business today — `Overdue` is a question about it, answered here once. */
  todayIso: string;
}

/* ⛔ `isCalendarProjection` was DELETED by the owner ruling of 2026-09-10.
   It made the projection a SIDE EFFECT of the rail: picking `Selangor`
   silently replaced the calendar with a sheet, and the operator's way back was
   to notice `Clear filters`. Two NAMED tabs (`MonitorTopTab`) now decide which
   view is showing, and every narrowing applies to whichever one is open. */

/**
 * Every open delivery row as one card. The rows, the entry rule and the
 * status ladder are `delivery-work.ts`'s — the ONE arithmetic — so Monitor
 * and every other Delivery surface cannot disagree about which rows exist
 * or where each one stands. The missing-evidence facts are the Delivery
 * Orders register's, read off the SAME document row it reads.
 */
export function buildDeliveryMonitorCards(input: DeliveryMonitorSource): DeliveryMonitorCard[] {
  const rows = buildDeliveryScopeRows(input);
  const holidays = input.holidays ?? myHolidaySet();
  const docByNumber = new Map(input.deliveryOrders.map((d) => [d.do_number, d] as const));

  return rows.map((row): DeliveryMonitorCard => {
    const doc = row.doNumber ? docByNumber.get(row.doNumber) ?? null : null;
    /* The missing evidence and the contact deadline are the scope row's own
       facts — counted once in `delivery-work.ts`, the same reading the status
       line, the rail and the calendar share (Law D). */
    const missingProof = row.missingProof;
    /* ── THE GOODS, THE STOCK AND THE ARRIVAL (owner ruling 2026-09-10) ────
       Every one of these comes from a shared arithmetic and none of them is
       recomputed here: the shortage is `lineShortagesOf` over the register
       rows the list read carries, the readiness is the same function's
       whole-order answer, and the arrival state is `deliveryArrivalStateOf`
       over the purchase orders' own recorded dates. */
    /* ⭐ A SERVICE MOVES NO UNIT, so it is not part of what the register can be
       short of — counting a `Disposal` line would leave every order that books
       one permanently `Not ready` over goods that were never going to be
       allocated. The predicate is the ENTRY RULE's own (`lineKind !==
       "service"`), so what makes an order delivery work and what makes it
       ready are decided by one test. */
    /* ⭐ READINESS FOLLOWS THE SHIPMENT, NOT THE WHOLE SALES ORDER (owner
       ruling 2026-09-11). A split trip carries only its own groups, and
       counting the order's OTHER trip as this one's shortage told the operator
       a van was short of goods it was never going to carry. The scoping is the
       DO's own `trip_groups` derivation — the SAME `tripLinesOf` the register,
       the document page and the print path run (Law D), and a row with no
       document yet is the whole order by that function's own rule. */
    const lines = tripLinesOf(row.o.order_lines ?? [], doc?.trip_groups);
    const goods = monitorGoodsOf({
      o: row.o,
      lines,
      leg: row.leg,
      requestedIso: row.customerDeliveryIso,
      todayIso: input.todayIso,
      holidays,
      addonNameByKey: input.addonNameByKey,
    });
    const { readiness, items, extras } = goods;
    const contactDueIso = row.contactDueIso;
    /* The arrangement is COMPLETE only with a day AND a window on it. */
    const booked = row.confirmedIso !== null && row.confirmedTime !== null;
    /* ⭐ THE VAN HAS ALREADY BEEN (owner correction 2026-09-11, found in the
       rendered walk). Contact work is about arranging a delivery that has not
       happened. Once a RESULT is recorded — `Delivered`, or the one
       `Failed Delivery` rung that carries both a failure and a partial —
       there is nothing left to agree with the customer on this trip, and its
       remaining work is proof or a rebooking, which are the
       `Upload delivery proof` and `Failed Delivery` queues' own rows. A
       delivered trip sitting in `Call customer` because nobody recorded a
       time window sends an operator to phone a customer whose furniture is
       already in the house. */
    const settled = row.status.kind === "delivered" || row.status.kind === "arrived" || row.status.kind === "failed";
    return {
      scopeId: row.key,
      orderId: row.orderId,
      leg: row.leg,
      deliveryOrderId: doc?.id ?? null,
      doNumber: row.doNumber,
      confirmedDate: row.confirmedIso,
      confirmedTime: row.confirmedTime,
      booked,
      settled,
      eventType: row.intermediateLeg ? "transfer" : "delivery",
      customerName: row.customer,
      locality: row.location || null,
      goodsSummary: row.goods,
      logisticsPartnerId: row.logisticsId,
      logisticsPartnerName: row.logisticsName,
      region: regionBucketOf(row),
      statusKey: row.status.kind,
      statusLabel: row.status.label,
      statusTone: row.status.tone,
      statusSecond: row.status.second,
      statusSecondTone: row.status.secondTone,
      missingProof,
      proofReview: row.proofReview,
      items,
      extras,
      siteAccess: siteAccessOf(row.o),
      readiness,
      arrival: goods.arrival,
      contactDueIso,
      /* ⭐ A DATE WITHOUT AN AGREED TIME IS NOT A BOOKING (owner ruling
         2026-09-11). A customer who has been given a day but no window has not
         been told when to be home, and the old reading — `confirmedIso !==
         null` — closed the follow-up on exactly that half-finished
         arrangement. The conversation stays open until BOTH facts are
         recorded.

         Late is still a question about a RECORDED absence, never an inference
         about what the customer said: a contact ATTEMPT is not a confirmed
         booking, and neither is silence. */
      contactOverdue:
        contactDueIso !== null && contactDueIso < input.todayIso && !booked && !settled,
      scope: row,
      payment: monitorPaymentOf(row.o),
      stock: goods.stock,
    };
  });
}

/**
 * ⭐ THE GOODS, THE STOCK AND THE ARRIVAL OF ONE SHIPMENT — the ONE arithmetic
 * behind `Items & Stock` and the `Items, Services & Stock` panel (§8.3 · §8.5).
 *
 * Extracted from `buildDeliveryMonitorCards` unchanged (Payment Monitor Card
 * 02, 2026-09-16) so a surface that is not Delivery — the Payment Monitor —
 * reads Ready / Not ready over the SAME register rows, the same shortage and
 * the same arrival reader, rather than keeping a second opinion about whether
 * the goods are in. `lines` is the shipment's goods: a Delivery row passes its
 * trip's lines; an order with no Delivery row passes the whole order.
 */
export function monitorGoodsOf(input: {
  o: DeliveryScopeRow["o"];
  lines: DeliveryScopeRow["o"]["order_lines"];
  leg: number | null;
  requestedIso: string | null;
  todayIso: string;
  holidays: ReadonlySet<string>;
  addonNameByKey?: Map<string, string>;
}): {
  readiness: DeliveryStockReadiness;
  arrival: DeliveryArrivalState;
  stock: MonitorStock;
  items: MonitorGoodsLine[];
  extras: MonitorExtraLine[];
} {
  const row = { o: input.o, leg: input.leg };
  const lines = input.lines ?? [];
  const physical = lines
    .map((l, index) => ({ index, sku: l.sku, qty: l.qty }))
    .filter((l) => lineKind(l.sku) !== "service");
  const units = row.o.allocated_units ?? [];
  const readiness = deliveryStockReadinessOf(physical, units);
  const totalQty = physical.reduce((sum, l) => sum + Number(l.qty || 0), 0);
  const shortByLineIndex = new Map<number, number>();
  lineShortagesOf(physical, units).forEach((s, i) => {
    shortByLineIndex.set(physical[i]!.index, s.shortQty);
  });
  const items: MonitorGoodsLine[] = [];
  const extras: MonitorExtraLine[] = [];
  lines.forEach((line, index) => {
    if (SERVER_EXCLUSIVE_ADDON_KEYS.has(line.sku.trim().toUpperCase())) return;
    const kind = lineKind(line.sku);
    const entry: MonitorGoodsLine = {
      key: line.id ?? `${line.sku}-${index}`,
      lineId: line.id ?? null,
      sku: line.sku,
      name: lineName(line),
      category: goodsCategoryWordOf(line),
      qty: line.qty,
      shortQty: shortByLineIndex.get(index) ?? 0,
      receivedQty: row.leg != null ? null : receivedForBoundLine(line.id, line.qty, row.o.allocated_units, row.o.incoming_units),
    };
    /* `unknown` is a physical thing nobody recognised — it travels on the
       truck, so it belongs with the MAIN goods, never buried under the
       pillows (line-category's own D9 ruling). */
    if (kind === "core" || kind === "unknown") items.push(entry);
    else if (kind === "service") extras.push({ ...entry, kind: "service", shortQty: 0 });
    else extras.push({ ...entry, kind: "accessory" });
  });
  for (const [index, addon] of (row.o.order_addons ?? []).entries()) {
    const key = addon.addon_key ?? "";
    if (SERVER_EXCLUSIVE_ADDON_KEYS.has(key.toUpperCase())) continue;
    extras.push({
      key: `addon-${index}-${key}`,
      lineId: null,
      sku: key,
      name: addonName(key, input.addonNameByKey),
      category: "Service",
      qty: addon.qty,
      shortQty: 0,
      kind: "service",
    });
  }
  if ((row.o.delivery_stair_items ?? 0) > 0) extras.push({
    key: "stair-carry", lineId: null, sku: "STAIR_CARRY", category: "Service", kind: "service",
    name: MONITOR_COPY.stairCarry(row.o.delivery_stair_items!, row.o.delivery_floor ?? null),
    qty: row.o.delivery_stair_items!, shortQty: 0,
  });
  const arrival = deliveryArrivalStateOf({
    arrivals: row.o.po_arrivals ?? [],
    readiness,
    todayIso: input.todayIso,
    /* The arrival-check clock counts on the same holidays as every other
       Carres clock — handed in, never read from a second source. */
    holidays: input.holidays,
  });
  return {
    readiness,
    arrival,
    stock: monitorStockOf({ readiness, totalQty, arrival, requestedIso: input.requestedIso }),
    items,
    extras,
  };
}

/**
 * The addon's own catalog NAME. A key the catalog cannot name is spaced out
 * (`dispose-mattress` → `dispose mattress`) rather than printed raw: a
 * database word may not reach an operator (COPY-STANDARD), and inventing a
 * prettier name for a key nobody recognises would be worse than saying what
 * the order actually recorded.
 */
function addonName(key: string, names: Map<string, string> | undefined): string {
  const named = names?.get(key);
  if (named && named.trim()) return named.trim();
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return "Service";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * The site the crew meets — `Floor 3 · No lift`.
 *
 * Sales Orders owns both answers and Delivery only reads them. The lift is a
 * THREE-state fact (`Has lift` · `No lift` · nobody asked), so an unrecorded
 * lift prints nothing rather than the cheaper of the two answers.
 */
export function siteAccessOf(o: {
  delivery_floor?: number | null;
  delivery_has_lift?: boolean | null;
}): string | null {
  const parts: string[] = [];
  if (o.delivery_floor != null) parts.push(`${MONITOR_COPY.floor} ${o.delivery_floor}`);
  if (o.delivery_has_lift != null) {
    parts.push(o.delivery_has_lift ? MONITOR_COPY.hasLift : MONITOR_COPY.noLift);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * ⭐ THE CONTACT WEEK — Monday to Saturday, counted by CONTACT DEADLINE.
 *
 * These six dates are not delivery appointments and not supplier dates: each
 * one is the last day a customer conversation can open without being late. The
 * strip exists because *how many calls do I owe on Thursday?* is the question
 * the chase actually asks, and a flat list of 86 rows answers it by making the
 * operator count.
 *
 * Rows with NO deadline (the customer named no day) belong to no date and are
 * never hidden by one: they stay in the list under their own group.
 */
export interface ContactWeekDay {
  iso: string;
  count: number;
}

export function contactWeekOf(
  cards: readonly DeliveryMonitorCard[],
  weekOfIso: string,
): ContactWeekDay[] {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (!c.contactDueIso) continue;
    counts.set(c.contactDueIso, (counts.get(c.contactDueIso) ?? 0) + 1);
  }
  return operatingWeekOf(weekOfIso).map((iso) => ({ iso, count: counts.get(iso) ?? 0 }));
}

/** Every contact deadline already behind us with no agreed date — the chip's
 *  count, and the same rows the `Overdue contact work` band lists. */
export function overdueContactCards(
  cards: readonly DeliveryMonitorCard[],
): DeliveryMonitorCard[] {
  return sortByRequestedDeliveryDate(cards.filter((c) => c.contactOverdue));
}
/** A recorded delivered result still owed evidence — the `Upload delivery
 *  proof` queue's one membership test. §6.1: `Proof Rejected` and `More
 *  Proof Required` reopen it although a file is on record. */
export function needsProof(card: DeliveryMonitorCard): boolean {
  return card.missingProof.photo || card.missingProof.signedDo || proofReopened(card.proofReview);
}

/** §6.1 — a file on record that no review has judged yet: the `Check
 *  delivery proof` queue's one membership test. */
export function needsProofReview(card: DeliveryMonitorCard): boolean {
  return card.proofReview.state === "pending";
}

/** The exact missing action(s), in the governed words — both when both. A
 *  reopened upload names the file the driver sends, with the review's reason
 *  as the row's second line (the status line already carries it). */
export function missingProofLabels(card: DeliveryMonitorCard): string[] {
  const out: string[] = [];
  if (card.missingProof.photo) out.push(DOR_COPY.uploadPhoto);
  if (card.missingProof.signedDo) out.push(DOR_COPY.uploadSignedDo);
  if (out.length === 0 && proofReopened(card.proofReview)) out.push(DOR_COPY.uploadPhoto);
  return out;
}

/**
 * The one href arithmetic. An issued DO opens the formal Delivery Order; a
 * row without one opens its Monitor row, brief unfolded — Monitor never
 * issues the document.
 */
export function monitorCardHref(card: DeliveryMonitorCard): string {
  if (card.deliveryOrderId) {
    return `/operation/delivery-orders/${encodeURIComponent(card.deliveryOrderId)}`;
  }
  /* Edit Delivery is RETIRED (owner ruling 2026-09-13): a row without a
     document opens on Monitor with its brief already unfolded. */
  return monitorRowHref(card.scopeId);
}

/** The Monitor row itself, brief unfolded — the one address of a scope's
 *  Delivery-owned writes since Edit Delivery retired (§8.6). */
export function monitorRowHref(scopeId: string): string {
  return `/operation?tab=delivery&view=all&open=${encodeURIComponent(scopeId)}`;
}

/* ── THE CHASE — who must be called, and what the operator does next ────── */

/**
 * ⭐ ONE ROW, ONE NEXT ACT (the chase workflow, Delivery MASTER §8).
 *
 * ```
 * the goods already reached the customer   Upload the exact missing evidence
 * nobody carries this row yet              Assign logistics
 * a partner carries it, no agreed day      Call {partner} — confirm delivery
 *                                          date, then Edit Delivery records it
 * everything agreed                        Edit Delivery
 * ```
 *
 * ⭐ A RECORDED RESULT OUTRANKS AN UNASSIGNED PARTNER (correction 2026-09-10).
 * A delivery that already happened cannot have `Assign logistics` as its next
 * act: the trip is over, and the one thing still outstanding is the proof. The
 * old order asked the operator to book a carrier for goods the customer was
 * already sitting on — which is how a real proof queue could print an act
 * nobody could perform.
 *
 * Every branch is derived from RECORDED facts — the evidence ledger, a
 * partner, a confirmed date — and never from the clock.
 */
export type MonitorRowAction =
  | { kind: "upload_proof"; label: string }
  | { kind: "check_proof"; label: string }
  | { kind: "assign_logistics"; label: string }
  | { kind: "confirm_date"; call: string; result: string; label: string }
  | { kind: "edit_delivery"; label: string };

export function monitorRowAction(card: DeliveryMonitorCard): MonitorRowAction {
  if (needsProof(card)) {
    /* The EXACT missing file(s), in the register's own governed words — both
       when both are missing (owner correction 2026-09-07). */
    return { kind: "upload_proof", label: missingProofLabels(card).join(" · ") };
  }
  if (needsProofReview(card)) {
    /* §6.1 — the file is there; the judgement is the next act. */
    return { kind: "check_proof", label: MONITOR_COPY.checkProof };
  }
  if (card.logisticsPartnerId === null) {
    return { kind: "assign_logistics", label: MONITOR_COPY.assignLogistics };
  }
  /* ⭐ AND A TRIP THAT HAS ALREADY RUN IS NOT A CHASE (owner correction
     2026-09-11). `Call {partner} — confirm delivery date` is about arranging
     a delivery that has not happened. A DELIVERED trip whose time window was
     never written down is `booked: false` and used to print that line — the
     same mistake the `Call customer` queue made, in the one cell that tells
     the operator what to DO. A recorded result outranks it, exactly as it
     already outranks an unassigned partner. */
  if (!card.booked && !card.settled) {
    /* The partner's own name, from the row — never a hard-coded company. A
       partner id whose name has not resolved would print an id at the
       operator, so the governed absence word stands in for it. */
    /* ⭐ TWO STRUCTURED LINES from the one word module (owner ruling
       2026-09-13): `Call {partner}` over `Confirm the delivery date` — or over
       `Confirm the delivery time` when the DAY is agreed and only the window
       is missing (owner ruling 2026-09-12). No carrier is ever hard-coded. */
    const lines = orderActionLines("confirm_delivery_date", {
      logistics: card.logisticsPartnerName,
      dayAgreed: card.confirmedDate !== null,
    });
    return {
      kind: "confirm_date",
      call: lines.act,
      result: lines.result ?? "",
      label: MONITOR_COPY.editDelivery,
    };
  }
  return { kind: "edit_delivery", label: MONITOR_COPY.editDelivery };
}

/** The action cell's words as ONE string — what the Excel export prints, so
 *  the sheet and the screen never say two different things. */
export function monitorRowActionText(card: DeliveryMonitorCard): string {
  const action = monitorRowAction(card);
  return action.kind === "confirm_date"
    ? `${action.call} · ${action.result} · ${action.label}`
    : action.label;
}

/* ── The filters — each one answers, and they COMBINE ──────────────────── */

function matchesView(card: DeliveryMonitorCard, view: MonitorWorkView, todayIso: string): boolean {
  switch (view) {
    case "all":
      /* Every open delivery row — the unfiltered selectable listing. */
      return true;
    case "no_logistics":
      /* The bulk-assignment queue: nobody carries this row yet — across ALL
         dates, with or without a DO or a confirmed date. */
      return card.logisticsPartnerId === null;
    case "no_confirmed_date":
      /* ⭐ A DAY WITHOUT A WINDOW IS STILL CONTACT WORK (owner ruling
         2026-09-11): the customer has not been told when to be home, so the
         conversation is not finished and the row does not leave the queue.
         A trip that has already RUN is the one exception — there is nothing
         left to arrange, and its remaining work is a different queue's. */
      return !card.booked && !card.settled;
    case "overdue":
      /* A confirmed date behind us with no delivered result. A recorded
         delivery is never overdue — its remaining work is proof, below.
         The predicate lives in ONE place so the rail queue, the Month view's
         exception count and the work order cannot disagree (Law D). */
      return isOverdueDelivery(card, todayIso);
    case "failed":
      return card.statusKey === "failed";
    case "upload_proof":
      return needsProof(card);
    case "check_proof":
      return needsProofReview(card);
    case "details_incomplete":
      /* The status ladder already decided this: a row whose FIRST fact is the
         missing Sales fact. Reading `statusKey` rather than re-testing the
         fields is what keeps the rail row, the column and the sort agreeing
         (Law D). */
      return card.statusKey === "details_incomplete";
  }
}

/** The queues that are exceptions — the Month view's `Exceptions` count is
 *  exactly what these three rail rows would list, never a fourth number. */
const EXCEPTION_VIEWS: readonly MonitorWorkView[] = ["overdue", "failed", "upload_proof"];

export function isExceptionCard(card: DeliveryMonitorCard, todayIso: string): boolean {
  return EXCEPTION_VIEWS.some((v) => matchesView(card, v, todayIso));
}

function matchesRegion(card: DeliveryMonitorCard, picked: string | null): boolean {
  return picked === null || card.region === picked;
}

function matchesLogisticsPartner(
  card: DeliveryMonitorCard,
  picked: DeliveryMonitorFilters["logisticsPartnerId"],
): boolean {
  if (picked === null) return true;
  if (picked === "none") return card.logisticsPartnerId === null;
  return card.logisticsPartnerId === picked;
}

/* The pick narrows by the PRINTED WORD, not the internal key: the dropdown
   carries one option per word (MONITOR_STATUS_FILTERS above), so picking
   `Call customer` must keep every row that prints `Call customer` whichever
   rung produced it. */
function matchesStatus(card: DeliveryMonitorCard, picked: MonitorDeliveryStatus | null): boolean {
  return picked === null || MONITOR_STATUS_LABEL[card.statusKey] === MONITOR_STATUS_LABEL[picked];
}

/**
 * The module's ONE search — the customer, the SO, the DO, the place, the goods
 * and the partner. Exported because the phone's work list has its own visible
 * box (the sheet's box is the DataGrid's, and a phone has no sheet), and two
 * search rules over one workspace would be two answers to one question.
 */
export function matchesMonitorSearch(card: DeliveryMonitorCard, search: string): boolean {
  return matchesSearch(card, search);
}

function matchesSearch(card: DeliveryMonitorCard, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    card.customerName,
    `SO-${card.scope.so}`,
    card.doNumber ?? "",
    card.locality ?? "",
    card.goodsSummary,
    card.logisticsPartnerName ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/**
 * The Confirmed deliveries calendar's cards: a CONFIRMED date inside the
 * visible window, narrowed by the same STATE / LOGISTICS PARTNER / DELIVERY
 * STATUS picks the work list uses (owner ruling 2026-09-10 — a narrowing now
 * applies to whichever view is open instead of switching the view).
 *
 * The WORK TO DO queue is deliberately NOT applied: the queues are questions
 * about work that has not been agreed yet, and answering one on a calendar of
 * agreed appointments would print an empty week for a real queue.
 */
export function filterMonitorCalendarCards(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
): DeliveryMonitorCard[] {
  const daySet = new Set(visibleDays);
  return cards.filter(
    (c) =>
      c.confirmedDate !== null &&
      daySet.has(c.confirmedDate) &&
      matchesRegion(c, filters.region) &&
      matchesLogisticsPartner(c, filters.logisticsPartnerId) &&
      matchesStatus(c, filters.status) &&
      matchesSearch(c, filters.search),
  );
}

/**
 * The WORK LIST's rows. A work queue is an operational question and answers
 * across ALL dates (a Failed Delivery is usually past-dated; hiding it behind
 * the window would read `0` while the exception is real). No queue picked
 * constrains nothing here — a state, partner or status pick alone lists every
 * matching open row.
 */
export function filterMonitorListRows(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
): DeliveryMonitorCard[] {
  const chase = filters.view === "no_confirmed_date";
  const rows = cards.filter(
    (c) =>
      (filters.view === null ? true : matchesView(c, filters.view, filters.todayIso)) &&
      matchesRegion(c, filters.region) &&
      matchesLogisticsPartner(c, filters.logisticsPartnerId) &&
      matchesStatus(c, filters.status) &&
      /* The contact-week pick belongs to the chase and to nothing else. */
      (!chase || !filters.contactOverdueOnly || c.contactOverdue) &&
      (!chase ||
        filters.contactOverdueOnly ||
        filters.contactDue === null ||
        c.contactDueIso === filters.contactDue) &&
      matchesSearch(c, filters.search),
  );
  /* `Call customer` keeps its own governed order (earliest requested date
     first). Every other queue — `All delivery work` above all — answers the
     morning question, so it leads with what is late (owner ruling
     2026-09-14). Before this, no queue applied any sort and the list fell out
     in roughly descending document number. */
  return chase ? sortByRequestedDeliveryDate(rows) : sortByWorkUrgency(rows, filters.todayIso);
}

/** The stable tie-break every Delivery listing uses: the customer name
 *  (locale-aware), then the row's own id — so equal dates never reshuffle. */
function tieBreak(a: DeliveryMonitorCard, b: DeliveryMonitorCard): number {
  return (
    a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" }) ||
    a.scopeId.localeCompare(b.scopeId)
  );
}

/**
 * ⭐ THE CHASE ORDER — earliest `Requested Delivery Date` first.
 *
 * `No confirmed date` is a queue of customers waiting for an answer, and the
 * customer who asked for the earliest day is the one whose answer is most
 * expensive to be late with. A row carrying NO requested date sorts LAST: it
 * is real work, but nothing about it is due before a dated one, and putting
 * an absence at the top would push every dated chase off the first screen.
 *
 * `To be confirmed` and "never named a day" both sort last — they are two
 * spellings of *no date to be early for*. The tie-break is the customer name
 * then the stable row id, so the list never reshuffles between renders.
 */
/**
 * ⭐ AN OVERDUE DELIVERY — the ONE predicate (Law D). A confirmed day is
 * behind us and no delivered result was ever recorded. Read by the
 * `Overdue delivery` rail queue, the Month view's `Exceptions` count and the
 * work order below; three readings of one fact were three chances to disagree.
 */
export function isOverdueDelivery(card: DeliveryMonitorCard, todayIso: string): boolean {
  return (
    card.confirmedDate !== null &&
    card.confirmedDate < todayIso &&
    !card.settled
  );
}

/**
 * ⭐ THE ROW'S NEXT ACTION DEADLINE — the day something must happen, or null
 * when nothing is owed.
 *
 * A trip with an agreed day is owed ON that day. A trip with no agreed day is
 * owed by its CONTACT deadline, because the next act is the conversation. A
 * settled row — delivered, failed or cancelled — owes no further act, and its
 * remaining work (proof) is its own queue's job, so it ranks with the rest.
 */
export function actionDeadlineIso(card: DeliveryMonitorCard): string | null {
  if (card.settled) return null;
  return card.confirmedDate ?? card.contactDueIso;
}

/**
 * ⭐ THE WORK ORDER (owner ruling 2026-09-14, Delivery MASTER §8.3).
 *
 * `All delivery work` ordered by what is actually most urgent, never by
 * document number. Measured on production the day this shipped: the ONE
 * overdue row sat NINTH, under eight rows that were not yet due, because the
 * view applied no sort at all.
 *
 * ```
 * 0  late            a confirmed day has passed with no result, OR a contact
 *                    deadline has passed. Both are late work; MASTER §8.2
 *                    keeps them apart for COUNTING because they are two
 *                    populations, and counting separately while sorting
 *                    together is consistent — they answer two questions and
 *                    share one urgency.
 * 1  due today       the next action deadline is today
 * 2  has a deadline  soonest first
 * 3  no deadline     nothing is owed on a day
 * 4  incomplete      `Order details incomplete` sinks BENEATH live work, so a
 *                    missing postcode can never hide an overdue delivery
 *                    (owner ruling 2026-09-14). It keeps its §8.4 status rung;
 *                    only its ORDER changes.
 * ```
 */
function urgencyBand(card: DeliveryMonitorCard, todayIso: string): number {
  if (card.statusKey === "details_incomplete") return 4;
  if (isOverdueDelivery(card, todayIso) || card.contactOverdue) return 0;
  const due = actionDeadlineIso(card);
  if (due === null) return 3;
  if (due === todayIso) return 1;
  return 2;
}

export function sortByWorkUrgency(
  rows: readonly DeliveryMonitorCard[],
  todayIso: string,
): DeliveryMonitorCard[] {
  return [...rows].sort((a, b) => {
    const ba = urgencyBand(a, todayIso);
    const bb = urgencyBand(b, todayIso);
    if (ba !== bb) return ba - bb;
    /* Inside a band the nearer deadline leads; an absence is ranked
       EXPLICITLY rather than by a sentinel, the same rule
       `sortByRequestedDeliveryDate` states. */
    const x = actionDeadlineIso(a);
    const y = actionDeadlineIso(b);
    if (x === null || y === null) {
      if (x === y) return tieBreak(a, b);
      return x === null ? 1 : -1;
    }
    return x < y ? -1 : x > y ? 1 : tieBreak(a, b);
  });
}

export function sortByRequestedDeliveryDate(
  rows: readonly DeliveryMonitorCard[],
): DeliveryMonitorCard[] {
  return [...rows].sort((a, b) => {
    const x = a.scope.customerDeliveryIso;
    const y = b.scope.customerDeliveryIso;
    /* The absence is ranked EXPLICITLY rather than by a sentinel string: an
       ICU collation does not promise where a padding character lands against
       a digit, and "missing dates sort last" is a business rule, not a
       coincidence of the collator. ISO dates then compare as plain strings,
       which is exactly chronological. */
    if (x === null || y === null) {
      if (x === y) return tieBreak(a, b);
      return x === null ? 1 : -1;
    }
    return x < y ? -1 : x > y ? 1 : tieBreak(a, b);
  });
}

/**
 * Each visible day's cards, in reading order: the planned window's start, then
 * the customer (locale-aware), then the stable row id. Card height never
 * implies duration and no hour axis exists — the order IS the timeline.
 * Every visible day answers, an empty one with an empty list.
 */
export function groupCardsByDay(
  cards: readonly DeliveryMonitorCard[],
  visibleDays: readonly string[],
): Map<string, DeliveryMonitorCard[]> {
  const grouped = new Map<string, DeliveryMonitorCard[]>();
  for (const day of visibleDays) grouped.set(day, []);
  for (const c of cards) {
    if (c.confirmedDate && grouped.has(c.confirmedDate)) grouped.get(c.confirmedDate)!.push(c);
  }
  for (const list of grouped.values()) {
    list.sort(
      (a, b) =>
        /* A card with no agreed window sorts after every agreed one. */
        (a.confirmedTime ?? "￿").localeCompare(b.confirmedTime ?? "￿") ||
        a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" }) ||
        a.scopeId.localeCompare(b.scopeId),
    );
  }
  return grouped;
}

/* ── THE MONTH'S COUNTS — compact, never cards (owner correction 2026-09-07) ── */

export interface MonthDayCounts {
  deliveries: number;
  transfers: number;
  exceptions: number;
  noLogistics: number;
}

/**
 * Per date: how many deliveries are confirmed, how many of them are an
 * exception (the same three exception queues the rail lists) and how many
 * still have no Logistics Partner. Zero everywhere prints nothing.
 */
export function monthDayCounts(
  cards: readonly DeliveryMonitorCard[],
  todayIso: string,
): Map<string, MonthDayCounts> {
  const out = new Map<string, MonthDayCounts>();
  for (const c of cards) {
    if (!c.confirmedDate) continue;
    const cell = out.get(c.confirmedDate) ?? { deliveries: 0, transfers: 0, exceptions: 0, noLogistics: 0 };
    if (c.eventType === "transfer") cell.transfers += 1;
    else cell.deliveries += 1;
    if (isExceptionCard(c, todayIso)) cell.exceptions += 1;
    if (c.logisticsPartnerId === null) cell.noLogistics += 1;
    out.set(c.confirmedDate, cell);
  }
  return out;
}

/** The month cell's aria sentence — the same three facts, in words. */
export function monthDaySentence(dateLabel: string, counts: MonthDayCounts | undefined): string {
  if (!counts || counts.deliveries + counts.transfers === 0) return `${dateLabel} — ${MONITOR_COPY.emptyDay}`;
  const parts = [];
  if (counts.deliveries > 0) parts.push(`${counts.deliveries} ${counts.deliveries === 1 ? "delivery" : "deliveries"}`);
  if (counts.transfers > 0) parts.push(`${counts.transfers} ${counts.transfers === 1 ? "transfer" : "transfers"}`);
  if (counts.exceptions > 0) {
    parts.push(`${counts.exceptions} ${counts.exceptions === 1 ? "exception" : "exceptions"}`);
  }
  if (counts.noLogistics > 0) parts.push(`${counts.noLogistics} ${MONITOR_COPY.noLogistics}`);
  return `${dateLabel} — ${parts.join(" · ")}`;
}

/** Presentation of the existing stock/payment facts, not a permission to
 * issue or dispatch. Once goods moved, show the recorded ETA/result/proof
 * instead of diagnosing a pre-departure shortage against consumed stock. */
export function monitorScheduleStatusOf(card: DeliveryMonitorCard): {
  progress: DeliveryScopeRow["progress"];
  supporting: string | null;
  tone: DeliveryWorkStatusTone;
} {
  const progress = card.scope.progress;
  if (["collected", "delivering", "arrived", "delivered", "failed"].includes(progress.kind)) {
    return { progress, supporting: progress.second, tone: progress.secondTone ?? "none" };
  }
  if (card.payment.tone === "red") return { progress, supporting: MONITOR_COPY.paymentBlocked, tone: "orange" as const };
  if (!moneyOfOrder(card.scope.o).known) return { progress, supporting: "Order details incomplete", tone: "orange" as const };
  if (!card.readiness.ready) return { progress, supporting: MONITOR_COPY.stockRisk, tone: "orange" as const };
  const arrangement = card.scope.arrangement;
  if (!card.logisticsPartnerId || !card.confirmedTime || !arrangement?.driver_name?.trim() || !arrangement.vehicle?.trim() || !arrangement.expected_arrival?.trim()) {
    return { progress, supporting: MONITOR_COPY.logisticsIncomplete, tone: "orange" as const };
  }
  if (card.scope.missingFacts.length) return { progress, supporting: "Order details incomplete", tone: "orange" as const };
  if (!card.deliveryOrderId) return { progress, supporting: MONITOR_COPY.doNotReleased, tone: "orange" as const };
  return { progress, supporting: "Ready", tone: "green" as const };
}

/** The selected schedule scope, not the all-dates work population. */
export function scheduleCountsOf(cards: readonly DeliveryMonitorCard[]): { deliveries: number; transfers: number } {
  return cards.reduce((count, card) => {
    if (card.eventType === "transfer") count.transfers += 1;
    else count.deliveries += 1;
    return count;
  }, { deliveries: 0, transfers: 0 });
}

export function scheduleSplitSentence(count: { deliveries: number; transfers: number }): string {
  return `${count.deliveries} customer ${count.deliveries === 1 ? "delivery" : "deliveries"} · ${count.transfers} ${count.transfers === 1 ? "transfer" : "transfers"}`;
}

/* ── The calendar's empty range — ONE spanning sentence, never six copies ── */

/**
 * The whole visible range holding nothing prints one spanning state (owner
 * correction 2026-09-06), never the same absence repeated in every column.
 * The caller supplies the printed date strings — `fmt-date.ts` owns spelling.
 */
export function emptyRangeSentence(
  visibleDays: readonly string[],
  fmt: (iso: string) => string,
): string {
  const first = visibleDays[0];
  const last = visibleDays[visibleDays.length - 1];
  if (!first || !last) return "No deliveries are scheduled.";
  return `No deliveries are scheduled from ${fmt(first)} to ${fmt(last)}.`;
}

/** `86 deliveries need a confirmed date.` — printed only from the REAL count. */
export function needConfirmedDateSentence(n: number): string {
  return n === 1
    ? "1 delivery needs a confirmed date."
    : `${n} deliveries need a confirmed date.`;
}

/** The work list's footer — it counts deliveries (a Journey leg is its own
 *  delivery), never `scopes` and never orders (owner correction 2026-09-07). */
export function deliveriesFooter(shown: number, total: number): string {
  const word = total === 1 ? "delivery" : "deliveries";
  return shown === total ? `${shown} ${word}` : `${shown} of ${total} ${word}`;
}

/** The selection toolbar's count — no invented unit word (COPY-STANDARD,
 *  owner correction 2026-09-07). */
export function selectedSentence(n: number): string {
  return `${n} selected`;
}

/* ── The active-filter summary above the work list ───────────────────────── */

/**
 * Every active pick, in rail order, so a combined narrowing (86 → 35) is
 * visible above the rows it produced rather than only in a rail row the
 * operator may have scrolled past. Empty = nothing picked. `All delivery
 * work` is a queue like any other and prints, so the way back to the
 * Calendar (`Clear filters`) is always on screen.
 */
export function activeFilterLabels(
  filters: DeliveryMonitorFilters,
  partnerNameOf: (id: string) => string | null,
): string[] {
  const out: string[] = [];
  if (filters.view !== null) out.push(MONITOR_VIEW_LABEL[filters.view]);
  if (filters.region !== null) out.push(filters.region);
  if (filters.logisticsPartnerId === "none") out.push(MONITOR_COPY.noLogistics);
  else if (filters.logisticsPartnerId !== null) {
    out.push(partnerNameOf(filters.logisticsPartnerId) ?? filters.logisticsPartnerId);
  }
  if (filters.status !== null) out.push(MONITOR_STATUS_LABEL[filters.status]);
  return out;
}

/* ── The rail counts — Law D: what clicking each row will actually give ── */

export interface MonitorRailRow {
  key: string;
  label: string;
  count: number;
}

export interface MonitorRails {
  work: Record<MonitorWorkView, number>;
  regions: MonitorRailRow[];
  logistics: MonitorRailRow[];
  status: Record<MonitorDeliveryStatus, number>;
  /**
   * WHAT `All` WOULD GIVE BACK (owner ruling 2026-09-12). Each dropdown
   * needs the count for clearing its OWN condition, and it is the same
   * cross-computed number the rows under it already obey: the cards surviving
   * every OTHER group unchanged. Printing the whole register size instead
   * would make `All states (89)` disagree with the 12 rows a picked queue
   * actually leaves.
   */
  regionTotal: number;
  logisticsTotal: number;
  statusTotal: number;
}

/**
 * Every group's counts are computed over the cards the OTHER groups have
 * already narrowed, so a count is always "what I will get if I click this" —
 * never a number that disagrees with the listing under it.
 *
 * STATE: direct state/jurisdiction names only, derived from the real records
 * — no EAST MALAYSIA / WEST MALAYSIA / SINGAPORE sub-headings, no `Other`
 * bucket, no fixed zero rows. A picked state stays listed at 0 until unpicked.
 *
 * LOGISTICS PARTNER: only the governed partners genuinely carrying a matching
 * row (governed roster order first, then others by name), and the operator's
 * own pick even at 0. `No logistics picked` lives in WORK TO DO as a primary
 * queue and is never duplicated here.
 *
 * DELIVERY STATUS: the three fixed rungs, live counts, zero printed.
 */
export function buildMonitorRails(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  partners: readonly { id: string; name: string }[],
): MonitorRails {
  const survives = (
    c: DeliveryMonitorCard,
    except: "view" | "region" | "logistics" | "status",
  ) =>
    (except === "view" ||
      filters.view === null ||
      matchesView(c, filters.view, filters.todayIso)) &&
    (except === "region" || matchesRegion(c, filters.region)) &&
    (except === "logistics" || matchesLogisticsPartner(c, filters.logisticsPartnerId)) &&
    (except === "status" || matchesStatus(c, filters.status)) &&
    matchesSearch(c, filters.search);

  const forWork = cards.filter((c) => survives(c, "view"));
  const forRegion = cards.filter((c) => survives(c, "region"));
  const forLogistics = cards.filter((c) => survives(c, "logistics"));
  const forStatus = cards.filter((c) => survives(c, "status"));
  /* Each group own `All` is that group own population — the same list its
     rows are counted from, so the dropdown and the rows cannot disagree. */
  const regionTotal = forRegion.length;
  const logisticsTotal = forLogistics.length;
  const statusTotal = forStatus.length;

  const work = Object.fromEntries(
    MONITOR_WORK_VIEWS.map((v) => [
      v,
      forWork.filter((c) => matchesView(c, v, filters.todayIso)).length,
    ]),
  ) as Record<MonitorWorkView, number>;

  /* STATE — flat direct names from the data, ordered by count then name. */
  const regionCounts = new Map<string, number>();
  for (const c of forRegion) {
    if (c.region) regionCounts.set(c.region, (regionCounts.get(c.region) ?? 0) + 1);
  }
  /* A PICKED ROW NEVER DISAPPEARS — a chosen state stays listed at 0. */
  if (filters.region && !regionCounts.has(filters.region)) regionCounts.set(filters.region, 0);
  const regions: MonitorRailRow[] = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: key, count }));

  /* LOGISTICS PARTNER — partners actually carrying a matching row. The display
     name for an id comes from the partners table first, else from the cards —
     a raw id must never become a rail label. */
  const countByPartnerId = new Map<string, number>();
  const partnerNameById = new Map(partners.map((p) => [p.id, p.name] as const));
  for (const c of forLogistics) {
    if (c.logisticsPartnerId === null) continue;
    countByPartnerId.set(
      c.logisticsPartnerId,
      (countByPartnerId.get(c.logisticsPartnerId) ?? 0) + 1,
    );
    if (!partnerNameById.has(c.logisticsPartnerId) && c.logisticsPartnerName) {
      partnerNameById.set(c.logisticsPartnerId, c.logisticsPartnerName);
    }
  }
  const ids = new Set<string>([
    ...countByPartnerId.keys(),
    ...(filters.logisticsPartnerId && filters.logisticsPartnerId !== "none"
      ? [filters.logisticsPartnerId]
      : []),
  ]);
  const rowsById = [...ids].map((id) => ({
    key: id,
    label: partnerNameById.get(id) ?? id,
    count: countByPartnerId.get(id) ?? 0,
  }));
  /* Governed roster order first (NETS · AL · TEOW · TT · EU · SSY · HOUZS),
     then anyone else by name — the ruled reading order, applied only to the
     partners genuinely present. */
  const rank = new Map(GOVERNED_LOGISTICS.map((name, i) => [name, i] as const));
  const logistics = rowsById.sort((a, b) => {
    const ra = rank.get(a.label as (typeof GOVERNED_LOGISTICS)[number]) ?? 99;
    const rb = rank.get(b.label as (typeof GOVERNED_LOGISTICS)[number]) ?? 99;
    return ra - rb || a.label.localeCompare(b.label);
  });

  const status = Object.fromEntries(
    MONITOR_STATUS_FILTERS.map((s) => [
      s,
      forStatus.filter((c) => MONITOR_STATUS_LABEL[c.statusKey] === MONITOR_STATUS_LABEL[s]).length,
    ]),
  ) as Record<MonitorDeliveryStatus, number>;

  return { work, regions, logistics, status, regionTotal, logisticsTotal, statusTotal };
}
