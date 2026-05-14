import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { partnerPickupBatchInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — Partner per-thread batch pickup router.
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md (Task 4).
 *
 * Mounted at `/api/partner/pickups` (alongside the existing pickups router so
 * the `/batch` suffix lives under the same namespace). One DO paper = one
 * physical trip = one pickup_event covering N supplier-ready threads on a
 * single factory_pickup PO.
 *
 * Wraps `partner_pickup_threads(p_po_id, p_thread_ids, p_do_number,
 * p_do_file_path, p_do_note)` from migration 0107. The RPC:
 *   - Verifies caller is the assigned procurement_partner_id on the PO
 *     (42501 → 403 on cross-tenant)
 *   - Verifies every thread is in supplier_ready state with no prior
 *     pickup_event_id (22023 → 422 on wrong_state)
 *   - Creates one po_pickup_events row, stamps pickup_event_id on each thread,
 *     and advances PO sup_status to `picked_up` (all threads picked) or
 *     `partially_shipped` (some threads still pending)
 *
 * Body shape: partnerPickupBatchInput zod schema (camelCase, strict mode):
 *   { poId, threadIds[], doNumber, doFilePath, doNote?, signed: true }
 *
 * The `signed` literal-true checkbox is required by the per-thread pickup UI
 * (partner-side "I have collected and signed the DO" gate). doFilePath is the
 * canonical Storage path returned by `/api/storage/dos/sign-upload`.
 */
const partnerPickupsBatchRouter = new Hono<AppEnv>();

partnerPickupsBatchRouter.post("/batch", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role required" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = partnerPickupBatchInput.safeParse(raw);
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
  const { data, error } = await sb.rpc("partner_pickup_threads", {
    p_po_id:        parsed.data.poId,
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

export default partnerPickupsBatchRouter;
