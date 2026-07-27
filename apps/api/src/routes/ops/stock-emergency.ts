import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  opsStockEmergencyRaiseInputSchema,
  opsStockEmergencyDecideInputSchema,
  computeEmergencyView,
  isStockPlanner,
  type EmergencyRequest,
  type EmergencyReason,
  type EmergencyStatus,
  type PlanStockUnit,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { hasDuty, myDuties } from "../../lib/duties";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Urgent restock — card K3 (migration 0290).
 *
 *   GET  /             the lane + the warehouse numbers beside each ask
 *   POST /             raise one urgent ask
 *   POST /:id/decide   the COO answers (approve, optionally at a smaller qty)
 *   POST /:id/ordered  the purchase order has been raised
 *
 * Every judgement — what the warehouse holds, whether free stock already
 * covers the ask, how long something has waited, the urgent PO list — is made
 * HERE by the shared pure engine, so the browser and any later consumer can
 * never disagree about what a number means (the HR-P5 one-engine lesson).
 *
 * The writes all go through SECURITY DEFINER RPCs that re-gate in SQL. The
 * `canRaise` / `canDecide` / `canMarkOrdered` flags only decide what renders —
 * hiding a button is a courtesy, never the protection.
 *
 * NOTE what this route does NOT read: `ops_stock_plans` and its two child
 * tables. The card's "never mixes into the monthly plan's numbers" is kept by
 * construction — there is no join here to forget to filter.
 */

const opsStockEmergencyRouter = new Hono<AppEnv>();

/** Today in Asia/Kuala_Lumpur — the only calendar the warehouse lives in. */
function todayMyt(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * How far back the lane reads. An urgent ask is a THIS-WEEK object; a year of
 * settled history would bury the two rows somebody has to answer today. The
 * pending queue is never truncated by this — a request that has waited longer
 * than the window is the most urgent thing on the screen, so it is fetched
 * unconditionally below.
 */
const HISTORY_DAYS = 90;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000).toISOString();
}

interface RequestRow {
  id: string;
  sku: string;
  qty: number;
  reason: EmergencyReason;
  note: string | null;
  requested_by: string;
  requested_at: string;
  status: EmergencyStatus;
  approved_qty: number | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_remark: string | null;
  ordered_by: string | null;
  ordered_at: string | null;
}

const COLUMNS =
  "id,sku,qty,reason,note,requested_by,requested_at,status,approved_qty,decided_by,decided_at,decision_remark,ordered_by,ordered_at";

// =====================================================================
// GET / — the whole lane in one answer
// =====================================================================

opsStockEmergencyRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const asOf = todayMyt();

  const duties = await myDuties(c);
  const { role, email } = c.var.auth;
  const canDecide = isStockPlanner(role, email, duties);
  const canMarkOrdered = await hasDuty(c, "po_duty_editor");

  const [openRes, recentRes, stockRes] = await Promise.all([
    // Everything still live, however old. See HISTORY_DAYS.
    sb.from("ops_stock_emergency_requests").select(COLUMNS).in("status", [
      "pending",
      "approved",
    ]),
    sb
      .from("ops_stock_emergency_requests")
      .select(COLUMNS)
      .gte("requested_at", isoDaysAgo(HISTORY_DAYS)),
    sb.from("ops_stock_items").select("sku,status,qty"),
  ]);
  if (openRes.error) throw new HTTPException(500, { message: openRes.error.message });
  if (recentRes.error)
    throw new HTTPException(500, { message: recentRes.error.message });
  if (stockRes.error) throw new HTTPException(500, { message: stockRes.error.message });

  const byId = new Map<string, RequestRow>();
  for (const r of [
    ...((openRes.data ?? []) as RequestRow[]),
    ...((recentRes.data ?? []) as RequestRow[]),
  ]) {
    byId.set(r.id, r);
  }
  const raw = [...byId.values()];

  const names = await nameMap(
    sb,
    [
      ...new Set(
        raw
          .flatMap((r) => [r.requested_by, r.decided_by, r.ordered_by])
          .filter((v): v is string => !!v),
      ),
    ],
  );

  const requests: EmergencyRequest[] = raw.map((r) => ({
    id: r.id,
    sku: r.sku,
    qty: r.qty,
    reason: r.reason,
    note: r.note,
    requestedBy: r.requested_by,
    requestedByName: names.get(r.requested_by) ?? null,
    requestedAt: r.requested_at,
    status: r.status,
    approvedQty: r.approved_qty,
    decidedByName: r.decided_by ? (names.get(r.decided_by) ?? null) : null,
    decidedAt: r.decided_at,
    decisionRemark: r.decision_remark,
    orderedByName: r.ordered_by ? (names.get(r.ordered_by) ?? null) : null,
    orderedAt: r.ordered_at,
  }));

  const stock = (stockRes.data ?? []) as PlanStockUnit[];
  const view = computeEmergencyView({ requests, units: stock, asOf });

  return c.json({
    rows: view.rows,
    pendingCount: view.pendingCount,
    poList: view.poList,
    skus: [
      ...new Set(stock.map((u) => u.sku?.trim()).filter((s): s is string => !!s)),
    ].sort((a, b) => a.localeCompare(b)),
    // It is the person on the floor who sees the shelf empty, so raising is
    // open to any operation login — a duty gate here would mean the only
    // people who can report an emergency are the two who are already busy.
    canRaise: true,
    canDecide,
    canMarkOrdered,
    meId: c.var.auth.id ?? null,
  });
});

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

opsStockEmergencyRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockEmergencyRaiseInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_emergency_raise", {
    p_sku: parsed.sku,
    p_qty: parsed.qty,
    p_reason: parsed.reason,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ id: data, sku: parsed.sku, qty: parsed.qty }, 201);
});

opsStockEmergencyRouter.post("/:id/decide", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockEmergencyDecideInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_emergency_decide", {
    p_id: c.req.param("id"),
    p_decision: parsed.decision,
    // null = "yes, as asked". The RPC resolves the fallback, not the browser.
    p_qty: parsed.qty ?? null,
    p_remark: parsed.remark ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ decision: parsed.decision });
});

opsStockEmergencyRouter.post("/:id/ordered", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_emergency_mark_ordered", {
    p_id: c.req.param("id"),
  });
  if (error) throw mapErr(error);
  return c.json({ ordered: true });
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
  return new HTTPException(500, {
    message: error.message ?? "urgent restock RPC failed",
  });
}

export default opsStockEmergencyRouter;
