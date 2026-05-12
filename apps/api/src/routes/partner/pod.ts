import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 7 Sprint 1 — Partner POD upload + mark-delivered.
 *
 * Mounted at `/api/partner/pod`. Mirrors the DO upload flow (storage/dos.ts)
 * but for proof-of-delivery (POD): partner uploads a delivery photo, then
 * calls partner_attach_pod RPC to advance thread → 'delivered'.
 *
 * Routes:
 *   POST /sign-upload         — returns short-lived signed upload URL
 *                                for the proof-of-delivery bucket. Storage
 *                                RLS (migration 0069) enforces partner role
 *                                + thread.delivery_partner_id ownership.
 *   POST /:threadId/attach    — calls partner_attach_pod RPC (migration 0070)
 *                                which sets pod_url + transitions thread
 *                                logistics_stage='delivered'.
 *
 * Path generation for sign-upload:
 *   {thread_id}/{uuid}-pod.{ext}
 *
 * Why USER JWT signing (not service_role): same Codex F11 rationale as
 * storage/dos.ts — RLS is the security boundary; service_role would bypass
 * the per-thread scoping.
 */
const partnerPodRouter = new Hono<AppEnv>();

const ALLOWED_MIMES = ["image/jpeg", "image/png", "application/pdf"] as const;
const MAX_SIZE = 10 * 1024 * 1024; // 10 MiB

const signUploadSchema = z.object({
  threadId:  z.string().uuid(),
  mimeType:  z.enum(ALLOWED_MIMES),
  sizeBytes: z.number().int().positive().max(MAX_SIZE),
});

const attachSchema = z.object({
  podPath:  z.string().min(1).max(500),
  doNumber: z.string().min(3).max(50),
  doNote:   z.string().max(500).optional(),
  signed:   z.literal(true),
}).strict();

function extForMime(mime: (typeof ALLOWED_MIMES)[number]): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

partnerPodRouter.post("/sign-upload", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role required" });
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = signUploadSchema.safeParse(raw);
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

  const { threadId, mimeType } = parsed.data;
  const ext = extForMime(mimeType);
  const path = `${threadId}/${crypto.randomUUID()}-pod.${ext}`;

  // 2026-05-13 (Loo) — Storage backend's RLS path 503s with "schema invalid
  // or incompatible" for the sofa direct-ship customer-leg flow even after
  // 0100 RLS extension (suspected nested-EXISTS plan cache issue inside
  // Storage's internal queries). Switch to admin client + explicit
  // ownership check — same pattern as partner-side print-do-data. The
  // WHERE delivery_partner_id = auth.partnerId is the explicit gate; admin
  // bypasses Storage RLS but the SQL filter still scopes per partner.
  const ownerSb = adminClient(c.env);
  const { data: ownThread, error: tErr } = await ownerSb
    .from("order_supplier_threads")
    .select("id")
    .eq("id", threadId)
    .eq("delivery_partner_id", auth.partnerId)
    .maybeSingle();
  if (tErr) throw new HTTPException(500, { message: tErr.message });
  if (!ownThread) {
    return c.json(
      { error: "not_found", code: "not_found", message: "Thread not found or not assigned to you" },
      404,
    );
  }

  const { data, error } = await ownerSb.storage
    .from("proof-of-delivery")
    .createSignedUploadUrl(path);
  if (error) {
    console.error("createSignedUploadUrl failed (admin path)", {
      path,
      partnerId: auth.partnerId,
      err: {
        message: (error as { message?: string }).message,
        name: (error as { name?: string }).name,
        statusCode: (error as { statusCode?: string }).statusCode,
      },
    });
    throw new HTTPException(500, { message: error.message });
  }

  return c.json({ token: data.token, path: data.path });
});

partnerPodRouter.post("/:threadId/attach", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role required" });
  }
  const threadId = c.req.param("threadId");
  if (!threadId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "threadId must be a uuid" },
      422,
    );
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = attachSchema.safeParse(raw);
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
  const { data, error } = await sb.rpc("partner_attach_pod", {
    p_thread_id: threadId,
    p_pod_path:  parsed.data.podPath,
    p_do_number: parsed.data.doNumber,
    p_do_note:   parsed.data.doNote ?? null,
    p_signed:    parsed.data.signed,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default partnerPodRouter;
