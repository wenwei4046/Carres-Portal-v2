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
 *
 * Money follows Houzs (YH, chat 2026-10-26): the Customer Consignment Order
 * carries each Unit's price and its own payments, and no Sales Order is used
 * (Houzs consignment-orders.ts:286-300, 2171-2310; consignment-notes.ts:13-14),
 * per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
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
type OrderLine = { price: number | string };
type OrderPayment = { amount: number | string };
const sen = (v: number | string) => Math.round(Number(v) * 100);

/**
 * Total, paid and balance per order, like Houzs's local_total / paid / balance
 * (Houzs consignment-orders.ts:286-300), per Weisiang's ruling (2026-10-22):
 * clear Carres rules, implement Houzs. Summed in sen so RM never drifts.
 */
export function orderMoney(lines: OrderLine[], payments: OrderPayment[]) {
  const total = lines.reduce((t, l) => t + sen(l.price), 0);
  const paid = payments.reduce((t, p) => t + sen(p.amount), 0);
  return { total: total / 100, paid: paid / 100, balance: (total - paid) / 100 };
}

router.get("/orders", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const rows = await read<Array<Record<string, unknown> & {
    customer_consignment_order_units: OrderLine[]; customer_consignment_order_payments: OrderPayment[];
  }>>(
    sb.from("customer_consignment_orders")
      .select("id, order_no, customer_name, customer_phone, customer_address, note, created_at, customer_consignment_order_units(price, sold_at, ops_stock_items(id, unit_code, sku, status, reserved_ref)), customer_consignment_order_payments(id, paid_at, method, amount, reference, note, created_at)")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  const orders = rows.map((o) => ({ ...o, ...orderMoney(o.customer_consignment_order_units, o.customer_consignment_order_payments) }));
  return c.json({ orders });
});

router.post("/orders", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({
    dealerId: uuid.nullable().default(null),
    customer: customer.default({}),
    lines: z.array(z.object({ unitId: uuid, price: z.number().nonnegative() })).min(1),
    note: z.string().optional(),
  }));
  return c.json(await rpc(c, "customer_consignment_order_create", {
    p_dealer_id: body.dealerId, p_customer: body.customer, p_lines: body.lines, p_note: body.note ?? null,
  }), 201);
});

const paymentBody = z.object({
  amount: z.number().positive(),
  method: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference: z.string().optional(),
  note: z.string().optional(),
});

/**
 * Add / remove routes for a payments ledger. Houzs keeps one on the Consignment
 * Order (consignment-orders.ts:2218-2310) and one on the Consignment Note
 * (consignment-notes.ts:1110-1160); Carres follows both per Weisiang's ruling
 * (2026-10-22): clear Carres rules, implement Houzs.
 */
function paymentRoutes(path: "orders" | "notes", addFn: string, deleteFn: string, idArg: string) {
  router.post(`/${path}/:id/payments`, requireOperationOrPrincipal, async (c) => {
    const id = uuid.safeParse(c.req.param("id"));
    if (!id.success) throw new HTTPException(400, { message: "id required" });
    const body = await parseBody(c, paymentBody);
    return c.json(await rpc(c, addFn, {
      [idArg]: id.data, p_amount: body.amount, p_method: body.method, p_paid_at: body.paidAt ?? null,
      p_reference: body.reference ?? null, p_note: body.note ?? null,
    }), 201);
  });
  router.delete(`/${path}/:id/payments/:paymentId`, requireOperationOrPrincipal, async (c) => {
    const id = uuid.safeParse(c.req.param("id"));
    const paymentId = uuid.safeParse(c.req.param("paymentId"));
    if (!id.success || !paymentId.success) throw new HTTPException(400, { message: "ids required" });
    return c.json(await rpc(c, deleteFn, { [idArg]: id.data, p_payment_id: paymentId.data }));
  });
}
paymentRoutes("orders", "customer_consignment_payment_add", "customer_consignment_payment_delete", "p_order_id");
paymentRoutes("notes", "consignment_note_payment_add", "consignment_note_payment_delete", "p_note_id");

// ── Consignment Note ──────────────────────────────────────────────────────────
router.get("/notes", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const rows = await read<Array<Record<string, unknown> & {
    consignment_note_units: OrderLine[]; consignment_note_payments: OrderPayment[];
  }>>(
    sb.from("consignment_notes")
      .select("id, note_no, order_id, customer_name, customer_phone, customer_address, delivery_date, note, created_at, customer_consignment_orders(order_no), consignment_note_units(price, sold_at, ops_stock_items(id, unit_code, sku, status, reserved_ref)), consignment_note_payments(id, paid_at, method, amount, reference, note, created_at)")
      .order("created_at", { ascending: false })
      .limit(500),
  );
  // Note money, like Houzs's Note lines and Note payments (consignment-notes.ts:445,465, 1074-1160).
  const notes = rows.map((n) => ({ ...n, ...orderMoney(n.consignment_note_units, n.consignment_note_payments) }));
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
    /** unitId -> price; needed on a blank Note (Houzs consignment-notes.ts:445,465). */
    prices: z.record(uuid, z.number().nonnegative()).optional(),
  }));
  return c.json(await rpc(c, "consignment_note_create", {
    p_order_id: body.orderId, p_dealer_id: body.dealerId, p_customer: body.customer, p_units: body.unitIds,
    p_delivery_date: body.deliveryDate ?? null, p_note: body.note ?? null, p_prices: body.prices ?? null,
  }), 201);
});

/**
 * Units sold at the customer: sold against their Customer Consignment Order
 * line, or against the Note line on a blank Note; no Sales Order. Follows Houzs consignment-notes.ts:13-14 per Weisiang's
 * ruling (2026-10-22): clear Carres rules, implement Houzs.
 */
router.post("/notes/sold", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ unitIds: z.array(uuid).min(1) }));
  return c.json(await rpc(c, "consignment_note_mark_sold", { p_units: body.unitIds }));
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
