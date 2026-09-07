import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { DB, reservedDrilldownQuery, buildInboundRegisterView, inboundArrivals, inboundUnresolvedSources, type InboundInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { readOptionalRelation } from "../../lib/optional-relation";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/warehouse — Phase 4 M4 backend warehouse subsystem.
 *
 * Endpoints implemented:
 *   GET /        — composed query: warehouses + the UNIT REGISTER's availability
 *                  (0366's `stock_sku_availability`) per warehouse, with
 *                  low_stock flags and the Settings thresholds beside them.
 *
 * 0366 — POST /adjust is GONE. Stock is counted from the exact Units; there is
 * no door that moves a total without naming one.
 *
 * Future M4 tasks add: GET /movements (list).
 *
 * Aggregation contract (per spec §18.5):
 *   - low_stock_status badge is row-level (per SKU). Spec §18.5 wording:
 *     "OK (green) / Low (yellow, total ≤1) / Out (red, total = 0)".
 *   - Status uses qty thresholds (NOT qty-vs-reserved), per spec §18.5. Inline
 *     plan comment "Out=0, Low=1, OK>1" matches it. 0366 changed only WHERE the
 *     qty comes from — the unit register, summing each record's `qty` instead
 *     of counting rows off a hand-adjustable total — never what the badge means.
 *     Whether a shelf badge should instead ask what can be OFFERED (a unit in
 *     repair sits in `qty` and can be promised to nobody) is a real question,
 *     and it belongs to the Stock Register card with the rest of the presentation.
 *   - byWarehouse[wh_id][i].low_stock_status uses that warehouse's qty.
 *   - totalsBySku[sku].low_stock_status_aggregate uses summed qty across
 *     all warehouses (drives the "All warehouses" column badge).
 *
 * Response shape:
 *   {
 *     warehouses: { id, name, address }[],            // sorted by name
 *     byWarehouse: Record<wh_id, StockRow[]>,         // [] if no balances
 *     totalsBySku: Record<sku, { total_qty, total_reserved, low_stock_status_aggregate }>,
 *   }
 *
 * Pattern: matches sibling operation/orders.ts dual-from composed reads with
 * shared mapPgError from lib/route-helpers.
 */
const operationWarehouseRouter = new Hono<AppEnv>();

// Inline operation-only guard — fast 403 before any Supabase round-trip.
operationWarehouseRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation only" });
  }
  await next();
});

/** Paginated, RLS-scoped reads: a truncated table must never look like a complete tally. */
operationWarehouseRouter.get("/inbound", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const limit = Math.min(
    Math.max(1, Math.floor(Number(c.req.query("limit")) || 50)),
    200,
  );
  const offset = Math.max(0, Math.floor(Number(c.req.query("offset")) || 0));
  async function read(table: string, fields: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await sb.from(table).select(fields).order(table === "arrival_source_units" ? "source_id" : "id").order(table === "arrival_source_units" ? "stock_item_id" : "id").range(offset, offset + 499);
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []) as unknown as Record<string, unknown>[]);
      if ((result.data?.length ?? 0) < 500) return rows;
    }
  }
  /* The arrival-source objects are approved Inbound truth whose tables are
     still an unnumbered draft (docs/stock/MASTER.md §13.9). Their absence
     means this source kind has no records — it may never mean the register
     failed to open. A real authority failure still travels untouched. */
  const optional = (table: string, fields: string) =>
    readOptionalRelation(() => read(table, fields), [] as Record<string, unknown>[]);
  try {
    const [pos, sites, suppliers, destinations, units, receipts, results, lines, promises, arrivalSources, sourceUnits, parties, sourceEvents, productSkus] = await Promise.all([
      read("purchase_orders", "id,version,supplier_id,warehouse_id,destination_id,status,official_delivery_date,eta_date,placed_at,so"),
      read("warehouses", "id,name"),
      read("suppliers", "id,name"),
      read("purchasing_destinations", "id,warehouse_id"),
      read("ops_stock_items", "id,unit_code,po_no,qty,sku"),
      /* `arrival_source_id` arrives with those same draft tables; without it
         every receipt is simply PO-backed, which is what production holds. */
      readOptionalRelation(
        () => read("warehouse_receipts", "id,po_id,arrival_source_id,actual_site_id,status,posted_at,grn_no,goods_received_at"),
        null,
      ).then((rows) =>
        rows ??
        read("warehouse_receipts", "id,po_id,actual_site_id,status,posted_at,grn_no,goods_received_at"),
      ),
      read("receiving_unit_results", "id,receipt_id,stock_item_id,outcome,issue_kind"),
      read("purchase_order_lines", "id,po_id,qty,destination_id,sku"),
      read("po_supplier_promises", "id,po_id,po_version,kind,answer,new_date,about_date,previous_date,reason,channel,recipient,evidence,reported_by,reported_at,recorded_by,recorded_at"),
      optional("arrival_sources", "id,source_no,kind,claim_id,case_id,from_site_id,to_site_id,party_id,expected_date,collection_date,reason,cancelled_at,created_at,sales_order_ref"),
      optional("arrival_source_units", "source_id,stock_item_id,replaces_item_id"),
      optional("stock_operating_parties", "id,name"),
      optional("arrival_source_events", "id,source_id,kind,unit_ids"),
      read("product_skus", "id,sku,variant"),
    ]);
    const skuNames = (productSkus as Array<{ sku: string; variant: string | null }>).map(
      (row) => ({ sku: row.sku, name: row.variant ?? null }),
    );
    const input = { pos, sites, suppliers, destinations, units, receipts, results, lines, promises, arrivalSources, sourceUnits, parties, sourceEvents, skuNames } as unknown as InboundInput;
    const all = inboundArrivals(input);
    const filters = new URLSearchParams();
    for (const key of ["status", "sourceType", "site", "source", "date", "from", "to", "q"])
      if (c.req.query(key)) filters.set(key, c.req.query(key)!);
    const view = buildInboundRegisterView(all, filters, offset, limit);
    return c.json({
      arrivals: view.rows,
      sites,
      unresolvedSources: inboundUnresolvedSources(input),
      page: { offset, limit, total: view.total },
      facets: view.facets,
    });
  } catch (error) {
    const mapped = mapPgError(error as Parameters<typeof mapPgError>[0]);
    return c.json(mapped.body, mapped.status);
  }
});

