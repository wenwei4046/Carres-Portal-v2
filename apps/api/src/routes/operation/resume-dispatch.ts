import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { resumeDispatchInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/operation/resume-dispatch — Phase 4.5 Chunk 2 Sprint B (Task 7).
 *
 * Resumes dispatch on a single supplier thread that was parked in
 * `operation_stage = 'waiting'` after a partner-rejection or warehouse
 * relocation. Pivoted from Chunk 1's order-scoped flow — the resume entry
 * point now operates per-thread so multi-thread orders (e.g. mattress + sofa
 * in one order) can resume independently.
 *
 * Wraps RPC `operation_resume_dispatch_from_waiting(p_thread_id uuid)`
 * (migration 0051) which:
 *   - State guard: thread.operation_stage must be 'waiting'.
 *   - Effect: thread → 'ready_to_dispatch'. If all sibling threads on the
 *     same PO are no longer in 'waiting' AND the PO is still
 *     'at_warehouse_waiting', flips PO sup_status to 'delivered' (preserves
 *     Chunk-1 single-thread Sofa behaviour).
 *
 * Body shape changed from `{}` (with :dl = order display number path param)
 * to `{ threadId }`. Path param dropped — the thread uuid is now in the body.
 *
 * Mounted as a sibling sub-router under `/operation/orders`; the inline
 * allowlist below admits operation + principal (partners cannot resume a
 * thread). Carry-forward `phase-4.5-chunk-2-route-mount-middleware-leak`
 * (closed) made this allowlist effective by switching `operationOrdersRouter`
 * from a blanket `use("*", ...)` to per-route `requireOperation` guards
 * (see `lib/auth-guards.ts`).
 */
const resumeDispatchRouter = new Hono<AppEnv>();

resumeDispatchRouter.post("/resume-dispatch", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "operation or principal only" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = resumeDispatchInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("operation_resume_dispatch_from_waiting", {
    p_thread_id: parsed.data.threadId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default resumeDispatchRouter;
