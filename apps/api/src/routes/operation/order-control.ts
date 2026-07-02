import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  updateOpsOrderControlInput,
  stockEtaImportInput,
  matchStockRows,
  type OrderLineRef,
  type StockEtaImportResult,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * ops_order_control overlay — the editable "Master Sheet, live" fields for an
 * order (migration 0159; P2 of project-orders-control-spec).
 *
 *   GET /api/operation/orders/:id/control   — read the overlay (null if none)
 *   PUT /api/operation/orders/:id/control   — sparse upsert
 *
 * Plain-table CRUD via PostgREST (no RPC): the row is a 1:1 overlay keyed by
 * order_id, created lazily on first edit. RLS (migration 0159) is the security
 * boundary — read = any internal HQ role, write = operation/principal — so we
 * forward the user JWT and let RLS enforce; the inline role gate here is just
 * defence-in-depth + a clean 403 message.
 *
 * Mount via `api.route("/operation/orders", orderControlRouter)` in
 * apps/api/src/index.ts so the paths above are absolute. Mirrors the sibling
 * deliveryChainRouter mounting + inline-guard pattern.
 */
const orderControlRouter = new Hono<AppEnv>();

const ORDER_ID = z.string().uuid();

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

// GET /:id/control — read the overlay. Absent row → { control: null } (the FE
// renders all-default fields and creates the row on first save).
orderControlRouter.get("/:id/control", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_order_control")
    .select(
      "order_id, stock_location, stock_eta, delivery_time_slot, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, balance, balance_due_date, storage_from, storage_to, storage_fee_override, logistic_eta, paid_amount, storage_paid, storage_collected_at, storage_waiver_status, storage_waiver_reason, storage_waiver_requested_by, storage_waiver_decided_by, storage_waiver_decided_at, extension_original_date, extension_new_date, extension_reason, extension_note, extension_acknowledged_at, extended_at, extended_by, extension_count, contact_by_days, contact_by_task_at, line_locations, line_etas, called_customer, updated_at, updated_by",
    )
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data ?? null });
});

// PUT /:id/control — sparse upsert of the overlay. Only the fields the drawer
// changed come in; the rest keep their value (or column default on insert).
// updated_at is auto-bumped by the set_updated_at trigger on the UPDATE branch.
orderControlRouter.put("/:id/control", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOpsOrderControlInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid order-control input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  // Reject empty patch — nothing to write, signal misuse.
  if (Object.keys(parsed.data).length === 0) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: "Patch object must contain at least one field",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      { order_id: idCheck.data, ...parsed.data, updated_by: auth.id },
      { onConflict: "order_id" },
    )
    .select(
      "order_id, stock_location, stock_eta, delivery_time_slot, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, balance, balance_due_date, storage_from, storage_to, storage_fee_override, logistic_eta, paid_amount, storage_paid, storage_collected_at, storage_waiver_status, storage_waiver_reason, storage_waiver_requested_by, storage_waiver_decided_by, storage_waiver_decided_at, extension_original_date, extension_new_date, extension_reason, extension_note, extension_acknowledged_at, extended_at, extended_by, extension_count, contact_by_days, contact_by_task_at, line_locations, line_etas, called_customer, updated_at, updated_by",
    )
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data });
});

// POST /import-stock-eta — bulk-fill per-line Stock ETA from Jess's Master "Ops"
// sheet. AutoCount orders never carried Stock ETA, so the detail's ETA box was
// blank; this joins each sheet row to an order line by PO (order_lines.source_po)
// + product name (fuzzy, colour-code tolerant) and merges the ETA into
// ops_order_control.line_etas. `dryRun` computes the match rate + writes nothing
// (the client shows it as a preview before committing). Operation/principal only;
// userClient/RLS is the security boundary.
orderControlRouter.post("/import-stock-eta", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = stockEtaImportInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid stock-eta import at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  const { rows, dryRun = false } = parsed.data;

  const sb = userClient(c.env, auth.jwt);

  // All order lines that carry a source PO — the join universe.
  const { data: lineData, error: lineErr } = await sb
    .from("order_lines")
    .select("order_id, sku, source_po")
    .not("source_po", "is", null);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  const lines: OrderLineRef[] = (lineData ?? []).map((l) => ({
    orderId: l.order_id as string,
    sku: l.sku as string,
    sourcePo: (l.source_po as string | null) ?? null,
  }));

  const { matched, unmatched } = matchStockRows(rows, lines);

  // Group by order → the ETA and/or the readiness STATUS for each matched line,
  // keyed by the exact order_lines.sku (the line_etas / line_stock_status key).
  const etaByOrder = new Map<string, Record<string, string>>();
  const statusByOrder = new Map<string, Record<string, string>>();
  const touchedOrders = new Set<string>();
  for (const m of matched) {
    touchedOrders.add(m.orderId);
    if (m.eta) {
      const cur = etaByOrder.get(m.orderId) ?? {};
      cur[m.sku] = m.eta;
      etaByOrder.set(m.orderId, cur);
    }
    if (m.stockStatus) {
      const cur = statusByOrder.get(m.orderId) ?? {};
      cur[m.sku] = m.stockStatus;
      statusByOrder.set(m.orderId, cur);
    }
  }

  const result: StockEtaImportResult = {
    matched: matched.length,
    unmatched: unmatched.length,
    orders: touchedOrders.size,
    written: 0,
    sampleUnmatched: unmatched.slice(0, 20),
    dryRun,
  };

  if (dryRun || touchedOrders.size === 0) {
    return c.json({ result });
  }

  // Merge into each order's existing line_etas + line_stock_status (never clobber
  // other lines).
  const orderIds = [...touchedOrders];
  const { data: existing, error: exErr } = await sb
    .from("ops_order_control")
    .select("order_id, line_etas, line_stock_status")
    .in("order_id", orderIds);
  if (exErr) {
    const m = mapPgError(exErr);
    return c.json(m.body, m.status);
  }
  const existingEtas = new Map<string, Record<string, string>>();
  const existingStatus = new Map<string, Record<string, string>>();
  for (const row of existing ?? []) {
    existingEtas.set(
      row.order_id as string,
      (row.line_etas as Record<string, string> | null) ?? {},
    );
    existingStatus.set(
      row.order_id as string,
      (row.line_stock_status as Record<string, string> | null) ?? {},
    );
  }

  let written = 0;
  const upsertRows = orderIds.map((orderId) => {
    const eta = etaByOrder.get(orderId);
    const status = statusByOrder.get(orderId);
    written += Object.keys({ ...eta, ...status }).length;
    const row: {
      order_id: string;
      updated_by: string;
      line_etas?: Record<string, string>;
      line_stock_status?: Record<string, string>;
    } = { order_id: orderId, updated_by: auth.id };
    if (eta) row.line_etas = { ...(existingEtas.get(orderId) ?? {}), ...eta };
    if (status)
      row.line_stock_status = { ...(existingStatus.get(orderId) ?? {}), ...status };
    return row;
  });

  const { error: upErr } = await sb
    .from("ops_order_control")
    .upsert(upsertRows, { onConflict: "order_id" });
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json(m.body, m.status);
  }

  result.written = written;
  return c.json({ result });
});

export default orderControlRouter;
