import type { ReadyStockUnit } from "./so-batch-ready-stock";

/** Read-only whole-scope suggestions. Callers supply canonical remaining demand
 * and source-validated compatible candidates, never reconstructed quantities.
 * Saving remains the existing Sales Order reservation door. */
export interface SoBatchStockDemand {
  orderId: string;
  orderLineId: string;
  remainingQty: number;
  requestedDeliveryDate: string | null;
  proceededAt: string | null;
}

export interface SoBatchStockOffer {
  orderId: string;
  orderLineId: string;
  units: ReadyStockUnit[];
}

/** Existing To Order whole-record allocation, shared with the optional round
 * matcher. Ordering/compatibility are supplied by their authoritative owners. */
export function allocateWholeStockRecords<L, U extends { id: string; qty: number }>(
  lines: readonly L[], records: readonly U[],
  remaining: (line: L) => number, compatible: (line: L, record: U) => boolean,
): Map<L, U[]> {
  const offers = new Map<L, U[]>();
  const used = new Set<string>();
  for (const line of lines) {
    const need = remaining(line);
    let qty = 0;
    const picked: U[] = [];
    for (const record of records) {
      if (qty >= need) break;
      if (used.has(record.id) || !compatible(line, record) || record.qty <= 0 || qty + record.qty > need) continue;
      qty += record.qty;
      picked.push(record);
      used.add(record.id);
    }
    if (picked.length) offers.set(line, picked);
  }
  return offers;
}

export function matchSoBatchReadyStock(
  demands: readonly SoBatchStockDemand[],
  candidates: readonly ReadyStockUnit[],
  options: ({ siteName: string; warehouseId?: never } | { warehouseId: string; siteName?: never }) & { priority?: "customer_delivery" | "proceed_date" },
): SoBatchStockOffer[] {
  const lines = new Set<string>();
  for (const demand of demands) {
    if (lines.has(demand.orderLineId) || !Number.isInteger(demand.remainingQty) || demand.remainingQty < 0) {
      throw new Error("invalid_stock_match_demand");
    }
    lines.add(demand.orderLineId);
  }
  const pool = new Map<string, ReadyStockUnit>();
  for (const unit of candidates) {
    const prior = pool.get(unit.itemId);
    if (prior) {
      // Repeated per-order reads may name the same Unit with different compatible
      // lines. Conflicting physical facts are stale evidence, never extra stock.
      const { matchingLineIds: _a, lineIds: _b, ...facts } = unit;
      const { matchingLineIds: _c, lineIds: _d, ...priorFacts } = prior;
      if (JSON.stringify(facts) !== JSON.stringify(priorFacts)) throw new Error("stock_candidate_changed");
      pool.set(unit.itemId, { ...prior, matchingLineIds: [...new Set([...prior.matchingLineIds, ...unit.matchingLineIds])] });
    } else pool.set(unit.itemId, { ...unit, matchingLineIds: [...unit.matchingLineIds] });
  }
  const eligible = [...pool.values()].filter(unit =>
    (options.warehouseId ? unit.warehouseId === options.warehouseId : unit.siteName === options.siteName) && unit.ownership === "carres_owned" &&
    unit.identityScope === "unit" && unit.qty === 1 && unit.blocked == null &&
    !unit.reservedForLineId,
  ).sort((a, b) =>
    (a.dateIn ?? "9999-12-31").localeCompare(b.dateIn ?? "9999-12-31") ||
    (a.unitCode ?? a.itemId).localeCompare(b.unitCode ?? b.itemId) || a.itemId.localeCompare(b.itemId),
  );
  const priority = options.priority ?? "customer_delivery";
  const ordered = [...demands].sort((a, b) =>
    (priority === "customer_delivery" ?
      (a.requestedDeliveryDate ?? "9999-12-31").localeCompare(b.requestedDeliveryDate ?? "9999-12-31") : 0) ||
    (a.proceededAt ?? "9999-12-31").localeCompare(b.proceededAt ?? "9999-12-31") ||
    a.orderId.localeCompare(b.orderId) || a.orderLineId.localeCompare(b.orderLineId),
  );
  const picks = allocateWholeStockRecords(ordered, eligible.map(unit => ({ ...unit, id: unit.itemId })),
    demand => demand.remainingQty, (demand, unit) => unit.matchingLineIds.includes(demand.orderLineId));
  return [...picks].map(([demand, units]) => ({ orderId: demand.orderId, orderLineId: demand.orderLineId, units }));
}
