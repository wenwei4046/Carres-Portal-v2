/**
 * THE WORK ORDER ROUTE — one compact line of mission health.
 * Owner approval 2026-09-25 (docs/workspace/MASTER.md §5.9).
 *
 * It is a SUMMARY (Architecture Law B): it decides nothing of its own. Every
 * point reads an answer another model already gave —
 *
 *   Proceed   the Sales Order's proceed day
 *   Loan      the Sales Order's loan offer / loan Unit (only when one exists)
 *   PO · GRN  `supplierCardModel` (Purchasing's POs + effectiveArrivalOf,
 *             the Warehouse's GRN dates)
 *   Contact   the Logistics card's `2 working days before` check — the SAME
 *             row `logisticsCardModel` computes (no second clock)
 *   Delivery  Delivery's Delivered / Scheduled, else Sales' Requested
 *   Payment   one exception line: money owed + `paymentDeadlineOf`, and an
 *             open Finance exception (`openFinanceExceptions`)
 *
 * It is not the Sales Order's node map (`sales-order-route.ts`) and never
 * replaces it; it prints five or six words about the same facts.
 *
 * PURE — no clock, no I/O.
 */
import type { LogisticsCheckState } from "./logistics-card";
import type { SupplierCardModel } from "./supplier-card";

export type RoutePointKey = "proceed" | "loan" | "po" | "grn" | "contact" | "delivery";
export type RouteTone = "done" | "current" | "attention" | "missed" | "future";

export const MISSION_ROUTE_COPY = {
  heading: "Order Route",
  daysLeft: (n: number) => `${n} ${n === 1 ? "day" : "days"} left`,
  dueToday: "Due today",
  daysLate: (n: number) => `${n} ${n === 1 ? "day" : "days"} late`,
  label: { proceed: "Proceed", loan: "Loan", po: "PO", grn: "GRN", contact: "Contact", delivery: "Delivery" } as Record<RoutePointKey, string>,
  done: "Done",
  notProceeded: "Not proceeded",
  loan: { offered: "Offered", accepted: "Accepted", declined: "Declined", lent: "Lent out", returned: "Returned" } as const,
  notIssued: "PO not issued",
  of: (i: number, n: number) => `${i} of ${n}`,
  delayed: (k: number) => `${k} delayed`,
  fromStock: "From stock",
  received: "Received",
  inStock: "In stock",
  due: "Due",
  unavailable: "Unavailable",
  missed: "Missed",
  delivered: "Delivered",
  scheduled: "Scheduled",
  requested: "Requested",
  noDate: "No date",
  paymentOwed: (amount: string, date: string | null) => (date ? `Payment · ${amount} to collect by ${date}` : `Payment · ${amount} to collect`),
  paymentHeld: "Payment · Finance is holding this delivery",
} as const;

export interface MissionRoutePoint {
  key: RoutePointKey;
  label: string;
  /** Top line — one date or a range, never split over two lines. */
  dateText: string | null;
  status: string;
  tone: RouteTone;
  final: boolean;
}

export interface MissionRouteInput {
  todayIso: string;
  proceededIso: string | null;
  loan: { state: keyof typeof MISSION_ROUTE_COPY.loan; atIso: string | null } | null;
  /** Null when Purchasing's read failed: PO and GRN say `Unavailable`, every
   *  other point still prints (a partial failure never wipes the route). */
  supplier: Pick<SupplierCardModel, "total" | "issuedCount" | "receivedCount" | "delayedCount" | "arrivalRange" | "latestGrnIso" | "arrivalMissedCount"> | null;
  /** Goods reserved from stock with no PO at all. */
  fromStock: boolean;
  contact: { dueIso: string | null; state: LogisticsCheckState };
  requestedIso: string | null;
  scheduledIso: string | null;
  deliveredIso: string | null;
  payment: { owedText: string | null; deadlineIso: string | null; affects: boolean; financeHold: boolean };
  spell: (iso: string) => string;
}

