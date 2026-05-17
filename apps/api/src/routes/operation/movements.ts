import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { listMovementsQuery, type ListMovementsQuery } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/movements — Phase 4 M4 backend movements log.
 *
 * Endpoint implemented in this task (M4 Task 3):
 *   GET / — list `stock_movements` with 5 filters + period chips + LIMIT 200
 *
 * Per spec §18.6 OperationMovements page:
 *   • 5 filter selects: Warehouse / Category / SKU / Kind / Search (ref+note).
 *   • 5 period chips: 7d / 30d (default) / 90d / All / Custom (from+to).
 *   • Sorted by occurred_at desc, capped at 200 (P1=A "no pagination yet"
 *     2026-05-04 plan-eng-review). The frontend exports CSV client-side from
 *     this same payload, so 200 is also the export ceiling.
 *
 * Filter implementation notes:
 *   • category → SKU prefix `<category>:%`. Project SKU convention is
 *     `cat:model[:variant]`, all lowercase, colon-separated (see seed.sql
 *     `mattress:carres-cloud:King`, `bedframe:l1202f:Queen`, `sofa:harbour:preset:3-seater`).
 *     Migration 0019 §17.2 D1 comment confirms: "sku_category derived from sku
 *     format `cat:model` per proto's `s.sku.split(":")[0]` convention".
 *   • search → PostgREST `.or("ref.ilike.%X%,note.ilike.%X%")`. Input is gated
 *     by zod regex whitelist (Unicode letters/numbers/space/underscore/dash,
 *     1-100 chars) so PostgREST string interpolation is injection-safe.
 *     This closes the /review carry-forward `phase-4-or-filter-harden`.
 *   • period → translated to `.gte("occurred_at", isoCutoff)` server-side
 *     (supabase-js doesn't support raw `now() - interval`, so we compute the
 *     JS Date once per request). For 'custom': `.gte(from)` + `.lt(to)`.
 *
 * Pattern: matches sibling operation/orders.ts list endpoint (zod safeParse on
 * c.req.query() + supabase chain).
 */
const operationMovementsRouter = new Hono<AppEnv>();

// Inline operation-only guard — fast 403 before any Supabase round-trip.
operationMovementsRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation") {
    throw new HTTPException(403, { message: "operation only" });
  }
  await next();
});

const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Compute ISO cutoff `now - N days` for `.gte("occurred_at", ...)`. */
function periodCutoffIso(period: "7d" | "30d" | "90d"): string {
  return new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000).toISOString();
}

operationMovementsRouter.get("/", async (c) => {
  // Parse + validate query params. zod fills in defaults when keys are absent.
  const parsed = listMovementsQuery.safeParse({
    warehouseId: c.req.query("warehouseId") ?? undefined,
    category: c.req.query("category") ?? undefined,
    sku: c.req.query("sku") ?? undefined,
    kind: c.req.query("kind") ?? undefined,
    search: c.req.query("search") ?? undefined,
    period: c.req.query("period") ?? undefined,
    from: c.req.query("from") ?? undefined,
    to: c.req.query("to") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const data: ListMovementsQuery = parsed.data;

  // Custom period requires both from+to. Cross-field check that doesn't fit
  // cleanly inside the zod schema (defaults + optional from/to), so it lives
  // here. Returns the same 422 invalid_query shape.
  if (data.period === "custom" && (!data.from || !data.to)) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: "period=custom requires from and to" },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("stock_movements")
    .select("id, sku, warehouse_id, qty, kind, ref, note, by_role, occurred_at");

  if (data.warehouseId) q = q.eq("warehouse_id", data.warehouseId);

  // category → SKU prefix `<category>:%` (project SKU convention `cat:model:variant`).
  if (data.category !== "all") q = q.like("sku", `${data.category}:%`);

  // sku partial match, case insensitive.
  if (data.sku) q = q.ilike("sku", `%${data.sku}%`);

  if (data.kind !== "all") q = q.eq("kind", data.kind);

  // search → ref OR note ilike. Regex-validated input is injection-safe.
  if (data.search) {
    q = q.or(`ref.ilike.%${data.search}%,note.ilike.%${data.search}%`);
  }

  // period → occurred_at filter.
  if (data.period === "custom") {
    // Both from+to validated above. Use .gte(from) AND .lt(to) — half-open
    // interval is the conventional "last-day-inclusive" treatment for date
    // pickers.
    q = q.gte("occurred_at", data.from!).lt("occurred_at", data.to!);
  } else if (data.period !== "all") {
    q = q.gte("occurred_at", periodCutoffIso(data.period));
  }

  q = q.order("occurred_at", { ascending: false }).limit(200);

  const { data: rows, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ rows: rows ?? [], limit: 200 });
});

export default operationMovementsRouter;
