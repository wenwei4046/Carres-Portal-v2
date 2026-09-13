/**
 * REPORTS → DELIVERY — the ten central listings (Delivery MASTER §12,
 * 【DELIVERY】 CARD 17).
 *
 * The governed report laws (Purchasing · Receiving · Payment) apply unchanged:
 *
 *  1. **It stores nothing.** Every figure is computed at render time from the
 *     SAME reads Monitor and the Delivery Orders register run, through the
 *     SAME arithmetics (`buildDoRegisterRow` · `buildDeliveryMonitorCards` ·
 *     `isExceptionCard`), so this report and a register can never say two
 *     answers (Law D).
 *  2. **Every row is a DOOR** — the Delivery Order object, the Monitor row
 *     with its brief unfolded, the Monitor day, or the Inbound arrival.
 *  3. **The exclusion is stated on screen** — every listing declares its
 *     source fact, its date basis and its coverage in one sentence.
 *
 * §12's own rules: first-delivery success counts only actual delivery events;
 * NETS has no acceptance-speed measure (NETS is responsible without Accept);
 * Warehouse and Logistics stay separate even when both are NETS; the observed
 * reason and the reviewed root cause stay separate; **a rate with too few
 * records is not printed**; old events enter historical measures only.
 */
import type {
  DeliveryArrangementRow,
  DeliveryAttemptEvidenceRow,
  DeliveryCannotDeliverRow,
  DeliveryHandoverKindRow,
  DeliveryOrderAttemptRow,
  DeliveryOrderRow,
  DeliveryPartnerRow,
  DeliveryProofReviewRow,
} from "@/lib/queries";
import type { DeliveryContactRow, DeliveryHandoverKind, InboundArrival } from "@carres/shared";
import {
  DELIVERY_REASON_CATEGORY_LABEL,
  cannotDeliverReasonLabel,
  deliveryContactPurposeLabel,
  deliveryContactResultLabel,
  deliveryReasonByKey,
  deliveryReasonLabel,
} from "@carres/shared";
import {
  buildDoRegisterRow,
  groupProofRecords,
  type DoRegisterRow,
} from "./delivery-orders-register";
import {
  isExceptionCard,
  monitorCardHref,
  monitorRowHref,
  needsProof,
  type DeliveryMonitorCard,
} from "./delivery-monitor";

/** §12 — a rate with fewer records than this is not printed. */
export const RATE_MIN_RECORDS = 5;

/** Every visible word of the report — docs/COPY-STANDARD.md, Reports → Delivery. */
export const DR = {
  page: "Delivery",
  eyebrow: "Reports · Delivery",
  docTitle: "Reports · Delivery — Carres",
  month: "Month",
  noMonth: "No month yet",
  exportExcel: "Export Excel",
  loading: "Loading…",
  failed: "This report could not be opened",
  tryAgain: "Try again",
  rateWithheld: `Rate withheld · fewer than ${RATE_MIN_RECORDS} records`,
  notAvailable: "Not available",
  /* The ten listings — §12's own names. */
  commitment: "Delivery Commitment Performance",
  firstDelivery: "First Delivery Success",
  failedAnalysis: "Failed Delivery Analysis",
  partners: "Logistics Partner Performance",
  warehouse: "Warehouse Performance",
  proof: "Delivery Proof Control",
  schedule: "Schedule and Capacity",
  contacts: "Customer Contact Performance",
  returns: "Return-to-Warehouse Control",
  ageing: "Exception Ageing",
  /* Facts inside the rows. */
  keptRequestedDate: "Kept the requested date",
  afterRequestedDate: "After the requested date",
  noRequestedDate: "No requested date",
  firstVisitDelivered: "Delivered on the first visit",
  firstVisitPartial: "Partly delivered on the first visit",
  firstVisitFailed: "Failed on the first visit",
  noLogisticsNamed: "No logistics named",
  cannotDeliver: "Cannot Deliver",
  handedOverByDeliveryDay: "Handed over by the delivery day",
  handedOverAfterDeliveryDay: "Handed over after the delivery day",
  noProofYet: "No proof yet",
  notReviewedYet: "Not reviewed yet",
  recordedOnBehalfOf: "Recorded on behalf of",
  contactsOverdueToday: "Contact deadline passed today",
  returnedToWarehouse: "Returned to Warehouse",
  stillWithLogistics: "Still with Logistics",
  waitingAtInbound: "Waiting at Inbound",
  receivedAtInbound: "Received at Inbound",
  noInboundArrival: "No Inbound arrival recorded",
  inboundNotAvailable: "Inbound not available",
  overdue: "Overdue",
  failedDelivery: "Failed Delivery",
  proofMissing: "Proof missing",
  ageToday: "Today",
  age1to2: "1 to 2 days",
  age3to7: "3 to 7 days",
  ageOver7: "Over 7 days",
  /* Empty sentences. */
  emptyCommitment: "No delivery reached a customer this month.",
  emptyFirst: "No first delivery visit was recorded this month.",
  emptyFailed: "No delivery failed this month.",
  emptyPartners: "No partner recorded a result this month.",
  emptyWarehouse: "No handover was recorded this month.",
  emptyProof: "No delivery proof is on record for this month.",
  emptySchedule: "No delivery was confirmed for this month.",
  emptyContacts: "No customer contact was recorded this month.",
  emptyReturns: "No goods came back this month.",
  emptyAgeing: "No open exception today.",
} as const;

