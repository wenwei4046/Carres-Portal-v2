/** Read-only physical evidence. PO issue dates and current Site are never inputs. */
export interface StockMovementEvidence {
  id: string;
  unitId: string;
  direction: "in" | "out";
  siteId: string | null;
  siteName: string | null;
  at: string;
  reference: string;
  href: string;
  actorId: string | null;
}

export interface StockSiteVisit {
  receipt: StockMovementEvidence;
  departure: StockMovementEvidence | null;
}

/** A return is another receipt, never an overwrite of a previous visit.
 * An unlocated departure or overlapping receipts cannot prove a same-Site pair.
 * Preserve those departures separately rather than inventing a historical Site.
 */
export function stockSiteVisits(evidence: StockMovementEvidence[]) {
  const visits: StockSiteVisit[] = [];
  const unpairedDepartures: StockMovementEvidence[] = [];
  const seen = new Set<string>();
  for (const event of [...evidence].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (event.direction === "in") {
      visits.push({ receipt: event, departure: null });
      continue;
    }
    const candidates = event.siteId ? visits.filter((visit) =>
      !visit.departure && visit.receipt.unitId === event.unitId && visit.receipt.siteId === event.siteId,
    ) : [];
    if (candidates.length === 1) candidates[0].departure = event;
    else unpairedDepartures.push(event);
  }
  return { visits, unpairedDepartures };
}
