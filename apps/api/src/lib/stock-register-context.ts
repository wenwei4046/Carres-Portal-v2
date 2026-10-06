import type { StockRegisterUnit } from "@carres/shared";
import type { userClient } from "./supabase";

type Sb = ReturnType<typeof userClient>;

/** PostgREST puts an `in` filter in the URL; 300 uuids is a 12 kB query
 *  string, so every batched read walks ids a hundred at a time. */
async function inBatches<T>(ids: string[], read: (slice: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const result = await read(ids.slice(i, i + 100));
    if (result.error) throw result.error;
    out.push(...(result.data ?? []));
  }
  return out;
}

/** Source facts enrich exact Units; no source is allowed to add a stock row. */
export async function stockRegisterContext(sb: Sb, units: StockRegisterUnit[]) {
  const skus = [...new Set(units.map((u) => u.sku))];
  const pos = [...new Set(units.flatMap((u) => u.poNo ? [u.poNo] : []))];
  const orders = [...new Set(units.flatMap((u) => u.soldOrderId ? [u.soldOrderId] : []))];
  const empty = { data: [], error: null };
  const [catalog, purchases, sales, physical] = await Promise.all([
    skus.length ? sb.from("product_skus").select("sku, variant, product_models(name)").in("sku", skus) : empty,
    pos.length ? sb.from("purchase_orders").select("id, placed_at, eta_date, purpose").in("id", pos) : empty,
    orders.length ? sb.from("orders").select("id, placed_at").in("id", orders) : empty,
    physicalFacts(sb, units),
  ]);
  for (const result of [catalog, purchases, sales]) if (result.error) throw result.error;
  const names = new Map<string, string>();
  for (const row of catalog.data ?? []) {
    const model = Array.isArray(row.product_models) ? row.product_models[0] : row.product_models;
    if (model?.name) names.set(row.sku, [model.name, row.variant].filter(Boolean).join(" · "));
  }
  const poById = new Map((purchases.data ?? []).map((po) => [po.id, po]));
  const orderById = new Map((sales.data ?? []).map((order) => [order.id, order]));
  return units.map((unit) => ({
    ...unit,
    productName: names.get(unit.sku) ?? null,
    poDate: unit.poNo ? poById.get(unit.poNo)?.placed_at ?? null : null,
    expectedArrival: unit.poNo ? poById.get(unit.poNo)?.eta_date ?? null : null,
    purchasePurpose: unit.poNo ? poById.get(unit.poNo)?.purpose ?? null : null,
    soDate: unit.soldOrderId ? orderById.get(unit.soldOrderId)?.placed_at ?? null : null,
    ...(physical.get(unit.id) ?? { goodsReceivedDate: unit.availability === "incoming" ? null : unit.dateIn, shipDate: null, pickupBy: null, deliveryLocation: null }),
  }));
}

interface PhysicalFacts {
  goodsReceivedDate: string | null;
  shipDate: string | null;
  pickupBy: string | null;
  deliveryLocation: string | null;
}

/**
 * Owner rulings 2026-09-25: OUT at origin and IN at destination are the only
 * two events. `Goods Received Date` is the latest posted receipt; `Ship Date ·
 * Pickup By · Delivery Location` come from the latest Warehouse handover
 * (a Delivery Order to a Logistics company, or a Transfer/Return collection)
 * and are blank again once a later receipt proves the Unit is back in a Site.
 * A Unit booked in before Receiving existed keeps its recorded date in as the
 * receipt date; an Incoming Unit has none.
 */
