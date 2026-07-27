import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  addAdjustmentInput,
  closeMonthInput,
  commissionReadiness,
  commissionRunCsv,
  runActionInput,
  type CommissionRunDetail,
  type CommissionRunState,
  type CommissionRunSummary,
  type ReadinessCheck,
} from "@carres/shared";
import { requireHr } from "../lib/auth-guards";
import { loadCommissionMonth, reportToRunLines } from "../lib/commission-month";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * /api/hr/runs — HR-P5 commission runs (migration 0272, 2026-07-26).
 *
 * Closing a month freezes what the engine computed. The engine is the pure
 * `computeCommission` in @carres/shared, reached through `loadCommissionMonth` —
 * the SAME helper `/api/hr/report` uses, so the figures the operator reviewed and
 * the figures that get frozen cannot be two different numbers.
 *
 * The pre-flight is `commissionReadiness` in @carres/shared, also pure, also shared
 * with the UI. The DB enforces the same rules independently inside
 * `commission_close_month` — a disabled button is a courtesy, not a guarantee.
 */
const hrRunsRouter = new Hono<AppEnv>();

function rpcFail(error: { code?: string; message: string }): never {
  if (error.code === "42501") {
    throw new HTTPException(403, {
      message: error.message.includes("principal_only")
        ? "principal_only"
        : "forbidden",
    });
  }
  const domain = [
    "zero_rate_sellers",
    "run_already_exists",
    "commission_month_locked",
    "run_not_found",
    "not_draft",
    "not_approved",
    "already_paid",
    "only_draft_can_be_voided",
    "reason_required",
    "invalid_reason",
    "invalid_program",
    "invalid_subject_kind",
    "amount_required",
  ].find((k) => error.message.includes(k));
  if (domain) throw new HTTPException(422, { message: domain });
  throw new HTTPException(500, { message: error.message });
}

function monthQuery(url: string) {
  const p = new URL(url).searchParams;
  const year = Number(p.get("year"));
  const month = Number(p.get("month"));
  const program = p.get("program") === "bd" ? "bd" : "staff";
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HTTPException(422, { message: "invalid year/month" });
  }
  return { year, month, program };
}

/**
 * GET /api/hr/runs/state?year&month — the pre-flight.
 *
 * Two halves: what SQL knows (`commission_run_state`: existing run, pending
 * adjustments) and what only the engine knows (does everybody who sold actually
 * compute to a figure). Combined here by the shared pure function.

 */
hrRunsRouter.get("/state", requireHr, async (c) => {
  const { year, month, program } = monthQuery(c.req.url);
  const sb = userClient(c.env, c.var.auth.jwt);

  const state = await sb.rpc("commission_run_state", {
    p_year: year,
    p_month: month,
    p_program: program,
  });
  if (state.error) rpcFail(state.error);
  const dbState = state.data as unknown as CommissionRunState;

  const { report } = await loadCommissionMonth(sb, year, month);

  const now = new Date();
  const checks: ReadinessCheck[] = commissionReadiness({
    report,
    runStatus: dbState.run?.status ?? null,
    year,
    month,
    today: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
  });

  return c.json({ ...dbState, checks });
});

/** GET /api/hr/runs — every close, newest first. */
hrRunsRouter.get("/", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("commission_runs_list", { p_limit: 24 });
  if (error) rpcFail(error);
  return c.json({ runs: data as unknown as CommissionRunSummary[] });
});

/** GET /api/hr/runs/:id — the FROZEN statement. Never recomputed. */
hrRunsRouter.get("/:id", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("commission_run_detail", {
    p_run_id: c.req.param("id"),
  });
  if (error) rpcFail(error);
  return c.json(data as unknown as CommissionRunDetail);
});

/** GET /api/hr/runs/:id/csv — the payroll bridge, built from the frozen lines. */
hrRunsRouter.get("/:id/csv", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("commission_run_detail", {
    p_run_id: c.req.param("id"),
  });
  if (error) rpcFail(error);
  const run = data as unknown as CommissionRunDetail;

  const csv = commissionRunCsv({ year: run.year, month: run.month, lines: run.lines });
  const name = `commission-${run.program}-${run.year}-${String(run.month).padStart(2, "0")}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
});

/**
 * POST /api/hr/runs/close — compute with the shared engine, hand the result to the
 * RPC to persist. The client never supplies a figure.
 */
hrRunsRouter.post("/close", requireHr, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = closeMonthInput.safeParse(raw);
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
  const { year, month, program, note } = parsed.data;

  if (program !== "staff") {
    // BD has zero enrolled profiles today; a BD run would be an empty ceremony.
    // Shipping the programme separately keeps the empty case from looking closed.
    return c.json(
      {
        error: "invalid_input",
        code: "bd_program_not_enabled",
        message: "BD commission runs are not enabled yet — nobody is enrolled.",
      },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { report } = await loadCommissionMonth(sb, year, month);

  const { data, error } = await sb.rpc("commission_close_month", {
    p_year: year,
    p_month: month,
    p_program: program,
    p_lines: reportToRunLines(report),
    p_note: note ?? null,
  });
  if (error) rpcFail(error);

  return c.json({ ok: true, runId: data as unknown as string });
});

/** POST /api/hr/runs/:id/approve — principal only; this is what locks the month. */
hrRunsRouter.post("/:id/approve", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("commission_approve_run", {
    p_run_id: c.req.param("id"),
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/** POST /api/hr/runs/:id/reopen — principal only, reason required, never once paid. */
hrRunsRouter.post("/:id/reopen", requireHr, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = runActionInput.safeParse({ runId: c.req.param("id"), ...raw });
  if (!parsed.success || !parsed.data.reason) {
    return c.json(
      { error: "invalid_input", code: "reason_required", message: "Give a reason" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("commission_reopen_run", {
    p_run_id: parsed.data.runId,
    p_reason: parsed.data.reason,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/** POST /api/hr/runs/:id/discard — draft only; releases its adjustments back. */
hrRunsRouter.post("/:id/discard", requireHr, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = runActionInput.safeParse({ runId: c.req.param("id"), ...raw });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "bad id" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("commission_void_run", {
    p_run_id: parsed.data.runId,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/** POST /api/hr/runs/:id/paid — after payroll has actually paid it. */
hrRunsRouter.post("/:id/paid", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("commission_mark_paid", {
    p_run_id: c.req.param("id"),
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/**
 * POST /api/hr/runs/adjustments — a correction, on an OPEN month.
 *
 * The RPC refuses a locked target month. That is the whole point: a September
 * clawback for a July order lands on September and points back at July, rather than
 * editing the statement the person already saw.
 */
hrRunsRouter.post("/adjustments", requireHr, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = addAdjustmentInput.safeParse(raw);
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
  const a = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("commission_add_adjustment", {
    p_year: a.year,
    p_month: a.month,
    p_program: a.program,
    p_subject_kind: a.subjectKind,
    p_subject_id: a.subjectId,
    p_amount: a.amount,
    p_reason: a.reason,
    p_origin_year: a.originYear ?? null,
    p_origin_month: a.originMonth ?? null,
    p_ref_order_id: a.refOrderId ?? null,
    p_note: a.note ?? null,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true, id: data as unknown as string });
});

export default hrRunsRouter;
