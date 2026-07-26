import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  assignDealerBdInput,
  computeBdCommission,
  setBdMethodInput,
  setBdPositionInput,
  computeCommission,
  hrAssignSalespersonInput,
  hrReportQuerySchema,
  setBdRateInput,
  setCommissionSchemeInput,
  setMilestonesInput,
  setModelRateInput,
  setModelTiersInput,
  setStaffRateInput,
  type BdDealer,
  type BdDealerLine,
  type BdRateRow,
  type BdUser,
  type CommissionMethod,
  type CommissionConfig,
  type CommissionLine,
  type CommissionStaff,
  type DealerOrderAgg,
} from "@carres/shared";
import { requireHr } from "../lib/auth-guards";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * 0244/0245/0246 — HR commission portal (2026-07-25, Loo).
 *
 * Commission CALCULATION only (no base payroll). All order data reaches HR
 * through the single gated SECURITY DEFINER RPC `hr_commission_source`
 * (showroom-channel projection; addons/service lines pre-excluded = pure item
 * revenue). Config writes go through RLS ('hr'/'principal' only) via the user
 * JWT — never service_role. The math itself is the pure `computeCommission`
 * in @carres/shared, so a web preview can never drift from the API figure.
 */
const hrRouter = new Hono<AppEnv>();

interface HrSource {
  staff: CommissionStaff[];
  models: { id: string; name: string; category: string }[];
  lines: CommissionLine[];
  unattributed: unknown[];
  /** 0265 — imported archive orders (source_system='autocount') that will
   *  never have a salesperson. Excluded from `unattributed` so the worklist
   *  can actually reach zero; surfaced as a count so the UI says so aloud. */
  legacyUnattributed?: number;
  // 0250/0251 — BD commission
  bdUsers?: BdUser[];
  bdMethod?: CommissionMethod;
  dealers?: BdDealer[];
  dealerOrders?: DealerOrderAgg[];
  dealerLines?: BdDealerLine[];
  config: CommissionConfig & { bdRates?: BdRateRow[] };
}

/** GET /api/hr/report?year=2026&month=7 — the computed month report. */
hrRouter.get("/report", requireHr, async (c) => {
  const parsed = hrReportQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    throw new HTTPException(422, { message: "invalid year/month" });
  }
  const { year, month } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_commission_source", {
    p_year: year,
    p_month: month,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    throw new HTTPException(500, { message: error.message });
  }

  const source = data as unknown as HrSource;
  const report = computeCommission(source.staff, source.lines, source.config);

  // O1 Overview headline. Deliberately NOT report.totalBasis — that is the
  // PERCENTAGE-method basis only, so a store on the per-model method would
  // report RM 0 sold, which is the kind of number that quietly teaches an
  // operator to distrust the page. `lines` is already the showroom-channel,
  // non-service, non-cancelled slice for the month, attributed or not.
  const monthSold = {
    amount: source.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
    orderCount: new Set(source.lines.map((l) => l.orderId)).size,
  };
  const bdReport = computeBdCommission({
    users: source.bdUsers ?? [],
    dealers: source.dealers ?? [],
    orders: source.dealerOrders ?? [],
    rates: source.config.bdRates ?? [],
    method: source.bdMethod,
    dealerLines: source.dealerLines,
    modelRates: source.config.modelRates,
    modelTiers: source.config.modelTiers,
    milestones: source.config.milestones,
  });

  return c.json({
    year,
    month,
    report,
    bdReport,
    bdMethod: source.bdMethod ?? "percentage",
    unattributed: source.unattributed,
    // Pre-0265 Worker/DB → key absent → 0, i.e. "nothing was excluded".
    legacyUnattributed: source.legacyUnattributed ?? 0,
    monthSold,
    staff: source.staff,
    models: source.models,
    bdUsers: source.bdUsers ?? [],
    dealers: source.dealers ?? [],
    config: source.config,
  });
});

