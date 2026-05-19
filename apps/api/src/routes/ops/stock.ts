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
      ...(withRef ? { refs: new Set<string>(), oldRefs: new Set<string>() } : {}),
    };
    g.qty += 1;
    if (withRef) {
      if (it.reserved_ref) g.refs.add(it.reserved_ref);
      // Old refs kept so warehouse can still find the unit by the sticker.
      for (const old of it.ref_history ?? []) g.oldRefs.add(old);
    }
    map.set(key, g);
  }
  const arr = [...map.values()];
  if (withRef)
    arr.forEach((g) => {
      g.refs = [...g.refs];
      g.oldRefs = [...g.oldRefs];
    });
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
  // Sellable = free + good condition + NOT flagged for repair.
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("sku, warehouse_id, condition, status, reserved_ref")
    .eq("status", "free")
    .eq("needs_repair", false)
    .in("condition", ["new", "exhibition"]);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ items: group(data ?? [], ctx) });
});

// Repair / Return queue — needs_repair OR old/damaged condition.
opsStockRouter.get("/repair", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const ctx = await loadCtx(sb);
  if (ctx.err) {
    const m = mapPgError(ctx.err);
    return c.json(m.body, m.status);
  }
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("sku, warehouse_id, condition, status, reserved_ref")
    .or("needs_repair.eq.true,condition.in.(old,damaged)");
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
    .select("sku, warehouse_id, condition, status, reserved_ref, ref_history");
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
    .select("sku, warehouse_id, condition, status, reserved_ref, ref_history")
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

// --- Release: reserved → free (push current ref into history) ---
const releaseInput = z.object({ sku: z.string().min(1), ref: z.string().min(1) });
opsStockRouter.post("/release", async (c) => {
  const auth = c.var.auth;
  const p = releaseInput.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", message: p.error.issues[0]?.message }, 422);
  const sb = userClient(c.env, auth.jwt);
  const pick = await sb
    .from("ops_stock_items")
    .select("id, reserved_ref, ref_history")
    .eq("sku", p.data.sku)
    .eq("status", "reserved")
    .eq("reserved_ref", p.data.ref)
    .eq("warehouse_id", CKLG)
    .limit(1);
  if (pick.error) { const m = mapPgError(pick.error); return c.json(m.body, m.status); }
  if (!pick.data?.length) return c.json({ error: "not_found", message: "No reserved unit with that ref" }, 409);
  const row = pick.data[0];
  const hist = [...(row.ref_history ?? []), row.reserved_ref].filter(Boolean);
  const upd = await sb
    .from("ops_stock_items")
    .update({ status: "free", reserved_ref: null, ref_history: hist, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select()
    .single();
  if (upd.error) { const m = mapPgError(upd.error); return c.json(m.body, m.status); }
  await sb.from("ops_activity_log").insert({
    actor_id: auth.id, actor_name: auth.email, module: "stock", action: "release",
    entity_type: "stock_item", entity_ref: p.data.ref,
    summary: `Released 1× ${p.data.sku} from ${p.data.ref} → free`,
  });
  return c.json({ released: upd.data });
});

// --- Reassign ref: old ref preserved in ref_history (label reconciliation) ---
const reassignInput = z.object({
  sku: z.string().min(1),
  oldRef: z.string().min(1),
  newRef: z.string().min(1).max(64),
});
opsStockRouter.post("/reassign", async (c) => {
  const auth = c.var.auth;
  const p = reassignInput.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", message: p.error.issues[0]?.message }, 422);
  const sb = userClient(c.env, auth.jwt);
  const pick = await sb
    .from("ops_stock_items")
    .select("id, reserved_ref, ref_history")
    .eq("sku", p.data.sku)
    .eq("status", "reserved")
    .eq("reserved_ref", p.data.oldRef)
    .eq("warehouse_id", CKLG)
    .limit(1);
  if (pick.error) { const m = mapPgError(pick.error); return c.json(m.body, m.status); }
  if (!pick.data?.length) return c.json({ error: "not_found", message: "No reserved unit with old ref" }, 409);
  const row = pick.data[0];
  // Keep the OLD ref forever so warehouse can still find it by the sticker.
  const hist = [...(row.ref_history ?? []), row.reserved_ref].filter(Boolean);
  const upd = await sb
    .from("ops_stock_items")
    .update({ reserved_ref: p.data.newRef, ref_history: hist, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select()
    .single();
  if (upd.error) { const m = mapPgError(upd.error); return c.json(m.body, m.status); }
  await sb.from("ops_activity_log").insert({
    actor_id: auth.id, actor_name: auth.email, module: "stock", action: "reassign_ref",
    entity_type: "stock_item", entity_ref: p.data.newRef,
    summary: `Reassigned 1× ${p.data.sku}: ${p.data.oldRef} → ${p.data.newRef} (old ref kept)`,
    details: { oldRef: p.data.oldRef, newRef: p.data.newRef },
  });
  return c.json({ reassigned: upd.data });
});

// --- Take out (committed stock-out): free|reserved → sold + movement + rollup ---
const takeoutInput = z.object({
  sku: z.string().min(1),
  ref: z.string().min(1).max(64),     // customer ref this unit goes to
  fromReserved: z.boolean().optional(),
});
opsStockRouter.post("/takeout", async (c) => {
  const auth = c.var.auth;
  const p = takeoutInput.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", message: p.error.issues[0]?.message }, 422);
  const sb = userClient(c.env, auth.jwt);
  // Prefer a unit reserved for this ref; else any free unit.
  let q = sb
    .from("ops_stock_items")
    .select("id, reserved_ref, ref_history, status")
    .eq("sku", p.data.sku)
    .eq("warehouse_id", CKLG)
    .order("created_at", { ascending: true })
    .limit(1);
  q = p.data.fromReserved
    ? q.eq("status", "reserved").eq("reserved_ref", p.data.ref)
    : q.eq("status", "free");
  const pick = await q;
  if (pick.error) { const m = mapPgError(pick.error); return c.json(m.body, m.status); }
  if (!pick.data?.length)
    return c.json({ error: "no_unit", message: "No matching unit to take out" }, 409);
  const row = pick.data[0];
  const hist = [...(row.ref_history ?? []), row.reserved_ref].filter(Boolean);
  const upd = await sb
    .from("ops_stock_items")
    .update({
      status: "sold",
      reserved_ref: p.data.ref,
      ref_history: hist,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("status", ["free", "reserved"])
    .select()
    .single();
  if (upd.error) { const m = mapPgError(upd.error); return c.json(m.body, m.status); }
  // Committed physical-out: write the movement + roll wenwei's balance down.
  await sb.from("stock_movements").insert({
    sku: p.data.sku,
    warehouse_id: CKLG,
    qty: 1,
    kind: "out",
    ref: p.data.ref,
    note: `Ops take-out → ${p.data.ref}`,
    by_role: auth.role ?? "operation",
  });
  await sb.rpc("ops_rollup_stock_balances", { p_wh: CKLG });
  await sb.from("ops_activity_log").insert({
    actor_id: auth.id, actor_name: auth.email, module: "stock", action: "takeout",
    entity_type: "stock_item", entity_ref: p.data.ref,
    summary: `Took out 1× ${p.data.sku} → ${p.data.ref} (committed, stock-out)`,
    details: { sku: p.data.sku, fromReserved: !!p.data.fromReserved },
  });
  return c.json({ takenOut: upd.data });
});

// --- Flag / unflag repair (Exhibition worn, etc.) ---
const repairInput = z.object({
  sku: z.string().min(1),
  needsRepair: z.boolean(),
  ref: z.string().optional(),
});
opsStockRouter.post("/flag-repair", async (c) => {
  const auth = c.var.auth;
  const p = repairInput.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", message: p.error.issues[0]?.message }, 422);
  const sb = userClient(c.env, auth.jwt);
  let q = sb
    .from("ops_stock_items")
    .select("id")
    .eq("sku", p.data.sku)
    .eq("needs_repair", !p.data.needsRepair)
    .eq("warehouse_id", CKLG)
    .order("created_at", { ascending: true })
    .limit(1);
  if (p.data.ref) q = q.eq("reserved_ref", p.data.ref);
  const pick = await q;
  if (pick.error) { const m = mapPgError(pick.error); return c.json(m.body, m.status); }
  if (!pick.data?.length) return c.json({ error: "no_unit", message: "No matching unit" }, 409);
  const upd = await sb
    .from("ops_stock_items")
    .update({ needs_repair: p.data.needsRepair, updated_at: new Date().toISOString() })
    .eq("id", pick.data[0].id)
    .select()
    .single();
  if (upd.error) { const m = mapPgError(upd.error); return c.json(m.body, m.status); }
  await sb.from("ops_activity_log").insert({
    actor_id: auth.id, actor_name: auth.email, module: "stock", action: "flag_repair",
    entity_type: "stock_item", entity_ref: p.data.sku,
    summary: `${p.data.needsRepair ? "Flagged" : "Cleared"} repair on 1× ${p.data.sku}`,
  });
  return c.json({ updated: upd.data });
});

export default opsStockRouter;
