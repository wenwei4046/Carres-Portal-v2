import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { decideApprovalInput, listApprovalsQuery } from "@carres/shared";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/approvals — Principal approvals inbox.
 *
 * GET / — list with status (default 'pending') + kind filters. Discount
 *   approvals are always excluded in Phase 3 (Loo: not in business model).
 *   RLS on `approvals` already restricts non-principals; we belt-and-brace
 *   with a same-role check for fast 403s.
 *
 * POST /:id/decide — approve or reject. Calls `approval_decide` RPC (0003 +
 *   0014 extension) which is SECURITY DEFINER + manual is_principal() and
 *   ripples to the underlying domain (refunds.status / dealers.status).
 *
 * Error contract mirrors Phase 2C: SQLSTATE → HTTP status with a stable
 * `code` in the body the frontend can branch on.
 */
const approvalsRouter = new Hono<AppEnv>();

approvalsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }

  const parsed = listApprovalsQuery.safeParse({
    status: c.req.query("status") ?? undefined,
    kind: c.req.query("kind") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_query",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid query",
      },
      422,
    );
  }
  const { status, kind } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  let q = sb.from("approvals").select("*").order("created_at", { ascending: false });
  if (status !== "all") q = q.eq("status", status);
  if (kind) q = q.eq("kind", kind);
  // Phase 3 MVP scope: discount approvals are not in the business model.
  q = q.neq("kind", "discount");

  const { data, error } = await q;
  if (error) {
    return c.json({ error: "query_failed", message: error.message }, 500);
  }
  return c.json({ approvals: data ?? [] });
});

approvalsRouter.post("/:id/decide", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }

  const id = c.req.param("id");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = decideApprovalInput.safeParse(raw);
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

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("approval_decide", {
    p_id: id,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });

  if (error) {
    // SQLSTATE → HTTP mapping mirrors Phase 2C order RPC routes.
    const sqlstate = error.code;
    if (sqlstate === "42501") {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if (sqlstate === "42P01") {
      throw new HTTPException(404, { message: "Approval not found" });
    }
    if (sqlstate === "22023" || sqlstate === "P0001") {
      return c.json(
        {
          error: "decide_blocked",
          code: error.details ?? "invalid_param",
          message: error.message,
        },
        422,
      );
    }
    return c.json({ error: "rpc_failed", message: error.message }, 500);
  }

  return c.json({ approval: data });
});

export default approvalsRouter;