export function monthOf(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 7) : null;
}

/** `3 of 4 · 75%`, or the withheld sentence when the records are too few. */
export function rateWord(hits: number, total: number): string {
  if (total < RATE_MIN_RECORDS) return DR.rateWithheld;
  return `${hits} of ${total} · ${Math.round((hits / total) * 100)}%`;
}

/** Whole days from `sinceIso` to `todayIso` (dates or timestamps). */
export function daysBetween(sinceIso: string, todayIso: string): number {
  const a = Date.UTC(Number(sinceIso.slice(0, 4)), Number(sinceIso.slice(5, 7)) - 1, Number(sinceIso.slice(8, 10)));
  const b = Date.UTC(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1, Number(todayIso.slice(8, 10)));
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function ageBucket(days: number): string {
  if (days <= 0) return DR.ageToday;
  if (days <= 2) return DR.age1to2;
  if (days <= 7) return DR.age3to7;
  return DR.ageOver7;
}

const WHERE_GOODS_WORD: Record<string, string> = {
  returned_to_warehouse: DR.returnedToWarehouse,
  still_with_logistics: DR.stillWithLogistics,
};

/* ── The shared register rows — ONE arithmetic with the Delivery Orders
   register (its own grouping, its own builder). ─────────────────────────── */

export interface DeliveryReportInput {
  deliveryOrders: readonly DeliveryOrderRow[];
  attempts: readonly DeliveryOrderAttemptRow[];
  handoverEvents: readonly DeliveryHandoverKindRow[];
  proofReviews?: readonly DeliveryProofReviewRow[];
  attemptEvidence?: readonly DeliveryAttemptEvidenceRow[];
}

export function registerRowsOf(input: DeliveryReportInput): DoRegisterRow[] {
  const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
  for (const a of input.attempts) {
    if (!a.do_number) continue;
    attemptsByDo.set(a.do_number, [...(attemptsByDo.get(a.do_number) ?? []), a]);
  }
  const handoverByDoId = new Map<string, DeliveryHandoverKind[]>();
  for (const e of input.handoverEvents) {
    handoverByDoId.set(e.delivery_order_id, [...(handoverByDoId.get(e.delivery_order_id) ?? []), e.kind]);
  }
  const proofRecords = groupProofRecords(
    input.proofReviews as DeliveryProofReviewRow[] | undefined,
    input.attemptEvidence as DeliveryAttemptEvidenceRow[] | undefined,
  );
  return input.deliveryOrders.map((r) => buildDoRegisterRow(r, attemptsByDo, handoverByDoId, proofRecords));
}

export function doHref(row: Pick<DoRegisterRow, "id">): string {
  return `/operation/delivery-orders/${encodeURIComponent(row.id)}`;
}

/** The scope key Monitor addresses — the order id, or `id#legN`. */
export function scopeKeyOf(orderId: string, leg: number | null | undefined): string {
  return leg && leg > 0 ? `${orderId}#leg${leg}` : orderId;
}

/** A document whose result reaches the CUSTOMER — the whole-order trip or the
 *  Journey's last leg. An intermediate leg's arrival is a warehouse fact. */
function reachesCustomer(row: DoRegisterRow): boolean {
  return row.leg === 0 || row.leg === row.lastLeg;
}

function attemptsByDoOf(attempts: readonly DeliveryOrderAttemptRow[]): Map<string, DeliveryOrderAttemptRow[]> {
  const m = new Map<string, DeliveryOrderAttemptRow[]>();
  for (const a of attempts) {
    if (!a.do_number) continue;
    m.set(a.do_number, [...(m.get(a.do_number) ?? []), a]);
  }
  for (const list of m.values()) list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return m;
}

/** The months that hold a dated Delivery event, newest first. */
export function reportMonthsOf(input: {
  attempts: readonly DeliveryOrderAttemptRow[];
  contacts: readonly DeliveryContactRow[];
  arrangements: readonly DeliveryArrangementRow[];
  handoverEvents: readonly DeliveryHandoverKindRow[];
  cannotDeliver?: readonly DeliveryCannotDeliverRow[];
}): string[] {
  const set = new Set<string>();
  for (const a of input.attempts) set.add(a.recorded_at.slice(0, 7));
  for (const c of input.contacts) set.add(c.contacted_at.slice(0, 7));
  for (const r of input.arrangements) if (r.confirmed_date) set.add(r.confirmed_date.slice(0, 7));
  for (const e of input.handoverEvents) if (e.recorded_at) set.add(e.recorded_at.slice(0, 7));
  for (const e of input.cannotDeliver ?? []) set.add(e.recorded_at.slice(0, 7));
  return [...set].sort().reverse();
}

/* ── 1 · Delivery Commitment Performance ───────────────────────────────── */

export interface CommitmentRow {
  row: DoRegisterRow;
  deliveredOn: string;
  /** null = the customer never named a date: listed, not counted. */
  kept: boolean | null;
}

/** Source fact: the latest result that reached the customer, against the
 *  SO's Requested Delivery Date. Date basis: the result's recorded day. */
export function commitmentRowsOf(
  rows: readonly DoRegisterRow[],
  attempts: readonly DeliveryOrderAttemptRow[],
  month: string,
): CommitmentRow[] {
  const byDo = attemptsByDoOf(attempts);
  const out: CommitmentRow[] = [];
  for (const row of rows) {
    if (!reachesCustomer(row)) continue;
    const reached = (byDo.get(row.doNumber) ?? []).filter(
      (a) => (a.result === "delivered" || a.result === "partial") && a.recorded_at.slice(0, 7) === month,
    );
    const latest = reached[reached.length - 1];
    if (!latest) continue;
    const deliveredOn = latest.recorded_at.slice(0, 10);
    const requested = row.requestedTbd ? null : row.requestedDelivery;
    out.push({ row, deliveredOn, kept: requested ? deliveredOn <= requested : null });
  }
  return out.sort((a, b) => b.deliveredOn.localeCompare(a.deliveredOn));
}

export function commitmentLine(rows: readonly CommitmentRow[]): string {
  const counted = rows.filter((r) => r.kept !== null);
  const kept = counted.filter((r) => r.kept).length;
  return `${rows.length} deliver${rows.length === 1 ? "y" : "ies"} · ${DR.keptRequestedDate} ${rateWord(kept, counted.length)}`;
}

/* ── 2 · First Delivery Success ────────────────────────────────────────── */

export interface FirstDeliveryRow {
  row: DoRegisterRow;
  first: DeliveryOrderAttemptRow;
}

/** Source fact: each document's FIRST recorded visit — actual delivery events
 *  only, never a plan. Date basis: that visit's recorded day. */
export function firstDeliveryRowsOf(
  rows: readonly DoRegisterRow[],
  attempts: readonly DeliveryOrderAttemptRow[],
  month: string,
): FirstDeliveryRow[] {
  const byDo = attemptsByDoOf(attempts);
  const out: FirstDeliveryRow[] = [];
  for (const row of rows) {
    if (!reachesCustomer(row)) continue;
    const first = (byDo.get(row.doNumber) ?? [])[0];
    if (!first || first.recorded_at.slice(0, 7) !== month) continue;
    out.push({ row, first });
  }
  return out.sort((a, b) => b.first.recorded_at.localeCompare(a.first.recorded_at));
}

export function firstDeliveryLine(rows: readonly FirstDeliveryRow[]): string {
  const hits = rows.filter((r) => r.first.result === "delivered").length;
  return `${rows.length} first visit${rows.length === 1 ? "" : "s"} · ${DR.firstVisitDelivered} ${rateWord(hits, rows.length)}`;
}

export function firstVisitWord(result: DeliveryOrderAttemptRow["result"]): string {
  return result === "delivered" ? DR.firstVisitDelivered : result === "partial" ? DR.firstVisitPartial : DR.firstVisitFailed;
}

/* ── 3 · Failed Delivery Analysis ──────────────────────────────────────── */

export interface FailedRow {
  row: DoRegisterRow;
  attempt: DeliveryOrderAttemptRow;
  reason: string;
  category: string | null;
}

/** Source fact: every failed visit, with the OBSERVED reason the driver gave.
 *  The reviewed root cause is a Service Case matter and stays apart. */
export function failedRowsOf(
  rows: readonly DoRegisterRow[],
  attempts: readonly DeliveryOrderAttemptRow[],
  month: string,
): FailedRow[] {
  const byDo = new Map(rows.map((r) => [r.doNumber, r] as const));
  const out: FailedRow[] = [];
  for (const attempt of attempts) {
    if (attempt.result !== "failed" || attempt.recorded_at.slice(0, 7) !== month) continue;
    const row = attempt.do_number ? byDo.get(attempt.do_number) : undefined;
    if (!row) continue;
    const reason = deliveryReasonByKey(attempt.reason_key);
    out.push({
      row,
      attempt,
      reason: attempt.reason_key ? deliveryReasonLabel(attempt.reason_key) : "Reason not recorded",
      category: reason ? DELIVERY_REASON_CATEGORY_LABEL[reason.category] : null,
    });
  }
  return out.sort((a, b) => b.attempt.recorded_at.localeCompare(a.attempt.recorded_at));
}

export function failedReasonGroups(rows: readonly FailedRow[]): Array<{ reason: string; category: string | null; count: number }> {
  const m = new Map<string, { reason: string; category: string | null; count: number }>();
  for (const r of rows) {
    const g = m.get(r.reason) ?? { reason: r.reason, category: r.category, count: 0 };
    g.count += 1;
    m.set(r.reason, g);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/* ── 4 · Logistics Partner Performance ─────────────────────────────────── */

export interface PartnerRow {
  name: string;
  partnerId: string | null;
  trips: number;
  delivered: number;
  partial: number;
  failed: number;
  /** null = the Cannot Deliver read is not available. */
  cannotDeliver: number | null;
  href: string;
}

/** Source fact: results by the partner NAMED ON THE DOCUMENT, and the
 *  partner's own Cannot Deliver records. NETS has no acceptance-speed measure:
 *  NETS is responsible without Accept. Warehouse work is measured apart. */
export function partnerRowsOf(input: {
  rows: readonly DoRegisterRow[];
  attempts: readonly DeliveryOrderAttemptRow[];
  cannotDeliver: readonly DeliveryCannotDeliverRow[] | undefined;
  partners: readonly DeliveryPartnerRow[];
  month: string;
}): PartnerRow[] {
  const byDo = new Map(input.rows.map((r) => [r.doNumber, r] as const));
  const idByName = new Map(input.partners.map((p) => [p.name, p.id] as const));
  const nameById = new Map(input.partners.map((p) => [p.id, p.name] as const));
  const m = new Map<string, PartnerRow>();
  const rowFor = (name: string): PartnerRow => {
    const existing = m.get(name);
    if (existing) return existing;
    const partnerId = idByName.get(name) ?? null;
    const row: PartnerRow = {
      name,
      partnerId,
      trips: 0,
      delivered: 0,
      partial: 0,
      failed: 0,
      cannotDeliver: input.cannotDeliver ? 0 : null,
      href: partnerId
        ? `/operation?tab=delivery&view=all&logistics=${encodeURIComponent(partnerId)}`
        : "/operation/delivery-orders",
    };
    m.set(name, row);
    return row;
  };
  for (const a of input.attempts) {
    if (a.recorded_at.slice(0, 7) !== input.month) continue;
    const doc = a.do_number ? byDo.get(a.do_number) : undefined;
    if (!doc) continue;
    const row = rowFor(doc.logisticsPartner ?? DR.noLogisticsNamed);
    row.trips += 1;
    if (a.result === "delivered") row.delivered += 1;
    else if (a.result === "partial") row.partial += 1;
    else row.failed += 1;
  }
  for (const e of input.cannotDeliver ?? []) {
    if (e.recorded_at.slice(0, 7) !== input.month) continue;
    const name = (e.partner_id && nameById.get(e.partner_id)) || DR.noLogisticsNamed;
    const row = rowFor(name);
    row.cannotDeliver = (row.cannotDeliver ?? 0) + 1;
  }
  return [...m.values()].sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name));
}

export function partnerLine(row: PartnerRow): string {
  const parts = [
    `${row.trips} trip${row.trips === 1 ? "" : "s"}`,
    `${row.delivered} delivered`,
    `${row.failed} failed`,
    `${DR.cannotDeliver} ${row.cannotDeliver === null ? DR.notAvailable : row.cannotDeliver}`,
  ];
  if (row.partial > 0) parts.splice(2, 0, `${row.partial} partly delivered`);
  return parts.join(" · ");
}

export function cannotDeliverWord(e: Pick<DeliveryCannotDeliverRow, "reason_key">): string {
  return cannotDeliverReasonLabel(e.reason_key) ?? "Reason not recorded";
}

/* ── 5 · Warehouse Performance ─────────────────────────────────────────── */

export interface WarehouseRow {
  row: DoRegisterRow;
  readyAt: string | null;
  handedOverAt: string | null;
  receivedAt: string | null;
  /** null = no confirmed delivery day: listed, not counted. */
  byDeliveryDay: boolean | null;
}

/** Source fact: the §4 handover chain — Ready · Handed over · Received by
 *  logistics — against the trip's confirmed delivery day. Date basis: the
 *  handover's recorded day. Warehouse is measured apart from Logistics even
 *  when both are NETS. */
export function warehouseRowsOf(
  rows: readonly DoRegisterRow[],
  handoverEvents: readonly DeliveryHandoverKindRow[],
  month: string,
): WarehouseRow[] {
  const byDoId = new Map<string, DeliveryHandoverKindRow[]>();
  for (const e of handoverEvents) byDoId.set(e.delivery_order_id, [...(byDoId.get(e.delivery_order_id) ?? []), e]);
  const earliest = (list: DeliveryHandoverKindRow[], kind: DeliveryHandoverKind): string | null =>
    list.filter((e) => e.kind === kind && e.recorded_at).map((e) => e.recorded_at as string).sort()[0] ?? null;
  const out: WarehouseRow[] = [];
  for (const row of rows) {
    const list = byDoId.get(row.id);
    if (!list) continue;
    const readyAt = earliest(list, "ready_for_handover");
    const handedOverAt = earliest(list, "handed_over");
    const receivedAt = earliest(list, "received_by_logistics");
    const clock = handedOverAt ?? receivedAt;
    if (!clock || clock.slice(0, 7) !== month) continue;
    const byDeliveryDay = row.confirmedDelivery ? clock.slice(0, 10) <= row.confirmedDelivery : null;
    out.push({ row, readyAt, handedOverAt, receivedAt, byDeliveryDay });
  }
  return out.sort((a, b) => (b.handedOverAt ?? b.receivedAt ?? "").localeCompare(a.handedOverAt ?? a.receivedAt ?? ""));
}

export function warehouseLine(rows: readonly WarehouseRow[]): string {
  const counted = rows.filter((r) => r.byDeliveryDay !== null);
  const hits = counted.filter((r) => r.byDeliveryDay).length;
  return `${rows.length} handover${rows.length === 1 ? "" : "s"} · ${DR.handedOverByDeliveryDay} ${rateWord(hits, counted.length)}`;
}

/* ── 6 · Delivery Proof Control ────────────────────────────────────────── */

export interface ProofRow {
  row: DoRegisterRow;
  reachedOn: string;
  /** The governed word of the proof's state. */
  word: string;
  /** The missing files, when the register says so. */
  missing: string[];
}

/** Source fact: every result that reached the customer, with the register's
 *  own proof and review arithmetic (§6.1). Date basis: the result's day. */
export function proofRowsOf(
  rows: readonly DoRegisterRow[],
  attempts: readonly DeliveryOrderAttemptRow[],
  month: string,
): ProofRow[] {
  const byDo = attemptsByDoOf(attempts);
  const out: ProofRow[] = [];
  for (const row of rows) {
    if (!reachesCustomer(row)) continue;
    const reached = (byDo.get(row.doNumber) ?? []).filter((a) => a.result === "delivered" || a.result === "partial");
    const latest = reached[reached.length - 1];
    if (!latest || latest.recorded_at.slice(0, 7) !== month) continue;
    const state = row.proofReview.state;
    const word = state === "none" ? DR.noProofYet : state === "pending" ? DR.notReviewedYet : row.proofReview.label ?? DR.notReviewedYet;
    const missing: string[] = [];
    if (row.photosPresent === false) missing.push("Delivery photo missing");
    if (!row.signedDoPresent) missing.push("Signed Delivery Order missing");
    out.push({ row, reachedOn: latest.recorded_at.slice(0, 10), word, missing });
  }
  return out.sort((a, b) => b.reachedOn.localeCompare(a.reachedOn));
}

export function proofCounts(rows: readonly ProofRow[]): Array<{ word: string; count: number }> {
  const order = [DR.noProofYet, DR.notReviewedYet, "Proof Accepted", "More Proof Required", "Proof Rejected"];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.word, (m.get(r.word) ?? 0) + 1);
  return order.filter((w) => m.has(w)).map((w) => ({ word: w, count: m.get(w) ?? 0 }));
}

