import type { Context } from "hono";
import type { ZodTypeAny, infer as ZodInfer } from "zod";

/**
 * Postgres SQLSTATE → HTTP status + error body. Spec §17.5 CQ2 contract:
 *   42501 → 403 forbidden
 *   42P01 → 404 not_found
 *   22023 → 422 invalid_param
 *   P0001 → 422 with detail code
 *   40001 → 409 conflict (serialization_failure — concurrent_claim guard)
 *   else  → 500 rpc_failed
 *
 * 40001 is raised by v3 RPCs that take a SELECT ... FOR UPDATE lock and find
 * the protected invariant already broken (e.g. _v3_claim_threads_for_po in
 * migration 0037 — two logistics users issued POs for the same threads).
 * Surfaces as 409 Conflict so the FE can show "Refresh and try again"
 * distinctly from generic 422 validation failures.
 *
 * TODO (Pipeline v2 follow-up): v2 detail-passthrough is currently scoped to
 * `mapPipelineV2Error` in routes/logistics/orders.ts (it forwards the RPC's
 * `detail` as `code` for 22023 too, plus a `hint` field). Hoist that 22023
 * detail handling here when other routes need it (attach_do, warehouse routes
 * flagged in C3.1 review). Out of scope for C3.1 — wider blast radius.
 */
export function mapPgError(error: { code?: string; message?: string; details?: string }) {
  switch (error.code) {
    case "42501":
      return { status: 403 as const, body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" } };
    case "42P01":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    case "22023":
      return { status: 422 as const, body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" } };
    case "P0001":
      return { status: 422 as const, body: { error: "rule_violation", code: error.details ?? "invalid_param", message: error.message ?? "rule violation" } };
    case "40001":
      return { status: 409 as const, body: { error: "conflict", code: error.details ?? "concurrent_claim", message: error.message ?? "conflict" } };
    default:
      return { status: 500 as const, body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" } };
  }
}

/**
 * Parse + zod-validate a JSON body. Returns the discriminated union so
 * the route can early-return on err without nested if-blocks.
 */
export async function parseJsonBody<S extends ZodTypeAny>(c: Context, schema: S):
  Promise<{ ok: true; data: ZodInfer<S> } | { ok: false; status: 422; body: { error: string; code: string; message: string } }> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      body: { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
    };
  }
  return { ok: true, data: parsed.data };
}
