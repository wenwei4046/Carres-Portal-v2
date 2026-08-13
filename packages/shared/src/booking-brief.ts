/**
 * CARD 3 — EARLY LOGISTICS ASSIGNMENT + CUSTOMER BOOKING · the booking brief
 * (owner ruling 2026-08-13, docs/orders/MASTER.md).
 *
 * The approved journey, and the sentence this module exists for:
 *
 *   T−3 before the Customer Promised Deadline
 *   → CONTACT CUSTOMER, regardless of stock readiness
 *     Operations provides: the customer promised deadline · the latest Stock
 *     ETA · the expected delivery scope · what IS and IS NOT expected in
 *   → Logistics discusses the actual appointment with the customer
 *   → CONFIRMED DELIVERY APPOINTMENT
 *
 * **The call is not gated on the goods.** Rule 3 of the ruling: *"Stock ETA
 * informs the conversation; it does not decide whether the conversation
 * happens."* Nothing in here may return "no brief" because the goods are not
 * in — a brief whose answer is "nothing is in yet, here is the supplier's
 * date" is exactly the brief that call needs.
 *
 * **THREE SEPARATE TRUTHS, and this module keeps them apart** (Rule 4):
 *
 *   assignedLogistics   who we picked to carry it        — the order's assignment
 *   stockEtaIso         when the goods are expected in   — the supplier's word
 *   appointment         the day + slot the CUSTOMER agreed — their word
 *
 * They are three fields, never one. `appointment.partnerName` is the carrier
 * the appointment was AGREED WITH (0346), not the one currently assigned, and
 * `carrierDrift` is raised when they part company — reassigning logistics after
 * a customer said yes is a fact the operator must SEE, never a silent rewrite.
 *
 * And the promised deadline is not the appointment either (Rule 5): ten orders
 * may all promise 20 Aug while capacity allows five deliveries, so
 * `promisedDateIso` and `appointment.dateIso` are separate fields that this
 * module never collapses and never derives from one another.
 *
 * ONE arithmetic (Law D): the contact window is the SAME `delivery-queue` step
 * clock the Orders list and the Delivery page already run — `chase`, whose lead
 * is the `logistics_call_working_days` setting (3 since 0342). It is not
 * respelt here; it is called. The working week is Mon–Sat with the injected
 * Malaysian holiday set, exactly as every other delivery clock.
 *
 * PURE — no clock, no I/O. `todayIso`, the holiday options and the queue leads
 * are all handed in.
 */

import { deliveryStepDueIso, type DeliveryQueueLeads } from "./delivery-queue";
import {
  deliveryGroupLabel,
  deliveryGroupOf,
  type DeliveryGroupKey,
} from "./delivery-groups";
import type { SalesOrderAllocation } from "./sales-order-allocation";
import type { IsoDate, WorkingDayOptions } from "./working-days";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const iso = (v: string | null | undefined): IsoDate | null => {
  const d = (v ?? "").slice(0, 10);
  return ISO_DATE.test(d) ? d : null;
};

/**
 * Where the customer conversation stands against its own T−3 deadline.
 *
 *   `done`      the customer has already confirmed a day + slot
 *   `open`      today is on or after T−3 and no appointment exists — CALL
 *   `upcoming`  the window has not opened yet
 *   `late`      T−3 has passed with no appointment
 *   `no_anchor` the promised date is TBD — a step with no anchor is never late
 */
export type ContactWindow = "done" | "open" | "upcoming" | "late" | "no_anchor";

/** A named logistics company. */
export interface BriefCarrier {
  partnerId: string | null;
  partnerName: string | null;
}

/** The CONFIRMED DELIVERY APPOINTMENT — a real business fact, not a checkbox.
 *  All four facts the ruling requires of it, and no fifth. */
export interface BookingAppointment {
  dateIso: IsoDate;
  /** The slot / time window the customer agreed to. */
  slot: string;
  /** The carrier the appointment was agreed WITH (0346). */
  carrier: BriefCarrier;
  /** Which delivery groups this appointment carries. NULL scope in the store
   *  means the whole order, and it arrives here as every group the order has —
   *  the brief states the scope, it never makes the reader infer it. */
  scope: DeliveryGroupKey[];
  /** Operator sentence for the scope, e.g. `Bed set` or `Bed set + Sofa`. */
  scopeLabel: string;
  confirmedAt: string | null;
}

