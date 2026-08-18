import { Hono } from "hono";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * The Delivery Orders REGISTER — document truth, read-only
 * (blueprint card 2026-08-16; docs/delivery/MASTER.md §8).
 *
 *   GET /            — the register rows: every DO document (0356) with the
 *                      facts its columns print and the attempt history its
 *                      status is derived from.
 *   GET /:id         — one document, for the DO object page (Slice 2).
 *
 * A register finds documents; work lives in My Work / Team Work — so nothing
 * here computes an owner, an action or a due date, and nothing here writes.
 * Status is NOT computed server-side either: the ONE arithmetic is
 * `deliveryOrderStatusOf` in packages/shared (Law D), and the web calls it
 * over the facts this route returns.
 */
const deliveryOrdersRouter = new Hono<AppEnv>();

/** The order fields the register's columns print — nothing more. */
const ORDER_EMBED =
  "orders!inner(id, so, customer_name, customer_address_city, customer_address_state, delivery_date, delivery_date_tbd)";

deliveryOrdersRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  // `?order=<uuid>` scopes the list to one Sales Order — the SO object page's
  // "its DOs" read. Same shape, same arithmetic, one implementation.
  const orderScope = c.req.query("order") ?? null;

  let query = sb
    .from("ops_delivery_orders")
    .select(
      `id, order_id, do_number, issued_at, trip_groups, delivery_date, time_slot,
       logistics_partner, voided_at, void_reason, ${ORDER_EMBED}`,
    )
    .order("issued_at", { ascending: false })
    .limit(500);
  if (orderScope) query = query.eq("order_id", orderScope);

  const { data: rows, error } = await query;
  if (error) {
    return c.json({ error: "delivery_orders_read_failed", message: error.message }, 500);
  }

  const numbers = (rows ?? []).map((r) => r.do_number).filter(Boolean);
  let attempts: Array<{
    do_number: string | null;
    result: string;
    reason_key: string | null;
    recorded_at: string;
  }> = [];
  if (numbers.length > 0) {
    const res = await sb
      .from("delivery_attempts")
      .select("do_number, result, reason_key, recorded_at")
      .in("do_number", numbers);
    if (res.error) {
      return c.json(
        { error: "delivery_attempts_read_failed", message: res.error.message },
        500,
      );
    }
    attempts = res.data ?? [];
  }

  return c.json({ deliveryOrders: rows ?? [], attempts });
});

deliveryOrdersRouter.get("/:id", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");

  // Everything the object page's blocks render — facts other modules own,
  // read through their existing columns. This route writes nothing.
  // The param is the row id, or the document's own number (`DO-…`) so a
  // document number anywhere in the portal can be a door (§0.1: DO → DO).
  let query = sb
    .from("ops_delivery_orders")
    .select(
      `id, order_id, do_number, issued_at, trip_groups, delivery_date, time_slot,
       logistics_partner, voided_at, void_reason,
       orders!inner(id, so, customer_name, customer_phone, customer_emergency,
         customer_address, customer_address_city, customer_address_state,
         do_file_path, do_uploaded_at,
         pod_signature_url, pod_signed_by, pod_signed_at,
         do_number,
         order_lines(sku, qty))`,
    );
  query = /^do-/i.test(id) ? query.eq("do_number", id.toUpperCase()) : query.eq("id", id);
  const { data: row, error } = await query.maybeSingle();
  if (error) {
    return c.json({ error: "delivery_order_read_failed", message: error.message }, 500);
  }
  if (!row) {
    return c.json({ error: "not_found", message: "Delivery order not found" }, 404);
  }

  const orderId = (row as { order_id: string }).order_id;

  // Photos deliberately do NOT ride this payload: the existing
  // `GET /orders/:id/delivery-photos` door already signs and serves the ledger
  // (0280) and the page calls it — one reader path, never a second (Law D).
  const [attemptsRes, loansRes] = await Promise.all([
    sb
      .from("delivery_attempts")
      .select("do_number, result, reason_key, note, where_goods, recorded_at, recorded_by")
      .eq("do_number", row.do_number)
      .order("recorded_at", { ascending: true }),
    sb
      .from("ops_sofa_loans")
      .select("id, item_id, do_number, status, loaned_at, returned_at, loan_note_no")
      .eq("order_id", orderId),
  ]);
  if (attemptsRes.error) {
    return c.json(
      { error: "delivery_attempts_read_failed", message: attemptsRes.error.message },
      500,
    );
  }

  // Human words first, SKU mono second (card §5) — the same variant lookup the
  // DO print path uses; order_lines.sku has no FK to product_skus.
  const skus = ((row as { orders?: { order_lines?: Array<{ sku: string }> } }).orders
    ?.order_lines ?? []).map((l) => l.sku);
  const lineDescriptions: Record<string, string> = {};
  if (skus.length > 0) {
    const skuRes = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", skus);
    for (const r of skuRes.data ?? []) {
      const rec = r as { sku: string; variant: string | null };
      if (rec.variant) lineDescriptions[rec.sku] = rec.variant;
    }
  }

  return c.json({
    deliveryOrder: row,
    attempts: attemptsRes.data ?? [],
    loans: loansRes.data ?? [],
    lineDescriptions,
  });
});

export default deliveryOrdersRouter;
