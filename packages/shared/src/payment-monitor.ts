/**
 * THE PAYMENT MONITOR DERIVATIONS (owner ruling 2026-09-12 —
 * `docs/payment/MASTER.md` §3).
 *
 * Payment Monitor is a full-width CONTROL LISTING keyed on the Sales Order:
 * one row per SO that still needs customer money. Every cell is a FACT
 * derived from the owning modules' source columns through the ONE shared
 * arithmetic (Law D):
 *
 *   Amount needed     `soRemaining` — issued live invoice obligations only
 *   Goods             the order's own readiness/arrival signals
 *   Storage           the §6/§7 storage case through `storageChargeOf`
 *   Customer delivery the confirmed date, else the requested one, else none
 *   Payment timing    the shared collection clock + readiness rule,
 *                     with the governed next action beside the fact
 *
 * Nothing here recalculates money, storage or the clock its own way, and
 * nothing here resolves an owner — the owner avatar comes from the shared
 * Work feed (the one owner calculation). This module words the facts in
 * Primary School English, verbatim from the ruling.
 */
import { collectionTimingFor, type CollectionTimingRule, type OwnerCalendar } from "./collection-clock";
import {
  invoiceArrivalDayWord,
  invoicePaymentTiming,
  soRemaining,
  type InvoiceRegisterRow,
} from "./payment-invoice-register";
import { storageChargeOf } from "./payment-storage";
import type { WorkingDayOptions } from "./working-days";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ctrlOf(row: InvoiceRegisterRow) {
  const ctrl = row.orders?.ops_order_control;
  return Array.isArray(ctrl) ? (ctrl[0] ?? null) : (ctrl ?? null);
}

/** `Monday, 21 Sep` — the one day spelling the ruling uses on Monitor. */
export const monitorDayWord = invoiceArrivalDayWord;

// ─── Goods ───────────────────────────────────────────────────────────────────

export interface MonitorItemLine {
  sku: string;
  qty: number;
  /** `Ready` · `Arriving Monday, 21 Sep` · `Arrival not confirmed` */
  word: string;
  ready: boolean;
  arrivalIso: string | null;
}

export interface MonitorGoods {
  /** Every goods line on the order (the delivery scope of an ordinary SO). */
  lines: MonitorItemLine[];
  total: number;
  ready: number;
  /** The LAST waiting line's arrival, when every waiting line has one. */
  lastArrivalIso: string | null;
  /** True when at least one waiting line has no arrival date. */
  arrivalUnknown: boolean;
  completed: boolean;
}

/** Per-line readiness from the order's own stores: `line_stock_status` (the
 *  operation ladder's word per SKU) first, else `line_etas` (a line with a
 *  date is waiting; one without is ready), else nothing is known. */
export function monitorGoods(row: InvoiceRegisterRow): MonitorGoods {
  const order = row.orders;
  const completed = !!order && (order.status === "delivered" || !!order.delivered_at);
  const ctrl = ctrlOf(row);
  const status = ctrl?.line_stock_status ?? null;
  const etas = ctrl?.line_etas ?? null;
  const hasStatus = !!status && Object.keys(status).length > 0;
  const hasEtas = !!etas && Object.keys(etas).length > 0;
  // The goods lines are the order's own; a row whose lines carry no SKU (an
  // older import) still has the ladder's per-SKU signals, so those keys stand
  // in as the items rather than reading every line as `not ready`.
  const sourceLines: Array<{ sku?: string; qty: number }> = (order?.order_lines ?? []).some((l) => l.sku)
    ? (order?.order_lines ?? [])
    : [...new Set([...Object.keys(status ?? {}), ...Object.keys(etas ?? {})])].map((sku) => ({ sku, qty: 1 }));
  const lines: MonitorItemLine[] = sourceLines.map((l) => {
    const sku = String(l.sku ?? "");
    const eta = etas?.[sku] ?? null;
    const arrivalIso = eta && ISO_DATE.test(eta) ? eta : null;
    let ready: boolean;
    if (completed) ready = true;
    else if (hasStatus) ready = String(status![sku] ?? "").toLowerCase() === "ready";
    else if (hasEtas) ready = !(sku in etas!);
    else ready = false;
    return {
      sku,
      qty: Number(l.qty),
      ready,
      arrivalIso: ready ? null : arrivalIso,
      word: ready ? "Ready" : arrivalIso ? `Arriving ${monitorDayWord(arrivalIso)}` : "Arrival not confirmed",
    };
  });
  const waiting = lines.filter((l) => !l.ready);
  const arrivalUnknown = waiting.some((l) => !l.arrivalIso);
  const lastArrivalIso = waiting.length && !arrivalUnknown
    ? waiting.map((l) => l.arrivalIso!).sort().at(-1)!
    : null;
  return {
    lines,
    total: lines.length,
    ready: lines.length - waiting.length,
    lastArrivalIso,
    arrivalUnknown,
    completed,
  };
}

