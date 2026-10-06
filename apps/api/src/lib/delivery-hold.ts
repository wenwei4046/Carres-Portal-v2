import {
  deliveryMoneyHolds,
  orderMoney,
  scheduledDeliveryOf,
  type BookingRead,
} from "@carres/shared";
import { bookingMoneyOf, type BookingMoneyRows } from "./booking-context";
import { storageSkuCategories } from "./sku-categories";
import { todayIsoMYT } from "./today";

/**
 * ⭐ `Hold delivery` FOR A PARTY WHO MAY NEVER SEE WHY — owner ruling
 * 2026-09-25, `docs/delivery/MASTER.md` §3 + §5.4 + §5.5 + §13.2.
 *
 * ```
 * Logistics   NETS portal · external link
 *             Hold delivery                     (never money, never why)
 * ```
 *
 * A delivery scope is HELD when, and only when, BOTH are true:
 *
 *   1. a Scheduled delivery exists for it — the ONE delivery-day reader
 *      (`scheduledDeliveryOf`: the live document, then Delivery's arrangement,
 *      then a confirmed booking). Before that, booking runs in parallel with
 *      payment and the partner is told nothing about money;
 *   2. the DO money gate holds — `deliveryMoneyHolds` over the figure the
 *      issue gate itself refuses on (`bookingMoneyOf` → `orderMoney`, the
 *      SAME assembly `loadBookingContext` hands `attemptDeliveryOrderIssue`),
 *      the approvals (0362) and the Finance exceptions (0355).
 *
 * The answer is a SET OF SCOPE KEYS — a yes/no per scope. No amount, no
 * reason and no approval ever leaves this file, so a caller cannot leak what
 * it was never given.
 *
 * COST: one batched `orders` read per 80 orders (every fact rides it as an
 * embed) plus the storage catalogue read for the SKUs of SCHEDULED orders
 * only — a constant few subrequests whatever the partner carries, never one
 * round trip per delivery (the Worker's subrequest budget, carry-forwards
 * `import-skus…`).
 */

export interface HoldScope {
  orderId: string;
  leg: number;
  /** Delivery's arrangement for this scope, as the caller already read it. */
  arrangement: { confirmedDate: string | null; confirmedTime: string | null } | null;
}

/** `${orderId}#${leg}` — the scope key the readers already use. */
export function holdKey(orderId: string, leg: number): string {
  return `${orderId}#${leg}`;
}

const HOLD_SELECT =
  "id, paid, delivery_stops, " +
  "order_lines(sku, qty, unit_price), order_addons(qty, unit_price), " +
  "ops_order_control(booking_stage, confirmed_date, confirmed_time_slot, balance, storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_collected_at, storage_waiver_status), " +
  "invoices(kind, status, amount, tax_amount, voided_at), " +
  "order_finance_exceptions(status), order_delivery_payment_approvals(status), " +
  "ops_delivery_orders(leg, delivery_date, time_slot, voided_at, issued_at)";

const ID_CHUNK = 80;

type HoldOrderRow = {
  id: string;
  paid: number | string | null;
  delivery_stops: Array<{ leg?: number | null; scheduled_at?: string | null }> | null;
  order_lines: Array<{ sku: string; qty: number; unit_price: number | null }> | null;
  order_addons: Array<{ qty: number; unit_price: number | null }> | null;
  ops_order_control: Record<string, unknown> | Array<Record<string, unknown>> | null;
  invoices: BookingMoneyRows["invoices"];
  order_finance_exceptions: Array<{ status: "open" | "cleared" }> | null;
  order_delivery_payment_approvals: Array<{ status: "pending" | "approved" | "refused" }> | null;
  ops_delivery_orders: Array<{
    leg: number | null;
    delivery_date: string | null;
    time_slot: string | null;
    voided_at: string | null;
    issued_at: string | null;
  }> | null;
};

/** PostgREST returns the 1:1 overlay as an object or a one-element array. */
function controlOf(row: HoldOrderRow): Record<string, unknown> | null {
  const raw = row.ops_order_control;
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** The scope's Scheduled day through the ONE reader — the Monitor's own precedence. */
function scopeIsScheduled(row: HoldOrderRow, scope: HoldScope): boolean {
  const document =
    (row.ops_delivery_orders ?? [])
      .filter((d) => (Number(d.leg ?? 0) || 0) === scope.leg && !d.voided_at)
      .sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""))[0] ?? null;
  let booking: BookingRead | null = null;
  if (scope.leg === 0) {
    const control = controlOf(row);
    booking = control
      ? {
          stage: (control.booking_stage as BookingRead["stage"]) ?? null,
          confirmedDate: (control.confirmed_date as string | null) ?? null,
          confirmedSlot: (control.confirmed_time_slot as string | null) ?? null,
        }
      : null;
  } else {
    /* A Journey leg: the day pencilled on its recorded stop (Monitor's rule). */
    const stop = (row.delivery_stops ?? []).find((s) => (Number(s.leg ?? 0) || 0) === scope.leg);
    booking = stop?.scheduled_at ? { stage: "confirmed", confirmedDate: stop.scheduled_at } : null;
  }
  return (
    scheduledDeliveryOf({
      document: document ? { deliveryDate: document.delivery_date, timeSlot: document.time_slot } : null,
      arrangement: scope.arrangement,
      booking,
    }).iso !== null
  );
}

/**
 * Which of these scopes print `Hold delivery`? Returns their `holdKey`s.
 * Throws on a failed read — the caller's route answers it like any other.
 */
export async function heldDeliveryScopes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  scopes: ReadonlyArray<HoldScope>,
): Promise<Set<string>> {
  const held = new Set<string>();
  const ids = [...new Set(scopes.map((s) => s.orderId))];
  if (ids.length === 0) return held;

  const rows: HoldOrderRow[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await sb.from("orders").select(HOLD_SELECT).in("id", ids.slice(i, i + ID_CHUNK));
    if (error) throw error;
    rows.push(...((data ?? []) as HoldOrderRow[]));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  /* Money is asked only where a Scheduled delivery exists. */
  const scheduled = scopes.filter((s) => {
    const row = byId.get(s.orderId);
    return row ? scopeIsScheduled(row, s) : false;
  });
  if (scheduled.length === 0) return held;

  const scheduledOrders = [...new Set(scheduled.map((s) => s.orderId))].map((id) => byId.get(id)!);
  const storageCategories = await storageSkuCategories(
    sb,
    scheduledOrders.flatMap((r) => (r.order_lines ?? []).map((l) => l.sku)),
  );
  const asOf = todayIsoMYT();
  const holdsByOrder = new Map<string, boolean>();
  for (const row of scheduledOrders) {
    const money = bookingMoneyOf({
      lines: row.order_lines ?? [],
      addons: row.order_addons ?? [],
      paid: row.paid ?? 0,
      control: controlOf(row),
      invoices: row.invoices ?? [],
      storageCategories,
      asOf,
    });
    holdsByOrder.set(
      row.id,
      deliveryMoneyHolds({
        outstanding: orderMoney(money).outstanding,
        financeExceptions: row.order_finance_exceptions ?? [],
        paymentApprovals: row.order_delivery_payment_approvals ?? [],
      }),
    );
  }
  for (const s of scheduled) {
    if (holdsByOrder.get(s.orderId)) held.add(holdKey(s.orderId, s.leg));
  }
  return held;
}