/* ── 7 · Schedule and Capacity ─────────────────────────────────────────── */

export interface ScheduleDay {
  day: string;
  total: number;
  /** A day AND a time agreed — the booked count. */
  booked: number;
  byPartner: Array<{ name: string; count: number }>;
  href: string;
}

/** Source fact: Delivery's own arrangements with a confirmed day in the month,
 *  whatever happened later. Date basis: the confirmed day. */
export function scheduleDaysOf(
  arrangements: readonly DeliveryArrangementRow[],
  partnerNameById: ReadonlyMap<string, string>,
  month: string,
): ScheduleDay[] {
  const m = new Map<string, { total: number; booked: number; partners: Map<string, number> }>();
  for (const a of arrangements) {
    if (!a.confirmed_date || a.confirmed_date.slice(0, 7) !== month) continue;
    const day = a.confirmed_date.slice(0, 10);
    const d = m.get(day) ?? { total: 0, booked: 0, partners: new Map<string, number>() };
    d.total += 1;
    if (a.confirmed_time) d.booked += 1;
    const name = a.partner_name ?? (a.partner_id ? partnerNameById.get(a.partner_id) : null) ?? DR.noLogisticsNamed;
    d.partners.set(name, (d.partners.get(name) ?? 0) + 1);
    m.set(day, d);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, d]) => ({
      day,
      total: d.total,
      booked: d.booked,
      byPartner: [...d.partners.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      href: `/operation?tab=delivery&date=${day}`,
    }));
}