/** The Goods cell — the ruling's four sentences, verbatim. */
export function monitorGoodsWord(g: MonitorGoods): string {
  if (g.completed || (g.total > 0 && g.ready === g.total)) return "Goods ready";
  if (g.total === 0) return "Arrival not confirmed";
  if (g.ready > 0 && g.lastArrivalIso) {
    return `${g.ready} of ${g.total} items ready · Last item arriving ${monitorDayWord(g.lastArrivalIso)}`;
  }
  if (g.lastArrivalIso) return `Arriving ${monitorDayWord(g.lastArrivalIso)}`;
  return "Arrival not confirmed";
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export interface MonitorStorageCase {
  id: string;
  order_id: string;
  product_group: "mattress_bedframe" | "sofa";
  storage_start: string;
  rule_free_days: number;
  rule_charge_amount: number;
  rule_cycle_days: number;
  approved_free_until: string | null;
  approved_at?: string | null;
  billed_through_period?: number;
  status: "open" | "closed";
}

export interface MonitorFreeRequest {
  order_id: string;
  free_storage_requested: boolean;
  recorded_at: string;
}

export const STORAGE_GROUP_WORD: Record<MonitorStorageCase["product_group"], string> = {
  mattress_bedframe: "Mattress / Bedframe",
  sofa: "Sofa",
};

export type MonitorStorage =
  | { kind: "none" }
  | { kind: "free"; untilIso: string }
  | { kind: "approved_free"; untilIso: string }
  | { kind: "request_pending"; estimate: number }
  | { kind: "charging"; group: string; day: number; soFar: number }
  | { kind: "invoice_unpaid"; amount: number };

/**
 * One SO's storage fact, highest urgency first: an unpaid Storage Invoice,
 * then a pending free request, then a running charge, then an approved free
 * period, then the automatic free period, else no storage charge.
 *
 * `storageOwing` is the SO's live issued storage papers (from `soRemaining`)
 * — the money the papers ASK; the running charge is what has ACCRUED
 * (`storageChargeOf`) and stays in this cell until a paper is issued.
 */
export function monitorStorage(input: {
  orderId: string;
  cases: readonly MonitorStorageCase[];
  requests: readonly MonitorFreeRequest[];
  storageOwing: number;
  todayIso: string;
}): MonitorStorage {
  if (input.storageOwing > 0) return { kind: "invoice_unpaid", amount: input.storageOwing };
  const open = input.cases.filter((c) => c.order_id === input.orderId && c.status === "open");
  if (open.length === 0) return { kind: "none" };
  const pending = open.find((c) => input.requests.some((r) =>
    r.order_id === input.orderId && r.free_storage_requested
    && (!c.approved_at || r.recorded_at > c.approved_at)));
  if (pending) return { kind: "request_pending", estimate: Number(pending.rule_charge_amount) };
  const charges = open.map((c) => ({
    c,
    charge: storageChargeOf({
      storageStart: c.storage_start,
      ruleFreeDays: c.rule_free_days,
      ruleChargeAmount: Number(c.rule_charge_amount),
      ruleCycleDays: c.rule_cycle_days,
      approvedFreeUntil: c.approved_free_until,
    }, input.todayIso),
  }));
  const charging = charges.filter((x) => x.charge.commencedPeriods > 0)
    .sort((a, b) => b.charge.amountOwed - a.charge.amountOwed)[0];
  if (charging) {
    return {
      kind: "charging",
      group: STORAGE_GROUP_WORD[charging.c.product_group],
      day: charging.charge.dayOfStorage,
      soFar: charging.charge.amountOwed,
    };
  }
  const soonest = charges.sort((a, b) => a.charge.freeUntilIso.localeCompare(b.charge.freeUntilIso))[0]!;
  if (soonest.c.approved_free_until && soonest.c.approved_free_until >= soonest.charge.freeUntilIso) {
    return { kind: "approved_free", untilIso: soonest.charge.freeUntilIso };
  }
  return { kind: "free", untilIso: soonest.charge.freeUntilIso };
}

/** The Storage cell — the ruling's six sentences, verbatim. `money` is the
 *  shared money formatter (`RM 1,250.50`). */
export function monitorStorageWord(s: MonitorStorage, money: (n: number) => string): string {
  switch (s.kind) {
    case "none": return "No storage charge";
    case "free": return `Free until ${monitorDayWord(s.untilIso)}`;
    case "approved_free": return `Free storage approved until ${monitorDayWord(s.untilIso)}`;
    case "request_pending": return `Free request waiting for approval · Estimated charge ${money(s.estimate)}`;
    case "charging": return `${s.group} · Day ${s.day} · ${money(s.soFar)} so far`;
    case "invoice_unpaid": return `Storage Invoice issued · ${money(s.amount)} not paid`;
  }
}

// ─── Customer delivery ───────────────────────────────────────────────────────

export interface MonitorDelivery {
  dateIso: string | null;
  confirmed: boolean;
  /** `Friday, 18 Sep` · `No delivery date` */
  word: string;
  /** The second line when the date is the customer's REQUEST, not yet agreed. */
  note: string | null;
}

export function monitorDelivery(row: InvoiceRegisterRow): MonitorDelivery {
  const confirmed = ctrlOf(row)?.confirmed_date ?? null;
  if (confirmed && ISO_DATE.test(confirmed)) {
    return { dateIso: confirmed, confirmed: true, word: monitorDayWord(confirmed), note: null };
  }
  const order = row.orders;
  const requested = order?.delivery_date_tbd ? null : (order?.delivery_date ?? null);
  if (requested && ISO_DATE.test(requested)) {
    return { dateIso: requested, confirmed: false, word: monitorDayWord(requested), note: "Not confirmed yet" };
  }
  return { dateIso: null, confirmed: false, word: "No delivery date", note: null };
}

// ─── Payment timing ──────────────────────────────────────────────────────────

export type MonitorAction = "ask" | "wait" | "send_invoice";

export const MONITOR_ACTION_WORD: Record<MonitorAction, string> = {
  ask: "Ask customer to pay",
  wait: "Wait",
  send_invoice: "Send the invoice and collect payment",
};

export type MonitorTimingKind =
  | "paid"
  | "value_unknown"
  | "storage_invoice_unpaid"
  | "arrival_not_confirmed"
  | "no_date"
  | "promised_today"
  | "should_have_paid"
  | "due_today"
  | "ask_today"
  | "due_later";

export interface MonitorTiming {
  kind: MonitorTimingKind;
  /** Line 1 — the fact. */
  fact: string;
  /** Line 2 — the governed action, or null when nothing is asked of anyone. */
  action: MonitorAction | null;
  late: boolean;
  /** The deadline and ask day — FACTS on the company calendar. */
  dueIso: string | null;
  askIso: string | null;
  /** The days the OWNER acts — the Work item's due date. */
  actionDueIso: string | null;
  actionAskIso: string | null;
}

export function monitorTiming(input: {
  door: InvoiceRegisterRow;
  rows: readonly InvoiceRegisterRow[];
  storage: MonitorStorage;
  todayIso: string;
  opts: WorkingDayOptions;
  timingRules?: ReadonlyArray<CollectionTimingRule> | null;
  /** The customer's latest standing promise (`will_pay_on_date`), if any. */
  promisedIso?: string | null;
  /** The action owner's governed working days; absent ⇒ the Operation week. */
  owner?: OwnerCalendar;
}): MonitorTiming {
  const money = soRemaining(input.rows as InvoiceRegisterRow[], input.door.order_id);
  // The clock a collection runs under is the one in force the day the
  // invoice was issued (its start); a draft has no clock start yet — today.
  const clockStart = input.door.issued_at?.slice(0, 10) ?? input.todayIso;
  const timing = collectionTimingFor(input.timingRules, clockStart);
  const { timing: t, clock } = invoicePaymentTiming(
    input.door, input.todayIso, input.opts, input.rows as InvoiceRegisterRow[], timing, input.owner);
  const base = { dueIso: clock.dueIso, askIso: clock.askIso, actionDueIso: clock.actionDueIso, actionAskIso: clock.actionAskIso };
  if (!money.known) {
    return { kind: "value_unknown", fact: "Value not recorded", action: null, late: false, ...base };
  }
  if (t.kind === "paid") return { kind: "paid", fact: "Paid", action: null, late: false, ...base };
  if (input.storage.kind === "invoice_unpaid") {
    return { kind: "storage_invoice_unpaid", fact: "Storage Invoice not paid", action: "send_invoice", late: clock.overdue, ...base };
  }
  if (t.kind === "wait") {
    return { kind: "arrival_not_confirmed", fact: "Arrival not confirmed", action: "wait", late: false, ...base };
  }
  if (t.kind === "no_date") {
    return { kind: "no_date", fact: "No delivery date", action: "wait", late: false, ...base };
  }
  // A draft Sales Invoice asks nothing until it is sent: the act is to send
  // it — the same governed sentence the storage paper uses.
  const unsent = input.door.status === "draft";
  const ask: MonitorAction = unsent ? "send_invoice" : "ask";
  if (input.promisedIso && input.promisedIso === input.todayIso) {
    return { kind: "promised_today", fact: "Customer promised to pay today", action: ask, late: clock.overdue, ...base };
  }
  if (t.kind === "late") {
    return { kind: "should_have_paid", fact: "Payment should have been received", action: ask, late: true, ...base };
  }
  if (clock.attention === "t2") {
    // The deadline is a FACT on the company calendar; the owner acts on their
    // own working day. `Payment due today` only when today IS the deadline —
    // on the owner's earlier action day the fact names the deadline's day.
    const fact = clock.dueIso === input.todayIso
      ? "Payment due today"
      : `Payment due ${monitorDayWord(clock.dueIso!)}`;
    return { kind: "due_today", fact, action: ask, late: false, ...base };
  }
  if (clock.attention === "t3") {
    return { kind: "ask_today", fact: "Ask customer today", action: ask, late: false, ...base };
  }
  return {
    kind: "due_later",
    fact: clock.dueIso ? `Payment due ${monitorDayWord(clock.dueIso)}` : "No delivery date",
    action: "wait", late: false, ...base,
  };
}

// ─── The row ─────────────────────────────────────────────────────────────────

export interface PaymentMonitorRow {
  orderId: string;
  so: number | null;
  customer: string;
  /** The invoice row that opens the collection workspace — the Sales
   *  Invoice, else the first row the SO has. */
  door: InvoiceRegisterRow;
  rows: InvoiceRegisterRow[];
  money: ReturnType<typeof soRemaining>;
  goods: MonitorGoods;
  storage: MonitorStorage;
  delivery: MonitorDelivery;
  timing: MonitorTiming;
  promisedIso: string | null;
}

export interface PaymentMonitorInput {
  invoices: readonly InvoiceRegisterRow[];
  cases: readonly MonitorStorageCase[];
  requests: readonly MonitorFreeRequest[];
  todayIso: string;
  opts: WorkingDayOptions;
  timingRules?: ReadonlyArray<CollectionTimingRule> | null;
  /** Latest standing promise per order (`will_pay_on_date`). */
  promisedByOrder?: ReadonlyMap<string, string>;
  /** The action owner's governed working days; absent ⇒ the Operation week. */
  owner?: OwnerCalendar;
}

/**
 * One row per SO that still needs money. A paid SO leaves the default view —
 * its money remains in Payment Records. A voided paper alone is history and
 * makes no row; an SO whose value nobody recorded stays, saying so.
 */
export function paymentMonitorRows(input: PaymentMonitorInput): PaymentMonitorRow[] {
  const byOrder = new Map<string, InvoiceRegisterRow[]>();
  for (const r of input.invoices) {
    const list = byOrder.get(r.order_id) ?? [];
    list.push(r);
    byOrder.set(r.order_id, list);
  }
  const out: PaymentMonitorRow[] = [];
  for (const [orderId, rows] of byOrder) {
    const live = rows.filter((r) => r.status !== "voided");
    if (live.length === 0) continue;
    const door = live.find((r) => r.kind === "sales") ?? live[0]!;
    const money = soRemaining(input.invoices as InvoiceRegisterRow[], orderId);
    if (money.known && money.outstanding <= 0) continue;
    const goods = monitorGoods(door);
    const storage = monitorStorage({
      orderId, cases: input.cases, requests: input.requests,
      storageOwing: money.storageOwing, todayIso: input.todayIso,
    });
    const promisedIso = input.promisedByOrder?.get(orderId) ?? null;
    const timing = monitorTiming({
      door, rows: input.invoices, storage, todayIso: input.todayIso, opts: input.opts,
      timingRules: input.timingRules, promisedIso, owner: input.owner,
    });
    out.push({
      orderId,
      so: door.orders?.so ?? null,
      customer: door.orders?.customer_name ?? "Customer not available",
      door, rows: live, money, goods, storage,
      delivery: monitorDelivery(door),
      timing, promisedIso,
    });
  }
  return out.sort(monitorRiskOrder);
}

/** Risk order: late first, then due today, promised today, ask today, storage
 *  invoice unpaid, then by due date, then by SO. */
const RISK_RANK: Record<MonitorTimingKind, number> = {
  should_have_paid: 0,
  storage_invoice_unpaid: 1,
  promised_today: 2,
  due_today: 3,
  ask_today: 4,
  due_later: 5,
  arrival_not_confirmed: 6,
  no_date: 7,
  value_unknown: 8,
  paid: 9,
};

export function monitorRiskOrder(a: PaymentMonitorRow, b: PaymentMonitorRow): number {
  const r = RISK_RANK[a.timing.kind] - RISK_RANK[b.timing.kind];
  if (r !== 0) return r;
  const d = (a.timing.dueIso ?? "9999").localeCompare(b.timing.dueIso ?? "9999");
  if (d !== 0) return d;
  return (a.so ?? 0) - (b.so ?? 0);
}

// ─── Filters and summaries ───────────────────────────────────────────────────

export type MonitorFilterKey =
  | "needs_attention"
  | "ask_today"
  | "promised_today"
  | "should_have_paid"
  | "waiting_goods"
  | "storage_payments"
  | "all_unpaid";

export const MONITOR_FILTERS: ReadonlyArray<{ key: MonitorFilterKey; label: string }> = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "ask_today", label: "Ask customer today" },
  { key: "promised_today", label: "Promised today" },
  { key: "should_have_paid", label: "Should have been paid" },
  { key: "waiting_goods", label: "Waiting for goods" },
  { key: "storage_payments", label: "Storage payments" },
  { key: "all_unpaid", label: "All unpaid" },
];