async function physicalFacts(sb: Sb, units: StockRegisterUnit[]): Promise<Map<string, PhysicalFacts>> {
  const ids = units.map((u) => u.id);
  const facts = new Map<string, PhysicalFacts>();
  if (ids.length === 0) return facts;

  const [results, links, collections] = await Promise.all([
    inBatches<{ stock_item_id: string; receipt_id: string; outcome: string }>(ids, (slice) =>
      sb.from("receiving_unit_results").select("stock_item_id, receipt_id, outcome").in("stock_item_id", slice).in("outcome", ["received", "received_with_issue"])),
    inBatches<{ item_id: string; event_id: string }>(ids, (slice) =>
      sb.from("delivery_handover_event_units").select("item_id, event_id").in("item_id", slice).eq("recorded_side", "warehouse")),
    inBatches<{ id: string; source_id: string; kind: string; occurred_at: string; unit_ids: string[] }>(ids, (slice) =>
      sb.from("arrival_source_events").select("id, source_id, kind, occurred_at, unit_ids").eq("kind", "collected").overlaps("unit_ids", slice)),
  ]);

  const receiptIds = [...new Set(results.map((r) => r.receipt_id))];
  const eventIds = [...new Set(links.map((l) => l.event_id))];
  const sourceIds = [...new Set(collections.map((c) => c.source_id))];
  const [receipts, events, sources] = await Promise.all([
    inBatches<{ id: string; status: string; goods_received_at: string | null }>(receiptIds, (slice) =>
      sb.from("warehouse_receipts").select("id, status, goods_received_at").in("id", slice).eq("status", "posted")),
    inBatches<{ id: string; delivery_order_id: string; kind: string; recorded_at: string }>(eventIds, (slice) =>
      sb.from("delivery_handover_events").select("id, delivery_order_id, kind, recorded_at").in("id", slice).eq("kind", "handed_over")),
    inBatches<{ id: string; party_id: string | null; to_site_id: string | null }>(sourceIds, (slice) =>
      sb.from("arrival_sources").select("id, party_id, to_site_id").in("id", slice)),
  ]);
  const doIds = [...new Set(events.map((e) => e.delivery_order_id))];
  const partyIds = [...new Set(sources.flatMap((s) => s.party_id ? [s.party_id] : []))];
  const siteIds = [...new Set(sources.flatMap((s) => s.to_site_id ? [s.to_site_id] : []))];
  const [dos, parties, sites] = await Promise.all([
    inBatches<{ id: string; logistics_partner: string | null; order_id: string | null }>(doIds, (slice) =>
      sb.from("ops_delivery_orders").select("id, logistics_partner, order_id").in("id", slice)),
    inBatches<{ id: string; name: string }>(partyIds, (slice) => sb.from("stock_operating_parties").select("id, name").in("id", slice)),
    inBatches<{ id: string; name: string }>(siteIds, (slice) => sb.from("warehouses").select("id, name").in("id", slice)),
  ]);
  const orderIds = [...new Set(dos.flatMap((d) => d.order_id ? [d.order_id] : []))];
  const addresses = await inBatches<{ id: string; customer_address: string | null; customer_address_line1: string | null; customer_address_city: string | null }>(orderIds, (slice) =>
    sb.from("orders").select("id, customer_address, customer_address_line1, customer_address_city").in("id", slice));

  const receiptById = new Map(receipts.map((r) => [r.id, r]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const doById = new Map(dos.map((d) => [d.id, d]));
  const partyById = new Map(parties.map((p) => [p.id, p.name]));
  const siteById = new Map(sites.map((s) => [s.id, s.name]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const addressById = new Map(addresses.map((a) => [a.id, a]));

  const latestIn = new Map<string, string>();
  for (const r of results) {
    const receipt = receiptById.get(r.receipt_id);
    if (!receipt?.goods_received_at) continue;
    const prev = latestIn.get(r.stock_item_id);
    if (!prev || receipt.goods_received_at > prev) latestIn.set(r.stock_item_id, receipt.goods_received_at);
  }
  const latestOut = new Map<string, { at: string; pickupBy: string | null; deliveryLocation: string | null }>();
  const consider = (unitId: string, out: { at: string; pickupBy: string | null; deliveryLocation: string | null }) => {
    const prev = latestOut.get(unitId);
    if (!prev || out.at > prev.at) latestOut.set(unitId, out);
  };
  for (const link of links) {
    const event = eventById.get(link.event_id);
    if (!event) continue;
    const order = doById.get(event.delivery_order_id);
    const address = order?.order_id ? addressById.get(order.order_id) : undefined;
    const location = address?.customer_address?.trim() || [address?.customer_address_line1, address?.customer_address_city].filter(Boolean).join(", ") || null;
    consider(link.item_id, { at: event.recorded_at, pickupBy: order?.logistics_partner ?? null, deliveryLocation: location });
  }
  for (const c of collections) {
    const source = sourceById.get(c.source_id);
    for (const unitId of c.unit_ids ?? []) {
      if (!ids.includes(unitId)) continue;
      consider(unitId, { at: c.occurred_at, pickupBy: source?.party_id ? partyById.get(source.party_id) ?? null : null, deliveryLocation: source?.to_site_id ? siteById.get(source.to_site_id) ?? null : null });
    }
  }

  for (const unit of units) {
    const received = latestIn.get(unit.id) ?? (unit.availability === "incoming" ? null : unit.dateIn);
    const out = latestOut.get(unit.id);
    // A departure that a later receipt has already answered is not the road.
    const onTheRoad = out && !(received && received > out.at);
    facts.set(unit.id, {
      goodsReceivedDate: received ?? null,
      shipDate: onTheRoad ? out.at : null,
      pickupBy: onTheRoad ? out.pickupBy : null,
      deliveryLocation: onTheRoad ? out.deliveryLocation : null,
    });
  }
  return facts;
}
