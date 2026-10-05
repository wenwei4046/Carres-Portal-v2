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
 *
 * ⭐ THE SAME ARRANGEMENT ANSWERS THE REGISTER'S `Stock Status` (owner scope
 * 2026-10-05, `sales-order-stock-status.ts`): the Route and the Sales Orders
 * list read ONE binding of Units to lines, ONE lineage and ONE receipt
 * allocation, so the two can never tell one order's goods two ways (Law D).
 */
import { poExpectedArrivalsOf, type EffectiveArrivalPromise } from "./po-windows";
import { tomorrowDeliveryCallOf } from "./purchasing-supplier-calls";
import { normalizeSkuKey } from "./sku-code";
import { isReservedUnitAtRisk } from "./unit-availability";
import { receivingSummaryOf } from "./warehouse-receipt";

export interface RouteGoodsFacts {
  todayIso: string;
  holidays?: ReadonlySet<string>;
  /** The order these lines belong to. Needed only when `sources` also carries
   *  OTHER orders' shares of the same PO lines (see `sources`). */
  orderId?: string;
  /** `order_lines` of the CURRENT effective Revision, goods only. */
  lines: ReadonlyArray<{ id: string; sku: string; label: string; qty: number }>;
  /** `po_line_sources` in LINEAGE ORDER (`created_at`, oldest first): this
   *  order's rows and, when the reader brings them, every other order's share
   *  of the same PO lines (`order_id` names whose). A PO line's receipts fill
   *  the shares in the order they were written, whoever wrote them, so goods
   *  shared by two orders are never counted for both. */
  sources: ReadonlyArray<{
    order_id?: string | null;
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
  /** `ops_stock_items` reserved to or sold against this order — and, when the
   *  reader brings them, the `incoming` Units `Use this PO` bound to one of its
   *  lines (0600: bound before receipt, status stays `incoming`). An incoming
   *  Unit is purchased cover, never ready goods. */
  units: ReadonlyArray<{
    unit_code: string | null;
    status: string;
    reserved_order_line_id: string | null;
    sku: string;
    /** Stock's control facts (0589). Absent = not read, never at risk. */
    condition?: string | null;
    needs_repair?: boolean | null;
    sale_cleared_at?: string | null;
    /** The PO line the Unit was born on (0443): one PO line covers once. */
    po_line_id?: string | null;
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
  /** Of `readyQty`, reserved Units Stock controls — damaged and not cleared for
   *  sale, or waiting for repair (`isReservedUnitAtRisk`). Not usable goods. */
  atRiskQty: number;
  /** `readyQty` less `atRiskQty`: goods held for this line in a condition that
   *  can be delivered, or already delivered. */
  usableQty: number;
  /** What Carres has bought or bound for the line — Purchasing's
   *  `so_line_remaining_requirement` read the other way round: per PO line the
   *  greater of the Units bound and the non-cancelled lineage share, plus Units
   *  bound from no PO line (Ready Stock). Never more than `qty`. */
  purchasedQty: number;
  /** Goods RECEIVED on this line's own lineage that no Unit binding gives to
   *  it yet: they landed `free` (Receiving verifies, it never allocates; the
   *  Sales Order binds — Stock MASTER §4). Never more than `qty − readyQty`. */
  arrivedUnallocatedQty: number;
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

  /* A PO line shared by several Sales Order lines is received in lineage
     order: what arrived fills the first share before the next. The walk is
     over `sources` in the order the reader wrote them (`created_at`) and over
     every order's share it brought — never over this order's lines, whose
     order says nothing about which share was written first (defect found
     2026-10-05: one PO line shared by two orders was received for both). */
  const receivedLeft = new Map<string, number>();
  const troubleLeft = new Map<string, number>();
  for (const po of poById.values()) {
    for (const line of po.lines) {
      const summary = receivingSummaryOf([line]);
      receivedLeft.set(line.id, summary.receivedQty);
      troubleLeft.set(line.id, summary.damagedQty + summary.wrongItemQty);
    }
  }

  /* ── lineage: the line a source names, in the order it was written ────── */
  type Share = { source: RouteGoodsFacts["sources"][number]; taken: number; trouble: number };
  const sourcesByLine = new Map<string, Share[]>();
  for (const source of facts.sources) {
    const po = poById.get(source.po_id);
    if (!po) continue;
    const poLine = po.lines.find((row) => row.id === source.po_line_id) ?? null;
    const share = count(source.qty);
    const taken = poLine ? Math.min(share, receivedLeft.get(poLine.id) ?? 0) : 0;
    /* Damaged or wrong pieces arrived INSTEAD of good ones, so they fall on a
       share the good pieces left short — never on a share already whole (one
       share of 1 cannot have received a good piece and a damaged one). */
    const trouble = poLine ? Math.min(share - taken, troubleLeft.get(poLine.id) ?? 0) : 0;
    if (poLine) {
      receivedLeft.set(poLine.id, (receivedLeft.get(poLine.id) ?? 0) - taken);
      troubleLeft.set(poLine.id, (troubleLeft.get(poLine.id) ?? 0) - trouble);
    }
    /* Another order's share takes its goods and joins none of these lines. */
    if (facts.orderId && source.order_id && source.order_id !== facts.orderId) continue;
    let lineId = source.order_line_id;
    if (!lineId) {
      /* Lineage written before the line was recorded. It may join by SKU only
         when that cannot be wrong: exactly one line carries the SKU. */
      const candidates = poLine ? linesOfSku(poLine.sku) : [];
      lineId = candidates.length === 1 ? candidates[0]!.id : null;
    }
    if (!lineId) continue;
    sourcesByLine.set(lineId, [...(sourcesByLine.get(lineId) ?? []), { source, taken, trouble }]);
  }

  /* ── Units: the line a Unit names; one that names none takes the first
     line of its SKU that still has room ─────────────────────────────────── */
  type BoundUnit = RouteGoodsFacts["units"][number];
  const unitsByLine = new Map<string, BoundUnit[]>();
  const room = new Map(facts.lines.map((line) => [line.id, count(line.qty)]));
  const bind = (lineId: string, unit: BoundUnit) => {
    unitsByLine.set(lineId, [...(unitsByLine.get(lineId) ?? []), unit]);
    room.set(lineId, (room.get(lineId) ?? 0) - 1);
  };
  /* An `incoming` Unit bound by `Use this PO` always names its line (0600).
     It is purchased cover only: it takes no room and is never ready. */
  const incomingByLine = new Map<string, BoundUnit[]>();
  for (const unit of facts.units) {
    const lineId = unit.reserved_order_line_id;
    if (unit.status !== "incoming" || !lineId || !room.has(lineId)) continue;
    incomingByLine.set(lineId, [...(incomingByLine.get(lineId) ?? []), unit]);
  }
  const held = facts.units.filter((unit) => unit.status !== "incoming");
  const named = held.filter((unit) => unit.reserved_order_line_id && room.has(unit.reserved_order_line_id));
  for (const unit of named) bind(unit.reserved_order_line_id!, unit);
  for (const unit of held) {
    if (named.includes(unit)) continue;
    const home = linesOfSku(unit.sku).find((line) => (room.get(line.id) ?? 0) > 0);
    if (home) bind(home.id, unit);
  }

  return facts.lines.map((line) => {
    const qty = count(line.qty);
    const sources: RouteGoodsSource[] = [];
    for (const { source, taken, trouble } of sourcesByLine.get(line.id) ?? []) {
      const po = poById.get(source.po_id)!;
      const poLine = po.lines.find((row) => row.id === source.po_line_id) ?? null;
      const share = count(source.qty);
      const version = po.version ?? 1;

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

    const bound = unitsByLine.get(line.id) ?? [];
    const unitCodes = bound.map((unit) => unit.unit_code ?? "").filter(Boolean);
    const readyQty = Math.min(qty, bound.length);
    const atRisk = bound.filter((unit) =>
      isReservedUnitAtRisk({
        status: unit.status,
        needsRepair: unit.needs_repair,
        condition: unit.condition,
        saleClearedAt: unit.sale_cleared_at,
      }),
    ).length;
    const usableQty = Math.max(0, Math.min(qty, bound.length - atRisk));
    /* Purchasing's cover (`so_line_remaining_requirement`, 0600/0631): a Unit
       born on a PO line and that line's lineage share cover ONCE — the greater
       of the two — and a Unit from no PO line covers by itself. */
    const lineage = sourcesByLine.get(line.id) ?? [];
    const cover = new Map<string, { units: number; lineage: number; arrived: number }>();
    const add = (key: string, units: number, share: number, arrived: number) => {
      const was = cover.get(key) ?? { units: 0, lineage: 0, arrived: 0 };
      cover.set(key, { units: was.units + units, lineage: was.lineage + share, arrived: was.arrived + arrived });
    };
    [...bound, ...(incomingByLine.get(line.id) ?? [])].forEach((unit, index) =>
      add(unit.po_line_id ? `line:${unit.po_line_id}` : `unit:${index}`, 1, 0, 0),
    );
    for (const { source, taken } of lineage) {
      add(source.po_line_id ? `line:${source.po_line_id}` : `legacy:${source.po_id}`, 0, count(source.qty), taken);
    }
    const rows = [...cover.values()];
    const purchasedQty = Math.min(qty, rows.reduce((sum, row) => sum + Math.max(row.units, row.lineage), 0));
    /* What this line's own lineage RECEIVED that no Unit of that PO line binds
       to it. The received good Units are counted by Receiving; the binding by
       Stock. Their difference landed `free`. */
    const arrivedUnallocatedQty = Math.min(
      Math.max(0, qty - readyQty),
      rows.reduce((sum, row) => sum + Math.max(0, row.arrived - row.units), 0),
    );
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
      atRiskQty: Math.min(readyQty, atRisk),
      usableQty,
      purchasedQty,
      arrivedUnallocatedQty,
      unitCodes,
      uncoveredQty,
      shortBecause: !short ? null : uncoveredQty > 0 ? "not-ordered" : "not-received",
      readyStockQty: short ? count(facts.readyStock[line.sku] ?? facts.readyStock[skuOf(line.sku)]) : 0,
    };
  });
}
