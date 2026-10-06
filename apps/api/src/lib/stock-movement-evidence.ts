import type { StockMovementEvidence } from "@carres/shared";
import type { userClient } from "./supabase";

/** Reads the existing receipt / handover owners with the caller's RLS scope. */
export async function stockMovementEvidence(sb: ReturnType<typeof userClient>, unitId: string): Promise<StockMovementEvidence[]> {
  async function read(table: string, fields: string, column: string, value: string, overlap = false) {
    const rows: Record<string, any>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = sb.from(table).select(fields).order("id").range(offset, offset + 499);
      query = overlap ? query.overlaps(column, [value]) : query.eq(column, value);
      const result = await query;
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) return rows;
    }
  }
  const [results, links, arrivals] = await Promise.all([
    read("receiving_unit_results", "id,receipt_id,outcome", "stock_item_id", unitId),
    read("delivery_handover_event_units", "id,event_id,recorded_side", "item_id", unitId),
    read("arrival_source_events", "id,source_id,kind,occurred_at,actor_id", "unit_ids", unitId, true),
  ]);
  const evidence: StockMovementEvidence[] = [];
  const siteNames = new Map<string, string | null>();
  async function siteName(id: string | null) {
    if (!id) return null;
    if (!siteNames.has(id)) {
      const { data, error } = await sb.from("warehouses").select("name").eq("id", id).maybeSingle();
      if (error) throw error;
      siteNames.set(id, data?.name ?? null);
    }
    return siteNames.get(id) ?? null;
  }
  for (const result of results.filter((r) => r.outcome === "received" || r.outcome === "received_with_issue")) {
    const { data: receipt, error } = await sb.from("warehouse_receipts")
      .select("id,status,actual_site_id,goods_received_at,grn_no,po_id,arrival_source_id,posted_by")
      .eq("id", result.receipt_id).maybeSingle();
    if (error) throw error;
    if (!receipt || receipt.status !== "posted" || !receipt.goods_received_at) continue;
    evidence.push({ id: `receipt:${receipt.id}`, unitId, direction: "in", siteId: receipt.actual_site_id,
      siteName: await siteName(receipt.actual_site_id), at: receipt.goods_received_at,
      reference: receipt.grn_no ?? "Goods receipt", actorId: receipt.posted_by,
      href: `/operation?tab=receiving&session=${encodeURIComponent(receipt.id)}` });
  }
  for (const link of links.filter((l) => l.recorded_side === "warehouse")) {
    const { data: event, error } = await sb.from("delivery_handover_events")
      .select("id,delivery_order_id,kind,recorded_at,recorded_by").eq("id", link.event_id).maybeSingle();
    if (error) throw error;
    if (!event || event.kind !== "handed_over") continue;
    const { data: order, error: orderError } = await sb.from("ops_delivery_orders").select("do_number").eq("id", event.delivery_order_id).maybeSingle();
    if (orderError) throw orderError;
    evidence.push({ id: `handover:${event.id}`, unitId, direction: "out", siteId: null, siteName: null,
      at: event.recorded_at, reference: order?.do_number ?? "Delivery Order", actorId: event.recorded_by,
      href: `/operation?tab=warehouse-outbound&do=${encodeURIComponent(order?.do_number ?? event.delivery_order_id)}` });
  }
  for (const event of arrivals.filter((e) => e.kind === "collected")) {
    const { data: source, error } = await sb.from("arrival_sources").select("source_no,from_site_id").eq("id", event.source_id).maybeSingle();
    if (error) throw error;
    if (!source) continue;
    evidence.push({ id: `collection:${event.id}`, unitId, direction: "out", siteId: source.from_site_id,
      siteName: await siteName(source.from_site_id), at: event.occurred_at, reference: source.source_no,
      actorId: event.actor_id, href: `/operation?tab=warehouse-inbound&source=${encodeURIComponent(event.source_id)}` });
  }
  return evidence;
}
