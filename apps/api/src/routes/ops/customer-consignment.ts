import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import { parseBody } from "../../lib/route-helpers";
import type { AppEnv } from "../../types";

/**
 * Customer Consignment Order · Consignment Note · Customer Consignment Return
 * — migration 0719.
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff send goods to customers on consignment and take unsold goods back, the
 * Houzs way. This overturns Jess's Purchasing MASTER rules (dealers do not take
 * consignment; no blank consignment documents) and COPY-STANDARD's ban on the
 * name "Consignment Note"; Jess was not part of this decision. The supplier-side
 * Consignment Order / Return (CRTN) are untouched. Every write is one SECURITY
 * DEFINER door on the Unit register; this router only reads and passes through.
 */
const router = new Hono<AppEnv>();
const uuid = z.string().uuid();
const customer = z.object({
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

function refusal(error: { code?: string; message?: string }): HTTPException {
  if (error.code === "42501") return new HTTPException(403, { message: "Forbidden" });
  if (error.code === "P0002") return new HTTPException(404, { message: error.message ?? "Not found" });
  if (error.code === "P0001" || error.code === "22023") {
    return new HTTPException(422, { message: error.message ?? "Refused" });
  }
  return new HTTPException(500, { message: error.message ?? "Consignment door failed" });
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

/** Dealers and Sites for the pickers. */
router.get("/choices", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [dealers, sites] = await Promise.all([
    read(sb.from("dealers").select("id, name").order("name")),
    read(sb.from("warehouses").select("id, name").order("name")),
  ]);
  return c.json({ dealers, sites });
});

/** Free Carres-owned Units at one Site — the goods that can go out. */
router.get("/units", requireOperationOrPrincipal, async (c) => {
  const site = uuid.safeParse(c.req.query("siteId"));
  if (!site.success) throw new HTTPException(400, { message: "siteId required" });
  const sb = userClient(c.env, c.var.auth.jwt);
  const units = await read(
    sb.from("ops_stock_items")
      .select("id, unit_code, sku")
      .eq("warehouse_id", site.data)
      .eq("status", "free")
      .eq("needs_repair", false)
      .eq("ownership", "carres_owned")
      .eq("identity_scope", "unit")
      .order("unit_code")
      .limit(5000),
  );
  return c.json({ units });
});

// ── Customer Consignment Order ────────────────────────────────────────────────
router.get("/orders", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const orders = await read(
    sb.from("customer_consignment_orders")
      .select("id, order_no, customer_name, customer_phone, customer_address, note, created_at, customer_consignment_order_units(ops_stock_items(id, unit_code, sku, status, reserved_ref))")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  return c.json({ orders });
});

router.post("/orders", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({
    dealerId: uuid.nullable().default(null),
    customer: customer.default({}),
    unitIds: z.array(uuid).min(1),
    note: z.string().optional(),
  }));
  return c.json(await rpc(c, "customer_consignment_order_create", {
    p_dealer_id: body.dealerId, p_customer: body.customer, p_units: body.unitIds, p_note: body.note ?? null,
  }), 201);
});

// ── Consignment Note ──────────────────────────────────────────────────────────
router.get("/notes", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const notes = await read(
    sb.from("consignment_notes")
      .select("id, note_no, customer_name, customer_phone, customer_address, delivery_date, note, created_at, customer_consignment_orders(order_no), consignment_note_units(ops_stock_items(id, unit_code, sku, status, reserved_ref))")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  return c.json({ notes });
});

router.post("/notes", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({
    orderId: uuid.nullable().default(null),
    dealerId: uuid.nullable().default(null),
    customer: customer.default({}),
    unitIds: z.array(uuid).min(1),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().optional(),
  }));
  return c.json(await rpc(c, "consignment_note_create", {
    p_order_id: body.orderId, p_dealer_id: body.dealerId, p_customer: body.customer, p_units: body.unitIds,
    p_delivery_date: body.deliveryDate ?? null, p_note: body.note ?? null,
  }), 201);
});

/** Units sold at the customer: they go to the Sales Order that takes the payment. */
router.post("/notes/sold", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ unitIds: z.array(uuid).min(1), so: z.number().int().positive() }));
  return c.json(await rpc(c, "consignment_note_mark_sold", { p_units: body.unitIds, p_so: body.so }));
});

// ── Customer Consignment Return ───────────────────────────────────────────────
router.get("/returns", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const returns = await read(
    sb.from("customer_consignment_returns")
      .select("id, return_no, warehouse_id, note, created_at, customer_consignment_return_units(ops_stock_items(unit_code, sku), consignment_notes(note_no, customer_name))")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  return c.json({ returns });
});

router.post("/returns", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ siteId: uuid, unitIds: z.array(uuid).min(1), note: z.string().optional() }));
  return c.json(await rpc(c, "customer_consignment_return_create", {
    p_warehouse_id: body.siteId, p_units: body.unitIds, p_note: body.note ?? null,
  }), 201);
});

export default router;
