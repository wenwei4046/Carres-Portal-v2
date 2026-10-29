/** One rule for "this order has a live Delivery Order": the newest document that
 *  is not voided. The mark-delivered menu gate (web) and attach-do (API) both
 *  read it, so neither can disagree with the other about SO-1372's shape
 *  (empty orders.do_number, live ops_delivery_orders row). */
export interface DeliveryOrderRow {
  do_number: string | null;
  voided_at?: string | null;
  issued_at?: string | null;
}

export function liveDeliveryOrderNumber(
  rows: readonly DeliveryOrderRow[] | null | undefined,
): string | null {
  const live = (rows ?? []).filter((r) => !r.voided_at && (r.do_number ?? "").trim());
  live.sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""));
  return live[0]?.do_number?.trim() ?? null;
}

/** The "Mark delivered" menu item: needs a live DO, and the order must still be open. */
export function canMarkDelivered(order: {
  status: string;
  do_number?: string | null;
  ops_delivery_orders?: readonly DeliveryOrderRow[] | null;
}): boolean {
  if (order.status === "cancelled" || order.status === "delivered") return false;
  return !!liveDeliveryOrderNumber(order.ops_delivery_orders);
}