export interface MissionRouteModel {
  points: MissionRoutePoint[];
  header: { text: string; tone: RouteTone } | null;
  paymentLine: { text: string; tone: RouteTone } | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function missionRouteModel(input: MissionRouteInput): MissionRouteModel {
  const today = input.todayIso.slice(0, 10);
  const spell = input.spell;
  const C = MISSION_ROUTE_COPY;
  const d = (iso: string | null | undefined) => (iso ? spell(iso.slice(0, 10)) : null);
  const points: MissionRoutePoint[] = [];

  points.push({
    key: "proceed",
    label: C.label.proceed,
    dateText: d(input.proceededIso),
    status: input.proceededIso ? C.done : C.notProceeded,
    tone: input.proceededIso ? "done" : "future",
    final: false,
  });

  if (input.loan) {
    const s = input.loan.state;
    points.push({
      key: "loan",
      label: C.label.loan,
      dateText: d(input.loan.atIso),
      status: C.loan[s],
      tone: s === "returned" || s === "declined" ? "done" : s === "offered" || s === "lent" ? "attention" : "future",
      final: false,
    });
  }

  const sup = input.supplier;
  const range = sup?.arrivalRange ?? null;
  const rangeText = range
    ? range.fromIso === range.toIso
      ? d(range.fromIso)
      : sameMonth(range.fromIso, range.toIso)
        /* `29 Sep to 3 Oct` — a dash never joins two dates (Jess, 2026-09-26). */
        ? `${+range.fromIso.slice(8, 10)} to ${d(range.toIso)}`
        : `${d(range.fromIso)} to ${d(range.toIso)}`
    : null;
  if (!sup) {
    points.push({ key: "po", label: C.label.po, dateText: null, status: C.unavailable, tone: "future", final: false });
    points.push({ key: "grn", label: C.label.grn, dateText: null, status: C.unavailable, tone: "future", final: false });
  } else if (sup.total === 0) {
    points.push({ key: "po", label: C.label.po, dateText: null, status: input.fromStock ? C.fromStock : C.notIssued, tone: input.fromStock ? "done" : "current", final: false });
    points.push({ key: "grn", label: C.label.grn, dateText: null, status: input.fromStock ? C.inStock : C.noDate, tone: input.fromStock ? "done" : "future", final: false });
  } else {
    const poTone: RouteTone = sup.delayedCount > 0 ? "attention" : sup.issuedCount < sup.total ? "current" : "done";
    points.push({
      key: "po",
      label: C.label.po,
      dateText: rangeText,
      status: sup.issuedCount < sup.total ? C.of(sup.issuedCount, sup.total) : sup.delayedCount > 0 ? C.delayed(sup.delayedCount) : C.of(sup.total, sup.total),
      tone: poTone,
      final: false,
    });
    const allIn = sup.receivedCount === sup.total;
    /* The card's own answer: any PO whose arrival passed without a GRN. */
    const overdue = !allIn && sup.arrivalMissedCount > 0;
    points.push({
      key: "grn",
      label: C.label.grn,
      dateText: allIn ? d(sup.latestGrnIso) : range ? d(range.toIso) : null,
      status: allIn ? C.received : C.of(sup.receivedCount, sup.total),
      tone: allIn ? "done" : overdue ? "missed" : "future",
      final: false,
    });
  }

  const cs = input.contact.state;
  const cDue = input.contact.dueIso ? input.contact.dueIso.slice(0, 10) : null;
  /* `open` can mean "a partner answered before the day"; only the day itself is Due today. */
  const dueToday = cs === "open" && cDue === today;
  points.push({
    key: "contact",
    label: C.label.contact,
    dateText: d(cDue),
    status: cs === "done" || cs === "not_needed" ? C.done : cs === "missed" ? C.missed : dueToday ? C.dueToday : cDue ? C.due : C.noDate,
    tone: cs === "done" || cs === "not_needed" ? "done" : cs === "missed" ? "missed" : cs === "open" ? "current" : "future",
    final: false,
  });

  const finalIso = input.deliveredIso ?? input.scheduledIso ?? input.requestedIso ?? null;
  const deliveryTone: RouteTone = input.deliveredIso
    ? "done"
    : finalIso && finalIso.slice(0, 10) < today
      ? "missed"
      : finalIso && finalIso.slice(0, 10) === today
        ? "current"
        : "future";
  points.push({
    key: "delivery",
    label: input.deliveredIso ? C.delivered : C.label.delivery,
    dateText: d(finalIso),
    status: input.deliveredIso ? C.done : input.scheduledIso ? C.scheduled : input.requestedIso ? C.requested : C.noDate,
    tone: deliveryTone,
    final: true,
  });

  /* ONE blue point: the first actionable one keeps `current`; any later
     `current` reads as attention (still words + icon, never colour alone). */
  let blue = false;
  for (const p of points) {
    if (p.tone !== "current") continue;
    if (blue) p.tone = "attention";
    blue = true;
  }

  let header: MissionRouteModel["header"] = null;
  if (!input.deliveredIso && finalIso) {
    const n = daysBetween(today, finalIso.slice(0, 10));
    header = n > 0 ? { text: C.daysLeft(n), tone: "future" } : n === 0 ? { text: C.dueToday, tone: "current" } : { text: C.daysLate(-n), tone: "missed" };
  }

  let paymentLine: MissionRouteModel["paymentLine"] = null;
  if (!input.deliveredIso) {
    if (input.payment.financeHold) paymentLine = { text: C.paymentHeld, tone: "attention" };
    else if (input.payment.owedText) {
      paymentLine = {
        text: C.paymentOwed(input.payment.owedText, d(input.payment.deadlineIso)),
        tone: input.payment.affects ? "attention" : "future",
      };
    }
  }

  return { points, header, paymentLine };
}

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
