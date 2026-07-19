import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  inviteDealerInput,
  setDealerStatusInput,
  updateDealerInput,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/principal/dealers — Principal dealer admin (list + detail + mutations).
 *
 * GET / — list with rolled-up stats (order_count, gmv, outstanding) via
 *   `dealers_with_stats_list` RPC. RPC is SECURITY DEFINER + manual
 *   `is_principal()` check; we belt-and-brace with a same-role guard for
 *   fast 403s without a Supabase round-trip.
 *
 * GET /:id — dealer detail + last 8 orders. Recent orders are computed
 *   client-side from embedded `order_lines/order_addons` (no extra RPC).
 *
 * POST /invite — idempotent dealer creation + new_dealer approval.
 * POST /:id/status — suspend/reactivate (active|suspended only).
 *
 * Error contract mirrors approvals.ts: SQLSTATE → HTTP status with stable
 * `code` in the body the frontend can branch on. Shared mapPgError +
 * parseJsonBody come from lib/route-helpers (Pre-M4 B1 extract).
 */
const principalDealersRouter = new Hono<AppEnv>();

// Inline principal-only guard (matches dashboard.ts/approvals.ts pattern).
principalDealersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  await next();
});

// ----- GET / list -----
principalDealersRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("dealers_with_stats_list");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // 2026-07-19 (Loo) — a showroom is Carres' OWN store, a dealer is an external
  // reseller, and HQ lists them on two separate pages. `dealers_with_stats_list`
  // predates the split and returns no `channel`, so pull it (plus the outlet
  // roll-up the Dealers page shows) alongside rather than reshaping the RPC's
  // RETURNS TABLE — both selects are RLS-scoped and tiny (one row per org).
  //
  // FAIL CLOSED on either read. If we swallowed the error the response would
  // still be a 200 with every store silently reclassified as a plain dealer
  // and 0 outlets — the Showrooms page would render "No showrooms" (Loo's own
  // stores gone from the portal) and every dealer row would raise a false
  // "no outlet" alarm. A visible error beats confidently wrong data.
  const [chanRes, outletRes] = await Promise.all([
    sb.from("dealers").select("id, channel"),
    sb.from("outlets").select("dealer_id"),
  ]);
  const joinErr = chanRes.error ?? outletRes.error;
  if (joinErr) {
    const m = mapPgError(joinErr);
    return c.json(m.body, m.status);
  }
  const chanRows = chanRes.data;
  const outletRows = outletRes.data;
  const channelById = new Map<string, string>(
    (chanRows ?? []).map((r) => [r.id as string, (r.channel as string) ?? "dealer"]),
  );
  const outletCountById = new Map<string, number>();
  for (const o of outletRows ?? []) {
    const k = o.dealer_id as string;
    outletCountById.set(k, (outletCountById.get(k) ?? 0) + 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dealers = (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    region: d.region,
    contact: d.contact,
    status: d.status,
    joinedDate: d.joined_date,
    creditLimit: Number(d.credit_limit ?? 0),
    paymentTerms: d.payment_terms ?? "NET 30",
    depositBalance: Number(d.deposit_balance ?? 0),
    orderCount: Number(d.order_count ?? 0),
    gmv: Number(d.gmv ?? 0),
    outstanding: Number(d.outstanding ?? 0),
    // Unknown id → 'dealer', matching the column's own DB default.
    channel: channelById.get(d.id) === "showroom" ? "showroom" : "dealer",
    outletCount: outletCountById.get(d.id) ?? 0,
  }));
  return c.json({ dealers });
});