/** One committed product, with the only two questions the call needs about it:
 *  is it in, and if not, when. */
export interface BriefExpectedLine {
  sku: string;
  committedQty: number;
  /** Card 2: units reserved or sold to THIS order. */
  allocatedQty: number;
  /** committed − allocated. > 0 means this line is NOT in. */
  shortQty: number;
  /** The supplier's ready date for this line, when one is on file. */
  expectedInIso: IsoDate | null;
  /** True when the register already holds every committed unit for this line. */
  isIn: boolean;
  group: DeliveryGroupKey | null;
}

export interface BookingBrief {
  orderId: string;
  soRef: string;

  // ── the four facts Operations puts on the call ──────────────────────────
  /** The customer's promised deadline. NEVER the appointment. */
  promisedDateIso: IsoDate | null;
  promisedIsTbd: boolean;
  /** The latest supplier ready date across the lines still short. Informs the
   *  conversation; never decides whether it happens. */
  stockEtaIso: IsoDate | null;
  /** The delivery groups this order has at all — the expected scope. */
  expectedScope: DeliveryGroupKey[];
  expectedScopeLabel: string;
  /** Per committed line: what is in and what is not. */
  lines: BriefExpectedLine[];
  /** The short version the operator reads out: what is in / what is not. */
  goodsIn: BriefExpectedLine[];
  goodsNotIn: BriefExpectedLine[];

  // ── the three separate truths ───────────────────────────────────────────
  assignedLogistics: BriefCarrier | null;
  appointment: BookingAppointment | null;
  /** The appointment was agreed with a different company than the one assigned
   *  now. Not an error — a drift the operator must see before the truck day. */
  carrierDrift: boolean;

  // ── the T−3 clock ───────────────────────────────────────────────────────
  /** The last day the customer conversation can open without being late —
   *  the `chase` step's own due date, on the working calendar. */
  contactDueIso: IsoDate | null;
  contactWindow: ContactWindow;
  /** True exactly when `contactWindow === "late"`. */
  contactOverdue: boolean;
}

export interface BookingBriefInput {
  orderId: string;
  soRef: string;
  promisedDateIso?: string | null;
  promisedIsTbd?: boolean | null;
  /** Per-SKU supplier ready dates (`ops_order_control.line_etas`). */
  lineEtas?: Readonly<Record<string, string>> | null;
  /** The order-level supplier ready date, when the per-line map is empty. */
  orderStockEtaIso?: string | null;
  /** Card 2's answer — committed vs physically allocated, per line. */
  allocation: SalesOrderAllocation;
  /** The company currently assigned to carry this order. */
  assignedLogistics?: BriefCarrier | null;
  /** The live appointment, straight off the overlay. */
  booking?: {
    stage?: string | null;
    confirmedDateIso?: string | null;
    slot?: string | null;
    /** 0346 — the carrier the appointment was agreed with. */
    carrier?: BriefCarrier | null;
    /** `booking_groups`; null means the whole order. */
    scope?: readonly string[] | null;
    confirmedAt?: string | null;
  } | null;
}

const isGroupKey = (v: string): v is DeliveryGroupKey =>
  v === "bed" || v === "sofa";

function scopeLabelOf(scope: readonly DeliveryGroupKey[]): string {
  return scope.length > 0 ? scope.map(deliveryGroupLabel).join(" + ") : "";
}

/**
 * The whole brief in one call.
 *
 * `leads` is the settings-driven lead for the `chase` step; omit it and the
 * shared seed applies — the same contract every other caller of
 * `deliveryStepDueIso` has, so the setting can never be read two ways.
 */
