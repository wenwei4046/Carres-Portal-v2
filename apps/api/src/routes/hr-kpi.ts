import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  kpiKeySchema,
  setKpiTargetInput,
  setManualActualInput,
  setStoreManagerInput,
  DEFAULT_KPI,
} from "@carres/shared";
import { requireHr } from "../lib/auth-guards";
import { loadScorecardMonth } from "../lib/kpi-actuals";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * /api/hr/kpi — HR-P6 targets + scoreboard (migration 0276, 2026-07-26).
 *
 * HR stays a keyhole role (the 0244 law): every read and write goes through a
 * gated SECURITY DEFINER RPC on the caller's own JWT. service_role appears
 * nowhere in this file — nothing here needs it.
 *
 * 0276 gives kpi_targets / kpi_manual_actuals a SELECT-only RLS policy, so these
 * RPCs are structurally the only write door. That is deliberate: P5 had to put
 * its back-dated-rate guard in a TRIGGER precisely because
 * staff_commission_rates is upserted directly through a `for all` policy, and a
 * route check would have been bypassed by the next writer.
 */
const hrKpiRouter = new Hono<AppEnv>();

/** Map an RPC error onto a response. 42501 is the DEFINER gate saying no. */
function rpcFail(error: { code?: string; message: string }): never {
  if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
  const domain = [
    "one_scope_required",
    "unknown_kpi",
    "target_must_be_positive",
    "effective_from_required",
    "employee_not_found",
    "store_not_scoreable",
    "target_not_found",
    "bad_month",
    "value_must_not_be_negative",
    "not_a_valid_manager",
  ].find((k) => error.message.includes(k));
  if (domain) throw new HTTPException(422, { message: domain });
  throw new HTTPException(500, { message: error.message });
}

function monthQuery(url: string) {
  const p = new URL(url).searchParams;
  const year = Number(p.get("year"));
  const month = Number(p.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HTTPException(422, { message: "invalid year/month" });
  }
  // An unknown ?kpi= falls back to the default rather than 422: a stale bookmark
  // should show the sales board, not an error page.
  const kpi = kpiKeySchema.safeParse(p.get("kpi"));
  return { year, month, kpiKey: kpi.success ? kpi.data : DEFAULT_KPI };
}

async function parseBody<T>(
  c: { req: { json: () => Promise<unknown> } },
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data === undefined) {
    throw new HTTPException(422, {
      message: parsed.error?.issues[0]?.message ?? "invalid input",
    });
  }
  return parsed.data;
}

/** GET /api/hr/kpi?year&month&kpi — the whole Performance tab in one call. */
hrKpiRouter.get("/", requireHr, async (c) => {
  const { year, month, kpiKey } = monthQuery(c.req.url);
  const sb = userClient(c.env, c.var.auth.jwt);
  return c.json(await loadScorecardMonth(sb, year, month, kpiKey));
});

/**
 * PUT /api/hr/kpi/target — set or correct one dated target.
 *
 * A PUT, not a POST: re-sending the same (metric, scope, effective_from) is
 * idempotent by design — it corrects that row rather than stacking a second one.
 * Choosing a different date is what creates history.
 */
hrKpiRouter.put("/target", requireHr, async (c) => {
  const body = await parseBody(c, setKpiTargetInput);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_set_kpi_target", {
    p_kpi_key: body.kpiKey,
    p_employee_id: body.employeeId ?? null,
    p_dealer_id: body.dealerId ?? null,
    p_target_value: body.targetValue,
    p_effective_from: body.effectiveFrom,
    p_note: body.note ?? null,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true, id: data as unknown as string });
});

/** DELETE /api/hr/kpi/target/:id — for a target set on the wrong scope. */
hrKpiRouter.delete("/target/:id", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_delete_kpi_target", { p_id: c.req.param("id") });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/**
 * PUT /api/hr/kpi/manual — the escape hatch for a non-sales KPI.
 *
 * No metric is marked `manual` today (KPI_METRICS is all-computed), so nothing in
 * the UI reaches this yet. It exists so adding such a metric is a one-line change
 * to the shared constant instead of another migration.
 * Carry-forward kpi-manual-metric-none-authored.
 */
hrKpiRouter.put("/manual", requireHr, async (c) => {
  const body = await parseBody(c, setManualActualInput);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_set_manual_actual", {
    p_kpi_key: body.kpiKey,
    p_employee_id: body.employeeId ?? null,
    p_dealer_id: body.dealerId ?? null,
    p_year: body.year,
    p_month: body.month,
    p_value: body.value,
    p_note: body.note ?? null,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true, id: data as unknown as string });
});

/**
 * PUT /api/hr/kpi/store-manager — who owns this store's number.
 *
 * The manager view is off until every store has an owner, because floor staff
 * have no reports_to at all: one column here is what turns a rollup from
 * "RM 0 for everyone" into a real number. `appUserId: null` clears it.
 */
hrKpiRouter.put("/store-manager", requireHr, async (c) => {
  const body = await parseBody(c, setStoreManagerInput);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_set_store_manager", {
    p_dealer_id: body.dealerId,
    p_user_id: body.appUserId,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

export default hrKpiRouter;