export function scheduleLine(days: readonly ScheduleDay[]): string {
  const total = days.reduce((s, d) => s + d.total, 0);
  const busiest = [...days].sort((a, b) => b.total - a.total)[0];
  const base = `${total} deliver${total === 1 ? "y" : "ies"} confirmed across ${days.length} day${days.length === 1 ? "" : "s"}`;
  return busiest ? `${base} · busiest ${busiest.day} with ${busiest.total}` : base;
}

/* ── 8 · Customer Contact Performance ──────────────────────────────────── */

export interface ContactRow {
  contact: DeliveryContactRow;
  scopeWord: string;
  purpose: string;
  result: string;
  onBehalfOf: string | null;
  href: string;
}

/** Source fact: every contact record (0487) — customer or partner, by
 *  Operation or recorded on a partner's behalf. Date basis: when the contact
 *  happened. */
export function contactRowsOf(input: {
  contacts: readonly DeliveryContactRow[];
  rows: readonly DoRegisterRow[];
  cards: readonly DeliveryMonitorCard[];
  partnerNameById: ReadonlyMap<string, string>;
  month: string;
}): ContactRow[] {
  const wordByOrder = new Map<string, string>();
  for (const r of input.rows) wordByOrder.set(r.orderId, `SO-${r.so} · ${r.customer}`);
  for (const c of input.cards) wordByOrder.set(c.orderId, `SO-${c.scope.so} · ${c.customerName}`);
  return input.contacts
    .filter((c) => c.contacted_at.slice(0, 7) === input.month)
    .map((c) => ({
      contact: c,
      scopeWord: wordByOrder.get(c.order_id) ?? "SO not available",
      purpose: deliveryContactPurposeLabel(c.purpose_key) ?? c.purpose_key,
      result: deliveryContactResultLabel(c.result_key) ?? c.result_key,
      onBehalfOf: c.on_behalf_of_partner_id ? input.partnerNameById.get(c.on_behalf_of_partner_id) ?? "the partner" : null,
      href: monitorRowHref(scopeKeyOf(c.order_id, c.leg)),
    }))
    .sort((a, b) => b.contact.contacted_at.localeCompare(a.contact.contacted_at));
}

