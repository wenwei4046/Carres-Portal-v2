import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  assignDealerBdInput,
  setBdMethodInput,
  setBdPositionInput,
  hrReportQuerySchema,
  setBdRateInput,
  setCommissionSchemeInput,
  setMilestonesInput,
  setModelRateInput,
  setModelTiersInput,
  setStaffRateInput,
} from "@carres/shared";
import { requireHr } from "../lib/auth-guards";
import { loadCommissionMonth } from "../lib/commission-month";
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
  // HR-P5: this compute path is SHARED with `POST /api/hr/runs/close`. Closing a
  // month freezes the engine's output forever, so the figures reviewed here and the
  // figures frozen there must come from literally the same call.
  const { source, report, bdReport, monthSold } = await loadCommissionMonth(
    sb,
    year,
    month,
  );

  return c.json({
    year,
    month,
    report,
    bdReport,
    bdMethod: source.bdMethod ?? "percentage",
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

/*
 * POST /api/hr/assign is GONE (Loo 2026-07-27). Attribution was retired whole:
 * the POS stamps who sold every order it writes — live, 19 of 19 native orders
 * carry a salesperson — and the only rows without one are imported archive,
 * already excluded at the source by 0265 and due for deletion. With no work to
 * do there is no endpoint. The `hr_assign_salesperson` RPC is still in the
 * database (dropping it is DDL and needs its own approved migration); nothing
 * calls it.
 */

export default hrRouter;
