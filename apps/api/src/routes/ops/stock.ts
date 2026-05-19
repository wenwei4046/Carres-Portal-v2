import { Hono } from "hono";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { requireOps } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Ops · Stock — backed by the per-item register `ops_stock_items`
 * (Jess 2026-05-19). One row per physical unit with condition + status +
 * reserved_ref, so the three views are genuinely distinct + correct:
 *
 *   GET /api/ops/stock/ready     status=free, condition new|exhibition  (sales)
 *   GET /api/ops/stock/inventory all items, all status/condition        (ops master)
 *   GET /api/ops/stock/reserved  status=reserved + which customer ref
 *   POST /api/ops/stock/reserve  flip one free unit → reserved (booking-as-reserve;
 *                                full order creation waits wenwei's import door)
 *
 * Each view groups item rows by (sku, condition, status) and enriches with
 * product_skus/model/warehouse. stock_balances stays in sync via the
 * ops_rollup_stock_balances() function (wenwei's dispatch math untouched).
 */
const opsStockRouter = new Hono<AppEnv>();
opsStockRouter.use("*", requireOps);

const CKLG = "00000000-0000-0000-0000-000000000c03";

async function loadCtx(sb: ReturnType<typeof userClient>) {
  const [skuRes, modelRes, whRes] = await Promise.all([
    sb.from("product_skus").select("sku, variant, model_id"),
    sb.from("product_models").select("id, category, name"),
    sb.from("warehouses").select("id, name"),
  ]);
  const err = skuRes.error || modelRes.error || whRes.error;
  if (err) return { err };
  const skuMap = new Map((skuRes.data ?? []).map((r: any) => [r.sku, r]));
  const modelMap = new Map((modelRes.data ?? []).map((r: any) => [r.id, r]));
  const whMap = new Map((whRes.data ?? []).map((r: any) => [r.id, r]));
  return { skuMap, modelMap, whMap };
}

function enrich(row: any, ctx: any) {
  const sku = ctx.skuMap.get(row.sku);
  const model = sku ? ctx.modelMap.get(sku.model_id) : null;
  const wh = ctx.whMap.get(row.warehouse_id);
  return {
    sku: row.sku,
    category: model?.category ?? "—",
    model: model?.name ?? row.sku,
    variant: sku?.variant ?? "—",
    warehouse: wh?.name ?? "—",
  };
}

// Group items by (sku|condition|status) → counts, keep enriched meta.
function group(items: any[], ctx: any, withRef = false) {
  const map = new Map<string, any>();
  for (const it of items) {
    const meta = enrich(it, ctx);
    const key = `${it.sku}|${it.condition}|${it.status}`;
    const g = map.get(key) ?? {
      ...meta,
      condition: it.condition,
      status: it.status,
      qty: 0,
      ...(withRef ? { refs: new Set<string>() } : {}),
    };
    g.qty += 1;
    if (withRef && it.reserved_ref) g.refs.add(it.reserved_ref);
    map.set(key, g);
  }
  const arr = [...map.values()];
  if (withRef) arr.forEach((g) => (g.refs = [...g.refs]));
  return arr.sort(
    (a, b) => a.category.localeCompare(b.category) || a.model.localeCompare(b.model),
  );
}

opsStockRouter.get("/ready", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const ctx = await loadCtx(sb);
  if (ctx.err) {
    const m = mapPgError(ctx.err);
    return c.json(m.body, m.status);
  }
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("sku, warehouse_id, condition, status, reserved_ref")
    .eq("status", "free")
    .in("condition", ["new", "exhibition"]);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ items: group(data ?? [], ctx) });
});

opsStockRouter.get("/inventory", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const ctx = await loadCtx(sb);
  if (ctx.err) {
    const m = mapPgError(ctx.err);
    return c.json(m.body, m.status);
  }
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("sku, warehouse_id, condition, status, reserved_ref");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ items: group(data ?? [], ctx, true) });
});

opsStockRouter.get("/reserved", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const ctx = await loadCtx(sb);
  if (ctx.err) {
    const m = mapPgError(ctx.err);
    return c.json(m.body, m.status);
  }
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("sku, warehouse_id, condition, status, reserved_ref")
    .eq("status", "reserved");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ items: group(data ?? [], ctx, true) });
});

// Reserve ONE free unit of a sku (booking-as-reserve). Full order creation
// arrives with wenwei's import door — for now this just holds the unit.
const reserveInput = z.object({
  sku: z.string().min(1),
  reservedRef: z.string().min(1).max(64),
  condition: z.enum(["new", "exhibition"]).optional(),
});

opsStockRouter.post("/reserve", async (c) => {
  const auth = c.var.auth;
  const raw = await c.req.json().catch(() => ({}));
  const parsed = reserveInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  // Pick the oldest matching free unit.
  let q = sb
    .from("ops_stock_items")
    .select("id")
    .eq("sku", parsed.data.sku)
    .eq("status", "free")
    .eq("warehouse_id", CKLG)
    .order("created_at", { ascending: true })
    .limit(1);
  if (parsed.data.condition) q = q.eq("condition", parsed.data.condition);
  const pick = await q;
  if (pick.error) {
    const m = mapPgError(pick.error);
    return c.json(m.body, m.status);
  }
  if (!pick.data || pick.data.length === 0) {
    return c.json({ error: "no_free_unit", message: "No free unit available for that SKU" }, 409);
  }
  const id = pick.data[0].id;
  const upd = await sb
    .from("ops_stock_items")
    .update({ status: "reserved", reserved_ref: parsed.data.reservedRef, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "free") // guard against race
    .select()
    .single();
  if (upd.error) {
    const m = mapPgError(upd.error);
    return c.json(m.body, m.status);
  }
  await sb.from("ops_activity_log").insert({
    actor_id: auth.id,
    actor_name: auth.email,
    module: "stock",
    action: "reserve",
    entity_type: "stock_item",
    entity_ref: parsed.data.reservedRef,
    summary: `Reserved 1× ${parsed.data.sku} for ${parsed.data.reservedRef}`,
    details: { sku: parsed.data.sku, itemId: id },
  });
  return c.json({ reserved: upd.data });
});

export default opsStockRouter;
