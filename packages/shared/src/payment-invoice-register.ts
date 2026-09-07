/**
 * THE INVOICES REGISTER DERIVATIONS (docs/payment/MASTER.md §16).
 *
 * One arithmetic (Law D): `Needed` is the shared `orderMoney` outstanding;
 * `Payment Timing` is the shared `collectionClock` + `paymentCollectionReadiness`
 * answer. This module derives the register's cell FACTS from source columns —
 * it never recalculates money its own way and it words no action (a register
 * cell carries the fact alone, owner ruling 2026-08-18).
 *
 * Goods copy is the §16 approved set, verbatim:
 *   `Goods ready` · `Arriving Monday, 7 Sep` · `Arrival not confirmed`
 */
import { z } from "zod";
import { collectionClock, type CollectionClock } from "./collection-clock";
import { orderMoney } from "./order-money";
import { paymentCollectionReadiness } from "./payment-collection";
import type { WorkingDayOptions } from "./working-days";

export const invoiceRegisterQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export const invoicePrepareInput = z.object({
  orderId: z.string().uuid(),
});

export const invoiceVoidReplaceInput = z.object({
  reason: z.string().trim().min(1, "A reason is required to void an invoice.").max(500),
});

export const recordMessageInput = z.object({
  kind: z.enum(["payment_request", "reminder", "receipt", "storage", "other"]),
  messageText: z.string().trim().min(1, "The sent message text is required.").max(4000),
  templateKey: z.string().trim().max(80).nullish(),
  screenshotUrl: z.string().trim().min(1, "The sent screenshot is required.").max(300),
});

export type InvoiceStatus = "draft" | "issued" | "voided";
export type InvoiceKind = "sales" | "storage" | "additional_storage";

/** The register row as the API returns it — source facts, not derived words. */
export interface InvoiceRegisterRow {
  id: string;
  invoice_no: string | null;
  status: InvoiceStatus;
  kind: InvoiceKind;
  amount: number;
  tax_amount: number;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  replaces_invoice_id: string | null;
  created_at: string;
  order_id: string;
  orders: {
    id: string;
    so: number;
    customer_name: string;
    customer_phone?: string | null;
    source_ref?: string[] | string | null;
    status: string;
    paid: number | string | null;
    delivery_date: string | null;
    delivery_date_tbd: boolean | null;
    delivered_at: string | null;
    ops_assigned_logistic?: string | null;
    delivery_partners?: { name: string; contact: string | null } | null;
    order_payments?: Array<{
      id: string; receipt_no: string | null; amount: number;
      paid_on: string; voided_at: string | null;
    }>;
    payment_communications?: Array<{
      id: string; kind: string; message_text: string; template_key: string | null;
      sent_screenshot_url: string; recorded_at: string;
    }>;
    order_lines: Array<{ sku?: string; qty: number; unit_price: number | string | null }>;
    order_addons: Array<{ qty: number; unit_price: number | string | null }>;
    ops_order_control: Array<{
      balance: number | string | null;
      confirmed_date: string | null;
      line_etas: Record<string, string> | null;
      line_stock_status: Record<string, string> | null;
    }>;
  } | null;
}

