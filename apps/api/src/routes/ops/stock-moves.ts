import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import { parseBody } from "../../lib/route-helpers";
import type { AppEnv } from "../../types";

/**
 * Stock Adjustment · Stock Transfer · Stock Take — migration 0714.
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff adjust, transfer and count stock the Houzs way. This overturns Jess's
 * Stock MASTER §12.4 / §12.5 / §12.7 rules; Jess was not part of this decision.
 * Every write is one SECURITY DEFINER door on the Unit register; this router
 * only reads and passes through.
 */
const router = new Hono<AppEnv>();
const uuid = z.string().uuid();
const plusLine = z.object({ sku: z.string().trim().min(1), qty: z.number().int().min(1).max(500) });

function refusal(error: { code?: string; message?: string }): HTTPException {
  if (error.code === "42501") return new HTTPException(403, { message: "Forbidden" });
  if (error.code === "P0002") return new HTTPException(404, { message: error.message ?? "Not found" });
  if (error.code === "P0001" || error.code === "22023") {
    return new HTTPException(422, { message: error.message ?? "Refused" });
  }
  return new HTTPException(500, { message: error.message ?? "Stock door failed" });
}

async function rpc(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, fn: string, args: Record<string, unknown>) {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc(fn, args);
  if (error) throw refusal(error);
  return data;
}

async function read<T>(p: PromiseLike<{ data: T | null; error: { message?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new HTTPException(500, { message: error.message ?? "Read failed" });
  return (data ?? []) as T;
}

/** Sites and the Units standing at one Site, for the pickers. */
router.get("/sites", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  return c.json({ sites: await read(sb.from("warehouses").select("id, name").order("name")) });
});

router.get("/units", requireOperationOrPrincipal, async (c) => {
  const site = uuid.safeParse(c.req.query("siteId"));
  if (!site.success) throw new HTTPException(400, { message: "siteId required" });
  const sb = userClient(c.env, c.var.auth.jwt);
  const units = await read(
    sb.from("stock_unit_register_v")
      .select("id, unit_code, sku, status, condition, reserved_ref, needs_repair")
      .eq("warehouse_id", site.data)
      .in("status", ["free", "reserved", "on_hold"])
      .order("unit_code")
      .limit(5000),
  );
  return c.json({ units });
});

// ── Stock Adjustment ──────────────────────────────────────────────────────────
router.get("/adjustments", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const rows = await read(
    sb.from("stock_adjustments")
      .select("id, adjustment_no, warehouse_id, reason, created_at, stock_counts(count_no), stock_adjustment_units(direction, ops_stock_items(unit_code, sku))")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  return c.json({ adjustments: rows });
});

router.post("/adjustments", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({
    siteId: uuid,
    reason: z.string().trim().min(1, "Write the reason"),
    minusUnitIds: z.array(uuid).default([]),
    plus: z.array(plusLine).default([]),
  }));
  return c.json(await rpc(c, "stock_adjust_units", {
    p_warehouse_id: body.siteId, p_reason: body.reason, p_minus: body.minusUnitIds, p_plus: body.plus,
  }), 201);
});

// ── Stock Transfer ────────────────────────────────────────────────────────────
router.get("/transfers", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const rows = await read(
    sb.from("stock_transfers")
      .select("id, transfer_no, from_site_id, to_site_id, note, status, created_at, cancelled_at, cancel_reason, stock_transfer_units(ops_stock_items(unit_code, sku))")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  return c.json({ transfers: rows });
});

router.post("/transfers", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({
    fromSiteId: uuid, toSiteId: uuid, unitIds: z.array(uuid).min(1), note: z.string().optional(),
  }));
  return c.json(await rpc(c, "stock_transfer_units", {
    p_from: body.fromSiteId, p_to: body.toSiteId, p_units: body.unitIds, p_note: body.note ?? null,
  }), 201);
});

router.post("/transfers/:id/cancel", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ reason: z.string().trim().min(1, "Write the reason") }));
  return c.json(await rpc(c, "stock_transfer_cancel", { p_transfer_id: c.req.param("id"), p_reason: body.reason }));
});

// ── Stock Take ────────────────────────────────────────────────────────────────
router.get("/counts", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const rows = await read(
    sb.from("stock_counts")
      .select("id, count_no, warehouse_id, blind, note, status, created_at, posted_at, stock_adjustments(adjustment_no)")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  return c.json({ counts: rows });
});

router.post("/counts", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ siteId: uuid, blind: z.boolean(), note: z.string().optional() }));
  return c.json(await rpc(c, "stock_count_open", {
    p_warehouse_id: body.siteId, p_blind: body.blind, p_note: body.note ?? null,
  }), 201);
});

router.get("/counts/:id", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data: count, error } = await sb.from("stock_counts")
    .select("id, count_no, warehouse_id, blind, note, status, extras").eq("id", c.req.param("id")).maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!count) throw new HTTPException(404, { message: "Count not found" });
  const units = await read(
    sb.from("stock_count_units")
      .select("found, ops_stock_items(id, unit_code, sku, status)")
      .eq("count_id", count.id),
  );
  // Blind: the counter does not see the expected Units until the count is posted.
  const hide = count.blind && count.status === "open";
  return c.json({
    count,
    units: hide ? [] : units,
    foundCodes: (units as unknown as { found: boolean | null; ops_stock_items: { unit_code: string } | null }[])
      .filter((u) => u.found).map((u) => u.ops_stock_items?.unit_code).filter(Boolean),
  });
});

router.post("/counts/:id", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({
    found: z.array(z.string().trim().min(1)).default([]),
    extras: z.array(plusLine).default([]),
    post: z.boolean(),
  }));
  return c.json(await rpc(c, "stock_count_record", {
    p_count_id: c.req.param("id"), p_found: body.found, p_extras: body.extras, p_post: body.post,
  }));
});

export default router;