export function contactResultGroups(rows: readonly ContactRow[]): Array<{ result: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.result, (m.get(r.result) ?? 0) + 1);
  return [...m.entries()].map(([result, count]) => ({ result, count })).sort((a, b) => b.count - a.count || a.result.localeCompare(b.result));
}

export function contactLine(rows: readonly ContactRow[]): string {
  const confirmed = rows.filter((r) => r.contact.result_key === "confirmed").length;
  const proxy = rows.filter((r) => r.onBehalfOf).length;
  return `${rows.length} contact${rows.length === 1 ? "" : "s"} · ${confirmed} confirmed · ${proxy} recorded on behalf of a partner`;
}

/** Today's fact — the Monitor rows whose contact deadline has passed with the
 *  arrangement still open; the same rule the rail's `late` row counts. */
export function contactsOverdueToday(cards: readonly DeliveryMonitorCard[]): number {
  return cards.filter((c) => c.contactOverdue).length;
}

/* ── 9 · Return-to-Warehouse Control ───────────────────────────────────── */

export interface ReturnRow {
  row: DoRegisterRow;
  attempt: DeliveryOrderAttemptRow;
  whereGoods: string;
  inbound: string;
  href: string;
}

/** Source fact: every visit that did not leave the goods with the customer,
 *  joined to Inbound's own arrival for that Delivery Order (0490). A
 *  Logistics report never substitutes for the Warehouse's actual receipt. */
