/**
 * IS THIS DELIVERY OUTSTATION? — the ONE reading (Law D) every money clock,
 * the Order Route, the Logistics card and the Payment Monitor ask before they
 * choose the collection pair (`collectionPairOf`).
 *
 * Today's rule, unchanged (Payment MASTER "Collection timing" · ERP-ARCHITECTURE
 * §6.5): a delivery is outstation when a logistics company is ASSIGNED and that
 * company is not the Klang Valley default (`delivery_partners.kv_default`). No
 * company assigned yet ⇒ not outstation — the ordinary pair stands until
 * Delivery records who carries it.
 *
 * PURE. Callers pass the assigned company's own row (Delivery's arrangement
 * first, the order's columns as fallback — `assignedLogisticsIdOf`).
 */
export interface OutstationPartnerFact {
  /** camelCase readers (the Logistics card facts). */
  kvDefault?: boolean | null;
  /** snake_case readers (PostgREST rows). */
  kv_default?: boolean | null;
}

export function isOutstation(partner: OutstationPartnerFact | null | undefined): boolean {
  if (!partner) return false;
  const kv = partner.kvDefault ?? partner.kv_default ?? false;
  return kv !== true;
}