/** POST /api/hr/config/bd-rate — append an effective-dated BD rate row. */
hrRouter.post("/config/bd-rate", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setBdRateInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { userId, pct, effectiveFrom } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("bd_commission_rates").upsert(
    {
      user_id: userId,
      pct,
      effective_from: effectiveFrom ?? new Date().toISOString().slice(0, 10),
      updated_by: c.var.auth.id,
    },
    { onConflict: "user_id,effective_from" },
  );
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

/** POST /api/hr/config/bd-method — the ONE global BD method switch (0251). */
hrRouter.post("/config/bd-method", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setBdMethodInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("bd_commission_config").upsert(
    { id: true, method: parsed.data.method, updated_by: c.var.auth.id },
    { onConflict: "id" },
  );
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

/** POST /api/hr/config/bd-position — BD Executive | CBO per BD user (0251). */
hrRouter.post("/config/bd-position", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setBdPositionInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("bd_profiles").upsert(
    { user_id: parsed.data.userId, position: parsed.data.position, updated_by: c.var.auth.id },
    { onConflict: "user_id" },
  );
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

/**
 * POST /api/hr/assign-dealer-bd — set/clear a dealer's BD owner. Portfolio
 * assignment drives money — the audited RPC, never a raw dealers update.
 */
hrRouter.post("/assign-dealer-bd", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = assignDealerBdInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_assign_dealer_bd", {
    p_dealer_id: parsed.data.dealerId,
    p_user_id: parsed.data.userId,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    if (error.message.includes("dealer_not_found")) {
      throw new HTTPException(404, { message: "dealer not found" });
    }
    if (error.message.includes("not_a_dealer")) {
      throw new HTTPException(422, { message: "showrooms have no BD owner" });
    }
    if (error.message.includes("bd_user_mismatch")) {
      throw new HTTPException(422, { message: "target user is not a BD account" });
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/config/scheme — set the method for a store / one outlet. */
hrRouter.post("/config/scheme", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setCommissionSchemeInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { dealerId, outletId, method } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  // partial unique indexes can't drive PostgREST upsert — replace instead
  let del = sb.from("commission_scheme_config").delete().eq("dealer_id", dealerId);
  del = outletId === null ? del.is("outlet_id", null) : del.eq("outlet_id", outletId);
  const { error: delErr } = await del;
  if (delErr) throw new HTTPException(500, { message: delErr.message });

  const { error } = await sb.from("commission_scheme_config").insert({
    dealer_id: dealerId,
    outlet_id: outletId,
    method,
    updated_by: c.var.auth.id,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

/** POST /api/hr/config/staff-rate — append an effective-dated rate row. */
hrRouter.post("/config/staff-rate", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setStaffRateInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { salespersonId, pct, effectiveFrom } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("staff_commission_rates").upsert(
    {
      salesperson_id: salespersonId,
      pct,
      effective_from: effectiveFrom ?? new Date().toISOString().slice(0, 10),
      updated_by: c.var.auth.id,
    },
    { onConflict: "salesperson_id,effective_from" },
  );
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

/** POST /api/hr/config/model-rate — upsert (or null = remove) a per-unit rate. */
hrRouter.post("/config/model-rate", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setModelRateInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { modelId, perUnitAmount } = parsed.data;
  const program = parsed.data.program ?? "staff";

  const sb = userClient(c.env, c.var.auth.jwt);
  if (perUnitAmount === null) {
    const { error } = await sb
      .from("model_commission_rates")
      .delete()
      .eq("model_id", modelId)
      .eq("program", program);
    if (error) throw new HTTPException(500, { message: error.message });
  } else {
    const { error } = await sb.from("model_commission_rates").upsert(
      {
        model_id: modelId,
        program,
        per_unit_amount: perUnitAmount,
        updated_by: c.var.auth.id,
      },
      { onConflict: "model_id,program" },
    );
    if (error) throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/config/model-tiers — replace one model's tier ladder. */
hrRouter.post("/config/model-tiers", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setModelTiersInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { modelId, tiers } = parsed.data;
  const program = parsed.data.program ?? "staff";

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error: delErr } = await sb
    .from("model_commission_tiers")
    .delete()
    .eq("model_id", modelId)
    .eq("program", program);
  if (delErr) throw new HTTPException(500, { message: delErr.message });
  if (tiers.length > 0) {
    const { error } = await sb.from("model_commission_tiers").insert(
      tiers.map((t) => ({
        model_id: modelId,
        program,
        threshold_qty: t.thresholdQty,
        bonus_amount: t.bonusAmount,
      })),
    );
    if (error) throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/config/milestones — replace the overall milestone list. */
hrRouter.post("/config/milestones", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setMilestonesInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { milestones } = parsed.data;
  const program = parsed.data.program ?? "staff";

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error: delErr } = await sb
    .from("commission_milestones")
    .delete()
    .eq("program", program); // replace is scoped to ONE program's list
  if (delErr) throw new HTTPException(500, { message: delErr.message });
  if (milestones.length > 0) {
    const { error } = await sb.from("commission_milestones").insert(
      milestones.map((m) => ({
        category: m.category,
        program,
        threshold_qty: m.thresholdQty,
        bonus_amount: m.bonusAmount,
      })),
    );
    if (error) throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/**
 * POST /api/hr/assign — attribute an unattributed order to a salesperson.
 * Attribution drives commission money, so it is the audited RPC
 * `hr_assign_salesperson` (order_history + audit_log rows), never a raw update.
 */
hrRouter.post("/assign", requireHr, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = hrAssignSalespersonInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_assign_salesperson", {
    p_order_id: parsed.data.orderId,
    p_salesperson_id: parsed.data.salespersonId,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    if (error.message.includes("order_not_found")) {
      throw new HTTPException(404, { message: "order not found" });
    }
    if (error.message.includes("salesperson_mismatch")) {
      throw new HTTPException(422, { message: "salesperson not in this order's store" });
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

export default hrRouter;