export function returnRowsOf(input: {
  rows: readonly DoRegisterRow[];
  attempts: readonly DeliveryOrderAttemptRow[];
  /** null = the Inbound read is not available. */
  arrivals: readonly InboundArrival[] | null;
  month: string;
}): ReturnRow[] {
  const byDo = new Map(input.rows.map((r) => [r.doNumber, r] as const));
  const out: ReturnRow[] = [];
  for (const attempt of input.attempts) {
    if (attempt.result === "delivered" || attempt.recorded_at.slice(0, 7) !== input.month) continue;
    const where = attempt.where_goods ? WHERE_GOODS_WORD[attempt.where_goods] : undefined;
    if (!where) continue;
    const row = attempt.do_number ? byDo.get(attempt.do_number) : undefined;
    if (!row) continue;
    const arrival = input.arrivals?.find((a) => a.sourceType === "failed-delivery-return" && a.documentNo === row.doNumber) ?? null;
    const inbound =
      input.arrivals === null
        ? DR.inboundNotAvailable
        : !arrival
          ? DR.noInboundArrival
          : arrival.remaining === 0 && arrival.expected > 0
            ? `${DR.receivedAtInbound} · ${arrival.site}`
            : `${DR.waitingAtInbound} · ${arrival.received} of ${arrival.expected} received`;
    out.push({
      row,
      attempt,
      whereGoods: where,
      inbound,
      href: arrival ? `/operation?tab=arrival-source&arrival=${encodeURIComponent(arrival.sourceId)}` : doHref(row),
    });
  }
  return out.sort((a, b) => b.attempt.recorded_at.localeCompare(a.attempt.recorded_at));
}

