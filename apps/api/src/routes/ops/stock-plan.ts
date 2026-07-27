import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  opsStockPlanOpenInputSchema,
  opsStockPlanProposeInputSchema,
  opsStockPlanConsolidateInputSchema,
  opsStockPlanFinalInputSchema,
  opsStockPlanDecideInputSchema,
  computePlanView,
  planPoList,
  isStockPlanner,
  isOpsManager,
  type PlanProposal,
  type PlanLine,
  type PlanSalesLine,
  type PlanStockUnit,
  type PlanStatus,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { myDuties } from "../../lib/duties";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Ready stock plan — card K2 (migration 0287).
 *
 *   GET  /                  the cycle + system columns + the PO list
 *   POST /                  open a cycle (idempotent per month)
 *   POST /:planId/propose   my ask for one SKU (qty 0 withdraws)
 *   POST /:planId/consolidate  the manager's cut
 *   POST /:planId/final     the COO's final number for one line
 *   POST /:planId/decide    approve / send back
 *
 * Every judgement — run rate, suggestion, coverage, the over-suggestion
 * warning, the PO list — is made HERE by the shared pure engine, so the
 * browser and any later consumer can never disagree about what a number means
 * (the HR-P5 one-engine lesson).
 *
 * The writes all go through SECURITY DEFINER RPCs that re-gate in SQL. The
 * `canPropose` / `canConsolidate` / `canApprove` flags in the GET only decide
 * what renders — hiding a button is a courtesy, never the protection.
 */

const opsStockPlanRouter = new Hono<AppEnv>();

/** Rows the browser is allowed to ask for at once. */
const SALES_LOOKBACK_DAYS = 120;

function monthAnchor(period: string): string {
  return `${period}-01`;
}

/** Today in Asia/Kuala_Lumpur — the only calendar the warehouse lives in. */
function todayMyt(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface PlanRow {
  id: string;
  period: string;
  title: string | null;
  status: PlanStatus;
  opened_by: string | null;
  opened_at: string;
  consolidated_by: string | null;
  consolidated_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_remark: string | null;
}

// =====================================================================
// GET / — the whole screen in one answer
// =====================================================================

opsStockPlanRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const asOf = todayMyt();
  const requested = c.req.query("period");
  const period =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : asOf.slice(0, 7);

  const duties = await myDuties(c);
  const { role, email } = c.var.auth;
  const canConsolidate = isOpsManager(role, email, duties);
  const canApprove = isStockPlanner(role, email, duties);

  const { data: planRows, error: planErr } = await sb
    .from("ops_stock_plans")
    .select(
      "id,period,title,status,opened_by,opened_at,consolidated_by,consolidated_at,decided_by,decided_at,decision_remark",
    )
    .order("period", { ascending: false });
  if (planErr) throw new HTTPException(500, { message: planErr.message });

  const plans = (planRows ?? []) as PlanRow[];
  const periods = plans.map((p) => String(p.period).slice(0, 7));
  const plan = plans.find((p) => String(p.period).slice(0, 7) === period) ?? null;

  // The stock register + the sales window are needed whether or not a plan
  // exists — an empty cycle still has to show what the warehouse holds.
  const [stockRes, salesRes] = await Promise.all([
    sb.from("ops_stock_items").select("sku,status,qty"),
    sb
      .from("order_lines")
      .select("sku,qty,orders!inner(placed_at,status,source_system)")
      .gte("orders.placed_at", isoDaysAgo(SALES_LOOKBACK_DAYS)),
  ]);
  if (stockRes.error) throw new HTTPException(500, { message: stockRes.error.message });
  if (salesRes.error) throw new HTTPException(500, { message: salesRes.error.message });

  let proposals: PlanProposal[] = [];
  let lines: PlanLine[] = [];
  if (plan) {
    const [propRes, lineRes] = await Promise.all([
      sb
        .from("ops_stock_plan_proposals")
        .select("sku,qty,proposed_by,note")
        .eq("plan_id", plan.id),
      sb
        .from("ops_stock_plan_lines")
        .select("sku,consolidated_qty,approved_qty")
        .eq("plan_id", plan.id),
    ]);
    if (propRes.error) throw new HTTPException(500, { message: propRes.error.message });
    if (lineRes.error) throw new HTTPException(500, { message: lineRes.error.message });

    const raw = (propRes.data ?? []) as {
      sku: string;
      qty: number;
      proposed_by: string;
      note: string | null;
    }[];
    const names = await nameMap(
      sb,
      unique([
        ...raw.map((p) => p.proposed_by),
        ...plans.flatMap((p) => [p.opened_by, p.consolidated_by, p.decided_by]),
      ]),
    );
    proposals = raw.map((p) => ({
      sku: p.sku,
      qty: p.qty,
      proposedBy: p.proposed_by,
      proposedByName: names.get(p.proposed_by) ?? null,
      note: p.note,
    }));
    lines = ((lineRes.data ?? []) as {
      sku: string;
      consolidated_qty: number | null;
      approved_qty: number | null;
    }[]).map((l) => ({
      sku: l.sku,
      consolidatedQty: l.consolidated_qty,
      approvedQty: l.approved_qty,
    }));

    return c.json(
      await respond({
        c,
        plan,
        names,
        proposals,
        lines,
        stock: stockRes.data ?? [],
        sales: salesRes.data ?? [],
        asOf,
        periods,
        canConsolidate,
        canApprove,
      }),
    );
  }

  return c.json(
    await respond({
      c,
      plan: null,
      names: new Map(),
      proposals,
      lines,
      stock: stockRes.data ?? [],
      sales: salesRes.data ?? [],
      asOf,
      periods,
      canConsolidate,
      canApprove,
    }),
  );
});

