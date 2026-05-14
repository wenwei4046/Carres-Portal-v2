import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logisticsReceiveThreadsInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — Logistics per-thread batch receive router (own_logistics flow).
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md (Task 5).
 *
 * Mounted at `/api/logistics/pos` alongside `logisticsPosRouter`. The suffix
 * `/:poId/receive-threads` is unique within that namespace (existing routes are
 * `/:id/receive`, `/:id/cancel`, `/:id/assign-pickup-partner`,
 * `/:id/reassign-warehouse`) so no path collision. The own_logistics
 * counterpart to `partnerPickupsBatchRouter` — when an own_logistics supplier
 * delivers a batch of ready threads to an HQ warehouse, logistics batch-acks
 * them via this route.
 *
 * Wraps `logistics_receive_threads(p_po_id, p_thread_ids, p_do_number,
 * p_do_file_path, p_do_note)` from migration 0107 (+ fixes in 0108). The RPC:
 *   - Verifies caller has the `logistics` role (42501 → 403 on wrong role)
 *   - Verifies every thread is in supplier_ready state with no prior
 *     pickup_event_id (22023 → 422 on wrong_state)
 *   - Creates one po_pickup_events row with `ack_role='logistics'`, stamps
 *     pickup_event_id on each thread, advances PO sup_status to `delivered`
 *     (all threads received) or `partially_shipped` (some threads still pending)
 *
 * Body shape: logisticsReceiveThreadsInput zod schema (camelCase, strict mode):
 *   { threadIds[], doNumber, doFilePath, doNote?, signed: true }
 *
 * The `signed` literal-true checkbox is required by the per-thread receive UI
 * (HQ-side "I have received and signed the DO" gate). doFilePath is the
 * canonical Storage path returned by `/api/storage/dos/sign-upload`. `poId`
 * comes from the URL path (not the body) — mirrors the existing
 * `/api/logistics/pos/:id/*` action route shape.
 */
const logisticsReceiveThreadsRouter = new Hono<AppEnv>();

logisticsReceiveThreadsRouter.post("/:poId/receive-threads", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics role required" });
  }
  const poId = c.req.param("poId");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = logisticsReceiveThreadsInput.safeParse(raw);
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
  const { data, error } = await sb.rpc("logistics_receive_threads", {
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

export default logisticsReceiveThreadsRouter;
