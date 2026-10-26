import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { deliveryOrderLookup } from "../../lib/delivery-order-lookup";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { fail, parseBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Delivery Returns + Load scan — migration 0716.
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff record Delivery Returns and mark DOs Delivered by load scan, the Houzs
 * way. This overturns Jess's Delivery MASTER §6.1 (signed DO + photo before
 * Delivered), §7 (refund/restock rejected, no return register) and §8 (no
 * Delivery Returns destination); Jess was not part of this decision.
 * Every write is one SECURITY DEFINER door; this router only reads and passes
 * through. Refund status is a status only — Finance owns the money.
 */
const router = new Hono<AppEnv>();
const uuid = z.string().uuid();

router.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("delivery_returns")
    .select(
      "id, return_no, created_at, reason, refund_status, refund_status_at, warehouses(name), ops_delivery_orders(do_number), orders(so, customer_name), delivery_return_units(ops_stock_items(unit_code, sku)), delivery_return_lines(qty_returned, order_lines(sku))",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return fail(c, error);
  return c.json({ returns: data ?? [] });
});

router.get("/sites", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("warehouses").select("id, name").order("name");
  if (error) return fail(c, error);
  return c.json({ sites: data ?? [] });
});

/**
 * What a delivered DO can give back. A DO that lists its exact Units (the 0424
 * snapshot, or its delivered attempt's Units, 0344) returns by Unit. A DO with
 * no Unit list returns by DO line and qty. Follows Houzs
 * frontend/src/pages/scm-v2/DeliveryReturnFromDo.tsx:8-17 per Weisiang's
 * ruling (2026-10-22): clear Carres rules, implement Houzs (YH, 2026-10-26).
 */
router.get("/delivered-units", requireOperationOrPrincipal, async (c) => {
  const given = (c.req.query("do") ?? "").trim();
  if (!given) throw new HTTPException(400, { message: "do required" });
  const sb = userClient(c.env, c.var.auth.jwt);
  const look = deliveryOrderLookup(given);
  const { data: doc, error } = await sb
    .from("ops_delivery_orders")
    .select("id, do_number, order_id, delivery_order_units(ops_stock_items(id, unit_code, sku, status, sold_order_id))")
    .eq(look.column, look.value)
    .is("voided_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail(c, error);
  if (!doc) return c.json({ error: "not_found", message: `${given} is not a Delivery Order` }, 404);
  type Unit = { id: string; unit_code: string; sku: string; status: string; sold_order_id: string | null };
  const { data: attempts, error: aErr } = await sb
    .from("delivery_attempts")
    .select("delivery_attempt_units(outcome, ops_stock_items(id, unit_code, sku, status, sold_order_id))")
    .eq("order_id", doc.order_id)
    .eq("do_number", doc.do_number);
  if (aErr) return fail(c, aErr);
  const snapshot = ((doc.delivery_order_units ?? []) as unknown as { ops_stock_items: Unit | null }[]).map((u) => u.ops_stock_items);
  const attempted = ((attempts ?? []) as unknown as { delivery_attempt_units: { outcome: string; ops_stock_items: Unit | null }[] }[])
    .flatMap((a) => a.delivery_attempt_units.filter((u) => u.outcome === "delivered").map((u) => u.ops_stock_items));
  const exact = new Map<string, Unit>();
  for (const u of [...snapshot, ...attempted]) if (u) exact.set(u.id, u);
  const deliveryOrder = { id: doc.id, do_number: doc.do_number };
  if (exact.size > 0) {
    const units = [...exact.values()]
      .filter((u) => u.status === "sold" && u.sold_order_id === doc.order_id)
      .map(({ id, unit_code, sku }) => ({ id, unit_code, sku }));
    return c.json({ deliveryOrder, mode: "units" as const, units, lines: [] });
  }
  const { data: lines, error: lErr } = await sb
    .from("order_lines")
    .select("id, sku, qty, delivery_return_lines(qty_returned)")
    .eq("order_id", doc.order_id)
    .order("created_at");
  if (lErr) return fail(c, lErr);
  const rows = ((lines ?? []) as unknown as { id: string; sku: string; qty: number; delivery_return_lines: { qty_returned: number }[] }[])
    .map((l) => {
      const returned = l.delivery_return_lines.reduce((n, r) => n + r.qty_returned, 0);
      return { id: l.id, sku: l.sku, qty: l.qty, returned, remaining: Math.max(0, l.qty - returned) };
    });
  return c.json({ deliveryOrder, mode: "lines" as const, units: [], lines: rows });
});

router.post("/", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(
    c,
    z
      .object({
        deliveryOrderId: uuid,
        unitIds: z.array(uuid).optional(),
        lines: z.array(z.object({ orderLineId: uuid, qty: z.number().int().min(1) })).optional(),
        siteId: uuid,
        reason: z.string().trim().min(1, "Write the reason"),
      })
      .refine((b) => (b.unitIds?.length ?? 0) > 0 !== (b.lines?.length ?? 0) > 0, "Pick Units or lines"),
  );
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = body.lines?.length
    ? await sb.rpc("delivery_return_record_lines", {
        p_delivery_order_id: body.deliveryOrderId,
        p_lines: body.lines,
        p_warehouse_id: body.siteId,
        p_reason: body.reason,
      })
    : await sb.rpc("delivery_return_record", {
        p_delivery_order_id: body.deliveryOrderId,
        p_unit_ids: body.unitIds ?? [],
        p_warehouse_id: body.siteId,
        p_reason: body.reason,
      });
  if (error) return fail(c, error);
  return c.json(data, 201);
});

router.post("/:id/refund-status", requireOperationOrPrincipal, async (c) => {
  const id = uuid.safeParse(c.req.param("id"));
  if (!id.success) throw new HTTPException(404, { message: "Delivery Return not found" });
  const body = await parseBody(c, z.object({ status: z.enum(["pending", "refunded", "not_refunded"]) }));
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("delivery_return_set_refund_status", {
    p_return_id: id.data,
    p_status: body.status,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

/** Load scan: a DO No or a Unit ID marks its DO Delivered, no signature or photo. */
router.post("/load-scan", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ code: z.string().trim().min(1, "Scan a DO No or a Unit ID").max(80) }));
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("delivery_load_scan", { p_code: body.code });
  if (error) return fail(c, error);
  return c.json(data);
});

export default router;
