import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/suppliers-overview — Phase 10 read-only oversight of the
 * supplier roster + per-supplier PO performance. Mirrors `reference/proto/
 * principal-suppliers.jsx` data contract.
 *
 * Distinct from /api/operation/suppliers (the editable CRUD endpoint used by
 * the procurement admin flow): this is an observation surface — supplier
 * cards + recent-12-PO drawer for the dealer/finance/operation reads.
 * Suffix `-overview` keeps the two endpoints disambiguated.
 *
 * GET / — list with rolled-up PO stats per supplier (open / received /
 *         total). The PO scan is a single SELECT grouped client-side; the
 *         supplier count stays in the single digits in real-world data so
 *         no RPC needed.
 *
 * GET /:id/pos — recent 12 POs for the drawer view.
 *
 * 2026-05-19 — moved from /api/principal/suppliers.
 */
const operationSuppliersOverviewRouter = new Hono<AppEnv>();

operationSuppliersOverviewRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation/Principal only" });
  }
  await next();
});

operationSuppliersOverviewRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [suppliersRes, posRes] = await Promise.all([
    sb
      .from("suppliers")
      .select("id, name, contact, contact_email, lead_time, kind, cat_covered, portal_enabled, slug")
      .order("name"),
    sb
      .from("purchase_orders")
      .select("supplier_id, status, sup_status"),
  ]);
  if (suppliersRes.error) throw new HTTPException(500, { message: suppliersRes.error.message });
  if (posRes.error) throw new HTTPException(500, { message: posRes.error.message });

  // Group POs per supplier into open / received / total tallies.
  const tally = new Map<string, { open: number; received: number; total: number }>();
  (posRes.data ?? []).forEach((p) => {
    if (!p.supplier_id) return;
    const t = tally.get(p.supplier_id) ?? { open: 0, received: 0, total: 0 };
    t.total += 1;
    if (p.status === "received") t.received += 1;
    else if (p.status === "open") t.open += 1;
    tally.set(p.supplier_id, t);
  });

  const suppliers = (suppliersRes.data ?? []).map((s) => {
    const t = tally.get(s.id) ?? { open: 0, received: 0, total: 0 };
    return {
      id: s.id,
      name: s.name,
      contact: s.contact,
      contactEmail: s.contact_email,
      leadTime: s.lead_time,
      kind: s.kind, // own_logistics | factory_pickup
      catCovered: s.cat_covered ?? [],
      portalEnabled: s.portal_enabled,
      slug: s.slug,
      openPos: t.open,
      receivedPos: t.received,
      totalPos: t.total,
    };
  });

  return c.json({ suppliers });
});

operationSuppliersOverviewRouter.get("/:id/pos", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select("id, status, sup_status, eta_date, placed_at")
    .eq("supplier_id", id)
    .order("placed_at", { ascending: false, nullsFirst: false })
    .limit(12);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({
    pos: (data ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      supStatus: p.sup_status,
      etaDate: p.eta_date,
      placedAt: p.placed_at,
    })),
  });
});

export default operationSuppliersOverviewRouter;