export interface InvoiceRegisterPage {
  rows: InvoiceRegisterRow[];
  total: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ctrlOf(row: InvoiceRegisterRow) {
  const ctrl = row.orders?.ops_order_control;
  return Array.isArray(ctrl) ? (ctrl[0] ?? null) : (ctrl ?? null);
}

/** Goods facts from the order's own source columns — the same signals the
 *  operation ladder reads (`line_stock_status` + `line_etas`), summarised for
 *  a money reader: is everything ready, and if not, when do the waiting lines
 *  arrive. */
export function invoiceGoodsFacts(row: InvoiceRegisterRow): {
  completed: boolean;
  goodsReady: boolean;
  arrivalIso: string | null;
} {
  const order = row.orders;
  const completed = !!order && (order.status === "delivered" || !!order.delivered_at);
  const ctrl = ctrlOf(row);
  const status = ctrl?.line_stock_status ?? null;
  const etas = ctrl?.line_etas ?? null;

  const waitingKeys =
    status && Object.keys(status).length > 0
      ? Object.entries(status)
          .filter(([, v]) => String(v).toLowerCase() !== "ready")
          .map(([k]) => k)
      : Object.keys(etas ?? {});
  const goodsReady =
    (!!status && Object.keys(status).length > 0 && waitingKeys.length === 0) ||
    (!!etas && Object.keys(etas).length > 0 && waitingKeys.length === 0);

  let arrivalIso: string | null = null;
  if (!goodsReady && etas) {
    const pool = waitingKeys.map((k) => etas[k]).filter(Boolean);
    for (const d of pool.length ? pool : Object.values(etas)) {
      if (ISO_DATE.test(d) && (!arrivalIso || d > arrivalIso)) arrivalIso = d;
    }
  }
  return { completed, goodsReady, arrivalIso };
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** The §16 arriving spelling, verbatim: `Monday, 7 Sep`. */
export function invoiceArrivalDayWord(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The Goods cell — one of the three approved strings. */
export function invoiceGoodsWord(row: InvoiceRegisterRow): string {
  const facts = invoiceGoodsFacts(row);
  if (facts.completed || facts.goodsReady) return "Goods ready";
  if (facts.arrivalIso) return `Arriving ${invoiceArrivalDayWord(facts.arrivalIso)}`;
  return "Arrival not confirmed";
}

/** `Needed` — the ONE outstanding arithmetic, from the order's own stores. */
export function invoiceNeeded(row: InvoiceRegisterRow): ReturnType<typeof orderMoney> {
  const order = row.orders;
  const lineSum = (order?.order_lines ?? []).reduce(
    (sum, l) => sum + Number(l.qty) * Number(l.unit_price ?? 0), 0);
  const addonSum = (order?.order_addons ?? []).reduce(
    (sum, a) => sum + Number(a.qty) * Number(a.unit_price ?? 0), 0);
  return orderMoney({
    lineSum,
    addonSum,
    paid: order?.paid ?? null,
    controlBalance: ctrlOf(row)?.balance ?? null,
  });
}

/** The SO's remaining money across EVERY live invoice kind — what a deduped
 *  Calendar entry (or any SO-level "still needed") says, so choosing the
 *  Sales Invoice as the door never hides an unpaid Storage or Additional
 *  Storage obligation.
 *
 *  Storage obligations are the SO's live ISSUED storage-kind invoices with
 *  their tax (§2 exactly — a draft asks nothing yet, a voided one is dead;
 *  a correction in flight is visible on the case, never a debt rule). Goods
 *  value comes from the same `orderMoney` stores as `invoiceNeeded`.
 *  `orders.paid` is subtracted ONCE from the combined obligation — the Work
 *  engine's law (`sales-order-work-source`) — so a payment posted against a
 *  storage invoice is neither counted twice nor left inflating goods owing.
 *  (`orderMoney`'s keyed source is already an outstanding, so the combined
 *  subtraction reduces to `keyed + storage` there — no second subtraction.) */
export function soRemaining(
  rows: InvoiceRegisterRow[],
  orderId: string,
): {
  known: boolean;
  outstanding: number;
  storageOwing: number;
  /** Money past every obligation — `RM {amount} needs review` (§5). */
  overpaid: number;
} {
  const mine = rows.filter((r) => r.order_id === orderId);
  const door = mine.find((r) => r.kind === "sales") ?? mine[0];
  if (!door) return { known: false, outstanding: 0, storageOwing: 0, overpaid: 0 };
  // A live obligation is an ISSUED storage-kind invoice — §2 exactly:
  // `issued live invoice obligations`. A draft asks nothing yet, EVEN a
  // replacement draft: the correction window (void → reissue) is a paper in
  // flight, not a second debt rule, and the reader must not invent one. The
  // lineage (0429) plus billed_through_period (0438) keep the obligation from
  // being lost — the replacement is there to ISSUE, and the case card says a
  // correction is in progress.
  const storageOwing = mine
    .filter((r) => r.kind !== "sales" && r.status === "issued" && !r.voided_at)
    .reduce((sum, r) => sum + Number(r.amount) + Number(r.tax_amount), 0);
  const goods = invoiceNeeded(door);
  if (!goods.known) return { known: false, outstanding: 0, storageOwing, overpaid: 0 };
  const total = goods.total ?? 0;
  return {
    known: true,
    outstanding: Math.max(0, total + storageOwing - goods.paid),
    storageOwing,
    overpaid: Math.max(0, goods.paid - (total + storageOwing)),
  };
}

/** The Customer Delivery cell fact: the customer-confirmed day, else the
 *  requested day, else the honest absence. */
export function invoiceCustomerDelivery(row: InvoiceRegisterRow): {
  dateIso: string | null;
  word: "confirmed" | "requested" | "customer_not_sure" | "no_date";
} {
  const confirmed = ctrlOf(row)?.confirmed_date ?? null;
  if (confirmed && ISO_DATE.test(confirmed)) return { dateIso: confirmed, word: "confirmed" };
  const order = row.orders;
  if (order?.delivery_date_tbd) return { dateIso: null, word: "customer_not_sure" };
  const requested = order?.delivery_date ?? null;
  if (requested && ISO_DATE.test(requested)) return { dateIso: requested, word: "requested" };
  return { dateIso: null, word: "no_date" };
}

export type InvoiceTiming =
  | { kind: "paid" }
  | { kind: "wait" }
  | { kind: "no_date" }
  | { kind: "due"; dueIso: string }
  | { kind: "late" };

/** The Payment Timing cell — a FACT, never an action sentence. The clock is
 *  the shared collection clock; readiness is the shared wait rule. */
export function invoicePaymentTiming(
  row: InvoiceRegisterRow,
  todayIso: string,
  opts: WorkingDayOptions = {},
  /** The SO's sibling register rows. Given, the paid/needed check is the SO
   *  across every live invoice kind (`soRemaining`) — an SO settled on goods
   *  but owing storage is NOT `paid`. Absent, the goods arithmetic answers
   *  (a caller holding one row alone). */
  rows?: InvoiceRegisterRow[],
): { timing: InvoiceTiming; clock: CollectionClock } {
  const goods = invoiceGoodsFacts(row);
  const clock = collectionClock(
    {
      confirmedDateIso: ctrlOf(row)?.confirmed_date ?? null,
      promisedDateIso: row.orders?.delivery_date_tbd ? null : row.orders?.delivery_date ?? null,
    },
    todayIso,
    opts,
  );
  const money = rows ? soRemaining(rows, row.order_id) : invoiceNeeded(row);
  if (money.known && money.outstanding <= 0) return { timing: { kind: "paid" }, clock };
  const readiness = paymentCollectionReadiness({
    completed: goods.completed,
    goodsReady: goods.goodsReady,
    stockEtaIso: goods.arrivalIso,
  });
  if (readiness === "wait") return { timing: { kind: "wait" }, clock };
  if (!clock.anchorIso || !clock.dueIso) return { timing: { kind: "no_date" }, clock };
  if (clock.overdue) return { timing: { kind: "late" }, clock };
  return { timing: { kind: "due", dueIso: clock.dueIso }, clock };
}