export function resolveBookingBrief(
  input: BookingBriefInput,
  todayIso: string,
  opts: WorkingDayOptions = {},
  leads?: DeliveryQueueLeads,
): BookingBrief {
  const today = iso(todayIso);
  const promisedIsTbd = !!input.promisedIsTbd;
  const promisedDateIso = promisedIsTbd ? null : iso(input.promisedDateIso);

  // ── what is in, and what is not ────────────────────────────────────────
  // Card 2's per-line answer is the authority for the physical half; the
  // supplier's date is a separate fact and never turns a short line into an
  // in one.
  const etas = input.lineEtas ?? {};
  const lines: BriefExpectedLine[] = input.allocation.lines.map((l) => {
    const allocatedQty = l.reservedQty + l.soldQty;
    const shortQty = Math.max(0, l.committedQty - allocatedQty);
    return {
      sku: l.sku,
      committedQty: l.committedQty,
      allocatedQty,
      shortQty,
      expectedInIso: iso(etas[l.sku]),
      isIn: shortQty === 0,
      group: deliveryGroupOf(l.sku),
    };
  });

  const goodsIn = lines.filter((l) => l.isIn);
  const goodsNotIn = lines.filter((l) => !l.isIn);

  // The latest date among the lines STILL SHORT — a date on a line already in
  // the warehouse tells the customer nothing. Falls back to the order-level
  // ETA when no per-line date is on file.
  const shortEtas = goodsNotIn
    .map((l) => l.expectedInIso)
    .filter((d): d is IsoDate => !!d);
  const stockEtaIso =
    shortEtas.length > 0
      ? shortEtas.reduce((a, b) => (a > b ? a : b))
      : goodsNotIn.length > 0
        ? iso(input.orderStockEtaIso)
        : null;

  // ── the expected scope ─────────────────────────────────────────────────
  // Derived from the committed lines' own categories through the ONE grouping
  // module — never stored, never re-derived from a sku string here.
  const expectedScope: DeliveryGroupKey[] = [];
  for (const l of lines) {
    if (l.group && !expectedScope.includes(l.group)) expectedScope.push(l.group);
  }

  // ── the appointment ────────────────────────────────────────────────────
  const b = input.booking ?? null;
  const confirmedDateIso = iso(b?.confirmedDateIso);
  const slot = (b?.slot ?? "").trim();
  // 0277's CHECK makes the slot ride the date; the brief refuses to call
  // anything an appointment that is missing either, so a half-written row can
  // never read to an operator as the customer's yes.
  // A null stored scope means the whole order — spelt out here so no reader
  // has to know that convention.
  const storedScope = (b?.scope ?? []).filter(isGroupKey);
  const appointmentScope = storedScope.length > 0 ? storedScope : expectedScope;
  const appointment: BookingAppointment | null =
    b?.stage === "confirmed" && confirmedDateIso && slot
      ? {
          dateIso: confirmedDateIso,
          slot,
          carrier: b.carrier ?? { partnerId: null, partnerName: null },
          scope: appointmentScope,
          scopeLabel: scopeLabelOf(appointmentScope),
          confirmedAt: b.confirmedAt ?? null,
        }
      : null;

  const assignedLogistics = input.assignedLogistics?.partnerId
    ? input.assignedLogistics
    : null;

  // Drift is only meaningful when BOTH sides name a company: an appointment
  // that predates 0346 carries no carrier and must not read as a mismatch.
  const carrierDrift =
    !!appointment?.carrier.partnerId &&
    !!assignedLogistics?.partnerId &&
    appointment.carrier.partnerId !== assignedLogistics.partnerId;

  // ── the T−3 clock ──────────────────────────────────────────────────────
  // The `chase` step's own due date — the SAME arithmetic the Orders list and
  // the Delivery board run, with the same settings-driven lead. Anchored on
  // the PROMISED deadline, which is the whole point of the ruling: the call
  // opens against what we told the customer, not against the goods.
  const contactDueIso = deliveryStepDueIso("chase", promisedDateIso, opts, leads);

  // T−3 is the day the ruling says the conversation HAPPENS, so it is both the
  // day the window opens and the day the step is due. A step due today is not
  // late today (the portal's own rule) — `late` is strictly after it, matching
  // `deliveryStepOverdue` exactly so the brief and the queue can never disagree
  // about whether this call is late.
  const contactWindow: ContactWindow = appointment
    ? "done"
    : !contactDueIso || !today
      ? "no_anchor"
      : today > contactDueIso
        ? "late"
        : today === contactDueIso
          ? "open"
          : "upcoming";

  return {
    orderId: input.orderId,
    soRef: input.soRef,
    promisedDateIso,
    promisedIsTbd,
    stockEtaIso,
    expectedScope,
    expectedScopeLabel: scopeLabelOf(expectedScope),
    lines,
    goodsIn,
    goodsNotIn,
    assignedLogistics,
    appointment,
    carrierDrift,
    contactDueIso,
    contactWindow,
    contactOverdue: contactWindow === "late",
  };
}