interface SalesJoinRow {
  sku: string | null;
  qty: number | null;
  orders:
    | { placed_at: string | null; status: string | null; source_system: string | null }
    | { placed_at: string | null; status: string | null; source_system: string | null }[]
    | null;
}

/**
 * Flatten the PostgREST embed and mark the archive rows.
 *
 * `source_system='autocount'` rows are stamped `placed_at` at IMPORT time, so
 * they are NOT demand — they are handed to the engine flagged rather than
 * dropped here, so it can report how many it excluded and the screen can
 * explain why its history window looks short (0265's law).
 */
function toSalesLines(rows: readonly SalesJoinRow[]): PlanSalesLine[] {
  const out: PlanSalesLine[] = [];
  for (const r of rows) {
    const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
    if (!o?.placed_at || !r.sku) continue;
    out.push({
      sku: r.sku,
      qty: r.qty ?? 0,
      soldOn: String(o.placed_at).slice(0, 10),
      fromArchive: o.source_system === "autocount",
      cancelled: o.status === "cancelled",
    });
  }
  return out;
}

async function respond(args: {
  c: import("hono").Context<AppEnv>;
  plan: PlanRow | null;
  names: Map<string, string>;
  proposals: PlanProposal[];
  lines: PlanLine[];
  stock: unknown[];
  sales: unknown[];
  asOf: string;
  periods: string[];
  canConsolidate: boolean;
  canApprove: boolean;
}) {
  const view = computePlanView({
    proposals: args.proposals,
    lines: args.lines,
    units: args.stock as PlanStockUnit[],
    sales: toSalesLines(args.sales as SalesJoinRow[]),
    asOf: args.asOf,
  });

  const status = args.plan?.status ?? null;
  return {
    plan: args.plan
      ? {
          id: args.plan.id,
          period: String(args.plan.period).slice(0, 7),
          title: args.plan.title,
          status: args.plan.status,
          openedByName: args.names.get(args.plan.opened_by ?? "") ?? null,
          openedAt: args.plan.opened_at,
          consolidatedByName: args.names.get(args.plan.consolidated_by ?? "") ?? null,
          consolidatedAt: args.plan.consolidated_at,
          decidedByName: args.names.get(args.plan.decided_by ?? "") ?? null,
          decidedAt: args.plan.decided_at,
          decisionRemark: args.plan.decision_remark,
        }
      : null,
    rows: view.rows,
    coverage: view.coverage,
    // The list Operations turns into POs. Empty until the plan is approved —
    // `planPoList` reads approvedQty and never falls back.
    poList: status === "approved" ? planPoList(view.rows) : [],
    periods: args.periods,
    skus: [
      ...new Set(
        (args.stock as PlanStockUnit[])
          .map((u) => u.sku?.trim())
          .filter((s): s is string => !!s),
      ),
    ].sort((a, b) => a.localeCompare(b)),
    canPropose: status === "collecting",
    canConsolidate: args.canConsolidate,
    canApprove: args.canApprove,
    meId: args.c.var.auth.id ?? null,
  };
}

function unique(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((v): v is string => !!v))];
}

async function nameMap(
  sb: ReturnType<typeof userClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await sb.from("app_users").select("id,name").in("id", ids);
  for (const u of (data ?? []) as { id: string; name: string | null }[]) {
    if (u.name) map.set(u.id, u.name);
  }
  return map;
}

// =====================================================================
// POST actions — thin wrappers over the DEFINER RPCs
// =====================================================================

opsStockPlanRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockPlanOpenInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_plan_open", {
    p_period: monthAnchor(parsed.period),
    p_title: parsed.title ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ planId: data, period: parsed.period }, 201);
});

opsStockPlanRouter.post("/:planId/propose", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockPlanProposeInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_plan_propose", {
    p_plan: c.req.param("planId"),
    p_sku: parsed.sku,
    p_qty: parsed.qty,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ sku: parsed.sku, qty: parsed.qty });
});

opsStockPlanRouter.post("/:planId/consolidate", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockPlanConsolidateInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_plan_consolidate", {
    p_plan: c.req.param("planId"),
    p_sku: parsed.sku,
    p_qty: parsed.qty,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ sku: parsed.sku, qty: parsed.qty });
});

opsStockPlanRouter.post("/:planId/final", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockPlanFinalInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_plan_set_final", {
    p_plan: c.req.param("planId"),
    p_sku: parsed.sku,
    p_qty: parsed.qty,
  });
  if (error) throw mapErr(error);
  return c.json({ sku: parsed.sku, qty: parsed.qty });
});

opsStockPlanRouter.post("/:planId/decide", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockPlanDecideInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_plan_decide", {
    p_plan: c.req.param("planId"),
    p_decision: parsed.decision,
    p_remark: parsed.remark ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ decision: parsed.decision });
});

// =====================================================================
// Helpers
// =====================================================================

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid input: " + parsed.error.issues[0]?.message,
    });
  }
  return parsed.data;
}

/** A permission answer must read as 403, never as an outage. */
function mapErr(error: { code?: string; message?: string }): HTTPException {
  if (error.code === "42501")
    return new HTTPException(403, { message: error.message ?? "Forbidden" });
  if (error.code === "22023")
    return new HTTPException(400, { message: error.message ?? "Invalid" });
  return new HTTPException(500, { message: error.message ?? "stock plan RPC failed" });
}

export default opsStockPlanRouter;
