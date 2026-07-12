import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/orders-feed — Phase 10 read-only cross-dealer feed of every
 * order. Mirrors `reference/proto/principal-views.jsx` L4-76.
 *
 * Distinct from /api/operation/orders (the kanban-driver for the Orders tab):
 * this is a flat filterable list, no kanban semantics, no actions. Suffix
 * `-feed` keeps the two endpoints disambiguated.
 *
 * GET /?dealer=&status=&q=&limit=
 *   - dealer: dealer_id filter (UUID) — narrow to one dealer
 *   - status: order_status enum value — place / proceed_order / delivered / cancelled
 *   - q: free-text match on SO# (sub-string) OR customer_name
 *   - limit: 1..500, defaults 200
 *
 * RLS on orders already allows operation + principal to see everything; the
 * inline guard is a fast 403 short-circuit before the Supabase round-trip.
 *
 * 2026-05-19 — moved from /api/principal/orders.
 */
const operationOrdersFeedRouter = new Hono<AppEnv>();

operationOrdersFeedRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation/Principal only" });
  }
  await next();
});

operationOrdersFeedRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const dealer = c.req.query("dealer");
  const status = c.req.query("status");
  const q = c.req.query("q")?.trim();
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "200", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);

  let qb = sb
    .from("orders")
    .select(
      "id, so, dealer_id, status, customer_name, paid, placed_at, order_lines(qty,unit_price), order_addons(qty,unit_price)",
    )
    .order("placed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (dealer) qb = qb.eq("dealer_id", dealer);
  if (status && status !== "all") qb = qb.eq("status", status);
  if (q) {
    // Match SO# (exact when numeric), customer name, AND each imported invoice
    // number (source_ref token, sanitised to invoice chars) — so searching a
    // single invoice finds the combined order too. Mirrors the orders list.
    const clauses = [`customer_name.ilike.%${q}%`];
    const refTerm = q.toUpperCase().replace(/[^A-Z0-9/-]/g, "");
    if (refTerm) clauses.push(`source_ref.cs.{${refTerm}}`);
    const asNum = Number.parseInt(q, 10);
    if (Number.isFinite(asNum)) clauses.push(`so.eq.${asNum}`);
    qb = qb.or(clauses.join(","));
  }
  const { data, error } = await qb;
  if (error) throw new HTTPException(500, { message: error.message });

  // Pull dealer names for the cards
  const dealerIds = Array.from(
    new Set((data ?? []).map((o) => o.dealer_id).filter(Boolean) as string[]),
  );
  const dealersRes = dealerIds.length
    ? await sb.from("dealers").select("id,name").in("id", dealerIds)
    : { data: [], error: null };
  if (dealersRes.error) throw new HTTPException(500, { message: dealersRes.error.message });
  const dealerMap = new Map<string, string>();
  (dealersRes.data ?? []).forEach((d) => dealerMap.set(d.id, d.name));

  const orders = (data ?? []).map((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineTotal = ((o.order_lines as any[]) ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, l: any) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0),
      0,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addonTotal = ((o.order_addons as any[]) ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, a: any) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0),
      0,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qtyTotal = ((o.order_lines as any[]) ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, l: any) => s + Number(l.qty ?? 0),
      0,
    );
    return {
      id: o.id,
      so: o.so,
      dealerId: o.dealer_id,
      dealerName: o.dealer_id ? dealerMap.get(o.dealer_id) ?? null : null,
      status: o.status,
      customerName: o.customer_name,
      paid: Number(o.paid ?? 0),
      total: lineTotal + addonTotal,
      qtyTotal,
      placedAt: o.placed_at,
    };
  });

  return c.json({ orders });
});

export default operationOrdersFeedRouter;