export const DEFAULT_MONITOR_FILTER: MonitorFilterKey = "all_unpaid";

export function monitorFilterMatch(row: PaymentMonitorRow, key: MonitorFilterKey): boolean {
  const k = row.timing.kind;
  switch (key) {
    case "needs_attention":
      return row.timing.action !== null && row.timing.action !== "wait";
    case "ask_today":
      return k === "ask_today" || k === "due_today";
    case "promised_today":
      return k === "promised_today";
    case "should_have_paid":
      return k === "should_have_paid";
    case "waiting_goods":
      return k === "arrival_not_confirmed";
    case "storage_payments":
      return row.storage.kind === "invoice_unpaid" || row.storage.kind === "charging"
        || row.storage.kind === "request_pending";
    case "all_unpaid":
      return true;
  }
}

/** The clear-summary sentences (never `8 open · 2 late`). Zero prints nothing;
 *  an empty desk says so in one sentence. */
export function monitorSummaries(rows: readonly PaymentMonitorRow[]): string[] {
  const collectToday = rows.filter((r) =>
    r.timing.kind === "due_today" || r.timing.kind === "ask_today" || r.timing.kind === "promised_today").length;
  const late = rows.filter((r) => r.timing.kind === "should_have_paid").length;
  const storage = rows.filter((r) => r.storage.kind === "invoice_unpaid").length;
  const out: string[] = [];
  if (collectToday > 0) {
    out.push(`${collectToday} customer ${collectToday === 1 ? "balance needs" : "balances need"} collection today`);
  }
  if (late > 0) {
    out.push(`${late} ${late === 1 ? "payment" : "payments"} should have been received already`);
  }
  if (storage > 0) {
    out.push(`${storage} storage ${storage === 1 ? "payment needs" : "payments need"} collection`);
  }
  if (out.length === 0) out.push("Nothing needs collection today");
  return out;
}
