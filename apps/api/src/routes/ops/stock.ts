import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  opsStockReserveInputSchema,
  opsStockReleaseInputSchema,
  opsStockReassignInputSchema,
  opsStockTakeoutInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockUpdateConditionInputSchema,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Per-unit stock register (migration 0137) — Carres Klang scope.
 *
 * GET endpoints (4 list views the operation panel renders):
 *   /ready      — status='free' AND condition∈('new','exhibition') AND !needs_repair
 *   /reserved   — status='reserved'
 *   /repair     — needs_repair=true OR condition∈('old','damaged')
 *   /inventory  — everything (master grid)
 *
 * POST endpoints (5 actions, each calls a SECURITY DEFINER RPC):
 *   /reserve, /release, /reassign, /takeout, /flag-repair
 *
 * All endpoints gated to operation/principal via requireOperationOrPrincipal.
 */

const opsStockRouter = new Hono<AppEnv>();

// =====================================================================
// GET list views
// =====================================================================

opsStockRouter.get("/ready", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .eq("status", "free")
    .in("condition", ["new", "exhibition"])
    .eq("needs_repair", false)
    .order("date_in", { ascending: true, nullsFirst: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

opsStockRouter.get("/reserved", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .eq("status", "reserved")
    .order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

opsStockRouter.get("/repair", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .or("needs_repair.eq.true,condition.in.(old,damaged)")
    .order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

opsStockRouter.get("/inventory", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .order("sku", { ascending: true })
    .order("status", { ascending: true });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

// =====================================================================
// POST actions — thin wrappers over the SECURITY DEFINER RPCs.
// =====================================================================

opsStockRouter.post("/reserve", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReserveInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_reserve", {
    p_sku: parsed.sku,
    p_ref: parsed.ref,
    p_condition: parsed.condition ?? null,
    p_wh: parsed.warehouseId ?? null,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "No matching free unit available for this SKU",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.post("/release", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReleaseInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_release", {
    p_item_id: parsed.itemId,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "Item not found or not in reserved status",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.post("/reassign", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReassignInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_reassign", {
    p_item_id: parsed.itemId,
    p_new_ref: parsed.newRef,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "Item not found or not in reserved status",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.post("/takeout", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockTakeoutInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_takeout", {
    p_item_id: parsed.itemId,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "Item not found or already sold/transferred",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.patch("/:itemId/condition", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const parsed = await parseBody(c, opsStockUpdateConditionInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb
    .from("ops_stock_items")
    .update({ condition: parsed.condition, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw mapErr(error);
  return c.json({ itemId });
});

opsStockRouter.post("/flag-repair", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockFlagRepairInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_flag_repair", {
    p_item_id: parsed.itemId,
    p_flag: parsed.flag,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, { message: "Item not found" });
  }
  return c.json({ itemId: data });
});

// =====================================================================
// Helpers
// =====================================================================

interface RawRow {
  id: string;
  sku: string;
  warehouse_id: string;
  condition: "new" | "exhibition" | "old" | "damaged";
  status: "free" | "reserved" | "sold" | "transferred";
  reserved_ref: string | null;
  ref_history: string[];
  needs_repair: boolean;
  supplier: string | null;
  po_no: string | null;
  source_ref: string | null;
  date_in: string | null;
  created_at: string;
  updated_at: string;
}

function shape(rows: RawRow[]) {
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    warehouseId: r.warehouse_id,
    condition: r.condition,
    status: r.status,
    reservedRef: r.reserved_ref,
    refHistory: r.ref_history ?? [],
    needsRepair: r.needs_repair,
    supplier: r.supplier,
    poNo: r.po_no,
    sourceRef: r.source_ref,
    dateIn: r.date_in,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid input: " + parsed.error.issues[0]?.message,
    });
  }
  return parsed.data;
}

function mapErr(error: { code?: string; message?: string }): HTTPException {
  if (error.code === "42501") return new HTTPException(403, { message: error.message ?? "Forbidden" });
  if (error.code === "22023") return new HTTPException(400, { message: error.message ?? "Invalid" });
  return new HTTPException(500, { message: error.message ?? "ops_stock RPC failed" });
}

export default opsStockRouter;
