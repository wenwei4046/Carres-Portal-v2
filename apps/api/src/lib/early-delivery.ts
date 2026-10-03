import { deliveryOrderIssueGate, myHolidaySet, type DeliveryPaymentApproval, type FinanceException } from "@carres/shared";
import { loadBookingContext } from "./booking-context";
import type { adminClient } from "./supabase";

/** Checks an earlier arrangement without issuing a document or changing any
 * SO, money or storage fact. The existing release arithmetic still decides. */
export async function earlyDeliveryRefusal(
  sb: ReturnType<typeof adminClient>, orderId: string, date: string,
): Promise<string | null> {
  const ready = await sb.rpc("sales_order_goods_ready", { p_order_id: orderId });
  if (ready.error) throw new Error(ready.error.message);
  if (ready.data !== true) return "Goods not ready";
  const booking = await loadBookingContext(sb, orderId, null);
  if (!booking.ok) throw new Error("Delivery readiness could not be read");
  const [exceptions, approvals] = await Promise.all([
    sb.from("order_finance_exceptions").select("id,status,reason,opened_at,cleared_at,clear_evidence").eq("order_id", orderId),
    sb.from("order_delivery_payment_approvals").select("id,status,request_reason,requested_at,decided_at,decision_reason").eq("order_id", orderId),
  ]);
  if (exceptions.error || approvals.error) throw new Error("Delivery release could not be read");
  const financeExceptions: FinanceException[] = (exceptions.data ?? []).map((r) => ({
    id:r.id, status:r.status, reason:r.reason, openedAt:r.opened_at, clearedAt:r.cleared_at, clearEvidence:r.clear_evidence,
  }));
  const paymentApprovals: DeliveryPaymentApproval[] = (approvals.data ?? []).map((r) => ({
    id:r.id, status:r.status, requestReason:r.request_reason, requestedAt:r.requested_at, decidedAt:r.decided_at, decisionReason:r.decision_reason,
  }));
  const result = deliveryOrderIssueGate({
    bookingConfirmed: false, confirmedDateIso: date, confirmedTimeSlot: null,
    gate: { ...booking.ctx.gate, goodsReady: true, notReadySkus: [] },
    financeExceptions, paymentApprovals, holidays: myHolidaySet(), waitBookingConfirm: false,
  });
  return result.ok ? null : "Hold delivery";
}