type LowStockStatus = "out" | "low" | "ok";

function statusFor(qty: number): LowStockStatus {
  if (qty <= 0) return "out";
  if (qty <= 1) return "low";
  return "ok";
}

// Response-shape types are local on purpose — the wire payload is owned by
// this route and not (yet) shared with the web app. Migrating these to
// packages/shared/src/domain.ts is M4 Task 2 territory, not this task.
interface PerWarehouseStockEntry {
  sku: string;
  qty: number;
  reserved: number;
  low_stock_status: LowStockStatus;
  /** T42-pass3-C1 — surfaces stock_balances.low_threshold so the warehouse UI
   *  can prefill `SetThresholdDialog` instead of opening blank (which would
   *  imply clearing existing thresholds on save). NULL = no threshold set. */
  low_threshold: number | null;
  /** T42-pass3-C1 — same rationale as low_threshold. */
  high_threshold: number | null;
}

interface SkuTotals {
  total_qty: number;
  total_reserved: number;
  low_stock_status_aggregate: LowStockStatus;
}

operationWarehouseRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [whRes, sbRes, thrRes] = await Promise.all([
    // P4 (multi-location) — owning_partner_id surfaces own-WH (NULL = Carres own,
    // e.g. Klang; non-NULL = LP-owned, e.g. HOUZS Balakong). The Receiving GRN
    // queue uses it to show only goods coming INTO an own warehouse.
    sb.from("warehouses").select("id, name, address, owning_partner_id").order("name"),
    // 0366 — the totals come from the UNIT REGISTER through the one
    // availability authority, never from `stock_balances`, which is now a
    // non-authoritative cache of the legacy RPCs. The thresholds beside it
    // are Settings and are read separately and joined below.
    sb
      .from("stock_sku_availability")
      .select("sku, warehouse_id, on_hand, available, reserved"),
    sb.from("stock_balances").select("sku, warehouse_id, low_threshold, high_threshold"),
  ]);
  if (whRes.error) {
    const m = mapPgError(whRes.error);
    return c.json(m.body, m.status);
  }
  if (sbRes.error) {
    const m = mapPgError(sbRes.error);
    return c.json(m.body, m.status);
  }
  if (thrRes.error) {
    const m = mapPgError(thrRes.error);
    return c.json(m.body, m.status);
  }

  const warehouses = (whRes.data ?? []) as DB.WarehouseRow[];
  const balances = (sbRes.data ?? []) as Array<{
    sku: string;
    warehouse_id: string;
    on_hand: number;
    available: number;
    reserved: number;
  }>;
  const thresholds = new Map<string, { low: number | null; high: number | null }>();
  for (const t of (thrRes.data ?? []) as Array<{
    sku: string;
    warehouse_id: string;
    low_threshold: number | null;
    high_threshold: number | null;
  }>) {
    thresholds.set(`${t.sku}\u0000${t.warehouse_id}`, {
      low: t.low_threshold ?? null,
      high: t.high_threshold ?? null,
    });
  }

  // Initialise byWarehouse with every warehouse (so empty warehouses surface as []).
  const byWarehouse: Record<string, PerWarehouseStockEntry[]> = {};
  for (const w of warehouses) byWarehouse[w.id] = [];

  // Accumulate totals per SKU as we iterate balances.
  const totalsAccum: Record<string, { total_qty: number; total_reserved: number }> = {};

  for (const b of balances) {
    const qty = Number(b.on_hand) || 0;
    const reserved = Number(b.reserved) || 0;
    const thr = thresholds.get(`${b.sku}\u0000${b.warehouse_id}`);
    // Only push to byWarehouse if the warehouse exists in the warehouses list.
    // Defensive: balance rows for deleted warehouses (cascade should remove them
    // but keep the route resilient) are skipped from BOTH the per-warehouse
    // view AND totals, so orphan SKUs never surface in the response.
    if (!Object.prototype.hasOwnProperty.call(byWarehouse, b.warehouse_id)) continue;

    byWarehouse[b.warehouse_id]!.push({
      sku: b.sku,
      qty,
      reserved,
      low_stock_status: statusFor(qty),
      // T42-pass3-C1 — surface raw thresholds for SetThresholdDialog prefill.
      low_threshold: thr?.low ?? null,
      high_threshold: thr?.high ?? null,
    });

    const t = (totalsAccum[b.sku] ??= { total_qty: 0, total_reserved: 0 });
    t.total_qty += qty;
    t.total_reserved += reserved;
  }

  const totalsBySku: Record<string, SkuTotals> = {};
  for (const sku of Object.keys(totalsAccum)) {
    const t = totalsAccum[sku]!;
    totalsBySku[sku] = {
      total_qty: t.total_qty,
      total_reserved: t.total_reserved,
      low_stock_status_aggregate: statusFor(t.total_qty),
    };
  }

  return c.json({ warehouses, byWarehouse, totalsBySku });
});

