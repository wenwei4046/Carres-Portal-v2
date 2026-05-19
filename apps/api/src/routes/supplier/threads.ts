import { Hono } from "hono";
import { requireSupplier } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — Supplier · Per-Thread Readiness router.
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md (Task 3).
 *
 * Mounted at `/api/supplier/threads`. Per-route `requireSupplier` guard keeps
 * the role gate at this router only — no blanket `use("*", ...)` (per
 * Phase 4.5 Chunk 2 carry-forward `route-mount-middleware-leak` fix
 * `cdc50fc`). RLS plus the cross-supplier guard inside each RPC provide
 * the second-layer scope check (thread.supplier_id = app_supplier_id()).
 *
 * Routes:
 *   POST   /:threadId/ready   supplier_mark_thread_ready
 *   DELETE /:threadId/ready   supplier_unmark_thread_ready
 */
const supplierThreadsRouter = new Hono<AppEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

supplierThreadsRouter.post("/:threadId/ready", requireSupplier, async (c) => {
  const threadId = c.req.param("threadId");
  if (!UUID_RE.test(threadId)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "threadId must be uuid" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_mark_thread_ready", {
    p_thread_id: threadId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierThreadsRouter.delete("/:threadId/ready", requireSupplier, async (c) => {
  const threadId = c.req.param("threadId");
  if (!UUID_RE.test(threadId)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "threadId must be uuid" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_unmark_thread_ready", {
    p_thread_id: threadId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default supplierThreadsRouter;
