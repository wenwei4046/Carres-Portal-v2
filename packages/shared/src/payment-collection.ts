/** Payment MASTER §16: check the goods before asking the customer to pay.
 * This is collection readiness only; it never changes money or releases Delivery.
 * The source owner supplies readiness, arrival and completed-delivery facts.
 */
export function paymentCollectionReadiness(facts: {
  completed: boolean;
  goodsReady: boolean;
  stockEtaIso: string | null;
}): "wait" | "ready" {
  if (facts.completed || facts.goodsReady) return "ready";
  const arrival = facts.stockEtaIso;
  if (!arrival || !/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return "wait";
  const date = new Date(`${arrival}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === arrival
    ? "ready"
    : "wait";
}