// ----- GET /reserved-drilldown — orders holding reserve at (sku, warehouse) -----
//
// Pipeline v2 C4: surfaces the order-level breakdown behind the
// `stock_balances.reserved` count for a single (sku, warehouse) pair.
// `_operation_reserve_order` only holds a reserve while the order is in
// `ready_to_dispatch` or `dispatched`; the stage filter mirrors that contract
// so the sum of returned `reservedQty` should match the row's reserved value.
//
// Composes a join over `orders` + `order_lines` via the user-token client (RLS
// is the security boundary). Stage values are cast to text in the .in() filter
// so the PostgREST enum coercion stays predictable; the route guard already
// enforces operation-only role.
operationWarehouseRouter.get("/reserved-drilldown", async (c) => {
  const parsed = reservedDrilldownQuery.safeParse({
    warehouseId: c.req.query("warehouseId") ?? undefined,
    sku: c.req.query("sku") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { warehouseId, sku } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  // PostgREST does the join via embedded resource: select order_lines that
  // match the sku, then filter parent orders by warehouse + stage. The shape
  // we want (one row per order, with summed qty) is easier to assemble in
  // application code than to express in a single PostgREST resource path —
  // so we fetch lines + their order parent via embed and group in JS. This
  // mirrors how dashboard.ts composes its open_pos summary.
  const { data, error } = await sb
    .from("order_lines")
    .select(
      "qty, sku, orders:orders!inner(id, so, customer_name, operation_stage, warehouse_id)",
    )
    .eq("sku", sku)
    .eq("orders.warehouse_id", warehouseId)
    .in("orders.operation_stage", ["ready_to_dispatch", "dispatched"]);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  type LineWithOrder = {
    qty: number;
    sku: string;
    // Supabase types `inner` joins as a single object (not array) when the FK is
    // 1-1. PostgREST sometimes types it as array regardless; handle both.
    orders:
      | {
          id: string;
          so: number;
          customer_name: string;
          operation_stage: "ready_to_dispatch" | "dispatched";
          warehouse_id: string;
        }
      | Array<{
          id: string;
          so: number;
          customer_name: string;
          operation_stage: "ready_to_dispatch" | "dispatched";
          warehouse_id: string;
        }>
      | null;
  };

  // Group by order id + sum qty. We discard rows where the embedded `orders`
  // is null/empty (defensive — the inner join + .eq should already filter
  // those out, but the .inner clause depends on PostgREST request encoding).
  const grouped = new Map<
    string,
    {
      id: string;
      so: number;
      customerName: string;
      operationStage: "ready_to_dispatch" | "dispatched";
      reservedQty: number;
    }
  >();
  let total = 0;
  for (const row of (data ?? []) as LineWithOrder[]) {
    const orderRow = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!orderRow) continue;
    const qty = Number(row.qty) || 0;
    if (qty <= 0) continue;
    total += qty;
    const existing = grouped.get(orderRow.id);
    if (existing) {
      existing.reservedQty += qty;
    } else {
      grouped.set(orderRow.id, {
        id: orderRow.id,
        so: orderRow.so,
        customerName: orderRow.customer_name,
        operationStage: orderRow.operation_stage,
        reservedQty: qty,
      });
    }
  }
  // Sort by so desc — newest order first, matches the spec query order.
  const orders = Array.from(grouped.values()).sort((a, b) => b.so - a.so);
  return c.json({ warehouseId, sku, total, orders });
});

// 0366 — POST /adjust IS GONE, with `operation_adjust_stock` behind it.
//
// It moved `stock_balances.qty` by a signed delta and never named a physical
// Unit: stock appeared and disappeared with nothing behind it, and the totals
// drifted from the register with nothing to reconcile against. That is the
// "Add stock / Remove stock" door the Stock MASTER rejects (§2) and the stored
// total the Unit Authority card forbids from deciding availability (§3).
//
// Stock is now COUNTED from the exact Units. What happened to a Unit is
// recorded through its own governed door and the totals follow. The RPC
// survives only to raise `unit_authority_only` at a client that has not caught
// up.

export default operationWarehouseRouter;
