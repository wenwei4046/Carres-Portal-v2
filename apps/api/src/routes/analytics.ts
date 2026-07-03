import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * POS-parity (MAINTAIN → Sales analysis) — the flattened analytics feed.
 *
 * GET /api/analytics/sales?months=N  (principal only)
 *
 * Returns per-ORDER + per-LINE analytic rows for the client-side summarizers
 * (2990s pattern: the server flattens + joins, the page aggregates). Window =
 * last N months by placed_at (default 12, 1..60); cancelled orders excluded.
 *
 * Money semantics:
 *   - revenue     = order_lines Σ(unit_price×qty) + NON-delivery addons
 *   - deliveryFee = the DELIVERY / DELIVERY_CROSS / DELIVERY_ADD addons
 *   - cogs        = Σ(product_skus.cost×qty) over lines whose sku matched AND
 *                   carries a cost; `cogsComplete` says every line matched, so
 *                   margin is only quoted where it's real.
 * Demographics come straight off the order row (0200) — null on rows placed
 * before the columns existed; the page surfaces coverage.
 */

const DELIVERY_ADDON_KEYS = new Set(["DELIVERY", "DELIVERY_CROSS", "DELIVERY_ADD"]);

type LineRow = { sku: string; qty: number; unit_price: string | number };
type AddonRow = { addon_key: string; qty: number; unit_price: string | number };
type OrderRow = {
  id: string;
  so: number;
  status: string;
  channel: string;
  placed_at: string;
  paid: string | number;
  customer_race: string | null;
  customer_gender: string | null;
  customer_birthday: string | null;
  order_lines: LineRow[] | null;
  order_addons: AddonRow[] | null;
};
type SkuRow = {
  sku: string;
  cost: string | number | null;
  product_models: { name: string; category: string } | null;
};

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const analyticsRouter = new Hono<AppEnv>();

analyticsRouter.get("/sales", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }

  const monthsRaw = Number.parseInt(new URL(c.req.url).searchParams.get("months") ?? "12", 10);
  const months = Number.isFinite(monthsRaw) ? Math.min(60, Math.max(1, monthsRaw)) : 12;
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  const fromIso = from.toISOString();

  const sb = userClient(c.env, auth.jwt);

  const [ordersRes, skusRes] = await Promise.all([
    sb
      .from("orders")
      .select(
        "id, so, status, channel, placed_at, paid, customer_race, customer_gender, customer_birthday, order_lines(sku, qty, unit_price), order_addons(addon_key, qty, unit_price)",
      )
      .neq("status", "cancelled")
      .gte("placed_at", fromIso)
      .order("placed_at", { ascending: true }),
    sb.from("product_skus").select("sku, cost, product_models(name, category)"),
  ]);
  if (ordersRes.error) throw new HTTPException(500, { message: ordersRes.error.message });
  if (skusRes.error) throw new HTTPException(500, { message: skusRes.error.message });

  const skuIndex = new Map<string, { cost: number | null; model: string; category: string }>();
  for (const s of (skusRes.data ?? []) as unknown as SkuRow[]) {
    skuIndex.set(s.sku, {
      cost: s.cost === null || s.cost === undefined ? null : num(s.cost),
      model: s.product_models?.name ?? s.sku,
      category: s.product_models?.category ?? "other",
    });
  }

  const orders: unknown[] = [];
  const lines: unknown[] = [];
  for (const o of ((ordersRes.data ?? []) as unknown as OrderRow[])) {
    const oLines = o.order_lines ?? [];
    const oAddons = o.order_addons ?? [];
    const lineRevenue = oLines.reduce((s, l) => s + num(l.unit_price) * l.qty, 0);
    let addonRevenue = 0;
    let deliveryFee = 0;
    for (const a of oAddons) {
      const amt = num(a.unit_price) * a.qty;
      if (DELIVERY_ADDON_KEYS.has(a.addon_key)) deliveryFee += amt;
      else addonRevenue += amt;
    }

    let cogs = 0;
    let cogsComplete = oLines.length > 0;
    for (const l of oLines) {
      const info = skuIndex.get(l.sku);
      if (info && info.cost !== null) cogs += info.cost * l.qty;
      else cogsComplete = false;

      lines.push({
        so: o.so,
        placedAt: o.placed_at,
        sku: l.sku,
        model: info?.model ?? l.sku,
        category: info?.category ?? "other",
        qty: l.qty,
        revenue: num(l.unit_price) * l.qty,
        cost: info && info.cost !== null ? info.cost * l.qty : null,
        race: o.customer_race,
        gender: o.customer_gender,
        birthday: o.customer_birthday,
      });
    }

    orders.push({
      so: o.so,
      placedAt: o.placed_at,
      channel: o.channel,
      revenue: lineRevenue + addonRevenue,
      deliveryFee,
      paid: num(o.paid),
      cogs: cogsComplete ? cogs : null,
      race: o.customer_race,
      gender: o.customer_gender,
      birthday: o.customer_birthday,
    });
  }

  return c.json({ months, orders, lines });
});

export default analyticsRouter;
