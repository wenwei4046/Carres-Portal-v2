/**
 * Houzs-way Warehouse views on top of the ONE Unit ledger.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): "just clear Carress rules
 * and Implement Houzs inside". Houzs counts a quantity per SKU per warehouse and
 * keeps a Stock Card and a Loading List. Carres keeps its per-Unit data model;
 * these are read-only views that COUNT Units. Jess was not part of this decision.
 */
import { unitAvailability } from "./unit-availability";
import type { WarehouseOutboundCard } from "./warehouse-outbound";

/** Physically at a Site: the same buckets as `stock_sku_availability.on_hand`. */
function onHand(status: string | null): boolean {
  if (status === null) return false;
  const a = unitAvailability({ status });
  return a === "available" || a === "reserved" || a === "not_available";
}

export interface StockCardUnit {
  id: string;
  /** Null for a counted row — it has no Unit ID to print. */
  unitCode: string | null;
  qty: number;
  /** The Site the Unit is at now. */
  siteId: string | null;
}

export interface StockCardEvent {
  unitId: string;
  seq: number;
  event: string;
  fromValue: string | null;
  toValue: string | null;
  eventAt: string;
}

export interface StockCardLine {
  seq: number;
  eventAt: string;
  unitCode: string | null;
  event: string;
  fromValue: string | null;
  toValue: string | null;
  qtyIn: number;
  qtyOut: number;
  balance: number;
}

/**
 * The Stock Card of one item, replayed from each Unit's lineage. A line is
 * written only when a Unit arrives at or leaves the counted stock (status in or
 * out of on hand, or moving Site when one Site is chosen). `siteId` null = all
 * Sites, where a move between Sites changes nothing.
 */
export function stockCardLines(
  units: readonly StockCardUnit[],
  events: readonly StockCardEvent[],
  siteId: string | null,
): StockCardLine[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  // Where each Unit started: the first Site move's origin, else where it is now.
  const state = new Map<string, { status: string | null; site: string | null }>();
  for (const u of units) {
    const firstMove = sorted.find((e) => e.unitId === u.id && e.event === "site_changed");
    state.set(u.id, { status: null, site: firstMove ? firstMove.fromValue : u.siteId });
  }
  const counted = (s: { status: string | null; site: string | null }) =>
    onHand(s.status) && (siteId === null || s.site === siteId) ? 1 : 0;

  const lines: StockCardLine[] = [];
  let balance = 0;
  for (const e of sorted) {
    const unit = byId.get(e.unitId);
    const s = state.get(e.unitId);
    if (!unit || !s) continue;
    const before = counted(s);
    if (e.event === "unit_born" || e.event === "status_changed") s.status = e.toValue;
    else if (e.event === "site_changed") s.site = e.toValue;
    else continue;
    const delta = (counted(s) - before) * unit.qty;
    if (delta === 0) continue;
    balance += delta;
    lines.push({
      seq: e.seq,
      eventAt: e.eventAt,
      unitCode: unit.unitCode,
      event: e.event,
      fromValue: e.fromValue,
      toValue: e.toValue,
      qtyIn: delta > 0 ? delta : 0,
      qtyOut: delta < 0 ? -delta : 0,
      balance,
    });
  }
  return lines;
}

export interface LoadingListRow {
  key: string;
  doNumber: string;
  source: string;
  eventDate: string;
  fromLocation: string;
  warehouseSiteId: string | null;
  toCustomer: string;
  logisticsPartner: string;
  vehicle: string | null;
  sku: string | null;
  name: string | null;
  qty: number;
  loaded: number;
  toLoad: number;
}

/**
 * The Loading List: one line per item per DO still to load. Houzs way — a line
 * leaves the list once the warehouse has loaded it; driver confirmation is not
 * waited for here (Outbound still shows it).
 * Follows Houzs backend/src/scm/routes/loading-list.ts:1 (the warehouse loading
 * queue) per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
 */
export function loadingListRows(cards: readonly WarehouseOutboundCard[]): LoadingListRow[] {
  const rows: LoadingListRow[] = [];
  for (const c of cards) {
    for (const p of c.products) {
      const toLoad = Math.max(0, p.qty - p.loaded);
      if (toLoad === 0) continue;
      rows.push({
        key: `${c.doNumber}\u0000${c.warehouseSiteId ?? c.fromLocation}\u0000${p.sku ?? p.name ?? ""}`,
        doNumber: c.doNumber,
        source: c.source,
        eventDate: c.eventDate,
        fromLocation: c.fromLocation,
        warehouseSiteId: c.warehouseSiteId ?? null,
        toCustomer: c.toCustomer,
        logisticsPartner: c.logisticsPartner,
        vehicle: c.vehicle,
        sku: p.sku,
        name: p.name,
        qty: p.qty,
        loaded: p.loaded,
        toLoad,
      });
    }
  }
  return rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.doNumber.localeCompare(b.doNumber));
}
