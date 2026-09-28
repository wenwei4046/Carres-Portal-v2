/**
 * THE ORDER ROUTE'S GOODS LINES — Purchasing's, Receiving's and Stock's own
 * records, read per Sales Order LINE.
 *
 * ⭐ OWNER RULING 2026-09-26 (`docs/orders/MASTER.md` § THE GOODS CHAIN READS
 * PURCHASING, RECEIVING AND STOCK). Measured before it: a Purchase Order was
 * paired with a line by SKU similarity, SUPPLIER read a column that is NULL on
 * every live PO, RECEIVING dropped its count the moment a receipt existed and
 * summed the quantities itself.
 *
 * This module only ARRANGES records. Every judgement is the owner's function:
 *   the newest evidenced answer   `poExpectedArrivalsOf`     (Purchasing)
 *   the day-before check          `tomorrowDeliveryCallOf`   (Purchasing)
 *   what is still owed            `receivingSummaryOf`       (Receiving)
 * and the only lineage is `po_line_sources` — never a SKU match.
 */
import { poExpectedArrivalsOf, type EffectiveArrivalPromise } from "./po-windows";
import { tomorrowDeliveryCallOf } from "./purchasing-supplier-calls";
import { normalizeSkuKey } from "./sku-code";
import { receivingSummaryOf } from "./warehouse-receipt";

export interface RouteGoodsFacts {
  todayIso: string;
  holidays?: ReadonlySet<string>;
  /** `order_lines` of the CURRENT effective Revision, goods only. */
  lines: ReadonlyArray<{ id: string; sku: string; label: string; qty: number }>;
  /** `po_line_sources`, this order's rows. */
  sources: ReadonlyArray<{
    order_line_id: string | null;
    po_id: string;
    po_line_id: string | null;
    qty: number;
  }>;
  purchaseOrders: ReadonlyArray<{
    id: string;
    status: string;
    supplier_id?: string | null;
    destination_id?: string | null;
    placed_at: string | null;
    official_delivery_date: string | null;
    eta_date: string | null;
    version?: number | null;
    /** The supplier's name, for the Purchasing and Supplier sentences. */
    supplier_name?: string | null;
    /** `po_sends` rows (0377): only `confirmed_sent` for the CURRENT version
     *  says the PDF reached the supplier; an opened app proves nothing. */
    sends?: ReadonlyArray<{ kind?: string | null; po_version?: number | null }>;
    lines: ReadonlyArray<{
      id: string;
      sku: string;
      qty: number;
      received_qty: number;
      damaged_qty?: number | null;
      wrong_item_qty?: number | null;
    }>;
    promises: ReadonlyArray<EffectiveArrivalPromise>;
    arrival_confirmations: ReadonlyArray<{
      po_version?: number | null;
      for_date: string;
      destination_id?: string | null;
    }>;
  }>;
  /** `warehouse_receipts` of those POs, every status. */
  receipts: ReadonlyArray<{
    id: string;
    po_id: string | null;
    grn_no: string | null;
    goods_received_at: string | null;
    status: string;
    /** `lines[].id` — the PO lines this receipt counted. */
    line_ids: ReadonlyArray<string>;
  }>;
  /** `ops_stock_items` reserved to or sold against this order. */
  units: ReadonlyArray<{
    unit_code: string | null;
    status: string;
    reserved_order_line_id: string | null;
    sku: string;
  }>;
  /** Eligible Ready Stock per SKU — Stock's own count, by its own match. */
  readyStock: Readonly<Record<string, number>>;
}

export interface RouteGoodsSource {
  poId: string;
  supplierName: string | null;
  /** The CURRENT version is marked `PO sent to supplier` (Purchasing §5.6). */
  sent: boolean;
  /** This line's share of the Purchase Order. */
  qty: number;
  issuedAt: string | null;
  /** The immutable original — `official_delivery_date`. */
  poDeliveryDate: string | null;
  /** The supplier's newest promise, ONLY when it differs from the original. */
  expectedArrival: { date: string; change: "delayed" | "earlier"; reason: string | null } | null;
  /** The answer is `confirmed`, or the arrival was confirmed for its day. */
  confirmed: boolean;
  /** The day-before check is open — the only time Carres asks the supplier (Purchasing §5.7). */
  dayBeforeCheckOpen: boolean;
  receivedQty: number;
  pendingQty: number;
  damagedOrWrongQty: number;
  latestGrn: { id: string; number: string; receivedAt: string | null } | null;
}

