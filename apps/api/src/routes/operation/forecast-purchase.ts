import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  forecastPurchaseRequestGroups,
  forecastPurchaseSizeRow,
  purchasingRefusal,
  type ForecastPurchaseSubmitResult,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { isForecastMigrationMissing, readForecastPurchase, type ReadFailure } from "../../lib/forecast-purchase-read";
import { fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { todayIsoMYT } from "../../lib/today";
import type { AppEnv } from "../../types";

/**
 * FORECAST PURCHASE · OUTRIGHT (Purchasing MASTER §9.14).
 *
 * `GET /`          the page's one read (`readForecastPurchase`). It writes
 *                  nothing and suggests nothing itself.
 * `POST /requests` `Send for approval` (owner ruling 2026-10-14, A). The page
 *                  asks; it never issues a PO.
 *
 * ── THE SUBMIT DOOR ─────────────────────────────────────────────────────────
 *
 * The browser sends only WHICH sizes and HOW MANY, with one key per press.
 * Everything else is worked out here again from this server's own read, so a
 * stale tab or a hand-made call cannot ask for yesterday's numbers:
 *
 *   · each size must be forecast stock with a supplier;
 *   · its quantity must be no more than what can still be asked for now
 *     (this Monday's suggestion less what a request in progress already asks);
 *   · the default Deliver To and each request's Delivery Date are the server's.
 *
 * It then calls `purchasing_submit_forecast_requests` (0695), which under one
 * lock (a) answers a retry of the same key with the requests it already made,
 * (b) refuses if a request for the same size appeared since this read, and
 * (c) raises each request through the EXISTING whole-request door, so every
 * Manual Purchase Request rule and the approval requirement still apply.
 * All requests of one press are one transaction: all or none.
 *
 * Approval and issuing are not here. They stay on the request, with the
 * Purchasing Approver and PO Duty, each with its own actor and time.
 */
const forecastPurchaseRouter = new Hono<AppEnv>();

function refusal(c: Context<AppEnv>, status: 409 | 422 | 503, code: string, facts: Parameters<typeof purchasingRefusal>[1] = {}) {
  const words = purchasingRefusal(code, facts);
  return c.json({ error: code, code, message: words.wrong, action: words.todo, ...facts }, status);
}

/** 0695 is applied before this code is deployed. If it is not, say so. */
function migrationMissing(c: Context<AppEnv>) {
  return c.json({
    error: "migration_not_applied",
    code: "migration_not_applied",
    message: "Forecast Purchase is not switched on in the database yet.",
    action: "Ask IT to apply migration 0695, then open the page again.",
  }, 503);
}

forecastPurchaseRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const read = await readForecastPurchase(sb, todayIsoMYT());
  if (!read.ok) return isForecastMigrationMissing(read.error) ? migrationMissing(c) : fail(c, read.error as ReadFailure);
  return c.json(read.data);
});

const submitBody = z.object({
  submissionKey: z.string().uuid(),
  lines: z.array(z.object({ sku: z.string().min(1).max(200), qty: z.number().int().min(1).max(100_000) })).min(1).max(200),
}).strict();

forecastPurchaseRouter.post("/requests", requireOperation, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = submitBody.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  const { submissionKey, lines } = parsed.data;
  if (new Set(lines.map((line) => line.sku)).size !== lines.length) return c.json({ error: "invalid_body", code: "invalid_param" }, 400);

  const sb = userClient(c.env, c.var.auth.jwt);

  /* A RETRY IS ANSWERED, NOT JUDGED AGAIN. The first press went through and
     its answer was lost on the way back. The same key returns the requests it
     made; without this the quantity check below would refuse the retry,
     because the first press's own request is now in progress. */
  const { data: already, error: alreadyErr } = await sb.rpc("purchasing_forecast_submission", { p_submission_key: submissionKey });
  if (alreadyErr) return isForecastMigrationMissing(alreadyErr) ? migrationMissing(c) : fail(c, alreadyErr);
  if (Array.isArray(already) && already.length > 0) {
    const replay: ForecastPurchaseSubmitResult = {
      replayed: true,
      requests: (already as Array<{ id: string; req_no: string | null }>).map((request) => ({ id: request.id, reqNo: request.req_no ?? null })),
    };
    return c.json(replay);
  }

  const read = await readForecastPurchase(sb, todayIsoMYT());
  if (!read.ok) return isForecastMigrationMissing(read.error) ? migrationMissing(c) : fail(c, read.error as ReadFailure);
  const forecast = read.data;
  const rows = new Map(forecast.sizes.map((size) => [size.sku, forecastPurchaseSizeRow(size)]));
  const itemWord = (sku: string) => { const row = rows.get(sku); return row ? `${row.model} ${row.size}`.trim() : sku; };

  /* THE SERVER'S OWN NUMBERS. A size that is not forecast stock, has no
     supplier, or is asked for in a quantity the forecast no longer has room
     for is refused by name and nothing is written. */
  const asked = [];
  for (const line of lines) {
    const row = rows.get(line.sku);
    if (!row) return refusal(c, 422, "forecast_not_stock_item", { sku: line.sku });
    if (!row.supplierId) return refusal(c, 422, "unresolved_supplier", { sku: itemWord(line.sku) });
    if (line.qty > row.toAsk) return refusal(c, 409, "forecast_changed", { sku: itemWord(line.sku), qty: line.qty, toBuy: row.toAsk });
    asked.push({ ...row, toAsk: line.qty });
  }
  if (!forecast.deliverTo) return refusal(c, 422, "forecast_no_deliver_to");
  const groups = forecastPurchaseRequestGroups(asked);
  for (const group of groups) {
    if (!group.deliveryDate) return refusal(c, 422, "production_days_required", { supplier: group.supplier });
  }

  const { data, error } = await sb.rpc("purchasing_submit_forecast_requests", {
    p_submission_key: submissionKey,
    p_forecast_week: forecast.mondays[0],
    p_destination_id: forecast.deliverTo.id,
    p_groups: groups.map((group) => ({
      required_by: group.deliveryDate,
      requirement: `Forecast Purchase · week of ${forecast.mondays[0]}`,
      lines: group.lines.map((line) => ({
        sku: line.sku,
        qty: line.qty,
        /* What this read saw in progress: the door refuses if it has moved. */
        in_progress: line.inProgress,
        /* What the ask was worked out from, kept with the request's mark. */
        basis: { level: line.suggestion.level, cap: line.suggestion.cap, suggested: line.suggestion.weeks[0], free: rows.get(line.sku)!.free, on_po: rows.get(line.sku)!.onPo, sold14: rows.get(line.sku)!.sold14 },
      })),
    })),
  });
  if (error) {
    if (isForecastMigrationMissing(error)) return migrationMissing(c);
    const detail = String((error as ReadFailure).details ?? "").trim();
    if (detail === "forecast_in_progress_changed") {
      const sku = String((error as { hint?: string }).hint ?? "").trim();
      return refusal(c, 409, "forecast_changed", { sku: sku ? itemWord(sku) : null });
    }
    return fail(c, error);
  }
  const made = (data ?? {}) as { replayed?: boolean; requests?: Array<{ id: string; req_no: string | null }> };
  const body: ForecastPurchaseSubmitResult = {
    replayed: made.replayed === true,
    requests: (made.requests ?? []).map((request) => ({ id: request.id, reqNo: request.req_no ?? null })),
  };
  return c.json(body);
});

export default forecastPurchaseRouter;