/* ── 10 · Exception Ageing ─────────────────────────────────────────────── */

export interface AgeingRow {
  card: DeliveryMonitorCard;
  kind: string;
  sinceIso: string;
  days: number;
  bucket: string;
  href: string;
}

/** Today's facts — the SAME three queues Monitor's `Exceptions` counts
 *  (Overdue · Failed Delivery · proof missing), aged from the day the fact
 *  became true. An exception has no month. */
export function ageingRowsOf(
  cards: readonly DeliveryMonitorCard[],
  attempts: readonly DeliveryOrderAttemptRow[],
  todayIso: string,
): AgeingRow[] {
  const byDo = attemptsByDoOf(attempts);
  const out: AgeingRow[] = [];
  for (const card of cards) {
    if (!isExceptionCard(card, todayIso)) continue;
    const mine = card.doNumber ? byDo.get(card.doNumber) ?? [] : [];
    const latest = mine[mine.length - 1] ?? null;
    let kind: string;
    let sinceIso: string;
    if (card.statusKey === "failed") {
      kind = DR.failedDelivery;
      sinceIso = latest?.recorded_at.slice(0, 10) ?? card.confirmedDate ?? todayIso;
    } else if (needsProof(card)) {
      kind = DR.proofMissing;
      sinceIso = latest?.recorded_at.slice(0, 10) ?? card.confirmedDate ?? todayIso;
    } else {
      kind = DR.overdue;
      sinceIso = card.confirmedDate ?? todayIso;
    }
    const days = daysBetween(sinceIso, todayIso);
    out.push({ card, kind, sinceIso, days, bucket: ageBucket(days), href: monitorCardHref(card) });
  }
  return out.sort((a, b) => b.days - a.days || a.card.customerName.localeCompare(b.card.customerName));
}

export function ageingBuckets(rows: readonly AgeingRow[]): Array<{ bucket: string; count: number }> {
  const order = [DR.ageOver7, DR.age3to7, DR.age1to2, DR.ageToday];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.bucket, (m.get(r.bucket) ?? 0) + 1);
  return order.filter((b) => m.has(b)).map((b) => ({ bucket: b, count: m.get(b) ?? 0 }));
}
