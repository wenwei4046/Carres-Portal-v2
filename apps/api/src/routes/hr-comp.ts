import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { setStaffCompInput } from "@carres/shared";
import { requireHr } from "../lib/auth-guards";
import { loadPeopleCostMonth } from "../lib/comp-month";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * /api/hr/comp — HR-P7 people cost (migration 0278, 2026-07-26).
 *
 * The only route family in Carres that carries salary figures. Two things keep it
 * narrow:
 *   * `requireHr` admits hr + principal only — the two roles that administer comp
 *     (D3), and the same set the DEFINER RPC gates on independently.
 *   * `staff_comp` has a SELECT-only RLS policy, so these RPCs are structurally
 *     the only write door and every write lands in audit_log with the figures.
 *     Verified at apply time: a direct table INSERT as `authenticated` is refused
 *     42501.
 *
 * service_role appears nowhere in this file — nothing here needs it.
 */
const hrCompRouter = new Hono<AppEnv>();

function rpcFail(error: { code?: string; message: string }): never {
  if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
  const domain = [
    "employee_required",
    "effective_from_required",
    "base_must_not_be_negative",
    "allowance_must_not_be_negative",
    "burden_out_of_range",
    "employee_not_found",
    "comp_not_found",
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
  return { year, month };
}

/** GET /api/hr/comp?year&month — the whole People cost tab in one call. */
hrCompRouter.get("/", requireHr, async (c) => {
  const { year, month } = monthQuery(c.req.url);
  const sb = userClient(c.env, c.var.auth.jwt);

  // `today` is resolved HERE and passed down so the engine stays pure. UTC is
  // fine for a month boundary: MYT is UTC+8, so the only divergence is the first
  // 8 hours of the 1st, when "is this month still running" is true either way.
  const now = new Date();
  const today = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

  return c.json(await loadPeopleCostMonth(sb, year, month, today));
});

/**
 * PUT /api/hr/comp — record or correct one dated salary row.
 *
 * A PUT: re-sending the same (person, effective_from) corrects that row rather
 * than stacking a second one. A different date creates history, so last month's
 * cost keeps the figure it was actually incurred at.
 */
hrCompRouter.put("/", requireHr, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = setStaffCompInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_set_staff_comp", {
    p_employee_id: parsed.data.employeeId,
    p_base_monthly: parsed.data.baseMonthly,
    p_fixed_allowance: parsed.data.fixedAllowance,
    p_employer_burden_pct: parsed.data.employerBurdenPct,
    p_effective_from: parsed.data.effectiveFrom,
    p_note: parsed.data.note ?? null,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true, id: data as unknown as string });
});

/** DELETE /api/hr/comp/:id — for a row recorded against the wrong person. */
hrCompRouter.delete("/:id", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_delete_staff_comp", { p_id: c.req.param("id") });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

export default hrCompRouter;
