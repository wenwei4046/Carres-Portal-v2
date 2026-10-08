/**
 * THE OUTRIGHT LIST'S SOURCE FACTS — owner instruction 2026-10-09: "接回系统已有
 * 的真实资料 … 逐项查来源，不能把未接读取写成资料不存在".
 *
 * One batched read per owner, each under the caller's own token (RLS decides),
 * each SOFT: a failed read sets its `failed` flag and leaves the fact absent, so
 * the screen prints `Could not read`, never `Not recorded`. Nothing here judges
 * or writes; every fact is the owner's own record:
 *
 *   SO PIC        ops_order_control.assigned_staff → app_users.name
 *                 (Orders MASTER §2.2). Operation staff may read only operation
 *                 colleagues' names, so an assigned person whose name RLS hides
 *                 is `name: null` — the screen says `No access`.
 *   Supplier DO   purchase_orders.do_number of the POs the order's lines source
 *                 (po_line_sources; Purchasing MASTER §5.7: "Supplier DO
 *                 received writes the PO's existing do_number").
 *   GRN           posted warehouse_receipts on those POs that counted one of the
 *                 order's PO lines (Receiving §9.4; grn_no is the formal number).
 *   Delivery      the customer leg's live DO, Delivery's arrangement, then the
 *                 legacy confirmed booking — the caller runs Delivery's own
 *                 `customerLegDeliveryOf` / `assignedLogisticsIdOf` on these
 *                 rows (Delivery MASTER §8.8).
 *   Loading       the newest handover record on the customer leg's live DO
 *                 (`Ready for handover` · `Handed over` · `Received by
 *                 logistics`, Delivery MASTER §4).
 *   Location      the warehouses holding the order's reserved Units.
 *   Finance hold  an OPEN order_finance_exceptions row (0355). Unknown is never
 *                 "no hold".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignedLogisticsIdOf,
  customerLegDeliveryOf,
  type DeliveryHandoverKind,
  type OutrightFactsFailed,
  type OutrightOrderFacts,
} from "@carres/shared";

export type { OutrightFactsFailed, OutrightOrderFacts };

export type OutrightOrderInput = {
  id: string;
  delivery_partner_id?: string | null;
  ops_assigned_logistic?: string | null;
  ops_order_control?: OrderControl | OrderControl[] | null;
};
type OrderControl = {
  assigned_staff?: string | null;
  booking_stage?: string | null;
  confirmed_date?: string | null;
  confirmed_time_slot?: string | null;
};

const PAGE = 1000;
const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** Every row of a batched `.in()` read, paged; null when any page failed. */
async function readIn<T>(
  sb: SupabaseClient,
  table: string,
  select: string,
  column: string,
  keys: string[],
  narrow?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[] | null> {
  const out: T[] = [];
  for (const batch of chunk([...new Set(keys)].filter(Boolean), 100)) {
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select(select).in(column, batch);
      if (narrow) q = narrow(q);
      const { data, error } = await q.order("id", { ascending: true }).range(from, from + PAGE - 1);
      if (error) return null;
      const page = (data ?? []) as T[];
      out.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return out;
}

const ctrlOf = (o: OutrightOrderInput): OrderControl | null =>
  (Array.isArray(o.ops_order_control) ? o.ops_order_control[0] : o.ops_order_control) ?? null;

export async function outrightOrderFacts(
  sb: SupabaseClient,
  orders: OutrightOrderInput[],
  reservedUnits: Array<{ warehouse_id: string | null; reserved_ref: string | null }> | null,
  soRefOf: (orderId: string) => string,
): Promise<{ facts: Record<string, OutrightOrderFacts>; failed: OutrightFactsFailed }> {
  const ids = orders.map((o) => o.id);
  const staffIds = orders.map((o) => ctrlOf(o)?.assigned_staff ?? "").filter(Boolean);

  const [sources, staff, arrangements, documents, holds] = await Promise.all([
    readIn<{ order_id: string; po_id: string; po_line_id: string | null }>(sb, "po_line_sources", "id, order_id, po_id, po_line_id", "order_id", ids),
    readIn<{ id: string; name: string | null }>(sb, "app_users", "id, name", "id", staffIds),
    readIn<{ order_id: string; leg: number | null; partner_id: string | null; confirmed_date: string | null; confirmed_time: string | null }>(
      sb, "ops_delivery_arrangements", "id, order_id, leg, partner_id, confirmed_date, confirmed_time", "order_id", ids),
    readIn<{ id: string; order_id: string; leg: number | null; delivery_date: string | null; time_slot: string | null; issued_at: string | null; voided_at: string | null }>(
      sb, "ops_delivery_orders", "id, order_id, leg, delivery_date, time_slot, issued_at, voided_at", "order_id", ids),
    readIn<{ order_id: string; status: string; reason: string | null; opened_at: string | null }>(
      sb, "order_finance_exceptions", "id, order_id, status, reason, opened_at", "order_id", ids, (q) => q.eq("status", "open")),
  ]);

  const poIds = [...new Set((sources ?? []).map((s) => s.po_id).filter(Boolean))];
  const liveDoIds = (documents ?? []).filter((d) => !d.voided_at).map((d) => d.id);
  const partnerIds = [
    ...(arrangements ?? []).map((a) => a.partner_id ?? ""),
    ...orders.flatMap((o) => [o.delivery_partner_id ?? "", o.ops_assigned_logistic ?? ""]),
  ].filter(Boolean);
  const warehouseIds = (reservedUnits ?? []).map((u) => u.warehouse_id ?? "").filter(Boolean);

  const [pos, receipts, handovers, partners, warehouses] = await Promise.all([
    sources ? readIn<{ id: string; do_number: string | null }>(sb, "purchase_orders", "id, do_number", "id", poIds) : Promise.resolve(null),
    sources
      ? readIn<{ id: string; po_id: string; grn_no: string | null; lines: unknown }>(
          sb, "warehouse_receipts", "id, po_id, grn_no, lines, status", "po_id", poIds, (q) => q.eq("status", "posted"))
      : Promise.resolve(null),
    documents ? readIn<{ delivery_order_id: string; kind: DeliveryHandoverKind; recorded_at: string | null }>(
      sb, "delivery_handover_events", "id, delivery_order_id, kind, recorded_at", "delivery_order_id", liveDoIds) : Promise.resolve(null),
    readIn<{ id: string; name: string | null }>(sb, "delivery_partners", "id, name", "id", partnerIds),
    readIn<{ id: string; name: string | null }>(sb, "warehouses", "id, name", "id", warehouseIds),
  ]);

  const failed: OutrightFactsFailed = {
    pic: staff === null,
    purchasing: sources === null || pos === null || receipts === null,
    delivery: arrangements === null || documents === null || partners === null,
    loading: documents === null || handovers === null,
    location: reservedUnits === null || warehouses === null,
    finance: holds === null,
  };

  const nameOfStaff = new Map((staff ?? []).map((u) => [u.id, u.name]));
  const nameOfPartner = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const nameOfWarehouse = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const doOfPo = new Map((pos ?? []).map((p) => [p.id, (p.do_number ?? "").trim()]));
  const holdOf = new Map<string, { reason: string; at: string }>();
  for (const h of holds ?? []) {
    if (h.status !== "open") continue;
    const at = h.opened_at ?? "";
    const seen = holdOf.get(h.order_id);
    if (!seen || at > seen.at) holdOf.set(h.order_id, { reason: (h.reason ?? "").trim(), at });
  }

  const facts: Record<string, OutrightOrderFacts> = {};
  for (const o of orders) {
    const ctrl = ctrlOf(o);
    const mySources = (sources ?? []).filter((s) => s.order_id === o.id);
    const myPoIds = [...new Set(mySources.map((s) => s.po_id))];
    const myPoLines = new Set(mySources.map((s) => s.po_line_id).filter(Boolean) as string[]);
    const grns = (receipts ?? [])
      .filter((r) => myPoIds.includes(r.po_id))
      .filter((r) => {
        const counted = Array.isArray(r.lines) ? (r.lines as Array<{ id?: unknown }>).map((l) => l.id) : [];
        return counted.some((lineId) => typeof lineId === "string" && myPoLines.has(lineId));
      })
      .map((r) => (r.grn_no ?? "").trim())
      .filter(Boolean);

    const myArrangements = (arrangements ?? []).filter((a) => a.order_id === o.id);
    const myDocs = (documents ?? []).filter((d) => d.order_id === o.id && !d.voided_at);
    const day = customerLegDeliveryOf({
      documents: myDocs.map((d) => ({ leg: d.leg, deliveryDate: d.delivery_date, timeSlot: d.time_slot, issuedAt: d.issued_at })),
      arrangements: myArrangements.map((a) => ({ leg: a.leg, confirmedDate: a.confirmed_date, confirmedTime: a.confirmed_time, partnerId: a.partner_id })),
      booking: ctrl
        ? { stage: (ctrl.booking_stage ?? null) as "confirmed" | null, confirmedDate: ctrl.confirmed_date ?? null, confirmedSlot: ctrl.confirmed_time_slot ?? null }
        : null,
    });
    const partnerId = assignedLogisticsIdOf({
      arrangementPartnerId: day.arrangement?.partnerId ?? null,
      orderPartnerId: o.delivery_partner_id ?? null,
      triagePartnerId: o.ops_assigned_logistic ?? null,
    });
    const legDocs = myDocs.filter((d) => (Number(d.leg ?? 0) || 0) === day.leg).map((d) => d.id);
    const newest = (handovers ?? [])
      .filter((h) => legDocs.includes(h.delivery_order_id))
      .sort((a, b) => (b.recorded_at ?? "").localeCompare(a.recorded_at ?? ""))[0] ?? null;
    const soRef = soRefOf(o.id);
    const locations = [...new Set((reservedUnits ?? [])
      .filter((u) => u.reserved_ref === soRef && u.warehouse_id)
      .map((u) => nameOfWarehouse.get(u.warehouse_id!) ?? "")
      .filter(Boolean))];
    const assigned = ctrl?.assigned_staff ?? null;

    facts[o.id] = {
      pic: assigned ? { userId: assigned, name: nameOfStaff.get(assigned) ?? null } : null,
      poCount: myPoIds.length,
      supplierDos: [...new Set(myPoIds.map((id) => doOfPo.get(id) ?? "").filter(Boolean))],
      grns: [...new Set(grns)],
      delivery: {
        dateIso: day.iso,
        time: day.time,
        source: day.source,
        partnerId,
        partnerName: partnerId ? nameOfPartner.get(partnerId) ?? null : null,
      },
      loading: { hasDo: legDocs.length > 0, kind: newest?.kind ?? null, at: newest?.recorded_at ?? null },
      locations,
      financeHold: holdOf.has(o.id) ? { reason: holdOf.get(o.id)!.reason } : null,
    };
  }
  return { facts, failed };
}
