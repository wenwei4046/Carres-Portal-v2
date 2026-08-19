import { Hono, type Context } from "hono";
import { z } from "zod";
import { DEMAND_PURPOSE_VALUES, isOpsManager } from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { myDuties } from "../../lib/duties";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * MANUAL PURCHASE — the request lane's doors
 * (CARD-2026-08-18-manual-purchase; docs/purchasing/MASTER.md §3).
 *
 *   GET  /               — the register: every request header with its lines,
 *                          destination and supplier names. Status is NOT
 *                          computed here: the ONE arithmetic is
 *                          `manualPurchaseStatusOf` in packages/shared (Law D)
 *                          and the web calls it over these facts.
 *   POST /               — the header. `why` is door-enforced non-blank
 *                          (0359); this route only relays the RPC's answer.
 *   POST /:id/lines      — ONE line. The workspace submits line by line so a
 *                          failed SKU keeps its row with the server's own
 *                          words while created lines stay created — the same
 *                          per-row contract the retired dialog proved.
 *   GET  /already-have   — ?sku=… → what is already on an open PO. `free`
 *                          deliberately does NOT live here: the workspace's
 *                          picker already carries it from the pick-items read
 *                          (P10's rule, called once) and a second free count
 *                          is a second answer waiting to disagree.
 *
 * The picker itself is REUSED, not rebuilt: the workspace calls the existing
 * `/api/operation/purchase/to-order/demand/pick-items`.
 */
const manualPurchaseRouter = new Hono<AppEnv>();

/** The approver is the Settings manager — the card names them one and the
 *  same gate (`ops_manager` duty or principal). `canApprove` decides what
 *  RENDERS (the money, the Approve row); `purchasing_decide_request`
 *  re-gates in SQL, which is the actual protection. */
async function canApprove(c: Context<AppEnv>): Promise<boolean> {
  const { role, email } = c.var.auth;
  return isOpsManager(role, email, await myDuties(c));
}

manualPurchaseRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: requests, error } = await sb
    .from("purchase_requests")
    .select(
      `id, req_no, purpose, destination_id, required_by, why, approval_required,
       approved_at, approved_by, refused_at, refused_by, refuse_reason,
       created_by, created_at`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const ids = (requests ?? []).map((r) => r.id as string);
  let lines: Array<Record<string, unknown>> = [];
  if (ids.length > 0) {
    const res = await sb
      .from("purchase_demands")
      .select(
        `id, request_id, sku, supplier_id, qty, approved_qty, issued_qty,
         remaining_qty, required_by, remark, po_id, cancelled_at, cancel_reason`,
      )
      .in("request_id", ids);
    if (res.error) {
      const m = mapPgError(res.error);
      return c.json(m.body, m.status);
    }
    lines = res.data ?? [];
  }

  // Names for the columns — read through the owners' tables, never stored
  // twice (Law B: a summary is read-only).
  const [dests, sups, users] = await Promise.all([
    sb.from("purchasing_destinations").select("id, name"),
    sb.from("suppliers").select("id, name"),
    sb.from("app_users").select("id, name"),
  ]);
  for (const r of [dests, sups, users]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }

  return c.json({
    requests: requests ?? [],
    lines,
    destinations: dests.data ?? [],
    suppliers: sups.data ?? [],
    users: users.data ?? [],
    canApprove: await canApprove(c),
  });
});

/**
 * One request, for the object detail (ui/MASTER §4.1 — ONE SCROLL, no tabs).
 * Money rides ONLY for the approver: the same request renders for both roles,
 * minus the money — never a permission error (card §4).
 */
