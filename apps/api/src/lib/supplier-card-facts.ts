/**
 * THE SUPPLIER CARD'S FACTS — Purchasing's answer, per PO serving ONE Sales
 * Order (Workspace MASTER §5.9, Purchasing MASTER "Work Supplier card").
 *
 * Read-only. Every field is a stored fact of its owner:
 *   · the PO and its supplier, whether it reached the supplier (`placed_at`),
 *     the immutable `official_delivery_date` (0428) and our plan (`eta_date`);
 *   · the supplier's latest reply (`po_supplier_promises`, append-only);
 *   · the Supplier DO on the PO (`do_number`, `do_uploaded_at`);
 *   · Deliver To (Purchasing's destination, line override else the PO's);
 *   · the Warehouse's Goods received date (`warehouse_receipts`, voided ignored).
 * The effective arrival is Purchasing's ONE arithmetic, `effectiveArrivalOf`.
 */
import { effectiveArrivalOf, type SupplierPoFact } from "@carres/shared";

export interface SupplierFactRows {
  pos: ReadonlyArray<{
    id: string;
    status: string | null;
    placed_at: string | null;
    official_delivery_date: string | null;
    eta_date: string | null;
    do_number: string | null;
    do_uploaded_at: string | null;
    destination_id: string | null;
    suppliers: { name: string } | { name: string }[] | null;
  }>;
  lines: ReadonlyArray<{ po_id: string; destination_id: string | null; sku?: string | null; qty?: number | string | null; received_qty?: number | string | null }>;
  destinations: ReadonlyArray<{ id: string; name: string }>;
  promises: ReadonlyArray<{
    po_id: string;
    /** Only `tomorrow_delivery` — the answer about the ARRIVAL date (orders.ts
     *  reads the same kind). A ready-date or balance promise is not it. */
    kind?: string | null;
    answer: string;
    new_date: string | null;
    about_date: string | null;
    previous_date: string | null;
    reason: string | null;
    evidence: string | null;
    recorded_at: string;
  }>;
  receipts: ReadonlyArray<{ po_id: string; goods_received_at: string | null; status: string | null }>;
}

export function supplierPoFactsOf(rows: SupplierFactRows): SupplierPoFact[] {
  const destName = new Map(rows.destinations.map((d) => [d.id, d.name]));
  return rows.pos
    .filter((po) => po.status !== "cancelled")
    .map((po) => {
      const supplier = Array.isArray(po.suppliers) ? po.suppliers[0]?.name ?? null : po.suppliers?.name ?? null;
      const latest =
        rows.promises
          .filter((p) => p.po_id === po.id && (p.kind ?? "tomorrow_delivery") === "tomorrow_delivery")
          .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] ?? null;
      const destIds = [...new Set(rows.lines.filter((l) => l.po_id === po.id).map((l) => l.destination_id ?? po.destination_id))];
      if (destIds.length === 0) destIds.push(po.destination_id);
      const deliverTo = destIds.map((id) => (id ? destName.get(id) ?? null : null)).filter((v): v is string => Boolean(v));
      const grn =
        rows.receipts
          .filter((r) => r.po_id === po.id && r.status !== "voided" && r.goods_received_at)
          .map((r) => (r.goods_received_at as string).slice(0, 10))
          .sort()
          .pop() ?? null;
      const effective = effectiveArrivalOf({
        poId: po.id,
        status: po.status,
        owedSkus: [],
        plannedIso: po.eta_date,
        originalIso: po.official_delivery_date,
        reply: latest
          ? { answer: latest.answer, aboutIso: latest.about_date, previousIso: latest.previous_date, newIso: latest.new_date, recordedAt: latest.recorded_at }
          : null,
      });
      const poLines = rows.lines.filter((l) => l.po_id === po.id);
      const orderedQty = poLines.reduce((t, l) => t + Number(l.qty ?? 0), 0);
      const receivedQty = poLines.reduce((t, l) => t + Number(l.received_qty ?? 0), 0);
      return {
        poNo: po.id,
        supplier,
        issued: Boolean(po.placed_at),
        originalIso: po.official_delivery_date,
        effectiveIso: effective,
        reply: latest
          ? { answer: latest.answer, reason: latest.reason, evidence: latest.evidence, recordedAtIso: latest.recorded_at, aboutIso: latest.about_date }
          : null,
        status: po.status,
        etaIso: po.eta_date,
        supplierDo: po.do_number || po.do_uploaded_at ? { number: po.do_number, atIso: po.do_uploaded_at } : null,
        deliverTo: deliverTo.length ? [...new Set(deliverTo)].join(" · ") : null,
        grnIso: grn,
        orderedQty,
        receivedQty,
        lines: poLines.filter((l) => l.sku).map((l) => ({ sku: l.sku as string, qty: Number(l.qty ?? 0) })),
      };
    });
}
