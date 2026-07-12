import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  mergeSoGridConfig,
  parseOrderEntryConfigRow,
  setOrderEntryConfigInput,
  updateSoGridConfigSchema,
  type SoGridConfig,
  type SoGridRow,
} from "@carres/shared";
import { userClient } from "../../lib/supabase";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import type { AppEnv } from "../../types";

/**
 * /api/operation/sales-order-maintenance — AutoCount-style configurable SO grid
 * (2026-06-16). See docs/superpowers/plans/2026-06-16-sales-order-maintenance.md.
 *
 *   GET  /grid    — every order flattened to one row per order_line, enriched
 *                   with resolved names (dealer / agent / product / item group /
 *                   location / partner). Returns { rows, config, generatedAt }.
 *   GET  /config  — the shared column config (merged with the live catalog).
 *   PUT  /config  — replace the shared column config (operation/principal only;
 *                   written through the set_sales_order_grid_config RPC).
 *
 * Rows are READ-ONLY — this endpoint never mutates orders. The only writable
 * surface is the shared column/option config.
 */
const router = new Hono<AppEnv>();

// Internal-only. Inline guard = fast 403 before any Supabase round-trip.
router.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation/Principal only" });
  }
  await next();
});

// Order columns we select (header fields repeated per line in the grid).
const ORDER_COLS = [
  "id", "so", "status", "channel", "source_system", "source_ref",
  "customer_name", "customer_phone", "customer_address", "customer_billing", "customer_emergency",
  "dealer_id", "salesperson_id", "outlet_id",
  "delivery_date", "proceed_date", "delivery_date_tbd", "delivery_floor",
  "delivery_has_lift", "delivery_stair_items", "warehouse_id", "delivery_partner_id",
  "partner_eta", "partner_stage", "do_number",
  "paid", "payment_method", "approval_code", "installment_months",
  "operation_stage", "dispatched_at", "delivered_at", "invoice_no", "invoiced_at",
  "terms_accepted", "items_edited", "placed_at", "created_at", "updated_at",
].join(", ");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

interface Maps {
  dealer: Map<string, string>;
  salesperson: Map<string, string>;
  outlet: Map<string, string>;
  warehouse: Map<string, string>;
  partner: Map<string, string>;
  skuInfo: Map<string, { name: string | null; category: string | null }>;
}

/** Read the singleton shared config, merged with the live catalog. */
async function readConfig(sb: ReturnType<typeof userClient>): Promise<SoGridConfig> {
  const { data, error } = await sb
    .from("sales_order_grid_config")
    .select("columns, options")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  return mergeSoGridConfig(
    data
      ? { columns: (data.columns as SoGridConfig["columns"]) ?? [], options: (data.options as SoGridConfig["options"]) ?? {} }
      : null,
  );
}

function buildRow(o: AnyRow, line: AnyRow | null, m: Maps): SoGridRow {
  const qty = line ? Number(line.qty ?? 0) : null;
  const unit = line ? Number(line.unit_price ?? 0) : null;
  const sku: string | null = line?.sku ?? null;
  const prod = sku ? m.skuInfo.get(sku) : undefined;
  return {
    rowId: `${o.id}:${line?.id ?? "noline"}`,
    orderId: o.id,
    lineId: line?.id ?? "noline",
    // --- Order ---
    so: o.so != null ? `SO-${o.so}` : null,
    source_ref: Array.isArray(o.source_ref) ? o.source_ref.join(", ") : (o.source_ref ?? null),
    placed_at: o.placed_at ?? null,
    status: o.status ?? null,
    channel: o.channel ?? null,
    source_system: o.source_system ?? null,
    // --- Customer ---
    customer_name: o.customer_name ?? null,
    customer_phone: o.customer_phone ?? null,
    dealer_name: o.dealer_id ? m.dealer.get(o.dealer_id) ?? null : null,
    salesperson_name: o.salesperson_id ? m.salesperson.get(o.salesperson_id) ?? null : null,
    outlet_name: o.outlet_id ? m.outlet.get(o.outlet_id) ?? null : null,
    customer_address: o.customer_address ?? null,
    customer_billing: o.customer_billing ?? null,
    customer_emergency: o.customer_emergency ?? null,
    // --- Item (line) ---
    sku,
    product_name: prod?.name ?? null,
    item_group: prod?.category ?? null,
    attrs: line?.attrs ? JSON.stringify(line.attrs) : null,
    qty,
    unit_price: unit,
    line_total: qty != null && unit != null ? qty * unit : null,
    source_po: line?.source_po ?? null,
    // --- Delivery ---
    delivery_date: o.delivery_date ?? null,
    proceed_date: o.proceed_date ?? null,
    delivery_date_tbd: o.delivery_date_tbd ?? null,
    warehouse_name: o.warehouse_id ? m.warehouse.get(o.warehouse_id) ?? null : null,
    delivery_floor: o.delivery_floor ?? null,
    delivery_has_lift: o.delivery_has_lift ?? null,
    delivery_stair_items: o.delivery_stair_items ?? null,
    delivery_partner_name: o.delivery_partner_id ? m.partner.get(o.delivery_partner_id) ?? null : null,
    partner_eta: o.partner_eta ?? null,
    do_number: o.do_number ?? null,
    // --- Payment ---
    paid: o.paid != null ? Number(o.paid) : null,
    payment_method: o.payment_method ?? null,
    approval_code: o.approval_code ?? null,
    installment_months: o.installment_months ?? null,
    // --- Operation ---
    operation_stage: o.operation_stage ?? null,
    partner_stage: o.partner_stage ?? null,
    dispatched_at: o.dispatched_at ?? null,
    delivered_at: o.delivered_at ?? null,
    invoice_no: o.invoice_no ?? null,
    invoiced_at: o.invoiced_at ?? null,
    // --- Meta ---
    terms_accepted: o.terms_accepted ?? null,
    items_edited: o.items_edited ?? null,
    created_at: o.created_at ?? null,
    updated_at: o.updated_at ?? null,
  };
}