export interface RouteGoodsLine {
  lineId: string;
  sku: string;
  label: string;
  qty: number;
  sources: RouteGoodsSource[];
  onOrderQty: number;
  /** Bound Units — reserved to, or sold against, this line. */
  readyQty: number;
  unitCodes: string[];
  /** What neither a Unit nor a Purchase Order covers. */
  uncoveredQty: number;
  shortBecause: "not-ordered" | "not-received" | null;
  /** Eligible Ready Stock for the SKU, while the line is short. */
  readyStockQty: number;
}

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);
const count = (value: unknown) => Math.max(0, Number(value) || 0);
const skuOf = (sku: string) => normalizeSkuKey(sku) || sku;

export function routeGoodsLinesOf(facts: RouteGoodsFacts): RouteGoodsLine[] {
  const poById = new Map(
    facts.purchaseOrders.filter((po) => po.status !== "cancelled").map((po) => [po.id, po]),
  );
  const linesOfSku = (sku: string) => facts.lines.filter((line) => skuOf(line.sku) === skuOf(sku));

  /* ── lineage: the line a source names, in the order it was written ────── */
  const sourcesByLine = new Map<string, Array<RouteGoodsFacts["sources"][number]>>();
  for (const source of facts.sources) {
    const po = poById.get(source.po_id);
    if (!po) continue;
    let lineId = source.order_line_id;
    if (!lineId) {
      /* Lineage written before the line was recorded. It may join by SKU only
         when that cannot be wrong: exactly one line carries the SKU. */
      const poLine = po.lines.find((row) => row.id === source.po_line_id);
      const candidates = poLine ? linesOfSku(poLine.sku) : [];
      lineId = candidates.length === 1 ? candidates[0]!.id : null;
    }
    if (!lineId) continue;
    sourcesByLine.set(lineId, [...(sourcesByLine.get(lineId) ?? []), source]);
  }

  /* A PO line shared by several Sales Order lines is received in lineage
     order: what arrived fills the first share before the next. */
  const receivedLeft = new Map<string, number>();
  const troubleLeft = new Map<string, number>();
  for (const po of poById.values()) {
    for (const line of po.lines) {
      const summary = receivingSummaryOf([line]);
      receivedLeft.set(line.id, summary.receivedQty);
      troubleLeft.set(line.id, summary.damagedQty + summary.wrongItemQty);
    }
  }

  /* ── Units: the line a Unit names; one that names none takes the first
     line of its SKU that still has room ─────────────────────────────────── */
  const unitsByLine = new Map<string, string[]>();
  const room = new Map(facts.lines.map((line) => [line.id, count(line.qty)]));
  const bind = (lineId: string, code: string | null) => {
    unitsByLine.set(lineId, [...(unitsByLine.get(lineId) ?? []), code ?? ""]);
    room.set(lineId, (room.get(lineId) ?? 0) - 1);
  };
  const named = facts.units.filter((unit) => unit.reserved_order_line_id && room.has(unit.reserved_order_line_id));
  for (const unit of named) bind(unit.reserved_order_line_id!, unit.unit_code);
  for (const unit of facts.units) {
    if (named.includes(unit)) continue;
    const home = linesOfSku(unit.sku).find((line) => (room.get(line.id) ?? 0) > 0);
    if (home) bind(home.id, unit.unit_code);
  }

  return facts.lines.map((line) => {
    const qty = count(line.qty);
    const sources: RouteGoodsSource[] = [];
    for (const source of sourcesByLine.get(line.id) ?? []) {
      const po = poById.get(source.po_id)!;
      const poLine = po.lines.find((row) => row.id === source.po_line_id) ?? null;
      const share = count(source.qty);
      const version = po.version ?? 1;

      const taken = poLine ? Math.min(share, receivedLeft.get(poLine.id) ?? 0) : 0;
      const trouble = poLine ? Math.min(share, troubleLeft.get(poLine.id) ?? 0) : 0;
      if (poLine) {
        receivedLeft.set(poLine.id, (receivedLeft.get(poLine.id) ?? 0) - taken);
        troubleLeft.set(poLine.id, (troubleLeft.get(poLine.id) ?? 0) - trouble);
      }

      const original = day(po.official_delivery_date);
      const arrivals = poLine
        ? poExpectedArrivalsOf({
            version,
            officialDeliveryDate: po.official_delivery_date,
            etaDate: po.eta_date,
            promises: po.promises,
            lines: [{ id: poLine.id, qty: count(poLine.qty), receivedQty: count(poLine.received_qty) }],
          })
        : [];
      /* The last batch decides when the line is whole. */
      const newest = [...arrivals].sort((a, b) => b.arrival.localeCompare(a.arrival))[0] ?? null;
      const arrivalConfirmed = newest
        ? po.arrival_confirmations.some(
            (row) =>
              (row.po_version ?? 1) === version &&
              day(row.for_date) === newest.arrival &&
              (!po.destination_id || row.destination_id === po.destination_id),
          )
        : false;
      const differs = newest && newest.answer && original && newest.arrival !== original;
      const call = newest
        ? tomorrowDeliveryCallOf(
            {
              poId: po.id,
              supplierId: po.supplier_id ?? "",
              status: po.status,
              etaDateIso: newest.arrival,
              tomorrowAnswerAboutDateIso: arrivalConfirmed ? newest.arrival : null,
              lines: [
                {
                  id: poLine?.id ?? po.id,
                  sku: "",
                  qty: newest.qty,
                  receivedQty: 0,
                  shortSinceIso: null,
                  balanceAnswerAboutQty: null,
                },
              ],
            },
            { todayIso: facts.todayIso, holidays: facts.holidays },
          )
        : null;

      /* A GRN is a POSTED receipt carrying its stored number. A draft, a
         returned or a voided session is not a receipt of goods. */
      const grn =
        [...facts.receipts]
          .filter(
            (row) =>
              row.po_id === po.id &&
              row.status === "posted" &&
              Boolean(row.grn_no) &&
              (!poLine || row.line_ids.length === 0 || row.line_ids.includes(poLine.id)),
          )
          .sort((a, b) => (b.goods_received_at ?? "").localeCompare(a.goods_received_at ?? ""))[0] ?? null;

      sources.push({
        poId: po.id,
        supplierName: po.supplier_name?.trim() || null,
        /* A reader that did not bring the send marks invents no work. */
        sent:
          po.sends === undefined ||
          po.sends.some((send) => send.kind === "confirmed_sent" && (send.po_version ?? 1) === version),
        qty: share,
        issuedAt: day(po.placed_at),
        poDeliveryDate: original,
        expectedArrival: differs
          ? {
              date: newest!.arrival,
              change: newest!.arrival > original! ? "delayed" : "earlier",
              reason: newest!.arrival > original! ? (newest!.reason?.trim() || null) : null,
            }
          : null,
        confirmed: newest?.answer === "confirmed" || arrivalConfirmed,
        dayBeforeCheckOpen: Boolean(call),
        receivedQty: taken,
        pendingQty: Math.max(0, share - taken),
        damagedOrWrongQty: trouble,
        latestGrn: grn ? { id: grn.id, number: grn.grn_no!, receivedAt: day(grn.goods_received_at) } : null,
      });
    }

    const unitCodes = (unitsByLine.get(line.id) ?? []).filter(Boolean);
    const readyQty = Math.min(qty, (unitsByLine.get(line.id) ?? []).length);
    /* Units that arrived through a Purchase Order are already counted as
       received; what is still ON ORDER is what has not arrived. */
    const onOrderQty = sources.reduce((sum, source) => sum + source.pendingQty, 0);
    const uncoveredQty = Math.max(0, qty - readyQty - onOrderQty);
    const short = readyQty < qty;
    return {
      lineId: line.id,
      sku: line.sku,
      label: line.label,
      qty,
      sources,
      onOrderQty,
      readyQty,
      unitCodes,
      uncoveredQty,
      shortBecause: !short ? null : uncoveredQty > 0 ? "not-ordered" : "not-received",
      readyStockQty: short ? count(facts.readyStock[line.sku] ?? facts.readyStock[skuOf(line.sku)]) : 0,
    };
  });
}