// ----- GET /:id detail -----
principalDealersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  // 1. Fetch dealer (basic record + stats) via the legacy RPC.
  const { data: dealerRows, error: e1 } = await sb.rpc("dealer_with_stats", { p_id: id });
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!dealerRows || (Array.isArray(dealerRows) && dealerRows.length === 0)) {
    return c.json(
      { error: "not_found", code: "not_found", message: "Dealer not found" },
      404,
    );
  }
  const dealer = Array.isArray(dealerRows) ? dealerRows[0] : dealerRows;

  // 1b. dealer_with_stats RPC returns only the legacy columns. Pull the four
  // newer fields (address, ssm_code, contact_name, contact_phone — migrations
  // 0144/0145/0146) directly so the DealerDrawer editor can pre-fill them,
  // plus `channel` so the drawer knows whether it is showing an external
  // dealer or one of Carres' own showrooms (which carry no SSM / PIC).
  const { data: extra } = await sb
    .from("dealers")
    .select("address, ssm_code, contact_name, contact_phone, channel")
    .eq("id", id)
    .maybeSingle();
  // Always present, so the drawer's `channel` is never undefined; an absent
  // row falls back to 'dealer' (the column's DB default = the safe branch,
  // which just shows the full business-profile editor as before).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dealer as any).channel = extra?.channel === "showroom" ? "showroom" : "dealer";
  if (extra) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dealer as any).address       = extra.address ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dealer as any).ssm_code      = extra.ssm_code ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dealer as any).contact_name  = extra.contact_name ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dealer as any).contact_phone = extra.contact_phone ?? null;
  }

  // 2. Fetch last 8 orders with line/addon for total computation.
  const { data: ordRows, error: e2 } = await sb
    .from("orders")
    .select(
      "id, so, status, customer_name, paid, placed_at, order_lines(unit_price, qty), order_addons(unit_price, qty)",
    )
    .eq("dealer_id", id)
    .order("placed_at", { ascending: false })
    .limit(8);
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentOrders = (ordRows ?? []).map((o: any) => {
    const lineTotal = (o.order_lines ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, l: any) => s + Number(l.unit_price) * Number(l.qty),
      0,
    );
    const addonTotal = (o.order_addons ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, a: any) => s + Number(a.unit_price) * Number(a.qty),
      0,
    );
    return {
      id: o.id,
      so: o.so,
      status: o.status,
      customerName: o.customer_name,
      paid: Number(o.paid ?? 0),
      total: lineTotal + addonTotal,
    };
  });

  return c.json({ dealer, recentOrders });
});

// ----- POST /invite -----
principalDealersRouter.post("/invite", async (c) => {
  const parsed = await parseJsonBody(c, inviteDealerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("dealer_invite", {
    p_name: parsed.data.name,
    p_region: parsed.data.region,
    p_contact: parsed.data.contact,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data); // { dealer, approval, idempotent }
});

// ----- PATCH /:id ----- (2026-05-22, Loo)
// Principal-side dealer profile edit. Accepts a partial body — every field
// optional — and forwards only present keys to the UPDATE so partial saves
// don't clobber unrelated columns. `contactName` + `contactPhone` also
// rewrite the legacy `dealers.contact` text column ("name · phone") to keep
// the older readers (DealerRow tooltip etc.) consistent.
principalDealersRouter.patch("/:id", async (c) => {
  const parsed = await parseJsonBody(c, updateDealerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const id = c.req.param("id");
  const body = parsed.data;

  // Build a snake_case patch with only the keys the caller actually sent.
  const patch: Record<string, string> = {};
  if (body.name        !== undefined) patch.name = body.name;
  if (body.region      !== undefined) patch.region = body.region;
  if (body.address     !== undefined) patch.address = body.address;
  if (body.ssmCode     !== undefined) patch.ssm_code = body.ssmCode;
  if (body.contactName !== undefined) patch.contact_name = body.contactName;
  if (body.contactPhone !== undefined) patch.contact_phone = body.contactPhone;

  // Legacy `contact` text column mirrors contact_name + contact_phone for
  // back-compat reads. Recompute only when one of the two changed (otherwise
  // leave whatever was there — partial saves shouldn't blow away the cached
  // string).
  if (body.contactName !== undefined || body.contactPhone !== undefined) {
    const sbRead = userClient(c.env, c.var.auth.jwt);
    const { data: existing } = await sbRead
      .from("dealers")
      .select("contact_name, contact_phone")
      .eq("id", id)
      .maybeSingle();
    const finalName  = body.contactName  ?? existing?.contact_name  ?? "";
    const finalPhone = body.contactPhone ?? existing?.contact_phone ?? "";
    patch.contact = `${finalName} · ${finalPhone}`.trim();
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ ok: true, dealer: null });
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("dealers")
    .update(patch)
    .eq("id", id)
    .select("id, name, region, contact, address, ssm_code, contact_name, contact_phone")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, dealer: data });
});

// ----- POST /:id/status -----
principalDealersRouter.post("/:id/status", async (c) => {
  const parsed = await parseJsonBody(c, setDealerStatusInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("dealer_set_status", {
    p_dealer_id: c.req.param("id"),
    p_new_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ dealer: data });
});

export default principalDealersRouter;
