import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { OperationReceiveThreadsInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — operation per-thread batch receive router (own_logistics flow).
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md (Task 5).
 *
 * Mounted at `/api/operation/pos` alongside `operationPosRouter`. The suffix
 * `/:poId/receive-threads` is unique within that namespace (existing routes are
 * `/:id/receive`, `/:id/cancel`, `/:id/assign-pickup-partner`,
 * `/:id/reassign-warehouse`) so no path collision. The own_logistics
 * counterpart to `partnerPickupsBatchRouter` — when an own_logistics supplier
 * delivers a batch of ready threads to an HQ warehouse, operation batch-acks
 * them via this route.
 *
 * Wraps `operation_receive_threads(p_po_id, p_thread_ids, p_do_number,
 * p_do_file_path, p_do_note)` from migration 0107 (+ fixes in 0108). The RPC:
 *   - Verifies caller has the `operation` role (42501 → 403 on wrong role)
 *   - Verifies every thread is in supplier_ready state with no prior
 *     pickup_event_id (22023 → 422 on wrong_state)
 *   - Creates one po_pickup_events row with `ack_role='operation'`, stamps
 *     pickup_event_id on each thread, advances PO sup_status to `delivered`
 *     (all threads received) or `partially_shipped` (some threads still pending)
 *
 * Body shape: OperationReceiveThreadsInput zod schema (camelCase, strict mode):
 *   { threadIds[], doNumber, doFilePath, doNote?, signed: true }
 *
 * The `signed` literal-true checkbox is required by the per-thread receive UI
 * (HQ-side "I have received and signed the DO" gate). doFilePath is the
 * canonical Storage path returned by `/api/storage/dos/sign-upload`. `poId`
 * comes from the URL path (not the body) — mirrors the existing
 * `/api/operation/pos/:id/*` action route shape.
 */
const operationReceiveThreadsRouter = new Hono<AppEnv>();

/**
 * GET /:poId/threads — operation-side counterpart to the supplier-side
 * `/api/supplier/pos/:poId/threads` endpoint (apps/api/src/routes/supplier/pos.ts).
 *
 * Returns the per-thread breakdown for one PO so the operation ReceivePOModal
 * (own_logistics flow) can render a multi-select list of ready-but-not-yet-
 * picked-up threads. operation-role guard is inline (mirrors POST below) — RLS
 * on `order_supplier_threads` (`ost_operation_read`, migration 0033:88) is the
 * true security boundary; the role check is just early-out friendliness.
 *
 * Response shape matches the supplier endpoint byte-for-byte (same client-side
 * `ThreadRow` type) — the modal can swap consumers later if we ever fold the
 * two endpoints into one. Two queries (threads + order_lines lookup) for the
 * same reason as the supplier endpoint: order_lines hangs off `orders`, not
 * `order_supplier_threads`, so a single nested select is 3 levels deep.
 */
operationReceiveThreadsRouter.get("/:poId/threads", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation") {
    throw new HTTPException(403, { message: "operation role required" });
  }
  const poId = c.req.param("poId");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_supplier_threads")
    .select(
      "id, order_id, supplier_ready_at, pickup_event_id, orders(dl, customer_name, delivery_date)",
    )
    .eq("po_id", poId);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const orderIds = rows
    .map((r) => r.order_id)
    .filter((id: unknown): id is string => typeof id === "string");
  const linesByOrder = new Map<string, Array<{ sku: string; qty: number }>>();
  if (orderIds.length > 0) {
    const { data: lines, error: e2 } = await sb
      .from("order_lines")
      .select("order_id, sku, qty")
      .in("order_id", orderIds);
    if (e2) {
      const m = mapPgError(e2);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of ((lines ?? []) as any[])) {
      const list = linesByOrder.get(l.order_id) ?? [];
      list.push({ sku: l.sku, qty: l.qty });
      linesByOrder.set(l.order_id, list);
    }
  }
  return c.json(
    rows.map((r) => ({
      id: r.id,
      order_id: r.order_id,
      order_dl: r.orders?.dl ?? null,
      customer_name: r.orders?.customer_name ?? null,
      customer_delivery_date: r.orders?.delivery_date ?? null,
      supplier_ready_at: r.supplier_ready_at,
      pickup_event_id: r.pickup_event_id,
      sku_lines: linesByOrder.get(r.order_id) ?? [],
    })),
  );
});

operationReceiveThreadsRouter.post("/:poId/receive-threads", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation") {
    throw new HTTPException(403, { message: "operation role required" });
  }
  const poId = c.req.param("poId");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = OperationReceiveThreadsInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("operation_receive_threads", {
    p_po_id:        poId,
    p_thread_ids:   parsed.data.threadIds,
    p_do_number:    parsed.data.doNumber,
    p_do_file_path: parsed.data.doFilePath,
    p_do_note:      parsed.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default operationReceiveThreadsRouter;
