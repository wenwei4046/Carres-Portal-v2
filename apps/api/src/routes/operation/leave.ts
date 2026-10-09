import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  LEAVE_PROOF_BUCKET,
  LEAVE_PROOF_EXT,
  LEAVE_PROOF_PATH,
  myLeaveResponseSchema,
  staffLeaveProofSignInput,
  staffLeaveSubmitInput,
  teamLeaveResponseSchema,
} from "@carres/shared/workspace-leave";
import { requireOperation } from "../../lib/auth-guards";
import { klDateOf } from "../../lib/receiving-time";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/leave — Workspace → Leave (migration 0670; owner rules
 * 9 Oct 2026, `Carres Settings List.md` WS-11, docs/workspace/MASTER.md §4.4).
 *
 *   GET  /               my leave (newest first), the three type policies and
 *                        whether I may submit
 *   POST /proof/sign     a one-time upload slot for MC proof in MY folder
 *   POST /               submit my own leave (no approval; today's leave
 *                        starts cover at once — the SQL door decides)
 *   POST /:id/cancel     cancel before it starts, or the days after today
 *   GET  /proof/url      a short-lived read link (the bucket policy decides)
 *   GET  /team           who is away today and the next days — names and
 *                        dates only (Staff & Duties)
 *
 * Every rule lives in the SQL doors and the bucket policies; the user's own
 * token reaches them, so this router never widens anyone's access. Refusals
 * travel as their code only — the database's sentence never reaches a screen.
 */
const router = new Hono<AppEnv>();

/** Any internal person may record their own leave (the door re-checks the
 *  person marker and status). */
const STAFF = new Set(["operation", "principal", "finance", "bd", "hr"]);
const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!STAFF.has(c.var.auth?.role ?? "")) throw new HTTPException(403, { message: "Staff only" });
  await next();
};

const REFUSALS = new Set([
  "not_staff",
  "invalid_type",
  "invalid_dates",
  "reason_required",
  "text_too_long",
  "proof_required",
  "invalid_proof",
  "leave_overlap",
  "not_your_leave",
  "already_cancelled",
  "leave_finished",
]);

function refusal(error: { code?: string; message?: string; details?: string }) {
  const { status } = mapPgError(error);
  const code = REFUSALS.has(error.details ?? "") ? error.details! : status === 403 ? "forbidden" : "unknown";
  return { status, body: { error: code, code, message: code } };
}

const UUID = z.string().uuid();
/** Missing table / function / schema-cache entry: the migration is not applied yet. */
const NOT_INSTALLED = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

router.get("/", requireStaff, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [mayRes, policies, rows] = await Promise.all([
    sb.rpc("staff_leave_may_submit"),
    sb.from("workspace_leave_policies")
      .select("leave_type, approval_required, proof_required, reason_required")
      .order("leave_type"),
    sb.from("staff_leave")
      .select("id, leave_type, starts_on, ends_on, reason, note, proof_paths, approval_required, submitted_at, cancelled_from, cancelled_at")
      .eq("user_id", c.var.auth.id)
      .order("starts_on", { ascending: false })
      .limit(200),
  ]);
  const failed = mayRes.error ?? policies.error ?? rows.error;
  if (failed) {
    /* Before 0670 is applied the leave storage does not exist: say so plainly
     * (503 not_installed) instead of a 500 the page keeps retrying. */
    if (NOT_INSTALLED.has(failed.code ?? "")) {
      return c.json({ error: "not_installed", code: "not_installed", message: "Leave is not switched on yet." }, 503);
    }
    const m = mapPgError(failed);
    return c.json(m.body, m.status);
  }
  return c.json(myLeaveResponseSchema.parse({
    today: klDateOf(new Date().toISOString()),
    canSubmit: mayRes.data === true,
    policies: policies.data ?? [],
    leave: rows.data ?? [],
  }));
});

router.post("/proof/sign", requireStaff, async (c) => {
  const body = await parseJsonBody(c, staffLeaveProofSignInput);
  if (!body.ok) return c.json(body.body, body.status);
  // The SERVER builds the key inside the caller's own folder; the bucket's
  // insert policy (own folder, may submit leave) decides with the user token.
  const path = `${c.var.auth.id}/${crypto.randomUUID()}.${LEAVE_PROOF_EXT[body.data.mimeType]}`;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.storage.from(LEAVE_PROOF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return c.json({ error: "storage_failed", code: "storage_failed", message: "storage_failed" }, 500);
  }
  return c.json({ bucket: LEAVE_PROOF_BUCKET, token: data.token, path: data.path });
});

router.get("/proof/url", requireStaff, async (c) => {
  const path = c.req.query("path") ?? "";
  if (!LEAVE_PROOF_PATH.test(path)) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "invalid_param" }, 422);
  }
  // Signed with the USER's token: own folder, or principal / HR.
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.storage.from(LEAVE_PROOF_BUCKET).createSignedUrl(path, 300);
  if (error || !data) return c.json({ error: "not_found", code: "file_missing", message: "file_missing" }, 404);
  return c.json({ url: data.signedUrl });
});

router.get("/team", requireOperation, async (c) => {
  const days = Number(c.req.query("days") ?? "7");
  if (!Number.isInteger(days) || days < 0 || days > 62) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "invalid_param" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_leave_upcoming", { p_days: days });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const rows = (data ?? []) as Array<{ user_id: string; name: string; starts_on: string; ends_on: string }>;
  return c.json(teamLeaveResponseSchema.parse({
    today: klDateOf(new Date().toISOString()),
    people: rows.map((r) => ({ userId: r.user_id, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on })),
  }));
});

router.post("/", requireStaff, async (c) => {
  const body = await parseJsonBody(c, staffLeaveSubmitInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("staff_leave_submit", {
    p_type: body.data.type,
    p_starts_on: body.data.startsOn,
    p_ends_on: body.data.endsOn,
    p_reason: body.data.reason ?? null,
    p_note: body.data.note ?? null,
    p_proof_paths: body.data.proofPaths ?? [],
  });
  if (error) {
    const r = refusal(error);
    return c.json(r.body, r.status);
  }
  return c.json(data, 201);
});

router.post("/:id/cancel", requireStaff, async (c) => {
  const id = c.req.param("id");
  if (!UUID.safeParse(id).success) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "invalid_param" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("staff_leave_cancel", { p_leave_id: id });
  if (error) {
    const r = refusal(error);
    return c.json(r.body, r.status);
  }
  return c.json(data);
});

export default router;