manualPurchaseRouter.get("/detail/:id", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  const { data: request, error } = await sb
    .from("purchase_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!request) return c.json({ error: "not_found" }, 404);

  const { data: lines, error: lineErr } = await sb
    .from("purchase_demands")
    .select(
      `id, sku, supplier_id, qty, approved_qty, issued_qty, remaining_qty,
       required_by, remark, po_id, cancelled_at, cancel_reason`,
    )
    .eq("request_id", id);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }

  const approver = await canApprove(c);
  let costs: Record<string, number | null> = {};
  if (approver && (lines ?? []).length > 0) {
    const { data: skuRows } = await sb
      .from("product_skus")
      .select("sku, cost")
      .in("sku", (lines ?? []).map((l) => l.sku as string));
    costs = Object.fromEntries(
      (skuRows ?? []).map((s) => [s.sku as string, (s.cost as number | null) ?? null]),
    );
  }

  const [dests, sups, users] = await Promise.all([
    sb.from("purchasing_destinations").select("id, name"),
    sb.from("suppliers").select("id, name"),
    sb.from("app_users").select("id, name"),
  ]);

  return c.json({
    request,
    lines: (lines ?? []).map((l) => ({
      ...l,
      // The approver's money — absent entirely for everyone else, so the
      // same screen renders minus the money, never a permission error.
      ...(approver ? { unit_cost: costs[l.sku as string] ?? null } : {}),
    })),
    destinations: dests.data ?? [],
    suppliers: sups.data ?? [],
    users: users.data ?? [],
    canApprove: approver,
  });
});

const decideBody = z.object({
  decision: z.enum(["approve", "refuse"]),
  reason: z.string().max(1000).nullish(),
  cuts: z
    .array(z.object({ id: z.string().uuid(), qty: z.number().int().min(0) }))
    .nullish(),
});

manualPurchaseRouter.post("/:id/decide", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = decideBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { decision, reason, cuts } = parsed.data;

  const { data, error } = await sb.rpc("purchasing_decide_request", {
    p_id: id,
    p_decision: decision,
    p_reason: reason ?? null,
    p_cuts: cuts && cuts.length > 0 ? cuts : null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const headerBody = z.object({
  purpose: z.enum(DEMAND_PURPOSE_VALUES as [string, ...string[]]),
  destinationId: z.string().uuid(),
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  why: z.string().min(1).max(1000),
});

manualPurchaseRouter.post("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = headerBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { purpose, destinationId, requiredBy, why } = parsed.data;

  const { data, error } = await sb.rpc("purchasing_create_request", {
    p_purpose: purpose,
    p_destination_id: destinationId,
    p_why: why,
    p_required_by: requiredBy ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const lineBody = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1),
  destinationId: z.string().uuid(),
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(500).nullish(),
  purpose: z.enum(DEMAND_PURPOSE_VALUES as [string, ...string[]]),
});

manualPurchaseRouter.post("/:id/lines", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const requestId = c.req.param("id");
  if (!z.string().uuid().safeParse(requestId).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = lineBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { sku, qty, destinationId, requiredBy, note, purpose } = parsed.data;

  // THERE IS NO `supplier` KEY AND THERE MAY NEVER BE ONE — the RPC derives
  // it from the SKU (Jess, 2026-08-03; kept from the retired dialog's route).
  const { data, error } = await sb.rpc("purchasing_create_demand", {
    p_sku: sku,
    p_qty: qty,
    p_destination_id: destinationId,
    p_required_by: requiredBy ?? null,
    p_remark: note ?? null,
    p_purpose: purpose,
    p_request_id: requestId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

manualPurchaseRouter.get("/already-have", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const sku = c.req.query("sku");
  if (!sku) {
    return c.json({ error: "sku_required", code: "invalid_param" }, 400);
  }

  // Open cover only: a line on a PO that is still open, less what already
  // arrived. The first PO (earliest arrival) is named on the row so the
  // requester can see WHICH order already carries their goods.
  const { data: poLines, error } = await sb
    .from("purchase_order_lines")
    .select("po_id, qty, received_qty, purchase_orders!inner(id, status, eta_date)")
    .eq("sku", sku)
    .eq("purchase_orders.status", "open");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  let alreadyOnPo = 0;
  let firstPo: { id: string; eta: string | null } | null = null;
  for (const l of poLines ?? []) {
    const open = Math.max(0, Number(l.qty ?? 0) - Number(l.received_qty ?? 0));
    if (open <= 0) continue;
    alreadyOnPo += open;
    const po = l.purchase_orders as unknown as { id: string; eta_date: string | null };
    if (!firstPo || (po.eta_date ?? "9999") < (firstPo.eta ?? "9999")) {
      firstPo = { id: po.id, eta: po.eta_date ?? null };
    }
  }

  return c.json({ sku, alreadyOnPo, firstPo });
});

export default manualPurchaseRouter;