router.get("/grid", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const limitRaw = Number.parseInt(c.req.query("limit") ?? "1000", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 1000, 1), 5000);

  const { data, error } = await sb
    .from("orders")
    .select(`${ORDER_COLS}, order_lines(id, sku, qty, unit_price, attrs, source_po)`)
    .order("placed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new HTTPException(500, { message: error.message });
  const orders = (data ?? []) as AnyRow[];

  // Collect id / sku sets for batch enrichment (orders-feed.ts precedent).
  const dealerIds = new Set<string>();
  const spIds = new Set<string>();
  const outletIds = new Set<string>();
  const whIds = new Set<string>();
  const partnerIds = new Set<string>();
  const skus = new Set<string>();
  for (const o of orders) {
    if (o.dealer_id) dealerIds.add(o.dealer_id);
    if (o.salesperson_id) spIds.add(o.salesperson_id);
    if (o.outlet_id) outletIds.add(o.outlet_id);
    if (o.warehouse_id) whIds.add(o.warehouse_id);
    if (o.delivery_partner_id) partnerIds.add(o.delivery_partner_id);
    for (const l of (o.order_lines as AnyRow[]) ?? []) if (l.sku) skus.add(l.sku);
  }

  const idList = (s: Set<string>) => Array.from(s);
  const nameMap = async (table: string, ids: string[]) => {
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const res = await sb.from(table).select("id, name").in("id", ids);
    if (res.error) throw new HTTPException(500, { message: res.error.message });
    (res.data ?? []).forEach((r: AnyRow) => map.set(r.id, r.name));
    return map;
  };

  const [dealer, salesperson, outlet, warehouse, partner] = await Promise.all([
    nameMap("dealers", idList(dealerIds)),
    nameMap("salespersons", idList(spIds)),
    nameMap("outlets", idList(outletIds)),
    nameMap("warehouses", idList(whIds)),
    nameMap("delivery_partners", idList(partnerIds)),
  ]);

  // sku -> product_models.{name, category} via product_skus.model_id.
  const skuInfo = new Map<string, { name: string | null; category: string | null }>();
  if (skus.size) {
    const skuRes = await sb
      .from("product_skus")
      .select("sku, model_id")
      .in("sku", Array.from(skus));
    if (skuRes.error) throw new HTTPException(500, { message: skuRes.error.message });
    const skuToModel = new Map<string, string>();
    const modelIds = new Set<string>();
    (skuRes.data ?? []).forEach((r: AnyRow) => {
      if (r.model_id) {
        skuToModel.set(r.sku, r.model_id);
        modelIds.add(r.model_id);
      }
    });
    const modelMap = new Map<string, { name: string | null; category: string | null }>();
    if (modelIds.size) {
      const mRes = await sb
        .from("product_models")
        .select("id, name, category")
        .in("id", Array.from(modelIds));
      if (mRes.error) throw new HTTPException(500, { message: mRes.error.message });
      (mRes.data ?? []).forEach((r: AnyRow) =>
        modelMap.set(r.id, { name: r.name ?? null, category: r.category ?? null }),
      );
    }
    for (const [sku, modelId] of skuToModel) {
      skuInfo.set(sku, modelMap.get(modelId) ?? { name: null, category: null });
    }
  }

  const maps: Maps = { dealer, salesperson, outlet, warehouse, partner, skuInfo };

  const rows: SoGridRow[] = [];
  for (const o of orders) {
    const lines = (o.order_lines as AnyRow[]) ?? [];
    if (lines.length === 0) {
      // Defensive: never silently drop an order with no lines.
      rows.push(buildRow(o, null, maps));
    } else {
      for (const l of lines) rows.push(buildRow(o, l, maps));
    }
  }

  const config = await readConfig(sb);
  return c.json({ rows, config, generatedAt: new Date().toISOString() });
});

router.get("/config", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const config = await readConfig(sb);
  return c.json({ config });
});

router.put("/config", async (c) => {
  const parsed = await parseJsonBody(c, updateSoGridConfigSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("set_sales_order_grid_config", {
    p_columns: parsed.data.columns,
    p_options: parsed.data.options,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  // Echo back the merged config (catalog-aligned) so the client stays in sync.
  const config = await readConfig(sb);
  return c.json({ config });
});

// ---------------------------------------------------------------------------
// 0219 — Order Entry config (payment methods + POS form fields). SO
// Maintenance is the config center for the "Open Sales Order" FORMAT (Loo
// 2026-07-12): what the POS asks at order entry, not just how the grid shows.
// ---------------------------------------------------------------------------

router.get("/entry-config", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("order_entry_config")
    .select("payment_methods, form_fields")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ entryConfig: parseOrderEntryConfigRow(data) });
});

router.put("/entry-config", async (c) => {
  const parsed = await parseJsonBody(c, setOrderEntryConfigInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("set_order_entry_config", {
    p_payment_methods: parsed.data.paymentMethods,
    p_form_fields: parsed.data.formFields,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({
    entryConfig: parseOrderEntryConfigRow(
      data as { payment_methods?: unknown; form_fields?: unknown } | null,
    ),
  });
});

export default router;
